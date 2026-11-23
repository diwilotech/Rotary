// «Lo tuyo»: la vista del socio que tiene la sesión (base: siempre disponible). Su carnet, sus tareas, sus reuniones
// (confirmar), su asistencia, sus cuotas (reportar pago con comprobante) y su certificado de activación.
//   GET   /api/lotuyo                 todo lo del socio
//   GET   /api/lotuyo/carnet          datos del carnet   ·   PATCH /api/lotuyo/carnet { telefono, profesion, fecha_nacimiento, instagram }
//   POST  /api/lotuyo/foto            (cuerpo = imagen)
//   POST  /api/lotuyo/pagos           { monto, fecha, metodo, observaciones }  → pendiente de verificar
//   POST  /api/lotuyo/pagos/:id/comprobante  ·  GET …/comprobante
//   GET   /api/lotuyo/certificado
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, today, cast } from '../lib/crud.js';
import { activeModuleIds } from '../lib/modules.js';
import { socioDeSesion, socioDeSesionOError, cartera, cargoOrden, certificadoHtml, anioRotario, anioRotarioDe } from '../lib/rotaract.js';
import { subirFoto, subirFirma, quitarFirma } from './socios.js';
import { nuevoPago, subirComprobante, servirComprobante, pagosDe } from './cuotas.js';

const TIPO = { socio: 'Socio', socio_externo: 'Socio externo', voluntario_invitado: 'Voluntario invitado', aspirante: 'Aspirante', honorario: 'Socio honorario' };

async function carnet(c, s) {
  const biz = await one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId);
  const st = await one(c.env, 'SELECT logo_key FROM business_settings WHERE business_id = ?', c.businessId);
  return { id: s.id, nombre: s.nombre, email: s.email, telefono: s.telefono, profesion: s.profesion, instagram: s.instagram, fecha_nacimiento: s.fecha_nacimiento,
    cargo: cargoOrden(s.cargo) < 99 ? s.cargo : null, tipo: TIPO[s.tipo_membresia] || s.tipo_membresia, estado: s.estado, fecha_ingreso: s.fecha_ingreso,
    activado_at: s.activado_at, junta: cargoOrden(s.cargo) < 99, tiene_firma: !!s.firma_key, fecha_ingreso: s.fecha_ingreso, myrotary_id: s.myrotary_id, myrotary_at: s.myrotary_at, foto: s.foto_key || s.foto_url ? `/api/socios/foto/${s.id}?v=${s.updated_at || 0}` : null,
    club: biz?.name || '', logo: st?.logo_key ? '/api/settings/logo' : null };
}

async function miPago(c, id, socio) {
  const p = await one(c.env, 'SELECT * FROM ro_pagos WHERE id = ? AND business_id = ? AND socio_id = ?', Number(id) || 0, c.businessId, socio.id);
  if (!p) throw new HttpError(404, 'Pago no encontrado');
  return p;
}

export function routes(r) {
  r.get('/api/lotuyo', 'tenant', async (c) => {
    const s = await socioDeSesion(c);
    if (!s) return json({ socio: null });
    const activos = new Set(await activeModuleIds(c.env, c.businessId)), hoy = today();
    const [tareas, reuniones, asis, cuota, pagos] = await Promise.all([
      activos.has('tareas') ? all(c.env, "SELECT id, titulo, estado, fecha_limite, prioridad FROM ro_tareas WHERE business_id = ? AND socio_id = ? AND estado IN ('pendiente','en_curso') ORDER BY fecha_limite IS NULL, fecha_limite LIMIT 20", c.businessId, s.id) : null,
      activos.has('reuniones') ? all(c.env, `SELECT r.id, r.tipo, r.titulo, r.fecha, r.hora_ini, r.lugar, r.modalidad, r.enlace, a.respuesta FROM ro_reuniones r
        LEFT JOIN ro_asistencia a ON a.reunion_id = r.id AND a.business_id = r.business_id AND a.socio_id = ? WHERE r.business_id = ? AND r.fecha >= ? AND r.estado <> 'cancelada' ORDER BY r.fecha, r.hora_ini LIMIT 6`, s.id, c.businessId, hoy) : null,
      one(c.env, 'SELECT COUNT(*) t, SUM(presente = 1) p FROM ro_asistencia WHERE business_id = ? AND socio_id = ? AND presente IS NOT NULL', c.businessId, s.id),
      cartera(c, s.id).then((x) => x[0] || null),
      pagosDe(c, { socioId: s.id }),
    ]);
    // Sus cuotas del año rotario mes a mes (los cuadritos de colores) y el valor de la cuota de este mes
    const [anio, per] = cuota ? await Promise.all([anioRotario(c, anioRotarioDe(hoy), s.id), one(c.env, 'SELECT monto FROM ro_periodos WHERE business_id = ? AND mes <= ? ORDER BY mes DESC LIMIT 1', c.businessId, hoy.slice(0, 7))]) : [null, null];
    if (cuota) Object.assign(cuota, { anio: anio.nombre, meses: anio.rows[0]?.celdas || [], valor_mes: per?.monto || null });
    return json({ socio: await carnet(c, s), tareas, reuniones, asistencia: { total: asis.t || 0, presente: asis.p || 0, pct: asis.t ? Math.round((asis.p / asis.t) * 100) : null }, cuota, pagos: pagos.slice(0, 24), modulos: [...activos] });
  });

  r.get('/api/lotuyo/carnet', 'tenant', async (c) => {
    const s = await socioDeSesion(c);
    return json({ carnet: s ? await carnet(c, s) : null });
  });
  r.patch('/api/lotuyo/carnet', 'tenant', async (c) => {
    const s = await socioDeSesionOError(c), b = await readJson(c.req), set = {};
    for (const [k, t] of Object.entries({ telefono: 'text', profesion: 'text', instagram: 'text', fecha_nacimiento: 'date' })) if (k in b) set[k] = cast(k, t, b[k]);
    if (set.telefono && !/^[+\d\s()-]{7,20}$/.test(set.telefono)) throw new HttpError(400, 'Teléfono no válido');
    const cols = Object.keys(set);
    if (cols.length) await c.env.DB.prepare(`UPDATE ro_socios SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...cols.map((k) => set[k]), Date.now(), s.id, c.businessId).run();
    return json({ ok: true });
  });
  r.post('/api/lotuyo/foto', 'tenant', async (c) => json(await subirFoto(c, await socioDeSesionOError(c))));
  r.post('/api/lotuyo/firma', 'tenant', async (c) => json(await subirFirma(c, await socioDeSesionOError(c))));
  r.delete('/api/lotuyo/firma', 'tenant', async (c) => json(await quitarFirma(c, await socioDeSesionOError(c))));

  r.post('/api/lotuyo/pagos', 'tenant', async (c) => {
    const s = await socioDeSesionOError(c);
    if (!(await activeModuleIds(c.env, c.businessId)).includes('cuotas')) throw new HttpError(403, 'Las cuotas no están activas en el club');
    const p = await nuevoPago(c, await readJson(c.req), { socioId: s.id, verificado: false });
    return json({ id: p.id, estado: p.estado }, 201);
  });
  r.post('/api/lotuyo/pagos/:id/comprobante', 'tenant', async (c) => {
    const s = await socioDeSesionOError(c), p = await miPago(c, c.params.id, s);
    if (p.estado === 'verificado') throw new HttpError(409, 'Ese pago ya fue verificado');
    if (p.estado === 'rechazado') await c.env.DB.prepare("UPDATE ro_pagos SET estado = 'pendiente', motivo_rechazo = NULL WHERE id = ? AND business_id = ?").bind(p.id, c.businessId).run();
    return json(await subirComprobante(c, p));
  });
  r.get('/api/lotuyo/pagos/:id/comprobante', 'tenant', async (c) => servirComprobante(c, await miPago(c, c.params.id, await socioDeSesionOError(c))));

  r.get('/api/lotuyo/certificado', 'tenant', async (c) => {
    const s = await socioDeSesionOError(c);
    return new Response(await certificadoHtml(c, s), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });
}
