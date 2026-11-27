// Equipo distrital y certificados del distrito; y «Mis certificados» de la persona en todos sus clubes y en los distritos.
//   Distrito: GET /api/distrito/equipo?anio= (equipo, cargos sugeridos, certificados del año) · GET /api/distrito/personas (socios de sus clubes)
//             POST /api/distrito/equipo · PATCH/DELETE /api/distrito/equipo/:id
//             POST /api/distrito/certificados {miembro_id | nombre, correo, club, tipo, titulo, texto, fecha} · POST /api/distrito/certificados/equipo {anio}
//             GET /api/distrito/certificados/:id (HTML para imprimir / PDF) · DELETE /api/distrito/certificados/:id
//   Persona:  GET /api/lotuyo/mis-certificados (activación y certificados de cada club donde está + los del distrito, por correo)
//             GET /api/lotuyo/mis-certificados/:origen/:id (origen = activacion | club | distrito; HTML)
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, today, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { uuid } from '../lib/db.js';
import { anioRotarioDe, EN_DISTRITO, enDistrito, conSigla, CARGOS_DISTRITALES, certificadoDistritoHtml, certificadoHtml, certificadoEspecialHtml, PROGRAMAS } from '../lib/rotaract.js';
import { distritoOError } from './distrito.js';

const html = (h) => new Response(h, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
const correoOk = (v) => { const x = String(v || '').trim().toLowerCase().slice(0, 160); if (x && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) throw new HttpError(400, 'Correo no válido'); return x || null; };
const codigo = () => `DIS-${uuid().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
// Contexto de otro negocio (para pintar un certificado que no es del negocio de la sesión)
const en = (c, bid, ajeno = true) => Object.assign(Object.create(c), { businessId: bid, ajeno });

async function miembroOr404(c, d, id) {
  const m = await one(c.env, 'SELECT * FROM ro_distrito_equipo WHERE id = ? AND business_id = ? AND distrito = ?', Number(id) || 0, c.businessId, d.clave);
  if (!m) throw new HttpError(404, 'No está en el equipo');
  return m;
}
// Persona desde un socio de un club del distrito (si viene socio_id) o escrita a mano
async function persona(c, d, b) {
  if (b.socio_id) {
    const s = await one(c.env, `SELECT s.id, s.nombre, s.email, s.telefono, s.business_id, b.name club, COALESCE(k.programa, 'rotaract') programa FROM ro_socios s JOIN businesses b ON b.id = s.business_id
      LEFT JOIN ro_club_config k ON k.business_id = s.business_id WHERE s.id = ? AND s.${EN_DISTRITO}`, Number(b.socio_id) || 0, ...enDistrito(c.env, d.codigo, d.programa));
    if (!s) throw new HttpError(404, 'Ese socio no es de un club del distrito');
    return { socio_id: s.id, nombre: s.nombre, correo: (s.email || '').toLowerCase() || correoOk(b.correo), telefono: s.telefono || null, club_id: s.business_id, club: conSigla(s.club, s.programa) };
  }
  const nombre = cast('nombre', 'text', b.nombre);
  if (!nombre) throw new HttpError(400, 'Escribe el nombre o elige un socio');
  return { socio_id: null, nombre, correo: correoOk(b.correo), telefono: cast('telefono', 'text', b.telefono) || null, club_id: null, club: cast('club', 'text', b.club) || null };
}

export function routes(r) {
  /* ---------- Distrito: equipo ---------- */
  r.get('/api/distrito/equipo', 'tenant', async (c) => {
    const d = await distritoOError(c), anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    const [rows, certs, anios] = await Promise.all([
      all(c.env, 'SELECT * FROM ro_distrito_equipo WHERE business_id = ? AND distrito = ? AND anio = ? ORDER BY orden, id', c.businessId, d.clave, anio),
      all(c.env, 'SELECT id, miembro_id, tipo, titulo, nombre, correo, club, cargo, anio, fecha FROM ro_distrito_certificados WHERE business_id = ? AND distrito = ? AND anio = ? ORDER BY fecha DESC, id DESC', c.businessId, d.clave, anio),
      all(c.env, 'SELECT DISTINCT anio FROM ro_distrito_equipo WHERE business_id = ? AND distrito = ? ORDER BY anio DESC', c.businessId, d.clave),
    ]);
    return json({ anio, nombre_anio: `${anio}-${anio + 1}`, cargos: CARGOS_DISTRITALES, anios: anios.map((x) => x.anio), certificados: certs,
      rows: rows.map((m) => ({ ...m, certificado: certs.find((k) => k.miembro_id === m.id && k.tipo === 'servicio')?.id || null })) });
  });
  r.get('/api/distrito/personas', 'tenant', async (c) => {
    const d = await distritoOError(c);
    const rows = await all(c.env, `SELECT s.id, s.nombre, s.email, s.cargo, s.business_id, b.name club, COALESCE(k.programa, 'rotaract') programa FROM ro_socios s JOIN businesses b ON b.id = s.business_id
      LEFT JOIN ro_club_config k ON k.business_id = s.business_id WHERE s.${EN_DISTRITO} AND s.estado IN ('activo', 'aspirante') ORDER BY b.name, s.nombre LIMIT 3000`, ...enDistrito(c.env, d.codigo, d.programa));
    return json({ rows: rows.map((s) => ({ id: s.id, nombre: s.nombre, correo: s.email, cargo: s.cargo, club: conSigla(s.club, s.programa) })) });
  });
  const datosMiembro = async (c, d, b, viejo) => {
    const cargo = cast('cargo', 'text', b.cargo ?? viejo?.cargo);
    if (!cargo) throw new HttpError(400, 'Escribe el cargo');
    const anio = Number(b.anio ?? viejo?.anio) || anioRotarioDe(today());
    if (anio < 2000 || anio > 2100) throw new HttpError(400, 'Año rotario no válido');
    const p = ('socio_id' in b || 'nombre' in b) ? await persona(c, d, b) : viejo;
    const i = CARGOS_DISTRITALES.findIndex((x) => x.toLowerCase() === cargo.toLowerCase());
    return { cargo, anio, orden: i >= 0 ? i : 50, ...p };
  };
  r.post('/api/distrito/equipo', 'manager', async (c) => {
    const d = await distritoOError(c), m = await datosMiembro(c, d, await readJson(c.req)), t = Date.now();
    const x = await c.env.DB.prepare(`INSERT INTO ro_distrito_equipo (business_id, distrito, anio, cargo, nombre, correo, telefono, club_id, club, socio_id, orden, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, d.clave, m.anio, m.cargo, m.nombre, m.correo, m.telefono, m.club_id, m.club, m.socio_id, m.orden, t, t).run();
    await audit(c, `Agregó a ${m.nombre} al equipo distrital (${m.cargo})`, { modulo: 'distrito' });
    return json({ id: x.meta.last_row_id }, 201);
  });
  r.patch('/api/distrito/equipo/:id', 'manager', async (c) => {
    const d = await distritoOError(c), v = await miembroOr404(c, d, c.params.id), m = await datosMiembro(c, d, await readJson(c.req), v);
    await c.env.DB.prepare('UPDATE ro_distrito_equipo SET anio = ?, cargo = ?, nombre = ?, correo = ?, telefono = ?, club_id = ?, club = ?, socio_id = ?, orden = ?, updated_at = ? WHERE id = ?')
      .bind(m.anio, m.cargo, m.nombre, m.correo, m.telefono, m.club_id, m.club, m.socio_id, m.orden, Date.now(), v.id).run();
    return json({ ok: true });
  });
  r.delete('/api/distrito/equipo/:id', 'manager', async (c) => {
    const d = await distritoOError(c), v = await miembroOr404(c, d, c.params.id);
    await c.env.DB.prepare('DELETE FROM ro_distrito_equipo WHERE id = ?').bind(v.id).run();
    await audit(c, `Quitó a ${v.nombre} del equipo distrital`, { modulo: 'distrito' });
    return json({ ok: true });
  });

  /* ---------- Distrito: certificados ---------- */
  const emitir = async (c, d, k) => {
    const x = await c.env.DB.prepare(`INSERT INTO ro_distrito_certificados (business_id, distrito, miembro_id, tipo, titulo, texto, nombre, correo, club, cargo, anio, fecha, codigo, creado_por, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, d.clave, k.miembro_id || null, k.tipo, k.titulo || null, k.texto || null, k.nombre, k.correo || null, k.club || null,
      k.cargo || null, k.anio, k.fecha, codigo(), c.session.user_id, Date.now()).run();
    return x.meta.last_row_id;
  };
  r.post('/api/distrito/certificados', 'manager', async (c) => {
    const d = await distritoOError(c), b = await readJson(c.req);
    const tipo = b.tipo === 'reconocimiento' ? 'reconocimiento' : 'servicio', fecha = cast('fecha', 'date', b.fecha) || today();
    let k;
    if (b.miembro_id) { const m = await miembroOr404(c, d, b.miembro_id); k = { miembro_id: m.id, nombre: m.nombre, correo: m.correo, club: m.club, cargo: m.cargo, anio: m.anio }; }
    else if (tipo === 'servicio') throw new HttpError(400, 'El certificado de servicio es para alguien del equipo distrital');
    else { const p = await persona(c, d, b); k = { nombre: p.nombre, correo: p.correo, club: p.club, anio: anioRotarioDe(fecha) }; }
    if (tipo === 'reconocimiento') { k.titulo = cast('titulo', 'text', b.titulo); if (!k.titulo) throw new HttpError(400, 'Escribe el motivo del reconocimiento'); k.texto = cast('texto', 'long', b.texto); }
    else if (await one(c.env, "SELECT 1 FROM ro_distrito_certificados WHERE miembro_id = ? AND tipo = 'servicio'", k.miembro_id)) throw new HttpError(409, 'Ya tiene su certificado de servicio de ese año');
    const id = await emitir(c, d, { ...k, tipo, fecha });
    await audit(c, `Expidió un certificado distrital a ${k.nombre}`, { modulo: 'distrito' });
    return json({ id }, 201);
  });
  r.post('/api/distrito/certificados/equipo', 'manager', async (c) => {
    const d = await distritoOError(c), b = await readJson(c.req), anio = Number(b.anio) || anioRotarioDe(today()), fecha = cast('fecha', 'date', b.fecha) || today();
    const eq = await all(c.env, `SELECT * FROM ro_distrito_equipo e WHERE business_id = ? AND distrito = ? AND anio = ?
      AND NOT EXISTS (SELECT 1 FROM ro_distrito_certificados k WHERE k.miembro_id = e.id AND k.tipo = 'servicio')`, c.businessId, d.clave, anio);
    for (const m of eq) await emitir(c, d, { miembro_id: m.id, tipo: 'servicio', nombre: m.nombre, correo: m.correo, club: m.club, cargo: m.cargo, anio: m.anio, fecha });
    if (eq.length) await audit(c, `Expidió ${eq.length} certificados de servicio del equipo distrital ${anio}-${anio + 1}`, { modulo: 'distrito' });
    return json({ creados: eq.length });
  });
  r.get('/api/distrito/certificados/:id', 'tenant', async (c) => {
    const d = await distritoOError(c);
    const k = await one(c.env, 'SELECT * FROM ro_distrito_certificados WHERE id = ? AND business_id = ? AND distrito = ?', Number(c.params.id) || 0, c.businessId, d.clave);
    if (!k) throw new HttpError(404, 'Certificado no encontrado');
    return html(await certificadoDistritoHtml(c, k));
  });
  r.delete('/api/distrito/certificados/:id', 'manager', async (c) => {
    const d = await distritoOError(c);
    const x = await c.env.DB.prepare('DELETE FROM ro_distrito_certificados WHERE id = ? AND business_id = ? AND distrito = ?').bind(Number(c.params.id) || 0, c.businessId, d.clave).run();
    if (!x.meta.changes) throw new HttpError(404, 'Certificado no encontrado');
    return json({ ok: true });
  });

  /* ---------- La persona: todos sus certificados (cada club donde es socio + los distritos), por año ---------- */
  // Sus fichas de socio en todos los negocios: por su usuario o por su correo
  const misSocios = (c) => all(c.env, `SELECT s.id, s.business_id, s.nombre, s.email, s.activado_at, b.name club, COALESCE(k.programa, 'rotaract') programa FROM ro_socios s JOIN businesses b ON b.id = s.business_id
    LEFT JOIN ro_club_config k ON k.business_id = s.business_id WHERE b.archived_at IS NULL AND (s.user_id = ? OR (? <> '' AND lower(s.email) = lower(?)))`, c.session.user_id, c.session.email || '', c.session.email || '');
  const misCorreos = (c, socios) => [...new Set([c.session.email, ...socios.map((s) => s.email)].filter(Boolean).map((x) => x.toLowerCase()))];
  r.get('/api/lotuyo/mis-certificados', 'tenant', async (c) => {
    const socios = await misSocios(c), correos = misCorreos(c, socios), ids = socios.map((s) => s.id);
    const [club, dist] = await Promise.all([
      ids.length ? all(c.env, `SELECT k.id, k.tipo, k.titulo, k.cargo, k.anio, k.fecha, k.socio_id, k.business_id FROM ro_certificados k WHERE k.socio_id IN (${ids.map(() => '?').join(',')})`, ...ids) : [],
      correos.length ? all(c.env, `SELECT k.id, k.tipo, k.titulo, k.cargo, k.anio, k.fecha, k.club, k.business_id, cf.distrito codigo, COALESCE(cf.programa, 'rotaract') programa FROM ro_distrito_certificados k
        JOIN businesses b ON b.id = k.business_id AND b.archived_at IS NULL LEFT JOIN ro_club_config cf ON cf.business_id = k.business_id WHERE lower(k.correo) IN (${correos.map(() => '?').join(',')})`, ...correos) : [],
    ]);
    const deSocio = (k) => socios.find((s) => s.id === k.socio_id && s.business_id === k.business_id);
    const rows = [
      ...socios.filter((s) => s.activado_at).map((s) => ({ origen: 'activacion', id: s.id, tipo: 'activacion', titulo: 'Activación en el club', de: conSigla(s.club, s.programa), fecha: s.activado_at, anio: anioRotarioDe(s.activado_at), propio: s.business_id === c.businessId })),
      ...club.filter(deSocio).map((k) => { const s = deSocio(k); return { origen: 'club', id: k.id, tipo: k.tipo, titulo: k.tipo === 'junta' ? 'Servicio en la junta' : `Reconocimiento · ${k.titulo || ''}`, cargo: k.cargo, de: conSigla(s.club, s.programa), fecha: k.fecha, anio: k.anio || anioRotarioDe(k.fecha), propio: k.business_id === c.businessId }; }),
      ...dist.map((k) => ({ origen: 'distrito', id: k.id, tipo: k.tipo === 'servicio' ? 'distrital' : 'reconocimiento', titulo: k.tipo === 'servicio' ? 'Servicio distrital' : `Reconocimiento del distrito · ${k.titulo || ''}`, cargo: k.cargo,
        de: `${(PROGRAMAS[k.programa] || PROGRAMAS.rotaract).nombre} Distrito ${k.codigo || c.env.DISTRITO_DEFECTO || '4271'}`, fecha: k.fecha, anio: k.anio || anioRotarioDe(k.fecha), propio: k.business_id === c.businessId })),
    ].sort((a, b) => b.fecha.localeCompare(a.fecha));
    return json({ rows });
  });
  r.get('/api/lotuyo/mis-certificados/:origen/:id', 'tenant', async (c) => {
    const socios = await misSocios(c), id = Number(c.params.id) || 0;
    if (c.params.origen === 'activacion') {
      const s = socios.find((x) => x.id === id); if (!s) throw new HttpError(404, 'Certificado no encontrado');
      const full = await one(c.env, 'SELECT * FROM ro_socios WHERE id = ?', s.id);
      return html(await certificadoHtml(en(c, s.business_id, s.business_id !== c.businessId), full));
    }
    if (c.params.origen === 'club') {
      const k = await one(c.env, 'SELECT * FROM ro_certificados WHERE id = ?', id), s = k && socios.find((x) => x.id === k.socio_id && x.business_id === k.business_id);
      if (!s) throw new HttpError(404, 'Certificado no encontrado');
      return html(await certificadoEspecialHtml(en(c, k.business_id, k.business_id !== c.businessId), await one(c.env, 'SELECT * FROM ro_socios WHERE id = ?', s.id), k));
    }
    if (c.params.origen === 'distrito') {
      const k = await one(c.env, 'SELECT * FROM ro_distrito_certificados WHERE id = ?', id);
      if (!k || !k.correo || !misCorreos(c, socios).includes(k.correo.toLowerCase())) throw new HttpError(404, 'Certificado no encontrado');
      return html(await certificadoDistritoHtml(en(c, k.business_id, k.business_id !== c.businessId), k));
    }
    throw new HttpError(404, 'Certificado no encontrado');
  });
}
