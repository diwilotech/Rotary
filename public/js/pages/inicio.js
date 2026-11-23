// Inicio = el módulo Dashboard de Diwilo Modulos. Aquí se registra lo PROPIO del club: la próxima reunión, mis pendientes
// y una tarjeta por módulo activo con su número clave (lleva a su pantalla).
window.DwSinFigura = true;    // sin «Así funciona tu negocio»
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'club',
  titulo: 'Tu club',
  async mount(host, { me }) {
    const { api, esc } = window.App;
    const C = window.App.Crud;
    const tiene = (id) => me.modules.some((m) => m.id === id);
    const pedir = (url) => api(url).catch(() => null);
    const [yo, reu, soc, tar, imp, caj, cuo] = await Promise.all([pedir('/api/lotuyo'), tiene('reuniones') ? pedir('/api/reuniones/resumen') : null, tiene('socios') ? pedir('/api/socios/resumen') : null,
      tiene('tareas') ? pedir('/api/tareas/resumen') : null, tiene('impacto') ? pedir('/api/impacto/resumen') : null, tiene('cajas') ? pedir('/api/cajas/resumen') : null, tiene('cuotas') ? pedir('/api/cuotas/resumen') : null]);
    const hoy = C.todayCo();
    const cuando = (f) => { const n = Math.round((Date.parse(f) - Date.parse(hoy)) / 864e5); return n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`; };
    const prox = reu?.proximas?.[0];
    const tiles = [
      soc && ['Socios activos', soc.activos, soc.sin_activar ? `${soc.sin_activar} sin activar` : `${soc.junta} en la junta`, 'bi-people-fill', '/staff/socios.html'],
      reu && ['Asistencia (90 días)', reu.asistencia_90d == null ? '—' : `${reu.asistencia_90d}%`, `${reu.proximas.length} próximas`, 'bi-calendar-event', '/staff/reuniones.html'],
      tar && ['Tareas abiertas', tar.valor, tar.vencidas ? `${tar.vencidas} vencidas` : `${tar.hechas_30d} hechas en 30 días`, 'bi-kanban', '/staff/tareas.html'],
      imp && ['Beneficiados', C.num(imp.beneficiados), `${imp.en_curso} proyectos vivos`, 'bi-globe-americas', '/staff/impacto.html'],
      caj && ['Caja menor · Club', C.money(caj.cajas[0].saldo), `Caja mayor ${C.money(caj.cajas[1].saldo)}`, 'bi-cash-stack', '/staff/cajas.html'],
      cuo && ['Cuotas por cobrar', C.money(cuo.por_cobrar), cuo.por_verificar ? `${cuo.por_verificar} por verificar` : `${cuo.deben} socios deben`, 'bi-wallet2', '/staff/cuotas.html'],
    ].filter(Boolean);
    host.innerHTML = `<div class="row g-3 mb-3">
        <div class="col-lg-5"><div class="dw-card h-100" style="border-left:4px solid var(--dw-p)"><div class="small text-body-secondary">Próxima reunión</div>
          ${prox ? `<div class="fs-5 fw-bold">${esc(prox.titulo)}</div><div class="small text-capitalize">${new Date(`${prox.fecha}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}${prox.hora_ini ? ` · ${esc(prox.hora_ini)}` : ''} · <b>${cuando(prox.fecha)}</b></div>${prox.lugar ? `<div class="small text-body-secondary"><i class="bi bi-geo-alt me-1"></i>${esc(prox.lugar)}</div>` : ''}
            <a class="btn btn-sm btn-outline-primary mt-2" href="/staff/reuniones.html">Ver calendario</a>` : '<div class="text-body-secondary">No hay reuniones programadas.</div>'}</div></div>
        <div class="col-lg-7"><div class="dw-card h-100"><div class="small text-body-secondary mb-1">Lo tuyo</div>
          ${yo?.socio ? `<div class="d-flex flex-wrap gap-3"><span><b>${yo.tareas ? yo.tareas.length : 0}</b> tareas tuyas</span><span><b>${yo.asistencia.pct ?? '—'}${yo.asistencia.pct != null ? '%' : ''}</b> de asistencia</span><span>${yo.cuota ? (yo.cuota.saldo ? `Cuotas: debes <b class="text-danger">${C.money(yo.cuota.saldo)}</b>` : '<b class="text-success">Cuotas al día</b>') : ''}</span></div>
            <a class="btn btn-sm btn-outline-primary mt-2" href="/staff/lotuyo.html">Ir a lo tuyo</a>` : '<div class="text-body-secondary small">Tu usuario aún no está enlazado a una ficha de socio.</div>'}</div></div></div>
      ${tiles.length ? `<div class="dw-grid">${tiles.map(([t, v, d, i, r]) => window.App.kpi({ titulo: t, valor: v, detalle: d, icono: i, ruta: r })).join('')}</div>` : ''}`;
  },
});
