// Registro de los juegos del club (en el orden del catálogo)
import { impostor, trivia, probable, triqui, mentira } from './sencillos.js';
import { domino } from './domino.js';
import { parques } from './parques.js';
import { rotacartas } from './rotacartas.js';
import { bingo } from './bingo.js';

export const JUEGOS = Object.fromEntries([impostor, trivia, probable, triqui, mentira, bingo, domino, parques, rotacartas].map((j) => [j.id, j]));
