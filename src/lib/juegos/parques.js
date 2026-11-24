// Parqués (2 a 8, tablero de 4, 6 u 8 puestos con los colores de Rotary). Reglas del juego del club:
// · Se tiran dos dados y con cada dado se mueve una ficha (la eliges tú). Al cielo se llega exacto.
// · De la cárcel se sale con par: 1-1 o 6-6 sacan todas las presas y cualquier otro par saca dos. Sin fichas en juego
//   hay tres intentos para sacar par. Cada par da otra tirada; con tres pares seguidos una ficha en juego va al cielo.
// · Caer donde hay una ficha ajena la manda a la cárcel y da 20 de premio; coronar una ficha da 10. El premio no salta barreras.
// · En los seguros (estrellas) nadie come. Dos fichas del mismo color en una casilla son barrera: no pasa nadie.
// · 20 segundos por jugada: si se acaban, pasa el turno.
// Posición de cada ficha = avance desde su salida: -1 cárcel; 0..SAL−1 pista; SAL..SAL+7 llegada; CIELO al final.
import { azar, exigir, siguiente, base, nombreDe } from './comun.js';

export const COLORES = ['#17458F', '#F7A81B', '#D41367', '#009739', '#901F93', '#FF7600', '#00A2E0', '#54565A'];
const SEG = 17, ENTRA = 5;          // casillas por puesto; la llegada empieza 5 antes de la salida propia
const TIEMPO = 20000;
const dado = () => 1 + azar(6);

function medidas(st) { const L = SEG * st.puestos; return { L, SAL: L - ENTRA, CIELO: L - ENTRA + 9 }; }
const salidaAbs = (st, id) => st.puesto[id] * SEG;
const abs = (st, id, p) => { const { L, SAL } = medidas(st); return p >= 0 && p <= SAL ? (salidaAbs(st, id) + p) % L : null; };
const seguros = (st) => { const s = new Set(); for (let k = 0; k < st.puestos; k++) { s.add(k * SEG); s.add(k * SEG + 12); } return s; };
// Fichas (de todos) en una casilla de la pista
function enCasilla(st, a) { const out = []; for (const p of st.jugadores) st.fichas[p.id].forEach((pos, i) => { if (pos >= 0 && abs(st, p.id, pos) === a) out.push({ id: p.id, i }); }); return out; }
const esBarrera = (st, a) => { const f = enCasilla(st, a); return f.length >= 2 && f.every((x) => x.id === f[0].id); };

// ¿Puede la ficha i de j avanzar n? Devuelve la nueva posición o null.
function destino(st, j, i, n) {
  const { SAL, CIELO } = medidas(st), p = st.fichas[j][i];
  if (p < 0 || p >= CIELO) return null;
  const q = p + n; if (q > CIELO) return null;
  for (let k = p + 1; k <= Math.min(q, SAL); k++) if (esBarrera(st, abs(st, j, k))) return null;   // nadie pasa una barrera
  return q;
}
const movibles = (st, j, n) => st.fichas[j].map((_, i) => (destino(st, j, i, n) !== null ? i : -1)).filter((i) => i >= 0);
const enJuego = (st, j) => { const { CIELO } = medidas(st); return st.fichas[j].filter((p) => p >= 0 && p < CIELO).length; };

function mover(st, j, i, n, premio = false) {
  const { SAL, CIELO } = medidas(st), q = destino(st, j, i, n);
  exigir(q !== null, premio ? 'Esa ficha no puede usar el premio' : 'Esa ficha no puede moverse eso');
  st.fichas[j][i] = q;
  if (q === CIELO) { st.log = `${nombreDe(st, j)} coronó una ficha 👑`; if (st.fichas[j].some((p) => p >= 0 && p < CIELO)) st.premios.push(10); return; }
  if (q <= SAL) {
    const a = abs(st, j, q);
    if (!seguros(st).has(a)) {
      const ajenas = enCasilla(st, a).filter((x) => x.id !== j);
      if (ajenas.length) { ajenas.forEach((x) => { st.fichas[x.id][x.i] = -1; }); st.premios.push(20); st.log = `${nombreDe(st, j)} mandó a la cárcel a ${nombreDe(st, ajenas[0].id)}`; return; }
    }
  }
  st.log = `${nombreDe(st, j)} movió ${n}`;
}
function sacar(st, j, cuantas) {
  let n = 0; const a = salidaAbs(st, j);
  for (let i = 0; i < 4 && n < cuantas; i++) if (st.fichas[j][i] === -1) { st.fichas[j][i] = 0; n++; }
  // salir come a las ajenas que estén en la salida
  const ajenas = enCasilla(st, a).filter((x) => x.id !== j); ajenas.forEach((x) => { st.fichas[x.id][x.i] = -1; });
  return n;
}
function pasar(st) {
  const j = st.turno; st.turno = siguiente(st, j); st.fase = 'tirar'; st.dados = null; st.pendientes = []; st.premios = []; st.pares = 0; st.intentos = 0; st.tres = false;
  st.deadline = Date.now() + TIEMPO;
}
function fin(st, j) { const { CIELO } = medidas(st); if (st.fichas[j].every((p) => p === CIELO)) { st.fase = 'fin'; st.fin = { ganador: j, texto: `${nombreDe(st, j)} metió sus cuatro fichas al cielo` }; return true; } return false; }
// Tras cada jugada: ¿le queda algo por mover? si no, vuelve a tirar (par) o pasa
function seguir(st) {
  const j = st.turno;
  if (fin(st, j)) return;
  const usar = [...st.pendientes, ...st.premios];
  if (usar.some((n) => movibles(st, j, n).length)) { st.fase = 'mover'; return; }
  st.pendientes = []; st.premios = [];
  if (st.dados && st.dados[0] === st.dados[1] && !st.tres) { st.fase = 'tirar'; st.deadline = Date.now() + TIEMPO; return; }
  pasar(st);
}

export const parques = {
  id: 'parques', nombre: 'Parqués', emoji: '🎲', min: 2, max: 8, duracion: '30 a 50 minutos', espectadores: true,
  resumen: 'El de la casa, para 4, 6 u 8 — cada quien con su color de Rotary.',
  como: 'Tiras dos dados y les das la vuelta al tablero a tus cuatro fichas hasta meterlas al cielo, en el centro. De la cárcel se sale con par, y las fichas salen solas: 1-1 o 6-6 sacan todas las presas y cualquier otro par saca dos. Sin fichas en juego tienes tres intentos para sacar par. Cada par da otra tirada, y con tres pares seguidos una de tus fichas en juego se va directo al cielo: la eliges tú. Decides qué ficha mueves con cada dado. Si caes donde hay una ficha ajena la mandas a la cárcel y avanzas 20 de premio; coronar una ficha le da 10 a otra. Al cielo se llega exacto, y el premio no salta barreras. En los seguros (las estrellas) nadie te puede comer. Dos fichas de un mismo color en una casilla hacen barrera: por ahí no pasa nadie, ni quien la puso. Hay 20 segundos por jugada: si se acaban, pasa el turno. Gana quien meta sus cuatro primero.',
  iniciar(ctx) {
    const n = ctx.jugadores.length, puestos = n <= 4 ? 4 : n <= 6 ? 6 : 8;
    const st = base(ctx, { puestos, fase: 'tirar', dados: null, pendientes: [], premios: [], pares: 0, intentos: 0, tres: false, log: '¡A jugar!' });
    // los puestos se reparten parejos alrededor del tablero
    st.puesto = Object.fromEntries(st.jugadores.map((p, i) => [p.id, Math.floor((i * puestos) / n)]));
    st.color = Object.fromEntries(st.jugadores.map((p) => [p.id, COLORES[st.puesto[p.id]]]));
    st.fichas = Object.fromEntries(st.jugadores.map((p) => [p.id, [-1, -1, -1, -1]]));
    st.turno = st.jugadores[azar(n)].id; st.deadline = Date.now() + TIEMPO;
    return st;
  },
  accion(st, j, tipo, d) {
    exigir(st.fase !== 'fin', 'La partida terminó'); exigir(st.turno === j, 'No es tu turno');
    if (tipo === 'tirar') {
      exigir(st.fase === 'tirar', 'Primero mueve tus fichas');
      const a = dado(), b = dado(); st.dados = [a, b]; st.deadline = Date.now() + TIEMPO; st.premios = [];
      const par = a === b, presas = st.fichas[j].filter((p) => p === -1).length;
      if (par) st.pares += 1;
      if (par && st.pares >= 3 && enJuego(st, j)) { st.tres = true; st.fase = 'al_cielo'; st.pendientes = []; st.log = `${nombreDe(st, j)} sacó tres pares: ¡una ficha al cielo!`; return; }
      if (!enJuego(st, j)) {   // todo en la cárcel: tres intentos para sacar par
        if (par) { const s = sacar(st, j, a === 1 || a === 6 ? 4 : 2); st.log = `${nombreDe(st, j)} sacó ${s} de la cárcel`; st.pendientes = []; st.fase = 'tirar'; return; }
        st.intentos += 1; st.log = `${nombreDe(st, j)} no sacó par (${st.intentos}/3)`;
        if (st.intentos >= 3) pasar(st); else st.fase = 'tirar';
        return;
      }
      if (par && presas) { const s = sacar(st, j, a === 1 || a === 6 ? 4 : 2); st.log = `${nombreDe(st, j)} sacó ${s} de la cárcel y vuelve a tirar`; st.pendientes = []; st.fase = 'tirar'; return; }
      st.pendientes = [a, b]; st.log = `${nombreDe(st, j)} sacó ${a} y ${b}`; seguir(st); return;
    }
    if (tipo === 'mover') {
      exigir(st.fase === 'mover', 'Primero tira los dados');
      const premio = d.premio !== undefined, lista = premio ? st.premios : st.pendientes, k = premio ? d.premio : d.dado;
      exigir(Number.isInteger(k) && lista[k] !== undefined, 'Elige un dado'); exigir(Number.isInteger(d.f) && d.f >= 0 && d.f < 4, 'Elige una ficha');
      const n = lista[k]; mover(st, j, d.f, n, premio); lista.splice(k, 1); st.deadline = Date.now() + TIEMPO;
      seguir(st); return;
    }
    if (tipo === 'al_cielo') {
      exigir(st.fase === 'al_cielo', 'No toca'); const { CIELO } = medidas(st), p = st.fichas[j][d.f];
      exigir(p >= 0 && p < CIELO, 'Elige una ficha que esté en juego'); st.fichas[j][d.f] = CIELO; st.log = `${nombreDe(st, j)} mandó una ficha directo al cielo`;
      if (!fin(st, j)) pasar(st); return;
    }
    if (tipo === 'pasar') { exigir(st.fase === 'mover', 'No toca'); pasar(st); return; }
    exigir(false, 'Jugada no válida');
  },
  vencido(st, ahora) {
    if (st.fase === 'fin' || !st.deadline || ahora < st.deadline) return false;
    st.log = `Se acabó el tiempo de ${nombreDe(st, st.turno)}`; pasar(st); return true;
  },
  vista(st, j) {
    const m = medidas(st);
    return { fase: st.fase, puestos: st.puestos, L: m.L, SAL: m.SAL, CIELO: m.CIELO, SEG, seguros: [...seguros(st)], puesto: st.puesto, color: st.color, fichas: st.fichas,
      turno: st.turno, dados: st.dados, pendientes: st.pendientes, premios: st.premios, log: st.log, deadline: st.deadline, intentos: st.intentos,
      // qué fichas puede mover el jugador con cada dado (para resaltarlas)
      opciones: st.turno === j && st.fase === 'mover' ? { dados: st.pendientes.map((n) => movibles(st, j, n)), premios: st.premios.map((n) => movibles(st, j, n)) } : null };
  },
};
