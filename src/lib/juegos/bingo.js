// Bingo: cada jugador recibe su cartón de 5 × 5 (centro libre). Quien creó la sala canta las balotas una por una.
// Dos modos: números (las 75 balotas clásicas B-I-N-G-O) o palabras (casillas del banco del club: Bingo rotario).
// El servidor revisa los cantos contra lo que ya salió: no depende de las marcas del celular (si alguien se desconecta y
// vuelve, su cartón y sus marcas siguen ahí). Primera línea = 10 puntos; cartón lleno = 25 y termina. Canto falso = −2.
import { barajar, exigir, base, nombreDe, sumar, lider } from './comun.js';

const LIBRE = 12;
const LINEAS = [
  ...[0, 1, 2, 3, 4].map((f) => [0, 1, 2, 3, 4].map((c) => f * 5 + c)),   // filas
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((f) => f * 5 + c)),   // columnas
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],                                 // diagonales
];
const rango = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function cartonNumeros() {
  // Columna B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75 (5 de cada una, en orden de filas)
  const cols = [0, 1, 2, 3, 4].map((k) => barajar(rango(k * 15 + 1, k * 15 + 15)).slice(0, 5).sort((x, y) => x - y));
  const c = []; for (let f = 0; f < 5; f++) for (let k = 0; k < 5; k++) c.push(cols[k][f]);
  c[LIBRE] = null; return c;
}
function cartonPalabras(pool) { const c = barajar(pool).slice(0, 24); c.splice(LIBRE, 0, null); return c; }

const salio = (st, v) => v === null || st.cantadas.includes(v);
const lineaCompleta = (st, carton) => LINEAS.some((l) => l.every((i) => salio(st, carton[i])));
const lleno = (st, carton) => carton.every((v) => salio(st, v));

export const bingo = {
  id: 'bingo', nombre: 'Bingo', emoji: '🎱', min: 2, max: 40, duracion: '15-25 min', espectadores: true,
  resumen: 'Cada quien con su cartón; quien creó la sala canta las balotas. ¡Línea y Bingo!',
  como: 'Cada jugador recibe un cartón distinto en su celular. Quien creó la sala canta las balotas (números del 1 al 75, o palabras del club en el Bingo rotario). Toca las casillas que van saliendo para marcarlas. Cuando completes una fila, columna o diagonal, pulsa «¡Línea!» (la primera vale 10 puntos). Cuando completes todo el cartón, pulsa «¡Bingo!» (25 puntos) y se acaba la partida. Si cantas sin tenerla, pierdes 2 puntos.',
  iniciar(ctx) {
    const pool = [...new Set((ctx.opciones?.casillas || []).map((x) => String(x).trim()).filter(Boolean))];
    const modo = ctx.opciones?.modo === 'palabras' && pool.length >= 24 ? 'palabras' : 'numeros';
    const st = base(ctx, { fase: 'jugando', modo, cantadas: [], linea: null, aviso: null });
    st.bolsa = modo === 'numeros' ? barajar(rango(1, 75)) : barajar(pool);
    st.total = st.bolsa.length;
    st.cartones = Object.fromEntries(st.jugadores.map((p) => [p.id, modo === 'numeros' ? cartonNumeros() : cartonPalabras(pool)]));
    st.marcas = Object.fromEntries(st.jugadores.map((p) => [p.id, [LIBRE]]));
    return st;
  },
  accion(st, j, tipo, d, { anfitrion }) {
    exigir(st.fase === 'jugando', 'La partida terminó');
    const carton = st.cartones[j];
    if (tipo === 'cantar') {
      exigir(anfitrion, 'Solo quien creó la sala canta las balotas');
      if (!st.bolsa.length) { const g = lider(st); st.fase = 'fin'; st.fin = { ganador: g.id, texto: `Se acabaron las balotas. Ganó ${g.nombre}` }; return; }
      st.cantadas.push(st.bolsa.shift()); st.aviso = null; return;
    }
    if (tipo === 'marcar') {
      const i = Number(d.i); exigir(Number.isInteger(i) && i >= 0 && i < 25 && i !== LIBRE, 'Casilla no válida');
      exigir(salio(st, carton[i]), 'Esa casilla todavía no ha salido');
      const m = st.marcas[j]; const k = m.indexOf(i); if (k >= 0) m.splice(k, 1); else m.push(i); return;
    }
    if (tipo === 'linea') {
      exigir(!st.linea, `${nombreDe(st, st.linea?.id)} ya cantó línea: ahora va por el cartón lleno`);
      if (!lineaCompleta(st, carton)) { sumar(st, j, -2); st.aviso = `${nombreDe(st, j)} cantó línea sin tenerla (−2)`; return; }
      st.linea = { id: j, en: st.cantadas.length }; sumar(st, j, 10); st.aviso = `¡Línea de ${nombreDe(st, j)}! (+10)`; return;
    }
    if (tipo === 'bingo') {
      if (!lleno(st, carton)) { sumar(st, j, -2); st.aviso = `${nombreDe(st, j)} cantó bingo sin tenerlo (−2)`; return; }
      sumar(st, j, 25); st.fase = 'fin'; st.fin = { ganador: j, texto: `¡BINGO de ${nombreDe(st, j)}!` }; return;
    }
    exigir(false, 'Jugada no válida');
  },
  vista(st, j) {
    const carton = st.cartones[j] || null;
    return { fase: st.fase, modo: st.modo, cantadas: st.cantadas, ultima: st.cantadas.at(-1) ?? null, quedan: st.bolsa.length, total: st.total,
      linea: st.linea, aviso: st.aviso, carton, marcas: carton ? st.marcas[j] : [],
      tengo_linea: carton ? lineaCompleta(st, carton) : false, tengo_bingo: carton ? lleno(st, carton) : false };
  },
};
