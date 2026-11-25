// Banco de contenido de los juegos: lo que trae la app (contenido.js) + lo que añaden los socios del club + lo que publica
// el distrito, menos lo que la presidencia apagó (ro_juego_ocultos). Cualquier socio añade; nadie ve quién añadió qué.
// En un reto del distrito se usa solo el banco de la app y el del distrito (igual para todos los clubes, así es justo).
import { all, one } from '../crud.js';
import { distritoDe } from '../rotaract.js';
import { TRIVIA, PALABRAS, FRASES, BINGO } from './contenido.js';

const txt = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const falla = (m) => { const e = new Error(m); e.status = 400; throw e; };
// Clave estable de un ítem (para apagarlo): el texto en minúsculas y sin tildes
const plano = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 180);

// Por juego: cómo se llama lo que se añade, cómo se valida, su texto (para mostrar y buscar) y el banco de la app.
export const TIPOS = {
  trivia: {
    nombre: 'Preguntas', uno: 'pregunta',
    validar(d) {
      const p = txt(d.p, 200), o = (Array.isArray(d.o) ? d.o : []).map((x) => txt(x, 90));
      if (p.length < 8) falla('Escribe la pregunta');
      if (o.length !== 4 || o.some((x) => !x)) falla('Escribe la respuesta correcta y tres incorrectas');
      if (new Set(o.map(plano)).size !== 4) falla('Las cuatro respuestas deben ser distintas');
      return { p: p.endsWith('?') || p.startsWith('¿') ? p : `${p}?`, o, c: 0 };   // la correcta va siempre primero; el juego las baraja
    },
    texto: (d) => d.p, detalle: (d) => `✔ ${d.o[0]} · ✘ ${d.o.slice(1).join(' · ')}`,
    base: () => TRIVIA.map((q) => ({ p: q.p, o: q.o, c: q.c })),
  },
  impostor: {
    nombre: 'Palabras', uno: 'palabra',
    validar(d) {
      const palabra = txt(d.palabra, 40), categoria = txt(d.categoria, 40) || 'Del club';
      if (palabra.length < 2) falla('Escribe la palabra');
      return { categoria, palabra };
    },
    texto: (d) => d.palabra, detalle: (d) => d.categoria,
    base: () => Object.entries(PALABRAS).flatMap(([categoria, ps]) => ps.map((palabra) => ({ categoria, palabra }))),
  },
  probable: {
    nombre: 'Frases', uno: 'frase',
    validar(d) {
      let f = txt(d.frase, 160).replace(/^¿?\s*qui[eé]n es m[aá]s probable que\s*/i, '').replace(/\?+$/, '').trim();
      if (f.length < 4) falla('Completa la frase: «¿Quién es más probable que…?»');
      return { frase: `¿Quién es más probable que ${f}?` };
    },
    texto: (d) => d.frase, detalle: () => '',
    base: () => FRASES.map((frase) => ({ frase })),
  },
  bingo: {
    nombre: 'Casillas', uno: 'casilla',
    validar(d) { const t = txt(d.texto, 40); if (t.length < 2) falla('Escribe la palabra o frase corta de la casilla'); return { texto: t }; },
    texto: (d) => d.texto, detalle: () => '',
    base: () => BINGO.map((texto) => ({ texto })),
  },
};
export const tipoDe = (juego) => TIPOS[juego] || falla('Este juego no tiene preguntas ni palabras para añadir');
const claveBase = (juego, d) => `b:${plano(TIPOS[juego].texto(d))}`;

// Negocio del distrito al que pertenece un club (el que tiene es_distrito = 1 y el mismo código)
export async function negocioDistrito(env, bid) {
  const d = await distritoDe(env, bid);
  if (d.es_distrito) return { id: bid, codigo: d.codigo, soyDistrito: true };
  const x = await one(env, "SELECT k.business_id id FROM ro_club_config k JOIN businesses b ON b.id = k.business_id WHERE k.es_distrito = 1 AND k.distrito = ? AND b.archived_at IS NULL ORDER BY k.rowid DESC LIMIT 1", d.codigo);
  return { id: x?.id || null, codigo: d.codigo, soyDistrito: false };
}

// Todo el banco de un juego con su estado, para la presidencia (sin autor): [{ clave, origen, id?, datos, texto, detalle, activo }]
export async function listar(env, bid, juego) {
  const T = tipoDe(juego), dist = await negocioDistrito(env, bid);
  const [ocultos, propios, delDistrito] = await Promise.all([
    all(env, 'SELECT clave FROM ro_juego_ocultos WHERE business_id = ? AND juego = ?', bid, juego),
    all(env, 'SELECT id, datos, activo FROM ro_juego_contenido WHERE business_id = ? AND juego = ? ORDER BY id DESC', bid, juego),
    dist.id && !dist.soyDistrito ? all(env, 'SELECT id, datos FROM ro_juego_contenido WHERE business_id = ? AND juego = ? AND activo = 1 ORDER BY id DESC', dist.id, juego) : [],
  ]);
  const off = new Set(ocultos.map((x) => x.clave));
  const item = (origen, d, extra) => ({ origen, datos: d, texto: T.texto(d), detalle: T.detalle(d), ...extra });
  return [
    ...propios.map((x) => { const d = JSON.parse(x.datos); return item(dist.soyDistrito ? 'distrito' : 'club', d, { id: x.id, clave: `c:${x.id}`, activo: !!x.activo }); }),
    ...delDistrito.map((x) => { const d = JSON.parse(x.datos); return item('distrito', d, { clave: `d:${x.id}`, activo: !off.has(`d:${x.id}`) }); }),
    ...T.base().map((d) => item('app', d, { clave: claveBase(juego, d), activo: !off.has(claveBase(juego, d)) })),
  ];
}

// Banco activo para una partida (solo los datos). reto = true: sin lo propio del club (reto igual para todos los clubes).
export async function bancoActivo(env, bid, juego, { reto = false } = {}) {
  if (!TIPOS[juego]) return [];
  const dist = await negocioDistrito(env, bid);
  const [ocultos, propios, delDistrito] = await Promise.all([
    all(env, 'SELECT clave FROM ro_juego_ocultos WHERE business_id = ? AND juego = ?', reto && dist.id ? dist.id : bid, juego),
    reto ? [] : all(env, 'SELECT datos FROM ro_juego_contenido WHERE business_id = ? AND juego = ? AND activo = 1', bid, juego),
    dist.id && dist.id !== bid ? all(env, 'SELECT id, datos FROM ro_juego_contenido WHERE business_id = ? AND juego = ? AND activo = 1', dist.id, juego) : [],
  ]);
  const off = new Set(ocultos.map((x) => x.clave));
  return [
    ...propios.map((x) => JSON.parse(x.datos)),
    ...delDistrito.filter((x) => reto || !off.has(`d:${x.id}`)).map((x) => JSON.parse(x.datos)),
    ...TIPOS[juego].base().filter((d) => !off.has(claveBase(juego, d))),
  ];
}

// Opciones de inicio de cada motor a partir del banco
export function opcionesDesde(juego, banco) {
  if (juego === 'trivia') return { preguntas: banco };
  if (juego === 'impostor') { const cats = {}; banco.forEach((x) => { (cats[x.categoria] ||= []).push(x.palabra); }); return { palabras: cats }; }
  if (juego === 'probable') return { frases: banco.map((x) => x.frase) };
  if (juego === 'bingo') return { casillas: banco.map((x) => x.texto) };
  return {};
}
