// Enlace de registro de socios: la presidencia o la junta generan un enlace del club y lo comparten (WhatsApp, grupo del club).
// Cada socio abre /unirse/<token>, escribe sus datos y crea su contraseña: queda con usuario y acceso de Socio (staff).
//  · Si su correo ya está en la lista del club (ficha sin usuario), se enlaza a esa ficha; si no, entra como aspirante nuevo.
//  · Si ya tiene cuenta en Diwilo (otro club o el distrito), entra con su contraseña de siempre y se le suma este club.
// Solo guardamos el hash del token; cambiar el enlace invalida el anterior y apagarlo lo deja sin efecto.
//   GET/POST/DELETE /api/socios/registro           (junta) ver · crear o cambiar · apagar el enlace
//   GET  /api/registro/:token                     (público) datos del club para la página
//   POST /api/registro/:token                     (público, con Turnstile) { nombre, email, telefono, documento, fecha_nacimiento, password, consent, adult, turnstile }
import { json, readJson, HttpError } from '../lib/http.js';
import { one, today, cast } from '../lib/crud.js';
import { db, uuid } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { userByEmail, checkPassword, setPassword } from '../lib/auth.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { programa, conSigla } from '../lib/rotaract.js';
import { startSession, POLICY_VERSION } from './auth.js';

const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const nuevoToken = () => [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
const enlace = (c, token) => new URL(`/unirse/${token}`, c.url.origin).toString();

async function clubDelToken(env, token) {
  if (!/^[0-9a-f]{36}$/.test(String(token || ''))) return null;
  return one(env, `SELECT b.id, b.name, b.status, b.archived_at, k.programa, k.es_distrito FROM ro_club_config k JOIN businesses b ON b.id = k.business_id
    WHERE k.registro_hash = ? AND b.archived_at IS NULL AND b.status = 'active'`, await sha(token));
}

export function routes(r) {
  r.get('/api/socios/registro', 'manager:socios', async (c) => {
    const k = await one(c.env, 'SELECT registro_hash, registro_at FROM ro_club_config WHERE business_id = ?', c.businessId);
    return json({ activo: !!k?.registro_hash, desde: k?.registro_at || null });   // el enlace solo se ve al crearlo (guardamos el hash)
  });
  r.post('/api/socios/registro', 'manager:socios', async (c) => {
    if (c.readOnly) throw new HttpError(402, 'El club está en solo lectura');
    const token = nuevoToken(), t = Date.now();
    await c.env.DB.prepare('INSERT INTO ro_club_config (business_id, registro_hash, registro_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET registro_hash = excluded.registro_hash, registro_at = excluded.registro_at, updated_at = excluded.updated_at')
      .bind(c.businessId, await sha(token), t, t).run();
    await audit(c, 'Creó un enlace de registro de socios (el anterior deja de servir)', { modulo: 'socios' });
    return json({ activo: true, desde: t, url: enlace(c, token) });
  });
  r.delete('/api/socios/registro', 'manager:socios', async (c) => {
    await c.env.DB.prepare('UPDATE ro_club_config SET registro_hash = NULL, updated_at = ? WHERE business_id = ?').bind(Date.now(), c.businessId).run();
    await audit(c, 'Apagó el enlace de registro de socios', { modulo: 'socios' });
    return json({ activo: false });
  });

  r.get('/api/registro/:token', 'public', async (c) => {
    const k = await clubDelToken(c.env, c.params.token);
    if (!k) throw new HttpError(404, 'Este enlace de registro ya no sirve. Pide uno nuevo a la junta de tu club.', 'BAD_LINK');
    const p = programa(k.programa);
    return json({ club: conSigla(k.name, p.id), programa: p.id, programa_nombre: p.nombre, menores: p.id === 'interact' });
  });

  r.post('/api/registro/:token', 'public', async (c) => {
    const b = await readJson(c.req);
    await verifyTurnstile(c, b.turnstile);
    const k = await clubDelToken(c.env, c.params.token);
    if (!k) throw new HttpError(404, 'Este enlace de registro ya no sirve. Pide uno nuevo a la junta de tu club.', 'BAD_LINK');
    const nombre = cast('nombre', 'text', b.nombre), mail = cast('email', 'email', b.email);
    if (!nombre || nombre.length < 3) throw new HttpError(400, 'Escribe tu nombre completo');
    if (!mail) throw new HttpError(400, 'Escribe tu correo');
    if (b.consent !== true || b.adult !== true) throw new HttpError(400, 'Para continuar, autoriza el tratamiento de tus datos y confirma la mayoría de edad (o la autorización de tu acudiente)', 'CONSENT');
    const datos = { telefono: cast('telefono', 'text', b.telefono), documento: cast('documento', 'text', b.documento), fecha_nacimiento: b.fecha_nacimiento ? cast('fecha_nacimiento', 'date', b.fecha_nacimiento) : null };
    const d = db(c.env), cx = { ...c, businessId: k.id };

    // La cuenta: si ya existe con contraseña, debe probar que es suya; si no, se crea (o se completa una invitada sin contraseña)
    let user = await userByEmail(c.env, mail);
    if (user?.password_hash) await checkPassword(c.env, user, mail, b.password, c.req);
    else {
      if (!user) { user = { id: uuid() }; await d.run('INSERT INTO users (id, email, name) VALUES (?, ?, ?)', user.id, mail, nombre); }
      await setPassword(c.env, user.id, b.password);
      await d.run(`UPDATE users SET name = COALESCE(name, ?), consent_at = COALESCE(consent_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')), consent_version = COALESCE(consent_version, ?),
        adult_confirmed_at = COALESCE(adult_confirmed_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?`, nombre, POLICY_VERSION, user.id);
    }
    if (!(await d.first('SELECT 1 FROM memberships WHERE business_id = ? AND user_id = ?', k.id, user.id))) await d.run("INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, 'staff')", user.id, k.id);

    // La ficha de socio: la suya si ya estaba (por usuario o por correo); si no, una nueva como aspirante
    if (!k.es_distrito) {
      const t = Date.now();
      const ya = await one(c.env, 'SELECT id FROM ro_socios WHERE business_id = ? AND user_id = ?', k.id, user.id)
        || await one(c.env, 'SELECT id FROM ro_socios WHERE business_id = ? AND lower(email) = ? AND user_id IS NULL ORDER BY id LIMIT 1', k.id, mail);
      if (ya) {
        await c.env.DB.prepare(`UPDATE ro_socios SET user_id = ?, telefono = COALESCE(telefono, ?), documento = COALESCE(documento, ?), fecha_nacimiento = COALESCE(fecha_nacimiento, ?), updated_at = ? WHERE id = ?`)
          .bind(user.id, datos.telefono, datos.documento, datos.fecha_nacimiento, t, ya.id).run();
        await audit(cx, `${nombre} se registró con el enlace del club (ficha existente)`, { modulo: 'socios', origen: 'registro' });
      } else {
        await c.env.DB.prepare(`INSERT INTO ro_socios (business_id, user_id, nombre, email, telefono, documento, fecha_nacimiento, fecha_ingreso, tipo_membresia, estado, notas, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aspirante', 'aspirante', 'Se registró con el enlace del club', ?, ?)`).bind(k.id, user.id, nombre, mail, datos.telefono, datos.documento, datos.fecha_nacimiento, today(), t, t).run();
        await audit(cx, `${nombre} se registró con el enlace del club (nuevo aspirante)`, { modulo: 'socios', origen: 'registro' });
      }
    }
    const res = await startSession(c, user.id);
    // Lo deja dentro de este club aunque tenga otros (el club o el distrito se cambian luego en «Entrar a»)
    const cookie = res.headers.get('set-cookie'), tok = /=([^;]+)/.exec(cookie || '')?.[1];
    if (tok) await d.run('UPDATE sessions SET business_id = ? WHERE id = ?', k.id, await sha(tok));
    return json({ ok: true, club: k.id }, 200, { 'set-cookie': cookie });
  });
}
