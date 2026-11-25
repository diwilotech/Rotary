// Inicio = el módulo Dashboard de Diwilo Modulos. Aquí se registra lo PROPIO del club: arriba el logo completo del club
// (portada, compacta) y debajo, como principal, el calendario. Lo de cada socio está en «Lo tuyo»; la junta ve además
// «Cómo va el club» (/api/club/resumen): indicadores y lo que pide atención (saldos negativos, tareas vencidas, cuotas…).
window.DwSinFigura = true;    // sin «Así funciona tu negocio»
window.DwSinComoVa = true;    // sin «Cómo va» (indicadores centrales)
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'club',
  titulo: '',
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
    // Portada: el logo completo del club. Primero el de fondo oscuro (blanco) sobre el color del club; si no, el horizontal
    // sobre blanco; si no hay ninguno, el logo de la app con el nombre del club.
    const logos = tiene('marca') ? ((await api('/api/marca/logos').catch(() => null))?.logos || []) : [];
    const L = (t) => logos.find((x) => x.tipo === t && x.data_url)?.data_url;
    const oscuro = L('oscuro'), horiz = L('horizontal');
    const portada = `<style>.ro-portada{position:relative;overflow:hidden;border-radius:22px;padding:clamp(16px,3vw,26px) clamp(20px,4vw,40px);display:grid;place-items:center;text-align:center;min-height:0}
      .ro-portada.color{background:radial-gradient(120% 140% at 0% 0%,color-mix(in srgb,var(--dw-p) 70%,#fff) 0%,var(--dw-p) 45%,color-mix(in srgb,var(--dw-p) 70%,#000) 100%);color:#fff;box-shadow:0 18px 40px -18px color-mix(in srgb,var(--dw-p) 70%,transparent)}
      .ro-portada.claro{background:linear-gradient(135deg,#fff,color-mix(in srgb,var(--dw-p) 7%,#fff));border:1px solid color-mix(in srgb,var(--dw-p) 18%,var(--bs-border-color))}
      .ro-portada::before,.ro-portada::after{content:"";position:absolute;border-radius:50%;pointer-events:none}
      .ro-portada::before{width:340px;height:340px;right:-110px;top:-150px;background:rgba(255,255,255,.12)}
      .ro-portada::after{width:220px;height:220px;left:-80px;bottom:-120px;background:rgba(255,255,255,.08)}
      .ro-portada.claro::before,.ro-portada.claro::after{background:color-mix(in srgb,var(--dw-p) 6%,transparent)}
      .ro-portada img{position:relative;z-index:1;max-width:min(100%,420px);max-height:84px;object-fit:contain;filter:drop-shadow(0 4px 14px rgba(0,0,0,.12))}
      .ro-portada .app{width:64px;height:64px;border-radius:24px;object-fit:cover;background:#fff;margin-bottom:12px}
      .ro-portada h2{position:relative;z-index:1;font-weight:700;margin:0;font-size:clamp(1.4rem,3.5vw,2.1rem)}
      .ro-portada .lema{position:relative;z-index:1;margin-top:10px;opacity:.85;letter-spacing:.08em;text-transform:uppercase;font-size:.78rem}</style>
      ${oscuro ? `<div class="ro-portada color"><img src="${esc(oscuro)}" alt="${esc(me.business.name)}"></div>`
        : horiz ? `<div class="ro-portada claro"><img src="${esc(horiz)}" alt="${esc(me.business.name)}"></div>`
        : `<div class="ro-portada color"><div>${me.settings.logo ? `<img class="app" src="${esc(me.settings.logo)}" alt="">` : ''}<h2>${esc(me.business.name)}</h2></div></div>`}`;
    // Club sin logos: tarjeta para crearlos con los archivos oficiales de Rotary (solo si la app ya los tiene)
    const logosCard = me.canManage && !me.business.readOnly && tiene('marca') && (me.distrito?.programa || 'rotaract') === 'rotaract'
      ? await new Promise((ok) => { if (window.RoLogos) return ok(true); const sc = document.createElement('script'); sc.src = '/js/pages/marca-club.js'; sc.onload = () => ok(true); sc.onerror = () => ok(false); document.head.appendChild(sc); })
        .then(async (ok) => ok && !localStorage.getItem(`ro_marca_luego_${me.business.id}`) && (!me.settings.logo || !['rotaract', 'rotary'].includes(me.settings.tema) || window.RoLogos.vieja(me)) && (await window.RoLogos.archivos()).logo) : false;
    host.innerHTML = `${logosCard ? `<div class="dw-card mb-3 d-flex align-items-center gap-3 flex-wrap" style="border-left:4px solid #D41367"><i class="bi bi-award fs-3" style="color:#D41367"></i>
        <div class="flex-grow-1"><b>Configura la marca de tu club</b><div class="small text-body-secondary">Con el logotipo oficial de Rotaract y el nombre «${esc(window.RoLogos.club(me.business.name))}»: los logos (app, horizontal, ícono, letras y fondo oscuro), los colores de Rotaract, la letra Open Sans y una descripción del club. Todo queda en Marca y se usa en los certificados.</div></div>
        <div class="d-flex gap-2"><button class="btn btn-light" data-luego>Más tarde</button><button class="btn btn-primary" data-rologos><i class="bi bi-stars me-1"></i>Configurar la marca</button></div></div>` : ''}${portada}`;
    host.querySelector('[data-luego]')?.addEventListener('click', (ev) => { localStorage.setItem(`ro_marca_luego_${me.business.id}`, '1'); ev.currentTarget.closest('.dw-card').remove(); });
    host.querySelector('[data-rologos]')?.addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creando…';
      try { const n = await window.RoLogos.crear(me); window.App.toast('Listo: la marca del club quedó configurada'); setTimeout(() => (window.top || window).location.reload(), 1200); }
      catch (x) { window.App.toast(x.message, false); b.disabled = false; b.textContent = 'Configurar la marca'; }
    });
  },
});

// «Cómo va el club» (solo junta): una fila de indicadores y, debajo, lo que pide atención con enlace a donde se arregla.
async function comoVa(el, me) {
  const { api, esc } = window.App, C = window.App.Crud;
  const r = await api('/api/club/resumen');
  const k = [];
  if (r.socios) k.push({ titulo: 'Socios activos', valor: C.num(r.socios.activos), detalle: r.socios.aspirantes ? `${r.socios.aspirantes} aspirantes` : 'del club', icono: 'bi-people-fill', ruta: '/staff/socios.html' });
  if (r.cuotas) k.push({ titulo: 'Cuotas al día', valor: `${r.cuotas.pct}%`, detalle: r.cuotas.deben ? `${r.cuotas.deben} deben ${C.money(r.cuotas.vencido)}` : 'nadie debe', icono: 'bi-wallet2', ruta: '/staff/cuotas.html' });
  if (r.cajas) k.push({ titulo: 'En cajas', valor: C.money(r.cajas.menor + r.cajas.mayor), detalle: `Menor ${C.money(r.cajas.menor)} · Mayor ${C.money(r.cajas.mayor)}`, icono: 'bi-cash-stack', ruta: '/staff/cajas.html' });
  if (r.tareas) k.push({ titulo: 'Tareas vencidas', valor: C.num(r.tareas.vencidas), detalle: `de ${C.num(r.tareas.abiertas)} abiertas`, icono: 'bi-alarm', ruta: '/staff/tareas.html' });
  if (r.impacto) k.push({ titulo: 'Proyectos vivos', valor: C.num(r.impacto.vivos), detalle: `${C.num(r.impacto.beneficiarios)} beneficiarios`, icono: 'bi-globe-americas', ruta: '/staff/impacto.html' });
  if (!k.length) return;
  const ic = { danger: 'bi-exclamation-octagon-fill text-danger', warning: 'bi-exclamation-triangle-fill text-warning', info: 'bi-info-circle-fill text-info' };
  el.innerHTML = `<div class="small text-uppercase fw-semibold text-body-secondary mb-2" style="letter-spacing:.06em">Cómo va el club</div>
    <div class="dw-grid">${k.map((w) => window.App.kpi(w)).join('')}</div>
    ${r.alertas.length ? `<div class="dw-card mt-2 p-0"><div class="list-group list-group-flush">${r.alertas.map((a) => `<a class="list-group-item list-group-item-action d-flex align-items-center gap-2 bg-transparent" href="${esc(a.ruta)}"><i class="bi ${ic[a.nivel] || ic.warning}"></i><span class="flex-grow-1">${esc(a.texto)}</span><i class="bi bi-chevron-right text-body-secondary"></i></a>`).join('')}</div></div>` : ''}`;
}

// Calendario del club: el mes con todo lo del club (reuniones, eventos, tareas que vencen, cumpleaños, proyectos y cuotas).
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'calendario',
  titulo: 'Calendario del club',
  async mount(host, { me }) {
    const { api, esc } = window.App;
    const C = window.App.Crud;
    const T = { reunion: ['#be185d', 'Reunión', 'bi-people'], evento: ['#0067C8', 'Evento', 'bi-stars'], obra: ['#E08E0B', 'Obra', 'bi-hammer'], tarea: ['#0ea5e9', 'Tarea', 'bi-check2-square'], cumple: ['#8b5cf6', 'Cumpleaños', 'bi-cake2'],
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

// «Cómo va el club» va después del calendario (solo junta)
(window.DwDashboard = window.DwDashboard || []).push({
  id: 'comova',
  titulo: '',
  async mount(host, { me }) {
    if (!me.canManage || me.distrito?.es_distrito) { host.innerHTML = ''; return; }
    await comoVa(host, me).catch(() => { host.innerHTML = ''; });
  },
});
