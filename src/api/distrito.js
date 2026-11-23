// Distrito (perfil aparte): un negocio marcado como distrito (ro_club_config.es_distrito, lo pone Diwilo) ve en SOLO LECTURA
// todos los clubes con su código (p. ej. 4271) y les pone la cuota distrital (valor por socio activo), que a cada club le llega
// como obligación en Finanzas → Proyectado. Es el único lugar de la app que lee datos de otros negocios, y solo de su distrito.
//   GET  /api/distrito                     ¿este negocio es distrito? + código
//   GET  /api/distrito/tablero?anio=2026   clubes con sus indicadores + los 12 meses del año rotario sumados
//   GET  /api/distrito/clubes/:id          detalle de un club (solo lectura)
//   GET/POST /api/distrito/cuotas · PATCH/DELETE /api/distrito/cuotas/:id   cuota distrital (presidencia o junta del distrito)
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, today, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { PAGA_CUOTA, EN_DISTRITO, enDistrito, distritoDe, clubesDelDistrito, anioRotarioDe, mesesDelAnio, obligacionesClub, saldos, cartera, cargoOrden } from '../lib/rotaract.js';

async function distritoOError(c) {
  const d = await distritoDe(c.env, c.businessId);
  if (!d.es_distrito) throw new HttpError(403, 'Esta sección es solo para el perfil del distrito');
  return d;
}

async function clubDelDistrito(c, id) {
  const d = await distritoOError(c);
  const club = (await clubesDelDistrito(c.env, d.codigo)).find((x) => x.id === id);
  if (!club) throw new HttpError(404, 'Club no encontrado en este distrito');
  return { d, club };
}

export function routes(r) {
  r.get('/api/distrito', 'tenant', async (c) => json(await distritoDe(c.env, c.businessId)));

  r.get('/api/distrito/tablero', 'tenant', async (c) => {
    const d = await distritoOError(c);
    const anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today()), meses = mesesDelAnio(anio), rango = [`${meses[0]}-01`, `${anio + 1}-07-01`];
    const clubes = await clubesDelDistrito(c.env, d.codigo), ids = clubes.map((x) => x.id), P = enDistrito(c.env, d.codigo);
    const [soc, asis, proy, movs, cats, reus] = ids.length ? await Promise.all([
      all(c.env, `SELECT business_id, SUM(estado = 'activo' AND (tipo_membresia IN ('socio', 'honorario') OR (cargo IS NOT NULL AND cargo <> ''))) activos, SUM(estado = 'activo' AND activado_at IS NOT NULL AND (tipo_membresia IN ('socio', 'honorario') OR (cargo IS NOT NULL AND cargo <> ''))) activados, SUM(estado = 'aspirante') aspirantes FROM ro_socios WHERE ${EN_DISTRITO} GROUP BY business_id`, ...P),
      all(c.env, `SELECT a.business_id, SUM(a.presente = 1) presentes, COUNT(*) marcas FROM ro_asistencia a JOIN ro_reuniones r ON r.id = a.reunion_id AND r.business_id = a.business_id
        WHERE a.${EN_DISTRITO} AND a.presente IS NOT NULL AND r.fecha >= date('now', '-90 day') GROUP BY a.business_id`, ...P),
      all(c.env, `SELECT business_id, COUNT(*) proyectos, SUM(estado = 'en_curso') en_curso, SUM(COALESCE(beneficiados, 0)) beneficiados, SUM(COALESCE(horas_servicio, 0)) horas FROM ro_proyectos WHERE ${EN_DISTRITO} AND estado <> 'cancelado' GROUP BY business_id`, ...P),
      all(c.env, `SELECT substr(fecha, 1, 7) mes, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) ingresos, SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) egresos,
        SUM(CASE WHEN pago_id IS NOT NULL THEN monto ELSE 0 END) cuotas, SUM(CASE WHEN distrital_id IS NOT NULL THEN monto ELSE 0 END) distrital
        FROM ro_movimientos WHERE ${EN_DISTRITO} AND traslado IS NULL AND fecha >= ? AND fecha < ? GROUP BY mes`, ...P, ...rango),
      all(c.env, `SELECT COALESCE(categoria, 'Sin categoría') categoria, SUM(monto) total FROM ro_movimientos WHERE ${EN_DISTRITO} AND tipo = 'egreso' AND traslado IS NULL AND fecha >= ? AND fecha < ? GROUP BY categoria ORDER BY total DESC LIMIT 10`, ...P, ...rango),
      all(c.env, `SELECT substr(fecha, 1, 7) mes, SUM(tipo = 'reunion') reuniones, SUM(tipo = 'evento') eventos FROM ro_reuniones WHERE ${EN_DISTRITO} AND fecha >= ? AND fecha < ? AND estado <> 'cancelada' GROUP BY mes`, ...P, ...rango),
    ]) : [[], [], [], [], [], []];
    const filas = [];
    for (const k of clubes) {
      const s = soc.find((x) => x.business_id === k.id) || {}, a = asis.find((x) => x.business_id === k.id), p = proy.find((x) => x.business_id === k.id) || {};
      const [sal, car, obl] = await Promise.all([saldos(c.env, k.id), cartera({ env: c.env, businessId: k.id }), obligacionesClub(c.env, k.id, { anio })]);
      filas.push({ id: k.id, nombre: k.name, socios: s.activos || 0, activados: s.activados || 0, aspirantes: s.aspirantes || 0,
        asistencia: a?.marcas ? Math.round((a.presentes / a.marcas) * 100) : null, proyectos: p.proyectos || 0, en_curso: p.en_curso || 0, beneficiados: p.beneficiados || 0, horas: p.horas || 0,
        caja_menor: sal.menor, caja_mayor: sal.mayor, cuotas_al_dia: car.filter((x) => x.estado !== 'debe').length, cuotas_socios: car.length,
        distrital_total: obl.reduce((t, o) => t + o.total, 0), distrital_pagado: obl.reduce((t, o) => t + Math.min(o.pagado, o.total), 0) });
    }
    const suma = (k) => filas.reduce((t, x) => t + (x[k] || 0), 0);
    return json({ codigo: d.codigo, anio, nombre_anio: `${anio}-${anio + 1}`, clubes: filas,
      totales: { clubes: filas.length, socios: suma('socios'), activados: suma('activados'), beneficiados: suma('beneficiados'), horas: suma('horas'), proyectos: suma('en_curso'),
        distrital_total: suma('distrital_total'), distrital_pagado: suma('distrital_pagado') },
      meses: meses.map((m) => { const x = movs.find((y) => y.mes === m) || {}, rr = reus.find((y) => y.mes === m) || {};
        return { mes: m, ingresos: x.ingresos || 0, egresos: x.egresos || 0, cuotas: x.cuotas || 0, distrital: x.distrital || 0, reuniones: rr.reuniones || 0, eventos: rr.eventos || 0 }; }),
      categorias: cats });
  });

  r.get('/api/distrito/clubes/:id', 'tenant', async (c) => {
    const { club } = await clubDelDistrito(c, c.params.id), id = club.id;
    const [socios, proyectos, reuniones, sal, obl] = await Promise.all([
      all(c.env, "SELECT id, nombre, cargo, estado, tipo_membresia, activado_at, fecha_ingreso, profesion FROM ro_socios WHERE business_id = ? AND estado IN ('activo', 'aspirante')", id),
      all(c.env, "SELECT id, nombre, estado, fecha_inicio, fecha_fin, beneficiados, horas_servicio, financiacion, financiador FROM ro_proyectos WHERE business_id = ? AND estado <> 'cancelado' ORDER BY fecha_inicio DESC LIMIT 30", id),
      all(c.env, "SELECT id, tipo, titulo, fecha, hora_ini, lugar, estado FROM ro_reuniones WHERE business_id = ? AND fecha >= date('now', '-60 day') ORDER BY fecha LIMIT 40", id),
      saldos(c.env, id), obligacionesClub(c.env, id),
    ]);
    socios.sort((a, b) => cargoOrden(a.cargo) - cargoOrden(b.cargo) || a.nombre.localeCompare(b.nombre));
    return json({ club: { id, nombre: club.name }, socios, proyectos, reuniones, saldos: sal, obligaciones: obl });
  });

  /* Cuota distrital */
  const campos = (b, parcial) => {
    const o = {};
    if (!parcial || 'nombre' in b) { o.nombre = cast('nombre', 'text', b.nombre); if (!o.nombre) throw new HttpError(400, 'Escribe el nombre de la cuota'); }
    if (!parcial || 'valor_socio' in b) { o.valor_socio = cast('valor_socio', 'money', b.valor_socio); if (!(o.valor_socio > 0)) throw new HttpError(400, 'El valor por socio debe ser mayor que cero'); }
    if (!parcial || 'vence' in b) { o.vence = cast('vence', 'date', b.vence); if (!o.vence) throw new HttpError(400, 'Indica la fecha en que vence'); o.anio = anioRotarioDe(o.vence); }
    if ('notas' in b) o.notas = cast('notas', 'long', b.notas);
    return o;
  };
  r.get('/api/distrito/cuotas', 'tenant', async (c) => {
    const d = await distritoOError(c);
    const cuotas = await all(c.env, 'SELECT * FROM ro_cuota_distrital WHERE distrito = ? ORDER BY vence DESC', d.codigo);
    const clubes = await clubesDelDistrito(c.env, d.codigo), ids = clubes.map((x) => x.id);
    const [pag, soc] = ids.length ? await Promise.all([
      all(c.env, `SELECT business_id, distrital_id, SUM(monto) total FROM ro_movimientos WHERE ${EN_DISTRITO} AND distrital_id IS NOT NULL AND tipo = 'egreso' GROUP BY business_id, distrital_id`, ...enDistrito(c.env, d.codigo)),
      all(c.env, `SELECT business_id, COUNT(*) n FROM ro_socios WHERE ${EN_DISTRITO} AND ${PAGA_CUOTA} GROUP BY business_id`, ...enDistrito(c.env, d.codigo)),
    ]) : [[], []];
    return json({ codigo: d.codigo, rows: cuotas.map((q) => {
      const por = clubes.map((k) => { const n = soc.find((x) => x.business_id === k.id)?.n || 0, total = n * q.valor_socio, pagado = pag.find((x) => x.business_id === k.id && x.distrital_id === q.id)?.total || 0;
        return { club_id: k.id, club: k.name, socios: n, total, pagado, estado: total > 0 && pagado >= total ? 'pagada' : q.vence < today() ? 'vencida' : 'pendiente' }; });
      return { ...q, clubes: por, total: por.reduce((t, x) => t + x.total, 0), pagado: por.reduce((t, x) => t + Math.min(x.pagado, x.total), 0), pagaron: por.filter((x) => x.estado === 'pagada').length };
    }) });
  });
  r.post('/api/distrito/cuotas', 'manager', async (c) => {
    const d = await distritoOError(c), o = campos(await readJson(c.req)), t = Date.now();
    const x = await c.env.DB.prepare('INSERT INTO ro_cuota_distrital (business_id, distrito, nombre, valor_socio, vence, anio, notas, creado_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, d.codigo, o.nombre, o.valor_socio, o.vence, o.anio, o.notas || null, c.session.user_id, t, t).run();
    await audit(c, `Creó la cuota distrital «${o.nombre}»`, { modulo: 'distrito' });
    return json({ id: x.meta.last_row_id, ...o }, 201);
  });
  r.patch('/api/distrito/cuotas/:id', 'manager', async (c) => {
    const d = await distritoOError(c), o = campos(await readJson(c.req), true);
    const q = await one(c.env, 'SELECT id FROM ro_cuota_distrital WHERE id = ? AND distrito = ? AND business_id = ?', Number(c.params.id), d.codigo, c.businessId);
    if (!q) throw new HttpError(404, 'Cuota no encontrada');
    const ks = Object.keys(o);
    if (ks.length) await c.env.DB.prepare(`UPDATE ro_cuota_distrital SET ${ks.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...ks.map((k) => o[k]), Date.now(), q.id).run();
    return json({ ok: true });
  });
  r.delete('/api/distrito/cuotas/:id', 'manager', async (c) => {
    const d = await distritoOError(c);
    const q = await one(c.env, 'SELECT id, nombre FROM ro_cuota_distrital WHERE id = ? AND distrito = ? AND business_id = ?', Number(c.params.id), d.codigo, c.businessId);
    if (!q) throw new HttpError(404, 'Cuota no encontrada');
    if (await one(c.env, 'SELECT 1 FROM ro_movimientos WHERE distrital_id = ? LIMIT 1', q.id)) throw new HttpError(409, 'Algún club ya pagó esta cuota: no se puede borrar');
    await c.env.DB.prepare('DELETE FROM ro_cuota_distrital WHERE id = ?').bind(q.id).run();
    await audit(c, `Borró la cuota distrital «${q.nombre}»`, { modulo: 'distrito' });
    return json({ ok: true });
  });
}
