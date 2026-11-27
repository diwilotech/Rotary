// Juegos del club: salas con código de 4 letras; cada socio juega desde su celular. El servidor manda en cada partida
// (reglas, turnos, tiempos y lo secreto de cada quien); el celular consulta cada segundo y medio y solo recibe su vista.
//   GET  /api/juegos/catalogo · GET /api/juegos/salas · POST /api/juegos/salas { juego } · POST /api/juegos/unirse { codigo }
//   GET  /api/juegos/salas/:id?v=N   (si no cambió: { v } sin más)   · POST /api/juegos/salas/:id/iniciar | /accion { tipo, datos } | /salir | /cerrar
//   GET  /api/juegos/ranking?anio=2026 · GET /api/juegos/ranking-clubes?anio=&reto= · GET /api/juegos/retos
//   Contenido (preguntas, palabras, frases, casillas): GET|POST /api/juegos/contenido · PATCH|DELETE /api/juegos/contenido/:id
//     · PUT /api/juegos/contenido/ocultos { juego, clave, activo }. Cualquier socio añade; la presidencia ve TODO (sin autor),
//     apaga, prende y borra. El distrito tiene lo mismo en /api/distrito/juegos/… y además los retos (ranking entre clubes).
// Conexión: cada consulta del celular marca su «latido» (visto_at). Si quien creó la sala lleva 45 s sin conectarse, la sala
// pasa al primer jugador conectado; al empezar solo cuentan los que están conectados. El celular guarda su sala y vuelve solo.
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, today } from '../lib/crud.js';
import { socioDeSesion, socioDeSesionOError, anioRotarioDe, distritoDe, EN_DISTRITO, enDistrito, conSigla } from '../lib/rotaract.js';
import { JUEGOS } from '../lib/juegos/index.js';
import { TIPOS, tipoDe, listar, bancoActivo, opcionesDesde } from '../lib/juegos/banco.js';

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
const VIVO = 20000, RELEVO = 45000;   // conectado si consultó hace menos de 20 s; relevo del anfitrión a los 45 s
const conectado = (x, t = ahora()) => (x.visto_at || x.entro_at || 0) > t - VIVO;
const jugadoresDe = (c, salaId) => all(c.env, `SELECT j.socio_id id, j.orden, j.rol, j.puntos, j.activo, j.visto_at, j.entro_at, s.nombre, CASE WHEN s.foto_key IS NOT NULL OR s.foto_url IS NOT NULL THEN '/api/socios/foto/' || s.id END foto
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
  const mio = jug.find((x) => x.id === yo.id), t = ahora();
  const reto = s.reto_id ? await one(c.env, 'SELECT id, nombre FROM ro_juego_retos WHERE id = ?', s.reto_id) : null;
  return { v: s.version, sala: { id: s.id, codigo: s.codigo, juego: s.juego, estado: s.estado, anfitrion_id: s.anfitrion_id, reto, opciones: s.opciones ? JSON.parse(s.opciones) : {} }, yo: yo.id, rol: mio?.rol || null,
    jugadores: jug.map(({ visto_at, entro_at, ...x }) => ({ ...x, conectado: x.id === yo.id || conectado({ visto_at, entro_at }, t) })), juego: st ? m.vista(st, mio?.rol === 'jugador' ? yo.id : null) : null, puntos: st?.puntos || {}, fin: st?.fin || null, ahora: ahora() };
}

export function routes(r) {
  r.get('/api/juegos/catalogo', `tenant:${MOD}`, async () => json({ rows: Object.values(JUEGOS).map(({ id, nombre, emoji, resumen, como, min, max, duracion, espectadores }) => ({ id, nombre, emoji, resumen, como, min, max, duracion, espectadores, contenido: TIPOS[id] ? { nombre: TIPOS[id].nombre, uno: TIPOS[id].uno } : null })) }));

  r.get('/api/juegos/salas', `tenant:${MOD}`, async (c) => {
    const abiertas = await all(c.env, `SELECT s.id, s.codigo, s.juego, s.estado, s.anfitrion_id, a.nombre anfitrion, (SELECT COUNT(*) FROM ro_juego_jugadores j WHERE j.sala_id = s.id AND j.rol = 'jugador' AND j.activo = 1) jugadores
      FROM ro_juego_salas s LEFT JOIN ro_socios a ON a.id = s.anfitrion_id AND a.business_id = s.business_id WHERE s.business_id = ? AND s.estado <> 'terminada' AND s.updated_at > ? ORDER BY s.updated_at DESC LIMIT 30`, c.businessId, ahora() - 6 * 3600000);
    const recientes = await all(c.env, `SELECT s.id, s.juego, s.updated_at, g.nombre ganador FROM ro_juego_salas s LEFT JOIN ro_socios g ON g.id = s.ganador_id AND g.business_id = s.business_id
      WHERE s.business_id = ? AND s.estado = 'terminada' ORDER BY s.updated_at DESC LIMIT 10`, c.businessId);
    // La partida en la que estoy jugando (para volver sola si se cerró la app o se cayó la conexión)
    const yo = await socioDeSesion(c).catch(() => null);
    const mia = yo ? await one(c.env, `SELECT s.id, s.codigo, s.juego, s.estado FROM ro_juego_salas s JOIN ro_juego_jugadores j ON j.sala_id = s.id AND j.socio_id = ?
      WHERE s.business_id = ? AND s.estado <> 'terminada' AND j.activo = 1 AND s.updated_at > ? ORDER BY s.updated_at DESC LIMIT 1`, yo.id, c.businessId, ahora() - 6 * 3600000) : null;
    return json({ abiertas, recientes, mia });
  });

  r.post('/api/juegos/salas', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c), b = await readJson(c.req), m = motor(b.juego), t = ahora();
    let reto = null;
    if (b.reto_id) {
      const { clave } = await distritoDe(c.env, c.businessId), hoy = today();
      reto = await one(c.env, 'SELECT * FROM ro_juego_retos WHERE id = ? AND distrito = ? AND activo = 1', Number(b.reto_id) || 0, clave);
      if (!reto) throw new HttpError(404, 'Ese reto del distrito no existe');
      if (reto.desde > hoy || reto.hasta < hoy) throw new HttpError(409, 'Ese reto no está abierto hoy');
      if (reto.juego !== m.id) throw new HttpError(400, 'Ese reto es de otro juego');
    }
    const opciones = m.id === 'bingo' ? JSON.stringify({ modo: b.modo === 'palabras' ? 'palabras' : 'numeros' }) : null;
    for (let intento = 0; intento < 5; intento++) {
      try {
        const x = await c.env.DB.prepare('INSERT INTO ro_juego_salas (business_id, codigo, juego, anfitrion_id, estado, version, reto_id, opciones, created_at, updated_at) VALUES (?, ?, ?, ?, \'espera\', 1, ?, ?, ?, ?)')
          .bind(c.businessId, codigo(), m.id, yo.id, reto?.id || null, opciones, t, t).run();
        const id = x.meta.last_row_id;
        await c.env.DB.prepare('INSERT INTO ro_juego_jugadores (business_id, sala_id, socio_id, orden, rol, entro_at, visto_at) VALUES (?, ?, ?, 0, \'jugador\', ?, ?)').bind(c.businessId, id, yo.id, t, t).run();
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
    if (ya) { await c.env.DB.prepare('UPDATE ro_juego_jugadores SET activo = 1, visto_at = ? WHERE sala_id = ? AND socio_id = ?').bind(ahora(), s.id, yo.id).run(); return json(await vistaSala(c, s, yo)); }
    const m = JUEGOS[s.juego], n = (await one(c.env, "SELECT COUNT(*) n FROM ro_juego_jugadores WHERE sala_id = ? AND rol = 'jugador'", s.id)).n;
    let rol = 'jugador';
    if (s.estado !== 'espera' || n >= m.max) { if (!m.espectadores) throw new HttpError(409, s.estado !== 'espera' ? 'La partida ya empezó' : 'La sala está llena'); rol = 'espectador'; }
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO ro_juego_jugadores (business_id, sala_id, socio_id, orden, rol, entro_at, visto_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(c.businessId, s.id, yo.id, n, rol, ahora(), ahora()),
      c.env.DB.prepare('UPDATE ro_juego_salas SET version = version + 1, updated_at = ? WHERE id = ?').bind(ahora(), s.id),
    ]);
    return json(await vistaSala(c, await salaOr404(c, s.id), yo));
  });

  r.get('/api/juegos/salas/:id', `tenant:${MOD}`, async (c) => {
    const yo = await socioDeSesionOError(c); let s = await salaOr404(c, c.params.id);
    const t = ahora();
    // Latido: este celular sigue conectado (se escribe como máximo cada 8 s por jugador)
    await c.env.DB.prepare('UPDATE ro_juego_jugadores SET visto_at = ?, activo = 1 WHERE sala_id = ? AND socio_id = ? AND (visto_at IS NULL OR visto_at < ?)').bind(t, s.id, yo.id, t - 8000).run();
    // Relevo: si quien creó la sala se desconectó, la sala pasa al primer jugador conectado (si no, nadie podría seguir)
    if (s.estado !== 'terminada') {
      const jug = await all(c.env, "SELECT socio_id id, visto_at, entro_at FROM ro_juego_jugadores WHERE sala_id = ? AND rol = 'jugador' AND activo = 1 ORDER BY orden", s.id);
      const anf = jug.find((x) => x.id === s.anfitrion_id);
      if (!anf || (anf.visto_at || anf.entro_at || 0) < t - RELEVO) {
        const nuevo = jug.find((x) => x.id !== s.anfitrion_id && conectado(x, t));
        if (nuevo) { await c.env.DB.prepare('UPDATE ro_juego_salas SET anfitrion_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND anfitrion_id = ?').bind(nuevo.id, t, s.id, s.anfitrion_id).run(); s = await salaOr404(c, s.id); }
      }
    }
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
    const t = ahora(), jug = (await jugadoresDe(c, s.id)).filter((x) => x.rol === 'jugador' && x.activo && (x.id === yo.id || (x.visto_at || x.entro_at || 0) > t - 60000));
    if (jug.length < m.min) throw new HttpError(400, `Faltan jugadores: este juego es de ${m.min} a ${m.max}`);
    if (jug.length > m.max) throw new HttpError(400, `Sobran jugadores: este juego es de ${m.min} a ${m.max}`);
    // Banco del club (o del reto del distrito) para los juegos con preguntas, palabras, frases o casillas
    const opciones = { ...(s.opciones ? JSON.parse(s.opciones) : {}), ...opcionesDesde(m.id, await bancoActivo(c.env, c.businessId, m.id, { reto: !!s.reto_id })) };
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
  rutasContenido(r);
  rutasRetos(r);
}

/* ---------- Contenido de los juegos: preguntas, palabras, frases y casillas ---------- */
// Club: todos añaden; la presidencia (owner) gestiona. Distrito: su junta añade y gestiona (lo suyo llega a todos sus clubes).
async function esDistritoOError(c) { const d = await distritoDe(c.env, c.businessId); if (!d.es_distrito) throw new HttpError(403, 'Solo el perfil del distrito'); return d; }
function rutasContenido(r) {
  const LADOS = [
    { base: '/api/juegos/contenido', leer: `tenant:${MOD}`, previo: async () => {}, gestiona: (c) => c.role === 'owner' },
    { base: '/api/distrito/juegos/contenido', leer: 'tenant', previo: esDistritoOError, gestiona: (c) => ['owner', 'admin'].includes(c.role) },
  ];
  for (const L of LADOS) {
    const gestorOError = async (c) => { await L.previo(c); if (!L.gestiona(c)) throw new HttpError(403, 'Solo la presidencia puede apagar o borrar'); };
    const deEsteNegocio = async (c) => {
      const x = await one(c.env, 'SELECT * FROM ro_juego_contenido WHERE id = ? AND business_id = ?', Number(c.params.id) || 0, c.businessId);
      if (!x) throw new HttpError(404, 'No encontrado'); return x;
    };
    r.get(L.base, L.leer, async (c) => {
      await L.previo(c);
      const juego = c.url.searchParams.get('juego'), T = tipoDe(juego);
      if (L.gestiona(c)) {
        const items = await listar(c.env, c.businessId, juego);
        return json({ juego, tipo: { nombre: T.nombre, uno: T.uno }, gestiona: true, items: items.map(({ datos, ...x }) => x), activas: items.filter((x) => x.activo).length });
      }
      // Los demás: cuántas hay en juego y las suyas (sin ver las de otros)
      const yo = await socioDeSesion(c).catch(() => null);
      const mias = yo ? await all(c.env, 'SELECT id, datos, activo FROM ro_juego_contenido WHERE business_id = ? AND juego = ? AND socio_id = ? ORDER BY id DESC', c.businessId, juego, yo.id) : [];
      return json({ juego, tipo: { nombre: T.nombre, uno: T.uno }, gestiona: false, activas: (await bancoActivo(c.env, c.businessId, juego)).length,
        mias: mias.map((x) => { const d = JSON.parse(x.datos); return { id: x.id, texto: T.texto(d), detalle: T.detalle(d), activo: !!x.activo }; }) });
    });
    r.post(L.base, L.leer, async (c) => {
      await L.previo(c);
      if (L.base.includes('distrito') && !L.gestiona(c)) throw new HttpError(403, 'Solo la junta del distrito');
      const b = await readJson(c.req), T = tipoDe(b.juego);
      let d; try { d = T.validar(b.datos || {}); } catch (e) { throw new HttpError(400, e.message); }
      const yo = await socioDeSesion(c).catch(() => null), t = ahora();
      const n = (await one(c.env, 'SELECT COUNT(*) n FROM ro_juego_contenido WHERE business_id = ? AND juego = ?', c.businessId, b.juego)).n;
      if (n >= 2000) throw new HttpError(409, 'Este juego ya tiene demasiado contenido propio');
      const x = await c.env.DB.prepare('INSERT INTO ro_juego_contenido (business_id, juego, datos, activo, socio_id, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)')
        .bind(c.businessId, b.juego, JSON.stringify(d), yo?.id || null, t, t).run();
      return json({ id: x.meta.last_row_id, texto: T.texto(d) }, 201);
    });
    r.patch(`${L.base}/:id`, L.leer, async (c) => {
      await gestorOError(c); const x = await deEsteNegocio(c), b = await readJson(c.req);
      await c.env.DB.prepare('UPDATE ro_juego_contenido SET activo = ?, updated_at = ? WHERE id = ?').bind(b.activo ? 1 : 0, ahora(), x.id).run();
      return json({ ok: true });
    });
    r.delete(`${L.base}/:id`, L.leer, async (c) => {
      await gestorOError(c); const x = await deEsteNegocio(c);
      await c.env.DB.prepare('DELETE FROM ro_juego_contenido WHERE id = ?').bind(x.id).run();
      return json({ ok: true });
    });
    // Apagar o prender algo del banco de la app («b:…») o del distrito («d:<id>»)
    r.put(`${L.base}/ocultos`, L.leer, async (c) => {
      await gestorOError(c); const b = await readJson(c.req); tipoDe(b.juego);
      const clave = String(b.clave || '');
      if (!/^(b:.{1,180}|d:\d+)$/.test(clave)) throw new HttpError(400, 'Clave no válida');
      if (b.activo) await c.env.DB.prepare('DELETE FROM ro_juego_ocultos WHERE business_id = ? AND juego = ? AND clave = ?').bind(c.businessId, b.juego, clave).run();
      else await c.env.DB.prepare('INSERT OR IGNORE INTO ro_juego_ocultos (business_id, juego, clave, created_at) VALUES (?, ?, ?, ?)').bind(c.businessId, b.juego, clave, ahora()).run();
      return json({ ok: true });
    });
  }
}

/* ---------- Retos del distrito y ranking entre clubes ---------- */
// El distrito crea retos (un juego en unas fechas). Los clubes juegan salas «del reto» con el banco de la app + el del
// distrito. Al terminar, los puntos de esas partidas suman al club. Ranking: puntos totales, y también partidas, socios
// que jugaron y promedio por socio (para comparar clubes grandes y pequeños). Lee las salas de todos los clubes del distrito.
// Cada reto dice cómo se gana (gana = 'puntos' totales del club o 'promedio' por socio que jugó) y puede tener premio.
async function rankingClubes(c, d, anio, retoId) {
  const desde = `${anio}-07-01`, hasta = `${anio + 1}-07-01`;
  const gana = retoId ? (await one(c.env, 'SELECT gana FROM ro_juego_retos WHERE id = ?', retoId))?.gana || 'puntos' : 'puntos';
  const filtro = retoId ? 'AND r.id = ?' : '';
  const rows = await all(c.env, `SELECT s.business_id id, b.name club, COUNT(DISTINCT s.id) partidas, COUNT(DISTINCT j.socio_id) socios, COALESCE(SUM(j.puntos), 0) puntos
    FROM ro_juego_salas s JOIN ro_juego_retos r ON r.id = s.reto_id AND r.distrito = ? JOIN ro_juego_jugadores j ON j.sala_id = s.id AND j.rol = 'jugador'
    JOIN businesses b ON b.id = s.business_id
    WHERE s.estado = 'terminada' AND s.datos IS NOT NULL AND r.desde >= ? AND r.desde < ? ${filtro} AND s.${EN_DISTRITO}
    GROUP BY s.business_id ORDER BY puntos DESC, partidas DESC`, d.clave, desde, hasta, ...(retoId ? [retoId] : []), ...enDistrito(c.env, d.codigo, d.programa));
  const out = rows.map((x) => ({ ...x, promedio: x.socios ? Math.round((x.puntos / x.socios) * 10) / 10 : 0 }));
  if (gana === 'promedio') out.sort((a, b) => b.promedio - a.promedio || b.puntos - a.puntos);
  return out.map((x, i) => ({ ...x, puesto: i + 1 }));
}
// Mejores jugadores de un reto entre todos los clubes (nombre corto + club)
async function jugadoresReto(c, d, retoId, n = 10) {
  const rows = await all(c.env, `SELECT s.business_id, b.name club, COALESCE(k.programa, 'rotaract') programa, so.nombre, SUM(j.puntos) puntos, COUNT(DISTINCT s.id) partidas
    FROM ro_juego_salas s JOIN ro_juego_retos r ON r.id = s.reto_id AND r.distrito = ? JOIN ro_juego_jugadores j ON j.sala_id = s.id AND j.rol = 'jugador'
    JOIN ro_socios so ON so.id = j.socio_id AND so.business_id = s.business_id JOIN businesses b ON b.id = s.business_id LEFT JOIN ro_club_config k ON k.business_id = s.business_id
    WHERE s.estado = 'terminada' AND s.datos IS NOT NULL AND r.id = ? AND s.${EN_DISTRITO}
    GROUP BY s.business_id, j.socio_id ORDER BY puntos DESC, partidas ASC LIMIT ?`, d.clave, retoId, ...enDistrito(c.env, d.codigo, d.programa), n);
  const corto = (x) => { const p = String(x || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[1][0]}.` : p[0] || 'Socio'; };
  return rows.map((x, i) => ({ puesto: i + 1, nombre: corto(x.nombre), club: conSigla(x.club, x.programa), mio: x.business_id === c.businessId, puntos: x.puntos, partidas: x.partidas }));
}
function rutasRetos(r) {
  const hoyStr = () => today();
  const FECHA = /^\d{4}-\d{2}-\d{2}$/;
  // Club: los retos de su distrito (abiertos, próximos y del año) y el ranking entre clubes
  r.get('/api/juegos/retos', `tenant:${MOD}`, async (c) => {
    const { codigo, clave } = await distritoDe(c.env, c.businessId), anio = anioRotarioDe(hoyStr());
    const dd = await distritoDe(c.env, c.businessId);
    const rows = await all(c.env, 'SELECT id, juego, nombre, descripcion, desde, hasta, premio, gana FROM ro_juego_retos WHERE distrito = ? AND activo = 1 AND hasta >= ? ORDER BY desde', clave, `${anio}-07-01`);
    const h = hoyStr();
    // Cada reto con su tabla: los clubes (y en qué puesto va el mío) y los mejores jugadores del distrito
    const out = await Promise.all(rows.map(async (x) => {
      const rk = x.desde <= h ? await rankingClubes(c, dd, anioRotarioDe(x.desde), x.id) : [];
      return { ...x, abierto: x.desde <= h && x.hasta >= h, clubes: rk.slice(0, 5), mio: rk.find((k) => k.id === c.businessId) || null, total_clubes: rk.length,
        jugadores: x.desde <= h ? await jugadoresReto(c, dd, x.id, 5) : [] };
    }));
    return json({ distrito: codigo, rows: out });
  });
  r.get('/api/juegos/ranking-clubes', `tenant:${MOD}`, async (c) => {
    const dd = await distritoDe(c.env, c.businessId), codigo = dd.codigo, anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    const rows = await rankingClubes(c, dd, anio, Number(c.url.searchParams.get('reto')) || null);
    return json({ anio, nombre: `${anio}-${anio + 1}`, distrito: codigo, mio: c.businessId, rows });
  });
  // Distrito: crea, cambia y quita retos; ve el ranking de sus clubes
  r.get('/api/distrito/juegos/retos', 'tenant', async (c) => {
    const d = await esDistritoOError(c);
    const rows = await all(c.env, `SELECT r.*, (SELECT COUNT(*) FROM ro_juego_salas s WHERE s.reto_id = r.id AND s.estado = 'terminada' AND s.datos IS NOT NULL) partidas
      FROM ro_juego_retos r WHERE r.distrito = ? ORDER BY r.desde DESC`, d.clave);
    return json({ distrito: d.codigo, juegos: Object.values(JUEGOS).map((j) => ({ id: j.id, nombre: j.nombre, emoji: j.emoji })), rows });
  });
  const datosReto = (b) => {
    const x = { juego: String(b.juego || ''), nombre: String(b.nombre || '').trim().slice(0, 120), descripcion: String(b.descripcion || '').trim().slice(0, 600) || null, desde: String(b.desde || ''), hasta: String(b.hasta || ''),
      premio: String(b.premio || '').trim().slice(0, 300) || null, gana: b.gana === 'promedio' ? 'promedio' : 'puntos' };
    if (!JUEGOS[x.juego]) throw new HttpError(400, 'Elige el juego');
    if (!x.nombre) throw new HttpError(400, 'Ponle nombre al reto');
    if (!FECHA.test(x.desde) || !FECHA.test(x.hasta) || x.hasta < x.desde) throw new HttpError(400, 'Revisa las fechas del reto');
    return x;
  };
  r.post('/api/distrito/juegos/retos', 'manager', async (c) => {
    const d = await esDistritoOError(c), x = datosReto(await readJson(c.req)), t = ahora();
    const q = await c.env.DB.prepare('INSERT INTO ro_juego_retos (business_id, distrito, juego, nombre, descripcion, desde, hasta, premio, gana, activo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)')
      .bind(c.businessId, d.clave, x.juego, x.nombre, x.descripcion, x.desde, x.hasta, x.premio, x.gana, t, t).run();
    return json({ id: q.meta.last_row_id }, 201);
  });
  const retoMio = async (c) => { await esDistritoOError(c); const x = await one(c.env, 'SELECT * FROM ro_juego_retos WHERE id = ? AND business_id = ?', Number(c.params.id) || 0, c.businessId); if (!x) throw new HttpError(404, 'Reto no encontrado'); return x; };
  r.patch('/api/distrito/juegos/retos/:id', 'manager', async (c) => {
    const old = await retoMio(c), b = await readJson(c.req);
    const x = datosReto({ ...old, ...b });
    await c.env.DB.prepare('UPDATE ro_juego_retos SET juego = ?, nombre = ?, descripcion = ?, desde = ?, hasta = ?, premio = ?, gana = ?, activo = ?, updated_at = ? WHERE id = ?')
      .bind(x.juego, x.nombre, x.descripcion, x.desde, x.hasta, x.premio, x.gana, b.activo === undefined ? old.activo : (b.activo ? 1 : 0), ahora(), old.id).run();
    return json({ ok: true });
  });
  r.delete('/api/distrito/juegos/retos/:id', 'manager', async (c) => {
    const x = await retoMio(c);
    const n = (await one(c.env, 'SELECT COUNT(*) n FROM ro_juego_salas WHERE reto_id = ?', x.id)).n;
    if (n) throw new HttpError(409, 'Ya hay partidas en este reto: desactívalo en lugar de borrarlo');
    await c.env.DB.prepare('DELETE FROM ro_juego_retos WHERE id = ?').bind(x.id).run();
    return json({ ok: true });
  });
  r.get('/api/distrito/juegos/ranking', 'tenant', async (c) => {
    const d = await esDistritoOError(c), anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    const reto = Number(c.url.searchParams.get('reto')) || null;
    return json({ anio, nombre: `${anio}-${anio + 1}`, distrito: d.codigo, rows: await rankingClubes(c, d, anio, reto), jugadores: reto ? await jugadoresReto(c, d, reto) : [] });
  });
}

