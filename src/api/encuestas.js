// Encuestas de las comunidades (módulo Impacto). Se crean desde una plantilla o con IA (se describe qué se busca) y las llenan
// los socios con cada beneficiario. Tipos: caracterizacion (quiénes son), conocimiento (preguntas con respuesta correcta →
// puntaje total y por tema, p. ej. salud emocional, economía), satisfaccion u otra.
//   CRUD /api/impacto/encuestas (?f_comunidad_id=)   ·   GET /api/impacto/encuestas/plantillas
//   POST /api/impacto/encuestas/generar { pedido, tipo }  → borrador { titulo, objetivo, tipo, preguntas } (por el motor de IA de Diwilo Modulos)
//   POST /api/impacto/encuestas/:id/respuestas { beneficiario_id, fecha, respuestas } · PATCH|DELETE /api/impacto/respuestas/:id
//   GET  /api/impacto/encuestas/:id/resultados   conteos por pregunta, puntaje por tema y cada respuesta con su beneficiario
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, cast, today } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { ctxOf } from '../lib/central.js';

const MOD = 'impacto';
export const TIPOS_ENC = ['caracterizacion', 'conocimiento', 'satisfaccion', 'otra'];
const TIPOS_P = ['unica', 'multiple', 'si_no', 'escala', 'numero', 'texto'];
const ESCALA = ['1', '2', '3', '4', '5'];
const uid = () => Math.random().toString(36).slice(2, 9);

// Deja las preguntas limpias: tipos válidos, opciones según el tipo y respuestas correctas que existan.
export function limpiarPreguntas(lista) {
  if (!Array.isArray(lista)) throw new HttpError(400, 'Las preguntas no son válidas');
  const vistos = new Set();
  const out = lista.slice(0, 80).map((p) => {
    const tipo = TIPOS_P.includes(p?.tipo) ? p.tipo : 'unica';
    const texto = String(p?.texto || '').trim().slice(0, 400);
    if (!texto) return null;
    let id = String(p?.id || '').replace(/[^\w-]/g, '').slice(0, 20) || uid();
    while (vistos.has(id)) id = uid();
    vistos.add(id);
    let opciones = tipo === 'si_no' ? ['Sí', 'No'] : tipo === 'escala' ? ESCALA : ['unica', 'multiple'].includes(tipo) ? (Array.isArray(p.opciones) ? p.opciones : []).map((o) => String(o ?? '').trim().slice(0, 200)).filter(Boolean).slice(0, 15) : [];
    if (['unica', 'multiple'].includes(tipo) && opciones.length < 2) throw new HttpError(400, `La pregunta «${texto.slice(0, 60)}» necesita al menos dos opciones`);
    const correcta = ['unica', 'multiple', 'si_no'].includes(tipo) ? [...new Set((Array.isArray(p.correcta) ? p.correcta : p.correcta == null || p.correcta === '' ? [] : [p.correcta]).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < opciones.length) : [];
    const q = { id, tema: String(p?.tema || '').trim().slice(0, 80), texto, tipo, opciones };
    if (correcta.length) q.correcta = tipo === 'multiple' ? correcta : [correcta[0]];
    if (p?.obligatoria) q.obligatoria = true;
    return q;
  }).filter(Boolean);
  if (!out.length) throw new HttpError(400, 'La encuesta necesita al menos una pregunta');
  return out;
}

// Puntaje de una respuesta: 1 punto por cada pregunta con respuesta correcta acertada.
export function calificar(preguntas, resp) {
  let puntaje = 0, max = 0;
  const temas = {};
  for (const q of preguntas) {
    if (!q.correcta?.length) continue;
    max += 1;
    const v = resp[q.id];
    const ok = q.tipo === 'multiple' ? Array.isArray(v) && v.length === q.correcta.length && q.correcta.every((i) => v.includes(i)) : Number(v) === q.correcta[0] && v !== '' && v != null;
    const t = (temas[q.tema || 'General'] ||= { aciertos: 0, total: 0 });
    t.total += 1;
    if (ok) { puntaje += 1; t.aciertos += 1; }
  }
  return { puntaje: max ? puntaje : null, max: max || null, temas };
}

function limpiarRespuestas(preguntas, r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new HttpError(400, 'Las respuestas no son válidas');
  const out = {};
  for (const q of preguntas) {
    const v = r[q.id];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) { if (q.obligatoria) throw new HttpError(400, `Falta responder «${q.texto.slice(0, 60)}»`); continue; }
    if (q.tipo === 'multiple') out[q.id] = [...new Set((Array.isArray(v) ? v : [v]).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < q.opciones.length);
    else if (['unica', 'si_no', 'escala'].includes(q.tipo)) { const i = Number(v); if (Number.isInteger(i) && i >= 0 && i < q.opciones.length) out[q.id] = i; }
    else if (q.tipo === 'numero') { const n = Number(String(v).replace(',', '.')); if (Number.isFinite(n)) out[q.id] = n; }
    else out[q.id] = String(v).trim().slice(0, 2000);
  }
  return out;
}

const preguntasDe = (e) => { try { return JSON.parse(e.preguntas || '[]'); } catch { return []; } };
function validarEncuesta(c, row) {
  if ('preguntas' in row && row.preguntas != null) row.preguntas = JSON.stringify(limpiarPreguntas(typeof row.preguntas === 'string' ? JSON.parse(row.preguntas) : row.preguntas));
}

export const ENTITIES = {
  encuestas: { table: 'ro_encuestas', label: 'la encuesta', title: 'titulo', search: ['titulo', 'objetivo'], order: "estado = 'cerrada', updated_at DESC",
    fields: { comunidad_id: 'int', titulo: 'text!', objetivo: 'long', tipo: TIPOS_ENC, estado: ['activa', 'borrador', 'cerrada'], preguntas: 'doc', con_ia: 'bool' },
    refs: { comunidad_id: 'ro_comunidades' },
    beforeCreate(c, row) { if (!row.preguntas) throw new HttpError(400, 'La encuesta necesita preguntas'); validarEncuesta(c, row); row.creado_por = c.session?.user_id || null; },
    beforeUpdate: (c, row) => validarEncuesta(c, row),
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ro_encuesta_respuestas WHERE business_id = ? AND encuesta_id = ?', c.businessId, before.id)).n) throw new HttpError(409, 'La encuesta ya tiene respuestas: ciérrala en vez de borrarla');
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const n = Object.fromEntries((await all(c.env, 'SELECT encuesta_id k, COUNT(*) n, MAX(fecha) ultima FROM ro_encuesta_respuestas WHERE business_id = ? GROUP BY encuesta_id', c.businessId)).map((x) => [x.k, x]));
      return rows.map((r) => ({ ...r, preguntas: preguntasDe(r), respuestas: n[r.id]?.n || 0, ultima: n[r.id]?.ultima || null }));
    } },
};

/* ---------- Plantillas listas ---------- */
const U = (tema, texto, opciones, correcta) => ({ tema, texto, tipo: 'unica', opciones, ...(correcta != null ? { correcta: [correcta] } : {}) });
const SN = (tema, texto, correcta) => ({ tema, texto, tipo: 'si_no', ...(correcta != null ? { correcta: [correcta] } : {}) });
export const PLANTILLAS = [
  { id: 'caracterizacion', titulo: 'Caracterización de la comunidad', tipo: 'caracterizacion', objetivo: 'Conocer quiénes son los beneficiarios: datos generales, hogar, salud, educación, economía y necesidades.',
    preguntas: [
      { tema: 'Datos generales', texto: 'Edad', tipo: 'numero' }, U('Datos generales', 'Sexo', ['Femenino', 'Masculino', 'Otro', 'Prefiere no decir']),
      U('Datos generales', 'Nivel educativo alcanzado', ['Ninguno', 'Primaria', 'Bachillerato', 'Técnico o tecnólogo', 'Universitario']), SN('Datos generales', '¿Estudia actualmente?'),
      { tema: 'Hogar', texto: '¿Cuántas personas viven en el hogar?', tipo: 'numero' }, U('Hogar', 'La vivienda es', ['Propia', 'Arrendada', 'Familiar', 'Otra']),
      { tema: 'Hogar', texto: 'Servicios con los que cuenta la vivienda', tipo: 'multiple', opciones: ['Agua', 'Luz', 'Gas', 'Alcantarillado', 'Internet'] },
      U('Salud', 'Afiliación a salud', ['Contributivo', 'Subsidiado', 'Ninguna', 'No sabe']), SN('Salud', '¿Tiene alguna discapacidad o enfermedad permanente?'),
      U('Economía', 'Ingreso mensual del hogar', ['Menos de un salario mínimo', 'Un salario mínimo', 'Entre 1 y 2 salarios', 'Más de 2 salarios', 'No sabe']),
      U('Economía', 'Ocupación principal', ['Empleado', 'Independiente', 'Desempleado', 'Hogar', 'Estudiante', 'Pensionado']),
      { tema: 'Necesidades', texto: '¿Cuáles son las principales necesidades?', tipo: 'multiple', opciones: ['Alimentación', 'Salud', 'Educación', 'Vivienda', 'Empleo', 'Recreación', 'Apoyo emocional'] },
      { tema: 'Necesidades', texto: 'Comentarios', tipo: 'texto' }] },
  { id: 'conocimientos', titulo: '¿Cuánto sabes? Salud emocional y economía', tipo: 'conocimiento', objetivo: 'Medir lo que saben antes y después del proyecto, con un puntaje por tema.',
    preguntas: [
      U('Salud emocional', 'Cuando una persona siente tristeza por muchos días, lo mejor es', ['Guardárselo', 'Hablarlo con alguien de confianza o un profesional', 'Ignorarlo', 'Aislarse'], 1),
      U('Salud emocional', '¿Qué ayuda a manejar el estrés?', ['Dormir poco', 'Respirar profundo y hacer pausas', 'Tomar alcohol', 'Trabajar sin descanso'], 1),
      SN('Salud emocional', '¿Pedir ayuda es una señal de debilidad?', 1),
      U('Salud emocional', 'Una emoción es', ['Algo que siempre se debe esconder', 'Una reacción natural que nos da información', 'Una enfermedad', 'Algo que solo sienten los niños'], 1),
      U('Economía', 'Un presupuesto sirve para', ['Gastar más', 'Saber cuánto entra y cuánto sale de dinero', 'Pedir préstamos', 'Nada'], 1),
      U('Economía', 'Ahorrar es', ['Guardar una parte del dinero para el futuro', 'Gastar todo el dinero', 'Pedir prestado', 'Comprar a crédito'], 0),
      SN('Economía', '¿Es buena idea pedir un préstamo "gota a gota"?', 1),
      U('Economía', 'Si te ganas 100 y gastas 120, tienes', ['Ahorro de 20', 'Deuda de 20', 'Lo mismo', 'Ganancia'], 1),
      U('Salud física', '¿Cuántos vasos de agua se recomienda tomar al día?', ['1 a 2', '3 a 4', '6 a 8', 'Ninguno'], 2),
      SN('Salud física', '¿Lavarse las manos ayuda a prevenir enfermedades?', 0)] },
  { id: 'satisfaccion', titulo: 'Satisfacción con la actividad', tipo: 'satisfaccion', objetivo: 'Saber cómo les pareció la actividad y qué mejorar.',
    preguntas: [
      { tema: 'Actividad', texto: '¿Qué tanto te gustó la actividad? (1 a 5)', tipo: 'escala' }, { tema: 'Actividad', texto: '¿Qué tan útil fue para ti? (1 a 5)', tipo: 'escala' },
      SN('Actividad', '¿Te gustaría participar otra vez?'), { tema: 'Actividad', texto: '¿Qué fue lo que más te gustó?', tipo: 'texto' }, { tema: 'Actividad', texto: '¿Qué podemos mejorar?', tipo: 'texto' }] },
];

/* ---------- Crear con IA ---------- */
const INSTRUCCIONES = `Eres experto en diseñar encuestas sociales para fundaciones y clubes de servicio en Colombia (comunidades vulnerables, niños, adultos mayores, familias).
Diseña la encuesta que pide el usuario. Lenguaje sencillo, claro y respetuoso; preguntas cortas; sin datos sensibles innecesarios.
Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"titulo":"…","objetivo":"…","tipo":"caracterizacion|conocimiento|satisfaccion|otra","preguntas":[{"tema":"…","texto":"…","tipo":"unica|multiple|si_no|escala|numero|texto","opciones":["…"],"correcta":[0]}]}
Reglas: agrupa las preguntas por "tema" (secciones). "opciones" solo en unica y multiple (de 2 a 6). "escala" es de 1 a 5 (sin opciones).
Si es de conocimiento (qué tanto sabe), TODAS las preguntas llevan "correcta" con el índice (desde 0) de la respuesta correcta y se usan unica o si_no (para si_no: 0 = Sí, 1 = No).
Si no es de conocimiento, no pongas "correcta". Entre 8 y 20 preguntas.`;
function jsonDe(texto) {
  const t = String(texto || '').replace(/```(?:json)?/g, '');
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i < 0 || j <= i) throw new HttpError(502, 'La IA no devolvió una encuesta. Intenta de nuevo o describe mejor lo que buscas.');
  try { return JSON.parse(t.slice(i, j + 1)); } catch { throw new HttpError(502, 'La IA devolvió una encuesta incompleta. Intenta de nuevo.'); }
}
async function generar(c, { pedido, tipo, comunidad }) {
  if (!c.env.MODULOS) throw new HttpError(503, 'La IA no está disponible en este momento');
  const ctx = await ctxOf(c);
  if (!ctx.modulos.includes('ai')) throw new HttpError(403, 'Activa el módulo IA para crear encuestas con IA (o usa una plantilla)');
  const p = `Quiero una encuesta${tipo && tipo !== 'otra' ? ` de tipo «${tipo}»` : ''}${comunidad ? ` para la comunidad «${comunidad}»` : ''}.\nLo que busco saber: ${pedido}`;
  const r = await c.env.MODULOS.call(ctx, { method: 'POST', path: '/api/ai/generar', query: '', body: JSON.stringify({ instrucciones: INSTRUCCIONES, pedido: p, max: 3500, fuente: 'encuestas' }) });
  const d = JSON.parse(typeof r.body === 'string' ? r.body : new TextDecoder().decode(r.body) || '{}');
  if (r.status === 404) throw new HttpError(503, 'Crear con IA aún no está disponible: falta publicar la actualización de IA de Diwilo. Mientras tanto, usa una plantilla.');
  if (r.status !== 200) throw new HttpError(r.status, d.error || 'La IA no pudo crear la encuesta');
  const e = jsonDe(d.texto);
  return { titulo: String(e.titulo || 'Encuesta').slice(0, 200), objetivo: String(e.objetivo || pedido).slice(0, 2000), tipo: TIPOS_ENC.includes(e.tipo) ? e.tipo : (tipo || 'otra'), preguntas: limpiarPreguntas(e.preguntas || []) };
}

export function routes(r) {
  r.get('/api/impacto/encuestas/plantillas', `tenant:${MOD}`, async () => json({ rows: PLANTILLAS.map((p) => ({ ...p, preguntas: limpiarPreguntas(p.preguntas.map((q, i) => ({ ...q, id: `${p.id.slice(0, 4)}${i}` }))) })) }));
  r.post('/api/impacto/encuestas/generar', `tenant:${MOD}`, async (c) => {
    const b = await readJson(c.req), pedido = String(b.pedido || '').trim().slice(0, 1500);
    if (pedido.length < 5) throw new HttpError(400, 'Cuéntale a la IA qué quieres saber con la encuesta');
    const com = b.comunidad_id ? await one(c.env, 'SELECT nombre FROM ro_comunidades WHERE id = ? AND business_id = ?', Number(b.comunidad_id) || 0, c.businessId) : null;
    return json(await generar(c, { pedido, tipo: TIPOS_ENC.includes(b.tipo) ? b.tipo : null, comunidad: com?.nombre }));
  });
  crud(r, { base: '/api/impacto', modulo: MOD, entities: ENTITIES });

  const encOr404 = async (c, id) => { const e = await one(c.env, 'SELECT * FROM ro_encuestas WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId); if (!e) throw new HttpError(404, 'Encuesta no encontrada'); return e; };
  const benOr400 = async (c, id) => { const b = await one(c.env, 'SELECT id, nombre, comunidad_id FROM ro_beneficiarios WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId); if (!b) throw new HttpError(400, 'Elige el beneficiario'); return b; };
  r.post('/api/impacto/encuestas/:id/respuestas', `tenant:${MOD}`, async (c) => {
    const e = await encOr404(c, c.params.id), b = await readJson(c.req), t = Date.now();
    if (e.estado === 'cerrada') throw new HttpError(409, 'La encuesta está cerrada');
    const ben = await benOr400(c, b.beneficiario_id), qs = preguntasDe(e), resp = limpiarRespuestas(qs, b.respuestas), cal = calificar(qs, resp);
    const fecha = cast('fecha', 'date', b.fecha) || today();
    const x = await c.env.DB.prepare('INSERT INTO ro_encuesta_respuestas (business_id, encuesta_id, comunidad_id, beneficiario_id, fecha, respuestas, puntaje, puntaje_max, registrado_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, e.id, ben.comunidad_id, ben.id, fecha, JSON.stringify(resp), cal.puntaje, cal.max, c.session.user_id, t, t).run();
    await audit(c, `Respondió la encuesta «${e.titulo}» con ${ben.nombre}`, { modulo: MOD });
    return json({ id: x.meta.last_row_id, puntaje: cal.puntaje, max: cal.max, temas: cal.temas }, 201);
  });
  r.patch('/api/impacto/respuestas/:id', `tenant:${MOD}`, async (c) => {
    const x = await one(c.env, 'SELECT * FROM ro_encuesta_respuestas WHERE id = ? AND business_id = ?', Number(c.params.id) || 0, c.businessId);
    if (!x) throw new HttpError(404, 'Respuesta no encontrada');
    const e = await encOr404(c, x.encuesta_id), b = await readJson(c.req), qs = preguntasDe(e);
    const resp = 'respuestas' in b ? limpiarRespuestas(qs, b.respuestas) : JSON.parse(x.respuestas || '{}'), cal = calificar(qs, resp);
    const fecha = 'fecha' in b ? cast('fecha', 'date', b.fecha) || x.fecha : x.fecha;
    await c.env.DB.prepare('UPDATE ro_encuesta_respuestas SET fecha = ?, respuestas = ?, puntaje = ?, puntaje_max = ?, updated_at = ? WHERE id = ? AND business_id = ?')
      .bind(fecha, JSON.stringify(resp), cal.puntaje, cal.max, Date.now(), x.id, c.businessId).run();
    return json({ ok: true, puntaje: cal.puntaje, max: cal.max });
  });
  r.delete('/api/impacto/respuestas/:id', `manager:${MOD}`, async (c) => {
    await c.env.DB.prepare('DELETE FROM ro_encuesta_respuestas WHERE id = ? AND business_id = ?').bind(Number(c.params.id) || 0, c.businessId).run();
    return json({ ok: true });
  });
  r.get('/api/impacto/encuestas/:id/resultados', `tenant:${MOD}`, async (c) => {
    const e = await encOr404(c, c.params.id), qs = preguntasDe(e);
    const rs = await all(c.env, `SELECT r.id, r.fecha, r.beneficiario_id, r.respuestas, r.puntaje, r.puntaje_max, b.nombre beneficiario, b.edad, b.tipo, cm.nombre comunidad
      FROM ro_encuesta_respuestas r LEFT JOIN ro_beneficiarios b ON b.id = r.beneficiario_id AND b.business_id = r.business_id LEFT JOIN ro_comunidades cm ON cm.id = r.comunidad_id AND cm.business_id = r.business_id
      WHERE r.business_id = ? AND r.encuesta_id = ? ORDER BY r.fecha DESC, r.id DESC`, c.businessId, e.id);
    const filas = rs.map((x) => ({ ...x, respuestas: JSON.parse(x.respuestas || '{}') }));
    const preguntas = qs.map((q) => {
      const vals = filas.map((f) => f.respuestas[q.id]).filter((v) => v != null && v !== '');
      const o = { ...q, respondidas: vals.length };
      if (q.opciones.length) { o.conteo = q.opciones.map((_, i) => vals.filter((v) => (Array.isArray(v) ? v.includes(i) : v === i)).length); }
      if (q.tipo === 'escala') o.promedio = vals.length ? Math.round((vals.reduce((t, v) => t + v + 1, 0) / vals.length) * 10) / 10 : null;
      if (q.tipo === 'numero') { o.promedio = vals.length ? Math.round((vals.reduce((t, v) => t + v, 0) / vals.length) * 10) / 10 : null; o.min = vals.length ? Math.min(...vals) : null; o.max = vals.length ? Math.max(...vals) : null; }
      if (q.tipo === 'texto') o.textos = vals.slice(0, 40);
      if (q.correcta?.length) o.aciertos = filas.filter((f) => calificar([q], f.respuestas).puntaje === 1).length;
      return o;
    });
    const temas = {};
    filas.forEach((f) => { for (const [t, v] of Object.entries(calificar(qs, f.respuestas).temas)) { const x = (temas[t] ||= { tema: t, aciertos: 0, total: 0 }); x.aciertos += v.aciertos; x.total += v.total; } });
    const conP = filas.filter((f) => f.puntaje_max);
    return json({ encuesta: { ...e, preguntas: qs }, total: filas.length,
      puntaje: conP.length ? { promedio: Math.round((conP.reduce((t, f) => t + f.puntaje / f.puntaje_max, 0) / conP.length) * 100), max: conP[0].puntaje_max } : null,
      temas: Object.values(temas).map((t) => ({ ...t, pct: t.total ? Math.round((t.aciertos / t.total) * 100) : 0 })), preguntas, respuestas: filas });
  });
}
