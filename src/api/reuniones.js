// Reuniones y eventos del club en un solo calendario: confirmaciones de los socios, asistencia, minuta y compromisos.
//   CRUD /api/reuniones/reuniones                  (crear/editar: junta)  ?desde=&hasta= filtra por fechas
//   GET  /api/reuniones/reuniones/:id/asistencia   socios activos con su respuesta y asistencia
//   PUT  /api/reuniones/reuniones/:id/asistencia   { marcas: [{ socio_id, presente: true|false|null }] }  (junta)
//   POST /api/reuniones/reuniones/:id/responder    { respuesta: 'si'|'no' }  el socio de la sesión confirma
//   GET  /api/reuniones/resumen
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, today } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { socioDeSesionOError } from '../lib/rotaract.js';

const MOD = 'reuniones';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TIPOS = ['reunion', 'evento'];

function horas(row) {
  for (const k of ['hora_ini', 'hora_fin']) if (row[k] && !HORA.test(row[k])) throw new HttpError(400, 'Hora no válida (HH:MM)');
  if (row.hora_ini && row.hora_fin && row.hora_fin <= row.hora_ini) throw new HttpError(400, 'La hora de fin debe ser después de la de inicio');
}

export const ENTITIES = {
  reuniones: { table: 'ro_reuniones', label: 'la reunión', title: 'titulo', search: ['titulo', 'lugar', 'minuta'], crear: 'manager', order: 'fecha DESC, hora_ini',
    fields: { tipo: TIPOS, titulo: 'text!', fecha: 'date!', hora_ini: 'text', hora_fin: 'text', lugar: 'text', modalidad: ['presencial', 'virtual', 'mixta'], enlace: 'url',
      descripcion: 'long', minuta: 'doc', compromisos: 'long', estado: ['programada', 'confirmada', 'realizada', 'cancelada'], proyecto_id: 'int' },
    refs: { proyecto_id: 'ro_proyectos' },
    beforeCreate: (c, row) => horas(row), beforeUpdate: (c, row) => horas(row),
    async beforeDelete(c, before) { await c.env.DB.prepare('DELETE FROM ro_asistencia WHERE business_id = ? AND reunion_id = ?').bind(c.businessId, before.id).run(); },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const ids = rows.map((x) => x.id);
      const cnt = await all(c.env, `SELECT reunion_id, SUM(respuesta = 'si') si, SUM(respuesta = 'no') no, SUM(presente = 1) presentes FROM ro_asistencia WHERE business_id = ? AND reunion_id IN (${ids.map(() => '?').join(',')}) GROUP BY reunion_id`, c.businessId, ...ids);
      return rows.map((r) => { const k = cnt.find((x) => x.reunion_id === r.id) || {}; return { ...r, confirmados: k.si || 0, declinaron: k.no || 0, presentes: k.presentes || 0 }; });
    } },
};

export function routes(r) {
  const api = crud(r, { base: '/api/reuniones', modulo: MOD, entities: ENTITIES });
  // Calendario: por rango de fechas (el listado general admite ?desde=&hasta=)
  r.get('/api/reuniones/calendario', `tenant:${MOD}`, async (c) => {
    const q = c.url.searchParams, d = q.get('desde') || `${today().slice(0, 7)}-01`, h = q.get('hasta') || '9999-12-31';
    const rows = await all(c.env, 'SELECT * FROM ro_reuniones WHERE business_id = ? AND fecha BETWEEN ? AND ? ORDER BY fecha, hora_ini', c.businessId, d, h);
    const yo = await one(c.env, 'SELECT id FROM ro_socios WHERE business_id = ? AND user_id = ?', c.businessId, c.session.user_id);
    const mias = yo && rows.length ? await all(c.env, `SELECT reunion_id, respuesta, presente FROM ro_asistencia WHERE business_id = ? AND socio_id = ?`, c.businessId, yo.id) : [];
    const dec = await ENTITIES.reuniones.decorate(c, rows);
    return json({ hoy: today(), rows: dec.map((x) => ({ ...x, mi_respuesta: mias.find((m) => m.reunion_id === x.id)?.respuesta || null })) });
  });

  r.get('/api/reuniones/reuniones/:id/asistencia', `tenant:${MOD}`, async (c) => {
    const reu = await api.get(c, 'reuniones', Number(c.params.id));
    const rows = await all(c.env, `SELECT s.id socio_id, s.nombre, s.cargo, a.respuesta, a.presente FROM ro_socios s
      LEFT JOIN ro_asistencia a ON a.socio_id = s.id AND a.business_id = s.business_id AND a.reunion_id = ?
      WHERE s.business_id = ? AND (s.estado = 'activo' OR a.id IS NOT NULL) ORDER BY s.nombre`, reu.id, c.businessId);
    return json({ reunion: reu, rows });
  });

  r.put('/api/reuniones/reuniones/:id/asistencia', `manager:${MOD}`, async (c) => {
    const reu = await api.get(c, 'reuniones', Number(c.params.id));
    const { marcas } = await readJson(c.req);
    if (!Array.isArray(marcas) || marcas.length > 500) throw new HttpError(400, 'Marcas no válidas');
    const socios = new Set((await all(c.env, 'SELECT id FROM ro_socios WHERE business_id = ?', c.businessId)).map((x) => x.id));
    const t = Date.now(), stmts = [];
    for (const m of marcas) {
      const sid = Number(m.socio_id);
      if (!socios.has(sid)) throw new HttpError(400, 'Socio no válido');
      const p = m.presente === null || m.presente === undefined ? null : m.presente ? 1 : 0;
      stmts.push(c.env.DB.prepare(`INSERT INTO ro_asistencia (business_id, reunion_id, socio_id, presente, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(business_id, reunion_id, socio_id) DO UPDATE SET presente = excluded.presente, updated_at = excluded.updated_at`).bind(c.businessId, reu.id, sid, p, t, t));
    }
    if (stmts.length) await c.env.DB.batch(stmts);
    if (reu.estado !== 'realizada' && reu.estado !== 'cancelada' && reu.fecha <= today()) await c.env.DB.prepare("UPDATE ro_reuniones SET estado = 'realizada', updated_at = ? WHERE id = ? AND business_id = ?").bind(t, reu.id, c.businessId).run();
    await audit(c, `Tomó asistencia de «${reu.titulo}»`, { modulo: MOD });
    return json({ ok: true, marcadas: stmts.length });
  });

  r.post('/api/reuniones/reuniones/:id/responder', `tenant:${MOD}`, async (c) => {
    const reu = await api.get(c, 'reuniones', Number(c.params.id));
    const yo = await socioDeSesionOError(c);
    const { respuesta } = await readJson(c.req);
    if (!['si', 'no'].includes(respuesta)) throw new HttpError(400, 'Responde si o no');
    if (reu.estado === 'cancelada') throw new HttpError(409, 'La reunión está cancelada');
    const t = Date.now();
    await c.env.DB.prepare(`INSERT INTO ro_asistencia (business_id, reunion_id, socio_id, respuesta, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(business_id, reunion_id, socio_id) DO UPDATE SET respuesta = excluded.respuesta, updated_at = excluded.updated_at`).bind(c.businessId, reu.id, yo.id, respuesta, t, t).run();
    return json({ ok: true });
  });

  r.get('/api/reuniones/resumen', `tenant:${MOD}`, async (c) => {
    const hoy = today();
    const prox = await all(c.env, "SELECT id, tipo, titulo, fecha, hora_ini, lugar FROM ro_reuniones WHERE business_id = ? AND fecha >= ? AND estado <> 'cancelada' ORDER BY fecha, hora_ini LIMIT 5", c.businessId, hoy);
    const asis = await one(c.env, `SELECT COUNT(*) t, SUM(a.presente = 1) p FROM ro_asistencia a JOIN ro_reuniones r ON r.id = a.reunion_id AND r.business_id = a.business_id
      WHERE a.business_id = ? AND a.presente IS NOT NULL AND r.fecha >= date(?, '-90 day')`, c.businessId, hoy);
    return json({ proximas: prox, valor: prox.length, asistencia_90d: asis.t ? Math.round((asis.p / asis.t) * 100) : null });
  });
}
