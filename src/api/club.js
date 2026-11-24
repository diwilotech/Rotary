// Calendario del club para Inicio: en un solo lugar las reuniones y eventos, los vencimientos de tareas, los cumpleaños de los
// socios, el inicio y cierre de proyectos y las fechas de cuotas (del club y distritales). Cada fuente solo aparece si su módulo
// está activo y la persona lo puede ver. En el perfil del distrito: los eventos de todos sus clubes y las cuotas distritales.
//   GET /api/club/calendario?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
import { json, HttpError } from '../lib/http.js';
import { all, one, today } from '../lib/crud.js';
import { visibleModules } from '../lib/modules.js';
import { distritoDe, clubesDelDistrito, EN_DISTRITO, enDistrito, cartera, saldos } from '../lib/rotaract.js';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function routes(r) {
  // Cómo va el club (solo junta, para el Inicio): socios, cuotas, cajas, tareas vencidas, proyectos y la próxima reunión.
  // Cada bloque solo sale si su módulo está activo. Lo que pide atención va en `alertas` (texto + ruta).
  r.get('/api/club/resumen', 'manager', async (c) => {
    const bid = c.businessId, hoy = today();
    const mods = new Set((await visibleModules(c.env, bid, c.role, c.modulos)).map((m) => m.id));
    const out = { alertas: [] }, alerta = (texto, ruta, nivel = 'warning') => out.alertas.push({ texto, ruta, nivel });
    if (mods.has('socios')) {
      const MIEMBRO = "(tipo_membresia IN ('socio', 'honorario') OR (cargo IS NOT NULL AND cargo <> ''))";
      const x = await one(c.env, `SELECT SUM(estado = 'activo' AND ${MIEMBRO}) activos, SUM(estado = 'aspirante' OR (estado = 'activo' AND tipo_membresia = 'aspirante')) aspirantes,
        SUM(estado = 'activo' AND activado_at IS NULL AND ${MIEMBRO}) sin_activar FROM ro_socios WHERE business_id = ?`, bid);
      out.socios = { activos: x.activos || 0, aspirantes: x.aspirantes || 0, sin_activar: x.sin_activar || 0 };
      if (x.sin_activar) alerta(`${x.sin_activar} socio${x.sin_activar > 1 ? 's' : ''} activo${x.sin_activar > 1 ? 's' : ''} sin activación en el club (sin certificado)`, '/staff/socios.html#certificados');
    }
    if (mods.has('cuotas')) {
      const k = await cartera(c);
      const esperado = k.reduce((t, x) => t + x.esperado, 0), pagado = k.reduce((t, x) => t + Math.min(x.pagado, x.esperado), 0);
      const deben = k.filter((x) => x.estado === 'debe').length;
      out.cuotas = { pct: esperado ? Math.round((pagado / esperado) * 100) : 100, deben, socios: k.length, vencido: k.reduce((t, x) => t + x.vencido, 0) };
      if (deben) alerta(`${deben} socio${deben > 1 ? 's' : ''} con cuotas vencidas`, '/staff/cuotas.html');
      const pv = (await one(c.env, "SELECT COUNT(*) n FROM ro_pagos WHERE business_id = ? AND estado = 'pendiente'", bid)).n;
      if (pv) alerta(`${pv} pago${pv > 1 ? 's' : ''} reportado${pv > 1 ? 's' : ''} por verificar`, '/staff/cuotas.html', 'info');
    }
    if (mods.has('cajas')) {
      const s = await saldos(c.env, bid);
      out.cajas = s;
      for (const [k, n] of [['menor', 'Caja menor'], ['mayor', 'Caja mayor']]) if (s[k] < 0) alerta(`${n} en negativo: salió más de lo que entró. Revisa los ingresos que faltan por registrar`, `/staff/cajas.html#${k}`, 'danger');
    }
    if (mods.has('tareas')) {
      const t = await one(c.env, "SELECT SUM(estado IN ('pendiente','en_curso')) abiertas, SUM(estado IN ('pendiente','en_curso') AND fecha_limite < ?) vencidas FROM ro_tareas WHERE business_id = ?", hoy, bid);
      out.tareas = { abiertas: t.abiertas || 0, vencidas: t.vencidas || 0 };
      if (t.vencidas) alerta(`${t.vencidas} tarea${t.vencidas > 1 ? 's' : ''} vencida${t.vencidas > 1 ? 's' : ''}: reprograma o cierra`, '/staff/tareas.html', t.vencidas > 10 ? 'danger' : 'warning');
    }
    if (mods.has('impacto')) {
      const p = await one(c.env, `SELECT SUM(estado IN ('propuesta','planeacion','en_curso')) vivos, SUM(estado = 'en_curso') en_curso,
        (SELECT COUNT(*) FROM ro_beneficiarios b WHERE b.business_id = ro_proyectos.business_id) beneficiarios FROM ro_proyectos WHERE business_id = ?`, bid);
      out.impacto = { vivos: p.vivos || 0, en_curso: p.en_curso || 0, beneficiarios: p.beneficiarios || 0 };
      const malos = await all(c.env, `SELECT p.id, p.nombre FROM ro_proyectos p WHERE p.business_id = ? AND p.estado = 'finalizado'
        AND EXISTS (SELECT 1 FROM ro_tareas t WHERE t.business_id = p.business_id AND t.proyecto_id = p.id AND t.estado IN ('pendiente','en_curso')) LIMIT 5`, bid);
      for (const m of malos) alerta(`«${m.nombre}» está finalizado pero tiene tareas abiertas`, `/staff/impacto.html#p=${m.id}`);
    }
    if (mods.has('reuniones')) {
      out.proxima = await one(c.env, "SELECT id, titulo, tipo, fecha, hora_ini FROM ro_reuniones WHERE business_id = ? AND fecha >= ? AND estado <> 'cancelada' ORDER BY fecha, hora_ini LIMIT 1", bid, hoy) || null;
    }
    return json(out);
  });

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
