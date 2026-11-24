// Piezas comunes de los motores de juego. Cada juego exporta:
//   { id, nombre, emoji, resumen, como, min, max, espectadores, duracion,
//     iniciar(ctx) → estado,            ctx = { jugadores: [{ id, nombre }], opciones }
//     accion(estado, j, tipo, datos),   j = id del socio que juega; cambia el estado o lanza JuegoError
//     vista(estado, j) → lo que ve ese jugador (lo público + lo suyo; nunca lo secreto de otros)
//     vencido?(estado, ahora) → aplica lo que pasa cuando se acaba el tiempo del turno; true si cambió }
// El estado tiene siempre: fase, jugadores [{id,nombre}], puntos {id: n}; y fin: { ganador, texto } al terminar.
export class JuegoError extends Error { constructor(m) { super(m); this.status = 400; } }
export const azar = (n) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; };
export const barajar = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = azar(i + 1); [x[i], x[j]] = [x[j], x[i]]; } return x; };
export const nombreDe = (st, id) => st.jugadores.find((p) => p.id === id)?.nombre || 'Alguien';
export const exigir = (cond, msg) => { if (!cond) throw new JuegoError(msg); };
export const sumar = (st, id, n) => { st.puntos[id] = (st.puntos[id] || 0) + n; };
export const siguiente = (st, desde, paso = 1) => { const n = st.jugadores.length, i = st.jugadores.findIndex((p) => p.id === desde); return st.jugadores[(((i + paso) % n) + n) % n].id; };
// Ganador por puntos (empate: el primero en la lista)
export const lider = (st) => st.jugadores.reduce((m, p) => ((st.puntos[p.id] || 0) > (st.puntos[m.id] || 0) ? p : m), st.jugadores[0]);
export const base = (ctx, extra = {}) => ({ jugadores: ctx.jugadores.map(({ id, nombre }) => ({ id, nombre })), puntos: Object.fromEntries(ctx.jugadores.map((p) => [p.id, 0])), ...extra });
