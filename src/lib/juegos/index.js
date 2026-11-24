// Registro de los juegos del club (en el orden del catálogo)
import { impostor, trivia, probable, triqui, mentira } from './sencillos.js';
import { domino } from './domino.js';
import { parques } from './parques.js';
import { rotacartas } from './rotacartas.js';

export const JUEGOS = Object.fromEntries([impostor, trivia, probable, triqui, mentira, domino, parques, rotacartas].map((j) => [j.id, j]));
