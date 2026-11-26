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
  let tab = ['anio', 'metas', 'cuotas', 'bonos', 'cargos', 'orden', 'juegos'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'clubes', anio = null, t = null;
  document.querySelector('[data-h1]').textContent = `Distrito ${({ rotary: 'Rotary', rotaract: 'Rotaract', interact: 'Interact' })[me.distrito.programa] || ''} ${me.distrito.codigo}`;
  RO.pills([['clubes', 'Clubes', '#clubes', 'bi-diagram-3'], ['anio', 'Año rotario', '#anio', 'bi-bar-chart'], ['metas', 'Metas', '#metas', 'bi-bullseye'], ['cuotas', 'Cuotas', '#cuotas', 'bi-bank'], ['bonos', 'Bonos', '#bonos', 'bi-ticket-perforated'], ['cargos', 'Cargos', '#cargos', 'bi-person-badge'], ['orden', 'Orden del día', '#orden', 'bi-list-ol'], ['juegos', 'Juegos', '#juegos', 'bi-controller']], tab, (k) => { tab = k; pintar(); });

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

  async function pintarCuotas() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    const d = await api('/api/distrito/cuotas');
    view.innerHTML = `<p class="small text-body-secondary">Dos tipos: <b>por socio</b> (cuota distrital: valor × socios activos del club) y <b>por club</b> (cuota de representación: el mismo valor fijo para cada club). A cada club le llega como obligación en <b>Finanzas → Proyectado</b> y desde ahí la paga.</p>
      ${d.rows.length ? d.rows.map((q) => `<div class="dw-card mb-3"><div class="d-flex align-items-center gap-2 flex-wrap"><i class="bi bi-bank fs-4" style="color:var(--dw-p)"></i>
          <div class="flex-grow-1"><b>${esc(q.nombre)}</b><div class="small text-body-secondary">${q.tipo === 'por_club' ? `<span class="badge text-bg-light me-1">Representación</span>${C.money(q.valor_socio)} por club` : `${C.money(q.valor_socio)} por socio`} · vence ${C.day(q.vence)} · año ${q.anio}-${q.anio + 1}${q.notas ? ` · ${esc(q.notas)}` : ''}</div></div>
          <div class="text-end"><b>${C.money(q.pagado)}</b> <span class="small text-body-secondary">de ${C.money(q.total)}</span><div class="small">${q.pagaron}/${q.clubes.length} clubes pagaron</div></div>
          ${M ? `<button class="btn btn-sm btn-light" data-ed="${q.id}" aria-label="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light" data-del="${q.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div>
        ${C.meter(q.pagado, q.total)}
        <details class="mt-2"><summary class="small">Ver por club</summary>${window.App.table([{ label: 'Club', main: true, html: (x) => esc(x.club) }, { label: 'Socios', cls: 'text-end', html: (x) => x.socios },
          { label: 'Le toca', cls: 'text-end', html: (x) => C.money(x.total) }, { label: 'Pagado', cls: 'text-end', html: (x) => C.money(x.pagado) }, { label: 'Estado', html: (x) => C.chip(...EST[x.estado]) }], q.clubes)}</details></div>`).join('')
      : window.App.empty('bi-bank', 'Aún no hay cuotas distritales.')}`;
    view.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => editar(d.rows.find((q) => String(q.id) === b.dataset.ed))));
    view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
      if (!(await window.App.confirm({ title: '¿Borrar esta cuota?', text: 'Deja de aparecer en las finanzas de los clubes.', ok: 'Borrar' }))) return;
      try { await api(`/api/distrito/cuotas/${b.dataset.del}`, { method: 'DELETE' }); toast('Borrada'); pintarCuotas(); } catch (x) { toast(x.message, false); }
    }));
  }
  async function editar(q) {
    const out = await C.form({ title: q ? 'Editar cuota' : 'Nueva cuota', fields: [{ k: 'nombre', label: 'Nombre', type: 'text', required: true, full: true },
      { k: 'tipo', label: 'Tipo', type: 'select', options: [['por_socio', 'Por socio activo (cuota distrital)'], ['por_club', 'Fija por club (cuota de representación)']] }, { k: 'valor_socio', label: 'Valor (por socio o por club, según el tipo)', type: 'money', required: true }, { k: 'vence', label: 'Vence', type: 'date', required: true }, { k: 'notas', label: 'Notas', type: 'long' }],
      values: q || { nombre: `Cuota distrital ${t.nombre_anio}`, tipo: 'por_socio' }, okText: 'Guardar' });
    if (!out) return;
    try { await api(q ? `/api/distrito/cuotas/${q.id}` : '/api/distrito/cuotas', { method: q ? 'PATCH' : 'POST', body: out }); toast('Guardada: ya la ven los clubes'); await cargar(); } catch (x) { toast(x.message, false); }
  }

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
        <div class="small text-body-secondary mt-2">Suman las partidas terminadas «del reto» en cada club. Promedio = puntos por socio que jugó (para comparar clubes grandes y pequeños).</div></div></div>
      <div class="col-lg-5"><div class="dw-card h-100"><div class="ro-h mt-0">Preguntas y palabras del distrito</div><p class="small text-body-secondary">Lo que añadas aquí llega a todos los clubes del distrito y es lo que se usa en los retos (junto con el banco de la app). Cada presidencia puede apagarlo en su club, pero no en los retos.</p>
        <div class="d-grid gap-2">${CONT.map(([k, l]) => `<button class="btn btn-outline-primary text-start" data-cont="${k}">${J[k]?.emoji || '🎮'} ${l}</button>`).join('')}</div></div></div>
      <div class="col-12"><div class="dw-card"><div class="ro-h mt-0">Retos del distrito</div>
        ${rt.rows.length ? window.App.table([{ label: 'Reto', main: true, html: (r) => `${J[r.juego]?.emoji || ''} <b>${esc(r.nombre)}</b><div class="small text-body-secondary fw-normal">${esc(J[r.juego]?.nombre || r.juego)}${r.descripcion ? ` · ${esc(r.descripcion)}` : ''}</div>` },
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
      { k: 'descripcion', label: 'Indicaciones para los clubes', type: 'long' }], values: r || { juego: 'trivia', desde: C.todayCo() }, okText: r ? 'Guardar' : 'Crear reto' });
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
  async function pintarBonos() {
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    bonos = (await api('/api/distrito/bonos')).rows;
    view.innerHTML = `<p class="small text-body-secondary">Bonos o boletas del distrito (rifas, eventos, campañas): asigna cuántos le tocan a cada club y registra lo vendido y lo pagado. Cada club los ve en su Inicio.</p>
      ${bonos.length ? bonos.map((b) => `<div class="dw-card mb-3"><div class="d-flex align-items-center gap-2 flex-wrap"><i class="bi bi-ticket-perforated fs-4" style="color:var(--dw-p)"></i>
          <div class="flex-grow-1"><b>${esc(b.nombre)}</b><div class="small text-body-secondary">${C.money(b.valor)} cada uno${b.vence ? ` · vence ${C.day(b.vence)}` : ''}${b.notas ? ` · ${esc(b.notas)}` : ''}</div></div>
          <div class="text-end"><b>${C.money(b.pagado)}</b> <span class="small text-body-secondary">de ${C.money(b.total)}</span><div class="small">${C.num(b.vendidos)}/${C.num(b.asignados)} vendidos</div></div>
          ${M ? `<button class="btn btn-sm btn-light" data-bed="${b.id}" aria-label="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light" data-bdel="${b.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div>
        ${C.meter(b.pagado, b.total)}
        <details class="mt-2" ${b.asignados ? '' : 'open'}><summary class="small">Por club</summary>${window.App.table([{ label: 'Club', main: true, html: (x) => esc(x.club) }, { label: 'Asignados', cls: 'text-end', html: (x) => C.num(x.asignados) },
          { label: 'Vendidos', cls: 'text-end', html: (x) => C.num(x.vendidos) }, { label: 'Pagado', cls: 'text-end', html: (x) => `${C.money(x.pagado)} <span class="text-body-secondary">/ ${C.money(x.total)}</span>` },
          { label: '', html: (x) => (M ? `<button class="btn btn-sm btn-light" data-basig="${b.id}" data-bclub="${esc(x.club_id)}"><i class="bi bi-pencil"></i></button>` : '') }], b.clubes)}</details></div>`).join('')
      : window.App.empty('bi-ticket-perforated', 'Aún no hay bonos del distrito.')}`;
    view.querySelectorAll('[data-bed]').forEach((x) => (x.onclick = () => editarBono(bonos.find((b) => String(b.id) === x.dataset.bed))));
    view.querySelectorAll('[data-bdel]').forEach((x) => (x.onclick = async () => {
      if (!(await window.App.confirm({ title: '¿Borrar este bono?', text: 'Deja de aparecer en los clubes.', ok: 'Borrar' }))) return;
      try { await api(`/api/distrito/bonos/${x.dataset.bdel}`, { method: 'DELETE' }); toast('Borrado'); pintarBonos(); } catch (e) { toast(e.message, false); }
    }));
    view.querySelectorAll('[data-basig]').forEach((x) => (x.onclick = async (e) => {
      e.stopPropagation();
      const b = bonos.find((y) => String(y.id) === x.dataset.basig), k = b.clubes.find((y) => y.club_id === x.dataset.bclub);
      const out = await C.form({ title: `${b.nombre} · ${k.club}`, fields: [{ k: 'asignados', label: 'Asignados', type: 'int' }, { k: 'vendidos', label: 'Vendidos', type: 'int' }, { k: 'pagado', label: 'Pagado al distrito', type: 'money' }], values: k, okText: 'Guardar' });
      if (!out) return;
      try { await api(`/api/distrito/bonos/${b.id}/clubes/${encodeURIComponent(k.club_id)}`, { method: 'PUT', body: out }); toast('Guardado'); pintarBonos(); } catch (er) { toast(er.message, false); }
    }));
  }
  async function editarBono(b) {
    const out = await C.form({ title: b ? 'Editar bono' : 'Nuevo bono', fields: [{ k: 'nombre', label: 'Nombre', type: 'text', required: true, full: true, placeholder: 'Rifa conferencia distrital' },
      { k: 'valor', label: 'Valor de cada bono', type: 'money', required: true }, { k: 'vence', label: 'Fecha límite', type: 'date' }, { k: 'notas', label: 'Notas', type: 'long' }], values: b || {}, okText: 'Guardar' });
    if (!out) return;
    try { await api(b ? `/api/distrito/bonos/${b.id}` : '/api/distrito/bonos', { method: b ? 'PATCH' : 'POST', body: out }); toast(b ? 'Bono guardado' : 'Bono creado: ahora asígnalo a los clubes'); pintarBonos(); } catch (x) { toast(x.message, false); }
  }

  function pintar() {
    const ACC = { clubes: ['Solicitar club nuevo', solicitarClub], cuotas: ['Nueva cuota', () => editar(null)], bonos: ['Nuevo bono', () => editarBono(null)], metas: ['Editar metas', editarMetas] };
    acciones.innerHTML = M && ACC[tab] ? `<button class="btn btn-primary" data-nueva><i class="bi ${tab === 'metas' ? 'bi-pencil' : 'bi-plus-lg'} me-1"></i>${ACC[tab][0]}</button>` : '';
    acciones.querySelector('[data-nueva]')?.addEventListener('click', () => ACC[tab][1]());
    view.onclick = null; view.oninput = null;
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
  await cargar();
});
