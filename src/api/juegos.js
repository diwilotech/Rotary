// Juegos del club: salas con código de 4 letras; cada socio juega desde su celular. El servidor manda en cada partida
// (reglas, turnos, tiempos y lo secreto de cada quien); el celular consulta cada segundo y medio y solo recibe su vista.
//   GET  /api/juegos/catalogo · GET /api/juegos/salas · POST /api/juegos/salas { juego } · POST /api/juegos/unirse { codigo }
//   GET  /api/juegos/salas/:id?v=N   (si no cambió: { v } sin más)   · POST /api/juegos/salas/:id/iniciar | /accion { tipo, datos } | /salir | /cerrar
//   GET  /api/juegos/ranking?anio=2026
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, today } from '../lib/crud.js';
import { socioDeSesionOError, anioRotarioDe } from '../lib/rotaract.js';
import { JUEGOS } from '../lib/juegos/index.js';

const MOD = 'juegos';
const ahora = () => Date.now();
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const codigo = () => Array.from({ length: 4 }, () => LETRAS[crypto.getRandomValues(new Uint32Array(1))[0] % LETRAS.length]).join('');
const motor = (id) => { const m = JUEGOS[id]; if (!m) throw new HttpError(400, 'Juego no válido'); return m; };

async function salaOr404(c, id) {
  const s = await one(c.env, 'SELECT * FROM ro_juego_salas WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId);
  if (!s) throw new HttpError(404, 'Sala no encontrada');
  return s;
}
const jugadoresDe = (c, salaId) => all(c.env, `SELECT j.socio_id id, j.orden, j.rol, j.puntos, j.activo, s.nombre, CASE WHEN s.foto_key IS NOT NULL OR s.foto_url IS NOT NULL THEN '/api/socios/foto/' || s.id END foto
  FROM ro_juego_jugadores j JOIN ro_socios s ON s.id = j.socio_id AND s.business_id = j.business_id WHERE j.sala_id = ? AND j.business_id = ? ORDER BY j.orden`, salaId, c.businessId);

// Guarda el estado con control de versión (dos jugadas al tiempo no se pisan: la segunda se reintenta)
async function guardar(c, s, st) {
  const terminada = st.fase === 'fin';
  const r = await c.env.DB.prepare('UPDATE ro_juego_salas SET datos = ?, version = version + 1, estado = ?, ganador_id = ?, updated_at = ? WHERE id = ? AND version = ?')
    .bind(JSON.stringify(st), terminada ? 'terminada' : 'jugando', terminada ? (st.fin?.ganador ?? null) : null, ahora(), s.id, s.version).run();
  if (!r.meta.changes) return false;
  if (terminada) await c.env.DB.batch(Object.entries(st.puntos || {}).map(([id, p]) => c.env.DB.prepare('UPDATE ro_juego_jugadores SET puntos = ? WHERE sala_id = ? AND socio_id = ?').bind(p, s.id, Number(id))));
  return true;
}
async function vistaSala(c, s, yo) {
  const jug = await jugadoresDe(c, s.id), m = JUEGOS[s.juego], st = s.datos ? JSON.parse(s.datos) : null;
  const mio = jug.find((x) => x.id === yo.id);
  return { v: s.version, sala: { id: s.id, codigo: s.codigo, juego: s.juego, estado: s.estado, anfitrion_id: s.anfitrion_id }, yo: yo.id, rol: mio?.rol || null,
    jugadores: jug, juego: st ? m.vista(st, mio?.rol === 'jugador' ? yo.id : null) : null, puntos: st?.puntos || {}, fin: st?.fin || null, ahora: ahora() };
}

export function routes(r) {
  r.get('/api/juegos/catalogo', `tenant:${MOD}`, async () => json({ rows: Object.values(JUEGOS).map(({ id, nombre, emoji, resumen, como, min, max, duracion, espectadores }) => ({ id, nombre, emoji, resumen, como, min, max, duracion, espectadores })) }));

  r.get('/api/juegos/salas', `tenant:${MOD}`, async (c) => {
    const abiertas = await all(c.env, `SELECT s.id, s.codigo, s.juego, s.estado, s.anfitrion_id, a.nombre anfitrion, (SELECT COUNT(*) FROM ro_juego_jugadores j WHERE j.sala_id = s.id AND j.rol = 'jugador' AND j.activo = 1) jugadores
      FROM ro_juego_salas s LEFT JOIN ro_socios a ON a.id = s.anfitrion_id AND a.business_id = s.business_id WHERE s.business_id = ? AND s.estado <> 'terminada' AND s.updated_at > ? ORDER BY s.updated_at DESC LIMIT 30`, c.businessId, ahora() - 6 * 3600000);
    const recientes = await all(c.env, `SELECT s.id, s.juego, s.updated_at, g.nombre ganador FROM ro_juego_salas s LEFT JOIN ro_socios g ON g.id = s.ganador_id AND g.business_id = s.business_id
      WHERE s.business_id = ? AND s.estado = 'terminada' ORDER BY s.updated_at DESC LIMIT 10`, c.businessId);
    return json({ abiertas, recientes });
  });

  r.post('/api/juegos/salas', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c), m = motor((await readJson(c.req)).juego), t = ahora();
    for (let intento = 0; intento < 5; intento++) {
      try {
        const x = await c.env.DB.prepare('INSERT INTO ro_juego_salas (business_id, codigo, juego, anfitrion_id, estado, version, created_at, updated_at) VALUES (?, ?, ?, ?, \'espera\', 1, ?, ?)')
          .bind(c.businessId, codigo(), m.id, yo.id, t, t).run();
        const id = x.meta.last_row_id;
        await c.env.DB.prepare('INSERT INTO ro_juego_jugadores (business_id, sala_id, socio_id, orden, rol, entro_at) VALUES (?, ?, ?, 0, \'jugador\', ?)').bind(c.businessId, id, yo.id, t).run();
        return json(await vistaSala(c, await salaOr404(c, id), yo), 201);
      } catch (e) { if (!/UNIQUE/i.test(e.message)) throw e; }
    }
    throw new HttpError(500, 'No se pudo crear la sala, intenta de nuevo');
  });

  r.post('/api/juegos/unirse', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c), cod = String((await readJson(c.req)).codigo || '').trim().toUpperCase();
    const s = await one(c.env, "SELECT * FROM ro_juego_salas WHERE business_id = ? AND codigo = ? AND estado <> 'terminada'", c.businessId, cod);
    if (!s) throw new HttpError(404, 'No hay una sala abierta con ese código');
    const ya = await one(c.env, 'SELECT rol FROM ro_juego_jugadores WHERE sala_id = ? AND socio_id = ?', s.id, yo.id);
    if (ya) { await c.env.DB.prepare('UPDATE ro_juego_jugadores SET activo = 1 WHERE sala_id = ? AND socio_id = ?').bind(s.id, yo.id).run(); return json(await vistaSala(c, s, yo)); }
    const m = JUEGOS[s.juego], n = (await one(c.env, "SELECT COUNT(*) n FROM ro_juego_jugadores WHERE sala_id = ? AND rol = 'jugador'", s.id)).n;
    let rol = 'jugador';
    if (s.estado !== 'espera' || n >= m.max) { if (!m.espectadores) throw new HttpError(409, s.estado !== 'espera' ? 'La partida ya empezó' : 'La sala está llena'); rol = 'espectador'; }
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO ro_juego_jugadores (business_id, sala_id, socio_id, orden, rol, entro_at) VALUES (?, ?, ?, ?, ?, ?)').bind(c.businessId, s.id, yo.id, n, rol, ahora()),
      c.env.DB.prepare('UPDATE ro_juego_salas SET version = version + 1, updated_at = ? WHERE id = ?').bind(ahora(), s.id),
    ]);
    return json(await vistaSala(c, await salaOr404(c, s.id), yo));
  });

  r.get('/api/juegos/salas/:id', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c); let s = await salaOr404(c, c.params.id);
    // Tiempo de turno vencido (parqués, rotacartas): se aplica al consultar
    const m = JUEGOS[s.juego];
    if (s.estado === 'jugando' && m.vencido && s.datos) { const st = JSON.parse(s.datos); if (m.vencido(st, ahora()) && (await guardar(c, s, st))) s = await salaOr404(c, s.id); }
    if (Number(c.url.searchParams.get('v')) === s.version) return json({ v: s.version, ahora: ahora() });
    return json(await vistaSala(c, s, yo));
  });

  r.post('/api/juegos/salas/:id/iniciar', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c), s = await salaOr404(c, c.params.id), m = JUEGOS[s.juego];
    if (s.anfitrion_id !== yo.id) throw new HttpError(403, 'Solo quien creó la sala la empieza');
    if (s.estado !== 'espera') throw new HttpError(409, 'La partida ya empezó');
    const jug = (await jugadoresDe(c, s.id)).filter((x) => x.rol === 'jugador' && x.activo);
    if (jug.length < m.min) throw new HttpError(400, `Faltan jugadores: este juego es de ${m.min} a ${m.max}`);
    if (jug.length > m.max) throw new HttpError(400, `Sobran jugadores: este juego es de ${m.min} a ${m.max}`);
    const opciones = {};
    const st = m.iniciar({ jugadores: jug.map((x) => ({ id: x.id, nombre: x.nombre.split(' ')[0] })), opciones });
    if (!(await guardar(c, s, st))) throw new HttpError(409, 'La sala cambió, intenta de nuevo');
    return json(await vistaSala(c, await salaOr404(c, s.id), yo));
  });

  r.post('/api/juegos/salas/:id/accion', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c), b = await readJson(c.req);
    for (let intento = 0; intento < 4; intento++) {
      const s = await salaOr404(c, c.params.id), m = JUEGOS[s.juego];
      if (s.estado !== 'jugando' || !s.datos) throw new HttpError(409, s.estado === 'espera' ? 'La partida aún no empieza' : 'La partida terminó');
      const st = JSON.parse(s.datos);
      if (!st.jugadores.some((p) => p.id === yo.id)) throw new HttpError(403, 'Estás viendo la partida: no juegas en esta sala');
      m.vencido?.(st, ahora());
      try { m.accion(st, yo.id, String(b.tipo || ''), b.datos || {}, { anfitrion: s.anfitrion_id === yo.id }); } catch (e) { throw new HttpError(e.status || 400, e.message); }
      if (await guardar(c, s, st)) return json(await vistaSala(c, await salaOr404(c, s.id), yo));
    }
    throw new HttpError(409, 'Hubo jugadas al mismo tiempo: intenta de nuevo');
  });

  r.post('/api/juegos/salas/:id/salir', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c), s = await salaOr404(c, c.params.id);
    if (s.estado === 'espera') {
      if (s.anfitrion_id === yo.id) await c.env.DB.prepare("UPDATE ro_juego_salas SET estado = 'terminada', version = version + 1, updated_at = ? WHERE id = ?").bind(ahora(), s.id).run();
      else await c.env.DB.batch([c.env.DB.prepare('DELETE FROM ro_juego_jugadores WHERE sala_id = ? AND socio_id = ?').bind(s.id, yo.id), c.env.DB.prepare('UPDATE ro_juego_salas SET version = version + 1, updated_at = ? WHERE id = ?').bind(ahora(), s.id)]);
    } else await c.env.DB.prepare('UPDATE ro_juego_jugadores SET activo = 0 WHERE sala_id = ? AND socio_id = ?').bind(s.id, yo.id).run();
    return json({ ok: true });
  });

  r.post('/api/juegos/salas/:id/cerrar', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c), s = await salaOr404(c, c.params.id);
    if (s.anfitrion_id !== yo.id && !['owner', 'admin'].includes(c.role)) throw new HttpError(403, 'Solo quien creó la sala la cierra');
    await c.env.DB.prepare("UPDATE ro_juego_salas SET estado = 'terminada', version = version + 1, updated_at = ? WHERE id = ?").bind(ahora(), s.id).run();
    return json({ ok: true });
  });

  // Ranking del año rotario: puntos y partidas ganadas por socio
  r.get('/api/juegos/ranking', `tenant:${MOD}`, async (c) => {
    const anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    const desde = Date.parse(`${anio}-07-01T05:00:00Z`), hasta = Date.parse(`${anio + 1}-07-01T05:00:00Z`);
    const rows = await all(c.env, `SELECT j.socio_id id, so.nombre, COUNT(*) partidas, SUM(CASE WHEN s.ganador_id = j.socio_id THEN 1 ELSE 0 END) ganadas, SUM(j.puntos) puntos
      FROM ro_juego_jugadores j JOIN ro_juego_salas s ON s.id = j.sala_id JOIN ro_socios so ON so.id = j.socio_id AND so.business_id = j.business_id
      WHERE j.business_id = ? AND j.rol = 'jugador' AND s.estado = 'terminada' AND s.datos IS NOT NULL AND s.updated_at >= ? AND s.updated_at < ?
      GROUP BY j.socio_id ORDER BY ganadas DESC, puntos DESC LIMIT 30`, c.businessId, desde, hasta);
    return json({ anio, nombre: `${anio}-${anio + 1}`, rows });
  });
}
