// Distrito: tablero de todos los clubes del distrito (solo lectura), los 12 meses del año rotario sumados, el detalle de cada
// club y la cuota distrital (valor por socio activo) que a cada club le llega como obligación en Finanzas → Proyectado.
// Pestaña Juegos: retos del distrito (un juego en unas fechas), ranking entre clubes y las preguntas/palabras del distrito,
// que llegan a todos sus clubes (cada presidencia puede apagarlas en su club).
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud, RO = window.RO;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  if (!me.distrito?.es_distrito) { view.innerHTML = `<div class="dw-card">${window.App.empty('bi-diagram-3', 'Esta sección es solo para el perfil del distrito.')}</div>`; return; }
  const M = me.canManage && !me.business.readOnly;
  const corto = (m) => ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][+m.slice(5)];
  const EST = { pagada: ['ok', 'Pagada'], pendiente: ['soon', 'Pendiente'], vencida: ['bad', 'Vencida'] };
  let tab = ['impacto', 'anio', 'metas', 'formatos', 'cuotas', 'bonos', 'cargos', 'orden', 'juegos'].includes(location.hash.slice(1)) ? location.hash.slice(1) : /^#(formato|envio)=/.test(location.hash) ? 'formatos' : 'clubes', anio = null, t = null;
  document.querySelector('[data-h1]').textContent = `Distrito ${({ rotary: 'Rotary', rotaract: 'Rotaract', interact: 'Interact' })[me.distrito.programa] || ''} ${me.distrito.codigo}`;
  RO.pills([['clubes', 'Clubes', '#clubes', 'bi-diagram-3'], ['impacto', 'Impacto', '#impacto', 'bi-globe-americas'], ['anio', 'Año rotario', '#anio', 'bi-bar-chart'], ['metas', 'Metas', '#metas', 'bi-bullseye'], ['formatos', 'Formatos', '#formatos', 'bi-file-earmark-text'], ['cuotas', 'Cuotas', '#cuotas', 'bi-bank'], ['bonos', 'Bonos', '#bonos', 'bi-ticket-perforated'], ['cargos', 'Cargos', '#cargos', 'bi-person-badge'], ['orden', 'Orden del día', '#orden', 'bi-list-ol'], ['juegos', 'Juegos', '#juegos', 'bi-controller']], tab, (k) => { tab = k; pintar(); });

  const selAnio = () => `<div class="btn-group btn-group-sm ms-auto"><button class="btn btn-light" data-ay="-1" aria-label="Año anterior"><i class="bi bi-chevron-left"></i></button>
    <span class="btn btn-light disabled text-body fw-semibold">${esc(t.nombre_anio)}</span><button class="btn btn-light" data-ay="1" aria-label="Año siguiente"><i class="bi bi-chevron-right"></i></button></div>`;
  const kpis = (el) => { const x = t.totales; C.kpis(el, [['Clubes', x.clubes, `Distrito ${esc(t.codigo)}`, 'bi-diagram-3'], ['Socios activos', C.num(x.socios), `${C.num(x.activados)} activados`, 'bi-people-fill'],
    ['Beneficiados', C.num(x.beneficiados), `${C.num(x.horas)} horas de servicio`, 'bi-globe-americas'], ['Cuota distrital', C.money(x.distrital_pagado), `de ${C.money(x.distrital_total)} · ${t.nombre_anio}`, 'bi-bank']]); };

  const PROG = { rotary: 'Rotary', rotaract: 'Rotaract', interact: 'Interact' };
  let prog = '';   // filtro por programa ('' = todos)
  const semaforo = (n) => (n >= 75 ? ['#198754', 'Va bien'] : n >= 50 ? ['#e0a800', 'Atención'] : ['#dc3545', 'Necesita apoyo']);
  function pintarClubes() {
    const hay = [...new Set(t.clubes.map((k) => k.programa))], lista = t.clubes.filter((k) => !prog || k.programa === prog).sort((a, b) => a.avance - b.avance);
    view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-k></div><div data-sol></div>${hay.length > 1 ? `<div class="d-flex flex-wrap gap-2 mb-3">${[['', 'Todos'], ...hay.map((p) => [p, PROG[p] || p])].map(([p, l]) => `<button type="button" class="btn btn-sm rounded-pill ${p === prog ? 'btn-primary' : 'btn-outline-secondary'}" data-prog="${p}">${esc(l)} <span class="opacity-75">${p ? t.clubes.filter((k) => k.programa === p).length : t.clubes.length}</span></button>`).join('')}</div>` : ''}${lista.length ? `<div class="ro-dclubs">${lista.map((k) => { const [col, txt] = semaforo(k.avance); return `<button type="button" class="ro-dclub" data-club="${esc(k.id)}" style="border-top:4px solid ${col}">
        <div class="d-flex align-items-center gap-2"><span class="ro-av" style="width:40px;height:40px;font-size:15px">${esc(RO.initials(k.nombre))}</span><span class="flex-grow-1 text-truncate"><b>${esc(k.nombre)}</b><span class="d-block small text-body-secondary">${esc(PROG[k.programa] || '')}</span></span><i class="bi bi-chevron-right"></i></div>
        <div class="d-flex align-items-center gap-2 mt-2"><span class="small fw-semibold" style="color:${col}">${txt} · ${k.avance}%</span></div>${C.meter(k.avance, 100)}${k.falta.length ? `<div class="small text-body-secondary mt-1">Le falta: ${esc(k.falta.join(' · '))}</div>` : ''}
        <div class="ro-pstats mt-2"><span><b>${k.socios}</b>socios</span><span><b>${k.asistencia == null ? '—' : `${k.asistencia}%`}</b>asistencia</span><span><b>${C.num(k.beneficiados)}</b>beneficiados</span></div>
        <div class="small mt-2 d-flex justify-content-between"><span>Activados</span><b>${k.activados}/${k.socios}</b></div>${C.meter(k.activados, k.socios)}
        <div class="small mt-1 d-flex justify-content-between"><span>Cuotas al día</span><b>${k.cuotas_al_dia}/${k.cuotas_socios}</b></div>${C.meter(k.cuotas_al_dia, k.cuotas_socios)}
        <div class="small mt-1 d-flex justify-content-between"><span>Cuota distrital</span><b>${C.money(k.distrital_pagado)} / ${C.money(k.distrital_total)}</b></div>${C.meter(k.distrital_pagado, k.distrital_total)}
        <div class="small text-body-secondary mt-2">Caja menor ${C.money(k.caja_menor)} · Caja mayor ${C.money(k.caja_mayor)} · ${k.en_curso} proyectos en curso</div></button>`; }).join('')}</div>`
      : window.App.empty('bi-diagram-3', `Aún no hay clubes en el distrito ${esc(t.codigo)}.`)}`;
    kpis(view.querySelector('[data-k]'));
    solicitudes(view.querySelector('[data-sol]'));
  }
  // Clubes nuevos: el distrito los solicita y Diwilo los crea en su admin (la solicitud sale por WhatsApp con los datos)
  const EST_SOL = { pendiente: ['soon', 'Pendiente'], creado: ['ok', 'Creado'], descartado: ['free', 'Descartado'] };
  async function solicitudes(el) {
    if (!el) return;
    const rows = (await api('/api/distrito/solicitudes').catch(() => ({ rows: [] }))).rows.filter((s) => s.estado === 'pendiente' || Date.now() - s.updated_at < 30 * 864e5);
    if (!rows.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="dw-card mb-3"><div class="ro-h mt-0"><i class="bi bi-plus-circle me-1"></i>Clubes nuevos solicitados</div>${rows.map((s) => `<div class="d-flex flex-wrap align-items-center gap-2 py-1 border-bottom small">
      <span class="flex-grow-1"><b>${esc(s.nombre)}</b> · ${esc(PROG[s.programa] || s.programa)}${s.ciudad ? ` · ${esc(s.ciudad)}` : ''}${s.presidente ? ` · ${esc(s.presidente)}` : ''}</span>${C.chip(...EST_SOL[s.estado])}
      ${M && s.estado === 'pendiente' ? `<a class="btn btn-sm btn-light" href="${esc(s.whatsapp)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>Reenviar</a><button class="btn btn-sm btn-light" data-sol-est="creado" data-sol-id="${s.id}">Ya se creó</button><button class="btn btn-sm btn-light" data-sol-est="descartado" data-sol-id="${s.id}">Descartar</button>` : ''}</div>`).join('')}
      <div class="small text-body-secondary mt-1">Diwilo crea el club y le envía la invitación a la presidencia. Cuando aparezca en tu lista, márcalo como creado.</div></div>`;
    el.querySelectorAll('[data-sol-id]').forEach((b) => (b.onclick = async () => { try { await api(`/api/distrito/solicitudes/${b.dataset.solId}`, { method: 'PATCH', body: { estado: b.dataset.solEst } }); solicitudes(el); } catch (x) { toast(x.message, false); } }));
  }
  async function solicitarClub() {
    const out = await C.form({ title: 'Solicitar club nuevo', fields: [{ k: 'nombre', label: 'Nombre del club', type: 'text', required: true, full: true, placeholder: 'Rotaract Club de Envigado' },
      { k: 'programa', label: 'Programa', type: 'select', options: [['rotary', 'Rotary'], ['rotaract', 'Rotaract'], ['interact', 'Interact']] }, { k: 'ciudad', label: 'Ciudad', type: 'text' },
      { k: 'presidente', label: 'Presidencia (quien lo administrará)', type: 'text' }, { k: 'correo', label: 'Correo de la presidencia', type: 'email' }, { k: 'telefono', label: 'Teléfono', type: 'text' },
      { k: 'notas', label: 'Notas', type: 'long' }], values: { programa: me.distrito.programa || 'rotaract' }, okText: 'Solicitar' });
    if (!out) return;
    try { const r = await api('/api/distrito/solicitudes', { method: 'POST', body: out }); window.open(r.whatsapp, '_blank', 'noopener'); toast('Solicitud guardada: envíala por WhatsApp a Diwilo'); pintarClubes(); } catch (x) { toast(x.message, false); }
  }

  function pintarAnio() {
    const sum = (k) => t.meses.reduce((s, m) => s + m[k], 0);
    view.innerHTML = `<div class="dw-card mb-3 d-flex align-items-center gap-2"><b>Año rotario ${esc(t.nombre_anio)}</b><span class="small text-body-secondary">julio a junio · todos los clubes</span>${selAnio()}</div>
      <div class="row g-3">
        <div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Ingresos y egresos de los clubes</div><div data-g1></div><div class="small text-body-secondary mt-1">Año: +${C.money(sum('ingresos'))} · −${C.money(sum('egresos'))}</div></div></div>
        <div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Cuotas de socios recaudadas y cuota distrital pagada</div><div data-g2></div></div></div>
        <div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Reuniones y eventos</div><div data-g3></div></div></div>
        <div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Inversión de los clubes</div><div data-g4></div></div></div>
        <div class="col-12"><div class="dw-card p-0 p-md-2"><div class="table-responsive"><table class="table table-sm mb-0" style="font-variant-numeric:tabular-nums;font-size:.85rem"><thead><tr><th>Mes</th><th class="text-end">Ingresos</th><th class="text-end">Egresos</th><th class="text-end">Cuotas socios</th><th class="text-end">Cuota distrital</th><th class="text-end">Reuniones</th><th class="text-end">Eventos</th></tr></thead>
          <tbody>${t.meses.map((m) => `<tr><td class="text-capitalize">${C.monthName(m.mes)}</td><td class="text-end">${C.money(m.ingresos)}</td><td class="text-end">${C.money(m.egresos)}</td><td class="text-end">${C.money(m.cuotas)}</td><td class="text-end">${C.money(m.distrital)}</td><td class="text-end">${m.reuniones}</td><td class="text-end">${m.eventos}</td></tr>`).join('')}</tbody></table></div></div></div>
      </div>`;
    C.bars(view.querySelector('[data-g1]'), t.meses.map((m) => ({ label: corto(m.mes), a: m.ingresos, b: m.egresos })), { la: 'Ingresos', lb: 'Egresos' });
    C.bars(view.querySelector('[data-g2]'), t.meses.map((m) => ({ label: corto(m.mes), a: m.cuotas, b: m.distrital })), { la: 'Cuotas de socios', lb: 'Cuota distrital', separate: true });
    C.bars(view.querySelector('[data-g3]'), t.meses.map((m) => ({ label: corto(m.mes), a: m.reuniones, b: m.eventos })), { la: 'Reuniones', lb: 'Eventos', fmt: C.num });
    C.rank(view.querySelector('[data-g4]'), t.categorias.map((x) => ({ k: x.categoria, n: x.total })), C.money);
    if (!t.categorias.length) view.querySelector('[data-g4]').innerHTML = '<p class="small text-body-secondary mb-0">Sin inversiones registrados este año.</p>';
  }

  /* ---------- Cobros del distrito (cuotas y bonos): tarjeta visual por cobro, todos los clubes y ficha de pago ---------- */
  const pct = (n) => `${n}%`;
  const chipsDesc = (ds) => [...(ds?.pronto || []).map((x) => `<span class="ro-dchip"><i class="bi bi-lightning-charge"></i>${pct(x.pct)} si paga todo antes del ${C.day(x.hasta)}</span>`),
    ...(ds?.planes || []).map((x) => `<span class="ro-dchip"><i class="bi bi-calendar3"></i>${x.cuotas} cuotas${x.pct ? ` · ${pct(x.pct)} menos` : ''}</span>`)].join('');
  const kpiCobros = (el, rows, tit) => { const tot = rows.reduce((t, q) => t + q.total, 0), pag = rows.reduce((t, q) => t + q.pagado, 0), cl = rows.flatMap((q) => q.clubes);
    C.kpis(el, [[`${tit}: a recaudar`, C.money(tot), `${rows.length} ${rows.length === 1 ? 'cobro' : 'cobros'}`, 'bi-cash-stack'], ['Recaudado', C.money(pag), tot ? `${Math.round((pag / tot) * 100)}% del total` : '—', 'bi-check2-circle'],
      ['Por recaudar', C.money(Math.max(0, tot - pag)), `${cl.filter((x) => x.estado === 'vencida').length} cobros vencidos en clubes`, 'bi-hourglass-split'], ['Clubes', C.num(t.clubes.length), `Distrito ${esc(t.codigo)}`, 'bi-diagram-3']]); };
  async function pintarCuotas() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    const d = await api('/api/distrito/cuotas');
    cobrosCache.cuotas = d.rows;
    view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-k></div>
      <p class="small text-body-secondary"><b>Por socio</b> (valor × socios activos que pagan cuota) o <b>por club</b> (valor fijo, p. ej. representación). Puedes dar <b>descuento por pronto pago</b> (si el club paga todo antes de una fecha; pasada la fecha se cobra completo) y <b>planes de pago en cuotas</b>. A cada club le llega en <b>Finanzas → Caja menor → Obligaciones</b>, con tus datos de pago, y la paga desde ahí.</p>
      ${d.rows.length ? d.rows.map((q) => `<div class="dw-card mb-3 ro-cobro">
        <div class="d-flex align-items-start gap-3 flex-wrap"><span class="ro-cobro__i"><i class="bi bi-bank"></i></span>
          <div class="flex-grow-1 min-w-0"><div class="d-flex align-items-center gap-2 flex-wrap"><b class="fs-6">${esc(q.nombre)}</b>${q.tipo === 'por_club' ? '<span class="badge text-bg-light border">Por club</span>' : '<span class="badge text-bg-light border">Por socio</span>'}</div>
            <div class="small text-body-secondary">${C.money(q.valor_socio)} ${q.tipo === 'por_club' ? 'por club' : 'por socio'} · vence ${C.day(q.vence)} · año ${q.anio}-${q.anio + 1}${q.notas ? ` · ${esc(q.notas)}` : ''}</div>
            ${chipsDesc(q.descuentos) ? `<div class="d-flex flex-wrap gap-1 mt-2">${chipsDesc(q.descuentos)}</div>` : ''}</div>
          <div class="text-end"><div class="ro-cobro__v">${C.money(q.pagado)}</div><div class="small text-body-secondary">de ${C.money(q.total)}${q.base > q.total ? ` <s>${C.money(q.base)}</s>` : ''}</div><div class="small"><b>${q.pagaron}</b>/${q.clubes.length} clubes pagaron</div></div>
          ${M ? `<div class="d-flex gap-1"><button class="btn btn-sm btn-light" data-ed="${q.id}" aria-label="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light" data-del="${q.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button></div>` : ''}</div>
        <div class="mt-2">${C.meter(q.pagado, q.total)}</div>
        <div class="row g-3 mt-1"><div class="col-xl-8"><div class="table-responsive"><table class="table table-sm align-middle mb-0 ro-tcobro"><thead><tr><th>Club</th><th class="text-end">Socios</th><th class="text-end">Valor</th><th class="text-end">A pagar</th><th class="text-end">Pagado</th><th>Plan</th><th>Estado</th></tr></thead>
          <tbody>${q.clubes.map((x) => `<tr><td class="fw-semibold">${esc(x.club)}</td><td class="text-end">${q.tipo === 'por_club' ? '—' : x.socios}</td><td class="text-end">${C.money(x.base)}</td>
            <td class="text-end">${C.money(x.total)}${x.descuento ? `<div class="small text-success" title="${esc(x.motivo || '')}">−${C.money(x.descuento)}</div>` : ''}</td><td class="text-end">${C.money(x.pagado)}${x.total ? `<div style="min-width:70px">${C.meter(x.pagado, x.total)}</div>` : ''}</td>
            <td class="small">${x.plan ? `${x.plan.cuotas} cuotas` : 'Contado'}</td><td>${C.chip(...EST[x.estado])}</td></tr>`).join('') || '<tr><td colspan="7" class="small text-body-secondary">Aún no hay clubes en el distrito.</td></tr>'}</tbody></table></div></div>
          <div class="col-xl-4">${q.pago ? RO.fichaPago(q.pago, { compacta: true }) : `<div class="ro-pago small text-body-secondary"><i class="bi bi-exclamation-circle me-1"></i>Sin datos de pago: ${M ? 'edita la cuota y agrega el QR, la llave o la cuenta.' : 'el distrito aún no los pone.'}</div>`}</div></div></div>`).join('')
      : `<div class="dw-card">${window.App.empty('bi-bank', 'Aún no hay cuotas distritales.')}</div>`}`;
    if (d.rows.length) kpiCobros(view.querySelector('[data-k]'), d.rows, 'Cuotas');
    view.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => editarCobro('cuota', d.rows.find((q) => String(q.id) === b.dataset.ed))));
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!(await window.App.confirm({ title: '¿Borrar esta cuota?', text: 'Deja de aparecer en las finanzas de los clubes.', ok: 'Borrar' }))) return;
      try { await api(`/api/distrito/cuotas/${b.dataset.del}`, { method: 'DELETE' }); toast('Borrada'); pintarCuotas(); } catch (x) { toast(x.message, false); }
    }));
  }
  const editar = (q) => editarCobro('cuota', q);
  const cobrosCache = { cuotas: [], bonos: [] };

  // Editor en la página (cuota o bono): datos, descuentos (solo cuota), reparto (solo bono) y datos de pago con QR; vista previa de cómo le llega al club
  async function editarCobro(kind, x, guardado = null) {
    const cuota = kind === 'cuota';
    if (!cobrosCache.cuotas.length && !cobrosCache.bonos.length) { [cobrosCache.cuotas, cobrosCache.bonos] = await Promise.all([api('/api/distrito/cuotas').then((r) => r.rows).catch(() => []), api('/api/distrito/bonos').then((r) => r.rows).catch(() => [])]); }
    const previo = [...cobrosCache.cuotas, ...cobrosCache.bonos].filter((y) => y.pago).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))[0];
    const pagoDe = (y) => (y?.pago ? { ...y.pago, qr_key: y.qr_key || '', qr_ver: y.pago.qr || '' } : null);
    const st = guardado || (cuota ? { nombre: x?.nombre || `Cuota distrital ${t.nombre_anio}`, tipo: x?.tipo || 'por_socio', valor_socio: x?.valor_socio || '', vence: x?.vence || '', notas: x?.notas || '',
      pronto: (x?.descuentos?.pronto || []).map((y) => ({ ...y })), planes: (x?.descuentos?.planes || []).map((y) => ({ ...y })) }
      : { nombre: x?.nombre || '', valor: x?.valor || '', vence: x?.vence || '', notas: x?.notas || '', reparto: x?.reparto || 'por_club', cantidad: x?.cantidad || 6 });
    if (!guardado) st.pago = pagoDe(x) || (x ? {} : { ...(pagoDe(previo) || {}) });
    const ejemplo = Math.max(1, Math.round((t.totales?.socios || 20) / Math.max(1, t.clubes.length || 1))) || 20;
    acciones.innerHTML = ''; view.onclick = null; view.oninput = null; view.onchange = null;
    const salir = () => { view.onclick = null; view.oninput = null; view.onchange = null; tab = cuota ? 'cuotas' : 'bonos'; pintar(); };
    const fila = (k, i, a, b) => `<div class="d-flex gap-2 align-items-center mb-1" data-fila="${k}" data-i="${i}">${a}${b}<button type="button" class="btn btn-sm btn-light" data-qfila="${k}" data-i="${i}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>`;
    const inp = (k, v, attrs) => `<input class="form-control form-control-sm" data-c="${k}" value="${esc(v ?? '')}" ${attrs}>`;
    const descHtml = () => `<div class="ro-h">Descuentos</div>
      <div class="small fw-semibold mb-1"><i class="bi bi-lightning-charge me-1"></i>Pronto pago</div><div class="small text-body-secondary mb-1">Si el club paga TODO antes de la fecha, tiene el descuento. Pasada la fecha, se cobra completo.</div>
      ${st.pronto.map((y, i) => fila('pronto', i, `<span class="small text-nowrap">Hasta</span>${inp('hasta', y.hasta, 'type="date" style="max-width:170px"')}`, `${inp('pct', y.pct, 'type="number" min="1" max="90" style="max-width:80px" aria-label="Porcentaje"')}<span class="small">%</span>`)).join('')}
      <button type="button" class="btn btn-sm btn-link px-0" data-afila="pronto"><i class="bi bi-plus-lg me-1"></i>Fecha de pronto pago</button>
      <div class="small fw-semibold mb-1 mt-2"><i class="bi bi-calendar3 me-1"></i>Pagar en cuotas</div><div class="small text-body-secondary mb-1">El club elige el plan; las cuotas son mensuales y la última cae en la fecha de vencimiento.</div>
      ${st.planes.map((y, i) => fila('planes', i, `${inp('cuotas', y.cuotas, 'type="number" min="2" max="12" style="max-width:80px" aria-label="Número de cuotas"')}<span class="small text-nowrap">cuotas con</span>`, `${inp('pct', y.pct, 'type="number" min="0" max="90" style="max-width:80px" aria-label="Porcentaje"')}<span class="small text-nowrap">% menos</span>`)).join('')}
      <button type="button" class="btn btn-sm btn-link px-0" data-afila="planes"><i class="bi bi-plus-lg me-1"></i>Plan de cuotas</button>`;
    const P = (k, l, ph = '') => `<div class="col-sm-6"><label class="form-label small mb-1">${l}</label><input class="form-control form-control-sm" data-p="${k}" value="${esc(st.pago[k] || '')}" placeholder="${ph}"></div>`;
    view.innerHTML = `<div class="d-flex align-items-center gap-2 mb-3"><button type="button" class="btn btn-light btn-sm rounded-circle" data-volver aria-label="Volver"><i class="bi bi-arrow-left"></i></button>
        <h2 class="h5 mb-0">${x ? 'Editar' : 'Nuevo'} ${cuota ? 'cuota' : 'bono'}</h2><button type="button" class="btn btn-primary ms-auto" data-guardar><i class="bi bi-check-lg me-1"></i>Guardar</button></div>
      <div class="row g-3"><div class="col-lg-7"><div class="dw-card">
        <div class="row g-2"><div class="col-12"><label class="form-label small mb-1" for="cb_n">Nombre</label><input class="form-control" id="cb_n" data-s="nombre" value="${esc(st.nombre)}" placeholder="${cuota ? 'Cuota distrital' : 'Rifa conferencia distrital'}"></div>
          ${cuota ? `<div class="col-sm-6"><label class="form-label small mb-1" for="cb_t">Tipo</label><select class="form-select" id="cb_t" data-s="tipo"><option value="por_socio" ${st.tipo === 'por_socio' ? 'selected' : ''}>Por socio activo</option><option value="por_club" ${st.tipo === 'por_club' ? 'selected' : ''}>Fija por club</option></select></div>
            <div class="col-sm-6"><label class="form-label small mb-1" for="cb_v">Valor ${st.tipo === 'por_club' ? 'por club' : 'por socio'}</label><input class="form-control" id="cb_v" type="number" min="0" step="1000" data-s="valor_socio" value="${esc(st.valor_socio)}"></div>`
          : `<div class="col-sm-6"><label class="form-label small mb-1" for="cb_r">Cómo se reparten</label><select class="form-select" id="cb_r" data-s="reparto"><option value="por_club" ${st.reparto === 'por_club' ? 'selected' : ''}>Los mismos a cada club</option><option value="por_socio" ${st.reparto === 'por_socio' ? 'selected' : ''}>Por cada socio del club</option><option value="manual" ${st.reparto === 'manual' ? 'selected' : ''}>Los asigno a mano</option></select></div>
            <div class="col-sm-3"><label class="form-label small mb-1" for="cb_c">Bonos ${st.reparto === 'por_socio' ? 'por socio' : 'por club'}</label><input class="form-control" id="cb_c" type="number" min="0" data-s="cantidad" value="${esc(st.cantidad)}" ${st.reparto === 'manual' ? 'disabled' : ''}></div>
            <div class="col-sm-3"><label class="form-label small mb-1" for="cb_v">Valor de cada bono</label><input class="form-control" id="cb_v" type="number" min="0" step="500" data-s="valor" value="${esc(st.valor)}"></div>`}
          <div class="col-sm-6"><label class="form-label small mb-1" for="cb_f">${cuota ? 'Vence' : 'Fecha límite'}</label><input class="form-control" id="cb_f" type="date" data-s="vence" value="${esc(st.vence)}"></div>
          <div class="col-12"><label class="form-label small mb-1" for="cb_o">Notas para los clubes</label><textarea class="form-control" id="cb_o" rows="2" data-s="notas">${esc(st.notas)}</textarea></div></div>
        ${cuota ? descHtml() : ''}
        <div class="ro-h">Datos de pago</div><div class="small text-body-secondary mb-2">Los ve cada club junto al cobro, con botón de copiar.${!x && previo ? ' Se copiaron los del último cobro: cámbialos si este va a otra cuenta o llave.' : ''}</div>
        <div class="row g-2">${P('llave', 'Llave Bre-B', '@llave, celular o correo')}${P('titular', 'Titular', 'Distrito 4271')}${P('banco', 'Banco')}${P('tipo_cuenta', 'Tipo de cuenta', 'Ahorros / Corriente')}${P('numero', 'Número de cuenta')}${P('documento', 'NIT o documento')}
          <div class="col-12"><label class="form-label small mb-1">Instrucciones</label><textarea class="form-control form-control-sm" rows="2" data-p="instrucciones" placeholder="p. ej. Envía el comprobante al tesorero distrital">${esc(st.pago.instrucciones || '')}</textarea></div>
          <div class="col-12 d-flex gap-2 align-items-center"><button type="button" class="btn btn-outline-primary btn-sm" data-qr><i class="bi bi-qr-code me-1"></i>${st.pago.qr_key ? 'Cambiar QR' : 'Subir QR'}</button>${st.pago.qr_key ? '<button type="button" class="btn btn-light btn-sm" data-qrq>Quitar QR</button>' : ''}<span class="small text-body-secondary">Imagen del QR de tu banco o Bre-B</span></div></div>
        <div class="small text-danger mt-2" data-err></div></div></div>
        <div class="col-lg-5"><div style="position:sticky;top:76px"><div class="small text-body-secondary mb-1"><i class="bi bi-eye me-1"></i>Así le llega a un club${cuota && st.tipo === 'por_socio' ? ` de ${ejemplo} socios` : ''}</div><div class="dw-card" data-prev></div></div></div></div>`;
    const prev = view.querySelector('[data-prev]');
    const pintarPrev = () => {
      const pago = { ...st.pago, qr: st.pago.qr_ver || null };
      const tienePago = ['llave', 'numero', 'banco', 'titular', 'instrucciones', 'qr_key'].some((k) => st.pago[k]);
      if (cuota) {
        const base = (Number(st.valor_socio) || 0) * (st.tipo === 'por_socio' ? ejemplo : 1), rd = (n) => Math.round(n / 100) * 100;
        prev.innerHTML = `<div class="d-flex align-items-center gap-2"><i class="bi bi-bank fs-4" style="color:var(--dw-p)"></i><b class="flex-grow-1">${esc(st.nombre || 'Cuota')}</b>${st.vence ? `<span class="small text-body-secondary">vence ${C.day(st.vence)}</span>` : ''}</div>
          <div class="ro-cobro__v mt-1">${C.money(base)}</div><div class="small text-body-secondary mb-2">${st.tipo === 'por_socio' ? `${C.money(Number(st.valor_socio) || 0)} × ${ejemplo} socios` : 'valor fijo por club'}</div>
          ${st.pronto.filter((y) => y.hasta && y.pct).map((y) => `<div class="ro-oferta"><i class="bi bi-lightning-charge-fill"></i><span>Paga <b>${C.money(rd(base * (1 - y.pct / 100)))}</b> antes del ${C.day(y.hasta)} y ahorra ${C.money(base - rd(base * (1 - y.pct / 100)))}</span></div>`).join('')}
          ${st.planes.filter((y) => y.cuotas >= 2).map((y) => `<div class="ro-oferta ro-oferta--b"><i class="bi bi-calendar3"></i><span>O en <b>${y.cuotas} cuotas de ${C.money(rd(rd(base * (1 - (y.pct || 0) / 100)) / y.cuotas))}</b>${y.pct ? ` (${y.pct}% menos)` : ''}</span></div>`).join('')}
          <div class="mt-2">${tienePago ? RO.fichaPago(pago, { compacta: true }) : '<div class="small text-body-secondary">Sin datos de pago.</div>'}</div>`;
      } else {
        const n = st.reparto === 'por_socio' ? (Number(st.cantidad) || 0) * ejemplo : st.reparto === 'por_club' ? Number(st.cantidad) || 0 : 0, v = Number(st.valor) || 0;
        prev.innerHTML = `<div class="d-flex align-items-center gap-2"><i class="bi bi-ticket-perforated fs-4" style="color:var(--dw-p)"></i><b class="flex-grow-1">${esc(st.nombre || 'Bono')}</b>${st.vence ? `<span class="small text-body-secondary">hasta ${C.day(st.vence)}</span>` : ''}</div>
          ${st.reparto === 'manual' ? '<div class="small text-body-secondary mt-2">Asignas a cada club cuántos le tocan, en la lista de Bonos.</div>'
            : `<div class="ro-bonos mt-2"><span><b>${C.num(n)}</b>bonos${st.reparto === 'por_socio' ? ` (${st.cantidad} × ${ejemplo} socios)` : ''}</span><span>×</span><span><b>${C.money(v)}</b>cada uno</span><span>=</span><span class="t"><b>${C.money(n * v)}</b>total</span></div>`}
          <div class="mt-2">${tienePago ? RO.fichaPago(pago, { compacta: true }) : '<div class="small text-body-secondary">Sin datos de pago.</div>'}</div>`;
      }
    };
    pintarPrev();
    view.oninput = (ev) => {
      const s = ev.target.dataset.s, p = ev.target.dataset.p, cc = ev.target.dataset.c;
      if (s) st[s] = ev.target.value;
      else if (p) st.pago[p] = ev.target.value;
      else if (cc) { const f = ev.target.closest('[data-fila]'); st[f.dataset.fila][+f.dataset.i][cc] = ev.target.type === 'number' ? Number(ev.target.value) : ev.target.value; }
      pintarPrev();
    };
    view.onchange = (ev) => { if (['tipo', 'reparto'].includes(ev.target.dataset.s)) { st[ev.target.dataset.s] = ev.target.value; rehacer(); } };
    const rehacer = () => editarCobro(kind, x, st);
    view.onclick = async (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.volver != null) return salir();
      if (b.dataset.afila) { st[b.dataset.afila].push(b.dataset.afila === 'pronto' ? { hasta: '', pct: 10 } : { cuotas: 3, pct: 0 }); return rehacer(); }
      if (b.dataset.qfila) { st[b.dataset.qfila].splice(+b.dataset.i, 1); return rehacer(); }
      if (b.dataset.qrq != null) { st.pago.qr_key = ''; st.pago.qr_ver = ''; return rehacer(); }
      if (b.dataset.qr != null) {
        const f = await RO.elegirArchivo('image/png,image/jpeg,image/webp'); if (!f) return;
        try { st.pago.qr_key = (await RO.subir('/api/distrito/cobros/qr', f)).key; st.pago.qr_ver = URL.createObjectURL(f); toast('QR listo: guarda para que lo vean los clubes'); rehacer(); } catch (er) { toast(er.message, false); }
        return;
      }
      if (b.dataset.guardar != null) {
        const { qr_ver, ...pago } = st.pago;
        const body = cuota ? { nombre: st.nombre, tipo: st.tipo, valor_socio: Number(st.valor_socio) || 0, vence: st.vence, notas: st.notas, descuentos: { pronto: st.pronto, planes: st.planes }, pago }
          : { nombre: st.nombre, valor: Number(st.valor) || 0, vence: st.vence || null, notas: st.notas, reparto: st.reparto, cantidad: Number(st.cantidad) || 0, pago };
        b.disabled = true;
        try {
          await api(cuota ? (x ? `/api/distrito/cuotas/${x.id}` : '/api/distrito/cuotas') : (x ? `/api/distrito/bonos/${x.id}` : '/api/distrito/bonos'), { method: x ? 'PATCH' : 'POST', body });
          toast(cuota ? 'Cuota guardada: ya la ven los clubes en su Caja menor' : 'Bono guardado: ya lo ven los clubes'); cobrosCache.cuotas = []; cobrosCache.bonos = [];
          if (cuota) await cargar(); else salir();
        } catch (er) { view.querySelector('[data-err]').textContent = er.message; toast(er.message, false); b.disabled = false; }
      }
    };
  }
  async function pintarBonos() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    bonos = (await api('/api/distrito/bonos')).rows;
    cobrosCache.bonos = bonos;
    const REP = (b) => (b.reparto === 'por_socio' ? `${b.cantidad} por socio` : b.reparto === 'por_club' ? `${b.cantidad} por club` : 'asignados a mano');
    view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-k></div>
      <p class="small text-body-secondary">Bonos o boletas del distrito (rifas, eventos, campañas): <b>los mismos a cada club</b>, <b>por cada socio</b> o asignados a mano, a un valor por bono. Cada club los ve en su <b>Caja menor → Obligaciones</b> con tus datos de pago y los paga desde ahí (lo que pague se suma solo).</p>
      ${bonos.length ? bonos.map((b) => `<div class="dw-card mb-3 ro-cobro"><div class="d-flex align-items-start gap-3 flex-wrap"><span class="ro-cobro__i"><i class="bi bi-ticket-perforated"></i></span>
          <div class="flex-grow-1 min-w-0"><b class="fs-6">${esc(b.nombre)}</b><div class="small text-body-secondary">${C.money(b.valor)} cada uno · ${esc(REP(b))}${b.vence ? ` · hasta ${C.day(b.vence)}` : ''}${b.notas ? ` · ${esc(b.notas)}` : ''}</div>
            <div class="ro-bonos mt-2"><span><b>${C.num(b.asignados)}</b>bonos</span><span>×</span><span><b>${C.money(b.valor)}</b>cada uno</span><span>=</span><span class="t"><b>${C.money(b.total)}</b>total</span></div></div>
          <div class="text-end"><div class="ro-cobro__v">${C.money(b.pagado)}</div><div class="small text-body-secondary">de ${C.money(b.total)}</div><div class="small">${C.num(b.vendidos)}/${C.num(b.asignados)} vendidos</div></div>
          ${M ? `<div class="d-flex gap-1"><button class="btn btn-sm btn-light" data-bed="${b.id}" aria-label="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light" data-bdel="${b.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button></div>` : ''}</div>
        <div class="mt-2">${C.meter(b.pagado, b.total)}</div>
        <div class="row g-3 mt-1"><div class="col-xl-8"><div class="table-responsive"><table class="table table-sm align-middle mb-0 ro-tcobro"><thead><tr><th>Club</th><th class="text-end">Bonos</th><th class="text-end">Vendidos</th><th class="text-end">Total</th><th class="text-end">Pagado</th><th></th></tr></thead>
          <tbody>${b.clubes.map((x) => `<tr><td class="fw-semibold">${esc(x.club)}</td><td class="text-end">${C.num(x.asignados)}${b.reparto === 'por_socio' ? `<div class="small text-body-secondary">${x.socios} socios</div>` : ''}</td><td class="text-end">${C.num(x.vendidos)}</td><td class="text-end">${C.money(x.total)}</td>
            <td class="text-end">${C.money(x.pagado)}${x.total ? `<div style="min-width:70px">${C.meter(x.pagado, x.total)}</div>` : ''}</td><td class="text-end">${M ? `<button class="btn btn-sm btn-light" data-basig="${b.id}" data-bclub="${esc(x.club_id)}" aria-label="Registrar"><i class="bi bi-pencil"></i></button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
          <div class="col-xl-4">${b.pago ? RO.fichaPago(b.pago, { compacta: true }) : '<div class="ro-pago small text-body-secondary"><i class="bi bi-exclamation-circle me-1"></i>Sin datos de pago.</div>'}</div></div></div>`).join('')
      : `<div class="dw-card">${window.App.empty('bi-ticket-perforated', 'Aún no hay bonos del distrito.')}</div>`}`;
    if (bonos.length) kpiCobros(view.querySelector('[data-k]'), bonos.map((b) => ({ ...b, clubes: b.clubes.map((x) => ({ ...x, estado: x.saldo > 0 && b.vence && b.vence < C.todayCo() ? 'vencida' : '' })) })), 'Bonos');
    view.querySelectorAll('[data-bed]').forEach((x) => (x.onclick = () => editarBono(bonos.find((b) => String(b.id) === x.dataset.bed))));
    view.querySelectorAll('[data-bdel]').forEach((x) => (x.onclick = async () => {
      if (!(await window.App.confirm({ title: '¿Borrar este bono?', text: 'Deja de aparecer en los clubes.', ok: 'Borrar' }))) return;
      try { await api(`/api/distrito/bonos/${x.dataset.bdel}`, { method: 'DELETE' }); toast('Borrado'); pintarBonos(); } catch (e) { toast(e.message, false); }
    }));
    view.querySelectorAll('[data-basig]').forEach((x) => (x.onclick = async (e) => {
      e.stopPropagation();
      const b = bonos.find((y) => String(y.id) === x.dataset.basig), k = b.clubes.find((y) => y.club_id === x.dataset.bclub);
      const out = await C.form({ title: `${b.nombre} · ${k.club}`, fields: [...(b.reparto === 'manual' ? [{ k: 'asignados', label: 'Asignados', type: 'int' }] : []), { k: 'vendidos', label: 'Vendidos', type: 'int' },
        { k: 'pagado', label: 'Pagado al distrito (fuera de la app)', type: 'money', hint: k.pagado_caja ? `Aparte, el club ya registró ${C.money(k.pagado_caja)} desde su caja.` : 'Lo que el club pague desde su Caja menor se suma solo.' }],
      values: { ...k, pagado: k.pagado_distrito }, okText: 'Guardar' });
      if (!out) return;
      try { await api(`/api/distrito/bonos/${b.id}/clubes/${encodeURIComponent(k.club_id)}`, { method: 'PUT', body: { asignados: k.asignados, ...out } }); toast('Guardado'); pintarBonos(); } catch (er) { toast(er.message, false); }
    }));
  }
  const editarBono = (b) => editarCobro('bono', b);
  async function detalle(id) {
    const { el } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    let d; try { d = await api(`/api/distrito/clubes/${encodeURIComponent(id)}`); } catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const junta = d.socios.filter((s) => s.cargo && !/^soci[oa]$/i.test(s.cargo)), otros = d.socios.filter((s) => !junta.includes(s));
    const hoy = C.todayCo();
    el.querySelector('.modal-content').innerHTML = `<div class="modal-header"><h2 class="modal-title h5">${esc(d.club.nombre)}</h2><span class="badge text-bg-light ms-2">Solo lectura</span>${M ? '<button type="button" class="btn btn-sm btn-outline-danger ms-auto me-2" data-quitar><i class="bi bi-box-arrow-right me-1"></i>Quitar del distrito</button>' : ''}<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">
        <div class="d-flex gap-3 flex-wrap small mb-2"><span>Caja menor <b>${C.money(d.saldos.menor)}</b></span><span>Caja mayor <b>${C.money(d.saldos.mayor)}</b></span><span><b>${d.socios.length}</b> socios</span></div>
        <div class="ro-h">Junta</div>${junta.length ? junta.map((s) => `<div class="small py-1 border-bottom"><b>${esc(s.nombre)}</b> · <span style="color:var(--dw-p)">${esc(s.cargo)}</span>${s.activado_at ? ' <i class="bi bi-patch-check-fill text-success" title="Activado"></i>' : ''}</div>`).join('') : '<p class="small text-body-secondary">Sin junta registrada.</p>'}
        <div class="ro-h">Socios</div><div class="small">${otros.map((s) => `${esc(s.nombre)}${s.estado === 'aspirante' ? ' (aspirante)' : ''}${s.activado_at ? ' ✓' : ''}`).join(' · ') || '—'}</div>
        <div class="ro-h">Proyectos</div>${d.proyectos.length ? d.proyectos.map((p) => `<div class="small py-1 border-bottom"><b>${esc(p.nombre)}</b> · ${esc(p.estado.replace('_', ' '))} · ${C.num(p.beneficiados || 0)} beneficiados${p.financiador ? ` · ${esc(p.financiador)}` : ''}</div>`).join('') : '<p class="small text-body-secondary">Sin proyectos.</p>'}
        <div class="ro-h">Reuniones y eventos (últimos 60 días y próximos)</div>${d.reuniones.length ? d.reuniones.map((r) => `<div class="small py-1 border-bottom ${r.fecha < hoy ? 'text-body-secondary' : ''}">${C.day(r.fecha)} · <b>${esc(r.titulo)}</b> · ${r.tipo === 'evento' ? 'Evento' : 'Reunión'}${r.estado === 'cancelada' ? ' (cancelada)' : ''}</div>`).join('') : '<p class="small text-body-secondary">Sin reuniones.</p>'}
        <div class="ro-h">Cuota distrital</div>${d.obligaciones.length ? d.obligaciones.map((o) => `<div class="small py-1 border-bottom d-flex gap-2"><span class="flex-grow-1">${esc(o.nombre)} · ${C.money(o.pagado)} de ${C.money(o.total)}</span>${C.chip(...EST[o.estado])}</div>`).join('') : '<p class="small text-body-secondary">Sin cuotas.</p>'}
      </div>`;
    el.querySelector('[data-quitar]')?.addEventListener('click', async () => {
      if (!(await window.App.confirm({ title: `¿Quitar a ${d.club.nombre} del distrito?`, text: 'Deja de aparecer aquí y no recibe las cuotas ni los bonos del distrito. Sus datos no se borran; el club vuelve a unirse escribiendo el código del distrito en sus Datos del club. Borrar el club del todo se hace desde Diwilo.', ok: 'Quitar' }))) return;
      try { await api(`/api/distrito/clubes/${encodeURIComponent(id)}/quitar`, { method: 'POST' }); window.bootstrap?.Modal.getInstance(el)?.hide(); toast('Club quitado del distrito'); await cargar(); } catch (x) { toast(x.message, false); }
    });
  }

  // Orden del día de las reuniones ordinarias: el distrito lo ajusta y sus clubes lo usan en el acta de cada reunión
  async function pintarOrden() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    const d = await api('/api/distrito/orden'); let items = d.items.map((i) => ({ ...i }));
    const dibujar = () => {
      view.innerHTML = `<p class="small text-body-secondary">${d.origen === 'distrito' ? 'Este es el orden del día que usan los clubes del distrito en sus actas.' : 'Los clubes usan el orden del día sugerido. Si lo cambias aquí, todos los clubes del distrito usarán el tuyo.'}</p>
        <div class="dw-card"><ol class="ps-3 mb-2" data-ol>${items.map((i, n) => `<li class="mb-2"><div class="d-flex gap-2 align-items-start"><div class="flex-grow-1"><input class="form-control form-control-sm fw-semibold" data-t="${n}" value="${esc(i.titulo)}" ${M ? '' : 'disabled'}>
            <input class="form-control form-control-sm mt-1" data-d="${n}" value="${esc(i.detalle || '')}" placeholder="Detalle (opcional)" ${M ? '' : 'disabled'}></div>
            ${M ? `<div class="btn-group-vertical btn-group-sm"><button class="btn btn-light" data-up="${n}" aria-label="Subir"><i class="bi bi-arrow-up"></i></button><button class="btn btn-light" data-dn="${n}" aria-label="Bajar"><i class="bi bi-arrow-down"></i></button></div><button class="btn btn-sm btn-light" data-rm="${n}" aria-label="Quitar"><i class="bi bi-trash"></i></button>` : ''}</div></li>`).join('')}</ol>
          ${M ? '<div class="d-flex gap-2 flex-wrap"><button class="btn btn-sm btn-outline-primary" data-add><i class="bi bi-plus-lg me-1"></i>Agregar punto</button><button class="btn btn-sm btn-light" data-sug>Volver al sugerido</button><span class="flex-grow-1"></span><button class="btn btn-sm btn-primary" data-save><i class="bi bi-check2 me-1"></i>Guardar orden del día</button></div>' : ''}</div>`;
    };
    const leer = () => { items = items.map((i, n) => ({ titulo: view.querySelector(`[data-t="${n}"]`)?.value || i.titulo, detalle: view.querySelector(`[data-d="${n}"]`)?.value || '' })); };
    dibujar();
    view.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b || !M) return; leer();
      const n = Number(b.dataset.up ?? b.dataset.dn ?? b.dataset.rm);
      if (b.dataset.up !== undefined && n > 0) [items[n - 1], items[n]] = [items[n], items[n - 1]];
      else if (b.dataset.dn !== undefined && n < items.length - 1) [items[n + 1], items[n]] = [items[n], items[n + 1]];
      else if (b.dataset.rm !== undefined) items.splice(n, 1);
      else if (b.dataset.add !== undefined) items.push({ titulo: 'Nuevo punto', detalle: '' });
      else if (b.dataset.sug !== undefined) items = d.sugerido.map((i) => ({ ...i }));
      else if (b.dataset.save !== undefined) { try { const r = await api('/api/distrito/orden', { method: 'PUT', body: { items } }); items = r.items; d.origen = 'distrito'; toast('Orden del día guardado: ya lo usan los clubes'); } catch (x) { toast(x.message, false); } }
      dibujar();
    };
  }

  /* ---------- Juegos: retos, ranking entre clubes y contenido del distrito ---------- */
  let rkReto = '';
  async function pintarJuegos() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    const [rt, rk] = await Promise.all([api('/api/distrito/juegos/retos'), api(`/api/distrito/juegos/ranking${rkReto ? `?reto=${rkReto}` : ''}`)]);
    const J = Object.fromEntries(rt.juegos.map((j) => [j.id, j])), hoy = C.todayCo();
    const estado = (r) => (!r.activo ? ['free', 'Desactivado'] : r.desde > hoy ? ['soon', 'Próximo'] : r.hasta < hoy ? ['free', 'Terminado'] : ['ok', 'Abierto']);
    acciones.innerHTML = M ? '<button class="btn btn-primary" data-rnuevo><i class="bi bi-plus-lg me-1"></i>Nuevo reto</button>' : '';
    acciones.querySelector('[data-rnuevo]')?.addEventListener('click', () => editarReto(null, rt.juegos));
    const CONT = [['trivia', 'Preguntas de Trivia'], ['impostor', 'Palabras del Impostor'], ['probable', 'Frases de ¿Quién es más probable?'], ['bingo', 'Casillas del Bingo rotario']];
    view.innerHTML = `<div class="row g-3">
      <div class="col-lg-7"><div class="dw-card h-100"><div class="d-flex align-items-center gap-2 mb-2"><span class="ro-h m-0 flex-grow-1"><i class="bi bi-trophy me-1"></i>Ranking entre clubes · ${esc(rk.nombre)}</span>
          <select class="form-select form-select-sm" style="max-width:220px" data-rkreto aria-label="Reto"><option value="">Todos los retos del año</option>${rt.rows.map((r) => `<option value="${r.id}" ${String(r.id) === String(rkReto) ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select></div>
        ${rk.rows.length ? window.App.table([{ label: '#', html: (x) => ['🥇', '🥈', '🥉'][x.puesto - 1] || x.puesto }, { label: 'Club', main: true, html: (x) => esc(x.club) }, { label: 'Puntos', cls: 'text-end', html: (x) => `<b>${x.puntos}</b>` },
            { label: 'Partidas', cls: 'text-end', html: (x) => x.partidas }, { label: 'Socios', cls: 'text-end', html: (x) => x.socios }, { label: 'Promedio', cls: 'text-end', html: (x) => x.promedio }], rk.rows)
          : window.App.empty('bi-trophy', 'Aún ningún club ha terminado una partida de un reto. Crea un reto y los clubes lo verán en Juegos.')}
        ${rk.jugadores?.length ? `<div class="ro-h">Mejores jugadores del reto</div>${rk.jugadores.map((j) => `<div class="d-flex gap-2 align-items-center py-1 border-bottom small"><b style="width:22px">${['🥇', '🥈', '🥉'][j.puesto - 1] || j.puesto}</b><span class="flex-grow-1">${esc(j.nombre)} <span class="text-body-secondary">· ${esc(j.club)}</span></span><b>${j.puntos} pts</b></div>`).join('')}` : ''}
        <div class="small text-body-secondary mt-2">Suman las partidas terminadas «del reto» en cada club. Promedio = puntos por socio que jugó (para comparar clubes grandes y pequeños).</div></div></div>
      <div class="col-lg-5"><div class="dw-card h-100"><div class="ro-h mt-0">Preguntas y palabras del distrito</div><p class="small text-body-secondary">Lo que añadas aquí llega a todos los clubes del distrito y es lo que se usa en los retos (junto con el banco de la app). Cada presidencia puede apagarlo en su club, pero no en los retos.</p>
        <div class="d-grid gap-2">${CONT.map(([k, l]) => `<button class="btn btn-outline-primary text-start" data-cont="${k}">${J[k]?.emoji || '🎮'} ${l}</button>`).join('')}</div></div></div>
      <div class="col-12"><div class="dw-card"><div class="ro-h mt-0">Retos del distrito</div>
        ${rt.rows.length ? window.App.table([{ label: 'Reto', main: true, html: (r) => `${J[r.juego]?.emoji || ''} <b>${esc(r.nombre)}</b><div class="small text-body-secondary fw-normal">${esc(J[r.juego]?.nombre || r.juego)} · gana ${r.gana === 'promedio' ? 'el mejor promedio por socio' : 'el club con más puntos'}${r.premio ? ` · 🏆 ${esc(r.premio)}` : ''}${r.descripcion ? ` · ${esc(r.descripcion)}` : ''}</div>` },
            { label: 'Fechas', html: (r) => `${C.day(r.desde)} → ${C.day(r.hasta)}` }, { label: 'Estado', html: (r) => C.chip(...estado(r)) }, { label: 'Partidas', cls: 'text-end', html: (r) => r.partidas },
            { label: '', cls: 'text-end text-nowrap', html: (r) => (M ? `<button class="btn btn-sm btn-light" data-reditar="${r.id}" aria-label="Editar"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-light" data-ronoff="${r.id}">${r.activo ? 'Desactivar' : 'Activar'}</button>${r.partidas ? '' : ` <button class="btn btn-sm btn-light" data-rborrar="${r.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>`}` : '') }], rt.rows)
          : window.App.empty('bi-calendar-event', 'Aún no hay retos. Un reto es un juego en unas fechas: los clubes lo juegan y suman puntos al ranking.')}</div></div></div>`;
    view.onclick = async (e) => {
      const c = e.target.closest('[data-cont]'); if (c) { acciones.innerHTML = ''; view.onclick = null; window.scrollTo({ top: 0 }); return window.RoContenido.montar(view, { base: '/api/distrito/juegos/contenido', juego: c.dataset.cont, titulo: `Distrito ${me.distrito.codigo}`, volver: pintarJuegos }); }
      const ed = e.target.closest('[data-reditar]'); if (ed) return editarReto(rt.rows.find((r) => String(r.id) === ed.dataset.reditar), rt.juegos);
      const on = e.target.closest('[data-ronoff]'); if (on) { const r = rt.rows.find((x) => String(x.id) === on.dataset.ronoff); try { await api(`/api/distrito/juegos/retos/${r.id}`, { method: 'PATCH', body: { activo: !r.activo } }); pintarJuegos(); } catch (x) { toast(x.message, false); } return; }
      const bo = e.target.closest('[data-rborrar]'); if (bo) { if (!(await window.App.confirm({ title: '¿Borrar este reto?', text: 'Se borra para siempre.', ok: 'Borrar' }))) return; try { await api(`/api/distrito/juegos/retos/${bo.dataset.rborrar}`, { method: 'DELETE' }); pintarJuegos(); } catch (x) { toast(x.message, false); } }
    };
    view.querySelector('[data-rkreto]').onchange = (e) => { rkReto = e.target.value; pintarJuegos(); };
  }
  async function editarReto(r, juegos) {
    const out = await C.form({ title: r ? 'Editar reto' : 'Nuevo reto del distrito', fields: [{ k: 'nombre', label: 'Nombre del reto', type: 'text', required: true, full: true, placeholder: 'Trivia distrital de diciembre' },
      { k: 'juego', label: 'Juego', type: 'select', options: juegos.map((j) => [j.id, `${j.emoji} ${j.nombre}`]), required: true }, { k: 'desde', label: 'Desde', type: 'date', required: true }, { k: 'hasta', label: 'Hasta', type: 'date', required: true },
      { k: 'gana', label: 'Gana el club con', type: 'select', options: [['puntos', 'Más puntos en total'], ['promedio', 'Mejor promedio por socio (justo con clubes pequeños)']] },
      { k: 'premio', label: 'Premio', type: 'text', placeholder: 'p. ej. Reconocimiento en la conferencia distrital' },
      { k: 'descripcion', label: 'Indicaciones para los clubes', type: 'long' }], values: r || { juego: 'trivia', desde: C.todayCo(), gana: 'puntos' }, okText: r ? 'Guardar' : 'Crear reto' });
    if (!out) return;
    try { await api(r ? `/api/distrito/juegos/retos/${r.id}` : '/api/distrito/juegos/retos', { method: r ? 'PATCH' : 'POST', body: out }); toast(r ? 'Reto guardado' : 'Reto creado: ya lo ven los clubes en Juegos'); pintarJuegos(); } catch (x) { toast(x.message, false); }
  }

  /* ---------- Cargos de la junta: el distrito los define y cada presidencia los asigna a sus socios ---------- */
  async function pintarCargos() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    const d = await api('/api/distrito/cargos');
    let items = [...d.items];
    const dibujar = () => {
      view.innerHTML = `<p class="small text-body-secondary">${d.origen === 'distrito' ? 'Estos son los cargos de junta que usan los clubes del distrito.' : 'Los clubes usan la lista sugerida. Cámbiala y guarda para que usen la del distrito.'} La presidencia de cada club solo puede asignar cargos de esta lista; quien tenga cargo queda en la junta del club.</p>
        <div class="dw-card">${items.map((x, n) => `<div class="d-flex align-items-center gap-2 py-1 border-bottom"><span class="text-body-secondary small" style="width:22px">${n + 1}</span>
          ${M ? `<input class="form-control form-control-sm" value="${esc(x)}" data-c="${n}">` : `<span class="flex-grow-1">${esc(x)}</span>`}
          ${M ? `<div class="btn-group btn-group-sm"><button class="btn btn-light" data-up="${n}" aria-label="Subir"><i class="bi bi-arrow-up"></i></button><button class="btn btn-light" data-down="${n}" aria-label="Bajar"><i class="bi bi-arrow-down"></i></button><button class="btn btn-light" data-x="${n}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>` : ''}</div>`).join('')}
        ${M ? `<div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-light" data-add><i class="bi bi-plus-lg me-1"></i>Agregar cargo</button><button class="btn btn-light" data-sug>Usar la sugerida</button><button class="btn btn-primary ms-auto" data-save>Guardar</button></div>` : ''}</div>`;
    };
    dibujar();
    view.oninput = (e) => { const i = e.target.dataset?.c; if (i !== undefined) items[+i] = e.target.value; };
    view.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.up) { const n = +b.dataset.up; if (n > 0) [items[n - 1], items[n]] = [items[n], items[n - 1]]; }
      else if (b.dataset.down) { const n = +b.dataset.down; if (n < items.length - 1) [items[n + 1], items[n]] = [items[n], items[n + 1]]; }
      else if (b.dataset.x) items.splice(+b.dataset.x, 1);
      else if (b.dataset.add !== undefined) items.push('');
      else if (b.dataset.sug !== undefined) items = [...d.sugerido];
      else if (b.dataset.save !== undefined) { try { const r = await api('/api/distrito/cargos', { method: 'PUT', body: { items: items.map((x) => x.trim()).filter(Boolean) } }); items = r.items; d.origen = r.origen; toast('Cargos guardados: ya los ven los clubes'); } catch (x) { toast(x.message, false); } }
      dibujar();
    };
  }

  /* ---------- Metas del año rotario (avance con lo que registran los clubes) ---------- */
  const IND = [['clubes', 'Clubes', 'bi-diagram-3', C.num], ['socios', 'Socios activos', 'bi-people-fill', C.num], ['activados', 'Socios activados', 'bi-patch-check', C.num],
    ['proyectos', 'Proyectos en curso', 'bi-globe-americas', C.num], ['beneficiados', 'Beneficiados', 'bi-heart', C.num], ['horas', 'Horas de servicio', 'bi-clock', C.num],
    ['asistencia', 'Asistencia promedio (%)', 'bi-person-check', (v) => `${v}%`], ['distrital', 'Cuota distrital recaudada', 'bi-bank', C.money]];
  const actual = (k) => ({ clubes: t.totales.clubes, socios: t.totales.socios, activados: t.totales.activados, proyectos: t.totales.proyectos, beneficiados: t.totales.beneficiados,
    horas: t.totales.horas, asistencia: t.totales.asistencia || 0, distrital: t.totales.distrital_pagado })[k];
  let metas = {};
  async function pintarMetas() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    metas = (await api(`/api/distrito/metas?anio=${t.anio}`)).metas;
    const con = IND.filter(([k]) => metas[k]);
    view.innerHTML = `<div class="dw-card mb-3 d-flex align-items-center gap-2 flex-wrap"><b>Metas ${esc(t.nombre_anio)}</b><span class="small text-body-secondary">el avance sale solo de lo que registran los clubes</span>${selAnio()}</div>
      ${con.length ? `<div class="ro-dclubs">${con.map(([k, l, ic, f]) => { const v = actual(k), m = metas[k], p = Math.min(100, Math.round((v / m) * 100)), [col] = semaforo(p);
        return `<div class="ro-dclub"><div class="d-flex align-items-center gap-2"><i class="bi ${ic} fs-4" style="color:var(--dw-p)"></i><b class="flex-grow-1">${esc(l)}</b><b style="color:${col}">${p}%</b></div>
          <div class="mt-2"><span class="fs-4 fw-semibold">${f(v)}</span> <span class="text-body-secondary">de ${f(m)}</span></div>${C.meter(v, m)}</div>`; }).join('')}</div>`
        : window.App.empty('bi-bullseye', `Aún no hay metas para ${esc(t.nombre_anio)}.${M ? ' Usa «Editar metas».' : ''}`)}`;
  }
  async function editarMetas() {
    const out = await C.form({ title: `Metas del distrito ${t.nombre_anio}`, fields: IND.map(([k, l]) => ({ k, label: l, type: k === 'distrital' ? 'money' : 'int' })), values: metas, okText: 'Guardar' });
    if (!out) return;
    try { await api('/api/distrito/metas', { method: 'PUT', body: { anio: t.anio, metas: out } }); toast('Metas guardadas'); pintarMetas(); } catch (x) { toast(x.message, false); }
  }

  /* ---------- Bonos por club: el distrito asigna, registra lo vendido y lo pagado ---------- */
  let bonos = [];


  /* ---------- Formatos: el distrito los arma, los clubes los llenan y aquí se revisan ---------- */
  const F = window.ROFmt, irH = (h) => history.replaceState(null, '', h ? `#${h}` : location.pathname);
  let fmt = null, filtroEnv = 'enviado';
  async function pintarFormatos() {
    irH('formatos');
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let env;
    try { [fmt, env] = await Promise.all([api('/api/distrito/formatos'), api(`/api/distrito/envios${filtroEnv ? `?estado=${filtroEnv}` : ''}`)]); } catch (x) { view.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; return; }
    F.css();
    const filtros = [['enviado', 'Por revisar'], ['aprobado', 'Aprobados'], ['devuelto', 'Devueltos'], ['rechazado', 'No aprobados'], ['', 'Todos']];
    view.innerHTML = `<div class="ro-h">Lo que presentan los clubes</div>
      <div class="d-flex flex-wrap gap-1 mb-2">${filtros.map(([k, l]) => `<button type="button" class="btn btn-sm rounded-pill ${k === filtroEnv ? 'btn-primary' : 'btn-light'}" data-fenv="${k}">${l}</button>`).join('')}</div>
      ${env.rows.length ? `<div class="dw-card p-0 mb-4">${env.rows.map((x) => `<button type="button" class="d-flex gap-3 align-items-center w-100 text-start border-0 border-bottom bg-transparent p-3 text-reset" data-envio="${x.id}">
          <i class="bi bi-file-earmark-richtext fs-4 text-primary"></i><span class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(x.titulo)}</b>
          <span class="small text-body-secondary">${esc(x.club)} · ${esc(x.formato_nombre || '')}${x.enviado_at ? ` · ${esc(F.fechaLarga(new Date(x.enviado_at).toISOString()))}` : ''}</span></span>${F.chip(x.estado)}</button>`).join('')}</div>`
        : `<div class="dw-card mb-4 small text-body-secondary">${filtroEnv === 'enviado' ? 'No hay nada por revisar.' : 'No hay solicitudes con este estado.'}</div>`}
      <div class="ro-h">Formatos del distrito</div>
      ${fmt.rows.length ? `<div class="row g-2">${fmt.rows.map((f) => `<div class="col-md-6 col-xl-4"><button type="button" class="fmt-card w-100 h-100 text-start text-reset" data-formato="${f.id}"><i class="bi bi-file-earmark-text"></i>
          <span class="flex-grow-1 min-w-0"><b class="d-block">${esc(f.nombre)}</b><span class="small text-body-secondary">${f.secciones.filter((s) => s.tipo !== 'seccion' && s.tipo !== 'nota').length} preguntas · ${f.recibidos} recibidos${f.por_revisar ? ` · <b class="text-warning-emphasis">${f.por_revisar} por revisar</b>` : ''}</span>
          <span class="d-block mt-1">${f.activo ? C.chip('ok', 'Disponible') : C.chip('free', 'Oculto para los clubes')}${f.fecha_limite ? ` <span class="small text-body-secondary">hasta ${esc(F.fechaLarga(f.fecha_limite))}</span>` : ''}</span></span></button></div>`).join('')}</div>`
        : `<div class="dw-card">${window.App.empty('bi-file-earmark-text', 'Crea el formato con el que los clubes presentan sus proyectos. Puedes partir de la plantilla sugerida.')}</div>`}`;
    view.onclick = (e) => {
      const b = e.target.closest('[data-fenv]'); if (b) { filtroEnv = b.dataset.fenv; return pintarFormatos(); }
      const f = e.target.closest('[data-formato]'); if (f) return M ? editarFormato(fmt.rows.find((x) => x.id === Number(f.dataset.formato))) : null;
      const v = e.target.closest('[data-envio]'); if (v) return verEnvio(Number(v.dataset.envio), 'formatos');
    };
  }
  /* ---------- Impacto: todos los proyectos que presentan los clubes, por estado y por clasificación ---------- */
  const IMP_EST = [['', 'Todos'], ['borrador', 'Borradores'], ['enviado', 'En revisión'], ['devuelto', 'Devueltos'], ['rechazado', 'No aprobados'], ['aprobado', 'Aprobados']];
  const imp = { estado: '', club: '', sel: {}, q: '' };
  async function pintarImpacto() {
    irH('impacto');
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let d;
    try { d = await api('/api/distrito/impacto'); } catch (x) { view.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; return; }
    F.css();
    const clubes = [...new Set(d.rows.map((x) => x.club))].sort();
    const pasa = (x, sinEstado) => (sinEstado || !imp.estado || x.estado === imp.estado) && (!imp.club || x.club === imp.club)
      && Object.entries(imp.sel).every(([k, v]) => !v || x.clases[k] === v) && (!imp.q || `${x.titulo} ${x.club}`.toLowerCase().includes(imp.q));
    const pintarLista = () => {
      const base = d.rows.filter((x) => pasa(x, true)), lista = base.filter((x) => pasa(x));
      view.querySelector('[data-iest]').innerHTML = IMP_EST.map(([k, l]) => `<button type="button" class="btn btn-sm rounded-pill ${k === imp.estado ? 'btn-primary' : 'btn-light'}" data-iestado="${k}">${l} <span class="opacity-75">${k ? base.filter((x) => x.estado === k).length : base.length}</span></button>`).join('');
      view.querySelector('[data-ilista]').innerHTML = lista.length ? `<div class="dw-card p-0">${lista.map((x) => `<button type="button" class="d-flex gap-3 align-items-center w-100 text-start border-0 border-bottom bg-transparent p-3 text-reset" data-ienvio="${x.id}">
          <i class="bi ${x.estado === 'borrador' ? 'bi-pencil-square text-body-secondary' : 'bi-file-earmark-richtext text-primary'} fs-4"></i><span class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(x.titulo)}</b>
          <span class="small text-body-secondary">${esc(x.club)} · ${esc(x.formato_nombre || '')} · ${x.estado === 'borrador' ? `lleva ${x.avance}% · editado el ${esc(F.fechaLarga(new Date(x.updated_at).toISOString()))}` : x.enviado_at ? `enviado el ${esc(F.fechaLarga(new Date(x.enviado_at).toISOString()))}` : ''}</span>
          ${Object.keys(x.clases).length ? `<span class="d-flex flex-wrap gap-1 mt-1">${Object.entries(x.clases).map(([k, v]) => `<span class="badge rounded-pill text-bg-light border fw-normal" title="${esc(k)}">${esc(v)}</span>`).join('')}</span>` : ''}
          ${x.estado === 'borrador' ? `<span class="d-block mt-1" style="max-width:260px">${C.meter(x.avance, 100)}</span>` : ''}</span>${F.chip(x.estado)}${x.proyecto_id ? '<i class="bi bi-globe-americas text-success" title="Ya es proyecto del club"></i>' : ''}</button>`).join('')}</div>`
        : `<div class="dw-card small text-body-secondary">${d.rows.length ? 'Ningún proyecto con estos filtros.' : 'Los clubes aún no han empezado a presentar proyectos. Cuando un club abra el formato en Impacto → Al distrito, aparece aquí como borrador.'}</div>`;
      view.querySelector('[data-ireparto]').innerHTML = d.selectores.map((s, i) => `<div class="col-md-6 col-xl-4"><div class="dw-card h-100"><div class="ro-h mt-0">${esc(s.titulo)}</div><div data-irank="${i}"></div></div></div>`).join('');
      d.selectores.forEach((s, i) => { const el = view.querySelector(`[data-irank="${i}"]`), n = s.opciones.map((o) => ({ k: o, n: lista.filter((x) => x.clases[s.titulo] === o).length })).filter((o) => o.n);
        if (n.length) C.rank(el, n.sort((a, b) => b.n - a.n), C.num); else el.innerHTML = '<p class="small text-body-secondary mb-0">Sin proyectos en esta vista.</p>'; });
    };
    view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-ik></div>
      <div class="dw-card mb-3"><div class="d-flex flex-wrap gap-1 mb-2" data-iest></div>
        <div class="row g-2"><div class="col-md-4 col-xl-3"><input class="form-control form-control-sm" type="search" placeholder="Buscar proyecto o club" data-iq value="${esc(imp.q)}" aria-label="Buscar"></div>
          <div class="col-md-4 col-xl-3"><select class="form-select form-select-sm" data-iclub aria-label="Club"><option value="">Todos los clubes</option>${clubes.map((k) => `<option ${k === imp.club ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
          ${d.selectores.map((s) => `<div class="col-md-4 col-xl-3"><select class="form-select form-select-sm" data-isel="${esc(s.titulo)}" aria-label="${esc(s.titulo)}"><option value="">${esc(s.titulo)}: todas</option>${s.opciones.map((o) => `<option ${imp.sel[s.titulo] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`).join('')}</div></div>
      <div class="mb-4" data-ilista></div>
      ${d.selectores.length ? '<div class="ro-h">Para qué son los proyectos</div><div class="row g-3" data-ireparto></div>' : '<div data-ireparto></div>'}
      <div class="small text-body-secondary mt-3"><i class="bi bi-info-circle me-1"></i>Los selectores salen de las preguntas «Elegir una opción» marcadas como <b>Clasifica</b> en Formatos.</div>`;
    const e = d.estados;
    C.kpis(view.querySelector('[data-ik]'), [['En borrador', C.num(e.borrador), 'los clubes los están llenando', 'bi-pencil-square'], ['En revisión', C.num(e.enviado), 'esperan tu revisión', 'bi-hourglass-split'],
      ['Sin aprobar', C.num(e.devuelto + e.rechazado), `${e.devuelto} devueltos · ${e.rechazado} no aprobados`, 'bi-arrow-return-left'], ['Aprobados', C.num(e.aprobado), `${d.rows.filter((x) => x.proyecto_id).length} ya son proyecto`, 'bi-patch-check']]);
    pintarLista();
    view.onclick = (ev) => {
      const b = ev.target.closest('[data-iestado]'); if (b) { imp.estado = b.dataset.iestado; return pintarLista(); }
      const v = ev.target.closest('[data-ienvio]'); if (v) return verEnvio(Number(v.dataset.ienvio), 'impacto');
    };
    view.onchange = (ev) => { if (ev.target.matches('[data-iclub]')) imp.club = ev.target.value; else if (ev.target.dataset.isel) imp.sel[ev.target.dataset.isel] = ev.target.value; else return; pintarLista(); };
    view.oninput = (ev) => { if (!ev.target.matches('[data-iq]')) return; imp.q = ev.target.value.trim().toLowerCase(); pintarLista(); };
  }
  async function editarFormato(f) {
    if (!fmt) fmt = await api('/api/distrito/formatos');
    acciones.innerHTML = ''; view.onclick = null;
    irH(f ? `formato=${f.id}` : 'formato=nuevo');
    const salir = () => { view._fmtOff?.(); view.onclick = null; view.oninput = null; view.onchange = null; tab = 'formatos'; pintar(); };
    await F.constructor(view, f, { plantilla: fmt.plantilla,
      guardar: async (body) => { await api(f ? `/api/distrito/formatos/${f.id}` : '/api/distrito/formatos', { method: f ? 'PATCH' : 'POST', body }); toast('Formato guardado'); salir(); },
      borrar: f ? async () => { await api(`/api/distrito/formatos/${f.id}`, { method: 'DELETE' }); toast('Formato borrado'); salir(); } : null,
      volver: salir });
  }
  let origen = 'formatos';   // a qué pestaña vuelve la solicitud abierta
  async function verEnvio(id, de) {
    if (de) origen = de;
    view.onclick = null; view.oninput = null; view.onchange = null;
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let x, e;
    try { [x, e] = await Promise.all([api(`/api/distrito/envios/${id}`), F.encabezado()]); } catch (err) { view.innerHTML = `<div class="dw-card">${esc(err.message)}</div>`; return; }
    irH(`envio=${id}`);
    acciones.innerHTML = `<button class="btn btn-light" data-volver><i class="bi bi-arrow-left me-1"></i>${origen === 'impacto' ? 'Impacto' : 'Formatos'}</button>`+'<button class="btn btn-light" data-imprimir title="Imprimir o guardar en PDF"><i class="bi bi-printer"></i></button>';
    acciones.onclick = (ev) => { if (ev.target.closest('[data-volver]')) { acciones.onclick = null; tab = origen; return pintar(); } if (ev.target.closest('[data-imprimir]')) F.imprimir(); };
    const revisar = M && (x.estado === 'enviado' || (x.estado === 'aprobado' && !x.proyecto_id));
    view.innerHTML = `<div class="row g-3"><div class="col-xl-8"><div class="fmt-fondo">${F.hoja(e, x, 'ver')}</div></div>
      <div class="col-xl-4"><div class="dw-card" style="position:sticky;top:76px"><div class="d-flex align-items-center gap-2 mb-2"><b>Revisión del distrito</b><span class="ms-auto">${F.chip(x.estado)}</span></div>
        <div class="small text-body-secondary mb-2">${esc(x.club)}${x.enviado_at ? ` · enviado el ${esc(F.fechaLarga(new Date(x.enviado_at).toISOString()))}` : ''}</div>
        ${x.comentario ? `<div class="small p-2 rounded mb-2" style="background:rgba(var(--dw-p-rgb),.07);white-space:pre-wrap"><i class="bi bi-chat-left-quote me-1"></i>${esc(x.comentario)}</div>` : ''}
        ${revisar ? `<label class="form-label small fw-semibold mb-1" for="rv_c">Comentario para el club</label><textarea class="form-control mb-2" id="rv_c" rows="4" placeholder="Obligatorio si lo devuelves o no lo apruebas">${x.estado === 'aprobado' ? esc(x.comentario || '') : ''}</textarea>
          <div class="d-grid gap-2">${x.estado === 'enviado' ? '<button class="btn btn-success" data-rv="aprobado"><i class="bi bi-patch-check me-1"></i>Aprobar</button>' : ''}<button class="btn btn-outline-warning" data-rv="devuelto"><i class="bi bi-arrow-return-left me-1"></i>Devolver para corregir</button><button class="btn btn-outline-danger" data-rv="rechazado"><i class="bi bi-x-circle me-1"></i>No aprobar</button></div>
          ${x.estado === 'aprobado' ? '<div class="small text-body-secondary mt-2">Ya está aprobado; mientras el club no cree el proyecto aún puedes devolverlo.</div>' : ''}` : x.proyecto_id ? '<div class="small text-success"><i class="bi bi-globe-americas me-1"></i>El club ya lo convirtió en proyecto.</div>' : x.estado === 'borrador' ? '<div class="small text-body-secondary"><i class="bi bi-pencil me-1"></i>Borrador: el club aún lo está llenando. Lo podrás revisar cuando lo envíe.</div>' : ''}</div></div></div>`;
    view.onclick = async (ev) => {
      const b = ev.target.closest('[data-rv]'); if (!b) return;
      const comentario = view.querySelector('#rv_c').value.trim();
      if (b.dataset.rv !== 'aprobado' && !comentario) { toast('Escribe al club qué debe corregir o por qué no se aprueba', false); view.querySelector('#rv_c').focus(); return; }
      b.disabled = true;
      try { await api(`/api/distrito/envios/${id}/revisar`, { method: 'POST', body: { estado: b.dataset.rv, comentario } }); toast({ aprobado: 'Aprobado', devuelto: 'Devuelto al club', rechazado: 'Marcado como no aprobado' }[b.dataset.rv]); verEnvio(id); }
      catch (err) { toast(err.message, false); b.disabled = false; }
    };
  }

  function pintar() {
    const ACC = { clubes: ['Solicitar club nuevo', solicitarClub], formatos: ['Nuevo formato', () => editarFormato(null)], cuotas: ['Nueva cuota', () => editar(null)], bonos: ['Nuevo bono', () => editarBono(null)], metas: ['Editar metas', editarMetas] };
    acciones.innerHTML = M && ACC[tab] ? `<button class="btn btn-primary" data-nueva><i class="bi ${tab === 'metas' ? 'bi-pencil' : 'bi-plus-lg'} me-1"></i>${ACC[tab][0]}</button>` : '';
    acciones.querySelector('[data-nueva]')?.addEventListener('click', () => ACC[tab][1]());
    view._fmtOff?.(); view.onclick = null; view.oninput = null; view.onchange = null; acciones.onclick = null;
    if (tab === 'formatos') return pintarFormatos();
    if (tab === 'impacto') return pintarImpacto();
    if (tab === 'orden') return pintarOrden();
    if (tab === 'juegos') return pintarJuegos();
    if (tab === 'cuotas') return pintarCuotas();
    if (tab === 'metas') return pintarMetas();
    if (tab === 'cargos') return pintarCargos();
    if (tab === 'bonos') return pintarBonos();
    return tab === 'anio' ? pintarAnio() : pintarClubes();
  }
  async function cargar() { t = await api(`/api/distrito/tablero${anio ? `?anio=${anio}` : ''}`); anio = t.anio; pintar(); }

  document.head.insertAdjacentHTML('beforeend', `<style>.ro-dclubs{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))}
    .ro-dclub{text-align:left;padding:16px;border-radius:16px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit}.ro-dclub:hover{border-color:var(--dw-p)}
    .ro-pstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}.ro-pstats span{display:flex;flex-direction:column;font-size:.72rem;color:var(--bs-secondary-color);background:rgba(var(--dw-p-rgb),.05);border-radius:10px;padding:6px 2px}.ro-pstats b{font-size:1.05rem;color:var(--bs-body-color)}</style>`);
  view.addEventListener('click', (e) => {
    const y = e.target.closest('[data-ay]'); if (y) { anio += Number(y.dataset.ay); return cargar(); }
    const pg = e.target.closest('[data-prog]'); if (pg) { prog = pg.dataset.prog; pintarClubes(); return; }
    const k = e.target.closest('[data-club]'); if (k) detalle(k.dataset.club);
  });
  const ini = /^#(formato|envio)=(\w+)$/.exec(location.hash);   // enlace directo a una solicitud o a un formato
  if (!ini) await cargar();
  else {
    t = await api('/api/distrito/tablero'); anio = t.anio;
    if (ini[1] === 'envio') await verEnvio(Number(ini[2]));
    else if (M) { fmt = await api('/api/distrito/formatos'); await editarFormato(fmt.rows.find((x) => x.id === Number(ini[2])) || null); } else pintar();
  }
});
