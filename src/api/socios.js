// Socios: la junta (con su cargo, en el orden oficial) y los demás socios. Ficha 360, foto, acceso a la app
// y activación con su certificado.
//   CRUD /api/socios/socios                     (crear/editar: junta; el personal ve el directorio sin datos privados)
//   GET  /api/socios/socios/:id/ficha           ficha 360 (asistencia, tareas, cuotas)
//   POST /api/socios/socios/:id/activar         activa al socio y genera su certificado (código único)
//   GET  /api/socios/socios/:id/certificado     certificado de activación (HTML para imprimir / guardar PDF)
//   POST /api/socios/socios/:id/acceso          invita al socio a la app (rol Socio) → { invite_url }
//   POST /api/socios/socios/:id/foto            sube la foto (cuerpo = imagen)   ·   GET /api/socios/foto/:id
//   GET  /api/socios/resumen
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, today, cast } from '../lib/crud.js';
import { createInvite, invitePath } from '../lib/auth.js';
import { db, uuid } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { guardarArchivo, borrarArchivo, servirArchivo } from '../lib/archivos.js';
import { cargoOrden, cartera, certificadoHtml, certificadoEspecialHtml, certificadoClubHtml, socioDeSesion, anioRotarioDe } from '../lib/rotaract.js';

const MOD = 'socios';
export const TIPOS = ['socio', 'socio_externo', 'voluntario_invitado', 'aspirante', 'honorario'];
export const ESTADOS = ['activo', 'aspirante', 'inactivo', 'retirado'];
const PRIVADOS = ['documento', 'telefono', 'email', 'fecha_nacimiento', 'notas'];
const manager = (c) => ['owner', 'admin'].includes(c.role);

const fotoDe = (s) => (s.foto_key || s.foto_url ? `/api/socios/foto/${s.id}` : null);
export const publico = (c, s) => {
  const out = { ...s, foto: fotoDe(s), orden_cargo: cargoOrden(s.cargo), junta: cargoOrden(s.cargo) < 99, activado: !!s.activado_at, en_myrotary: !!(s.myrotary_at || s.myrotary_id), tiene_firma: !!s.firma_key };
  delete out.foto_key; delete out.firma_key; delete out.origen_id;
  if (!manager(c) && s.user_id !== c.session?.user_id) for (const k of PRIVADOS) delete out[k];
  return out;
};

// La junta está en el Equipo: cada socio activo con cargo de junta y correo tiene usuario y acceso de Junta (admin).
// Si ya estaba como Socio (staff) sube a Junta; la Presidencia (owner) no se toca y nadie baja de rol.
// Devuelve cuántos agregó o subió y quiénes de la junta no tienen correo.
export async function juntaAlEquipo(c, soloId = null) {
  if (c.readOnly) return { agregados: 0, sin_correo: [] };
  const junta = (await all(c.env, `SELECT id, nombre, email, user_id, cargo FROM ro_socios WHERE business_id = ? AND estado = 'activo' AND COALESCE(cargo, '') <> '' ${soloId ? 'AND id = ?' : ''}`, c.businessId, ...(soloId ? [soloId] : [])))
    .filter((s) => cargoOrden(s.cargo) < 99);
  let agregados = 0;
  const sinCorreo = [];
  for (const s of junta) {
    if (!s.email && !s.user_id) { sinCorreo.push(s.nombre); continue; }
    let uid = s.user_id;
    if (!uid) {
      const mail = s.email.toLowerCase();
      uid = (await one(c.env, 'SELECT id FROM users WHERE email = ?', mail))?.id;
      if (!uid) { uid = uuid(); await c.env.DB.prepare('INSERT INTO users (id, email, name) VALUES (?, ?, ?)').bind(uid, mail, s.nombre).run(); }
      if (await one(c.env, 'SELECT 1 FROM ro_socios WHERE business_id = ? AND user_id = ? AND id <> ?', c.businessId, uid, s.id)) continue;   // ese usuario ya es otra ficha
      await c.env.DB.prepare('UPDATE ro_socios SET user_id = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(uid, Date.now(), s.id, c.businessId).run();
    }
    const m = await one(c.env, 'SELECT role FROM memberships WHERE business_id = ? AND user_id = ?', c.businessId, uid);
    if (!m) { await c.env.DB.prepare("INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, 'admin')").bind(uid, c.businessId).run(); agregados++; }
    else if (m.role === 'staff') { await c.env.DB.prepare("UPDATE memberships SET role = 'admin' WHERE business_id = ? AND user_id = ?").bind(c.businessId, uid).run(); agregados++; }
  }
  if (agregados) await audit(c, `Pasó ${agregados} de la junta al equipo`, { modulo: MOD });
  return { agregados, sin_correo: sinCorreo };
}

export const ENTITIES = {
  socios: { table: 'ro_socios', label: 'el socio', title: 'nombre', search: ['nombre', 'email', 'cargo', 'profesion'], crear: 'manager',
    order: "CASE estado WHEN 'activo' THEN 0 WHEN 'aspirante' THEN 1 WHEN 'inactivo' THEN 2 ELSE 3 END, nombre",
    fields: { nombre: 'text!', email: 'email', telefono: 'text', documento: 'text', fecha_nacimiento: 'date', profesion: 'text', instagram: 'text',
      fecha_ingreso: 'date', activado_at: 'date', myrotary_id: 'text', myrotary_at: 'date', tipo_membresia: TIPOS, estado: ESTADOS, cargo: 'text', cargo_desde: 'date', paga_cuota: 'bool+', notas: 'long' },
    async beforeCreate(c, row) {
      if (row.email && await one(c.env, 'SELECT 1 FROM ro_socios WHERE business_id = ? AND lower(email) = ?', c.businessId, row.email)) throw new HttpError(409, 'Ya hay un socio con ese correo');
      if (row.cargo && !row.cargo_desde) row.cargo_desde = today();
    },
    beforeUpdate(c, row, before) { if ('cargo' in row && row.cargo !== before.cargo) row.cargo_desde = row.cargo ? today() : null; },
    afterCreate: (c, id) => juntaAlEquipo(c, id),
    afterUpdate: (c, id) => juntaAlEquipo(c, id),
    async beforeDelete(c, before) {
      const n = await one(c.env, 'SELECT (SELECT COUNT(*) FROM ro_pagos WHERE business_id = ?1 AND socio_id = ?2) + (SELECT COUNT(*) FROM ro_asistencia WHERE business_id = ?1 AND socio_id = ?2) n', c.businessId, before.id);
      if (n.n) throw new HttpError(409, 'El socio tiene pagos o asistencias: márcalo como retirado en vez de borrarlo');
      await borrarArchivo(c.env, before.foto_key);
    },
    // + el acceso a la app de cada uno (Presidencia / Junta / Socio, o sin acceso; «invitado» si aún no crea su contraseña)
    async decorate(c, rows) {
      const ms = await all(c.env, 'SELECT m.user_id, m.role, u.password_hash IS NOT NULL activo FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.business_id = ?', c.businessId);
      return rows.map((s) => { const m = s.user_id && ms.find((x) => x.user_id === s.user_id);
        return { ...publico(c, s), acceso: m ? { rol: m.role, estado: m.activo ? 'activo' : 'invitado' } : null }; })
        .sort((a, b) => a.orden_cargo - b.orden_cargo || 0);
    } },
};

async function socioOr404(c, id) {
  const s = await one(c.env, 'SELECT * FROM ro_socios WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId);
  if (!s) throw new HttpError(404, 'Socio no encontrado');
  return s;
}

// Activar en el club = fecha de activación (por defecto hoy) + certificado. My Rotary va aparte (ID y fecha en la ficha).
export async function activar(c, s, fecha = null) {
  if (s.activado_at) return { ya: true, activado_at: s.activado_at };
  const dia = fecha ? cast('fecha', 'date', fecha) : today();
  if (dia > today()) throw new HttpError(400, 'La fecha de activación no puede ser futura');
  const codigo = s.activacion_codigo || `RTC-${uuid().replace(/-/g, '').slice(0, 8).toUpperCase()}`;   // verificación interna del certificado
  await c.env.DB.prepare("UPDATE ro_socios SET activado_at = ?, activacion_codigo = ?, activado_por = ?, estado = 'activo', updated_at = ? WHERE id = ? AND business_id = ?")
    .bind(dia, codigo, c.session.user_id, Date.now(), s.id, c.businessId).run();
  await audit(c, `Activó a ${s.nombre} en el club (${dia})`, { modulo: MOD });
  return { ya: false, activado_at: dia, codigo };
}

export function routes(r) {
  crud(r, { base: '/api/socios', modulo: MOD, entities: ENTITIES });

  r.get('/api/socios/resumen', `tenant:${MOD}`, async (c) => {
    // «Socios» = miembros del club (socios, honorarios y la junta); los externos y voluntarios se cuentan aparte
    const x = await one(c.env, `SELECT SUM(estado = 'activo' AND (tipo_membresia IN ('socio', 'honorario') OR (cargo IS NOT NULL AND cargo <> ''))) activos, SUM(estado = 'aspirante' OR (estado = 'activo' AND tipo_membresia = 'aspirante')) aspirantes,
      SUM(estado = 'activo' AND tipo_membresia IN ('socio_externo', 'voluntario_invitado') AND (cargo IS NULL OR cargo = '')) externos,
      SUM(estado = 'activo' AND activado_at IS NULL AND (tipo_membresia IN ('socio', 'honorario') OR (cargo IS NOT NULL AND cargo <> ''))) sin_activar,
      SUM(estado = 'activo' AND cargo IS NOT NULL AND cargo <> '' AND lower(cargo) NOT IN ('socio','socia')) junta FROM ro_socios WHERE business_id = ?`, c.businessId);
    return json({ valor: x.activos || 0, activos: x.activos || 0, aspirantes: x.aspirantes || 0, externos: x.externos || 0, sin_activar: x.sin_activar || 0, junta: x.junta || 0 });
  });

  r.get('/api/socios/socios/:id/ficha', `tenant:${MOD}`, async (c) => {
    const s = await socioOr404(c, c.params.id);
    const [asis, tareas] = await Promise.all([
      one(c.env, `SELECT COUNT(*) total, SUM(a.presente = 1) presente FROM ro_asistencia a JOIN ro_reuniones r ON r.id = a.reunion_id AND r.business_id = a.business_id
        WHERE a.business_id = ? AND a.socio_id = ? AND a.presente IS NOT NULL`, c.businessId, s.id),
      all(c.env, "SELECT id, titulo, estado, fecha_limite FROM ro_tareas WHERE business_id = ? AND socio_id = ? AND estado NOT IN ('cancelada') ORDER BY estado = 'hecha', fecha_limite LIMIT 30", c.businessId, s.id),
    ]);
    const cuota = manager(c) || s.user_id === c.session.user_id ? (await cartera(c, s.id))[0] || null : null;
    return json({ socio: publico(c, s), asistencia: { total: asis.total || 0, presente: asis.presente || 0, pct: asis.total ? Math.round((asis.presente / asis.total) * 100) : null }, tareas, cuota });
  });

  r.post('/api/socios/socios/:id/activar', `manager:${MOD}`, async (c) => json(await activar(c, await socioOr404(c, c.params.id), (await readJson(c.req).catch(() => ({}))).fecha)));

  /* Certificaciones: junta del año (por cargo y año rotario) y reconocimientos a un socio; la de activación sale de su ficha */
  const html = (t) => new Response(t, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  const nuevoCert = async (c, s, b) => {
    const tipo = ['junta', 'reconocimiento'].includes(b.tipo) ? b.tipo : null;
    if (!tipo) throw new HttpError(400, 'Tipo de certificado no válido');
    const fecha = cast('fecha', 'date', b.fecha || today()), anio = Number(b.anio) || anioRotarioDe(fecha);
    const cargo = tipo === 'junta' ? (cast('cargo', 'text', b.cargo) || s.cargo) : null;
    if (tipo === 'junta' && !cargo) throw new HttpError(400, 'Indica el cargo que tuvo en la junta');
    const titulo = tipo === 'reconocimiento' ? cast('titulo', 'text', b.titulo) : null;
    if (tipo === 'reconocimiento' && !titulo) throw new HttpError(400, 'Escribe el título del reconocimiento');
    const codigo = `RTC-${uuid().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const x = await c.env.DB.prepare('INSERT INTO ro_certificados (business_id, socio_id, tipo, titulo, texto, cargo, anio, fecha, codigo, creado_por, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, s.id, tipo, titulo, cast('texto', 'long', b.texto), cargo, anio, fecha, codigo, c.session.user_id, Date.now()).run();
    await audit(c, `Expidió un certificado de ${tipo === 'junta' ? 'junta' : `reconocimiento «${titulo}»`} a ${s.nombre}`, { modulo: MOD });
    return x.meta.last_row_id;
  };
  // Datos del club para su certificado de organización (número, fundación, club rotario patrocinador): en ro_club_config.kit
  // El distrito vive en su columna (con él el distrito agrupa a sus clubes); país y zona van con los demás datos en kit.club
  const datosClub = async (c) => { const r = await one(c.env, 'SELECT kit, distrito FROM ro_club_config WHERE business_id = ?', c.businessId); let k = {}; try { k = JSON.parse(r?.kit || '{}').club || {}; } catch (_) { k = {}; }
    return { ...k, pais: k.pais || 'Colombia', distrito: r?.distrito || c.env.DISTRITO_DEFECTO || '4271' }; };
  r.get('/api/socios/club', `manager:${MOD}`, async (c) => json(await datosClub(c)));
  r.put('/api/socios/club', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), d = { numero: cast('numero', 'text', b.numero), fundado: b.fundado ? cast('fundado', 'date', b.fundado) : null,
      patrocinador: cast('patrocinador', 'text', b.patrocinador), presidente_patrocinador: cast('presidente_patrocinador', 'text', b.presidente_patrocinador),
      pais: cast('pais', 'text', b.pais), zona: cast('zona', 'text', b.zona) };
    const distrito = String(b.distrito ?? '').trim();
    if (distrito && !/^\d{3,5}$/.test(distrito)) throw new HttpError(400, 'El distrito es un número (por ejemplo 4271)');
    const r = await one(c.env, 'SELECT kit FROM ro_club_config WHERE business_id = ?', c.businessId); let k = {}; try { k = JSON.parse(r?.kit || '{}'); } catch (_) { k = {}; }
    await c.env.DB.prepare('INSERT INTO ro_club_config (business_id, kit, distrito, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET kit = excluded.kit, distrito = COALESCE(excluded.distrito, ro_club_config.distrito), updated_at = excluded.updated_at')
      .bind(c.businessId, JSON.stringify({ ...k, club: d }), distrito || null, Date.now()).run();
    return json(await datosClub(c));
  });
  r.get('/api/socios/club/certificado', `manager:${MOD}`, async (c) => html(await certificadoClubHtml(c, await datosClub(c))));
  r.get('/api/socios/certificados', `manager:${MOD}`, async (c) => json({ rows: await all(c.env, `SELECT k.id, k.socio_id, k.tipo, k.titulo, k.cargo, k.anio, k.fecha, k.texto, s.nombre socio FROM ro_certificados k
    JOIN ro_socios s ON s.id = k.socio_id AND s.business_id = k.business_id WHERE k.business_id = ? ORDER BY k.fecha DESC, k.id DESC`, c.businessId) }));
  r.post('/api/socios/certificados', `manager:${MOD}`, async (c) => { const b = await readJson(c.req); return json({ id: await nuevoCert(c, await socioOr404(c, b.socio_id), b) }, 201); });
  // Toda la junta actual de una vez (certificado de servicio del año rotario)
  r.post('/api/socios/certificados/junta', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), anio = Number(b.anio) || anioRotarioDe(today());
    const junta = (await all(c.env, "SELECT * FROM ro_socios WHERE business_id = ? AND estado = 'activo' AND COALESCE(cargo, '') <> ''", c.businessId)).filter((s) => cargoOrden(s.cargo) < 99);
    let n = 0;
    for (const s of junta) { if (await one(c.env, "SELECT 1 FROM ro_certificados WHERE business_id = ? AND socio_id = ? AND tipo = 'junta' AND anio = ?", c.businessId, s.id, anio)) continue; await nuevoCert(c, s, { tipo: 'junta', anio, fecha: b.fecha }); n++; }
    return json({ creados: n, junta: junta.length });
  });
  r.delete('/api/socios/certificados/:id', `manager:${MOD}`, async (c) => { await c.env.DB.prepare('DELETE FROM ro_certificados WHERE id = ? AND business_id = ?').bind(Number(c.params.id) || 0, c.businessId).run(); return json({ ok: true }); });
  r.get('/api/socios/certificados/:id', `tenant:${MOD}`, async (c) => {
    const k = await one(c.env, 'SELECT * FROM ro_certificados WHERE id = ? AND business_id = ?', Number(c.params.id) || 0, c.businessId);
    if (!k) throw new HttpError(404, 'Certificado no encontrado');
    const s = await socioOr404(c, k.socio_id);
    if (!manager(c) && s.user_id !== c.session.user_id) throw new HttpError(403, 'Solo puedes ver tus propios certificados');
    return html(await certificadoEspecialHtml(c, s, k));
  });

  r.get('/api/socios/socios/:id/certificado', `tenant:${MOD}`, async (c) => {
    const s = await socioOr404(c, c.params.id);
    if (!manager(c) && s.user_id !== c.session.user_id) throw new HttpError(403, 'Solo puedes ver tu propio certificado');
    return new Response(await certificadoHtml(c, s), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  });

  r.post('/api/socios/socios/:id/acceso', `manager:${MOD}`, async (c) => {
    const s = await socioOr404(c, c.params.id);
    if (!s.email) throw new HttpError(400, 'El socio necesita un correo para entrar a la app');
    const d = db(c.env);
    let user = await d.first('SELECT id FROM users WHERE email = ?', s.email.toLowerCase());
    if (!user) { user = { id: uuid() }; await d.run('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', user.id, s.email.toLowerCase(), s.nombre); }
    if (!(await d.first('SELECT 1 FROM memberships WHERE business_id = ? AND user_id = ?', c.businessId, user.id))) await d.run("INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, 'staff')", user.id, c.businessId);
    const otro = await one(c.env, 'SELECT id FROM ro_socios WHERE business_id = ? AND user_id = ? AND id <> ?', c.businessId, user.id, s.id);
    if (otro) throw new HttpError(409, 'Ese usuario ya está enlazado a otra ficha de socio');
    await c.env.DB.prepare('UPDATE ro_socios SET user_id = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(user.id, Date.now(), s.id, c.businessId).run();
    await audit(c, `Dio acceso a la app a ${s.nombre}`, { modulo: MOD });
    return json({ invite_url: new URL(invitePath(await createInvite(c.env, user.id)), c.url.origin).toString() });
  });

  // Firma: la presidencia/junta o el propio socio de la junta; se ve con cualquier sesión del negocio (va en los certificados)
  const puedeFirma = (c, s) => { if (!manager(c) && s.user_id !== c.session.user_id) throw new HttpError(403, 'Solo puedes cambiar tu propia firma'); };
  r.post('/api/socios/socios/:id/firma', `tenant:${MOD}`, async (c) => { const s = await socioOr404(c, c.params.id); puedeFirma(c, s); return json(await subirFirma(c, s)); });
  r.delete('/api/socios/socios/:id/firma', `tenant:${MOD}`, async (c) => { const s = await socioOr404(c, c.params.id); puedeFirma(c, s); return json(await quitarFirma(c, s)); });
  r.get('/api/socios/firma/:id', 'tenant', async (c) => {
    const s = await socioOr404(c, c.params.id);
    return servirArchivo(c, { key: s.firma_key, mime: s.firma_key?.endsWith('.png') ? 'image/png' : s.firma_key?.endsWith('.webp') ? 'image/webp' : 'image/jpeg', nombre: 'firma' });
  });

  // Foto: la junta o el propio socio
  r.post('/api/socios/socios/:id/foto', `tenant:${MOD}`, async (c) => {
    const s = await socioOr404(c, c.params.id);
    if (!manager(c) && s.user_id !== c.session.user_id) throw new HttpError(403, 'Solo puedes cambiar tu propia foto');
    return json(await subirFoto(c, s));
  });
  // La foto se ve con cualquier sesión del negocio (carnet, Lo tuyo, tarjetas)
  r.get('/api/socios/foto/:id', 'tenant', async (c) => {
    const s = await socioOr404(c, c.params.id);
    if (s.foto_key) {
      const obj = c.env.FILES ? await c.env.FILES.get(s.foto_key) : null;
      if (!obj) throw new HttpError(404, 'Sin foto');
      return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=600', 'x-content-type-options': 'nosniff' } });
    }
    if (s.foto_url && /^https:\/\//.test(s.foto_url)) return Response.redirect(s.foto_url, 302);
    throw new HttpError(404, 'Sin foto');
  });
}

export async function subirFoto(c, s) {
  const f = await guardarArchivo(c, 'socios', { max: 4 * 1024 * 1024 });
  if (!f.mime.startsWith('image/')) { await borrarArchivo(c.env, f.key); throw new HttpError(400, 'La foto debe ser una imagen'); }
  await c.env.DB.prepare('UPDATE ro_socios SET foto_key = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(f.key, Date.now(), s.id, c.businessId).run();
  await borrarArchivo(c.env, s.foto_key);
  return { foto: `/api/socios/foto/${s.id}?v=${Date.now()}` };
}

// Firma (imagen PNG/JPG, máx. 1 MB) de un socio de la junta para los certificados
export async function subirFirma(c, s) {
  if (cargoOrden(s.cargo) >= 99) throw new HttpError(400, 'Solo la junta firma los certificados');
  const f = await guardarArchivo(c, 'firmas', { max: 1024 * 1024 });
  if (!f.mime.startsWith('image/')) { await borrarArchivo(c.env, f.key); throw new HttpError(400, 'La firma debe ser una imagen'); }
  await c.env.DB.prepare('UPDATE ro_socios SET firma_key = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(f.key, Date.now(), s.id, c.businessId).run();
  await borrarArchivo(c.env, s.firma_key);
  await audit(c, `Actualizó la firma de ${s.nombre}`, { modulo: MOD });
  return { ok: true };
}
export async function quitarFirma(c, s) {
  await c.env.DB.prepare('UPDATE ro_socios SET firma_key = NULL, updated_at = ? WHERE id = ? AND business_id = ?').bind(Date.now(), s.id, c.businessId).run();
  await borrarArchivo(c.env, s.firma_key);
  return { ok: true };
}

export { socioDeSesion };
