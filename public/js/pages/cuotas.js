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
  let cartera = [], pagos = [], filtro = '', anio = null, fEst = '', cfg = { aspirantes: false, honorarios: false };
  const ICO = { debe: 'bi-exclamation-circle-fill', por_vencer: 'bi-clock-fill', al_dia: 'bi-check-circle-fill', adelantado: 'bi-star-fill' };
  RO.nav('cuotas');

  if (W) {
    acciones.innerHTML = '<button class="btn btn-outline-secondary" data-quien><i class="bi bi-people me-1"></i>¿Quién paga?</button><button class="btn btn-outline-secondary" data-per><i class="bi bi-calendar3 me-1"></i>Periodos</button><button class="btn btn-primary" data-pago><i class="bi bi-plus-lg me-1"></i>Registrar pago</button>';
    acciones.querySelector('[data-pago]').onclick = () => registrar();
    acciones.querySelector('[data-quien]').onclick = async () => {
      const out = await C.form({ title: '¿Quién paga cuota?', fields: [
        { k: 'aspirantes', label: 'Aspirantes', type: 'bool', check: 'Los aspirantes también pagan cuota', hint: 'Siempre pagan los socios activos y la junta; los externos y voluntarios nunca.' },
        { k: 'honorarios', label: 'Honorarios', type: 'bool', check: 'Los socios honorarios también pagan cuota' }], values: cfg, okText: 'Guardar' });
      if (!out) return;
      try { cfg = await api('/api/cuotas/config', { method: 'PUT', body: out }); toast('Listo: la cartera se recalculó'); cargar(); } catch (x) { toast(x.message, false); }
    };
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
      if (a === 'editar') {
        const out = await C.form({ title: `Editar pago · ${p.socio || ''}`, fields: [{ k: 'monto', label: 'Monto', type: 'money', required: true }, { k: 'fecha', label: 'Fecha del pago', type: 'date', required: true },
          { k: 'metodo', label: 'Método', type: 'select', options: METODOS }, { k: 'observaciones', label: 'Observaciones', type: 'long' }], values: p, okText: 'Guardar' });
        if (!out) return;
        await api(`/api/cuotas/pagos/${p.id}`, { method: 'PATCH', body: out }); toast('Pago actualizado (también en la Caja menor)');
      }
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
    const n = (e) => cartera.filter((x) => x.estado === e).length;
    C.kpis(view.querySelector('[data-kpis]'), [['Deben', n('debe'), C.money(cartera.filter((x) => x.estado === 'debe').reduce((t, x) => t + x.saldo, 0)), 'bi-exclamation-circle'],
      ['Por vencer', n('por_vencer'), 'tienen cuota del mes sin pagar', 'bi-clock'], ['Al día', n('al_dia') + n('adelantado'), `de ${cartera.length} socios · ${n('adelantado')} adelantados`, 'bi-check2-circle'],
      ['Por verificar', pend.length, 'pagos reportados', 'bi-hourglass-split']]);
    // Filtro por estado y tarjetas de color según cómo va cada socio (el nombre baja de línea, no se sale de la tarjeta)
    const ORD = { debe: 0, por_vencer: 1, al_dia: 2, adelantado: 3 };
    const vis = k.filter((x) => !fEst || x.estado === fEst).sort((a, b) => ORD[a.estado] - ORD[b.estado] || b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
    const linea = (x) => x.estado === 'debe' ? `<b>Debe ${C.money(x.saldo)}</b>${x.vencido ? ` · ${C.money(x.vencido)} vencido` : ''}`
      : x.estado === 'por_vencer' ? `<b>Por vencer ${C.money(x.saldo)}</b>` : x.estado === 'adelantado' ? `<b>A favor ${C.money(x.a_favor)}</b>` : `<b>Al día</b> · pagado ${C.money(x.pagado)}`;
    view.querySelector('[data-cartera]').innerHTML = `<p class="small text-body-secondary mb-2"><i class="bi bi-info-circle me-1"></i>Pagan cuota: socios activos y junta${cfg.aspirantes ? ', aspirantes' : ''}${cfg.honorarios ? ', honorarios' : ''}. Cada uno desde el mes en que ingresó (o el primer periodo creado).</p>` + (cartera.length ? `<div class="d-flex flex-wrap gap-2 mb-2">${[['', 'Todos', cartera.length], ['debe', 'Deben', n('debe')], ['por_vencer', 'Por vencer', n('por_vencer')], ['al_dia', 'Al día', n('al_dia')], ['adelantado', 'Adelantados', n('adelantado')]]
        .map(([e, l, c]) => `<button type="button" class="btn btn-sm ${fEst === e ? 'btn-primary' : 'btn-light'} rounded-pill" data-fe="${e}">${l} <span class="badge text-bg-${fEst === e ? 'light' : 'secondary'}">${c}</span></button>`).join('')}</div>
      ${vis.length ? `<div class="ro-cart">${vis.map((x) => `<div class="ro-cc ro-cc-${x.estado}" data-s="${x.socio_id}" role="button" tabindex="0">
          <div class="d-flex align-items-start gap-2">${RO.avatar(x, 38)}<div class="min-w-0 flex-grow-1"><b class="ro-cc-n">${esc(x.nombre)}</b>${x.cargo ? `<div class="small text-body-secondary text-truncate">${esc(x.cargo)}</div>` : ''}</div></div>
          <div class="ro-cc-pie"><span class="ro-cc-e"><i class="bi ${ICO[x.estado]} me-1"></i>${(EST[x.estado] || EST.debe)[1]}</span><span class="text-end">${linea(x)}</span></div>
          <div class="small text-body-secondary">${x.desde ? `Cobra desde <b class="text-capitalize">${C.monthName(x.desde)}</b>` : 'Sin meses por cobrar'} · ${x.periodos} ${x.periodos === 1 ? 'mes' : 'meses'}${x.fecha_ingreso ? ` · ingresó ${C.day(x.fecha_ingreso)}` : ''}${['aspirante', 'honorario'].includes(x.tipo) ? ` · ${x.tipo === 'aspirante' ? 'aspirante' : 'honorario'}` : ''}<br>${x.ultimo_pago ? `Último pago ${C.day(x.ultimo_pago)}` : 'Sin pagos'}</div></div>`).join('')}</div>`
        : '<p class="small text-body-secondary">Nadie en este estado.</p>'}`
      : window.App.empty('bi-wallet2', 'No hay socios que paguen cuota, o aún no hay periodos. Crea los meses en «Periodos».'));
    view.querySelector('[data-pend]').innerHTML = pend.length ? `<div class="alert alert-warning d-flex align-items-center gap-2"><i class="bi bi-hourglass-split"></i><span class="flex-grow-1">${pend.length} pago${pend.length > 1 ? 's' : ''} reportado${pend.length > 1 ? 's' : ''} por los socios esperan verificación.</span></div>` : '';
    view.querySelector('[data-pagos]').innerHTML = pagos.length ? window.App.table([
      { label: 'Fecha', html: (p) => C.day(p.fecha) }, { label: 'Socio', main: true, html: (p) => `${esc(p.socio || '')}<div class="small text-body-secondary fw-normal text-capitalize">${esc(p.metodo || '')}${p.observaciones ? ` · ${esc(p.observaciones)}` : ''}${p.motivo_rechazo ? ` · <span class="text-danger">${esc(p.motivo_rechazo)}</span>` : ''}</div>` },
      { label: 'Monto', cls: 'text-end', html: (p) => `<b class="${p.estado === 'anulado' ? 'text-decoration-line-through text-body-secondary' : ''}">${C.money(p.monto)}</b>` }, { label: 'Estado', html: (p) => C.chip(...(PEST[p.estado] || PEST.pendiente)) },
      { label: 'Comprobante', html: (p) => (p.comprobante ? `<a class="btn btn-sm btn-light" href="/api/cuotas/pagos/${p.id}/comprobante" target="_blank" rel="noopener"><i class="bi bi-paperclip me-1"></i>Ver</a>` : W && p.estado !== 'anulado' ? `<button class="btn btn-sm btn-light" data-a="subir" data-p="${p.id}"><i class="bi bi-upload"></i></button>` : '<span class="text-body-secondary">—</span>') },
      { label: '', cls: 'text-end text-nowrap', html: (p) => (!W ? '' : p.estado === 'pendiente' ? `<button class="btn btn-sm btn-light" data-a="editar" data-p="${p.id}" title="Editar"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-success" data-a="verificar" data-p="${p.id}">Verificar</button> <button class="btn btn-sm btn-outline-danger" data-a="rechazar" data-p="${p.id}">Rechazar</button>`
        : p.estado === 'verificado' ? `<button class="btn btn-sm btn-light" data-a="editar" data-p="${p.id}" title="Editar"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-light" data-a="anular" data-p="${p.id}" title="Anular"><i class="bi bi-x-circle"></i></button>` : '') }], pagos) : window.App.empty('bi-receipt', 'Aún no hay ingresos de cuotas.');
  }

  // Año rotario (julio → junio): barras de lo recaudado por mes y una casilla por socio y mes.
  const CEL = { pagado: 'Pagado', parcial: 'Abono parcial', debe: 'Debe', pendiente: 'Aún no vence', na: 'Sin cuota' };
  const MES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  async function pintarAnio(a) {
    const el = view.querySelector('[data-anio]');
    let d; try { d = await api(`/api/cuotas/anio${a ? `?anio=${a}` : ''}`); } catch (x) { el.innerHTML = ''; return; }
    anio = d.anio;
    const esp = d.meses.reduce((t, m) => t + m.esperado, 0), rec = d.meses.reduce((t, m) => t + m.recaudado, 0);
    const corto = (m) => MES[+m.slice(5)];
    el.innerHTML = `<div class="dw-card mb-4">
      <div class="d-flex align-items-center gap-2 mb-2 flex-wrap"><h2 class="h6 m-0 flex-grow-1"><i class="bi bi-calendar-range me-1"></i>Año rotario ${esc(d.nombre)} <span class="small text-body-secondary fw-normal">· julio a junio</span></h2>
        <div class="btn-group btn-group-sm"><button class="btn btn-light" data-ay="${d.anio - 1}" ${d.anios[0] >= d.anio ? 'disabled' : ''} aria-label="Año anterior"><i class="bi bi-chevron-left"></i></button>
        <button class="btn btn-light" data-ay="${d.anio + 1}" ${d.anios.at(-1) <= d.anio ? 'disabled' : ''} aria-label="Año siguiente"><i class="bi bi-chevron-right"></i></button></div></div>
      <div class="small text-body-secondary mb-1">Recaudado <b class="text-body">${C.money(rec)}</b> de ${C.money(esp)}${esp ? ` · ${Math.round(rec / esp * 100)}%` : ''}</div>
      <div data-abars></div>
      ${d.rows.length ? `<div class="ro-anio mt-3"><table><thead><tr><th></th>${d.meses.map((m) => `<th title="${m.monto == null ? 'Sin periodo creado' : C.money(m.monto)}">${corto(m.mes)}</th>`).join('')}<th class="text-end">Meses</th></tr></thead>
        <tbody>${d.rows.map((r) => `<tr><td class="ro-anio-n">${RO.avatar(r, 26)}<span class="text-truncate">${esc(r.nombre)}</span>${r.por_verificar ? '<i class="bi bi-hourglass-split text-warning" title="Tiene pagos por verificar"></i>' : ''}</td>
          ${r.celdas.map((x) => `<td><i class="ro-c ro-c-${x.estado}" title="${corto(x.mes)} · ${CEL[x.estado]}${x.monto ? ` · ${C.money(x.aplicado)} de ${C.money(x.monto)}` : ''}"></i></td>`).join('')}
          <td class="text-end small"><b>${r.pagados}</b>${r.a_favor ? `<div class="text-success" title="Saldo a favor">+${C.money(r.a_favor)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="dw-legend mt-2">${['pagado', 'parcial', 'debe', 'pendiente'].map((k) => `<span><i class="ro-c ro-c-${k}"></i>${CEL[k]}</span>`).join('')}</div>` : ''}</div>`;
    C.bars(el.querySelector('[data-abars]'), d.meses.map((m) => ({ label: corto(m.mes), a: m.recaudado, b: Math.max(0, m.esperado - m.recaudado) })), { la: 'Pagado', lb: 'Falta' });
  }

  async function cargar() {
    [cartera, pagos, cfg] = await Promise.all([api('/api/cuotas/cartera').then((d) => d.rows), api('/api/cuotas/pagos').then((d) => d.rows), api('/api/cuotas/config').catch(() => cfg)]);
    pintar(); pintarAnio(anio);
  }

  view.innerHTML = `<style>.ro-cart{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))}
      .ro-cc{--c:var(--bs-secondary-color);display:grid;gap:8px;padding:12px;border-radius:14px;border:1px solid color-mix(in srgb,var(--c) 35%,transparent);border-left:5px solid var(--c);background:color-mix(in srgb,var(--c) 8%,var(--bs-body-bg));cursor:pointer;min-width:0}
      .ro-cc:hover{background:color-mix(in srgb,var(--c) 14%,var(--bs-body-bg))}.ro-cc-n{display:block;line-height:1.25;overflow-wrap:anywhere}
      .ro-cc-debe{--c:var(--bs-danger)}.ro-cc-por_vencer{--c:#d97706}.ro-cc-al_dia{--c:var(--bs-success)}.ro-cc-adelantado{--c:#0284c7}
      .ro-cc-pie{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:.85rem;padding-top:8px;border-top:1px dashed color-mix(in srgb,var(--c) 40%,transparent);color:var(--c)}
      .ro-cc-e{font-weight:700;white-space:nowrap}
.ro-anio{overflow-x:auto}.ro-anio table{width:100%;border-collapse:separate;border-spacing:3px;font-size:.8rem}.ro-anio th{font-weight:600;color:var(--bs-secondary-color);text-align:center}
      .ro-anio td{text-align:center;padding:0}.ro-anio-n{display:flex;align-items:center;gap:6px;text-align:left!important;min-width:150px;max-width:220px;padding-right:6px!important}
      .ro-c{display:inline-block;width:100%;min-width:18px;height:18px;border-radius:5px;vertical-align:middle}.dw-legend .ro-c{width:12px;min-width:12px;height:12px;margin-right:4px}
      .ro-c-pagado{background:var(--bs-success)}.ro-c-parcial{background:var(--bs-warning)}.ro-c-debe{background:var(--bs-danger)}.ro-c-pendiente{background:rgba(var(--dw-p-rgb),.18)}.ro-c-na{border:1px dashed var(--bs-border-color)}</style>
    <div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div data-anio></div>
    <div class="d-flex align-items-center gap-2 mb-2"><h2 class="h6 mb-0 flex-grow-1">Cartera</h2><input class="form-control form-control-sm" style="max-width:220px" placeholder="Buscar socio…" data-q aria-label="Buscar socio"></div>
    <div class="mb-4" data-cartera></div><div data-pend></div><h2 class="h6 mb-2">Ingresos de cuotas</h2><div class="dw-card p-0 p-md-2" data-pagos></div>`;
  view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.ro-cc')) e.target.click(); });
  view.querySelector('[data-q]').addEventListener('input', (e) => { filtro = e.target.value.trim(); pintar(); });
  view.addEventListener('click', (e) => {
    const y = e.target.closest('[data-ay]'); if (y) return pintarAnio(Number(y.dataset.ay));
    const b = e.target.closest('[data-a]'); if (b) return accion(b.dataset.a, pagos.find((p) => String(p.id) === b.dataset.p));
    const fe = e.target.closest('[data-fe]'); if (fe) { fEst = fe.dataset.fe; return pintar(); }
    const s = e.target.closest('[data-s]'); if (s && W) registrar(s.dataset.s);
  });
  await cargar();
});
