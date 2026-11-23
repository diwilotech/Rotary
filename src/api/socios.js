// Socios: la junta (con su cargo, en el orden oficial) y los demás socios. Ficha 360, foto, acceso a la app
// y activación con su certificado.
//   CRUD /api/socios/socios                     (crear/editar: junta; el personal ve el directorio sin datos privados)
//   GET  /api/socios/socios/:id/ficha           ficha 360 (asistencia, tareas, cuotas)
//   POST /api/socios/socios/:id/activar         activa al socio y genera su certificado (código único)
//   GET  /api/socios/socios/:id/certificado     certificado de activación (HTML para imprimir / guardar PDF)
//   POST /api/socios/socios/:id/acceso          invita al socio a la app (rol Socio) → { invite_url }
//   POST /api/socios/socios/:id/foto            sube la foto (cuerpo = imagen)   ·   GET /api/socios/foto/:id
//   GET  /api/socios/resumen
import { json, HttpError } from '../lib/http.js';
import { crud, all, one, today } from '../lib/crud.js';
import { createInvite, invitePath } from '../lib/auth.js';
import { db, uuid } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { guardarArchivo, borrarArchivo } from '../lib/archivos.js';
import { cargoOrden, cartera, certificadoHtml, socioDeSesion } from '../lib/rotaract.js';

const MOD = 'socios';
export const TIPOS = ['socio', 'socio_externo', 'voluntario_invitado', 'aspirante', 'honorario'];
export const ESTADOS = ['activo', 'aspirante', 'inactivo', 'retirado'];
const PRIVADOS = ['documento', 'telefono', 'email', 'fecha_nacimiento', 'notas'];
const manager = (c) => ['owner', 'admin'].includes(c.role);

const fotoDe = (s) => (s.foto_key || s.foto_url ? `/api/socios/foto/${s.id}` : null);
export const publico = (c, s) => {
  const out = { ...s, foto: fotoDe(s), orden_cargo: cargoOrden(s.cargo), junta: cargoOrden(s.cargo) < 99, activado: !!s.activado_at };
  delete out.foto_key; delete out.origen_id;
  if (!manager(c) && s.user_id !== c.session?.user_id) for (const k of PRIVADOS) delete out[k];
  return out;
};

export const ENTITIES = {
  socios: { table: 'ro_socios', label: 'el socio', title: 'nombre', search: ['nombre', 'email', 'cargo', 'profesion'], crear: 'manager',
    order: "CASE estado WHEN 'activo' THEN 0 WHEN 'aspirante' THEN 1 WHEN 'inactivo' THEN 2 ELSE 3 END, nombre",
    fields: { nombre: 'text!', email: 'email', telefono: 'text', documento: 'text', fecha_nacimiento: 'date', profesion: 'text', instagram: 'text',
      fecha_ingreso: 'date', tipo_membresia: TIPOS, estado: ESTADOS, cargo: 'text', cargo_desde: 'date', paga_cuota: 'bool+', notas: 'long' },
    async beforeCreate(c, row) {
      if (row.email && await one(c.env, 'SELECT 1 FROM ro_socios WHERE business_id = ? AND lower(email) = ?', c.businessId, row.email)) throw new HttpError(409, 'Ya hay un socio con ese correo');
      if (row.cargo && !row.cargo_desde) row.cargo_desde = today();
    },
    beforeUpdate(c, row, before) { if ('cargo' in row && row.cargo !== before.cargo) row.cargo_desde = row.cargo ? today() : null; },
    async beforeDelete(c, before) {
      const n = await one(c.env, 'SELECT (SELECT COUNT(*) FROM ro_pagos WHERE business_id = ?1 AND socio_id = ?2) + (SELECT COUNT(*) FROM ro_asistencia WHERE business_id = ?1 AND socio_id = ?2) n', c.businessId, before.id);
      if (n.n) throw new HttpError(409, 'El socio tiene pagos o asistencias: márcalo como retirado en vez de borrarlo');
      await borrarArchivo(c.env, before.foto_key);
    },
    decorate: (c, rows) => rows.map((s) => publico(c, s)).sort((a, b) => a.orden_cargo - b.orden_cargo || 0) },
};

async function socioOr404(c, id) {
  const s = await one(c.env, 'SELECT * FROM ro_socios WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId);
  if (!s) throw new HttpError(404, 'Socio no encontrado');
  return s;
}

export async function activar(c, s) {
  if (s.activado_at) return { ya: true, activado_at: s.activado_at, codigo: s.activacion_codigo };
  const codigo = `RTC-${uuid().replace(/-/g, '').slice(0, 8).toUpperCase()}`, hoy = today();
  await c.env.DB.prepare("UPDATE ro_socios SET activado_at = ?, activacion_codigo = ?, activado_por = ?, estado = 'activo', updated_at = ? WHERE id = ? AND business_id = ?")
    .bind(hoy, codigo, c.session.user_id, Date.now(), s.id, c.businessId).run();
  await audit(c, `Activó a ${s.nombre} (certificado ${codigo})`, { modulo: MOD });
  return { ya: false, activado_at: hoy, codigo };
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

  r.post('/api/socios/socios/:id/activar', `manager:${MOD}`, async (c) => json(await activar(c, await socioOr404(c, c.params.id))));

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

export { socioDeSesion };
