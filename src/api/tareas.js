// Tareas del club en kanban (pendiente → en curso → hecha), con responsable, fecha límite, proyecto o reunión y checklist.
//   CRUD /api/tareas/tareas   (cualquier socio crea y mueve; borrar: junta)
//   GET  /api/tareas/resumen
import { json, HttpError } from '../lib/http.js';
import { crud, all, one, today } from '../lib/crud.js';

const MOD = 'tareas';
export const ESTADOS = ['pendiente', 'en_curso', 'hecha', 'cancelada'];

function checklist(row) {
  if (row.checklist == null) return;
  let x; try { x = JSON.parse(row.checklist); } catch { throw new HttpError(400, 'Checklist no válida'); }
  if (!Array.isArray(x) || x.length > 50) throw new HttpError(400, 'Checklist no válida');
  row.checklist = JSON.stringify(x.map((i) => ({ texto: String(i.texto || '').slice(0, 200), hecho: !!i.hecho })).filter((i) => i.texto));
}

export const ENTITIES = {
  tareas: { table: 'ro_tareas', label: 'la tarea', title: 'titulo', search: ['titulo', 'descripcion'], order: "CASE estado WHEN 'en_curso' THEN 0 WHEN 'pendiente' THEN 1 WHEN 'hecha' THEN 2 ELSE 3 END, fecha_limite IS NULL, fecha_limite, orden",
    fields: { titulo: 'text!', descripcion: 'long', estado: ESTADOS, prioridad: ['normal', 'alta', 'baja'], fecha_limite: 'date', socio_id: 'int', proyecto_id: 'int', reunion_id: 'int', checklist: 'doc', orden: 'int' },
    refs: { socio_id: 'ro_socios', proyecto_id: 'ro_proyectos', reunion_id: 'ro_reuniones' },
    beforeCreate(c, row) { checklist(row); row.creada_por = c.session.user_id; if (row.estado === 'hecha') row.completada_at = Date.now(); },
    beforeUpdate(c, row, before) {
      checklist(row);
      if ('estado' in row && row.estado !== before.estado) row.completada_at = row.estado === 'hecha' ? Date.now() : null;
    },
    async decorate(c, rows) {
      if (!rows.length) return rows;
      const socios = await all(c.env, 'SELECT id, nombre FROM ro_socios WHERE business_id = ?', c.businessId);
      const proys = await all(c.env, 'SELECT id, nombre FROM ro_proyectos WHERE business_id = ?', c.businessId);
      const hoy = today();
      return rows.map((t) => {
        let ck = []; try { ck = JSON.parse(t.checklist || '[]'); } catch (_) {}
        return { ...t, checklist: ck, responsable: socios.find((s) => s.id === t.socio_id)?.nombre || null, proyecto: proys.find((p) => p.id === t.proyecto_id)?.nombre || null,
          vencida: !!t.fecha_limite && t.fecha_limite < hoy && !['hecha', 'cancelada'].includes(t.estado) };
      });
    } },
};

export function routes(r) {
  crud(r, { base: '/api/tareas', modulo: MOD, entities: ENTITIES });
  r.get('/api/tareas/resumen', `tenant:${MOD}`, async (c) => {
    const x = await one(c.env, `SELECT SUM(estado = 'pendiente') pendientes, SUM(estado = 'en_curso') en_curso, SUM(estado IN ('pendiente','en_curso') AND fecha_limite < ?) vencidas,
      SUM(estado = 'hecha' AND completada_at > ?) hechas_30d FROM ro_tareas WHERE business_id = ?`, today(), Date.now() - 30 * 864e5, c.businessId);
    return json({ valor: (x.pendientes || 0) + (x.en_curso || 0), pendientes: x.pendientes || 0, en_curso: x.en_curso || 0, vencidas: x.vencidas || 0, hechas_30d: x.hechas_30d || 0 });
  });
}
