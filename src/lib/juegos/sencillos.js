// Juegos de ronda: El Impostor, Trivia del club, ¿Quién es más probable?, Triqui y Dos verdades y una mentira.
import { azar, barajar, exigir, sumar, lider, base, nombreDe } from './comun.js';
import { TRIVIA, PALABRAS, FRASES } from './contenido.js';

const todosVotaron = (st, votos, excluir = null) => st.jugadores.filter((p) => p.id !== excluir).every((p) => votos[p.id] !== undefined);
const terminar = (st, texto) => { const g = lider(st); st.fase = 'fin'; st.fin = { ganador: g.id, texto: texto || `Ganó ${g.nombre}` }; };

/* ---------- El Impostor ---------- */
export const impostor = {
  id: 'impostor', nombre: 'El Impostor', emoji: '🕵️', min: 3, max: 12, duracion: '10-15 min', espectadores: false,
  resumen: 'Todos reciben la misma palabra secreta… menos uno.',
  como: 'Cada quien mira su palabra en su propio celular. Por turnos, cada persona dice EN VOZ ALTA una pista de una sola palabra: tiene que probar que la sabe, sin decirla. El impostor no la sabe y tiene que improvisar. Al final todos votan a quién creen que es el impostor.',
  iniciar(ctx) { const st = base(ctx, { rondas: 3, ronda: 0, banco: ctx.opciones?.palabras || null }); impostor._ronda(st); return st; },
  _ronda(st) {
    const P = st.banco && Object.keys(st.banco).length ? st.banco : PALABRAS, cats = Object.keys(P).filter((k) => P[k].length), cat = cats[azar(cats.length)], lista = P[cat];
    st.ronda += 1; st.fase = 'pistas'; st.categoria = cat; st.palabra = lista[azar(lista.length)];
    st.impostor = st.jugadores[azar(st.jugadores.length)].id; st.empieza = st.jugadores[azar(st.jugadores.length)].id; st.votos = {}; st.resultado = null;
  },
  accion(st, j, tipo, d, { anfitrion }) {
    if (tipo === 'a_votar') { exigir(anfitrion && st.fase === 'pistas', 'Solo quien creó la sala pasa a la votación'); st.fase = 'votacion'; return; }
    if (tipo === 'votar') {
      exigir(st.fase === 'votacion', 'Aún no es hora de votar'); exigir(d.a !== j && st.jugadores.some((p) => p.id === d.a), 'Vota por otra persona de la sala');
      st.votos[j] = d.a;
      if (todosVotaron(st, st.votos)) {
        const cuenta = {}; Object.values(st.votos).forEach((v) => { cuenta[v] = (cuenta[v] || 0) + 1; });
        const max = Math.max(...Object.values(cuenta)), mas = Object.keys(cuenta).filter((k) => cuenta[k] === max).map(Number);
        const pillado = mas.length === 1 && mas[0] === st.impostor;
        if (pillado) Object.entries(st.votos).forEach(([v, a]) => { if (a === st.impostor) sumar(st, Number(v), 2); }); else sumar(st, st.impostor, 3);
        st.resultado = { pillado, cuenta }; st.fase = 'revelacion';
      }
      return;
    }
    if (tipo === 'siguiente') { exigir(anfitrion && st.fase === 'revelacion', 'Solo quien creó la sala sigue'); if (st.ronda >= st.rondas) return terminar(st); impostor._ronda(st); return; }
    exigir(false, 'Jugada no válida');
  },
  vista(st, j) {
    const v = { fase: st.fase, ronda: st.ronda, rondas: st.rondas, categoria: st.categoria, empieza: st.empieza, votaron: Object.keys(st.votos).map(Number) };
    if (st.fase === 'pistas' || st.fase === 'votacion') { v.soy_impostor = j === st.impostor; v.palabra = j === st.impostor ? null : st.palabra; v.mi_voto = st.votos[j] ?? null; }
    if (st.fase === 'revelacion' || st.fase === 'fin') Object.assign(v, { palabra: st.palabra, impostor: st.impostor, votos: st.votos, resultado: st.resultado });
    return v;
  },
};

/* ---------- Trivia del club ---------- */
export const trivia = {
  id: 'trivia', nombre: 'Trivia del club', emoji: '🧠', min: 1, max: 20, duracion: '10 min', espectadores: false,
  resumen: 'Preguntas de Rotary, de Rotaract y de nuestro propio club.',
  como: 'Sale una pregunta con cuatro opciones y todos responden desde su celular. Cuando todos contestan se revela la correcta y se suman los puntos: acertar vale 10, y el primero en acertar se lleva 5 de bonificación.',
  iniciar(ctx) {
    const banco = ctx.opciones?.preguntas?.length >= 3 ? ctx.opciones.preguntas : TRIVIA;
    const qs = barajar(banco).slice(0, 10).map((q) => { const orden = barajar([0, 1, 2, 3]); return { p: q.p, o: orden.map((i) => q.o[i]), c: orden.indexOf(q.c) }; });
    return { ...base(ctx), preguntas: qs, i: 0, fase: 'pregunta', resp: {}, t0: Date.now() };
  },
  _revelar(st) {
    const q = st.preguntas[st.i], ok = Object.entries(st.resp).filter(([, r]) => r.o === q.c).sort((a, b) => a[1].t - b[1].t);
    ok.forEach(([id], n) => sumar(st, Number(id), n === 0 ? 15 : 10)); st.primero = ok[0] ? Number(ok[0][0]) : null; st.fase = 'respuesta';
  },
  accion(st, j, tipo, d, { anfitrion }) {
    if (tipo === 'responder') {
      exigir(st.fase === 'pregunta', 'Ya se reveló la respuesta'); exigir(st.resp[j] === undefined, 'Ya respondiste'); exigir([0, 1, 2, 3].includes(d.o), 'Opción no válida');
      st.resp[j] = { o: d.o, t: Date.now() - st.t0 };
      if (todosVotaron(st, st.resp)) trivia._revelar(st);
      return;
    }
    if (tipo === 'revelar') { exigir(anfitrion && st.fase === 'pregunta', 'Solo quien creó la sala revela'); trivia._revelar(st); return; }
    if (tipo === 'siguiente') {
      exigir(anfitrion && st.fase === 'respuesta', 'Solo quien creó la sala sigue');
      if (st.i >= st.preguntas.length - 1) return terminar(st);
      st.i += 1; st.fase = 'pregunta'; st.resp = {}; st.primero = null; st.t0 = Date.now(); return;
    }
    exigir(false, 'Jugada no válida');
  },
  vista(st, j) {
    const q = st.preguntas[st.i], v = { fase: st.fase, n: st.i + 1, total: st.preguntas.length, pregunta: q.p, opciones: q.o, respondieron: Object.keys(st.resp).map(Number), mi_resp: st.resp[j]?.o ?? null };
    if (st.fase !== 'pregunta') Object.assign(v, { correcta: q.c, respuestas: Object.fromEntries(Object.entries(st.resp).map(([k, r]) => [k, r.o])), primero: st.primero });
    return v;
  },
};

/* ---------- ¿Quién es más probable? ---------- */
export const probable = {
  id: 'probable', nombre: '¿Quién es más probable?', emoji: '🤔', min: 3, max: 20, duracion: '10 min', espectadores: false,
  resumen: 'Sale una frase y todos votan a quién del grupo le queda mejor.',
  como: 'Aparece una frase («¿quién es más probable que llegue tarde a la reunión?») y cada quien vota a alguien de la sala — vale votarse uno mismo. Se revelan los votos todos juntos y se ve quién se lo llevó. No hay respuesta correcta: la gracia es el argumento de después.',
  iniciar(ctx) { const F = ctx.opciones?.frases?.length >= 3 ? ctx.opciones.frases : FRASES; return { ...base(ctx), frases: barajar(F).slice(0, 8), i: 0, fase: 'votar', votos: {} }; },
  accion(st, j, tipo, d, { anfitrion }) {
    if (tipo === 'votar') {
      exigir(st.fase === 'votar', 'Ya se revelaron los votos'); exigir(st.jugadores.some((p) => p.id === d.a), 'Vota por alguien de la sala');
      st.votos[j] = d.a;
      if (todosVotaron(st, st.votos)) { Object.values(st.votos).forEach((a) => sumar(st, a, 1)); st.fase = 'resultado'; }
      return;
    }
    if (tipo === 'revelar') { exigir(anfitrion && st.fase === 'votar', 'Solo quien creó la sala revela'); Object.values(st.votos).forEach((a) => sumar(st, a, 1)); st.fase = 'resultado'; return; }
    if (tipo === 'siguiente') {
      exigir(anfitrion && st.fase === 'resultado', 'Solo quien creó la sala sigue');
      if (st.i >= st.frases.length - 1) { st.fase = 'fin'; const g = lider(st); st.fin = { ganador: g.id, texto: `${g.nombre} se llevó más títulos` }; return; }
      st.i += 1; st.fase = 'votar'; st.votos = {}; return;
    }
    exigir(false, 'Jugada no válida');
  },
  vista(st, j) {
    const v = { fase: st.fase, n: st.i + 1, total: st.frases.length, frase: st.frases[st.i], votaron: Object.keys(st.votos).map(Number), mi_voto: st.votos[j] ?? null };
    if (st.fase !== 'votar') v.votos = st.votos;
    return v;
  },
};

/* ---------- Triqui ---------- */
const LINEAS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const triqui = {
  id: 'tictactoe', nombre: 'Triqui', emoji: '⭕', min: 2, max: 2, duracion: '2 min', espectadores: true,
  resumen: 'El duelo de toda la vida, de a dos.',
  como: 'Por turnos, cada quien marca una casilla. Gana quien haga tres en línea.',
  iniciar(ctx) { const st = base(ctx, { partida: 0 }); triqui._nueva(st); return st; },
  _nueva(st) { st.partida += 1; st.tablero = Array(9).fill(null); st.fase = 'jugando'; st.ganador_partida = null; st.turno = st.jugadores[(st.partida + 1) % 2].id; st.marcas = { [st.jugadores[0].id]: 'X', [st.jugadores[1].id]: 'O' }; },
  accion(st, j, tipo, d) {
    if (tipo === 'marcar') {
      exigir(st.fase === 'jugando' && st.turno === j, 'No es tu turno'); exigir(Number.isInteger(d.c) && d.c >= 0 && d.c < 9 && !st.tablero[d.c], 'Esa casilla no está libre');
      st.tablero[d.c] = st.marcas[j];
      const linea = LINEAS.find((l) => l.every((c) => st.tablero[c] === st.marcas[j]));
      if (linea) { st.fase = 'gano'; st.ganador_partida = j; st.linea = linea; sumar(st, j, 1); return; }
      if (st.tablero.every(Boolean)) { st.fase = 'empate'; return; }
      st.turno = st.jugadores.find((p) => p.id !== j).id; return;
    }
    if (tipo === 'revancha') { exigir(st.fase !== 'jugando', 'La partida sigue'); st.linea = null; triqui._nueva(st); return; }
    if (tipo === 'terminar') { const g = lider(st); st.fase = 'fin'; st.fin = { ganador: (st.puntos[g.id] || 0) > 0 ? g.id : null, texto: `${st.jugadores.map((p) => `${p.nombre} ${st.puntos[p.id] || 0}`).join(' · ')}` }; return; }
    exigir(false, 'Jugada no válida');
  },
  vista(st) { return { fase: st.fase, tablero: st.tablero, turno: st.turno, marcas: st.marcas, linea: st.linea || null, ganador_partida: st.ganador_partida, partida: st.partida }; },
};

/* ---------- Dos verdades y una mentira ---------- */
export const mentira = {
  id: 'mentira', nombre: 'Dos verdades y una mentira', emoji: '🤥', min: 3, max: 12, duracion: '15 min', espectadores: false,
  resumen: 'Cuentas tres cosas tuyas. Una es mentira.',
  como: 'Por turnos, a cada quien le toca escribir tres cosas sobre sí mismo: dos ciertas y una falsa. Los demás leen las tres y votan cuál creen que es la mentira. Quien acierta suma; si no la descubre nadie, suma quien la escribió. Es el juego para conocerse cuando entra gente nueva.',
  iniciar(ctx) { return { ...base(ctx), orden: barajar(ctx.jugadores.map((p) => p.id)), k: 0, fase: 'escribir', frases: null, falsa: null, votos: {} }; },
  accion(st, j, tipo, d, { anfitrion }) {
    const autor = st.orden[st.k];
    if (tipo === 'escribir') {
      exigir(st.fase === 'escribir' && j === autor, 'Ahora escribe otra persona');
      const f = (Array.isArray(d.frases) ? d.frases : []).map((x) => String(x || '').trim().slice(0, 160));
      exigir(f.length === 3 && f.every(Boolean), 'Escribe las tres frases'); exigir([0, 1, 2].includes(d.falsa), 'Marca cuál es la mentira');
      st.frases = f; st.falsa = d.falsa; st.fase = 'votar'; st.votos = {}; return;
    }
    if (tipo === 'votar') {
      exigir(st.fase === 'votar' && j !== autor, 'No puedes votar ahora'); exigir([0, 1, 2].includes(d.i), 'Elige una de las tres');
      st.votos[j] = d.i;
      if (todosVotaron(st, st.votos, autor)) mentira._revelar(st);
      return;
    }
    if (tipo === 'revelar') { exigir(anfitrion && st.fase === 'votar', 'Solo quien creó la sala revela'); mentira._revelar(st); return; }
    if (tipo === 'siguiente') {
      exigir(anfitrion && st.fase === 'revelar', 'Solo quien creó la sala sigue');
      if (st.k >= st.orden.length - 1) return terminar(st, `Ganó ${nombreDe(st, lider(st).id)}`);
      st.k += 1; st.fase = 'escribir'; st.frases = null; st.falsa = null; st.votos = {}; return;
    }
    exigir(false, 'Jugada no válida');
  },
  _revelar(st) {
    const autor = st.orden[st.k], ok = Object.entries(st.votos).filter(([, i]) => i === st.falsa);
    if (ok.length) ok.forEach(([id]) => sumar(st, Number(id), 1)); else sumar(st, autor, 2);
    st.fase = 'revelar';
  },
  vista(st, j) {
    const autor = st.orden[st.k], v = { fase: st.fase, autor, n: st.k + 1, total: st.orden.length, frases: st.frases, votaron: Object.keys(st.votos).map(Number), mi_voto: st.votos[j] ?? null };
    if (st.fase === 'revelar' || st.fase === 'fin' || j === autor) v.falsa = st.falsa;
    if (st.fase === 'revelar') v.votos = st.votos;
    return v;
  },
};
