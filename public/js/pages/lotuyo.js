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
    view.innerHTML = `<style>.ro-yo{display:flex;gap:16px;align-items:center;padding:18px;border-radius:18px;background:linear-gradient(135deg,var(--dw-p),color-mix(in srgb,var(--dw-p) 55%,#000));color:#fff}
        .ro-yo .ro-av{background:rgba(255,255,255,.25);color:#fff;border:3px solid rgba(255,255,255,.6)}.ro-yo small{opacity:.85}</style>
      <div class="ro-yo mb-3">${RO.avatar(s, 72)}<div class="flex-grow-1 min-w-0"><small>Hola,</small><div class="fs-4 fw-bold text-truncate">${esc(s.nombre.split(' ')[0])}</div>
        <small>${esc(s.cargo || s.tipo)}${s.activado_at ? ' · <i class="bi bi-patch-check-fill"></i> Activado' : ''}</small></div>
        <button class="btn btn-light btn-sm" data-carnet><i class="bi bi-person-vcard me-1"></i>Mi carnet</button></div>
      <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div>
      <div class="row g-3">
        ${d.reuniones ? `<div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Próximas reuniones</div>${d.reuniones.length ? d.reuniones.map((r) => `<div class="d-flex gap-2 align-items-center py-2 border-bottom">
            <div class="text-center" style="min-width:54px"><div class="small fw-bold" style="color:var(--dw-p)">${cuando(r.fecha)}</div><div class="small text-body-secondary">${esc(r.hora_ini || '')}</div></div>
            <div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(r.titulo)}</b><span class="small text-body-secondary text-capitalize">${RO.fechaLarga(r.fecha)}${r.lugar ? ` · ${esc(r.lugar)}` : ''}</span></div>
            ${W ? `<div class="btn-group btn-group-sm"><button class="btn ${r.respuesta === 'si' ? 'btn-success' : 'btn-outline-success'}" data-resp="si" data-r="${r.id}" title="Voy"><i class="bi bi-check-lg"></i></button><button class="btn ${r.respuesta === 'no' ? 'btn-secondary' : 'btn-outline-secondary'}" data-resp="no" data-r="${r.id}" title="No puedo"><i class="bi bi-x-lg"></i></button></div>` : ''}</div>`).join('') : '<p class="small text-body-secondary mb-0">No hay reuniones programadas.</p>'}</div></div>` : ''}
        ${d.tareas ? `<div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Mis tareas</div>${d.tareas.length ? d.tareas.map((t) => `<label class="d-flex gap-2 align-items-center py-2 border-bottom"><input class="form-check-input m-0" type="checkbox" data-hecha="${t.id}" ${W ? '' : 'disabled'}>
            <span class="flex-grow-1">${esc(t.titulo)}</span><span class="small ${t.fecha_limite && t.fecha_limite < hoy ? 'text-danger fw-semibold' : 'text-body-secondary'}">${t.fecha_limite ? C.day(t.fecha_limite) : ''}</span></label>`).join('') : '<p class="small text-body-secondary mb-0">No tienes tareas pendientes. 🎉</p>'}</div></div>` : ''}
        ${cu || d.pagos.length ? `<div class="col-12"><div class="dw-card"><div class="d-flex align-items-center gap-2 mb-2"><div class="ro-h m-0 flex-grow-1">Mis cuotas</div>${W && d.modulos.includes('cuotas') ? '<button class="btn btn-primary btn-sm" data-reportar><i class="bi bi-upload me-1"></i>Reportar pago</button>' : ''}</div>
          ${cu ? `<div class="mb-2">${cu.saldo ? `Debes <b class="text-danger">${C.money(cu.saldo)}</b> de ${C.money(cu.esperado)}.` : cu.a_favor ? `Estás al día y tienes <b>${C.money(cu.a_favor)}</b> a favor.` : '<b class="text-success">Estás al día.</b>'}</div>` : ''}
          ${d.pagos.length ? window.App.table([{ label: 'Fecha', html: (p) => C.day(p.fecha) }, { label: 'Monto', main: true, html: (p) => C.money(p.monto) }, { label: 'Estado', html: (p) => `${C.chip(...(PEST[p.estado] || PEST.pendiente))}${p.motivo_rechazo ? `<div class="small text-danger">${esc(p.motivo_rechazo)}</div>` : ''}` },
            { label: 'Comprobante', html: (p) => (p.comprobante ? `<a class="btn btn-sm btn-light" href="/api/lotuyo/pagos/${p.id}/comprobante" target="_blank" rel="noopener"><i class="bi bi-paperclip"></i></a>` : '') + (W && ['pendiente', 'rechazado'].includes(p.estado) ? ` <button class="btn btn-sm btn-outline-primary" data-comp="${p.id}">${p.comprobante ? 'Cambiar' : 'Adjuntar'}</button>` : '') }], d.pagos) : '<p class="small text-body-secondary mb-0">Aún no hay pagos registrados.</p>'}</div></div>` : ''}
        ${s.activado_at ? `<div class="col-12"><div class="dw-card d-flex align-items-center gap-3 flex-wrap"><i class="bi bi-patch-check-fill fs-2" style="color:var(--dw-p)"></i><div class="flex-grow-1"><b>Certificado de activación</b><div class="small text-body-secondary">Activado el ${C.day(s.activado_at)} · Código ${esc(s.codigo || '')}</div></div><a class="btn btn-outline-primary" href="/api/lotuyo/certificado" target="_blank" rel="noopener"><i class="bi bi-download me-1"></i>Descargar</a></div></div>` : ''}
      </div>`;
    C.kpis(view.querySelector('[data-kpis]'), [['Mi asistencia', d.asistencia.pct == null ? '—' : `${d.asistencia.pct}%`, `${d.asistencia.presente} de ${d.asistencia.total} reuniones`, 'bi-calendar-check'],
      ['Tareas abiertas', d.tareas ? d.tareas.length : '—', '', 'bi-kanban'], ['Cuotas', cu ? (cu.saldo ? C.money(cu.saldo) : 'Al día') : '—', cu?.saldo ? 'pendiente' : '', 'bi-wallet2'],
      ['Desde', s.fecha_ingreso ? C.day(s.fecha_ingreso) : '—', 'en el club', 'bi-calendar-heart']]);
  }

  view.addEventListener('click', async (e) => {
    if (e.target.closest('[data-carnet]')) return window.DW.carnet?.();
    if (e.target.closest('[data-reportar]')) return reportar();
    const r = e.target.closest('[data-resp]');
    if (r) { try { await api(`/api/reuniones/reuniones/${r.dataset.r}/responder`, { method: 'POST', body: { respuesta: r.dataset.resp } }); toast('Respuesta guardada'); cargar(); } catch (x) { toast(x.message, false); } return; }
    const c = e.target.closest('[data-comp]');
    if (c) { const f = await RO.elegirArchivo(); if (!f) return; try { await RO.subir(`/api/lotuyo/pagos/${c.dataset.comp}/comprobante`, f); toast('Comprobante adjunto'); cargar(); } catch (x) { toast(x.message, false); } }
  });
  view.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-hecha]'); if (!t || !t.checked) return;
    try { await api(`/api/tareas/tareas/${t.dataset.hecha}`, { method: 'PATCH', body: { estado: 'hecha' } }); toast('¡Tarea hecha!'); cargar(); } catch (x) { toast(x.message, false); t.checked = false; }
  });
  await cargar();
});
