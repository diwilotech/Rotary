// Finanzas del club: solo dos cajas. Caja menor (Club) para el funcionamiento y las cuotas; Caja mayor (Obras) para los proyectos.
// Cada caja tiene su propio flujo de categorías. Los ingresos de cuotas entran solos a la caja menor (api/cuotas.js).
//   CRUD /api/cajas/movimientos           ?f_caja=menor|mayor   (junta)
//   POST /api/cajas/traslado              { desde, hacia, monto, fecha, concepto }  egreso en una caja + ingreso en la otra
//   POST /api/cajas/movimientos/:id/comprobante   (cuerpo = foto o PDF)   ·   GET …/comprobante
//   GET  /api/cajas/resumen?anio=2026     saldos, mes, los 12 meses del año rotario y gasto por categoría de cada caja
//   GET  /api/cajas/proyectado?anio=2026  Caja menor: real + proyectado por mes (cuotas de socios, otros ingresos, obligaciones)
//   POST /api/cajas/distrital/:id/pagar   paga una cuota distrital (egreso de la Caja menor)
//   PUT  /api/cajas/rubros {categoria, anio, valor} · POST /api/cajas/rubros/pagar {categoria, monto, fecha, concepto}   obligaciones = rubros de gasto
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, today, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { recalcularAporte } from './impacto.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from '../lib/archivos.js';
import { CAJAS, CATEGORIAS, saldos, anioRotarioDe, mesesDelAnio, proyeccion, distritoDe, RUBROS, RUBRO_DISTRITO, finDeAnio, obligacionesClub } from '../lib/rotaract.js';

const MOD = 'cajas';

export const ENTITIES = {
  movimientos: { table: 'ro_movimientos', label: 'el movimiento', title: 'concepto', search: ['concepto', 'categoria', 'observaciones'], crear: 'manager', leer: 'manager', order: 'fecha DESC, id DESC',
    fields: { caja: ['menor', 'mayor'], tipo: ['ingreso', 'egreso'], fecha: 'date!', concepto: 'text!', categoria: 'text', monto: 'money', proyecto_id: 'int', socio_id: 'int', observaciones: 'long' },
    refs: { proyecto_id: 'ro_proyectos', socio_id: 'ro_socios' },
    prepareBody: (b) => ({ caja: 'menor', tipo: 'egreso', ...b }),
    beforeCreate(c, row) { if (!(row.monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero'); row.registrado_por = c.session.user_id; },
    beforeUpdate(c, row, before) {
      if (before.pago_id) throw new HttpError(409, 'Este ingreso viene de una cuota: edítalo con el botón de la cuota (o desde Cuotas)');
      if (before.traslado && ('monto' in row || 'caja' in row || 'tipo' in row)) throw new HttpError(409, 'Es parte de un traslado: bórralo y hazlo de nuevo');
      if ('monto' in row && !(row.monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
    },
    async beforeDelete(c, before) {
      if (before.pago_id) throw new HttpError(409, 'Este ingreso viene de una cuota: anúlalo desde Cuotas');
      if (before.traslado) await c.env.DB.prepare('DELETE FROM ro_movimientos WHERE business_id = ? AND traslado = ? AND id <> ?').bind(c.businessId, before.traslado, before.id).run();
      await borrarArchivo(c.env, before.comprobante_key);
    },
    // Gastos de un proyecto registrados como soporte de un aporte del club (Impacto): lo ejecutado sigue a Finanzas
    async afterUpdate(c, id) {
      const s = await one(c.env, 'SELECT aporte_id FROM ro_aporte_soportes WHERE business_id = ? AND movimiento_id = ?', c.businessId, id);
      if (s) await recalcularAporte(c.env, c.businessId, s.aporte_id);
    },
    async afterDelete(c, before) {
      const ss = await all(c.env, 'SELECT id, aporte_id FROM ro_aporte_soportes WHERE business_id = ? AND movimiento_id = ?', c.businessId, before.id);
      for (const s of ss) {
        await c.env.DB.prepare('DELETE FROM ro_aporte_soportes WHERE id = ? AND business_id = ?').bind(s.id, c.businessId).run();
        await recalcularAporte(c.env, c.businessId, s.aporte_id);
      }
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const [ps, ss, pg] = await Promise.all([all(c.env, 'SELECT id, nombre FROM ro_proyectos WHERE business_id = ?', c.businessId), all(c.env, 'SELECT id, nombre FROM ro_socios WHERE business_id = ?', c.businessId),
        rows.some((m) => m.pago_id) ? all(c.env, 'SELECT id, metodo, estado, comprobante_key, comprobante_url, observaciones FROM ro_pagos WHERE business_id = ?', c.businessId) : []]);
      const cuota = (m) => { const p = m.pago_id && pg.find((x) => x.id === m.pago_id); return p ? { metodo: p.metodo, estado: p.estado, observaciones: p.observaciones, comprobante: !!(p.comprobante_key || p.comprobante_url) } : null; };
      return rows.map((m) => ({ ...m, proyecto: ps.find((p) => p.id === m.proyecto_id)?.nombre || null, socio: ss.find((s) => s.id === m.socio_id)?.nombre || null, comprobante: !!(m.comprobante_key || m.comprobante_url), comprobante_key: undefined, cuota: cuota(m) }));
    } },
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
    // Revisión de cada caja: total histórico de entradas y salidas, en qué se fue más plata (cuando queda en negativo) y
    // cuántos egresos no tienen comprobante (para el cierre del mes).
    const rev = await all(c.env, `SELECT caja, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) entradas, SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) salidas,
      SUM(tipo = 'egreso' AND comprobante_key IS NULL AND comprobante_url IS NULL AND traslado IS NULL) sin_comprobante, MIN(fecha) desde FROM ro_movimientos WHERE business_id = ? GROUP BY caja`, c.businessId);
    const top = await all(c.env, `SELECT m.caja, COALESCE(p.nombre, m.categoria, 'Sin categoría') rubro, SUM(m.monto) total FROM ro_movimientos m LEFT JOIN ro_proyectos p ON p.id = m.proyecto_id AND p.business_id = m.business_id
      WHERE m.business_id = ? AND m.tipo = 'egreso' GROUP BY m.caja, rubro ORDER BY total DESC`, c.businessId);
    const revision = (k) => { const r = rev.find((x) => x.caja === k) || {}; return { entradas: r.entradas || 0, salidas: r.salidas || 0, sin_comprobante: r.sin_comprobante || 0, desde: r.desde || null, salidas_por: top.filter((x) => x.caja === k).slice(0, 4).map(({ rubro, total }) => ({ rubro, total })) }; };
    const cajas = [caja('menor'), caja('mayor')].map((k) => ({ ...k, revision: revision(k.id) }));
    return json({ mes, anio, nombre_anio: `${anio}-${anio + 1}`, cajas, total: s.menor + s.mayor, valor: s.menor + s.mayor });
  });

  r.get('/api/cajas/proyectado', `manager:${MOD}`, async (c) => {
    const anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    if (anio < 2000 || anio > 2100) throw new HttpError(400, 'Año rotario no válido');
    return json(await proyeccion(c.env, c.businessId, anio));
  });

  // Obligaciones = rubros de «¿En qué se gasta?»: editar el valor del año y pagar (egreso de la Caja menor con esa categoría;
  // en «Obligaciones RI y Distrito» el pago se aplica a la cuota distrital pendiente más vieja). El comprobante se sube después
  // al movimiento creado (/api/cajas/movimientos/:id/comprobante).
  const rubro = (v) => { const x = cast('categoria', 'text', v); if (!RUBROS().includes(x)) throw new HttpError(400, 'Categoría no válida'); return x; };
  r.put('/api/cajas/rubros', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), categoria = rubro(b.categoria), anio = Number(b.anio) || anioRotarioDe(today());
    if (anio < 2000 || anio > 2100) throw new HttpError(400, 'Año rotario no válido');
    let valor = cast('valor', 'money', b.valor) || 0;
    // En el rubro del distrito el valor incluye la cuota distrital: el club solo guarda lo que agrega encima
    if (categoria === RUBRO_DISTRITO) valor = Math.max(0, valor - (await obligacionesClub(c.env, c.businessId, { anio })).reduce((t, o) => t + o.total, 0));
    const fin = finDeAnio(anio), t = Date.now();
    const ya = await one(c.env, 'SELECT id FROM ro_obligaciones WHERE business_id = ? AND categoria = ? AND vence = ?', c.businessId, categoria, fin);
    if (ya) await c.env.DB.prepare('UPDATE ro_obligaciones SET monto = ?, updated_at = ? WHERE id = ?').bind(valor, t, ya.id).run();
    else await c.env.DB.prepare('INSERT INTO ro_obligaciones (business_id, categoria, nombre, monto, vence, creado_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(c.businessId, categoria, categoria, valor, fin, c.session.user_id, t, t).run();
    await audit(c, `Puso el valor de «${categoria}» en ${valor}`, { modulo: MOD });
    return json({ ok: true });
  });
  r.post('/api/cajas/rubros/pagar', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), categoria = rubro(b.categoria);
    const monto = cast('monto', 'money', b.monto), fecha = cast('fecha', 'date', b.fecha || today()), concepto = cast('concepto', 'text', b.concepto) || categoria;
    if (!(monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
    let distrital = null;
    if (categoria === RUBRO_DISTRITO) {   // a la cuota distrital pendiente de ese mismo valor o, si no hay, a la más vieja
      const pend = (await obligacionesClub(c.env, c.businessId)).filter((o) => o.estado !== 'pagada');
      distrital = (pend.find((o) => o.saldo === monto) || pend[0])?.id || null;
    }
    const t = Date.now();
    const x = await c.env.DB.prepare(`INSERT INTO ro_movimientos (business_id, caja, tipo, fecha, concepto, categoria, monto, distrital_id, registrado_por, created_at, updated_at)
      VALUES (?, 'menor', 'egreso', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, fecha, concepto, categoria, monto, distrital, c.session.user_id, t, t).run();
    await audit(c, `Pagó ${monto} de «${categoria}»`, { modulo: MOD });
    return json({ id: x.meta.last_row_id }, 201);
  });

  // Cajita de macería: lo recaudado en cada reunión (se anota al conducirla) y si ya entró a la Caja menor
  r.get('/api/cajas/cajita', `tenant:${MOD}`, async (c) => {
    const anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    const rows = await all(c.env, `SELECT r.id, r.tipo, r.titulo, r.fecha, CAST(json_extract(r.acta, '$.recaudo') AS INTEGER) recaudo,
      (SELECT m.id FROM ro_movimientos m WHERE m.business_id = r.business_id AND m.categoria = 'Cajita de macería' AND m.observaciones = 'reunion:' || r.id LIMIT 1) movimiento_id
      FROM ro_reuniones r WHERE r.business_id = ? AND r.fecha >= ? AND r.fecha < ? AND r.acta IS NOT NULL AND json_valid(r.acta) AND COALESCE(json_extract(r.acta, '$.recaudo'), 0) > 0 ORDER BY r.fecha`,
      c.businessId, `${anio}-07-01`, `${anio + 1}-07-01`);
    const total = rows.reduce((t, x) => t + x.recaudo, 0), ingresado = rows.filter((x) => x.movimiento_id).reduce((t, x) => t + x.recaudo, 0);
    return json({ anio, nombre: `${anio}-${anio + 1}`, rows, total, ingresado, pendiente: total - ingresado, promedio: rows.length ? Math.round(total / rows.length) : 0 });
  });
  r.post('/api/cajas/cajita/:id/ingresar', `manager:${MOD}`, async (c) => {
    const x = await one(c.env, "SELECT id, titulo, fecha, CAST(json_extract(acta, '$.recaudo') AS INTEGER) recaudo FROM ro_reuniones WHERE id = ? AND business_id = ? AND json_valid(acta)", Number(c.params.id) || 0, c.businessId);
    if (!x || !(x.recaudo > 0)) throw new HttpError(404, 'Esa reunión no tiene recaudo de la cajita');
    if (await one(c.env, "SELECT 1 FROM ro_movimientos WHERE business_id = ? AND categoria = 'Cajita de macería' AND observaciones = ?", c.businessId, `reunion:${x.id}`)) throw new HttpError(409, 'Ese recaudo ya está en la Caja menor');
    const t = Date.now();
    const m = await c.env.DB.prepare(`INSERT INTO ro_movimientos (business_id, caja, tipo, fecha, concepto, categoria, monto, observaciones, registrado_por, created_at, updated_at)
      VALUES (?, 'menor', 'ingreso', ?, ?, 'Cajita de macería', ?, ?, ?, ?, ?)`).bind(c.businessId, x.fecha, `Cajita de macería · ${x.titulo}`, x.recaudo, `reunion:${x.id}`, c.session.user_id, t, t).run();
    await audit(c, `Ingresó a la Caja menor la cajita de macería de «${x.titulo}»`, { modulo: MOD });
    return json({ id: m.meta.last_row_id }, 201);
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
