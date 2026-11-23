// Impacto: proyectos en tarjetas; al tocar uno se abre SU página (#p=<id>) con secciones: Resumen (financiación con barras del
// club y de cada alianza financiera, tareas), Documentación (archivos y enlaces), Comunidad (a quién se impacta y sus
// beneficiarios) y Alianzas (por tipo de aporte). Pestañas generales de Alianzas y Beneficiarios.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud, RO = window.RO;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]'), seg = document.querySelector('[data-seg]');
  const M = me.canManage && !me.business.readOnly, W = !me.business.readOnly;
  const EST = { propuesta: ['free', 'Propuesta'], planeacion: ['soon', 'Planeación'], en_curso: ['ok', 'En curso'], finalizado: ['ok', 'Finalizado'], cancelado: ['bad', 'Cancelado'] };
  const FIN = { caja_mayor: ['bi-safe2', 'Caja mayor', '#0ea5e9'], externa: ['bi-building', 'Financiación externa', '#8b5cf6'], doble: ['bi-intersect', 'Doble financiación', '#f59e0b'] };
  const socios = await RO.socios();
  let tab = ['alianzas', 'beneficiarios'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'proyectos', rows = [];
  const APORTE = { financiera: ['bi-cash-coin', 'Financiera', '#16a34a'], social: ['bi-people', 'Social', '#0284c7'], especie: ['bi-box-seam', 'En especie', '#d97706'], academica: ['bi-mortarboard', 'Académica', '#7c3aed'], difusion: ['bi-megaphone', 'Difusión', '#db2777'], otra: ['bi-three-dots', 'Otra', '#64748b'] };
  const camposA = (proys) => [{ k: 'nombre', label: 'Entidad', type: 'text', required: true }, { k: 'tipo_aporte', label: 'Tipo de aporte', type: 'select', options: [['', '—'], ...Object.entries(APORTE).map(([k, [, l]]) => [k, l])] },
    { k: 'aporte_comprometido', label: 'Aporte comprometido', type: 'money', hint: 'si es financiera' }, { k: 'aporte_recibido', label: 'Aporte recibido', type: 'money' },
    { k: 'tipo', label: 'Tipo de entidad', type: 'text', placeholder: 'fundación, empresa, alcaldía…' }, { k: 'estado', label: 'Estado', type: 'select', options: [['prospecto', 'Prospecto'], ['seguimiento', 'Seguimiento'], ['activa', 'Activa'], ['cerrada', 'Cerrada'], ['descartada', 'Descartada']] },
    { k: 'proyecto_id', label: 'Proyecto', type: 'select', options: RO.opts(proys, 'Ninguno') }, { k: 'contacto', label: 'Contacto', type: 'text' }, { k: 'telefono', label: 'Teléfono', type: 'text' }, { k: 'correo', label: 'Correo', type: 'email' },
    { k: 'municipio', label: 'Municipio', type: 'text' }, { k: 'proximo_paso', label: 'Próximo paso', type: 'text' }, { k: 'proximo_paso_fecha', label: 'Fecha del próximo paso', type: 'date' }, { k: 'descripcion', label: 'Notas', type: 'long' }];

  const camposP = [{ k: 'nombre', label: 'Nombre del proyecto', type: 'text', required: true, full: true }, { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(EST).map(([k, [, l]]) => [k, l]) },
    { k: 'socio_lider_id', label: 'Líder', type: 'select', options: RO.opts(socios.filter((s) => s.estado === 'activo'), 'Sin líder') },
    { k: 'fecha_inicio', label: 'Inicio', type: 'date' }, { k: 'fecha_fin', label: 'Fin', type: 'date' },
    { k: 'beneficiados', label: 'Personas beneficiadas', type: 'int' }, { k: 'horas_servicio', label: 'Horas de servicio', type: 'int' },
    { k: 'financiacion', label: 'Origen de los recursos', type: 'select', options: Object.entries(FIN).map(([k, [, l]]) => [k, l]) }, { k: 'presupuesto', label: 'Presupuesto total', type: 'money' },
    { k: 'monto_caja_mayor', label: 'Aporte de la Caja mayor', type: 'money' }, { k: 'monto_externo', label: 'Aporte externo', type: 'money' },
    { k: 'financiador', label: 'Financiador externo', type: 'text', full: true, hint: 'si es externa o doble' }, { k: 'foto_url', label: 'Foto (enlace https)', type: 'url', full: true },
    { k: 'descripcion', label: 'Descripción', type: 'long' }, { k: 'objetivo', label: 'Objetivo', type: 'long' },
    { k: 'comunidad', label: 'Comunidad que se impacta', type: 'text', full: true, placeholder: 'p. ej. Fundación Jardín de Amor' }, { k: 'comunidad_lugar', label: 'Lugar', type: 'text' }, { k: 'comunidad_contacto', label: 'Contacto de la comunidad', type: 'text' },
    { k: 'comunidad_descripcion', label: 'Sobre la comunidad', type: 'long' }];

  async function editarP(p) {
    const out = await C.form({ title: p ? 'Editar proyecto' : 'Nuevo proyecto', fields: camposP, values: p ? { ...p } : { estado: 'propuesta', financiacion: 'caja_mayor' }, onDelete: p ? () => api(`/api/impacto/proyectos/${p.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Proyecto borrado'); abierto = null; history.replaceState(null, '', location.pathname); return cargar(); }
    if (!out) return;
    try { const r = await api(p ? `/api/impacto/proyectos/${p.id}` : '/api/impacto/proyectos', { method: p ? 'PATCH' : 'POST', body: out }); toast('Guardado'); abierto ? abrir(abierto) : p ? cargar() : abrir(r.id); } catch (x) { toast(x.message, false); }
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

  /* ---------- Página de un proyecto ---------- */
  let abierto = null, sec = 'resumen';
  const barra = (titulo, v, meta, color, sub = '') => `<div class="mb-2"><div class="d-flex justify-content-between small"><span><b>${titulo}</b>${sub ? ` <span class="text-body-secondary">${sub}</span>` : ''}</span><span>${C.money(v)} <span class="text-body-secondary">de ${C.money(meta)}</span></span></div>
    <div class="progress" style="height:10px"><div class="progress-bar" style="width:${meta ? Math.min(100, Math.round((v / meta) * 100)) : 0}%;background:${color}"></div></div></div>`;
  const aporteChip = (a) => { const [ic, l, col] = APORTE[a.tipo_aporte] || APORTE.otra; return `<span class="ro-fin" style="--f:${col}"><i class="bi ${ic}"></i>${a.tipo_aporte ? l : 'Sin tipo'}</span>`; };
  async function abrir(id) {
    abierto = Number(id); history.replaceState(null, '', `#p=${abierto}`);
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let d; try { d = await api(`/api/impacto/proyectos/${abierto}/detalle`); } catch (x) { view.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; return; }
    const p = d.proyecto, hoy = C.todayCo();
    acciones.innerHTML = `<button class="btn btn-light" data-volver><i class="bi bi-arrow-left me-1"></i>Proyectos</button>${M ? '<button class="btn btn-outline-primary" data-ed><i class="bi bi-pencil me-1"></i>Editar</button>' : ''}`;
    acciones.querySelector('[data-volver]').onclick = () => { abierto = null; history.replaceState(null, '', location.pathname); cargar(); };
    acciones.querySelector('[data-ed]')?.addEventListener('click', () => editarP(p));
    const finan = d.alianzas.filter((a) => a.tipo_aporte === 'financiera');
    const SEC = [['resumen', 'Resumen', 'bi-card-text'], ['docs', `Documentación (${d.docs.length})`, 'bi-folder2-open'], ['comunidad', `Comunidad (${d.beneficiarios.length})`, 'bi-house-heart'], ['alianzas', `Alianzas (${d.alianzas.length})`, 'bi-people']];
    const cuerpo = {
      resumen: () => `<div class="row g-3"><div class="col-lg-7"><div class="dw-card h-100">
          ${p.descripcion ? `<div class="ro-h mt-0">De qué se trata</div><p style="white-space:pre-wrap">${esc(p.descripcion)}</p>` : ''}${p.objetivo ? `<div class="ro-h">Objetivo</div><p style="white-space:pre-wrap">${esc(p.objetivo)}</p>` : ''}
          ${!p.descripcion && !p.objetivo ? '<p class="text-body-secondary small">Aún no tiene descripción. Agrégala con «Editar».</p>' : ''}
          <div class="ro-pstats mt-2"><span><b>${C.num(p.beneficiados_total)}</b>beneficiados</span><span><b>${C.num(p.horas_servicio || 0)}</b>horas</span><span><b>${p.tareas_hechas}/${p.tareas}</b>tareas</span></div>
          <div class="ro-h">Tareas</div>${d.tareas.length ? d.tareas.map((t) => `<div class="d-flex gap-2 small py-1 border-bottom"><i class="bi ${t.estado === 'hecha' ? 'bi-check-circle-fill text-success' : 'bi-circle'}"></i><span class="flex-grow-1">${esc(t.titulo)}</span><span class="text-body-secondary">${esc(t.responsable || '')}${t.fecha_limite ? ` · ${C.day(t.fecha_limite)}` : ''}</span></div>`).join('') : '<p class="small text-body-secondary mb-0">Sin tareas. Créalas en Tareas eligiendo este proyecto.</p>'}</div></div>
        <div class="col-lg-5"><div class="dw-card h-100"><div class="ro-h mt-0">Financiación</div><div class="mb-2">${finBadge(p)}</div>
          ${p.presupuesto ? `<div class="small mb-2">Presupuesto total <b>${C.money(p.presupuesto)}</b></div>` : ''}
          ${p.financiacion !== 'externa' ? barra('Aporte del club', p.gastado_caja_mayor, p.monto_caja_mayor || p.presupuesto, 'var(--dw-p)', '· Caja mayor') : ''}
          ${finan.map((a) => barra(`Aporte de ${esc(a.nombre)}`, a.aporte_recibido, a.aporte_comprometido, '#16a34a', '· alianza')).join('')}
          ${!finan.length && p.financiacion !== 'caja_mayor' ? barra(`Aporte externo${p.financiador ? ` · ${esc(p.financiador)}` : ''}`, 0, p.monto_externo, '#16a34a') : ''}
          ${me.canManage && d.movimientos.length ? `<div class="ro-h">Movimientos de la Caja mayor</div>${d.movimientos.slice(0, 8).map((x) => `<div class="d-flex gap-2 small py-1 border-bottom"><span class="text-body-secondary">${C.day(x.fecha)}</span><span class="flex-grow-1 text-truncate">${esc(x.concepto)}</span><b class="${x.tipo === 'egreso' ? 'text-danger' : 'text-success'}">${x.tipo === 'egreso' ? '−' : '+'}${C.money(x.monto)}</b></div>`).join('')}` : ''}</div></div></div>`,
      docs: () => `<div class="dw-card"><div class="d-flex gap-2 flex-wrap mb-2"><span class="ro-h m-0 flex-grow-1">Documentación del proyecto</span>${W ? '<button class="btn btn-sm btn-primary" data-dsubir><i class="bi bi-upload me-1"></i>Subir archivo</button><button class="btn btn-sm btn-outline-primary" data-denlace><i class="bi bi-link-45deg me-1"></i>Agregar enlace</button>' : ''}</div>
        ${d.docs.length ? `<div class="ro-docs">${d.docs.map((x) => `<div class="ro-doc"><i class="bi ${x.tipo === 'pdf' ? 'bi-file-earmark-pdf text-danger' : x.tipo === 'imagen' ? 'bi-file-earmark-image text-primary' : 'bi-link-45deg text-success'}"></i>
            <a class="flex-grow-1 min-w-0 text-truncate" href="/api/impacto/docs/${x.id}" target="_blank" rel="noopener">${esc(x.nombre)}</a><span class="small text-body-secondary">${C.day(new Date(x.created_at).toISOString())}</span>
            ${M ? `<button class="btn btn-sm btn-light" data-dborrar="${x.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div>`).join('')}</div>`
          : window.App.empty('bi-folder2-open', 'Sube aquí la propuesta, el presupuesto, actas, fotos o informes del proyecto.')}</div>`,
      comunidad: () => `<div class="row g-3"><div class="col-lg-5"><div class="dw-card h-100 ro-comu"><div class="ro-h mt-0">Comunidad que se impacta</div>
          ${p.comunidad ? `<div class="d-flex gap-2 align-items-center mb-2"><span class="ro-av" style="width:44px;height:44px;font-size:18px"><i class="bi bi-house-heart"></i></span><b class="fs-5">${esc(p.comunidad)}</b></div>
            ${p.comunidad_lugar ? `<div class="small"><i class="bi bi-geo-alt me-1"></i>${esc(p.comunidad_lugar)}</div>` : ''}${p.comunidad_contacto ? `<div class="small"><i class="bi bi-person-lines-fill me-1"></i>${esc(p.comunidad_contacto)}</div>` : ''}
            ${p.comunidad_descripcion ? `<p class="small mt-2 mb-0" style="white-space:pre-wrap">${esc(p.comunidad_descripcion)}</p>` : ''}`
            : `<p class="small text-body-secondary">Aún no dice a qué comunidad impacta (p. ej. <i>Fundación Jardín de Amor</i>).</p>${M ? '<button class="btn btn-sm btn-outline-primary" data-comu>Agregar comunidad</button>' : ''}`}
          <div class="ro-pstats mt-3"><span><b>${C.num(p.beneficiados_total)}</b>beneficiados</span><span><b>${d.beneficiarios.length}</b>registrados</span><span><b>${d.beneficiarios.filter((b) => b.autorizacion_datos).length}</b>con autorización</span></div></div></div>
        <div class="col-lg-7"><div class="dw-card h-100"><div class="d-flex align-items-center mb-2"><span class="ro-h m-0 flex-grow-1">Beneficiarios</span>${W ? '<button class="btn btn-sm btn-primary" data-bnuevo><i class="bi bi-plus-lg me-1"></i>Beneficiario</button>' : ''}</div>
          ${d.beneficiarios.length ? `<div class="ro-benef">${d.beneficiarios.map((b) => `<div class="ro-b"><span class="ro-av" style="width:32px;height:32px;font-size:12px">${esc(RO.initials(b.nombre))}</span><span class="min-w-0"><b class="d-block text-truncate small">${esc(b.nombre)}</b><span class="small text-body-secondary">${b.edad ? `${b.edad} años` : ''}${b.tipo ? `${b.edad ? ' · ' : ''}${esc(b.tipo)}` : ''}</span></span>${b.autorizacion_datos ? '<i class="bi bi-shield-check text-success ms-auto" title="Autorizó datos"></i>' : '<i class="bi bi-shield-x text-danger ms-auto" title="Sin autorización de datos"></i>'}</div>`).join('')}</div>`
            : '<p class="small text-body-secondary mb-0">Aún no hay beneficiarios registrados en este proyecto.</p>'}</div></div></div>`,
      alianzas: () => `<div class="d-flex mb-2"><span class="flex-grow-1"></span>${W ? '<button class="btn btn-sm btn-primary" data-anueva><i class="bi bi-plus-lg me-1"></i>Alianza</button>' : ''}</div>
        ${d.alianzas.length ? `<div class="ro-pgrid">${d.alianzas.map((a) => `<div class="dw-card"><div class="d-flex gap-2 align-items-start"><span class="ro-av" style="width:40px;height:40px;font-size:15px">${esc(RO.initials(a.nombre))}</span>
            <div class="flex-grow-1 min-w-0"><b class="d-block">${esc(a.nombre)}</b><span class="small text-body-secondary">${esc(a.tipo || '')}${a.contacto ? ` · ${esc(a.contacto)}` : ''}</span></div>${W ? `<button class="btn btn-sm btn-light" data-aed="${a.id}" aria-label="Editar"><i class="bi bi-pencil"></i></button>` : ''}</div>
            <div class="d-flex gap-1 flex-wrap my-2">${aporteChip(a)}${C.chip({ activa: 'ok', seguimiento: 'soon', prospecto: 'free', cerrada: 'free', descartada: 'bad' }[a.estado], a.estado)}</div>
            ${a.tipo_aporte === 'financiera' ? `${p.financiacion !== 'externa' ? barra('Club', p.gastado_caja_mayor, p.monto_caja_mayor || p.presupuesto, 'var(--dw-p)') : ''}${barra(esc(a.nombre), a.aporte_recibido, a.aporte_comprometido, '#16a34a')}` : a.descripcion ? `<p class="small mb-0">${esc(a.descripcion)}</p>` : ''}</div>`).join('')}</div>`
          : window.App.empty('bi-people', 'Este proyecto aún no tiene alianzas. Agrega las financieras, sociales o en especie.')}`,
    };
    view.innerHTML = `<div class="ro-phero" ${p.foto_url ? `style="--img:url('${esc(p.foto_url)}')"` : ''}><div class="ro-phero-in">
        <div class="d-flex gap-2 flex-wrap mb-1">${C.chip(...(EST[p.estado] || EST.propuesta))}${finBadge(p)}</div><h2 class="h3 mb-1">${esc(p.nombre)}</h2>
        <div class="small">${p.lider ? `<i class="bi bi-person me-1"></i>${esc(p.lider)} · ` : ''}${p.fecha_inicio ? `${C.day(p.fecha_inicio)}${p.fecha_fin ? ` → ${C.day(p.fecha_fin)}` : ''}` : 'Sin fechas'}${p.comunidad ? ` · <i class="bi bi-house-heart me-1"></i>${esc(p.comunidad)}` : ''}</div></div></div>
      <div class="d-flex gap-2 flex-wrap my-3" data-secs>${SEC.map(([k, l, ic]) => `<button type="button" class="btn btn-sm rounded-pill ${k === sec ? 'btn-primary' : 'btn-light'}" data-sec="${k}"><i class="bi ${ic} me-1"></i>${l}</button>`).join('')}</div>
      <div data-cuerpo>${cuerpo[sec]()}</div>`;
    void hoy;
    const proys = rows.length ? rows : await RO.proyectos();
    const nuevaA = async (a) => { const out = await C.form({ title: a ? 'Editar alianza' : 'Nueva alianza del proyecto', fields: camposA(proys), values: a || { proyecto_id: p.id, estado: 'activa', tipo_aporte: 'financiera' } });
      if (!out) return; try { await api(a ? `/api/impacto/alianzas/${a.id}` : '/api/impacto/alianzas', { method: a ? 'PATCH' : 'POST', body: out }); toast('Alianza guardada'); abrir(p.id); } catch (x) { toast(x.message, false); } };
    view.onclick = async (e) => {
      const b = e.target.closest('[data-sec]'); if (b) { sec = b.dataset.sec; view.querySelectorAll('[data-sec]').forEach((x) => x.className = `btn btn-sm rounded-pill ${x === b ? 'btn-primary' : 'btn-light'}`); view.querySelector('[data-cuerpo]').innerHTML = cuerpo[sec](); return; }
      if (e.target.closest('[data-dsubir]')) { const f = await RO.elegirArchivo(); if (!f) return; try { await RO.subir(`/api/impacto/proyectos/${p.id}/docs`, f); toast('Documento subido'); abrir(p.id); } catch (x) { toast(x.message, false); } return; }
      if (e.target.closest('[data-denlace]')) { const out = await C.form({ title: 'Agregar enlace', fields: [{ k: 'nombre', label: 'Nombre', type: 'text', required: true, full: true }, { k: 'url', label: 'Enlace (https)', type: 'url', required: true, full: true }] }); if (!out) return; try { await api(`/api/impacto/proyectos/${p.id}/docs`, { method: 'POST', body: out }); toast('Enlace agregado'); abrir(p.id); } catch (x) { toast(x.message, false); } return; }
      const db = e.target.closest('[data-dborrar]'); if (db) { if (!(await window.App.confirm({ title: '¿Borrar este documento?', ok: 'Borrar' }))) return; try { await api(`/api/impacto/docs/${db.dataset.dborrar}`, { method: 'DELETE' }); abrir(p.id); } catch (x) { toast(x.message, false); } return; }
      if (e.target.closest('[data-comu]')) return editarP(p);
      if (e.target.closest('[data-anueva]')) return nuevaA(null);
      const ae = e.target.closest('[data-aed]'); if (ae) return nuevaA(d.alianzas.find((a) => String(a.id) === ae.dataset.aed));
      if (e.target.closest('[data-bnuevo]')) { const out = await C.form({ title: 'Nuevo beneficiario', fields: [{ k: 'nombre', label: 'Nombre', type: 'text', required: true }, { k: 'tipo', label: 'Tipo', type: 'text', placeholder: 'niño, adulto mayor…' }, { k: 'edad', label: 'Edad', type: 'int' },
          { k: 'autorizacion_datos', label: 'Datos', type: 'bool', check: 'Autorizó el uso de datos' }, { k: 'autorizacion_imagen', label: 'Imagen', type: 'bool', check: 'Autorizó el uso de imagen' }] });
        if (!out) return; try { await api('/api/impacto/beneficiarios', { method: 'POST', body: { ...out, proyecto_id: p.id } }); toast('Beneficiario agregado'); abrir(p.id); } catch (x) { toast(x.message, false); } }
    };
  }

  async function cargar() {
    acciones.innerHTML = ''; view.onclick = null;
    if (tab === 'proyectos') {
      if (M) { acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo proyecto</button>'; acciones.querySelector('[data-nuevo]').onclick = () => editarP(null); }
      rows = (await api('/api/impacto/tarjetas')).rows;
      view.onclick = (e) => { const c = e.target.closest('[data-p]'); if (c) abrir(c.dataset.p); };
      view.innerHTML = rows.length ? `<div class="ro-pgrid">${rows.map(tarjeta).join('')}</div>` : window.App.empty('bi-globe-americas', 'Aún no hay proyectos de servicio.');
      return;
    }
    const proys = await RO.proyectos(true);
    if (tab === 'alianzas') {
      return C.table({ el: view, base: '/api/impacto', entity: 'alianzas', title: 'alianza', newText: 'Nueva alianza', readOnly: !W, emptyIcon: 'bi-building', empty: 'Aún no hay alianzas.',
        filters: [{ k: 'estado', options: [['', 'Todas'], ['prospecto', 'Prospecto'], ['seguimiento', 'Seguimiento'], ['activa', 'Activa'], ['cerrada', 'Cerrada'], ['descartada', 'Descartada']] }],
        fields: camposA(proys),
        columns: [{ label: 'Entidad', main: true, html: (a) => `${esc(a.nombre)}<div class="small text-body-secondary fw-normal">${esc(a.tipo || '')}${a.municipio ? ` · ${esc(a.municipio)}` : ''}</div>` },
          { label: 'Aporte', html: (a) => `${aporteChip(a)}${a.tipo_aporte === 'financiera' && a.aporte_comprometido ? `<div class="small text-body-secondary">${C.money(a.aporte_recibido)} de ${C.money(a.aporte_comprometido)}</div>` : ''}` }, { label: 'Estado', html: (a) => C.chip({ activa: 'ok', seguimiento: 'soon', prospecto: 'free', cerrada: 'free', descartada: 'bad' }[a.estado], a.estado) },
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
    .ro-phero{position:relative;border-radius:18px;overflow:hidden;min-height:150px;display:flex;align-items:flex-end;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.6)),var(--img,linear-gradient(135deg,var(--dw-p),color-mix(in srgb,var(--dw-p) 50%,#000))) center/cover;color:#fff}.ro-phero-in{padding:18px}
    .ro-docs{display:grid;gap:6px}.ro-doc{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid var(--bs-border-color)}.ro-doc .bi{font-size:1.3rem}
    .ro-benef{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));max-height:420px;overflow:auto}.ro-b{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:10px;background:rgba(var(--dw-p-rgb),.04)}
    .ro-fin{display:inline-flex;gap:6px;align-items:center;font-size:.78rem;font-weight:600;color:var(--f);background:color-mix(in srgb,var(--f) 14%,transparent);border-radius:999px;padding:3px 10px}</style>`);
  RO.nav(tab, (k) => { tab = k; abierto = null; cargar(); });
  const ini = /^#p=(\d+)$/.exec(location.hash);
  if (ini) { rows = (await api('/api/impacto/tarjetas')).rows; await abrir(ini[1]); } else await cargar();
});
