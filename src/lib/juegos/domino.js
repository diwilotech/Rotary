// Dominó (doble seis, 2 a 4 jugadores, 7 fichas cada uno). Se pone una ficha que calce con una de las dos puntas; si no hay,
// se roba del pozo y, si el pozo se acabó, se pasa. Gana la mano quien se quede sin fichas y se lleva los puntos que les
// queden a los demás; si se tranca, gana quien menos tenga. La partida es a 100 puntos.
import { barajar, exigir, siguiente, base, nombreDe } from './comun.js';

const META = 100;
const pips = (mano) => mano.reduce((t, [a, b]) => t + a + b, 0);
const juego = () => { const f = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) f.push([a, b]); return barajar(f); };
const puntas = (st) => (st.mesa.length ? [st.mesa[0][0], st.mesa[st.mesa.length - 1][1]] : null);
const calza = (st, [a, b]) => { const p = puntas(st); return !p || [a, b].some((x) => x === p[0] || x === p[1]); };
const puede = (st, id) => st.manos[id].some((f) => calza(st, f));

export const domino = {
  id: 'domino', nombre: 'Dominó', emoji: '🁫', min: 2, max: 4, duracion: '15 a 25 minutos', espectadores: true,
  resumen: 'El de toda la vida, con las fichas en tu celular.',
  como: 'Cada quien ve sus fichas en su propio celular. Por turnos se pone una que calce con alguna de las dos puntas; si no tienes, robas del pozo, y si el pozo se acabó, pasas. Gana la mano quien se quede sin fichas — y se lleva los puntos que les queden a los demás. Si se tranca, gana el que menos tenga.',
  iniciar(ctx) { const st = base(ctx, { mano: 0, meta: META }); domino._mano(st, null); return st; },
  _mano(st, empieza) {
    const f = juego(); st.mano += 1; st.manos = {}; st.jugadores.forEach((p, i) => { st.manos[p.id] = f.slice(i * 7, i * 7 + 7); });
    st.pozo = f.slice(st.jugadores.length * 7); st.mesa = []; st.pases = 0; st.fase = 'jugando'; st.resultado_mano = null;
    if (!empieza) {   // la primera mano la abre quien tenga el doble más alto
      let mejor = -1; for (const p of st.jugadores) for (const [a, b] of st.manos[p.id]) if (a === b && a > mejor) { mejor = a; empieza = p.id; }
      empieza ||= st.jugadores[0].id;
    }
    st.turno = empieza; st.ultimo = `Empieza ${nombreDe(st, empieza)}`;
  },
  _cerrar(st, ganador, tranque) {
    const otros = st.jugadores.filter((p) => p.id !== ganador), gana = otros.reduce((t, p) => t + pips(st.manos[p.id]), 0);
    st.puntos[ganador] = (st.puntos[ganador] || 0) + gana;
    st.resultado_mano = { ganador, puntos: gana, tranque, manos: Object.fromEntries(st.jugadores.map((p) => [p.id, st.manos[p.id]])) };
    if (st.puntos[ganador] >= st.meta) { st.fase = 'fin'; st.fin = { ganador, texto: `${nombreDe(st, ganador)} llegó a ${st.puntos[ganador]} puntos` }; } else st.fase = 'fin_mano';
  },
  accion(st, j, tipo, d, { anfitrion }) {
    if (tipo === 'otra_mano') { exigir(st.fase === 'fin_mano' && (anfitrion || j === st.resultado_mano?.ganador), 'Espera a que siga quien ganó la mano'); domino._mano(st, st.resultado_mano.ganador); return; }
    exigir(st.fase === 'jugando', 'La mano terminó'); exigir(st.turno === j, 'No es tu turno');
    const mano = st.manos[j];
    if (tipo === 'poner') {
      const f = mano[d.f]; exigir(f, 'Esa ficha no está en tu mano'); exigir(calza(st, f), 'Esa ficha no calza');
      const p = puntas(st);
      if (!p) st.mesa.push(f);
      else {
        const lado = d.lado === 'izq' || (d.lado !== 'der' && !(f[0] === p[1] || f[1] === p[1])) ? 'izq' : 'der';
        if (lado === 'izq') { exigir(f[0] === p[0] || f[1] === p[0], 'No calza por ese lado'); st.mesa.unshift(f[1] === p[0] ? [f[0], f[1]] : [f[1], f[0]]); }
        else { exigir(f[0] === p[1] || f[1] === p[1], 'No calza por ese lado'); st.mesa.push(f[0] === p[1] ? [f[0], f[1]] : [f[1], f[0]]); }
      }
      mano.splice(d.f, 1); st.pases = 0; st.ultimo = `${nombreDe(st, j)} puso ${f[0]}|${f[1]}`;
      if (!mano.length) return domino._cerrar(st, j, false);
      st.turno = siguiente(st, j); return;
    }
    if (tipo === 'robar') { exigir(!puede(st, j), 'Tienes una ficha que calza'); exigir(st.pozo.length, 'El pozo se acabó: pasa'); mano.push(st.pozo.pop()); st.ultimo = `${nombreDe(st, j)} robó del pozo`; return; }
    if (tipo === 'pasar') {
      exigir(!puede(st, j) && !st.pozo.length, 'Aún puedes jugar o robar');
      st.pases += 1; st.ultimo = `${nombreDe(st, j)} pasó`;
      if (st.pases >= st.jugadores.length) {   // tranque: gana quien menos puntos tenga en la mano
        const g = st.jugadores.reduce((m, p) => (pips(st.manos[p.id]) < pips(st.manos[m.id]) ? p : m), st.jugadores[0]);
        return domino._cerrar(st, g.id, true);
      }
      st.turno = siguiente(st, j); return;
    }
    exigir(false, 'Jugada no válida');
  },
  vista(st, j) {
    return { fase: st.fase, mano_n: st.mano, meta: st.meta, mesa: st.mesa, puntas: puntas(st), turno: st.turno, pozo: st.pozo.length, ultimo: st.ultimo,
      mi_mano: st.manos[j] || null, puedo: st.manos[j] ? puede(st, j) : false, cuantas: Object.fromEntries(st.jugadores.map((p) => [p.id, st.manos[p.id].length])),
      resultado_mano: st.fase !== 'jugando' ? st.resultado_mano : null };
  },
};
