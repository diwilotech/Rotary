// Impacto: proyectos de servicio (tarjetas con beneficiados, tareas, alianzas y origen de los recursos), beneficiarios y alianzas.
// Origen de los recursos: caja_mayor (sale de la Caja mayor del club), externa (financiador externo) o doble (ambas).
//   CRUD /api/impacto/proyectos · /api/impacto/beneficiarios · /api/impacto/alianzas
//   GET  /api/impacto/tarjetas          proyectos con sus indicadores para las tarjetas
//   GET  /api/impacto/proyectos/:id/detalle
//   GET  /api/impacto/resumen
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

export const ENTITIES = {
  proyectos: { table: 'ro_proyectos', label: 'el proyecto', title: 'nombre', search: ['nombre', 'descripcion', 'financiador'], crear: 'manager',
    order: "CASE estado WHEN 'en_curso' THEN 0 WHEN 'planeacion' THEN 1 WHEN 'propuesta' THEN 2 WHEN 'finalizado' THEN 3 ELSE 4 END, fecha_inicio DESC",
    fields: { nombre: 'text!', descripcion: 'long', objetivo: 'long', estado: ESTADOS, fecha_inicio: 'date', fecha_fin: 'date', socio_lider_id: 'int', foto_url: 'url',
      beneficiados: 'int', horas_servicio: 'int', financiacion: FINANCIACION, presupuesto: 'money', monto_caja_mayor: 'money', monto_externo: 'money', financiador: 'text',
      comunidad: 'text', comunidad_lugar: 'text', comunidad_contacto: 'text', comunidad_descripcion: 'long' },
    refs: { socio_lider_id: 'ro_socios' },
    beforeCreate: (c, row) => financiacion(row), beforeUpdate: (c, row, before) => financiacion(row, before),
    async beforeDelete(c, before) {
      const n = await one(c.env, 'SELECT (SELECT COUNT(*) FROM ro_movimientos WHERE business_id = ?1 AND proyecto_id = ?2) + (SELECT COUNT(*) FROM ro_tareas WHERE business_id = ?1 AND proyecto_id = ?2) + (SELECT COUNT(*) FROM ro_beneficiarios WHERE business_id = ?1 AND proyecto_id = ?2) n', c.businessId, before.id);
      if (n.n) throw new HttpError(409, 'El proyecto tiene movimientos, tareas o beneficiarios: márcalo como cancelado');
    } },
  beneficiarios: { table: 'ro_beneficiarios', label: 'el beneficiario', title: 'nombre', search: ['nombre', 'tipo'], order: 'nombre',
    fields: { proyecto_id: 'int', nombre: 'text!', tipo: 'text', edad: 'int', autorizacion_datos: 'bool', autorizacion_imagen: 'bool', notas: 'long' },
    refs: { proyecto_id: 'ro_proyectos' } },
  alianzas: { table: 'ro_alianzas', label: 'la alianza', title: 'nombre', search: ['nombre', 'tipo', 'contacto', 'municipio'], order: "CASE estado WHEN 'activa' THEN 0 WHEN 'seguimiento' THEN 1 WHEN 'prospecto' THEN 2 ELSE 3 END, nombre",
    fields: { proyecto_id: 'int', nombre: 'text!', tipo: 'text', contacto: 'text', telefono: 'text', correo: 'email', municipio: 'text', estado: ['prospecto', 'seguimiento', 'activa', 'cerrada', 'descartada'],
      descripcion: 'long', proximo_paso: 'text', proximo_paso_fecha: 'date', ultimo_contacto: 'date', tipo_aporte: APORTES, aporte_comprometido: 'money', aporte_recibido: 'money' },
    refs: { proyecto_id: 'ro_proyectos' } },
};

async function tarjetas(c, id = null) {
  const ps = await all(c.env, `SELECT * FROM ro_proyectos WHERE business_id = ? ${id ? 'AND id = ?' : ''} ORDER BY ${ENTITIES.proyectos.order}`, c.businessId, ...(id ? [id] : []));
  if (!ps.length) return [];
  const agg = async (sql) => Object.fromEntries((await all(c.env, sql, c.businessId)).map((x) => [x.pid, x]));
  const [ben, tar, ali, mov, lid] = await Promise.all([
    agg('SELECT proyecto_id pid, COUNT(*) n FROM ro_beneficiarios WHERE business_id = ? AND proyecto_id IS NOT NULL GROUP BY proyecto_id'),
    agg("SELECT proyecto_id pid, COUNT(*) n, SUM(estado = 'hecha') hechas FROM ro_tareas WHERE business_id = ? AND proyecto_id IS NOT NULL AND estado <> 'cancelada' GROUP BY proyecto_id"),
    agg('SELECT proyecto_id pid, COUNT(*) n, GROUP_CONCAT(nombre, \' · \') nombres FROM ro_alianzas WHERE business_id = ? AND proyecto_id IS NOT NULL GROUP BY proyecto_id'),
    agg("SELECT proyecto_id pid, SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) gastado, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) ingresos FROM ro_movimientos WHERE business_id = ? AND caja = 'mayor' AND proyecto_id IS NOT NULL GROUP BY proyecto_id"),
    agg('SELECT id pid, nombre FROM ro_socios WHERE business_id = ?'),
  ]);
  return ps.map((p) => ({ ...p, lider: lid[p.socio_lider_id]?.nombre || null,
    beneficiados_total: Math.max(p.beneficiados || 0, ben[p.id]?.n || 0), beneficiarios_registrados: ben[p.id]?.n || 0,
    tareas: tar[p.id]?.n || 0, tareas_hechas: tar[p.id]?.hechas || 0, alianzas: ali[p.id]?.n || 0, alianzas_nombres: ali[p.id]?.nombres || '',
    gastado_caja_mayor: mov[p.id]?.gastado || 0, ingresos_caja_mayor: mov[p.id]?.ingresos || 0 }));
}

export function routes(r) {
  crud(r, { base: '/api/impacto', modulo: MOD, entities: ENTITIES });
  r.get('/api/impacto/tarjetas', `tenant:${MOD}`, async (c) => json({ rows: await tarjetas(c) }));
  r.get('/api/impacto/proyectos/:id/detalle', `tenant:${MOD}`, async (c) => {
    const [p] = await tarjetas(c, Number(c.params.id) || 0);
    if (!p) throw new HttpError(404, 'Proyecto no encontrado');
    const [beneficiarios, tareas, alianzas, movimientos] = await Promise.all([
      all(c.env, 'SELECT id, nombre, tipo, edad, autorizacion_datos, autorizacion_imagen FROM ro_beneficiarios WHERE business_id = ? AND proyecto_id = ? ORDER BY nombre', c.businessId, p.id),
      all(c.env, "SELECT t.id, t.titulo, t.estado, t.fecha_limite, s.nombre responsable FROM ro_tareas t LEFT JOIN ro_socios s ON s.id = t.socio_id AND s.business_id = t.business_id WHERE t.business_id = ? AND t.proyecto_id = ? AND t.estado <> 'cancelada' ORDER BY t.estado = 'hecha', t.fecha_limite", c.businessId, p.id),
      all(c.env, 'SELECT id, nombre, tipo, estado, contacto, telefono, correo, tipo_aporte, aporte_comprometido, aporte_recibido, descripcion FROM ro_alianzas WHERE business_id = ? AND proyecto_id = ? ORDER BY nombre', c.businessId, p.id),
      ['owner', 'admin'].includes(c.role) ? all(c.env, "SELECT id, fecha, tipo, concepto, categoria, monto FROM ro_movimientos WHERE business_id = ? AND proyecto_id = ? AND caja = 'mayor' ORDER BY fecha DESC", c.businessId, p.id) : [],
    ]);
    const docs = (await all(c.env, 'SELECT id, nombre, tipo, mime, url, archivo_key IS NOT NULL archivo, notas, created_at FROM ro_proyecto_docs WHERE business_id = ? AND proyecto_id = ? ORDER BY created_at DESC', c.businessId, p.id));
    return json({ proyecto: p, beneficiarios, tareas, alianzas, movimientos, docs });
  });
  /* Documentación del proyecto: archivos (PDF/imagen, máx. 8 MB) o enlaces (Drive, etc.) */
  const proyOr404 = async (c, id) => { const p = await one(c.env, 'SELECT id, nombre FROM ro_proyectos WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId); if (!p) throw new HttpError(404, 'Proyecto no encontrado'); return p; };
  const docOr404 = async (c, id) => { const d = await one(c.env, 'SELECT * FROM ro_proyecto_docs WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId); if (!d) throw new HttpError(404, 'Documento no encontrado'); return d; };
  r.post('/api/impacto/proyectos/:id/docs', `tenant:${MOD}`, async (c) => {
    const p = await proyOr404(c, c.params.id), t = Date.now();
    if ((c.req.headers.get('content-type') || '').includes('json')) {
      const b = await readJson(c.req), nombre = cast('nombre', 'text', b.nombre), url = cast('url', 'url', b.url);
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
  r.get('/api/impacto/docs/:id', `tenant:${MOD}`, async (c) => { const d = await docOr404(c, c.params.id); if (!d.archivo_key) return Response.redirect(d.url, 302); return servirArchivo(c, { key: d.archivo_key, mime: d.mime, nombre: d.nombre }); });
  r.delete('/api/impacto/docs/:id', `manager:${MOD}`, async (c) => {
    const d = await docOr404(c, c.params.id);
    await c.env.DB.prepare('DELETE FROM ro_proyecto_docs WHERE id = ? AND business_id = ?').bind(d.id, c.businessId).run();
    await borrarArchivo(c.env, d.archivo_key);
    return json({ ok: true });
  });

  r.get('/api/impacto/resumen', `tenant:${MOD}`, async (c) => {
    const t = await tarjetas(c);
    const vivos = t.filter((p) => ['en_curso', 'planeacion'].includes(p.estado));
    return json({ valor: vivos.length, en_curso: vivos.length, beneficiados: t.reduce((s, p) => s + p.beneficiados_total, 0), horas: t.reduce((s, p) => s + (p.horas_servicio || 0), 0), proyectos: t.length,
      alianzas_activas: (await one(c.env, "SELECT COUNT(*) n FROM ro_alianzas WHERE business_id = ? AND estado IN ('activa','seguimiento')", c.businessId)).n });
  });
}
