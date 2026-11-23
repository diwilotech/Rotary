// Inicio = el módulo Dashboard de Diwilo Modulos. Aquí se registra lo PROPIO del club: la próxima reunión, mis pendientes
// y una tarjeta por módulo activo con su número clave (lleva a su pantalla).
window.DwSinFigura = true;    // sin «Así funciona tu negocio»
// Club nuevo sin logo: la primera vez que entra la presidencia o la junta se crean solos los 6 logos del club (Marca)
DW.ready.then(async (me) => {
  if (!me.canManage || me.business.readOnly || me.settings.logo || me.distrito?.es_distrito || !me.modules.some((m) => m.id === 'marca')) return;
  const k = `ro_logos_${me.business.id}`; try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (_) { /* sin almacenamiento: igual se intenta una vez */ }
  if (!window.RoLogos) await new Promise((ok) => { const sc = document.createElement('script'); sc.src = '/js/pages/marca-club.js'; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  try { await window.RoLogos?.crear(me, { silencioso: true }); window.App.toast('Creamos los logos de tu club. Míralos en Marca → Identidad.'); setTimeout(() => (window.top || window).location.reload(), 1800); } catch (_) { /* se puede hacer luego desde Marca */ }
});
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'club',
  titulo: 'Tu club',
  async mount(host, { me }) {
    const { api, esc } = window.App;
    const C = window.App.Crud;
    // Perfil del distrito: resumen de sus clubes en vez de «Tu club»
    if (me.distrito?.es_distrito) {
      const t = await api('/api/distrito/tablero').catch(() => null);
      if (!t) { host.innerHTML = ''; return; }
      const x = t.totales;
      host.innerHTML = `<div class="dw-grid">${[['Clubes', x.clubes, `Distrito ${esc(t.codigo)}`, 'bi-diagram-3'], ['Socios activos', C.num(x.socios), `${C.num(x.activados)} activados`, 'bi-people-fill'],
        ['Beneficiados', C.num(x.beneficiados), `${x.proyectos} proyectos en curso`, 'bi-globe-americas'], ['Cuota distrital', C.money(x.distrital_pagado), `de ${C.money(x.distrital_total)} · ${t.nombre_anio}`, 'bi-bank']]
        .map(([tt, v, d, i]) => window.App.kpi({ titulo: tt, valor: v, detalle: d, icono: i, ruta: '/staff/distrito.html' })).join('')}</div>`;
      return;
    }
    const tiene = (id) => me.modules.some((m) => m.id === id);
    const pedir = (url) => api(url).catch(() => null);
    const [yo, reu, soc, tar, imp, caj, cuo] = await Promise.all([pedir('/api/lotuyo'), tiene('reuniones') ? pedir('/api/reuniones/resumen') : null, tiene('socios') ? pedir('/api/socios/resumen') : null,
      tiene('tareas') ? pedir('/api/tareas/resumen') : null, tiene('impacto') ? pedir('/api/impacto/resumen') : null, tiene('cajas') ? pedir('/api/cajas/resumen') : null, tiene('cuotas') ? pedir('/api/cuotas/resumen') : null]);
    const hoy = C.todayCo();
    const cuando = (f) => { const n = Math.round((Date.parse(f) - Date.parse(hoy)) / 864e5); return n === 0 ? 'hoy' : n === 1 ? 'mañana' : `en ${n} días`; };
    const prox = reu?.proximas?.[0];
    const tiles = [
      soc && ['Socios del club', soc.activos, `${soc.junta} en la junta${soc.externos ? ` · ${soc.externos} externos` : ''}${soc.sin_activar ? ` · ${soc.sin_activar} sin activar` : ''}`, 'bi-people-fill', '/staff/socios.html'],
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

// Calendario del club: el mes con todo lo del club (reuniones, eventos, tareas que vencen, cumpleaños, proyectos y cuotas).
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'calendario',
  titulo: 'Calendario del club',
  async mount(host, { me }) {
    const { api, esc } = window.App;
    const C = window.App.Crud;
    const T = { reunion: ['#be185d', 'Reunión', 'bi-people'], evento: ['#f59e0b', 'Evento', 'bi-stars'], tarea: ['#0ea5e9', 'Tarea', 'bi-check2-square'], cumple: ['#8b5cf6', 'Cumpleaños', 'bi-cake2'],
      proyecto: ['#16a34a', 'Proyecto', 'bi-globe-americas'], cuota: ['#64748b', 'Cuota', 'bi-wallet2'], distrital: ['#dc2626', 'Cuota distrital', 'bi-bank'] };
    const hoy = C.todayCo();
    const mas = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const mesMas = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
    const lunes = (f) => mas(f, -((new Date(`${f}T12:00:00Z`).getUTCDay() + 6) % 7));
    let ym = hoy.slice(0, 7), sel = hoy, rows = [];
    host.innerHTML = `<style>.ro-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;text-align:center}.ro-cal b{font-size:.7rem;color:var(--bs-secondary-color);font-weight:600;padding-bottom:2px}
      .ro-cal button{border:0;background:transparent;border-radius:10px;padding:5px 0 4px;min-height:44px;display:flex;flex-direction:column;align-items:center;gap:2px;color:inherit;font-size:.85rem}
      .ro-cal button:hover{background:rgba(var(--dw-p-rgb),.08)}.ro-cal .fuera{opacity:.35}.ro-cal .hoy span{background:var(--dw-p);color:#fff;border-radius:50%;width:24px;height:24px;display:grid;place-items:center;font-weight:700}
      .ro-cal .sel{outline:2px solid var(--dw-p)}.ro-dots{display:flex;gap:2px;justify-content:center;flex-wrap:wrap;max-width:36px}.ro-dots i{width:6px;height:6px;border-radius:50%;background:var(--c)}
      .ro-agenda a{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--bs-border-color);color:inherit;text-decoration:none}.ro-agenda .ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;color:#fff;background:var(--c)}</style>
      <div class="dw-card"><div class="row g-3"><div class="col-md-6">
        <div class="d-flex align-items-center gap-2 mb-2"><button class="btn btn-light btn-sm" data-m="-1" aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
          <b class="flex-grow-1 text-center text-capitalize" data-tit></b><button class="btn btn-light btn-sm" data-m="1" aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button></div>
        <div class="ro-cal" data-cal></div><div class="dw-legend" data-ley></div></div>
        <div class="col-md-6"><div class="ro-h mt-0" data-dia></div><div class="ro-agenda" data-ag></div></div></div></div>`;
    const $ = (q) => host.querySelector(q);
    const item = (x) => { const [c, l, i] = T[x.tipo] || T.evento; return `<a href="${esc(x.ruta || '#')}" style="--c:${c}"><span class="ic"><i class="bi ${i}"></i></span><span class="min-w-0"><b class="d-block text-truncate">${esc(x.titulo)}</b>
      <span class="small text-body-secondary">${l}${x.hora ? ` · ${esc(x.hora)}` : ''}${x.club ? ` · ${esc(x.club)}` : ''}${x.lugar ? ` · ${esc(x.lugar)}` : ''}${x.detalle && x.tipo === 'tarea' ? ` · ${esc(x.detalle)}` : ''}</span></span></a>`; };
    function pintar() {
      const primero = `${ym}-01`, desde = lunes(primero), ultimo = mas(`${mesMas(ym, 1)}-01`, -1), sem = Math.round((Date.parse(mas(lunes(ultimo), 6)) - Date.parse(desde)) / 864e5 + 1) / 7;
      $('[data-tit]').textContent = new Date(`${primero}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      $('[data-cal]').innerHTML = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<b>${d}</b>`).join('') + Array.from({ length: sem * 7 }, (_, i) => {
        const f = mas(desde, i), ev = rows.filter((x) => x.fecha === f);
        return `<button type="button" data-f="${f}" class="${f.startsWith(ym) ? '' : 'fuera'} ${f === hoy ? 'hoy' : ''} ${f === sel ? 'sel' : ''}" aria-label="${f}${ev.length ? `, ${ev.length} cosas` : ''}"><span>${+f.slice(8)}</span>
          <span class="ro-dots">${[...new Set(ev.map((x) => x.tipo))].slice(0, 4).map((t) => `<i style="--c:${(T[t] || T.evento)[0]}"></i>`).join('')}</span></button>`;
      }).join('');
      const tipos = [...new Set(rows.map((x) => x.tipo))];
      $('[data-ley]').innerHTML = tipos.map((t) => `<span><i style="background:${T[t][0]}"></i>${T[t][1]}</span>`).join('');
      const delDia = rows.filter((x) => x.fecha === sel), proximos = rows.filter((x) => x.fecha >= (sel > hoy ? sel : hoy) && x.fecha !== sel).slice(0, 6);
      $('[data-dia]').innerHTML = sel === hoy ? 'Hoy' : `<span class="text-capitalize">${new Date(`${sel}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}</span>`;
      $('[data-ag]').innerHTML = (delDia.length ? delDia.map(item).join('') : '<p class="small text-body-secondary">Nada para este día.</p>')
        + (proximos.length ? `<div class="ro-h">Lo que viene</div>${proximos.map((x) => `<div class="small text-body-secondary text-capitalize mt-1">${new Date(`${x.fecha}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}</div>${item(x)}`).join('')}` : '');
    }
    async function cargar() {
      const desde = lunes(`${ym}-01`), hasta = mas(lunes(mas(`${mesMas(ym, 1)}-01`, -1)), 6 + 21);
      rows = (await api(`/api/club/calendario?desde=${desde}&hasta=${hasta}`).catch(() => ({ rows: [] }))).rows;
      pintar();
    }
    host.addEventListener('click', (e) => {
      const m = e.target.closest('[data-m]'); if (m) { ym = mesMas(ym, Number(m.dataset.m)); sel = ym === hoy.slice(0, 7) ? hoy : `${ym}-01`; return cargar(); }
      const d = e.target.closest('[data-f]'); if (d) { sel = d.dataset.f; if (!sel.startsWith(ym)) { ym = sel.slice(0, 7); return cargar(); } pintar(); }
    });
    await cargar();
  },
});
