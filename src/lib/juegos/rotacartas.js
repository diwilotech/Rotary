// RotaCartas: cartas de colores (azul, oro, arándano y celeste de Rotary) con números, +2, salta, cambio de sentido,
// comodines y ocho poderes del club. Carta legendaria (no siempre está): Paul Harris. 30 s por turno.
// Quien se sale de cartas se lleva los puntos de las manos de los demás; la partida es a 500.
import { azar, barajar, exigir, base, nombreDe } from './comun.js';

const COLORES = ['azul', 'oro', 'arandano', 'celeste'];
const META = 500, TIEMPO = 30000;
// Los ocho poderes del club (cada uno sale dos veces, con color)
export const PODERES = {
  campana: ['🔔', 'Campana', 'Todos los demás roban una carta.'],
  companerismo: ['🤝', 'Compañerismo', 'Cambias tu mano con quien elijas.'],
  donacion: ['🎁', 'Donación', 'Quien elijas roba dos cartas.'],
  rueda: ['⚙️', 'Rueda', 'Todas las manos pasan al jugador siguiente.'],
  servicio: ['🔁', 'Servicio', 'Vuelves a jugar.'],
  macero: ['🛎️', 'Macero', 'El siguiente roba una y pierde el turno.'],
  polioplus: ['💉', 'PolioPlus', 'Descartas todas tus cartas de este color.'],
  interact: ['🎓', 'Interact', 'Le das una carta al azar a quien elijas.'],
};
const CON_OBJETIVO = ['companerismo', 'donacion', 'interact'];
const valor = (c) => (c.t === 'n' ? c.v : c.t === 'ph' ? 75 : ['comodin', 'mas4'].includes(c.t) ? 50 : c.t === 'p' ? 30 : 20);

function mazo(conPaul) {
  const m = []; let k = 0; const add = (c) => m.push({ id: ++k, ...c });
  for (const col of COLORES) {
    add({ t: 'n', c: col, v: 0 }); for (let v = 1; v <= 9; v++) { add({ t: 'n', c: col, v }); add({ t: 'n', c: col, v }); }
    for (const t of ['mas2', 'salta', 'sentido']) { add({ t, c: col }); add({ t, c: col }); }
  }
  for (let i = 0; i < 4; i++) { add({ t: 'comodin' }); add({ t: 'mas4' }); }
  for (const p of Object.keys(PODERES)) for (let i = 0; i < 2; i++) add({ t: 'p', p, c: COLORES[azar(4)] });
  if (conPaul) add({ t: 'ph' });
  return barajar(m);
}
const comodin = (c) => ['comodin', 'mas4', 'ph'].includes(c.t);
function calza(st, c) {
  const top = st.descarte[st.descarte.length - 1];
  if (comodin(c)) return true;
  if (c.c === st.color) return true;
  if (c.t === 'n' && top.t === 'n' && c.v === top.v) return true;
  if (c.t !== 'n' && c.t === top.t && (c.t !== 'p' || c.p === top.p)) return true;
  return false;
}
function robar(st, id, n = 1) {
  for (let i = 0; i < n; i++) {
    if (!st.mazo.length) { const top = st.descarte.pop(); st.mazo = barajar(st.descarte); st.descarte = [top]; }
    if (!st.mazo.length) return;
    st.manos[id].push(st.mazo.pop());
  }
}
const sig = (st, desde, pasos = 1) => { const n = st.jugadores.length, i = st.jugadores.findIndex((p) => p.id === desde); return st.jugadores[(((i + st.dir * pasos) % n) + n) % n].id; };

export const rotacartas = {
  id: 'rotacartas', nombre: 'RotaCartas', emoji: '🃏', min: 2, max: 8, duracion: '20 a 40 minutos', espectadores: true,
  resumen: 'Cartas de colores con ocho poderes inventados por el club.',
  como: 'Te sales de cartas antes que nadie. Pones una que calce en color o en número con la de arriba, y si no tienes, robas una: si esa calza puedes jugarla en el mismo turno, o quedártela y pasar. Cuando alguien queda con una sola carta, la mesa lo anuncia. Si el mazo se acaba, se baraja el descarte. Además de las de siempre (+2, salta, cambia el sentido y comodín) hay ocho poderes del club, cada uno con su símbolo en la carta. Y una carta legendaria, Paul Harris, que no está en todas las partidas: quien la saque elige color y se lleva consigo hasta tres cartas más. Hay 30 segundos por turno: si se acaban, robas y pasa el turno. Quien se sale de cartas se lleva los puntos de las manos de los demás, y la partida la gana quien llegue primero a 500 puntos.',
  iniciar(ctx) { const st = base(ctx, { ronda: 0, meta: META, poderes: PODERES }); rotacartas._ronda(st, ctx.jugadores[azar(ctx.jugadores.length)].id); return st; },
  _ronda(st, empieza) {
    st.ronda += 1; st.mazo = mazo(azar(2) === 0); st.manos = {}; st.dir = 1; st.robo = null; st.fase = 'jugando'; st.resultado = null;
    st.jugadores.forEach((p) => { st.manos[p.id] = st.mazo.splice(-7); });
    let top; do { top = st.mazo.pop(); if (top.t !== 'n') st.mazo.unshift(top); } while (top.t !== 'n');
    st.descarte = [top]; st.color = top.c; st.turno = empieza; st.deadline = Date.now() + TIEMPO; st.log = `Empieza ${nombreDe(st, empieza)}`;
  },
  _cerrarRonda(st, j) {
    const gana = st.jugadores.filter((p) => p.id !== j).reduce((t, p) => t + st.manos[p.id].reduce((s, c) => s + valor(c), 0), 0);
    st.puntos[j] = (st.puntos[j] || 0) + gana; st.resultado = { ganador: j, puntos: gana };
    if (st.puntos[j] >= st.meta) { st.fase = 'fin'; st.fin = { ganador: j, texto: `${nombreDe(st, j)} llegó a ${st.puntos[j]} puntos` }; } else st.fase = 'fin_ronda';
  },
  _pasar(st, j, pasos = 1) { st.turno = sig(st, j, pasos); st.robo = null; st.deadline = Date.now() + TIEMPO; },
  accion(st, j, tipo, d, { anfitrion }) {
    if (tipo === 'otra_ronda') { exigir(st.fase === 'fin_ronda' && (anfitrion || j === st.resultado?.ganador), 'Espera a quien ganó la ronda'); rotacartas._ronda(st, st.resultado.ganador); return; }
    exigir(st.fase === 'jugando', 'La ronda terminó'); exigir(st.turno === j, 'No es tu turno');
    const mano = st.manos[j];
    if (tipo === 'robar') {
      exigir(!st.robo, 'Ya robaste: juega esa carta o pasa');
      robar(st, j, 1); const c = mano[mano.length - 1]; st.log = `${nombreDe(st, j)} robó`;
      if (c && calza(st, c)) { st.robo = c.id; return; }
      rotacartas._pasar(st, j); return;
    }
    if (tipo === 'pasar') { exigir(st.robo, 'Primero roba'); st.log = `${nombreDe(st, j)} pasó`; rotacartas._pasar(st, j); return; }
    if (tipo !== 'jugar') exigir(false, 'Jugada no válida');
    const k = mano.findIndex((c) => c.id === d.id); exigir(k >= 0, 'Esa carta no está en tu mano');
    const c = mano[k]; exigir(!st.robo || st.robo === c.id, 'Solo puedes jugar la carta que robaste'); exigir(calza(st, c), 'Esa carta no calza');
    if (comodin(c)) exigir(COLORES.includes(d.color), 'Elige el color');
    if (c.t === 'p' && CON_OBJETIVO.includes(c.p)) exigir(st.jugadores.some((p) => p.id === d.a && p.id !== j), 'Elige a otra persona');
    mano.splice(k, 1); st.descarte.push(c); st.color = comodin(c) ? d.color : c.c; st.robo = null;
    let pasos = 1, txt = `${nombreDe(st, j)} jugó`;
    const n = st.jugadores.length;
    if (c.t === 'salta') { pasos = 2; txt += ' salta'; }
    else if (c.t === 'sentido') { st.dir *= -1; if (n === 2) pasos = 2; txt += ' cambio de sentido'; }
    else if (c.t === 'mas2') { robar(st, sig(st, j), 2); pasos = 2; txt += ' +2'; }
    else if (c.t === 'mas4') { robar(st, sig(st, j), 4); pasos = 2; txt += ' +4'; }
    else if (c.t === 'ph') {   // Paul Harris: elige color y se lleva hasta tres cartas más
      const ids = (Array.isArray(d.llevar) ? d.llevar : []).slice(0, 3);
      for (const id of ids) { const x = mano.findIndex((y) => y.id === id); if (x >= 0) st.descarte.splice(st.descarte.length - 1, 0, mano.splice(x, 1)[0]); }
      txt += ` la legendaria Paul Harris 🏅${ids.length ? ` y se llevó ${ids.length} más` : ''}`;
    } else if (c.t === 'p') {
      const [emoji, nombre] = PODERES[c.p]; txt += ` ${emoji} ${nombre}`;
      if (c.p === 'campana') st.jugadores.filter((p) => p.id !== j).forEach((p) => robar(st, p.id, 1));
      if (c.p === 'companerismo') { const t = st.manos[d.a]; st.manos[d.a] = st.manos[j]; st.manos[j] = t; }
      if (c.p === 'donacion') robar(st, d.a, 2);
      if (c.p === 'rueda') { const ids = st.jugadores.map((p) => p.id), antes = ids.map((id) => st.manos[id]); ids.forEach((id) => { st.manos[sig(st, id)] = antes[ids.indexOf(id)]; }); }
      if (c.p === 'servicio') pasos = 0;
      if (c.p === 'macero') { robar(st, sig(st, j), 1); pasos = 2; }
      if (c.p === 'polioplus') { const mismas = st.manos[j].filter((y) => y.c === c.c && !comodin(y)); st.manos[j] = st.manos[j].filter((y) => !mismas.includes(y)); st.descarte.splice(st.descarte.length - 1, 0, ...mismas); }
      if (c.p === 'interact' && st.manos[j].length) { const x = azar(st.manos[j].length); st.manos[d.a].push(st.manos[j].splice(x, 1)[0]); }
    }
    st.log = txt;
    if (!st.manos[j].length) return rotacartas._cerrarRonda(st, j);
    rotacartas._pasar(st, j, pasos === 0 ? 0 : pasos);
    if (pasos === 0) st.turno = j;
  },
  vencido(st, ahora) {
    if (st.fase !== 'jugando' || ahora < st.deadline) return false;
    const j = st.turno; if (!st.robo) robar(st, j, 1);
    st.log = `Se acabó el tiempo de ${nombreDe(st, j)}: robó y pasó`; rotacartas._pasar(st, j); return true;
  },
  vista(st, j) {
    return { fase: st.fase, ronda: st.ronda, meta: st.meta, top: st.descarte[st.descarte.length - 1], color: st.color, dir: st.dir, turno: st.turno, deadline: st.deadline, log: st.log,
      mazo: st.mazo.length, mi_mano: st.manos[j] || null, robo: st.turno === j ? st.robo : null, poderes: PODERES,
      cuantas: Object.fromEntries(st.jugadores.map((p) => [p.id, st.manos[p.id].length])),
      una: st.jugadores.filter((p) => st.manos[p.id].length === 1).map((p) => p.id), resultado: st.fase !== 'jugando' ? st.resultado : null };
  },
};
