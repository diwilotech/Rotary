// Finanzas del club: solo dos cajas. Caja menor (Club) para el funcionamiento y las cuotas; Caja mayor (Obras) para los proyectos.
// Cada caja tiene su propio flujo de categorías. Los ingresos de cuotas entran solos a la caja menor (api/cuotas.js).
//   CRUD /api/cajas/movimientos           ?f_caja=menor|mayor   (junta)
//   POST /api/cajas/traslado              { desde, hacia, monto, fecha, concepto }  egreso en una caja + ingreso en la otra
//   POST /api/cajas/movimientos/:id/comprobante   (cuerpo = foto o PDF)   ·   GET …/comprobante
//   GET  /api/cajas/resumen?anio=2026     saldos, mes, los 12 meses del año rotario y gasto por categoría de cada caja
//   GET  /api/cajas/proyectado?anio=2026  Caja menor: real + proyectado por mes (cuotas de socios, otros ingresos, obligaciones)
//   POST /api/cajas/distrital/:id/pagar   paga una cuota distrital (egreso de la Caja menor)
//   CRUD /api/cajas/obligaciones · POST /api/cajas/obligaciones/:id/pagar   obligaciones propias del club
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, today, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from '../lib/archivos.js';
import { CAJAS, CATEGORIAS, OBLIGACIONES, saldos, anioRotarioDe, mesesDelAnio, proyeccion, distritoDe } from '../lib/rotaract.js';

const MOD = 'cajas';

export const ENTITIES = {
  movimientos: { table: 'ro_movimientos', label: 'el movimiento', title: 'concepto', search: ['concepto', 'categoria', 'observaciones'], crear: 'manager', leer: 'manager', order: 'fecha DESC, id DESC',
    fields: { caja: ['menor', 'mayor'], tipo: ['ingreso', 'egreso'], fecha: 'date!', concepto: 'text!', categoria: 'text', monto: 'money', proyecto_id: 'int', socio_id: 'int', observaciones: 'long' },
    refs: { proyecto_id: 'ro_proyectos', socio_id: 'ro_socios' },
    prepareBody: (b) => ({ caja: 'menor', tipo: 'egreso', ...b }),
    beforeCreate(c, row) { if (!(row.monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero'); row.registrado_por = c.session.user_id; },
    beforeUpdate(c, row, before) {
      if (before.pago_id) throw new HttpError(409, 'Este ingreso viene de una cuota: anúlalo desde Cuotas');
      if (before.traslado && ('monto' in row || 'caja' in row || 'tipo' in row)) throw new HttpError(409, 'Es parte de un traslado: bórralo y hazlo de nuevo');
      if ('monto' in row && !(row.monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
    },
    async beforeDelete(c, before) {
      if (before.pago_id) throw new HttpError(409, 'Este ingreso viene de una cuota: anúlalo desde Cuotas');
      if (before.traslado) await c.env.DB.prepare('DELETE FROM ro_movimientos WHERE business_id = ? AND traslado = ? AND id <> ?').bind(c.businessId, before.traslado, before.id).run();
      await borrarArchivo(c.env, before.comprobante_key);
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const [ps, ss] = await Promise.all([all(c.env, 'SELECT id, nombre FROM ro_proyectos WHERE business_id = ?', c.businessId), all(c.env, 'SELECT id, nombre FROM ro_socios WHERE business_id = ?', c.businessId)]);
      return rows.map((m) => ({ ...m, proyecto: ps.find((p) => p.id === m.proyecto_id)?.nombre || null, socio: ss.find((s) => s.id === m.socio_id)?.nombre || null, comprobante: !!(m.comprobante_key || m.comprobante_url), comprobante_key: undefined }));
    } },
  // Obligaciones propias del club (reconocimiento y protocolo, bonos distritales, camisetas, pines…); se pagan desde la Caja menor
  obligaciones: { table: 'ro_obligaciones', label: 'la obligación', title: 'nombre', search: ['nombre', 'categoria'], crear: 'manager', leer: 'manager', order: 'vence, id',
    fields: { categoria: OBLIGACIONES, nombre: 'text!', monto: 'money', vence: 'date', notas: 'long' },
    prepareBody: (b) => ({ categoria: 'Otras obligaciones', ...b }),
    beforeCreate(c, row) { if (!(row.monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero'); row.creado_por = c.session.user_id; },
    beforeUpdate(c, row) { if ('monto' in row && !(row.monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero'); },
    async beforeDelete(c, before) { if (await one(c.env, 'SELECT 1 FROM ro_movimientos WHERE business_id = ? AND obligacion_id = ? LIMIT 1', c.businessId, before.id)) throw new HttpError(409, 'Esta obligación ya tiene pagos: borra primero el pago en Movimientos'); } },
};

export function routes(r) {
  const api = crud(r, { base: '/api/cajas', modulo: MOD, entities: ENTITIES });

  r.get('/api/cajas/categorias', `tenant:${MOD}`, async () => json({ cajas: CAJAS, categorias: CATEGORIAS }));

  r.post('/api/cajas/traslado', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const desde = cast('desde', ['menor', 'mayor'], b.desde), hacia = desde === 'menor' ? 'mayor' : 'menor';
    const monto = cast('monto', 'money', b.monto), fecha = cast('fecha', 'date', b.fecha || today()), concepto = cast('concepto', 'text', b.concepto) || `Traslado a ${CAJAS[hacia]}`;
    if (!(monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
    const t = Date.now(), id = crypto.randomUUID().slice(0, 12);
    const ins = (caja, tipo) => c.env.DB.prepare(`INSERT INTO ro_movimientos (business_id, caja, tipo, fecha, concepto, categoria, monto, traslado, registrado_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'Traslado', ?, ?, ?, ?, ?)`)
      .bind(c.businessId, caja, tipo, fecha, concepto, monto, id, c.session.user_id, t, t);
    await c.env.DB.batch([ins(desde, 'egreso'), ins(hacia, 'ingreso')]);
    await audit(c, `Trasladó $${monto.toLocaleString('es-CO')} de ${CAJAS[desde]} a ${CAJAS[hacia]}`, { modulo: MOD });
    return json({ ok: true, traslado: id }, 201);
  });

  r.post('/api/cajas/movimientos/:id/comprobante', `manager:${MOD}`, async (c) => {
    const m = await api.get(c, 'movimientos', Number(c.params.id));
    const f = await guardarArchivo(c, 'movimientos');
    await c.env.DB.prepare('UPDATE ro_movimientos SET comprobante_key = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(f.key, Date.now(), m.id, c.businessId).run();
    await borrarArchivo(c.env, m.comprobante_key);
    return json({ ok: true });
  });
  r.get('/api/cajas/movimientos/:id/comprobante', `manager:${MOD}`, async (c) => {
    const m = await api.get(c, 'movimientos', Number(c.params.id));
    if (!m.comprobante_key && m.comprobante_url && /^https:\/\//.test(m.comprobante_url)) return Response.redirect(m.comprobante_url, 302);
    const mime = /\.pdf$/.test(m.comprobante_key || '') ? 'application/pdf' : /\.png$/.test(m.comprobante_key || '') ? 'image/png' : /\.webp$/.test(m.comprobante_key || '') ? 'image/webp' : 'image/jpeg';
    return servirArchivo(c, { key: m.comprobante_key, mime, nombre: `comprobante-${m.id}` });
  });

  r.get('/api/cajas/resumen', `manager:${MOD}`, async (c) => {
    const mes = today().slice(0, 7), anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today()), meses12 = mesesDelAnio(anio);
    const rango = [`${meses12[0]}-01`, `${anio + 1}-07-01`];
    const [s, delMes, cats, meses] = await Promise.all([
      saldos(c.env, c.businessId),
      all(c.env, "SELECT caja, tipo, SUM(monto) total FROM ro_movimientos WHERE business_id = ? AND substr(fecha, 1, 7) = ? AND traslado IS NULL GROUP BY caja, tipo", c.businessId, mes),
      all(c.env, "SELECT caja, COALESCE(categoria, 'Sin categoría') categoria, SUM(monto) total FROM ro_movimientos WHERE business_id = ? AND tipo = 'egreso' AND traslado IS NULL AND fecha >= ? AND fecha < ? GROUP BY caja, categoria ORDER BY total DESC", c.businessId, ...rango),
      all(c.env, "SELECT caja, substr(fecha, 1, 7) mes, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) ingresos, SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) egresos FROM ro_movimientos WHERE business_id = ? AND fecha >= ? AND fecha < ? AND traslado IS NULL GROUP BY caja, mes", c.businessId, ...rango),
    ]);
    const caja = (k) => ({ id: k, nombre: CAJAS[k], saldo: s[k], ingresos_mes: delMes.find((x) => x.caja === k && x.tipo === 'ingreso')?.total || 0, egresos_mes: delMes.find((x) => x.caja === k && x.tipo === 'egreso')?.total || 0,
      categorias: cats.filter((x) => x.caja === k).map(({ categoria, total }) => ({ categoria, total })),
      meses: meses12.map((m) => { const x = meses.find((y) => y.caja === k && y.mes === m); return { mes: m, ingresos: x?.ingresos || 0, egresos: x?.egresos || 0 }; }) });
    return json({ mes, anio, nombre_anio: `${anio}-${anio + 1}`, cajas: [caja('menor'), caja('mayor')], total: s.menor + s.mayor, valor: s.menor + s.mayor });
  });

  r.get('/api/cajas/proyectado', `manager:${MOD}`, async (c) => {
    const anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    if (anio < 2000 || anio > 2100) throw new HttpError(400, 'Año rotario no válido');
    return json(await proyeccion(c.env, c.businessId, anio));
  });

  r.post('/api/cajas/obligaciones/:id/pagar', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const o = await one(c.env, 'SELECT id, nombre, categoria FROM ro_obligaciones WHERE id = ? AND business_id = ?', Number(c.params.id), c.businessId);
    if (!o) throw new HttpError(404, 'Obligación no encontrada');
    const monto = cast('monto', 'money', b.monto), fecha = cast('fecha', 'date', b.fecha || today());
    if (!(monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
    const t = Date.now(), cat = CATEGORIAS.menor.egreso.includes(o.categoria) ? o.categoria : 'Otros gastos';
    const r2 = await c.env.DB.prepare(`INSERT INTO ro_movimientos (business_id, caja, tipo, fecha, concepto, categoria, monto, obligacion_id, registrado_por, created_at, updated_at)
      VALUES (?, 'menor', 'egreso', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, fecha, o.nombre, cat, monto, o.id, c.session.user_id, t, t).run();
    await audit(c, `Pagó la obligación «${o.nombre}»`, { modulo: MOD });
    return json({ id: r2.meta.last_row_id }, 201);
  });

  r.post('/api/cajas/distrital/:id/pagar', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    const { codigo } = await distritoDe(c.env, c.businessId);
    const q = await one(c.env, 'SELECT id, nombre FROM ro_cuota_distrital WHERE id = ? AND distrito = ?', Number(c.params.id), codigo);
    if (!q) throw new HttpError(404, 'Cuota distrital no encontrada');
    const monto = cast('monto', 'money', b.monto), fecha = cast('fecha', 'date', b.fecha || today());
    if (!(monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
    const t = Date.now();
    const r2 = await c.env.DB.prepare(`INSERT INTO ro_movimientos (business_id, caja, tipo, fecha, concepto, categoria, monto, distrital_id, registrado_por, created_at, updated_at)
      VALUES (?, 'menor', 'egreso', ?, ?, 'Obligaciones RI y Distrito', ?, ?, ?, ?, ?)`).bind(c.businessId, fecha, `Cuota distrital: ${q.nombre}`, monto, q.id, c.session.user_id, t, t).run();
    await audit(c, `Pagó la cuota distrital «${q.nombre}»`, { modulo: MOD });
    return json({ id: r2.meta.last_row_id }, 201);
  });
}
