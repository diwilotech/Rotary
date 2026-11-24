// Calendario del club para Inicio: en un solo lugar las reuniones y eventos, los vencimientos de tareas, los cumpleaños de los
// socios, el inicio y cierre de proyectos y las fechas de cuotas (del club y distritales). Cada fuente solo aparece si su módulo
// está activo y la persona lo puede ver. En el perfil del distrito: los eventos de todos sus clubes y las cuotas distritales.
//   GET /api/club/calendario?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
import { json, HttpError } from '../lib/http.js';
import { all } from '../lib/crud.js';
import { visibleModules } from '../lib/modules.js';
import { distritoDe, clubesDelDistrito, EN_DISTRITO, enDistrito } from '../lib/rotaract.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function routes(r) {
  r.get('/api/club/calendario', 'tenant', async (c) => {
    const desde = c.url.searchParams.get('desde'), hasta = c.url.searchParams.get('hasta');
    if (!FECHA.test(desde || '') || !FECHA.test(hasta || '') || hasta < desde || Date.parse(hasta) - Date.parse(desde) > 100 * 864e5) throw new HttpError(400, 'Rango de fechas no válido (máximo 100 días)');
    const bid = c.businessId, d = await distritoDe(c.env, bid), items = [];
    const add = (tipo, fecha, titulo, extra = {}) => items.push({ tipo, fecha, titulo, ...extra });

    if (d.es_distrito) {
      const clubes = await clubesDelDistrito(c.env, d.codigo), ids = clubes.map((x) => x.id);
      if (ids.length) {
        const ev = await all(c.env, `SELECT business_id, titulo, fecha, hora_ini, lugar FROM ro_reuniones WHERE ${EN_DISTRITO} AND tipo = 'evento' AND estado <> 'cancelada' AND fecha BETWEEN ? AND ?`, ...enDistrito(c.env, d.codigo), desde, hasta);
        for (const e of ev) add('evento', e.fecha, e.titulo, { hora: e.hora_ini, lugar: e.lugar, club: clubes.find((k) => k.id === e.business_id)?.name, ruta: '/staff/distrito.html' });
      }
      for (const q of await all(c.env, 'SELECT nombre, vence FROM ro_cuota_distrital WHERE distrito = ? AND vence BETWEEN ? AND ?', d.codigo, desde, hasta)) add('distrital', q.vence, `Vence: ${q.nombre}`, { ruta: '/staff/distrito.html#cuotas' });
      return json({ desde, hasta, distrito: d.codigo, rows: items.sort((a, b) => a.fecha.localeCompare(b.fecha)) });
    }

    const mods = new Set((await visibleModules(c.env, bid, c.role, c.modulos)).map((m) => m.id));
    const q = [];
    if (mods.has('reuniones')) q.push(all(c.env, "SELECT id, tipo, titulo, fecha, hora_ini, lugar FROM ro_reuniones WHERE business_id = ? AND estado <> 'cancelada' AND fecha BETWEEN ? AND ?", bid, desde, hasta)
      .then((rs) => rs.forEach((x) => add(['evento', 'obra'].includes(x.tipo) ? x.tipo : 'reunion', x.fecha, x.titulo, { hora: x.hora_ini, lugar: x.lugar, ruta: '/staff/reuniones.html' }))));
    if (mods.has('tareas')) q.push(all(c.env, `SELECT t.titulo, t.fecha_limite, s.nombre socio FROM ro_tareas t LEFT JOIN ro_socios s ON s.id = t.socio_id AND s.business_id = t.business_id
        WHERE t.business_id = ? AND t.estado IN ('pendiente', 'en_curso') AND t.fecha_limite BETWEEN ? AND ?`, bid, desde, hasta)
      .then((rs) => rs.forEach((x) => add('tarea', x.fecha_limite, x.titulo, { detalle: x.socio, ruta: '/staff/tareas.html' }))));
    if (mods.has('socios')) q.push(all(c.env, "SELECT nombre, fecha_nacimiento FROM ro_socios WHERE business_id = ? AND estado = 'activo' AND fecha_nacimiento IS NOT NULL", bid)
      .then((rs) => {
        // Cumpleaños: solo día y mes (no se muestra la edad ni el año)
        for (let y = +desde.slice(0, 4); y <= +hasta.slice(0, 4); y++) for (const x of rs) {
          const f = `${y}-${String(x.fecha_nacimiento).slice(5, 10)}`;
          if (FECHA.test(f) && f >= desde && f <= hasta) add('cumple', f, `Cumpleaños de ${x.nombre.split(' ')[0]}`, { detalle: x.nombre, ruta: '/staff/socios.html' });
        }
      }));
    if (mods.has('impacto')) q.push(all(c.env, "SELECT nombre, fecha_inicio, fecha_fin FROM ro_proyectos WHERE business_id = ? AND estado <> 'cancelado' AND (fecha_inicio BETWEEN ? AND ? OR fecha_fin BETWEEN ? AND ?)", bid, desde, hasta, desde, hasta)
      .then((rs) => rs.forEach((x) => {
        if (x.fecha_inicio >= desde && x.fecha_inicio <= hasta) add('proyecto', x.fecha_inicio, `Arranca: ${x.nombre}`, { ruta: '/staff/impacto.html' });
        if (x.fecha_fin && x.fecha_fin >= desde && x.fecha_fin <= hasta) add('proyecto', x.fecha_fin, `Cierra: ${x.nombre}`, { ruta: '/staff/impacto.html' });
      })));
    if (mods.has('cuotas')) q.push(all(c.env, 'SELECT nombre, vence FROM ro_periodos WHERE business_id = ? AND vence BETWEEN ? AND ?', bid, desde, hasta)
      .then((rs) => rs.forEach((x) => add('cuota', x.vence, `Vence la cuota de ${x.nombre}`, { ruta: '/staff/cuotas.html' }))));
    if (mods.has('cajas')) q.push(all(c.env, 'SELECT nombre, vence FROM ro_cuota_distrital WHERE distrito = ? AND vence BETWEEN ? AND ?', d.codigo, desde, hasta)
      .then((rs) => rs.forEach((x) => add('distrital', x.vence, `Cuota distrital: ${x.nombre}`, { ruta: '/staff/cajas.html#menor' }))));
    await Promise.all(q);
    return json({ desde, hasta, rows: items.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.hora || '').localeCompare(String(b.hora || ''))) });
  });
}
