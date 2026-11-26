// Formatos del distrito (p. ej. «Presentación de proyectos»): el distrito arma el formato con secciones y cada club de su
// programa lo llena en una página formal con el encabezado y el logo del distrito, lo envía y el distrito lo revisa.
//   Distrito: GET/POST /api/distrito/formatos · PATCH/DELETE /api/distrito/formatos/:id
//             GET /api/distrito/envios?estado= · GET /api/distrito/envios/:id · POST /api/distrito/envios/:id/revisar {estado, comentario}
//   Club:     GET /api/formatos (formatos activos + envíos del club) · GET /api/formatos/encabezado · GET /api/formatos/logo
//             POST /api/formatos/envios {formato_id, titulo} · GET/PATCH/DELETE /api/formatos/envios/:id
//             POST /api/formatos/envios/:id/enviar · POST /api/formatos/envios/:id/proyecto (aprobado → proyecto en Impacto)
// El envío copia las secciones al crearse: si el distrito cambia el formato, lo ya llenado no se daña.
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { distritoDe, conSigla, PROGRAMAS, EN_DISTRITO, enDistrito } from '../lib/rotaract.js';
import { distritoOError } from './distrito.js';

const MOD = 'impacto';
export const TIPOS_SECCION = ['seccion', 'texto', 'parrafo', 'numero', 'dinero', 'fecha', 'opciones', 'si_no'];
const ESTADOS = ['borrador', 'enviado', 'aprobado', 'devuelto', 'rechazado'];
const EDITABLE = ['borrador', 'devuelto'];

// Plantilla sugerida para presentar proyectos (las 7 áreas de interés de Rotary)
export const PLANTILLA = [
  ['seccion', 'Datos generales'],
  ['opciones', 'Área de interés', '', true, ['Paz y prevención de conflictos', 'Prevención y tratamiento de enfermedades', 'Agua, saneamiento e higiene', 'Salud materno-infantil', 'Educación básica y alfabetización', 'Desarrollo económico de la comunidad', 'Medio ambiente']],
  ['texto', 'Comunidad beneficiada', 'Nombre de la fundación, barrio, colegio u hogar', true],
  ['texto', 'Lugar', 'Municipio, barrio o dirección'],
  ['fecha', 'Fecha de inicio', '', true], ['fecha', 'Fecha de finalización'],
  ['texto', 'Responsable del proyecto', 'Nombre y cargo en el club', true],
  ['seccion', 'Descripción del proyecto'],
  ['parrafo', 'Justificación', '¿Qué necesidad atiende y por qué es importante para la comunidad?', true],
  ['parrafo', 'Objetivo general', '', true], ['parrafo', 'Objetivos específicos', 'Uno por línea'],
  ['parrafo', 'Actividades y cronograma', 'Qué se hará, cuándo y quién'],
  ['seccion', 'Impacto y recursos'],
  ['numero', 'Personas beneficiadas', '', true], ['numero', 'Horas de servicio estimadas'],
  ['dinero', 'Presupuesto total'], ['parrafo', 'Fuentes de financiación y alianzas', 'Caja del club, alianzas, patrocinios, aportes en especie…'],
  ['parrafo', 'Indicadores de impacto', '¿Cómo se medirá el resultado?'], ['parrafo', 'Observaciones'],
].map(([tipo, titulo, ayuda = '', requerido = false, opciones], i) => ({ id: `s${i + 1}`, tipo, titulo, ayuda, requerido, ...(opciones ? { opciones } : {}) }));

const leer = (s, def) => { try { return JSON.parse(s || '') ?? def; } catch { return def; } };

function limpiarSecciones(v) {
  if (!Array.isArray(v) || !v.length) throw new HttpError(400, 'El formato necesita al menos una sección');
  const ids = new Set();
  const out = v.slice(0, 80).map((s, i) => {
    const tipo = TIPOS_SECCION.includes(s?.tipo) ? s.tipo : 'parrafo';
    let id = String(s?.id || '').replace(/[^\w-]/g, '').slice(0, 20) || `s${i + 1}`;
    while (ids.has(id)) id = `${id}x`;
    ids.add(id);
    const titulo = String(s?.titulo || '').trim().slice(0, 200);
    if (!titulo) throw new HttpError(400, `La sección ${i + 1} no tiene título`);
    const o = { id, tipo, titulo, ayuda: String(s?.ayuda || '').trim().slice(0, 500), requerido: tipo !== 'seccion' && !!s?.requerido };
    if (tipo === 'opciones') {
      o.opciones = (Array.isArray(s.opciones) ? s.opciones : String(s.opciones || '').split('\n')).map((x) => String(x).trim().slice(0, 150)).filter(Boolean).slice(0, 30);
      if (!o.opciones.length) throw new HttpError(400, `Escribe las opciones de «${titulo}»`);
    }
    return o;
  });
  if (!out.some((s) => s.tipo !== 'seccion')) throw new HttpError(400, 'El formato necesita al menos una pregunta');
  return out;
}

function limpiarRespuestas(secciones, v) {
  const r = typeof v === 'object' && v ? v : {}, out = {};
  for (const s of secciones) {
    if (s.tipo === 'seccion' || r[s.id] == null || r[s.id] === '') continue;
    let x = String(r[s.id]).slice(0, s.tipo === 'parrafo' ? 20000 : 500);
    if (s.tipo === 'opciones' && !s.opciones.includes(x)) continue;
    if (s.tipo === 'si_no' && !['si', 'no'].includes(x)) continue;
    if (s.tipo === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(x)) continue;
    if (['numero', 'dinero'].includes(s.tipo)) { const n = Number(x.replace(/[^\d.-]/g, '')); if (!Number.isFinite(n)) continue; x = String(Math.round(n)); }
    out[s.id] = x;
  }
  return out;
}

// El negocio del distrito al que pertenece este negocio (o él mismo si es el distrito)
async function negocioDistrito(env, bid) {
  const d = await distritoDe(env, bid);
  if (d.es_distrito) return { d, distritoId: bid };
  const r = await one(env, `SELECT k.business_id id FROM ro_club_config k JOIN businesses b ON b.id = k.business_id WHERE k.es_distrito = 1 AND COALESCE(k.distrito, ?) = ?
    AND COALESCE(k.programa, 'rotaract') = ? AND b.archived_at IS NULL ORDER BY b.status = 'active' DESC, k.updated_at DESC LIMIT 1`, env.DISTRITO_DEFECTO || '4271', d.codigo, d.programa);
  return { d, distritoId: r?.id || null };
}

const formatoDe = (f) => ({ ...f, secciones: leer(f.secciones, []) });
const envioDe = (e) => ({ ...e, secciones: leer(e.secciones, []), respuestas: leer(e.respuestas, {}) });

async function envioDelClub(c, id) {
  const e = await one(c.env, 'SELECT * FROM ro_formato_envios WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId);
  if (!e) throw new HttpError(404, 'Solicitud no encontrada');
  return envioDe(e);
}
async function envioDelDistrito(c, d, id) {
  const e = await one(c.env, `SELECT e.*, b.name club, COALESCE(k.programa, 'rotaract') programa FROM ro_formato_envios e JOIN businesses b ON b.id = e.business_id LEFT JOIN ro_club_config k ON k.business_id = e.business_id
    WHERE e.id = ? AND e.distrito = ? AND e.estado <> 'borrador' AND e.${EN_DISTRITO}`, Number(id) || 0, d.clave, ...enDistrito(c.env, d.codigo, d.programa));
  if (!e) throw new HttpError(404, 'Solicitud no encontrada');
  return { ...envioDe(e), club: conSigla(e.club, e.programa) };
}

// Proyecto de Impacto a partir de una solicitud aprobada: campos que se reconocen por tipo y título + el documento completo
function proyectoDesde(e) {
  const S = e.secciones, R = e.respuestas, val = (s) => R[s.id];
  const buscar = (tipo, re) => S.find((s) => s.tipo === tipo && (!re || re.test(s.titulo)) && val(s));
  const fechas = S.filter((s) => s.tipo === 'fecha' && val(s));
  const p = {
    nombre: e.titulo, estado: 'planeacion',
    fecha_inicio: (buscar('fecha', /inicio|comienz/i) || fechas[0]) ? val(buscar('fecha', /inicio|comienz/i) || fechas[0]) : null,
    fecha_fin: buscar('fecha', /fin|termin|cierre/i) ? val(buscar('fecha', /fin|termin|cierre/i)) : null,
    presupuesto: buscar('dinero') ? Number(val(buscar('dinero'))) : 0,
    beneficiados: buscar('numero', /benefici|personas/i) ? Number(val(buscar('numero', /benefici|personas/i))) : 0,
    horas_servicio: buscar('numero', /hora/i) ? Number(val(buscar('numero', /hora/i))) : 0,
    objetivo: buscar('parrafo', /objetivo/i) ? val(buscar('parrafo', /objetivo/i)).slice(0, 5000) : null,
    descripcion: (buscar('parrafo', /descrip|justific|resumen/i) || buscar('parrafo')) ? val(buscar('parrafo', /descrip|justific|resumen/i) || buscar('parrafo')).slice(0, 5000) : null,
  };
  const bloques = [{ tipo: 'destacado', texto: `Presentado al distrito con el formato «${e.formato_nombre}» y aprobado.${e.comentario ? ` Comentario del distrito: ${e.comentario}` : ''}` }];
  for (const s of S) {
    if (s.tipo === 'seccion') { bloques.push({ tipo: 'titulo', texto: s.titulo }); continue; }
    const v = val(s); if (!v) continue;
    const t = s.tipo === 'dinero' ? `$ ${Number(v).toLocaleString('es-CO')}` : s.tipo === 'si_no' ? (v === 'si' ? 'Sí' : 'No') : v;
    bloques.push({ tipo: 'subtitulo', texto: s.titulo }, { tipo: 'texto', texto: t });
  }
  return { p, bloques: bloques.slice(0, 300) };
}

export function routes(r) {
  /* ---------- Distrito: formatos ---------- */
  r.get('/api/distrito/formatos', 'tenant', async (c) => {
    const d = await distritoOError(c);
    const rows = await all(c.env, `SELECT f.*, (SELECT COUNT(*) FROM ro_formato_envios e WHERE e.formato_id = f.id AND e.estado = 'enviado') por_revisar,
      (SELECT COUNT(*) FROM ro_formato_envios e WHERE e.formato_id = f.id AND e.estado <> 'borrador') recibidos FROM ro_formatos f WHERE f.distrito = ? AND f.business_id = ? ORDER BY f.activo DESC, f.updated_at DESC`, d.clave, c.businessId);
    return json({ rows: rows.map(formatoDe), plantilla: PLANTILLA, tipos: TIPOS_SECCION });
  });
  const datosFormato = (b) => {
    const nombre = cast('nombre', 'text', b.nombre);
    if (!nombre) throw new HttpError(400, 'Escribe el nombre del formato');
    return { nombre, descripcion: cast('descripcion', 'long', b.descripcion), secciones: JSON.stringify(limpiarSecciones(b.secciones)), activo: b.activo === false || b.activo === 0 ? 0 : 1, fecha_limite: cast('fecha_limite', 'date', b.fecha_limite) };
  };
  r.post('/api/distrito/formatos', 'manager', async (c) => {
    const d = await distritoOError(c), f = datosFormato(await readJson(c.req)), t = Date.now();
    const x = await c.env.DB.prepare('INSERT INTO ro_formatos (business_id, distrito, nombre, descripcion, secciones, activo, fecha_limite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, d.clave, f.nombre, f.descripcion, f.secciones, f.activo, f.fecha_limite, t, t).run();
    await audit(c, `Creó el formato «${f.nombre}»`, { modulo: 'distrito' });
    return json({ id: x.meta.last_row_id }, 201);
  });
  r.patch('/api/distrito/formatos/:id', 'manager', async (c) => {
    const d = await distritoOError(c), f = datosFormato(await readJson(c.req));
    const x = await c.env.DB.prepare('UPDATE ro_formatos SET nombre = ?, descripcion = ?, secciones = ?, activo = ?, fecha_limite = ?, updated_at = ? WHERE id = ? AND distrito = ? AND business_id = ?')
      .bind(f.nombre, f.descripcion, f.secciones, f.activo, f.fecha_limite, Date.now(), Number(c.params.id), d.clave, c.businessId).run();
    if (!x.meta.changes) throw new HttpError(404, 'Formato no encontrado');
    await audit(c, `Editó el formato «${f.nombre}»`, { modulo: 'distrito' });
    return json({ ok: true });
  });
  r.delete('/api/distrito/formatos/:id', 'manager', async (c) => {
    const d = await distritoOError(c), id = Number(c.params.id);
    const f = await one(c.env, 'SELECT nombre FROM ro_formatos WHERE id = ? AND distrito = ? AND business_id = ?', id, d.clave, c.businessId);
    if (!f) throw new HttpError(404, 'Formato no encontrado');
    if ((await one(c.env, 'SELECT COUNT(*) n FROM ro_formato_envios WHERE formato_id = ?', id)).n) throw new HttpError(409, 'Algún club ya empezó a llenarlo: desactívalo en vez de borrarlo');
    await c.env.DB.prepare('DELETE FROM ro_formatos WHERE id = ? AND business_id = ?').bind(id, c.businessId).run();
    await audit(c, `Borró el formato «${f.nombre}»`, { modulo: 'distrito' });
    return json({ ok: true });
  });

  /* ---------- Distrito: solicitudes recibidas ---------- */
  r.get('/api/distrito/envios', 'tenant', async (c) => {
    const d = await distritoOError(c), est = c.url.searchParams.get('estado');
    const rows = await all(c.env, `SELECT e.id, e.business_id, e.formato_id, e.formato_nombre, e.titulo, e.estado, e.comentario, e.enviado_at, e.revisado_at, e.proyecto_id, b.name club, COALESCE(k.programa, 'rotaract') programa
      FROM ro_formato_envios e JOIN businesses b ON b.id = e.business_id LEFT JOIN ro_club_config k ON k.business_id = e.business_id
      WHERE e.distrito = ? AND e.estado <> 'borrador' ${ESTADOS.includes(est) ? 'AND e.estado = ?' : ''} AND e.${EN_DISTRITO} ORDER BY e.estado = 'enviado' DESC, e.enviado_at DESC LIMIT 300`,
    d.clave, ...(ESTADOS.includes(est) ? [est] : []), ...enDistrito(c.env, d.codigo, d.programa));
    return json({ rows: rows.map((x) => ({ ...x, club: conSigla(x.club, x.programa) })) });
  });
  r.get('/api/distrito/envios/:id', 'tenant', async (c) => json(await envioDelDistrito(c, await distritoOError(c), c.params.id)));
  r.post('/api/distrito/envios/:id/revisar', 'manager', async (c) => {
    const d = await distritoOError(c), e = await envioDelDistrito(c, d, c.params.id), b = await readJson(c.req);
    const estado = cast('estado', ['aprobado', 'devuelto', 'rechazado'], b.estado), comentario = cast('comentario', 'long', b.comentario);
    if (e.estado !== 'enviado' && !(e.estado === 'aprobado' && estado !== 'aprobado' && !e.proyecto_id)) throw new HttpError(409, 'Esta solicitud ya fue revisada');
    if (estado !== 'aprobado' && !comentario) throw new HttpError(400, 'Escribe al club qué debe corregir o por qué no se aprueba');
    await c.env.DB.prepare('UPDATE ro_formato_envios SET estado = ?, comentario = ?, revisado_at = ?, updated_at = ? WHERE id = ?').bind(estado, comentario, Date.now(), Date.now(), e.id).run();
    await audit(c, `${{ aprobado: 'Aprobó', devuelto: 'Devolvió', rechazado: 'No aprobó' }[estado]} «${e.titulo}» de ${e.club}`, { modulo: 'distrito' });
    return json({ ok: true });
  });

  /* ---------- Club ---------- */
  r.get('/api/formatos', `tenant:${MOD}`, async (c) => {
    const d = await distritoDe(c.env, c.businessId);
    const [formatos, envios] = await Promise.all([
      all(c.env, `SELECT f.id, f.nombre, f.descripcion, f.fecha_limite, f.secciones FROM ro_formatos f JOIN businesses b ON b.id = f.business_id
        WHERE f.distrito = ? AND f.activo = 1 AND b.archived_at IS NULL ORDER BY f.updated_at DESC`, d.clave),
      all(c.env, 'SELECT id, formato_id, formato_nombre, titulo, estado, comentario, enviado_at, revisado_at, proyecto_id, updated_at FROM ro_formato_envios WHERE business_id = ? ORDER BY updated_at DESC LIMIT 200', c.businessId),
    ]);
    return json({ es_distrito: d.es_distrito, formatos: formatos.map((f) => ({ ...f, preguntas: leer(f.secciones, []).filter((s) => s.tipo !== 'seccion').length, secciones: undefined })), envios });
  });
  r.get('/api/formatos/encabezado', 'tenant', async (c) => {
    const { d, distritoId } = await negocioDistrito(c.env, c.businessId);
    const [biz, st] = await Promise.all([one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId), distritoId ? one(c.env, 'SELECT logo_key, updated_at FROM business_settings WHERE business_id = ?', distritoId) : null]);
    const P = PROGRAMAS[d.programa] || PROGRAMAS.rotaract;
    return json({ distrito: `Distrito ${d.codigo}`, programa: P.nombre, codigo: d.codigo, club: d.es_distrito ? null : conSigla(biz?.name || '', d.programa),
      logo: st?.logo_key ? `/api/formatos/logo?v=${encodeURIComponent(st.updated_at || '')}` : null, logo_oficial: P.logo ? '/img/marca/rotaract.svg' : null });
  });
  r.get('/api/formatos/logo', 'tenant', async (c) => {
    const { distritoId } = await negocioDistrito(c.env, c.businessId);
    const st = distritoId ? await one(c.env, 'SELECT logo_key FROM business_settings WHERE business_id = ?', distritoId) : null;
    const obj = st?.logo_key && c.env.FILES ? await c.env.FILES.get(st.logo_key) : null;
    if (!obj) throw new HttpError(404, 'Sin logo');
    return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType || 'image/png', 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" } });
  });
  r.post('/api/formatos/envios', `manager:${MOD}`, async (c) => {
    const d = await distritoDe(c.env, c.businessId), b = await readJson(c.req), t = Date.now();
    if (d.es_distrito) throw new HttpError(403, 'Los formatos los llenan los clubes');
    const f = await one(c.env, 'SELECT * FROM ro_formatos WHERE id = ? AND distrito = ? AND activo = 1', Number(b.formato_id) || 0, d.clave);
    if (!f) throw new HttpError(404, 'Formato no encontrado');
    const titulo = cast('titulo', 'text', b.titulo);
    if (!titulo) throw new HttpError(400, 'Escribe el nombre del proyecto');
    const x = await c.env.DB.prepare(`INSERT INTO ro_formato_envios (business_id, distrito, formato_id, formato_nombre, secciones, titulo, respuestas, creado_por, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, '{}', ?, ?, ?)`).bind(c.businessId, d.clave, f.id, f.nombre, f.secciones, titulo, c.session.user_id, t, t).run();
    await audit(c, `Empezó «${titulo}» con el formato ${f.nombre}`, { modulo: MOD });
    return json({ id: x.meta.last_row_id }, 201);
  });
  r.get('/api/formatos/envios/:id', `tenant:${MOD}`, async (c) => {
    const e = await envioDelClub(c, c.params.id);
    const f = await one(c.env, 'SELECT descripcion, fecha_limite FROM ro_formatos WHERE id = ?', e.formato_id);
    return json({ ...e, descripcion: f?.descripcion || null, fecha_limite: f?.fecha_limite || null });
  });
  r.patch('/api/formatos/envios/:id', `manager:${MOD}`, async (c) => {
    const e = await envioDelClub(c, c.params.id), b = await readJson(c.req);
    if (!EDITABLE.includes(e.estado)) throw new HttpError(409, 'Ya se envió al distrito: espera su revisión');
    const titulo = 'titulo' in b ? cast('titulo', 'text', b.titulo) : e.titulo;
    if (!titulo) throw new HttpError(400, 'Escribe el nombre del proyecto');
    const resp = 'respuestas' in b ? limpiarRespuestas(e.secciones, b.respuestas) : e.respuestas;
    await c.env.DB.prepare('UPDATE ro_formato_envios SET titulo = ?, respuestas = ?, updated_at = ? WHERE id = ?').bind(titulo, JSON.stringify(resp), Date.now(), e.id).run();
    return json({ ok: true });
  });
  r.delete('/api/formatos/envios/:id', `manager:${MOD}`, async (c) => {
    const e = await envioDelClub(c, c.params.id);
    if (e.estado !== 'borrador') throw new HttpError(409, 'Solo se borran los borradores');
    await c.env.DB.prepare('DELETE FROM ro_formato_envios WHERE id = ?').bind(e.id).run();
    return json({ ok: true });
  });
  r.post('/api/formatos/envios/:id/enviar', `manager:${MOD}`, async (c) => {
    const e = await envioDelClub(c, c.params.id);
    if (!EDITABLE.includes(e.estado)) throw new HttpError(409, 'Ya se envió al distrito');
    const falta = e.secciones.filter((s) => s.requerido && !e.respuestas[s.id]).map((s) => s.titulo);
    if (falta.length) throw new HttpError(400, `Falta llenar: ${falta.slice(0, 5).join(', ')}${falta.length > 5 ? '…' : ''}`);
    await c.env.DB.prepare("UPDATE ro_formato_envios SET estado = 'enviado', enviado_at = ?, updated_at = ? WHERE id = ?").bind(Date.now(), Date.now(), e.id).run();
    await audit(c, `Envió «${e.titulo}» al distrito`, { modulo: MOD });
    return json({ ok: true });
  });
  r.post('/api/formatos/envios/:id/proyecto', `manager:${MOD}`, async (c) => {
    const e = await envioDelClub(c, c.params.id), t = Date.now();
    if (e.estado !== 'aprobado') throw new HttpError(409, 'El distrito aún no lo aprueba');
    if (e.proyecto_id && await one(c.env, 'SELECT id FROM ro_proyectos WHERE id = ? AND business_id = ?', e.proyecto_id, c.businessId)) return json({ id: e.proyecto_id });
    const { p, bloques } = proyectoDesde(e);
    const x = await c.env.DB.prepare(`INSERT INTO ro_proyectos (business_id, nombre, descripcion, objetivo, estado, fecha_inicio, fecha_fin, beneficiados, horas_servicio, presupuesto, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, p.nombre, p.descripcion, p.objetivo, p.estado, p.fecha_inicio, p.fecha_fin, p.beneficiados || 0, p.horas_servicio || 0, p.presupuesto || 0, t, t).run();
    const pid = x.meta.last_row_id;
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO ro_proyecto_docs (business_id, proyecto_id, nombre, tipo, bloques, subido_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(c.businessId, pid, `${e.formato_nombre || 'Formato del distrito'} (aprobado)`, 'documento', JSON.stringify(bloques), c.session.user_id, t, t),
      c.env.DB.prepare('UPDATE ro_formato_envios SET proyecto_id = ?, updated_at = ? WHERE id = ?').bind(pid, t, e.id),
    ]);
    await audit(c, `Creó el proyecto «${p.nombre}» desde la solicitud aprobada por el distrito`, { modulo: MOD });
    return json({ id: pid }, 201);
  });
}
