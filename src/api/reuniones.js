// Reuniones y eventos del club en un solo calendario: confirmaciones de los socios, asistencia, minuta y compromisos.
//   CRUD /api/reuniones/reuniones                  (crear/editar: junta)  ?desde=&hasta= filtra por fechas
//   GET  /api/reuniones/reuniones/:id/asistencia   socios activos con su respuesta y asistencia
//   PUT  /api/reuniones/reuniones/:id/asistencia   { marcas: [{ socio_id, presente: true|false|null }] }  (junta)
//   POST /api/reuniones/reuniones/:id/responder    { respuesta: 'si'|'no' }  el socio de la sesión confirma
//   GET  /api/reuniones/resumen
//   GET  /api/reuniones/anio?anio=2026&tipo=reunion|evento   lista del año rotario (julio a junio) con asistencia, invitados y acta
//   GET  /api/reuniones/orden                       orden del día que usa el club (el del distrito o el sugerido)
//   GET/POST /api/reuniones/reuniones/:id/invitados · DELETE /api/reuniones/invitados/:id   invitados externos
//   POST /api/reuniones/reuniones/:id/enlace        enlace público para que los externos se registren (/r/<token>)
//   GET/PUT /api/reuniones/reuniones/:id/acta-datos · GET /api/reuniones/reuniones/:id/acta (HTML para imprimir)
//   POST /api/publico/r/:token                      registro de un invitado externo (público)
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, today, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { socioDeSesionOError, ordenDelDia, logoOficial, cargoOrden, anioRotarioDe } from '../lib/rotaract.js';

const MOD = 'reuniones';
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TIPOS = ['reunion', 'evento', 'obra'];   // obra = jornada de servicio (se ancla a un proyecto de Impacto)

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
    async beforeDelete(c, before) { await c.env.DB.batch([c.env.DB.prepare('DELETE FROM ro_asistencia WHERE business_id = ? AND reunion_id = ?').bind(c.businessId, before.id), c.env.DB.prepare('DELETE FROM ro_reunion_invitados WHERE business_id = ? AND reunion_id = ?').bind(c.businessId, before.id)]); },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      // Por negocio (sin lista IN de ids: D1 acepta máx. 100 parámetros)
      const [cnt, inv, prs] = await Promise.all([all(c.env, "SELECT reunion_id, SUM(respuesta = 'si') si, SUM(respuesta = 'no') no, SUM(presente = 1) presentes FROM ro_asistencia WHERE business_id = ? GROUP BY reunion_id", c.businessId),
        all(c.env, 'SELECT reunion_id, COUNT(*) n FROM ro_reunion_invitados WHERE business_id = ? GROUP BY reunion_id', c.businessId),
        rows.some((x) => x.proyecto_id) ? all(c.env, 'SELECT id, nombre FROM ro_proyectos WHERE business_id = ?', c.businessId) : []]);
      return rows.map((r) => { const k = cnt.find((x) => x.reunion_id === r.id) || {}; const { token: _t, ...x } = r;
        return { ...x, proyecto: prs.find((p) => p.id === r.proyecto_id)?.nombre || null, confirmados: k.si || 0, declinaron: k.no || 0, presentes: k.presentes || 0, invitados: inv.find((y) => y.reunion_id === r.id)?.n || 0, tiene_acta: !!r.acta, enlace_registro: !!r.token }; });
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

  const reunionOr404 = async (c, id) => { const x = await one(c.env, 'SELECT * FROM ro_reuniones WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId); if (!x) throw new HttpError(404, 'Reunión no encontrada'); return x; };
  // Listas del año rotario (julio a junio): reuniones u eventos
  r.get('/api/reuniones/anio', `tenant:${MOD}`, async (c) => {
    const anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today()), tipo = TIPOS.includes(c.url.searchParams.get('tipo')) ? c.url.searchParams.get('tipo') : 'reunion';
    const rows = await all(c.env, 'SELECT * FROM ro_reuniones WHERE business_id = ? AND tipo = ? AND fecha >= ? AND fecha < ? ORDER BY fecha, hora_ini', c.businessId, tipo, `${anio}-07-01`, `${anio + 1}-07-01`);
    return json({ anio, nombre: `${anio}-${anio + 1}`, rows: await ENTITIES.reuniones.decorate(c, rows) });
  });
  r.get('/api/reuniones/orden', `tenant:${MOD}`, async (c) => json(await ordenDelDia(c.env, c.businessId)));

  /* Invitados externos */
  r.get('/api/reuniones/reuniones/:id/invitados', `tenant:${MOD}`, async (c) => { const x = await reunionOr404(c, c.params.id); return json({ rows: await all(c.env, 'SELECT id, nombre, procedencia, tipo, via, created_at FROM ro_reunion_invitados WHERE business_id = ? AND reunion_id = ? ORDER BY created_at', c.businessId, x.id) }); });
  const nuevoInvitado = async (env, bid, reunionId, b, via) => {
    const nombre = cast('nombre', 'text', b.nombre); if (!nombre) throw new HttpError(400, 'Escribe el nombre');
    const tipo = ['rotario', 'rotaractiano', 'interactiano', 'invitado', 'orador'].includes(b.tipo) ? b.tipo : 'invitado';
    const n = await one(env, 'SELECT COUNT(*) n FROM ro_reunion_invitados WHERE business_id = ? AND reunion_id = ?', bid, reunionId);
    if (n.n >= 300) throw new HttpError(409, 'La reunión ya tiene el máximo de invitados');
    await env.DB.prepare('INSERT INTO ro_reunion_invitados (business_id, reunion_id, nombre, procedencia, tipo, correo, telefono, via, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(bid, reunionId, nombre, cast('procedencia', 'text', b.procedencia), tipo, b.correo ? cast('correo', 'email', b.correo) : null, cast('telefono', 'text', b.telefono), via, Date.now()).run();
  };
  r.post('/api/reuniones/reuniones/:id/invitados', `manager:${MOD}`, async (c) => { const x = await reunionOr404(c, c.params.id); await nuevoInvitado(c.env, c.businessId, x.id, await readJson(c.req), 'junta'); return json({ ok: true }, 201); });
  r.delete('/api/reuniones/invitados/:id', `manager:${MOD}`, async (c) => { await c.env.DB.prepare('DELETE FROM ro_reunion_invitados WHERE id = ? AND business_id = ?').bind(Number(c.params.id) || 0, c.businessId).run(); return json({ ok: true }); });
  r.post('/api/reuniones/reuniones/:id/enlace', `manager:${MOD}`, async (c) => {
    const x = await reunionOr404(c, c.params.id); let token = x.token;
    if (!token) { token = crypto.randomUUID().replace(/-/g, '').slice(0, 16); await c.env.DB.prepare('UPDATE ro_reuniones SET token = ? WHERE id = ? AND business_id = ?').bind(token, x.id, c.businessId).run(); }
    return json({ url: new URL(`/r/${token}`, c.url.origin).toString() });
  });
  // Registro público (enlace /r/<token>): abierto hasta un día después de la reunión
  r.post('/api/publico/r/:token', 'public', async (c) => {
    const x = await one(c.env, "SELECT id, business_id, fecha, estado FROM ro_reuniones WHERE token = ? AND estado <> 'cancelada'", String(c.params.token || '').slice(0, 40));
    if (!x) throw new HttpError(404, 'Este enlace no existe o la reunión fue cancelada');
    const limite = new Date(Date.parse(`${x.fecha}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
    if (today() > limite) throw new HttpError(409, 'El registro para esta reunión ya cerró');
    const b = await readJson(c.req);
    if (!b.autoriza) throw new HttpError(400, 'Debes autorizar el uso de tus datos para registrarte');
    await nuevoInvitado(c.env, x.business_id, x.id, b, 'enlace');
    return json({ ok: true }, 201);
  });

  /* Acta: por el orden del día del club, con asistentes e invitados */
  // Agenda por tipo: las reuniones usan el orden del día del club (el del distrito o el sugerido); eventos y obras, una propia
  const AGENDA = {
    evento: [['Registro de asistentes', 'Socios e invitados se registran al llegar.'], ['Apertura', 'Bienvenida y propósito del evento.'], ['Desarrollo', 'Lo central del evento.'], ['Cierre y agradecimientos', 'Fotos, anuncios y despedida.']],
    obra: [['Llegada y registro', 'Quiénes llegaron a la jornada.'], ['Instrucciones y seguridad', 'Grupos, tareas y cuidados.'], ['Jornada de servicio', 'El trabajo con la comunidad.'], ['Beneficiados y fotos', 'A cuántas personas se llegó y evidencia.'], ['Cierre', 'Agradecimientos y siguiente paso.']],
  };
  const actaDe = async (c, x) => { let a = null; try { a = JSON.parse(x.acta || 'null'); } catch (_) { a = null; }
    if (!a) {
      const base = AGENDA[x.tipo] ? AGENDA[x.tipo].map(([titulo, detalle]) => ({ titulo, detalle })) : (await ordenDelDia(c.env, c.businessId)).items;
      a = { items: base.map((i) => ({ titulo: i.titulo, detalle: i.detalle, notas: '', preparado: '', responsable_id: null, minutos: null })), compromisos: x.compromisos || '', notas: x.minuta || '' };
    }
    return a; };
  r.get('/api/reuniones/reuniones/:id/acta-datos', `tenant:${MOD}`, async (c) => { const x = await reunionOr404(c, c.params.id); return json({ acta: await actaDe(c, x), estado: x.acta_estado || 'borrador' }); });
  r.put('/api/reuniones/reuniones/:id/acta-datos', `manager:${MOD}`, async (c) => {
    const x = await reunionOr404(c, c.params.id), b = await readJson(c.req);
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => ({ titulo: cast('titulo', 'text', i.titulo) || 'Punto', detalle: cast('detalle', 'long', i.detalle) || '', notas: cast('notas', 'long', i.notas) || '', preparado: cast('preparado', 'long', i.preparado) || '',
      responsable_id: Number(i.responsable_id) || null, minutos: Math.min(240, Math.max(0, Number(i.minutos) || 0)) || null, hecho: !!i.hecho }));
    // Datos de la conducción: hora de inicio y fin, recaudo de la cajita de macería y si se aprobó el acta anterior
    const hhmm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? v : null);
    const acta = { items, compromisos: cast('compromisos', 'long', b.compromisos) || '', notas: cast('notas', 'long', b.notas) || '',
      inicio: hhmm(b.inicio), fin: hhmm(b.fin), recaudo: Math.max(0, Number(b.recaudo) || 0) || null, acta_anterior: b.acta_anterior === true ? true : b.acta_anterior === false ? false : null };
    const estado = b.estado === 'aprobada' ? 'aprobada' : 'borrador';
    await c.env.DB.prepare("UPDATE ro_reuniones SET acta = ?, acta_estado = ?, compromisos = ?, estado = CASE WHEN ? AND estado IN ('programada','confirmada') AND fecha <= ? THEN 'realizada' ELSE estado END, updated_at = ? WHERE id = ? AND business_id = ?")
      .bind(JSON.stringify(acta), estado, acta.compromisos, acta.inicio ? 1 : 0, today(), Date.now(), x.id, c.businessId).run();
    await audit(c, `Guardó el acta de «${x.titulo}» (${estado})`, { modulo: MOD });
    return json({ ok: true });
  });
  r.get('/api/reuniones/reuniones/:id/acta', `tenant:${MOD}`, async (c) => {
    const x = await reunionOr404(c, c.params.id), a = await actaDe(c, x);
    const socios = await all(c.env, 'SELECT id, nombre FROM ro_socios WHERE business_id = ?', c.businessId);
    const tareas = await all(c.env, `SELECT t.titulo, t.fecha_limite, t.estado, s.nombre socio, p.nombre proyecto FROM ro_tareas t LEFT JOIN ro_socios s ON s.id = t.socio_id AND s.business_id = t.business_id
      LEFT JOIN ro_proyectos p ON p.id = t.proyecto_id AND p.business_id = t.business_id WHERE t.business_id = ? AND t.reunion_id = ? AND t.estado <> 'cancelada' ORDER BY t.id`, c.businessId, x.id);
    const [biz, pres, inv, junta] = await Promise.all([one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId),
      all(c.env, 'SELECT s.nombre, s.cargo FROM ro_asistencia a JOIN ro_socios s ON s.id = a.socio_id AND s.business_id = a.business_id WHERE a.business_id = ? AND a.reunion_id = ? AND a.presente = 1 ORDER BY s.nombre', c.businessId, x.id),
      all(c.env, 'SELECT nombre, procedencia, tipo FROM ro_reunion_invitados WHERE business_id = ? AND reunion_id = ? ORDER BY created_at', c.businessId, x.id),
      all(c.env, "SELECT nombre, cargo FROM ro_socios WHERE business_id = ? AND estado = 'activo' AND cargo IS NOT NULL", c.businessId)]);
    const e = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])).replace(/\n/g, '<br>');
    const club = biz?.name || 'Club Rotaract', p = junta.find((j) => cargoOrden(j.cargo) === 1), sec = junta.find((j) => /secretari/i.test(j.cargo || ''));
    const fecha = new Date(`${x.fecha}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acta · ${e(x.titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet"><style>
@page{size:A4;margin:16mm}body{font:10.5pt/1.55 'Open Sans',Arial,sans-serif;color:#1d2433;max-width:180mm;margin:0 auto;padding:12px}
.bar{display:flex;justify-content:center;margin-bottom:12px}.bar button{border:0;border-radius:999px;padding:9px 18px;background:#17458f;color:#fff;font-weight:600;cursor:pointer}
header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #17458f;padding-bottom:10px}.logo-of{height:58px;width:auto}header div{margin-left:auto;text-align:right}
h1{font-size:15pt;margin:0;color:#17458f}h2{font-size:10.5pt;margin:18px 0 6px;color:#17458f;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #f7a81b;padding-bottom:3px}
ol{padding-left:18px}ol li{margin-bottom:8px}ol li b{color:#1d2433}.det{color:#6b7385;font-size:9pt}.nota{margin-top:2px}
.cols{columns:2;font-size:9.5pt}.firmas{display:flex;justify-content:space-around;margin-top:40px}.firmas div{width:42%;text-align:center;border-top:1px solid #1d2433;padding-top:4px;font-size:9pt}
.est{display:inline-block;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:99px;background:${x.acta_estado === 'aprobada' ? '#d1fae5;color:#065f46' : '#fef3c7;color:#92400e'}}
@media print{.bar{display:none}body{padding:0}}</style></head><body><div class="bar"><button onclick="print()">Descargar PDF / Imprimir</button></div>
<header>${await logoOficial(c, club)}<div><h1>Acta de reunión</h1><div>${e(x.titulo)}</div><div class="det">${e(fecha)}${x.hora_ini ? ` · ${e(x.hora_ini)}` : ''}${x.lugar ? ` · ${e(x.lugar)}` : ''}</div><span class="est">${x.acta_estado === 'aprobada' ? 'APROBADA' : 'BORRADOR'}</span></div></header>
<h2>Asistentes (${pres.length} socios${inv.length ? ` · ${inv.length} invitados` : ''})</h2><div class="cols">${pres.map((s) => `${e(s.nombre)}${s.cargo ? ` <span class="det">· ${e(s.cargo)}</span>` : ''}`).join('<br>') || '<span class="det">Sin asistencia registrada.</span>'}</div>
${inv.length ? `<h2>Invitados externos</h2><div class="cols">${inv.map((i) => `${e(i.nombre)}${i.procedencia ? ` <span class="det">· ${e(i.procedencia)}</span>` : ''}`).join('<br>')}</div>` : ''}
${a.inicio ? `<p class="det">Inicio ${e(a.inicio)}${a.fin ? ` · cierre ${e(a.fin)}` : ''}${a.acta_anterior === true ? ' · se aprobó el acta anterior' : ''}${a.recaudo ? ` · cajita de macería: $${Number(a.recaudo).toLocaleString('es-CO')}` : ''}</p>` : ''}
<h2>Orden del día</h2><ol>${a.items.map((i) => { const rs = socios.find((x) => x.id === i.responsable_id); return `<li><b>${e(i.titulo)}</b>${rs ? ` <span class="det">· ${e(rs.nombre)}</span>` : ''}${i.notas ? `<div class="nota">${e(i.notas)}</div>` : i.detalle ? `<div class="det">${e(i.detalle)}</div>` : ''}</li>`; }).join('')}</ol>
${a.notas ? `<h2>Notas</h2><div>${e(a.notas)}</div>` : ''}${a.compromisos ? `<h2>Compromisos</h2><div>${e(a.compromisos)}</div>` : ''}
${tareas.length ? `<h2>Tareas asignadas</h2><ol>${tareas.map((t) => `<li><b>${e(t.titulo)}</b> <span class="det">· ${e(t.socio || 'sin responsable')}${t.fecha_limite ? ` · para el ${e(t.fecha_limite)}` : ''} · ${t.proyecto ? `proyecto ${e(t.proyecto)}` : 'del club'}</span></li>`).join('')}</ol>` : ''}
<div class="firmas"><div>${e(p?.nombre || '')}<br><span class="det">Presidencia del club</span></div><div>${e(sec?.nombre || '')}<br><span class="det">Secretaría del club</span></div></div></body></html>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });

  r.get('/api/reuniones/resumen', `tenant:${MOD}`, async (c) => {
    const hoy = today();
    const prox = await all(c.env, "SELECT id, tipo, titulo, fecha, hora_ini, lugar FROM ro_reuniones WHERE business_id = ? AND fecha >= ? AND estado <> 'cancelada' ORDER BY fecha, hora_ini LIMIT 5", c.businessId, hoy);
    const asis = await one(c.env, `SELECT COUNT(*) t, SUM(a.presente = 1) p FROM ro_asistencia a JOIN ro_reuniones r ON r.id = a.reunion_id AND r.business_id = a.business_id
      WHERE a.business_id = ? AND a.presente IS NOT NULL AND r.fecha >= date(?, '-90 day')`, c.businessId, hoy);
    return json({ proximas: prox, valor: prox.length, asistencia_90d: asis.t ? Math.round((asis.p / asis.t) * 100) : null });
  });
}

// Página pública del enlace de registro (/r/<token>): formulario sencillo para invitados externos
export async function paginaRegistro(env, token) {
  const x = await one(env, "SELECT r.titulo, r.fecha, r.hora_ini, r.lugar, r.estado, b.name club FROM ro_reuniones r JOIN businesses b ON b.id = r.business_id WHERE r.token = ? AND b.archived_at IS NULL", String(token || '').slice(0, 40));
  const e = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const cuerpo = !x || x.estado === 'cancelada' ? '<p>Este enlace no existe o la reunión fue cancelada.</p>' : `<p class="t">${e(x.club)}</p><h1>${e(x.titulo)}</h1>
    <p class="d">${e(new Date(`${x.fecha}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }))}${x.hora_ini ? ` · ${e(x.hora_ini)}` : ''}${x.lugar ? ` · ${e(x.lugar)}` : ''}</p>
    <form id="f"><label>Nombre completo<input name="nombre" required maxlength="120"></label><label>¿De dónde vienes? (club, organización…)<input name="procedencia" maxlength="120"></label>
    <label>Eres<select name="tipo"><option value="invitado">Invitado</option><option value="rotario">Rotario</option><option value="rotaractiano">Rotaractiano de otro club</option><option value="interactiano">Interactiano</option><option value="orador">Orador</option></select></label>
    <label>Correo (opcional)<input name="correo" type="email" maxlength="120"></label><label>Celular (opcional)<input name="telefono" maxlength="20"></label>
    <label class="c"><input type="checkbox" name="autoriza" required> Autorizo al club a usar estos datos solo para registrar mi asistencia (Ley 1581 de 2012).</label>
    <button>Registrar mi asistencia</button><p id="m"></p></form>`;
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Registro · ${e(x?.titulo || 'Reunión')}</title><meta name="robots" content="noindex">
<style>body{margin:0;font:16px system-ui,sans-serif;background:#eef2f8;color:#1d2433}main{max-width:440px;margin:0 auto;padding:24px 16px}.card{background:#fff;border-radius:18px;padding:22px;border-top:6px solid #d41367;box-shadow:0 8px 30px rgba(23,69,143,.12)}
.t{color:#d41367;font-weight:700;margin:0;text-transform:uppercase;font-size:12px;letter-spacing:.1em}h1{margin:6px 0;font-size:22px;color:#17458f}.d{margin:0 0 16px;color:#5b6475;text-transform:capitalize}
label{display:block;font-size:14px;font-weight:600;margin-bottom:12px}input,select{display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid #cdd5e1;border-radius:10px;font:inherit}
.c{font-weight:400;display:flex;gap:8px;align-items:flex-start}.c input{width:auto;margin-top:3px}button{width:100%;border:0;border-radius:999px;padding:12px;background:#17458f;color:#fff;font-weight:700;font-size:16px}#m{text-align:center;font-weight:600}</style></head>
<body><main><div class="card">${cuerpo}</div></main><script>
var f=document.getElementById('f');if(f)f.onsubmit=async function(ev){ev.preventDefault();var b=f.querySelector('button');b.disabled=true;var d=Object.fromEntries(new FormData(f));d.autoriza=!!f.autoriza.checked;
try{var r=await fetch('/api/publico/r/${e(token)}',{method:'POST',headers:{'content-type':'application/json','x-app':'1'},body:JSON.stringify(d)});var j=await r.json().catch(function(){return{}});
if(!r.ok)throw new Error(j.error||'No se pudo registrar');f.innerHTML='<p style="text-align:center;font-size:18px">¡Listo! Quedaste registrado. 🎉</p>'}catch(x){document.getElementById('m').textContent=x.message;b.disabled=false}};
</script></body></html>`, { status: x ? 200 : 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
