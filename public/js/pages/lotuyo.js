// «Lo tuyo»: lo del socio que entró. Su carnet, sus próximas reuniones (confirmar), sus tareas, su asistencia,
// sus cuotas (reportar un pago con comprobante) y su certificado de activación.
DW.ready.then(async (me) => {
  const { api, esc, toast } = window.App;
  const C = window.App.Crud, RO = window.RO;
  const view = document.querySelector('[data-view]');
  const W = !me.business.readOnly;
  const PEST = { pendiente: ['soon', 'Por verificar'], verificado: ['ok', 'Verificado'], rechazado: ['bad', 'Rechazado'], anulado: ['free', 'Anulado'] };
  const METODOS = [['transferencia', 'Transferencia'], ['nequi', 'Nequi'], ['daviplata', 'Daviplata'], ['efectivo', 'Efectivo'], ['bre-b', 'Bre-B'], ['otro', 'Otro']];

  async function reportar() {
    const out = await C.form({ title: 'Reportar pago de cuota', fields: [{ k: 'monto', label: 'Monto', type: 'money', required: true }, { k: 'fecha', label: 'Fecha del pago', type: 'date', default: C.todayCo() },
      { k: 'metodo', label: 'Medio', type: 'select', options: METODOS }, { k: 'observaciones', label: 'Nota', type: 'long', hint: 'ej. cuota de agosto y septiembre' }], okText: 'Siguiente: comprobante' });
    if (!out) return;
    try {
      const p = await api('/api/lotuyo/pagos', { method: 'POST', body: out });
      const f = await RO.elegirArchivo();
      if (f) await RO.subir(`/api/lotuyo/pagos/${p.id}/comprobante`, f);
      toast(f ? 'Pago reportado con comprobante. La tesorería lo verificará.' : 'Pago reportado. Adjunta el comprobante desde tu historial.');
      cargar();
    } catch (x) { toast(x.message, false); }
  }

  async function cargar() {
    const d = await api('/api/lotuyo');
    if (!d.socio) {
      view.innerHTML = `<div class="dw-card">${window.App.empty('bi-person-badge', 'Tu usuario aún no está enlazado a una ficha de socio. Pídele a la junta que te dé acceso desde Socios con tu mismo correo.')}</div>`;
      return;
    }
    const s = d.socio, cu = d.cuota, hoy = C.todayCo();
    const cuando = (f) => { const n = Math.round((Date.parse(f) - Date.parse(hoy)) / 864e5); return n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : `En ${n} días`; };
    const asis = d.asistencia.pct == null ? '—' : `${d.asistencia.pct}%`;
    const cuotaTxt = cu ? (cu.saldo ? C.money(cu.saldo) : 'Al día') : '—';
    const cuandoT = (f) => { if (!f) return ['Sin fecha', 'text-body-secondary']; const n = Math.round((Date.parse(f) - Date.parse(hoy)) / 864e5); return n < 0 ? [`Venció hace ${-n} d`, 'text-danger'] : n === 0 ? ['Hoy', 'text-warning-emphasis'] : n === 1 ? ['Mañana', ''] : [`En ${n} días`, '']; };
    const CEL = { pagado: 'Pagado', parcial: 'Abono', debe: 'Debe', pendiente: 'Por pagar', na: 'Sin cuota' };
    const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    view.innerHTML = `<style>.ro-yo{border-radius:18px;overflow:hidden;background:linear-gradient(135deg,var(--dw-p),color-mix(in srgb,var(--dw-p) 55%,#000));color:#fff}
        .ro-yo-a{display:flex;gap:16px;align-items:center;padding:18px}.ro-yo .ro-av{background:rgba(255,255,255,.25);color:#fff;border:3px solid rgba(255,255,255,.6)}.ro-yo small{opacity:.85}
        .ro-yo-b{display:grid;grid-template-columns:repeat(4,1fr);background:#17458f;border-top:3px solid #f7a81b}.ro-yo-b div{padding:8px 6px;text-align:center;line-height:1.15}.ro-yo-b div+div{border-left:1px solid rgba(255,255,255,.18)}
        .ro-yo-b b{display:block;font-size:1.05rem}.ro-yo-b span{font-size:.68rem;opacity:.85;text-transform:uppercase;letter-spacing:.04em}
        .ro-item{display:flex;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--bs-border-color)}.ro-item:last-child{border-bottom:0}
        .ro-cuando{min-width:64px;text-align:center;line-height:1.15}.ro-cuando b{display:block;font-size:.8rem;color:var(--dw-p)}.ro-cuando span{font-size:.72rem;color:var(--bs-secondary-color)}
        .ro-meses{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}@media(max-width:576px){.ro-meses{grid-template-columns:repeat(4,1fr)}}
        .ro-mes{border-radius:10px;padding:7px 4px;text-align:center;font-size:.72rem;line-height:1.2;color:#fff}.ro-mes b{display:block;font-size:.85rem}
        .ro-mes.pagado{background:var(--bs-success)}.ro-mes.parcial{background:var(--bs-warning);color:#3d2c00}.ro-mes.debe{background:var(--bs-danger)}.ro-mes.pendiente{background:rgba(var(--dw-p-rgb),.14);color:var(--bs-body-color)}.ro-mes.na{border:1px dashed var(--bs-border-color);color:var(--bs-secondary-color)}
        .ro-mes.hoy{outline:2px solid var(--dw-p);outline-offset:1px}[id^=lt-]{scroll-margin-top:72px}</style>
      <div class="ro-yo mb-3"><div class="ro-yo-a">${RO.avatar(s, 72)}<div class="flex-grow-1 min-w-0"><small>Hola,</small><div class="fs-4 fw-bold text-truncate">${esc(s.nombre.split(' ')[0])}</div>
          <small>${esc(s.cargo || s.tipo)}${s.activado_at ? ' · <i class="bi bi-patch-check-fill"></i> Activo' : ''}${s.myrotary_id ? ' · My Rotary' : ''}</small></div>
          <button class="btn btn-light btn-sm" data-carnet><i class="bi bi-person-vcard me-1"></i>Mi carnet</button></div>
        <div class="ro-yo-b"><div><b>${asis}</b><span>Asistencia</span></div><div><b>${d.tareas ? d.tareas.length : '—'}</b><span>Tareas</span></div><div><b>${cuotaTxt}</b><span>Cuotas</span></div><div><b>${s.fecha_ingreso ? s.fecha_ingreso.slice(0, 4) : '—'}</b><span>En el club</span></div></div></div>
      <div class="row g-3">
        ${d.reuniones ? `<div class="col-lg-6" id="lt-reuniones"><div class="dw-card h-100"><div class="ro-h mt-0">Próximas reuniones</div>${d.reuniones.length ? d.reuniones.map((r) => `<div class="ro-item">
            <div class="ro-cuando"><b>${cuando(r.fecha)}</b><span>${esc(r.hora_ini || '')}</span></div>
            <div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(r.titulo)}</b><span class="small text-body-secondary text-capitalize">${RO.fechaLarga(r.fecha)}${r.lugar ? ` · ${esc(r.lugar)}` : ''}</span></div>
            ${W ? `<div class="btn-group btn-group-sm"><button class="btn ${r.respuesta === 'si' ? 'btn-success' : 'btn-outline-success'}" data-resp="si" data-r="${r.id}" title="Voy"><i class="bi bi-check-lg"></i></button><button class="btn ${r.respuesta === 'no' ? 'btn-secondary' : 'btn-outline-secondary'}" data-resp="no" data-r="${r.id}" title="No puedo"><i class="bi bi-x-lg"></i></button></div>` : ''}</div>`).join('') : '<p class="small text-body-secondary mb-0">No hay reuniones programadas.</p>'}</div></div>` : ''}
        ${d.tareas ? `<div class="col-lg-6" id="lt-tareas"><div class="dw-card h-100"><div class="ro-h mt-0">Mis tareas</div>${d.tareas.length ? d.tareas.map((t) => { const [cl, cc] = cuandoT(t.fecha_limite); return `<div class="ro-item">
            <div class="ro-cuando"><b class="${cc}">${cl}</b><span>${t.fecha_limite ? C.day(t.fecha_limite) : ''}</span></div>
            <div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(t.titulo)}</b><span class="small text-body-secondary">${t.estado === 'en_curso' ? 'En curso' : 'Pendiente'}${t.prioridad === 'alta' ? ' · <span class="text-danger">prioridad alta</span>' : ''}</span></div>
            ${W ? `<button class="btn btn-sm btn-outline-success" data-hecha="${t.id}" title="Marcar como hecha"><i class="bi bi-check2"></i></button>` : ''}</div>`; }).join('') : '<p class="small text-body-secondary mb-0">No tienes tareas pendientes. 🎉</p>'}</div></div>` : ''}
        ${cu || d.pagos.length ? `<div class="col-12" id="lt-cuotas"><div class="dw-card"><div class="d-flex align-items-center gap-2 mb-2"><div class="ro-h m-0 flex-grow-1">Mis cuotas${cu?.anio ? ` · año rotario ${esc(cu.anio)}` : ''}</div>${W && d.modulos.includes('cuotas') ? '<button class="btn btn-primary btn-sm" data-reportar><i class="bi bi-upload me-1"></i>Reportar pago</button>' : ''}</div>
          ${cu ? `<div class="mb-2">${cu.saldo ? `Debes <b class="text-danger">${C.money(cu.saldo)}</b>` : cu.a_favor ? `Estás al día y tienes <b>${C.money(cu.a_favor)}</b> a favor` : '<b class="text-success">Estás al día</b>'}${cu.valor_mes ? ` · la cuota es de <b>${C.money(cu.valor_mes)}</b> al mes` : ''}${cu.desde ? ` · se cobra desde ${C.monthName(cu.desde)}` : ''}.</div>` : ''}
          ${cu?.meses?.length ? `<div class="ro-meses mb-2">${cu.meses.map((m) => `<div class="ro-mes ${m.estado} ${m.mes === hoy.slice(0, 7) ? 'hoy' : ''}" title="${CEL[m.estado]}${m.monto ? ` · ${C.money(m.aplicado)} de ${C.money(m.monto)}` : ''}"><b>${MES[+m.mes.slice(5)]}</b>${CEL[m.estado]}</div>`).join('')}</div>` : ''}
          ${d.pagos.length ? `<details><summary class="small">Mis pagos (${d.pagos.length})</summary>${window.App.table([{ label: 'Fecha', html: (p) => C.day(p.fecha) }, { label: 'Monto', main: true, html: (p) => C.money(p.monto) }, { label: 'Estado', html: (p) => `${C.chip(...(PEST[p.estado] || PEST.pendiente))}${p.motivo_rechazo ? `<div class="small text-danger">${esc(p.motivo_rechazo)}</div>` : ''}` },
            { label: 'Comprobante', html: (p) => (p.comprobante ? `<a class="btn btn-sm btn-light" href="/api/lotuyo/pagos/${p.id}/comprobante" target="_blank" rel="noopener"><i class="bi bi-paperclip"></i></a>` : '') + (W && ['pendiente', 'rechazado'].includes(p.estado) ? ` <button class="btn btn-sm btn-outline-primary" data-comp="${p.id}">${p.comprobante ? 'Cambiar' : 'Adjuntar'}</button>` : '') }], d.pagos)}</details>` : '<p class="small text-body-secondary mb-0">Aún no hay pagos registrados.</p>'}</div></div>` : ''}
        ${s.activado_at ? `<div class="col-12" id="lt-certificado"><div class="dw-card d-flex align-items-center gap-3 flex-wrap" style="border-left:4px solid #17458f"><i class="bi bi-patch-check-fill fs-2" style="color:#17458f"></i><div class="flex-grow-1"><b>Certificado de activación</b><div class="small text-body-secondary">Activo en el club desde el ${C.day(s.activado_at)} · ${s.myrotary_id ? `My Rotary ${esc(s.myrotary_id)}` : 'aún no está en My Rotary'}</div></div><a class="btn btn-primary" href="/api/lotuyo/certificado" target="_blank" rel="noopener"><i class="bi bi-download me-1"></i>Ver y descargar</a></div></div>` : ''}
      </div>`;
    if (!document.querySelector('nav.ro-club')) {   // botones de sección: llevan a cada bloque de la página
      const SEC = [['yo', 'Resumen', 'bi-person'], ['reuniones', 'Reuniones', 'bi-calendar-event'], ['tareas', 'Tareas', 'bi-kanban'], ['cuotas', 'Cuotas', 'bi-wallet2'], ['certificado', 'Certificado', 'bi-patch-check']];
      RO.pills(SEC.filter(([k]) => k === 'yo' || document.getElementById(`lt-${k}`)).map(([k, l, ic]) => [k, l, `#${k}`, ic]), 'yo',
        (k) => (k === 'yo' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : document.getElementById(`lt-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    }
  }

  view.addEventListener('click', async (e) => {
    if (e.target.closest('[data-carnet]')) return window.DW.carnet?.();
    if (e.target.closest('[data-reportar]')) return reportar();
    const r = e.target.closest('[data-resp]');
    if (r) { try { await api(`/api/reuniones/reuniones/${r.dataset.r}/responder`, { method: 'POST', body: { respuesta: r.dataset.resp } }); toast('Respuesta guardada'); cargar(); } catch (x) { toast(x.message, false); } return; }
    const c = e.target.closest('[data-comp]');
    if (c) { const f = await RO.elegirArchivo(); if (!f) return; try { await RO.subir(`/api/lotuyo/pagos/${c.dataset.comp}/comprobante`, f); toast('Comprobante adjunto'); cargar(); } catch (x) { toast(x.message, false); } }
  });
  view.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-hecha]'); if (!t) return;
    t.disabled = true;
    try { await api(`/api/tareas/tareas/${t.dataset.hecha}`, { method: 'PATCH', body: { estado: 'hecha' } }); toast('¡Tarea hecha!'); cargar(); } catch (x) { toast(x.message, false); t.disabled = false; }
  });
  await cargar();
});
