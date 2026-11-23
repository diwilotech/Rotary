// Impacto: proyectos en tarjetas (beneficiados, tareas, alianzas y origen de los recursos: Caja mayor, Financiación externa o Doble),
// más las pestañas de Alianzas y Beneficiarios.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud, RO = window.RO;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]'), seg = document.querySelector('[data-seg]');
  const M = me.canManage && !me.business.readOnly, W = !me.business.readOnly;
  const EST = { propuesta: ['free', 'Propuesta'], planeacion: ['soon', 'Planeación'], en_curso: ['ok', 'En curso'], finalizado: ['ok', 'Finalizado'], cancelado: ['bad', 'Cancelado'] };
  const FIN = { caja_mayor: ['bi-safe2', 'Caja mayor', '#0ea5e9'], externa: ['bi-building', 'Financiación externa', '#8b5cf6'], doble: ['bi-intersect', 'Doble financiación', '#f59e0b'] };
  const socios = await RO.socios();
  let tab = 'proyectos', rows = [];

  const camposP = [{ k: 'nombre', label: 'Nombre del proyecto', type: 'text', required: true, full: true }, { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(EST).map(([k, [, l]]) => [k, l]) },
    { k: 'socio_lider_id', label: 'Líder', type: 'select', options: RO.opts(socios.filter((s) => s.estado === 'activo'), 'Sin líder') },
    { k: 'fecha_inicio', label: 'Inicio', type: 'date' }, { k: 'fecha_fin', label: 'Fin', type: 'date' },
    { k: 'beneficiados', label: 'Personas beneficiadas', type: 'int' }, { k: 'horas_servicio', label: 'Horas de servicio', type: 'int' },
    { k: 'financiacion', label: 'Origen de los recursos', type: 'select', options: Object.entries(FIN).map(([k, [, l]]) => [k, l]) }, { k: 'presupuesto', label: 'Presupuesto total', type: 'money' },
    { k: 'monto_caja_mayor', label: 'Aporte de la Caja mayor', type: 'money' }, { k: 'monto_externo', label: 'Aporte externo', type: 'money' },
    { k: 'financiador', label: 'Financiador externo', type: 'text', full: true, hint: 'si es externa o doble' }, { k: 'foto_url', label: 'Foto (enlace https)', type: 'url', full: true },
    { k: 'descripcion', label: 'Descripción', type: 'long' }, { k: 'objetivo', label: 'Objetivo', type: 'long' }];

  async function editarP(p) {
    const out = await C.form({ title: p ? 'Editar proyecto' : 'Nuevo proyecto', fields: camposP, values: p ? { ...p } : { estado: 'propuesta', financiacion: 'caja_mayor' }, onDelete: p ? () => api(`/api/impacto/proyectos/${p.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Proyecto borrado'); return cargar(); }
    if (!out) return;
    try { await api(p ? `/api/impacto/proyectos/${p.id}` : '/api/impacto/proyectos', { method: p ? 'PATCH' : 'POST', body: out }); toast('Guardado'); cargar(); } catch (x) { toast(x.message, false); }
  }

  const finBadge = (p) => { const [ic, l, col] = FIN[p.financiacion] || FIN.caja_mayor; return `<span class="ro-fin" style="--f:${col}"><i class="bi ${ic}"></i>${l}</span>`; };
  const tarjeta = (p) => `<button type="button" class="ro-pcard" data-p="${p.id}">
      <div class="ro-pimg" ${p.foto_url ? `style="background-image:url('${esc(p.foto_url)}')"` : ''}>${p.foto_url ? '' : '<i class="bi bi-globe-americas"></i>'}<span class="ro-pest">${C.chip(...(EST[p.estado] || EST.propuesta))}</span></div>
      <div class="p-3 d-grid gap-2"><b class="fs-6">${esc(p.nombre)}</b>${p.lider ? `<span class="small text-body-secondary"><i class="bi bi-person me-1"></i>${esc(p.lider)}</span>` : ''}
        <div class="ro-pstats"><span><b>${C.num(p.beneficiados_total)}</b>beneficiados</span><span><b>${p.tareas_hechas}/${p.tareas}</b>tareas</span><span><b>${p.alianzas}</b>alianzas</span></div>
        ${p.tareas ? C.meter(p.tareas_hechas, p.tareas) : ''}
        <div>${finBadge(p)}</div>
        <div class="small text-body-secondary">${p.financiacion !== 'externa' ? `Caja mayor: <b>${C.money(p.monto_caja_mayor)}</b>${p.gastado_caja_mayor ? ` · gastado ${C.money(p.gastado_caja_mayor)}` : ''}` : ''}${p.financiacion !== 'caja_mayor' ? `${p.financiacion === 'doble' ? '<br>' : ''}Externo: <b>${C.money(p.monto_externo)}</b>${p.financiador ? ` · ${esc(p.financiador)}` : ''}` : ''}</div>
      </div></button>`;

  async function detalle(id) {
    const { el, m } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    let d; try { d = await api(`/api/impacto/proyectos/${id}/detalle`); } catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const p = d.proyecto, li = (arr, f) => (arr.length ? `<ul class="list-unstyled small mb-0">${arr.map((x) => `<li class="py-1 border-bottom d-flex gap-2">${f(x)}</li>`).join('')}</ul>` : '<p class="small text-body-secondary">Nada registrado.</p>');
    el.querySelector('.modal-content').innerHTML = `<div class="modal-header border-0 pb-0"><div><h2 class="modal-title h5">${esc(p.nombre)}</h2><div class="d-flex gap-2 mt-1">${C.chip(...(EST[p.estado] || EST.propuesta))}${finBadge(p)}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${p.descripcion ? `<p class="small" style="white-space:pre-wrap">${esc(p.descripcion)}</p>` : ''}
        <div class="row g-2 mb-3">${[['Beneficiados', C.num(p.beneficiados_total)], ['Horas de servicio', C.num(p.horas_servicio)], ['Presupuesto', C.money(p.presupuesto)], ['Gastado (caja mayor)', C.money(p.gastado_caja_mayor)]].map(([l, v]) => `<div class="col-6 col-md-3"><div class="dw-card p-2 text-center"><div class="fw-bold">${v}</div><div class="small text-body-secondary">${l}</div></div></div>`).join('')}</div>
        <div class="row g-3"><div class="col-md-6"><div class="ro-h mt-0">Tareas</div>${li(d.tareas, (t) => `<i class="bi ${t.estado === 'hecha' ? 'bi-check-circle-fill text-success' : 'bi-circle'}"></i><span class="flex-grow-1">${esc(t.titulo)}</span><span class="text-body-secondary">${esc(t.responsable || '')}</span>`)}</div>
        <div class="col-md-6"><div class="ro-h mt-0">Alianzas</div>${li(d.alianzas, (a) => `<i class="bi bi-building"></i><span class="flex-grow-1">${esc(a.nombre)}</span><span class="text-body-secondary">${esc(a.estado)}</span>`)}</div>
        <div class="col-md-6"><div class="ro-h">Beneficiarios registrados (${d.beneficiarios.length})</div>${li(d.beneficiarios.slice(0, 30), (b) => `<i class="bi bi-person-heart"></i><span class="flex-grow-1">${esc(b.nombre)}</span><span class="text-body-secondary">${b.edad ? `${b.edad} años` : esc(b.tipo || '')}</span>`)}</div>
        ${me.canManage ? `<div class="col-md-6"><div class="ro-h">Movimientos de la Caja mayor</div>${li(d.movimientos.slice(0, 20), (x) => `<span class="text-body-secondary">${C.day(x.fecha)}</span><span class="flex-grow-1">${esc(x.concepto)}</span><b class="${x.tipo === 'egreso' ? 'text-danger' : 'text-success'}">${x.tipo === 'egreso' ? '−' : '+'}${C.money(x.monto)}</b>`)}</div>` : ''}</div></div>
      ${M ? '<div class="modal-footer border-0 pt-0"><button class="btn btn-light" data-ed><i class="bi bi-pencil me-1"></i>Editar</button></div>' : ''}`;
    el.querySelector('[data-ed]')?.addEventListener('click', () => { m.hide(); editarP(rows.find((x) => x.id === p.id)); });
  }

  async function cargar() {
    acciones.innerHTML = '';
    if (tab === 'proyectos') {
      if (M) { acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo proyecto</button>'; acciones.querySelector('[data-nuevo]').onclick = () => editarP(null); }
      rows = (await api('/api/impacto/tarjetas')).rows;
      const vivos = rows.filter((p) => ['en_curso', 'planeacion'].includes(p.estado));
      view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-kpis></div><div class="ro-pgrid">${rows.map(tarjeta).join('')}</div>${rows.length ? '' : window.App.empty('bi-globe-americas', 'Aún no hay proyectos de servicio.')}`;
      C.kpis(view.querySelector('[data-kpis]'), [['Proyectos vivos', vivos.length, `${rows.length} en total`, 'bi-globe-americas'], ['Beneficiados', C.num(rows.reduce((s, p) => s + p.beneficiados_total, 0)), '', 'bi-people'],
        ['Horas de servicio', C.num(rows.reduce((s, p) => s + (p.horas_servicio || 0), 0)), '', 'bi-clock-history'], ['Con aporte externo', rows.filter((p) => p.financiacion !== 'caja_mayor').length, 'externa o doble', 'bi-building']]);
      return;
    }
    const proys = await RO.proyectos(true);
    if (tab === 'alianzas') {
      return C.table({ el: view, base: '/api/impacto', entity: 'alianzas', title: 'alianza', newText: 'Nueva alianza', readOnly: !W, emptyIcon: 'bi-building', empty: 'Aún no hay alianzas.',
        filters: [{ k: 'estado', options: [['', 'Todas'], ['prospecto', 'Prospecto'], ['seguimiento', 'Seguimiento'], ['activa', 'Activa'], ['cerrada', 'Cerrada'], ['descartada', 'Descartada']] }],
        fields: [{ k: 'nombre', label: 'Entidad', type: 'text', required: true }, { k: 'tipo', label: 'Tipo', type: 'text' }, { k: 'estado', label: 'Estado', type: 'select', options: [['prospecto', 'Prospecto'], ['seguimiento', 'Seguimiento'], ['activa', 'Activa'], ['cerrada', 'Cerrada'], ['descartada', 'Descartada']] },
          { k: 'proyecto_id', label: 'Proyecto', type: 'select', options: RO.opts(proys, 'Ninguno') }, { k: 'contacto', label: 'Contacto', type: 'text' }, { k: 'telefono', label: 'Teléfono', type: 'text' }, { k: 'correo', label: 'Correo', type: 'email' },
          { k: 'municipio', label: 'Municipio', type: 'text' }, { k: 'proximo_paso', label: 'Próximo paso', type: 'text' }, { k: 'proximo_paso_fecha', label: 'Fecha del próximo paso', type: 'date' }, { k: 'descripcion', label: 'Notas', type: 'long' }],
        columns: [{ label: 'Entidad', main: true, html: (a) => `${esc(a.nombre)}<div class="small text-body-secondary fw-normal">${esc(a.tipo || '')}${a.municipio ? ` · ${esc(a.municipio)}` : ''}</div>` },
          { label: 'Estado', html: (a) => C.chip({ activa: 'ok', seguimiento: 'soon', prospecto: 'free', cerrada: 'free', descartada: 'bad' }[a.estado], a.estado) },
          { label: 'Proyecto', html: (a) => esc(proys.find((p) => p.id === a.proyecto_id)?.nombre || '—') }, { label: 'Próximo paso', html: (a) => `${esc(a.proximo_paso || '—')}${a.proximo_paso_fecha ? `<div class="small text-body-secondary">${C.day(a.proximo_paso_fecha)}</div>` : ''}` }] }).load();
    }
    C.table({ el: view, base: '/api/impacto', entity: 'beneficiarios', title: 'beneficiario', newText: 'Nuevo beneficiario', readOnly: !W, emptyIcon: 'bi-person-heart', empty: 'Aún no hay beneficiarios registrados.',
      filters: [{ k: 'proyecto_id', options: [['', 'Todos los proyectos'], ...proys.map((p) => [p.id, p.nombre])] }],
      fields: [{ k: 'nombre', label: 'Nombre', type: 'text', required: true }, { k: 'proyecto_id', label: 'Proyecto', type: 'select', options: RO.opts(proys, 'Ninguno') }, { k: 'tipo', label: 'Tipo', type: 'text', placeholder: 'niño, adulto mayor…' },
        { k: 'edad', label: 'Edad', type: 'int' }, { k: 'autorizacion_datos', label: 'Datos', type: 'bool', check: 'Autorizó el uso de datos' }, { k: 'autorizacion_imagen', label: 'Imagen', type: 'bool', check: 'Autorizó el uso de imagen' }, { k: 'notas', label: 'Notas', type: 'long' }],
      columns: [{ label: 'Nombre', main: true, html: (b) => esc(b.nombre) }, { label: 'Proyecto', html: (b) => esc(proys.find((p) => p.id === b.proyecto_id)?.nombre || '—') }, { label: 'Edad', html: (b) => (b.edad ?? '—') },
        { label: 'Autorizaciones', html: (b) => `${b.autorizacion_datos ? '<i class="bi bi-shield-check text-success" title="Datos"></i>' : '<i class="bi bi-shield-x text-danger" title="Sin autorización de datos"></i>'} ${b.autorizacion_imagen ? '<i class="bi bi-camera text-success" title="Imagen"></i>' : ''}` }] }).load();
  }

  document.head.insertAdjacentHTML('beforeend', `<style>.ro-pgrid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))}
    .ro-pcard{padding:0;border-radius:16px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);overflow:hidden;text-align:left;color:inherit;transition:transform .12s}.ro-pcard:hover{transform:translateY(-2px);border-color:var(--dw-p)}
    .ro-pimg{height:120px;background:linear-gradient(135deg,rgba(var(--dw-p-rgb),.35),rgba(var(--dw-p-rgb),.08)) center/cover;display:grid;place-items:center;font-size:2.4rem;color:var(--dw-p);position:relative}.ro-pest{position:absolute;top:8px;right:8px}
    .ro-pstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}.ro-pstats span{display:flex;flex-direction:column;font-size:.72rem;color:var(--bs-secondary-color);background:rgba(var(--dw-p-rgb),.05);border-radius:10px;padding:6px 2px}.ro-pstats b{font-size:1.05rem;color:var(--bs-body-color)}
    .ro-fin{display:inline-flex;gap:6px;align-items:center;font-size:.78rem;font-weight:600;color:var(--f);background:color-mix(in srgb,var(--f) 14%,transparent);border-radius:999px;padding:3px 10px}</style>`);
  C.seg(seg, [['proyectos', 'Proyectos'], ['alianzas', 'Alianzas'], ['beneficiarios', 'Beneficiarios']], (k) => { tab = k; cargar(); }, tab);
  view.addEventListener('click', (e) => { const c = e.target.closest('[data-p]'); if (c && tab === 'proyectos') detalle(c.dataset.p); });
  await cargar();
});
