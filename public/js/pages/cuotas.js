// Cuotas: arriba la cartera (cómo va cada socio) y abajo los ingresos de esas cuotas con su comprobante.
// Los pagos que reportan los socios desde «Lo tuyo» llegan pendientes; al verificarlos entran a la Caja menor.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud, RO = window.RO;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const W = !me.business.readOnly;
  const EST = { al_dia: ['ok', 'Al día'], adelantado: ['ok', 'Adelantado'], por_vencer: ['soon', 'Por vencer'], debe: ['bad', 'Debe'] };
  const PEST = { pendiente: ['soon', 'Por verificar'], verificado: ['ok', 'Verificado'], rechazado: ['bad', 'Rechazado'], anulado: ['free', 'Anulado'] };
  const METODOS = [['transferencia', 'Transferencia'], ['nequi', 'Nequi'], ['daviplata', 'Daviplata'], ['efectivo', 'Efectivo'], ['bre-b', 'Bre-B'], ['otro', 'Otro']];
  let cartera = [], pagos = [], filtro = '';
  RO.nav('cuotas');

  if (W) {
    acciones.innerHTML = '<button class="btn btn-outline-secondary" data-per><i class="bi bi-calendar3 me-1"></i>Periodos</button><button class="btn btn-primary" data-pago><i class="bi bi-plus-lg me-1"></i>Registrar pago</button>';
    acciones.querySelector('[data-pago]').onclick = () => registrar();
    acciones.querySelector('[data-per]').onclick = periodos;
  }

  async function registrar(socioId) {
    const socios = (await RO.socios()).filter((s) => s.estado === 'activo');
    const out = await C.form({ title: 'Registrar pago de cuota', fields: [{ k: 'socio_id', label: 'Socio', type: 'select', options: RO.opts(socios, 'Elige…'), required: true, full: true },
      { k: 'monto', label: 'Monto', type: 'money', required: true }, { k: 'fecha', label: 'Fecha del pago', type: 'date', default: C.todayCo() }, { k: 'metodo', label: 'Medio', type: 'select', options: METODOS },
      { k: 'observaciones', label: 'Observaciones', type: 'long' }], values: { socio_id: socioId || '' }, okText: 'Registrar' });
    if (!out) return;
    try {
      const p = await api('/api/cuotas/pagos', { method: 'POST', body: out });
      toast('Pago registrado: entró a la Caja menor');
      const f = (await window.App.confirm({ title: '¿Adjuntar el comprobante?', text: 'Puedes subir la foto o el PDF del pago ahora o después desde la lista.', ok: 'Adjuntar', danger: false })) ? await RO.elegirArchivo() : null;
      if (f) await RO.subir(`/api/cuotas/pagos/${p.id}/comprobante`, f).then(() => toast('Comprobante adjunto')).catch((x) => toast(x.message, false));
      cargar();
    } catch (x) { toast(x.message, false); }
  }

  async function periodos() {
    const { el, m } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    const pintar = async () => {
      const rows = (await api('/api/cuotas/periodos')).rows;
      el.querySelector('.modal-content').innerHTML = `<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Periodos de cuota</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body"><form class="row g-2 align-items-end mb-3" data-gen><div class="col-6 col-md-3"><label class="form-label small mb-1">Desde</label><input class="form-control" type="month" name="desde" required></div>
          <div class="col-6 col-md-3"><label class="form-label small mb-1">Hasta</label><input class="form-control" type="month" name="hasta" required></div><div class="col-6 col-md-3"><label class="form-label small mb-1">Valor mensual</label><input class="form-control" type="number" min="1" name="monto" value="${rows[0]?.monto || 25000}" required></div>
          <div class="col-6 col-md-3"><button class="btn btn-primary w-100">Generar meses</button></div></form>
          ${rows.length ? window.App.table([{ label: 'Mes', main: true, html: (p) => esc(p.nombre) }, { label: 'Valor', html: (p) => C.money(p.monto) }, { label: 'Vence', html: (p) => C.day(p.vence) },
            { label: '', cls: 'text-end', html: (p) => `<button class="btn btn-sm btn-light" data-borrar="${p.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` }], rows) : window.App.empty('bi-calendar3', 'Genera los meses del año rotario con el valor de la cuota.')}</div>`;
      el.querySelector('[data-gen]').onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { const r = await api('/api/cuotas/periodos/generar', { method: 'POST', body: { desde: f.desde.value, hasta: f.hasta.value, monto: f.monto.value } }); toast(`${r.creados} meses creados`); pintar(); } catch (x) { toast(x.message, false); } };
      el.querySelectorAll('[data-borrar]').forEach((b) => (b.onclick = async () => { try { await api(`/api/cuotas/periodos/${b.dataset.borrar}`, { method: 'DELETE' }); pintar(); } catch (x) { toast(x.message, false); } }));
    };
    el.addEventListener('hidden.bs.modal', cargar);
    pintar();
  }

  async function accion(a, p) {
    try {
      if (a === 'verificar') { await api(`/api/cuotas/pagos/${p.id}/verificar`, { method: 'POST', body: {} }); toast('Verificado: entró a la Caja menor'); }
      if (a === 'rechazar') { const motivo = prompt('¿Por qué se rechaza? (el socio lo verá)'); if (!motivo) return; await api(`/api/cuotas/pagos/${p.id}/rechazar`, { method: 'POST', body: { motivo } }); toast('Rechazado'); }
      if (a === 'anular') { if (!(await window.App.confirm({ title: '¿Anular este pago?', text: 'Sale de la Caja menor y deja de contar en la cartera.', ok: 'Anular' }))) return; await api(`/api/cuotas/pagos/${p.id}/anular`, { method: 'POST', body: {} }); toast('Anulado'); }
      if (a === 'subir') { const f = await RO.elegirArchivo(); if (!f) return; await RO.subir(`/api/cuotas/pagos/${p.id}/comprobante`, f); toast('Comprobante adjunto'); }
      cargar();
    } catch (x) { toast(x.message, false); }
  }

  function pintar() {
    const q = filtro.toLowerCase(), k = cartera.filter((x) => !q || x.nombre.toLowerCase().includes(q)).sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
    const pend = pagos.filter((p) => p.estado === 'pendiente');
    C.kpis(view.querySelector('[data-kpis]'), [['Al día', cartera.filter((x) => x.estado !== 'debe').length, `de ${cartera.length} socios`, 'bi-check2-circle'], ['Deben', cartera.filter((x) => x.estado === 'debe').length, '', 'bi-exclamation-circle'],
      ['Por cobrar', C.money(cartera.reduce((s, x) => s + x.saldo, 0)), '', 'bi-wallet2'], ['Por verificar', pend.length, 'pagos reportados', 'bi-hourglass-split']]);
    view.querySelector('[data-cartera]').innerHTML = k.length ? `<div class="ro-socios">${k.map((x) => `<div class="ro-scard" data-s="${x.socio_id}">${RO.avatar(x, 40)}<span class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(x.nombre)}</b>
        <span class="small text-body-secondary">${x.saldo ? `Debe <b class="text-danger">${C.money(x.saldo)}</b>` : x.a_favor ? `A favor ${C.money(x.a_favor)}` : `Pagado ${C.money(x.pagado)}`}</span></span>${C.chip(...(EST[x.estado] || EST.debe))}</div>`).join('')}</div>`
      : window.App.empty('bi-wallet2', 'No hay socios que paguen cuota, o aún no hay periodos. Crea los meses en «Periodos».');
    view.querySelector('[data-pend]').innerHTML = pend.length ? `<div class="alert alert-warning d-flex align-items-center gap-2"><i class="bi bi-hourglass-split"></i><span class="flex-grow-1">${pend.length} pago${pend.length > 1 ? 's' : ''} reportado${pend.length > 1 ? 's' : ''} por los socios esperan verificación.</span></div>` : '';
    view.querySelector('[data-pagos]').innerHTML = pagos.length ? window.App.table([
      { label: 'Fecha', html: (p) => C.day(p.fecha) }, { label: 'Socio', main: true, html: (p) => `${esc(p.socio || '')}<div class="small text-body-secondary fw-normal text-capitalize">${esc(p.metodo || '')}${p.observaciones ? ` · ${esc(p.observaciones)}` : ''}${p.motivo_rechazo ? ` · <span class="text-danger">${esc(p.motivo_rechazo)}</span>` : ''}</div>` },
      { label: 'Monto', cls: 'text-end', html: (p) => `<b class="${p.estado === 'anulado' ? 'text-decoration-line-through text-body-secondary' : ''}">${C.money(p.monto)}</b>` }, { label: 'Estado', html: (p) => C.chip(...(PEST[p.estado] || PEST.pendiente)) },
      { label: 'Comprobante', html: (p) => (p.comprobante ? `<a class="btn btn-sm btn-light" href="/api/cuotas/pagos/${p.id}/comprobante" target="_blank" rel="noopener"><i class="bi bi-paperclip me-1"></i>Ver</a>` : W && p.estado !== 'anulado' ? `<button class="btn btn-sm btn-light" data-a="subir" data-p="${p.id}"><i class="bi bi-upload"></i></button>` : '<span class="text-body-secondary">—</span>') },
      { label: '', cls: 'text-end text-nowrap', html: (p) => (!W ? '' : p.estado === 'pendiente' ? `<button class="btn btn-sm btn-success" data-a="verificar" data-p="${p.id}">Verificar</button> <button class="btn btn-sm btn-outline-danger" data-a="rechazar" data-p="${p.id}">Rechazar</button>`
        : p.estado === 'verificado' ? `<button class="btn btn-sm btn-light" data-a="anular" data-p="${p.id}" title="Anular"><i class="bi bi-x-circle"></i></button>` : '') }], pagos) : window.App.empty('bi-receipt', 'Aún no hay ingresos de cuotas.');
  }

  async function cargar() {
    [cartera, pagos] = await Promise.all([api('/api/cuotas/cartera').then((d) => d.rows), api('/api/cuotas/pagos').then((d) => d.rows)]);
    pintar();
  }

  view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-kpis></div>
    <div class="d-flex align-items-center gap-2 mb-2"><h2 class="h6 mb-0 flex-grow-1">Cartera</h2><input class="form-control form-control-sm" style="max-width:220px" placeholder="Buscar socio…" data-q aria-label="Buscar socio"></div>
    <div class="mb-4" data-cartera></div><div data-pend></div><h2 class="h6 mb-2">Ingresos de cuotas</h2><div class="dw-card p-0 p-md-2" data-pagos></div>`;
  view.querySelector('[data-q]').addEventListener('input', (e) => { filtro = e.target.value.trim(); pintar(); });
  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]'); if (b) return accion(b.dataset.a, pagos.find((p) => String(p.id) === b.dataset.p));
    const s = e.target.closest('[data-s]'); if (s && W) registrar(s.dataset.s);
  });
  await cargar();
});
