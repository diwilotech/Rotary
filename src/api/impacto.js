// Impacto: proyectos de servicio, alianzas y comunidades (cada comunidad con sus beneficiarios).
// Financiación por aportes (ro_proyecto_aportes): del club (Caja mayor) o de una alianza, con cuánto ayuda y cuánto llegó.
// Al cambiar los aportes se recalculan financiacion (caja_mayor | externa | doble), monto_caja_mayor, monto_externo y financiador del proyecto.
//   CRUD /api/impacto/proyectos · /alianzas · /comunidades · /beneficiarios · /aportes
//   GET  /api/impacto/tarjetas · /proyectos/:id/detalle · /comunidades/:id/detalle · /resumen
//   Documentación: POST /proyectos/:id/docs (archivo, enlace o documento con bloques) · GET|PATCH|DELETE /docs/:id
//                  POST /archivos?nombre= (imagen o PDF dentro de un documento) · GET|DELETE /archivos/:key
import { json, HttpError } from '../lib/http.js';
import { crud, all, one, cast } from '../lib/crud.js';
import { readJson } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from '../lib/archivos.js';

const MOD = 'impacto';
export const ESTADOS = ['propuesta', 'planeacion', 'en_curso', 'finalizado', 'cancelado'];
export const FINANCIACION = ['caja_mayor', 'externa', 'doble'];
export const APORTES = ['financiera', 'social', 'especie', 'academica', 'difusion', 'otra'];

function financiacion(row, before = {}) {
  const f = { ...before, ...row };
  if (f.financiacion === 'caja_mayor' && 'monto_externo' in row && row.monto_externo > 0) throw new HttpError(400, 'Con recursos solo de la Caja mayor no hay monto externo: elige «Doble financiación»');
  if (['externa', 'doble'].includes(f.financiacion) && !f.financiador && ('financiacion' in row || 'financiador' in row)) throw new HttpError(400, 'Indica quién es el financiador externo');
}

// Los totales del proyecto salen de sus aportes financieros (los ven las tarjetas, Finanzas y la IA).
async function sincronizar(c, pid) {
  if (!pid) return;
  const ap = await all(c.env, `SELECT a.origen, a.monto, al.nombre FROM ro_proyecto_aportes a LEFT JOIN ro_alianzas al ON al.id = a.alianza_id AND al.business_id = a.business_id
    WHERE a.business_id = ? AND a.proyecto_id = ? AND a.tipo_aporte = 'financiera'`, c.businessId, pid);
  const club = ap.filter((a) => a.origen === 'club').reduce((s, a) => s + a.monto, 0);
  const ext = ap.filter((a) => a.origen === 'alianza');
  const nombres = [...new Set(ext.map((a) => a.nombre).filter(Boolean))];
  const fin = ext.length && ap.some((a) => a.origen === 'club') ? 'doble' : ext.length ? 'externa' : 'caja_mayor';
  await c.env.DB.prepare('UPDATE ro_proyectos SET financiacion = ?, monto_caja_mayor = ?, monto_externo = ?, financiador = ?, updated_at = ? WHERE id = ? AND business_id = ?')
    .bind(fin, club, ext.reduce((s, a) => s + a.monto, 0), nombres.join(' · ') || null, Date.now(), pid, c.businessId).run();
}

function aporteValido(row, before = {}) {
  const f = { ...before, ...row };
  if (!f.proyecto_id) throw new HttpError(400, 'Elige el proyecto');
  if (f.origen === 'alianza' && !f.alianza_id) throw new HttpError(400, 'Elige la alianza que aporta');
  if (f.origen === 'club' && 'origen' in row) row.alianza_id = null;
  if ((f.monto || 0) < 0 || (f.recibido || 0) < 0) throw new HttpError(400, 'Los montos no pueden ser negativos');
}

export const ENTITIES = {
  proyectos: { table: 'ro_proyectos', label: 'el proyecto', title: 'nombre', search: ['nombre', 'descripcion', 'financiador'], crear: 'manager',
    order: "CASE estado WHEN 'en_curso' THEN 0 WHEN 'planeacion' THEN 1 WHEN 'propuesta' THEN 2 WHEN 'finalizado' THEN 3 ELSE 4 END, fecha_inicio DESC",
    fields: { nombre: 'text!', descripcion: 'long', objetivo: 'long', estado: ESTADOS, fecha_inicio: 'date', fecha_fin: 'date', socio_lider_id: 'int', foto_url: 'url',
      beneficiados: 'int', horas_servicio: 'int', financiacion: FINANCIACION, presupuesto: 'money', monto_caja_mayor: 'money', monto_externo: 'money', financiador: 'text',
      comunidad_id: 'int', comunidad: 'text', comunidad_lugar: 'text', comunidad_contacto: 'text', comunidad_descripcion: 'long' },
    refs: { socio_lider_id: 'ro_socios', comunidad_id: 'ro_comunidades' },
    beforeCreate: (c, row) => financiacion(row), beforeUpdate: (c, row, before) => financiacion(row, before),
    async beforeDelete(c, before) {
      const n = await one(c.env, 'SELECT (SELECT COUNT(*) FROM ro_movimientos WHERE business_id = ?1 AND proyecto_id = ?2) + (SELECT COUNT(*) FROM ro_tareas WHERE business_id = ?1 AND proyecto_id = ?2) + (SELECT COUNT(*) FROM ro_beneficiarios WHERE business_id = ?1 AND proyecto_id = ?2) n', c.businessId, before.id);
      if (n.n) throw new HttpError(409, 'El proyecto tiene movimientos, tareas o beneficiarios: márcalo como cancelado');
    },
    async afterDelete(c, before) {
      await c.env.DB.prepare('DELETE FROM ro_proyecto_aportes WHERE business_id = ? AND proyecto_id = ?').bind(c.businessId, before.id).run();
    } },
  comunidades: { table: 'ro_comunidades', label: 'la comunidad', title: 'nombre', search: ['nombre', 'tipo', 'lugar', 'contacto'], order: 'nombre',
    fields: { nombre: 'text!', tipo: 'text', lugar: 'text', contacto: 'text', telefono: 'text', descripcion: 'long', foto_url: 'url' },
    async beforeDelete(c, before) {
      const n = await one(c.env, 'SELECT (SELECT COUNT(*) FROM ro_proyectos WHERE business_id = ?1 AND comunidad_id = ?2) + (SELECT COUNT(*) FROM ro_beneficiarios WHERE business_id = ?1 AND comunidad_id = ?2) n', c.businessId, before.id);
      if (n.n) throw new HttpError(409, 'La comunidad tiene proyectos o beneficiarios: quítalos primero');
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const ben = Object.fromEntries((await all(c.env, 'SELECT comunidad_id k, COUNT(*) n FROM ro_beneficiarios WHERE business_id = ? AND comunidad_id IS NOT NULL GROUP BY comunidad_id', c.businessId)).map((x) => [x.k, x.n]));
      const pro = Object.fromEntries((await all(c.env, "SELECT comunidad_id k, COUNT(*) n, GROUP_CONCAT(nombre, ' · ') nombres FROM ro_proyectos WHERE business_id = ? AND comunidad_id IS NOT NULL GROUP BY comunidad_id", c.businessId)).map((x) => [x.k, x]));
      return rows.map((r) => ({ ...r, beneficiarios: ben[r.id] || 0, proyectos: pro[r.id]?.n || 0, proyectos_nombres: pro[r.id]?.nombres || '' }));
    } },
  beneficiarios: { table: 'ro_beneficiarios', label: 'el beneficiario', title: 'nombre', search: ['nombre', 'tipo'], order: 'nombre',
    fields: { comunidad_id: 'int', proyecto_id: 'int', nombre: 'text!', tipo: 'text', edad: 'int', autorizacion_datos: 'bool', autorizacion_imagen: 'bool', notas: 'long' },
    refs: { proyecto_id: 'ro_proyectos', comunidad_id: 'ro_comunidades' },
    async beforeCreate(c, row) {   // si llega solo el proyecto, queda en la comunidad del proyecto
      if (!row.comunidad_id && row.proyecto_id) row.comunidad_id = (await one(c.env, 'SELECT comunidad_id FROM ro_proyectos WHERE id = ? AND business_id = ?', row.proyecto_id, c.businessId))?.comunidad_id ?? null;
    } },
  alianzas: { table: 'ro_alianzas', label: 'la alianza', title: 'nombre', search: ['nombre', 'tipo', 'contacto', 'municipio'], order: "CASE estado WHEN 'activa' THEN 0 WHEN 'seguimiento' THEN 1 WHEN 'prospecto' THEN 2 ELSE 3 END, nombre",
    fields: { proyecto_id: 'int', nombre: 'text!', tipo: 'text', contacto: 'text', telefono: 'text', correo: 'email', municipio: 'text', estado: ['prospecto', 'seguimiento', 'activa', 'cerrada', 'descartada'],
      descripcion: 'long', proximo_paso: 'text', proximo_paso_fecha: 'date', ultimo_contacto: 'date', tipo_aporte: APORTES, aporte_comprometido: 'money', aporte_recibido: 'money' },
    refs: { proyecto_id: 'ro_proyectos' },
    async afterCreate(c, id, row) {   // compatibilidad (IA, importación): una alianza creada con proyecto queda como aporte de ese proyecto
      if (!row.proyecto_id) return;
      const t = Date.now();
      await c.env.DB.prepare('INSERT INTO ro_proyecto_aportes (business_id, proyecto_id, origen, alianza_id, tipo_aporte, monto, recibido, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(c.businessId, row.proyecto_id, 'alianza', id, row.tipo_aporte || 'otra', row.aporte_comprometido || 0, row.aporte_recibido || 0, t, t).run();
      if (row.aporte_comprometido > 0 && (row.tipo_aporte || 'financiera') === 'financiera') await sincronizar(c, row.proyecto_id);
    },
    async beforeDelete(c, before) {
      if ((await one(c.env, 'SELECT COUNT(*) n FROM ro_proyecto_aportes WHERE business_id = ? AND alianza_id = ?', c.businessId, before.id)).n) throw new HttpError(409, 'La alianza tiene aportes en proyectos: quítalos primero o márcala como cerrada');
    },
    async decorate(c, rows) {   // lo que aporta en todos los proyectos
      if (!rows.length) return rows;
      const ap = await all(c.env, `SELECT a.alianza_id k, COUNT(DISTINCT a.proyecto_id) n, SUM(CASE WHEN a.tipo_aporte = 'financiera' THEN a.monto ELSE 0 END) monto, SUM(CASE WHEN a.tipo_aporte = 'financiera' THEN a.recibido ELSE 0 END) recibido,
        GROUP_CONCAT(DISTINCT p.nombre) nombres FROM ro_proyecto_aportes a LEFT JOIN ro_proyectos p ON p.id = a.proyecto_id AND p.business_id = a.business_id
        WHERE a.business_id = ? AND a.alianza_id IS NOT NULL GROUP BY a.alianza_id`, c.businessId);
      const m = Object.fromEntries(ap.map((x) => [x.k, x]));
      return rows.map((r) => ({ ...r, proyectos: m[r.id]?.n || 0, proyectos_nombres: (m[r.id]?.nombres || '').replace(/,/g, ' · '), aporta: m[r.id]?.monto || 0, aporto: m[r.id]?.recibido || 0 }));
    } },
  aportes: { table: 'ro_proyecto_aportes', label: 'el aporte', crear: 'manager', borrar: 'manager', order: "origen = 'alianza', id",
    fields: { proyecto_id: 'int', origen: ['club', 'alianza'], alianza_id: 'int', tipo_aporte: APORTES, monto: 'money', recibido: 'money', notas: 'long' },
    refs: { proyecto_id: 'ro_proyectos', alianza_id: 'ro_alianzas' },
    beforeCreate: (c, row) => aporteValido(row), beforeUpdate: (c, row, before) => aporteValido(row, before),
    afterCreate: (c, id, row) => sincronizar(c, row.proyecto_id),
    async afterUpdate(c, id, row, before) { await sincronizar(c, before.proyecto_id); if (row.proyecto_id && row.proyecto_id !== before.proyecto_id) await sincronizar(c, row.proyecto_id); },
    afterDelete: (c, before) => sincronizar(c, before.proyecto_id) },
};

async function tarjetas(c, id = null) {
  const ps = await all(c.env, `SELECT * FROM ro_proyectos WHERE business_id = ? ${id ? 'AND id = ?' : ''} ORDER BY ${ENTITIES.proyectos.order}`, c.businessId, ...(id ? [id] : []));
  if (!ps.length) return [];
  const agg = async (sql) => Object.fromEntries((await all(c.env, sql, c.businessId)).map((x) => [x.pid, x]));
  const [benP, benC, tar, ali, mov, lid, com] = await Promise.all([
    agg('SELECT proyecto_id pid, COUNT(*) n FROM ro_beneficiarios WHERE business_id = ? AND proyecto_id IS NOT NULL GROUP BY proyecto_id'),
    agg('SELECT comunidad_id pid, COUNT(*) n FROM ro_beneficiarios WHERE business_id = ? AND comunidad_id IS NOT NULL GROUP BY comunidad_id'),
    agg("SELECT proyecto_id pid, COUNT(*) n, SUM(estado = 'hecha') hechas FROM ro_tareas WHERE business_id = ? AND proyecto_id IS NOT NULL AND estado <> 'cancelada' GROUP BY proyecto_id"),
    agg(`SELECT a.proyecto_id pid, COUNT(DISTINCT a.alianza_id) n, GROUP_CONCAT(DISTINCT al.nombre) nombres FROM ro_proyecto_aportes a JOIN ro_alianzas al ON al.id = a.alianza_id AND al.business_id = a.business_id
      WHERE a.business_id = ? AND a.origen = 'alianza' GROUP BY a.proyecto_id`),
    agg("SELECT proyecto_id pid, SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) gastado, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) ingresos FROM ro_movimientos WHERE business_id = ? AND caja = 'mayor' AND proyecto_id IS NOT NULL GROUP BY proyecto_id"),
    agg('SELECT id pid, nombre FROM ro_socios WHERE business_id = ?'),
    agg('SELECT id pid, nombre, lugar FROM ro_comunidades WHERE business_id = ?'),
  ]);
  return ps.map((p) => {
    const registrados = p.comunidad_id ? benC[p.comunidad_id]?.n || 0 : benP[p.id]?.n || 0;
    const cm = com[p.comunidad_id];
    return { ...p, lider: lid[p.socio_lider_id]?.nombre || null, comunidad: cm?.nombre || p.comunidad || null, comunidad_lugar: cm ? cm.lugar : p.comunidad_lugar,
      beneficiados_total: Math.max(p.beneficiados || 0, registrados), beneficiarios_registrados: registrados,
      tareas: tar[p.id]?.n || 0, tareas_hechas: tar[p.id]?.hechas || 0, alianzas: ali[p.id]?.n || 0, alianzas_nombres: (ali[p.id]?.nombres || '').replace(/,/g, ' · '),
      gastado_caja_mayor: mov[p.id]?.gastado || 0, ingresos_caja_mayor: mov[p.id]?.ingresos || 0 };
  });
}

/* ---------- Documentos escritos en el editor: bloques ---------- */
const TEXTOS = ['texto', 'titulo', 'subtitulo', 'destacado', 'lista', 'numerada'];
const TIPOS = [...TEXTOS, 'separador', 'enlace', 'archivo', 'tabla'];
function limpiarBloques(c, bl) {
  if (!Array.isArray(bl)) throw new HttpError(400, 'El documento no es válido');
  const out = bl.slice(0, 300).map((b) => {
    if (!TIPOS.includes(b?.tipo)) throw new HttpError(400, 'Tipo de bloque no válido');
    const o = { tipo: b.tipo };
    if (TEXTOS.includes(b.tipo)) o.texto = String(b.texto || '').slice(0, 20000);
    if (b.tipo === 'enlace') {
      const u = String(b.url || '').trim();
      if (!/^https:\/\//i.test(u)) throw new HttpError(400, 'Los enlaces deben empezar por https://');
      Object.assign(o, { url: u.slice(0, 800), nombre: String(b.nombre || u).slice(0, 200) });
    }
    if (b.tipo === 'archivo') {
      const key = String(b.key || '');
      if (!key.startsWith(`${c.businessId}/proyectos/`)) throw new HttpError(400, 'Archivo no válido');
      Object.assign(o, { key, nombre: String(b.nombre || 'archivo').slice(0, 200), tipoArchivo: String(b.tipoArchivo || '').slice(0, 100), size: Math.max(0, Math.round(Number(b.size) || 0)) });
      if (['izq', 'der', 'completo'].includes(b.diseno)) o.diseno = b.diseno;
      if (b.titulo) o.titulo = String(b.titulo).slice(0, 200);
      if (b.texto) o.texto = String(b.texto).slice(0, 5000);
    }
    if (b.tipo === 'tabla') {
      const filas = (Array.isArray(b.filas) ? b.filas : []).slice(0, 80).map((f) => (Array.isArray(f) ? f : []).slice(0, 12).map((x) => String(x ?? '').slice(0, 1000)));
      const ancho = Math.max(1, ...filas.map((f) => f.length));
      o.filas = (filas.length ? filas : [['']]).map((f) => [...f, ...Array(ancho - f.length).fill('')]);
      o.encabezado = b.encabezado === false || b.encabezado === 0 ? 0 : 1;
    }
    return o;
  });
  const s = JSON.stringify(out);
  if (s.length > 300000) throw new HttpError(400, 'El documento es demasiado grande');
  return s;
}
const llavesDe = (bloques) => { try { return JSON.parse(bloques || '[]').filter((b) => b.tipo === 'archivo').map((b) => b.key); } catch { return []; } };
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export function routes(r) {
  crud(r, { base: '/api/impacto', modulo: MOD, entities: ENTITIES });
  r.get('/api/impacto/tarjetas', `tenant:${MOD}`, async (c) => json({ rows: await tarjetas(c) }));
  r.get('/api/impacto/proyectos/:id/detalle', `tenant:${MOD}`, async (c) => {
    const [p] = await tarjetas(c, Number(c.params.id) || 0);
    if (!p) throw new HttpError(404, 'Proyecto no encontrado');
    const [comunidad, beneficiarios, tareas, aportes, movimientos, docs] = await Promise.all([
      p.comunidad_id ? one(c.env, 'SELECT * FROM ro_comunidades WHERE id = ? AND business_id = ?', p.comunidad_id, c.businessId) : null,
      all(c.env, `SELECT id, nombre, tipo, edad, autorizacion_datos, autorizacion_imagen, proyecto_id FROM ro_beneficiarios WHERE business_id = ? AND ${p.comunidad_id ? 'comunidad_id' : 'proyecto_id'} = ? ORDER BY nombre`, c.businessId, p.comunidad_id || p.id),
      all(c.env, "SELECT t.id, t.titulo, t.estado, t.fecha_limite, s.nombre responsable FROM ro_tareas t LEFT JOIN ro_socios s ON s.id = t.socio_id AND s.business_id = t.business_id WHERE t.business_id = ? AND t.proyecto_id = ? AND t.estado <> 'cancelada' ORDER BY t.estado = 'hecha', t.fecha_limite", c.businessId, p.id),
      all(c.env, `SELECT a.*, al.nombre, al.tipo, al.estado, al.contacto, al.telefono, al.correo FROM ro_proyecto_aportes a LEFT JOIN ro_alianzas al ON al.id = a.alianza_id AND al.business_id = a.business_id
        WHERE a.business_id = ? AND a.proyecto_id = ? ORDER BY a.origen = 'alianza', a.id`, c.businessId, p.id),
      ['owner', 'admin'].includes(c.role) ? all(c.env, "SELECT id, fecha, tipo, concepto, categoria, monto FROM ro_movimientos WHERE business_id = ? AND proyecto_id = ? AND caja = 'mayor' ORDER BY fecha DESC", c.businessId, p.id) : [],
      all(c.env, 'SELECT id, nombre, tipo, mime, url, archivo_key IS NOT NULL archivo, notas, created_at, updated_at FROM ro_proyecto_docs WHERE business_id = ? AND proyecto_id = ? ORDER BY created_at DESC', c.businessId, p.id),
    ]);
    return json({ proyecto: p, comunidad, beneficiarios, tareas, aportes, alianzas: aportes.filter((a) => a.origen === 'alianza'), movimientos, docs });
  });
  r.get('/api/impacto/comunidades/:id/detalle', `tenant:${MOD}`, async (c) => {
    const id = Number(c.params.id) || 0;
    const [comunidad] = await ENTITIES.comunidades.decorate(c, await all(c.env, 'SELECT * FROM ro_comunidades WHERE id = ? AND business_id = ?', id, c.businessId));
    if (!comunidad) throw new HttpError(404, 'Comunidad no encontrada');
    const proyectos = (await tarjetas(c)).filter((p) => p.comunidad_id === id);
    return json({ comunidad, proyectos });
  });

  /* Documentación del proyecto: archivos (PDF/imagen, máx. 8 MB), enlaces o documentos escritos en el editor */
  const proyOr404 = async (c, id) => { const p = await one(c.env, 'SELECT id, nombre FROM ro_proyectos WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId); if (!p) throw new HttpError(404, 'Proyecto no encontrado'); return p; };
  const docOr404 = async (c, id) => { const d = await one(c.env, 'SELECT * FROM ro_proyecto_docs WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId); if (!d) throw new HttpError(404, 'Documento no encontrado'); return d; };
  r.post('/api/impacto/proyectos/:id/docs', `tenant:${MOD}`, async (c) => {
    const p = await proyOr404(c, c.params.id), t = Date.now();
    if ((c.req.headers.get('content-type') || '').includes('json')) {
      const b = await readJson(c.req), nombre = cast('nombre', 'text', b.nombre);
      if ('bloques' in b) {
        if (!nombre) throw new HttpError(400, 'Escribe el título del documento');
        const x = await c.env.DB.prepare('INSERT INTO ro_proyecto_docs (business_id, proyecto_id, nombre, tipo, bloques, subido_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(c.businessId, p.id, nombre, 'documento', limpiarBloques(c, b.bloques), c.session.user_id, t, t).run();
        await audit(c, `Escribió «${nombre}» en el proyecto ${p.nombre}`, { modulo: MOD });
        return json({ id: x.meta.last_row_id }, 201);
      }
      const url = cast('url', 'url', b.url);
      if (!nombre || !url) throw new HttpError(400, 'Escribe el nombre y el enlace');
      const x = await c.env.DB.prepare('INSERT INTO ro_proyecto_docs (business_id, proyecto_id, nombre, tipo, url, notas, subido_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(c.businessId, p.id, nombre, cast('tipo', 'text', b.tipo) || 'enlace', url, cast('notas', 'long', b.notas), c.session.user_id, t, t).run();
      return json({ id: x.meta.last_row_id }, 201);
    }
    const f = await guardarArchivo(c, 'proyectos', { max: 8 * 1024 * 1024 });
    const x = await c.env.DB.prepare('INSERT INTO ro_proyecto_docs (business_id, proyecto_id, nombre, tipo, archivo_key, mime, subido_por, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, p.id, f.nombre, f.mime === 'application/pdf' ? 'pdf' : 'imagen', f.key, f.mime, c.session.user_id, t, t).run();
    await audit(c, `Subió «${f.nombre}» al proyecto ${p.nombre}`, { modulo: MOD });
    return json({ id: x.meta.last_row_id }, 201);
  });
  r.get('/api/impacto/docs/:id', `tenant:${MOD}`, async (c) => {
    const d = await docOr404(c, c.params.id);
    if (d.tipo === 'documento') return json({ id: d.id, proyecto_id: d.proyecto_id, nombre: d.nombre, bloques: JSON.parse(d.bloques || '[]'), created_at: d.created_at, updated_at: d.updated_at });
    if (!d.archivo_key) return Response.redirect(d.url, 302);
    return servirArchivo(c, { key: d.archivo_key, mime: d.mime, nombre: d.nombre });
  });
  r.patch('/api/impacto/docs/:id', `tenant:${MOD}`, async (c) => {
    const d = await docOr404(c, c.params.id), b = await readJson(c.req);
    if (d.tipo !== 'documento') throw new HttpError(400, 'Solo se editan los documentos escritos aquí');
    const nombre = 'nombre' in b ? cast('nombre', 'text', b.nombre) : d.nombre;
    if (!nombre) throw new HttpError(400, 'Escribe el título del documento');
    const bloques = 'bloques' in b ? limpiarBloques(c, b.bloques) : d.bloques;
    await c.env.DB.prepare('UPDATE ro_proyecto_docs SET nombre = ?, bloques = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(nombre, bloques, Date.now(), d.id, c.businessId).run();
    const quedan = new Set(llavesDe(bloques));
    for (const k of llavesDe(d.bloques)) if (!quedan.has(k)) await borrarArchivo(c.env, k);
    await audit(c, `Editó el documento «${nombre}»`, { modulo: MOD });
    return json({ ok: true });
  });
  r.delete('/api/impacto/docs/:id', `manager:${MOD}`, async (c) => {
    const d = await docOr404(c, c.params.id);
    await c.env.DB.prepare('DELETE FROM ro_proyecto_docs WHERE id = ? AND business_id = ?').bind(d.id, c.businessId).run();
    await borrarArchivo(c.env, d.archivo_key);
    for (const k of llavesDe(d.bloques)) await borrarArchivo(c.env, k);
    return json({ ok: true });
  });
  // Imágenes y PDF que van dentro de un documento
  const llave = (c) => { const k = String(c.params.key || ''); if (!k.startsWith(`${c.businessId}/proyectos/`) || k.includes('..')) throw new HttpError(404, 'Archivo no encontrado'); return k; };
  r.post('/api/impacto/archivos', `tenant:${MOD}`, async (c) => {
    const len = Number(c.req.headers.get('content-length') || 0);
    const f = await guardarArchivo(c, 'proyectos/docs', { max: 8 * 1024 * 1024 });
    return json({ key: f.key, nombre: f.nombre, tipoArchivo: f.mime, size: len }, 201);
  });
  r.get('/api/impacto/archivos/:key', `tenant:${MOD}`, async (c) => {
    const k = llave(c);
    return servirArchivo(c, { key: k, mime: MIME[k.split('.').pop().toLowerCase()] || 'application/octet-stream', nombre: k.split('/').pop() });
  });
  r.delete('/api/impacto/archivos/:key', `tenant:${MOD}`, async (c) => {   // solo si ningún documento lo usa (archivos subidos sin guardar)
    const k = llave(c);
    if (!(await one(c.env, 'SELECT 1 FROM ro_proyecto_docs WHERE business_id = ? AND bloques LIKE ?', c.businessId, `%${k}%`))) await borrarArchivo(c.env, k);
    return json({ ok: true });
  });

  r.get('/api/impacto/resumen', `tenant:${MOD}`, async (c) => {
    const t = await tarjetas(c);
    const vivos = t.filter((p) => ['en_curso', 'planeacion'].includes(p.estado));
    return json({ valor: vivos.length, en_curso: vivos.length, beneficiados: t.reduce((s, p) => s + p.beneficiados_total, 0), horas: t.reduce((s, p) => s + (p.horas_servicio || 0), 0), proyectos: t.length,
      comunidades: (await one(c.env, 'SELECT COUNT(*) n FROM ro_comunidades WHERE business_id = ?', c.businessId)).n,
      alianzas_activas: (await one(c.env, "SELECT COUNT(*) n FROM ro_alianzas WHERE business_id = ? AND estado IN ('activa','seguimiento')", c.businessId)).n });
  });
}
