// Impacto: pestañas Proyectos · Alianzas · Comunidades.
//  - Proyecto (#p=<id>): Resumen (financiación por aportes: del club o de una alianza, con cuánto ayuda y cuánto llegó),
//    Documentación (documentos escritos en el editor con tablas, archivos y enlaces), Comunidad (se elige del directorio y
//    trae todos sus beneficiarios) y Alianzas (las que aportan al proyecto).
//  - Comunidad (#c=<id>): sus datos, los proyectos que la impactan y sus beneficiarios.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud, RO = window.RO, D = window.RODoc;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const M = me.canManage && !me.business.readOnly, W = !me.business.readOnly;
  const EST = { propuesta: ['free', 'Propuesta'], planeacion: ['soon', 'Planeación'], en_curso: ['ok', 'En curso'], finalizado: ['ok', 'Finalizado'], cancelado: ['bad', 'Cancelado'] };
  const FIN = { caja_mayor: ['bi-safe2', 'Caja mayor', '#0ea5e9'], externa: ['bi-building', 'Financiación externa', '#8b5cf6'], doble: ['bi-intersect', 'Doble financiación', '#f59e0b'] };
  const APORTE = { financiera: ['bi-cash-coin', 'Financiera', '#16a34a'], social: ['bi-people', 'Social', '#0284c7'], especie: ['bi-box-seam', 'En especie', '#d97706'], academica: ['bi-mortarboard', 'Académica', '#7c3aed'], difusion: ['bi-megaphone', 'Difusión', '#db2777'], otra: ['bi-three-dots', 'Otra', '#64748b'] };
  const EST_A = [['prospecto', 'Prospecto'], ['seguimiento', 'Seguimiento'], ['activa', 'Activa'], ['cerrada', 'Cerrada'], ['descartada', 'Descartada']];
  const toneA = (e) => ({ activa: 'ok', seguimiento: 'soon', prospecto: 'free', cerrada: 'free', descartada: 'bad' }[e]);
  const socios = await RO.socios();
  const hash0 = location.hash.slice(1);
  let tab = hash0 === 'alianzas' ? 'alianzas' : (['comunidades', 'beneficiarios'].includes(hash0) || hash0.startsWith('c=')) ? 'comunidades' : 'proyectos', rows = [];
  const comunidades = async () => (await api('/api/impacto/comunidades?limit=1000')).rows;
  const alianzas = async () => (await api('/api/impacto/alianzas?limit=1000')).rows;
  const ir = (h) => history.replaceState(null, '', h ? `#${h}` : location.pathname);

  /* ---------- formularios ---------- */
  const camposA = [{ k: 'nombre', label: 'Entidad', type: 'text', required: true }, { k: 'tipo', label: 'Tipo de entidad', type: 'text', placeholder: 'fundación, empresa, alcaldía…' },
    { k: 'tipo_aporte', label: 'Aporte habitual', type: 'select', options: [['', '—'], ...Object.entries(APORTE).map(([k, [, l]]) => [k, l])] }, { k: 'estado', label: 'Estado', type: 'select', options: EST_A },
    { k: 'contacto', label: 'Contacto', type: 'text' }, { k: 'telefono', label: 'Teléfono', type: 'text' }, { k: 'correo', label: 'Correo', type: 'email' }, { k: 'municipio', label: 'Municipio', type: 'text' },
    { k: 'proximo_paso', label: 'Próximo paso', type: 'text' }, { k: 'proximo_paso_fecha', label: 'Fecha del próximo paso', type: 'date' }, { k: 'descripcion', label: 'Notas', type: 'long' }];
  const camposC = [{ k: 'nombre', label: 'Nombre de la comunidad', type: 'text', required: true, full: true, placeholder: 'p. ej. Fundación Jardín de Amor' }, { k: 'tipo', label: 'Tipo', type: 'text', placeholder: 'fundación, barrio, colegio, hogar…' },
    { k: 'lugar', label: 'Lugar', type: 'text' }, { k: 'contacto', label: 'Contacto', type: 'text' }, { k: 'telefono', label: 'Teléfono', type: 'text' },
    { k: 'foto_url', label: 'Foto (enlace https)', type: 'url', full: true }, { k: 'descripcion', label: 'Sobre la comunidad', type: 'long' }];
  const camposB = (proys) => [{ k: 'nombre', label: 'Nombre', type: 'text', required: true }, { k: 'tipo', label: 'Tipo', type: 'text', placeholder: 'niño, adulto mayor…' }, { k: 'edad', label: 'Edad', type: 'int' },
    ...(proys ? [{ k: 'proyecto_id', label: 'Proyecto (opcional)', type: 'select', options: RO.opts(proys, 'Ninguno en particular') }] : []),
    { k: 'autorizacion_datos', label: 'Datos', type: 'bool', check: 'Autorizó el uso de datos' }, { k: 'autorizacion_imagen', label: 'Imagen', type: 'bool', check: 'Autorizó el uso de imagen' }, { k: 'notas', label: 'Notas', type: 'long' }];
  const camposP = (comus) => [{ k: 'nombre', label: 'Nombre del proyecto', type: 'text', required: true, full: true }, { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(EST).map(([k, [, l]]) => [k, l]) },
    { k: 'socio_lider_id', label: 'Líder', type: 'select', options: RO.opts(socios.filter((s) => s.estado === 'activo'), 'Sin líder') },
    { k: 'fecha_inicio', label: 'Inicio', type: 'date' }, { k: 'fecha_fin', label: 'Fin', type: 'date' },
    { k: 'comunidad_id', label: 'Comunidad que se impacta', type: 'select', options: RO.opts(comus, 'Sin comunidad'), hint: 'créalas en la pestaña Comunidades' },
    { k: 'presupuesto', label: 'Presupuesto total', type: 'money', hint: 'los aportes se agregan en el Resumen' },
    { k: 'beneficiados', label: 'Personas beneficiadas', type: 'int', hint: 'si no están todas registradas' }, { k: 'horas_servicio', label: 'Horas de servicio', type: 'int' },
    { k: 'foto_url', label: 'Foto (enlace https)', type: 'url', full: true }, { k: 'descripcion', label: 'Descripción', type: 'long' }, { k: 'objetivo', label: 'Objetivo', type: 'long' }];

  async function editarP(p) {
    const out = await C.form({ title: p ? 'Editar proyecto' : 'Nuevo proyecto', fields: camposP(await comunidades()), values: p ? { ...p } : { estado: 'propuesta' }, onDelete: p ? () => api(`/api/impacto/proyectos/${p.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Proyecto borrado'); abierto = null; ir(); return cargar(); }
    if (!out) return;
    try { const r = await api(p ? `/api/impacto/proyectos/${p.id}` : '/api/impacto/proyectos', { method: p ? 'PATCH' : 'POST', body: out }); toast('Guardado'); abierto ? abrir(abierto) : p ? cargar() : abrir(r.id); } catch (x) { toast(x.message, false); }
  }
  async function editarC(cm, despues) {
    const out = await C.form({ title: cm ? 'Editar comunidad' : 'Nueva comunidad', fields: camposC, values: cm ? { ...cm } : {}, onDelete: cm ? () => api(`/api/impacto/comunidades/${cm.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Comunidad borrada'); ir('comunidades'); return cargar(); }
    if (!out) return null;
    try { const r = await api(cm ? `/api/impacto/comunidades/${cm.id}` : '/api/impacto/comunidades', { method: cm ? 'PATCH' : 'POST', body: out }); toast('Comunidad guardada'); return despues ? despues(cm ? cm.id : r.id) : r.id; } catch (x) { toast(x.message, false); return null; }
  }
  async function nuevaAlianza() {
    const out = await C.form({ title: 'Nueva alianza', fields: camposA, values: { estado: 'activa', tipo_aporte: 'financiera' } });
    if (!out) return null;
    try { const r = await api('/api/impacto/alianzas', { method: 'POST', body: out }); toast('Alianza creada'); return r.id; } catch (x) { toast(x.message, false); return null; }
  }

  // Aporte al proyecto: botón «Del club» o «De una alianza» (se elige cuál) y en cuánto nos va a ayudar.
  async function editarAporte(p, a, origen0) {
    let als = await alianzas();
    const v = a || { origen: origen0 || 'club', tipo_aporte: 'financiera', monto: '', recibido: '' };
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">${a ? 'Editar aporte' : 'Nuevo aporte'}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-3">
        <div><div class="form-label small mb-1">¿De dónde sale?</div><div class="btn-group w-100" role="group">
          <input type="radio" class="btn-check" name="origen" id="ap-club" value="club" ${v.origen === 'club' ? 'checked' : ''}><label class="btn btn-outline-primary" for="ap-club"><i class="bi bi-safe2 me-1"></i>Del club</label>
          <input type="radio" class="btn-check" name="origen" id="ap-ali" value="alianza" ${v.origen === 'alianza' ? 'checked' : ''}><label class="btn btn-outline-primary" for="ap-ali"><i class="bi bi-building me-1"></i>De una alianza</label></div>
          <div class="form-text" data-ayuda></div></div>
        <div data-ali><label class="form-label small mb-1">Alianza</label><div class="d-flex gap-2"><select class="form-select" name="alianza_id" data-sel></select><button type="button" class="btn btn-outline-secondary text-nowrap" data-nueva><i class="bi bi-plus-lg"></i> Nueva</button></div></div>
        <div data-caja><label class="form-label small mb-1">¿De qué caja sale?</label><select class="form-select" name="caja"><option value="mayor" ${v.caja !== 'menor' ? 'selected' : ''}>Caja mayor (Obras)</option><option value="menor" ${v.caja === 'menor' ? 'selected' : ''}>Caja menor (Club)</option></select></div>
        <div class="row g-2"><div class="col-sm-6" data-tipo><label class="form-label small mb-1">Tipo de aporte</label><select class="form-select" name="tipo_aporte">${Object.entries(APORTE).map(([k, [, l]]) => `<option value="${k}" ${v.tipo_aporte === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="col-sm-6"><label class="form-label small mb-1">¿En cuánto nos va a ayudar?</label><input class="form-control" name="monto" type="number" min="0" step="1" inputmode="numeric" value="${v.monto ?? ''}" placeholder="$"></div>
</div><div class="form-text mt-n2">Lo recibido o gastado se lleva con los soportes (recibos, cuentas de cobro…) en Financiadores.</div>
        <div><label class="form-label small mb-1">Notas</label><textarea class="form-control" name="notas" rows="2" placeholder="qué cubre, condiciones, fechas…">${esc(v.notas || '')}</textarea></div>
      </div><div class="modal-footer justify-content-between"><span>${a ? '<button type="button" class="btn btn-outline-danger btn-sm" data-del><i class="bi bi-trash me-1"></i>Quitar</button>' : ''}</span>
        <span><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button> <button class="btn btn-primary">Guardar aporte</button></span></div></form>`);
    const f = el.querySelector('form'), sel = el.querySelector('[data-sel]');
    const pintarSel = (id) => { sel.innerHTML = `<option value="">Elige la alianza…</option>${als.filter((x) => x.estado !== 'descartada' || x.id === id).map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}`; };
    const toggle = () => {
      const club = f.origen.value === 'club';
      el.querySelector('[data-ali]').hidden = club; el.querySelector('[data-caja]').hidden = !club; el.querySelector('[data-tipo]').hidden = club;
      if (club) f.tipo_aporte.value = 'financiera';
      el.querySelector('[data-ayuda]').textContent = club ? 'Cada gasto que registres sale de esa caja y aparece en Finanzas con el nombre del proyecto.' : 'Una entidad aliada que ayuda al proyecto.';
    };
    pintarSel(v.alianza_id); toggle();
    f.querySelectorAll('[name=origen]').forEach((x) => x.addEventListener('change', toggle));
    el.querySelector('[data-nueva]').onclick = async () => { m.hide(); const id = await nuevaAlianza(); if (id) editarAporte(p, a ? { ...a, origen: 'alianza', alianza_id: id } : { ...v, origen: 'alianza', alianza_id: id }); };
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await window.App.confirm({ title: '¿Quitar este aporte del proyecto?', ok: 'Quitar' }))) return;
      try { await api(`/api/impacto/aportes/${a.id}`, { method: 'DELETE' }); m.hide(); toast('Aporte quitado'); abrir(p.id); } catch (x) { toast(x.message, false); }
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const club = f.origen.value === 'club';
      const body = { proyecto_id: p.id, origen: f.origen.value, alianza_id: club ? null : Number(sel.value) || null, caja: club ? f.caja.value : null, tipo_aporte: club ? 'financiera' : f.tipo_aporte.value,
        monto: Number(f.monto.value) || 0, notas: f.notas.value.trim() };
      if (body.origen === 'alianza' && !body.alianza_id) { toast('Elige la alianza o crea una nueva', false); return; }
      try { await api(a ? `/api/impacto/aportes/${a.id}` : '/api/impacto/aportes', { method: a ? 'PATCH' : 'POST', body }); m.hide(); toast('Aporte guardado'); abrir(p.id); } catch (x) { toast(x.message, false); }
    };
  }

  /* ---------- piezas ---------- */
  const finBadge = (p) => { const [ic, l, col] = FIN[p.financiacion] || FIN.caja_mayor; return `<span class="ro-fin" style="--f:${col}"><i class="bi ${ic}"></i>${l}</span>`; };
  const aporteChip = (t) => { const [ic, l, col] = APORTE[t] || APORTE.otra; return `<span class="ro-fin" style="--f:${col}"><i class="bi ${ic}"></i>${t ? l : 'Sin tipo'}</span>`; };
  const tarjeta = (p) => `<button type="button" class="ro-pcard" data-p="${p.id}">
      <div class="ro-pimg" ${p.foto_url ? `style="background-image:url('${esc(p.foto_url)}')"` : ''}>${p.foto_url ? '' : '<i class="bi bi-globe-americas"></i>'}<span class="ro-pest">${C.chip(...(EST[p.estado] || EST.propuesta))}</span></div>
      <div class="p-3 d-grid gap-2"><b class="fs-6">${esc(p.nombre)}</b>
        <div class="d-grid gap-1 small"><span><i class="bi bi-person-badge me-1"></i>Responsable: ${p.lider ? `<b>${esc(p.lider)}</b>` : '<span class="text-body-secondary">sin asignar</span>'}</span>
          <span class="text-body-secondary"><i class="bi bi-house-heart me-1"></i>${(p.comunidades || []).length ? esc(p.comunidades.join(' · ')) : 'Sin comunidad'}</span></div>
        <div class="ro-pstats"><span><b>${C.num(p.beneficiados_total)}</b>beneficiados</span><span><b>${p.tareas_hechas}/${p.tareas}</b>tareas</span><span><b>${p.alianzas}</b>alianzas</span></div>
        ${p.tareas ? C.meter(p.tareas_hechas, p.tareas) : ''}
        <div>${finBadge(p)}</div>
        <div class="small text-body-secondary">${p.monto_caja_mayor ? `Club: <b>${C.money(p.monto_caja_mayor)}</b>${p.gastado_caja_mayor ? ` · gastado ${C.money(p.gastado_caja_mayor)}` : ''}` : ''}${p.monto_caja_mayor && p.monto_externo ? '<br>' : ''}${p.monto_externo ? `Alianzas: <b>${C.money(p.monto_externo)}</b>${p.financiador ? ` · ${esc(p.financiador)}` : ''}` : ''}</div>
      </div></button>`;
  const barra = (titulo, v, meta, color, sub = '', extra = '') => `<div class="mb-2"><div class="d-flex justify-content-between gap-2 small"><span class="min-w-0"><b>${titulo}</b>${sub ? ` <span class="text-body-secondary">${sub}</span>` : ''}${extra}</span><span class="text-nowrap">${C.money(v)} <span class="text-body-secondary">de ${C.money(meta)}</span></span></div>
    <div class="progress" style="height:10px"><div class="progress-bar" style="width:${meta ? Math.min(100, Math.round((v / meta) * 100)) : 0}%;background:${color}"></div></div></div>`;
  const benefLista = (bs) => (bs.length ? `<div class="ro-benef">${bs.map((b) => `<div class="ro-b"><span class="ro-av" style="width:32px;height:32px;font-size:12px">${esc(RO.initials(b.nombre))}</span><span class="min-w-0"><b class="d-block text-truncate small">${esc(b.nombre)}</b><span class="small text-body-secondary">${b.edad ? `${b.edad} años` : ''}${b.tipo ? `${b.edad ? ' · ' : ''}${esc(b.tipo)}` : ''}</span></span>${b.autorizacion_datos ? '<i class="bi bi-shield-check text-success ms-auto" title="Autorizó datos"></i>' : '<i class="bi bi-shield-x text-danger ms-auto" title="Sin autorización de datos"></i>'}</div>`).join('')}</div>` : '');

  /* ---------- documentos ---------- */
  const editor = D.editor({ puedeBorrar: M });
  async function verDoc(id, p) {
    let d; try { d = await api(`/api/impacto/docs/${id}`); } catch (x) { toast(x.message, false); return; }
    const { el, m } = modal(`<div class="modal-header"><h2 class="modal-title h5 text-truncate">${esc(d.nombre)}</h2><span class="ms-auto d-flex gap-2">${W ? '<button class="btn btn-sm btn-outline-primary" data-editar><i class="bi bi-pencil me-1"></i>Editar</button>' : ''}<button class="btn btn-sm btn-light" data-imprimir><i class="bi bi-printer"></i></button><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></span></div>
      <div class="modal-body doc-fondo"><div class="doc-papel" style="min-height:0">${D.html(d.bloques)}</div></div>`, { size: 'modal-xl' });
    el.addEventListener('click', (e) => D.click(e, (k) => d.bloques[k]));
    el.querySelector('[data-editar]')?.addEventListener('click', () => { m.hide(); abrirEditor(d, p); });
    el.querySelector('[data-imprimir]').onclick = () => { const w = window.open('', '_blank'); if (!w) return; w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(d.nombre)}</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><link href="/css/doc.css" rel="stylesheet"><body class="p-4"><h1 class="h3">${esc(d.nombre)}</h1>${D.html(d.bloques)}<script>setTimeout(()=>print(),600)<\/script>`); w.document.close(); };
  }
  const abrirEditor = (d, p) => editor(d, {
    guardar: (body) => api(d ? `/api/impacto/docs/${d.id}` : `/api/impacto/proyectos/${p.id}/docs`, { method: d ? 'PATCH' : 'POST', body }),
    borrar: () => api(`/api/impacto/docs/${d.id}`, { method: 'DELETE' }),
    alCambiar: () => { sec = 'docs'; abrir(p.id); },
  });

  /* ---------- soportes de un financiador (recibos, cuentas de cobro…) ---------- */
  const FORMAS = { recibo: 'Recibo de caja', cuenta_cobro: 'Cuenta de cobro', factura: 'Factura', transferencia: 'Transferencia', efectivo: 'Efectivo', otro: 'Otro' };
  let cats = null;
  const itemsDe = (x) => { try { return JSON.parse(x.items || '[]') || []; } catch { return []; } };
  const getCats = async () => { if (!cats) cats = await api('/api/cajas/categorias').then((x) => x.categorias).catch(() => ({})); return cats; };
  // Ver un comprobante sin salir de la página (imagen o PDF)
  function verArchivo(url, titulo, mime = '') {
    const img = /^image\//.test(mime);
    modal(`<div class="modal-header"><h2 class="modal-title h6 text-truncate">${esc(titulo)}</h2><a class="btn btn-sm btn-outline-secondary ms-auto me-2" href="${url}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right me-1"></i>Abrir</a><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body p-0 bg-body-tertiary">${img ? `<img src="${url}" class="img-fluid d-block mx-auto" alt="${esc(titulo)}">` : `<iframe src="${url}" title="${esc(titulo)}" style="width:100%;height:75vh;border:0;display:block"></iframe>`}</div>`, { size: 'modal-xl' });
  }
  // Crear o editar un comprobante con varios ítems (descripción, cantidad, valor) y su archivo
  async function editarSoporte(d, aporteId, x, alGuardar) {
    const a = d.aportes.find((y) => y.id === aporteId), p = d.proyecto; if (!a) return;
    const club = a.origen === 'club', caja = a.caja === 'menor' ? 'menor' : 'mayor';
    const opCat = club ? ((await getCats())?.[caja]?.egreso || []) : [];
    let items = x ? itemsDe(x) : [];
    if (!items.length) items = [{ descripcion: '', cantidad: 1, valor: x ? x.monto : '' }];
    const { el, m } = modal(`<form><div class="modal-header"><h2 class="modal-title h5">${x ? 'Editar comprobante' : 'Nuevo comprobante'} · ${esc(club ? `Club (${caja === 'menor' ? 'Caja menor' : 'Caja mayor'})` : a.nombre || 'Alianza')}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-3">
        <div class="row g-2"><div class="col-sm-4"><label class="form-label small mb-1">Fecha</label><input class="form-control" type="date" name="fecha" required value="${x?.fecha || C.todayCo()}"></div>
          <div class="col-sm-4"><label class="form-label small mb-1">Comprobante</label><select class="form-select" name="forma">${Object.entries(FORMAS).map(([k, l]) => `<option value="${k}" ${(x?.forma || 'recibo') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          ${opCat.length ? `<div class="col-sm-4"><label class="form-label small mb-1">Categoría en Finanzas</label><select class="form-select" name="categoria">${opCat.map((c) => `<option ${(x?.categoria || 'Otros gastos') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>` : ''}
          <div class="col-12"><label class="form-label small mb-1">Concepto</label><input class="form-control" name="notas" value="${esc(x?.notas || '')}" placeholder="${club ? 'p. ej. compras para la jornada' : 'p. ej. primer giro'}"></div></div>
        <div><div class="d-flex align-items-center mb-1"><b class="small flex-grow-1">Ítems del comprobante</b><button type="button" class="btn btn-sm btn-outline-primary" data-mas><i class="bi bi-plus-lg me-1"></i>Ítem</button></div>
          <div class="table-responsive"><table class="table table-sm align-middle mb-0 ro-items"><thead><tr><th>Descripción</th><th style="width:90px">Cant.</th><th style="width:150px">Valor unitario</th><th class="text-end" style="width:130px">Subtotal</th><th style="width:40px"></th></tr></thead><tbody data-items></tbody>
            <tfoot><tr><th colspan="3" class="text-end">Total</th><th class="text-end" data-total></th><th></th></tr></tfoot></table></div></div>
        <div><label class="form-label small mb-1">Archivo del comprobante (foto o PDF)</label>
          ${x?.archivo ? `<div class="d-flex gap-2 align-items-center mb-1 small"><i class="bi bi-file-earmark-check text-success"></i><a href="#" data-verarch>Ver el archivo actual</a><span class="text-body-secondary">· sube otro para reemplazarlo</span></div>` : ''}
          <input class="form-control" type="file" name="archivo" accept="image/png,image/jpeg,image/webp,application/pdf"></div>
        ${club ? `<div class="form-text mt-0">Queda como egreso de la ${caja === 'menor' ? 'Caja menor' : 'Caja mayor'} en Finanzas, con el nombre del proyecto «${esc(p.nombre)}».</div>` : ''}
      </div><div class="modal-footer"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Guardar comprobante</button></div></form>`, { size: 'modal-lg' });
    const f = el.querySelector('form'), tb = el.querySelector('[data-items]');
    const total = () => items.reduce((t, it) => t + (Number(it.cantidad) || 0) * (Number(it.valor) || 0), 0);
    const pintarTotal = () => { el.querySelector('[data-total]').textContent = C.money(total()); tb.querySelectorAll('[data-sub]').forEach((td) => { const it = items[+td.dataset.sub]; td.textContent = C.money((Number(it.cantidad) || 0) * (Number(it.valor) || 0)); }); };
    const pintar = () => {
      tb.innerHTML = items.map((it, k) => `<tr><td><input class="form-control form-control-sm" data-k="${k}" data-c="descripcion" value="${esc(it.descripcion || '')}" placeholder="p. ej. Pintura galón"></td>
        <td><input class="form-control form-control-sm" type="number" min="0" step="any" data-k="${k}" data-c="cantidad" value="${it.cantidad ?? 1}"></td>
        <td><input class="form-control form-control-sm" type="number" min="0" step="1" inputmode="numeric" data-k="${k}" data-c="valor" value="${it.valor ?? ''}" placeholder="$"></td>
        <td class="text-end small" data-sub="${k}"></td><td>${items.length > 1 ? `<button type="button" class="btn btn-sm btn-light" data-quitar="${k}" aria-label="Quitar ítem"><i class="bi bi-x-lg"></i></button>` : ''}</td></tr>`).join('');
      pintarTotal();
    };
    pintar();
    tb.addEventListener('input', (e) => { const t = e.target; if (t.dataset.k == null) return; items[+t.dataset.k][t.dataset.c] = t.value; pintarTotal(); });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-mas]')) { items.push({ descripcion: '', cantidad: 1, valor: '' }); pintar(); tb.querySelector('tr:last-child input')?.focus(); return; }
      const q = e.target.closest('[data-quitar]'); if (q) { items.splice(+q.dataset.quitar, 1); pintar(); return; }
      if (e.target.closest('[data-verarch]')) { e.preventDefault(); verArchivo(`/api/impacto/soportes/${x.id}/archivo`, 'Comprobante', x.mime); }
    });
    f.onsubmit = async (e) => {
      e.preventDefault();
      const limpios = items.map((it) => ({ descripcion: String(it.descripcion || '').trim(), cantidad: Number(it.cantidad) || 1, valor: Math.round(Number(it.valor) || 0) })).filter((it) => it.descripcion || it.valor);
      if (!limpios.length || !(total() > 0)) { toast('Escribe al menos un ítem con su valor', false); return; }
      const body = { fecha: f.fecha.value, forma: f.forma.value, categoria: f.categoria?.value, notas: f.notas.value.trim(), items: limpios };
      const file = f.archivo.files[0];
      try {
        const r = await api(x ? `/api/impacto/soportes/${x.id}` : `/api/impacto/aportes/${aporteId}/soportes`, { method: x ? 'PATCH' : 'POST', body });
        if (file) await RO.subir(`/api/impacto/soportes/${x ? x.id : r.id}/archivo`, file).catch((er) => toast(`Quedó guardado, pero el archivo no subió: ${er.message}`, false));
        m.hide(); toast(club && !x ? 'Comprobante guardado y enviado a Finanzas' : 'Comprobante guardado'); alGuardar?.();
      } catch (er) { toast(er.message, false); }
    };
  }
  const borrarSoporte = async (x, club, despues) => {
    if (!(await window.App.confirm({ title: '¿Borrar este comprobante?', text: club ? 'También se borra el egreso que creó en Finanzas.' : '', ok: 'Borrar' }))) return;
    try { await api(`/api/impacto/soportes/${x.id}`, { method: 'DELETE' }); toast('Comprobante borrado'); despues(); } catch (er) { toast(er.message, false); }
  };
  const itemsHtml = (x) => { const it = itemsDe(x); return it.length > 1 || (it.length === 1 && it[0].descripcion) ? `<div class="small text-body-secondary">${it.map((i) => `${i.cantidad !== 1 ? `${i.cantidad} × ` : ''}${esc(i.descripcion || 'ítem')} · ${C.money(i.cantidad * i.valor)}`).join('<br>')}</div>` : ''; };
  // Comprobantes de un financiador
  async function soportes(d, aporteId) {
    const a = d.aportes.find((x) => x.id === aporteId), p = d.proyecto; if (!a) return;
    const club = a.origen === 'club', caja = a.caja === 'menor' ? 'menor' : 'mayor', lista = d.soportes.filter((x) => x.aporte_id === aporteId);
    const { el, m } = modal(`<div class="modal-header"><h2 class="modal-title h5">Comprobantes · ${club ? `Club (${caja === 'menor' ? 'Caja menor' : 'Caja mayor'})` : esc(a.nombre || 'Alianza')}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">
        ${barra(club ? 'Gastado' : 'Recibido', a.recibido, a.monto, club ? 'var(--dw-p)' : '#16a34a')}
        ${M ? '<div class="text-end mb-2"><button class="btn btn-sm btn-primary" data-snuevo><i class="bi bi-plus-lg me-1"></i>Nuevo comprobante</button></div>' : ''}
        ${lista.length ? `<div class="ro-docs">${lista.map((x) => `<div class="ro-doc align-items-start"><i class="bi ${x.archivo ? 'bi-file-earmark-check text-success' : 'bi-file-earmark text-body-secondary'}"></i>
            <span class="flex-grow-1 min-w-0"><b class="small d-block">${FORMAS[x.forma] || x.forma} · ${C.money(x.monto)}</b><span class="small text-body-secondary">${C.day(x.fecha)}${x.notas ? ` · ${esc(x.notas)}` : ''}${x.movimiento_id ? ' · en Finanzas' : ''}</span>${itemsHtml(x)}</span>
            ${x.archivo ? `<button class="btn btn-sm btn-light" data-sver="${x.id}" title="Ver comprobante"><i class="bi bi-eye"></i></button>` : '<span class="badge text-bg-warning">sin archivo</span>'}
            ${M ? `<button class="btn btn-sm btn-light" data-sed="${x.id}" title="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light" data-sborrar="${x.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div>`).join('')}</div>`
          : '<p class="small text-body-secondary mb-0">Aún no hay comprobantes registrados.</p>'}
      </div>`, { size: 'modal-lg' });
    const volver = async () => { await abrir(p.id); if (ultimo) soportes(ultimo, aporteId); };
    el.addEventListener('click', async (e) => {
      const id = (k) => lista.find((x) => String(x.id) === e.target.closest(`[${k}]`)?.getAttribute(k));
      if (e.target.closest('[data-snuevo]')) { m.hide(); return editarSoporte(d, aporteId, null, volver); }
      const v = id('data-sver'); if (v) return verArchivo(`/api/impacto/soportes/${v.id}/archivo`, `${FORMAS[v.forma] || 'Comprobante'} · ${C.money(v.monto)}`, v.mime);
      const ed = id('data-sed'); if (ed) { m.hide(); return editarSoporte(d, aporteId, ed, volver); }
      const del = id('data-sborrar'); if (del) { m.hide(); return borrarSoporte(del, club, volver); }
    });
  }
  // Movimiento registrado directo en Finanzas (cajas) con este proyecto
  async function editarMovDirecto(mv, p) {
    const cs = (await getCats())?.[mv.caja]?.[mv.tipo] || [];
    const out = await C.form({ title: 'Editar movimiento (Finanzas)', fields: [{ k: 'fecha', label: 'Fecha', type: 'date', required: true }, { k: 'monto', label: 'Valor', type: 'money', required: true },
      { k: 'concepto', label: 'Concepto', type: 'text', required: true, full: true }, ...(cs.length ? [{ k: 'categoria', label: 'Categoría', type: 'select', options: cs.map((c) => [c, c]) }] : []), { k: 'observaciones', label: 'Observaciones', type: 'long' }],
      values: { ...mv } });
    if (!out) return;
    try { await api(`/api/cajas/movimientos/${mv.id}`, { method: 'PATCH', body: out }); toast('Movimiento guardado'); abrir(p.id); } catch (er) { toast(er.message, false); }
  }

  /* ---------- página de un proyecto ---------- */
  let ultimo = null;
  let abierto = null, sec = 'resumen';
  async function abrir(id) {
    abierto = Number(id); ir(`p=${abierto}`);
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let d; try { d = await api(`/api/impacto/proyectos/${abierto}/detalle`); } catch (x) { view.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; return; }
    const p = d.proyecto, cm = d.comunidad; ultimo = d;
    acciones.innerHTML = `<button class="btn btn-light" data-volver><i class="bi bi-arrow-left me-1"></i>Proyectos</button>${M ? '<button class="btn btn-outline-primary" data-ed><i class="bi bi-pencil me-1"></i>Editar</button>' : ''}`;
    acciones.querySelector('[data-volver]').onclick = () => { abierto = null; ir(); cargar(); };
    acciones.querySelector('[data-ed]')?.addEventListener('click', () => editarP(p));
    const club = d.aportes.filter((a) => a.origen === 'club'), ali = d.aportes.filter((a) => a.origen === 'alianza');
    // Finanzas del proyecto: soportes de cada fondo (club o alianza) + lo que se registró directo en las cajas con este proyecto
    const fondoDe = (a) => (!a ? 'Fondo' : a.origen === 'club' ? `Club · ${a.caja === 'menor' ? 'Caja menor' : 'Caja mayor'}` : (a.nombre || 'Alianza'));
    const movsP = [...d.soportes.map((x) => { const a = d.aportes.find((y) => y.id === x.aporte_id); return { fecha: x.fecha, fondo: fondoDe(a), club: a?.origen === 'club', tipo: a?.origen === 'club' ? 'egreso' : 'ingreso',
        comp: FORMAS[x.forma] || x.forma, concepto: x.notas || '', monto: x.monto, url: x.archivo ? `/api/impacto/soportes/${x.id}/archivo` : null, mime: x.mime, soporte: x, aporte: a }; }),
      ...(d.movimientos || []).map((x) => ({ fecha: x.fecha, fondo: `Club · ${x.caja === 'menor' ? 'Caja menor' : 'Caja mayor'}`, club: true, tipo: x.tipo, comp: 'Registrado en Finanzas', concepto: x.concepto, monto: x.monto,
        url: x.comprobante ? `/api/cajas/movimientos/${x.id}/comprobante` : null, mv: x }))].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const financiadores = d.aportes.filter((a) => a.tipo_aporte === 'financiera' && (a.monto > 0 || d.soportes.some((x) => x.aporte_id === a.id)));
    const lapiz = (a) => (M ? `<button class="btn btn-sm btn-link p-0 ms-1" data-aped="${a.id}" aria-label="Editar aporte"><i class="bi bi-pencil"></i></button>` : '');
    const SEC = [['resumen', 'Resumen', 'bi-card-text'], ['docs', `Documentación (${d.docs.length})`, 'bi-folder2-open'], ['comunidad', `Comunidad (${d.beneficiarios.length})`, 'bi-house-heart'], ['alianzas', `Alianzas (${ali.length})`, 'bi-people'], ['finanzas', `Finanzas (${movsP.length})`, 'bi-cash-stack'], ['actividades', `Actividades (${(d.actividades || []).length})`, 'bi-calendar-event']];
    const cuerpo = {
      resumen: () => `<div class="row g-3"><div class="col-lg-7"><div class="dw-card h-100">
          ${p.descripcion ? `<div class="ro-h mt-0">De qué se trata</div><p style="white-space:pre-wrap">${esc(p.descripcion)}</p>` : ''}${p.objetivo ? `<div class="ro-h">Objetivo</div><p style="white-space:pre-wrap">${esc(p.objetivo)}</p>` : ''}
          ${!p.descripcion && !p.objetivo ? '<p class="text-body-secondary small">Aún no tiene descripción. Agrégala con «Editar».</p>' : ''}
          <div class="ro-pstats mt-2"><span><b>${C.num(p.beneficiados_total)}</b>beneficiados</span><span><b>${C.num(p.horas_servicio || 0)}</b>horas</span><span><b>${p.tareas_hechas}/${p.tareas}</b>tareas</span></div>
          <div class="ro-h">Tareas</div>${d.tareas.length ? d.tareas.map((t) => `<div class="d-flex gap-2 small py-1 border-bottom"><i class="bi ${t.estado === 'hecha' ? 'bi-check-circle-fill text-success' : 'bi-circle'}"></i><span class="flex-grow-1">${esc(t.titulo)}</span><span class="text-body-secondary">${esc(t.responsable || '')}${t.fecha_limite ? ` · ${C.day(t.fecha_limite)}` : ''}</span></div>`).join('') : '<p class="small text-body-secondary mb-0">Sin tareas. Créalas en Tareas eligiendo este proyecto.</p>'}</div></div>
        <div class="col-lg-5"><div class="dw-card h-100"><div class="d-flex align-items-center gap-2 mb-2"><span class="ro-h m-0 flex-grow-1">Financiadores</span>${M ? '<button class="btn btn-sm btn-primary" data-apnuevo><i class="bi bi-plus-lg me-1"></i>Financiador</button>' : ''}</div>
          ${financiadores.length ? `${financiadores.map((a) => { const n = d.soportes.filter((x) => x.aporte_id === a.id).length; return `<div class="ro-fz">
              <div class="d-flex align-items-center gap-2"><i class="bi ${a.origen === 'club' ? 'bi-safe2' : 'bi-building'} fs-5" style="color:var(--dw-p)"></i><span class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${a.origen === 'club' ? `Club · ${a.caja === 'menor' ? 'Caja menor' : 'Caja mayor'}` : esc(a.nombre || 'Alianza')}</b></span><b class="text-nowrap">${C.money(a.monto)}</b>${lapiz(a)}</div>
              ${barra(a.origen === 'club' ? 'Gastado' : 'Recibido', a.recibido, a.monto, a.origen === 'club' ? 'var(--dw-p)' : '#16a34a')}
              <button class="btn btn-sm btn-light w-100" data-sop="${a.id}"><i class="bi bi-receipt me-1"></i>Comprobantes (${n})</button></div>`; }).join('')}
            <div class="d-flex justify-content-between small pt-2"><span>Total financiado</span><b>${C.money(financiadores.reduce((s, a) => s + a.monto, 0))}</b></div>`
            : `<p class="small text-body-secondary mb-0">Aún no hay quién financie con dinero. ${M ? 'Usa «Financiador»: del club (Caja mayor o menor) o de una alianza, y cuánto aporta.' : ''}</p>`}</div></div></div>`,
      finanzas: () => {
        const sum = (xs, f = () => true) => xs.filter(f).reduce((t, x) => t + x.monto, 0);
        const fin = d.aportes.filter((a) => a.tipo_aporte === 'financiera');
        // Un cuadro por fondo: cada financiador (club por caja, cada alianza) con SOLO sus movimientos
        const grupos = financiadores.map((a) => ({ key: `a${a.id}`, a, nombre: fondoDe(a), club: a.origen === 'club', caja: a.caja === 'menor' ? 'menor' : 'mayor', movs: [] }));
        movsP.forEach((x, k) => {
          x.k = k;
          let g = x.soporte ? grupos.find((y) => y.a?.id === x.soporte.aporte_id) : grupos.find((y) => y.club && y.caja === (x.mv.caja === 'menor' ? 'menor' : 'mayor'));
          if (!g) { const key = x.soporte ? `a${x.soporte.aporte_id}` : `caja-${x.mv.caja}`; g = grupos.find((y) => y.key === key); if (!g) { g = { key, a: x.aporte || null, nombre: x.fondo, club: x.club, caja: x.mv?.caja, movs: [] }; grupos.push(g); } }
          g.movs.push(x);
        });
        const fila = (x) => `<tr><td class="text-nowrap">${C.day(x.fecha)}</td><td>${esc(x.comp)}</td><td class="small">${esc(x.concepto || (x.soporte && itemsDe(x.soporte).length ? '' : '—'))}${x.soporte ? itemsHtml(x.soporte) : ''}</td>
              <td class="text-end text-nowrap fw-semibold ${x.tipo === 'egreso' ? 'text-danger' : 'text-success'}">${x.tipo === 'egreso' ? '−' : '+'}${C.money(x.monto)}</td>
              <td class="text-end text-nowrap">${x.url ? `<button class="btn btn-sm btn-light" data-fver="${x.k}" title="Ver comprobante"><i class="bi bi-eye"></i></button>` : M && x.mv ? `<button class="btn btn-sm btn-light" data-fsubir="${x.k}" title="Subir comprobante"><i class="bi bi-upload"></i></button>` : '<span class="badge text-bg-warning">sin archivo</span>'}
                ${M ? `<button class="btn btn-sm btn-light" data-fed="${x.k}" title="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light" data-fborrar="${x.k}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`;
        const cuadro = (g) => {
          const mov = g.club ? sum(g.movs, (x) => x.tipo === 'egreso') - sum(g.movs, (x) => x.tipo === 'ingreso') : sum(g.movs);
          return `<div class="dw-card mb-3 ro-fondo"><div class="d-flex flex-wrap gap-2 align-items-center mb-2">
              <span class="ro-av" style="width:40px;height:40px;font-size:17px"><i class="bi ${g.club ? 'bi-safe2' : 'bi-building'}"></i></span>
              <div class="flex-grow-1 min-w-0"><b class="d-block">${esc(g.nombre)}</b><span class="small text-body-secondary">${g.club ? 'Fondo del club' : 'Alianza'} · ${g.movs.length} ${g.movs.length === 1 ? 'movimiento' : 'movimientos'}</span></div>
              ${M && g.a ? `<button class="btn btn-sm btn-primary" data-fnuevo="${g.a.id}"><i class="bi bi-plus-lg me-1"></i>Registrar</button>` : ''}</div>
            ${g.a?.monto ? barra(g.club ? 'Gastado' : 'Recibido', mov, g.a.monto, g.club ? 'var(--dw-p)' : '#16a34a') : `<div class="small mb-2">${g.club ? 'Gastado' : 'Recibido'}: <b>${C.money(mov)}</b></div>`}
            ${g.movs.length ? `<div class="table-responsive-md"><table class="table dw-table align-middle mb-0"><thead><tr><th>Fecha</th><th>Comprobante</th><th>Concepto</th><th class="text-end">Valor</th><th></th></tr></thead><tbody>${g.movs.map(fila).join('')}</tbody></table></div>`
              : '<p class="small text-body-secondary mb-0">Aún no tiene movimientos.</p>'}</div>`;
        };
        return `<div class="row g-2 mb-3"><div class="col-6 col-md-3"><div class="dw-card text-center py-2"><div class="small text-body-secondary">Comprometido</div><b class="fs-5">${C.money(fin.reduce((t, a) => t + a.monto, 0))}</b></div></div>
            <div class="col-6 col-md-3"><div class="dw-card text-center py-2"><div class="small text-body-secondary">Llegó de alianzas</div><b class="fs-5 text-success">${C.money(sum(movsP, (x) => !x.club))}</b></div></div>
            <div class="col-6 col-md-3"><div class="dw-card text-center py-2"><div class="small text-body-secondary">Gastó el club</div><b class="fs-5 text-danger">${C.money(sum(movsP, (x) => x.club && x.tipo === 'egreso'))}</b></div></div>
            <div class="col-6 col-md-3"><div class="dw-card text-center py-2"><div class="small text-body-secondary">Sin comprobante</div><b class="fs-5 ${movsP.some((x) => !x.url) ? 'text-warning' : ''}">${movsP.filter((x) => !x.url).length}</b></div></div></div>
          ${grupos.length ? grupos.map(cuadro).join('') : `<div class="dw-card">${window.App.empty('bi-cash-stack', `Aún no hay fondos ni movimientos. ${M ? 'Agrega un financiador en Resumen → Financiadores (del club o de una alianza) y registra sus recibos de caja o cuentas de cobro.' : ''}`)}</div>`}`;
      },
      // Actividades: obras (jornadas de servicio), reuniones y eventos anclados al proyecto desde Reuniones
      actividades: () => { const A = d.actividades || [], TI = { obra: ['bi-hammer', 'Obra', '#E08E0B'], reunion: ['bi-people', 'Reunión', 'var(--dw-p)'], evento: ['bi-stars', 'Evento', '#0067C8'] };
        return `<div class="dw-card"><div class="d-flex gap-2 flex-wrap mb-2 align-items-center"><span class="ro-h m-0 flex-grow-1">Actividades del proyecto</span>${M ? '<button class="btn btn-sm btn-primary" data-actnueva><i class="bi bi-hammer me-1"></i>Nueva obra</button>' : ''}<a class="btn btn-sm btn-outline-primary" href="/staff/reuniones.html#obras"><i class="bi bi-calendar3 me-1"></i>Ver en Reuniones</a></div>
          ${A.length ? A.map((x) => { const [ic, l, col] = TI[x.tipo] || TI.reunion; return `<div class="d-flex align-items-center gap-3 py-2 border-bottom"><span class="d-grid rounded-3 text-white" style="width:40px;height:40px;place-items:center;background:${col};flex:none"><i class="bi ${ic}"></i></span>
            <div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(x.titulo)}</b><span class="small text-body-secondary text-capitalize">${l} · ${C.day(x.fecha)}${x.hora_ini ? ` · ${esc(x.hora_ini)}` : ''}${x.lugar ? ` · ${esc(x.lugar)}` : ''}</span></div>
            <span class="small text-body-secondary text-end">${x.presentes ? `${x.presentes} socios` : ''}${x.invitados ? `<br>${x.invitados} externos` : ''}</span></div>`; }).join('')
            : '<p class="small text-body-secondary mb-0">Aún no hay actividades. Crea una obra (jornada de servicio) o, en Reuniones, ancla una reunión o evento a este proyecto.</p>'}</div>`; },
      docs: () => `<div class="dw-card"><div class="d-flex gap-2 flex-wrap mb-2"><span class="ro-h m-0 flex-grow-1">Documentación del proyecto</span>${W ? '<button class="btn btn-sm btn-primary" data-dnuevo><i class="bi bi-file-earmark-plus me-1"></i>Nuevo documento</button><button class="btn btn-sm btn-outline-primary" data-dsubir><i class="bi bi-upload me-1"></i>Subir archivo</button><button class="btn btn-sm btn-outline-primary" data-denlace><i class="bi bi-link-45deg me-1"></i>Enlace</button>' : ''}</div>
        ${d.docs.length ? `<div class="ro-docs">${d.docs.map((x) => `<div class="ro-doc"><i class="bi ${x.tipo === 'documento' ? 'bi-file-earmark-richtext' : x.tipo === 'pdf' ? 'bi-file-earmark-pdf text-danger' : x.tipo === 'imagen' ? 'bi-file-earmark-image text-primary' : 'bi-link-45deg text-success'}" ${x.tipo === 'documento' ? 'style="color:var(--dw-p)"' : ''}></i>
            ${x.tipo === 'documento' ? `<a class="flex-grow-1 min-w-0 text-truncate" href="#" data-dver="${x.id}">${esc(x.nombre)}</a>` : `<a class="flex-grow-1 min-w-0 text-truncate" href="/api/impacto/docs/${x.id}" target="_blank" rel="noopener">${esc(x.nombre)}</a>`}
            <span class="small text-body-secondary">${C.day(new Date(x.updated_at || x.created_at).toISOString())}</span>
            ${M ? `<button class="btn btn-sm btn-light" data-dborrar="${x.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div>`).join('')}</div>`
          : window.App.empty('bi-folder2-open', 'Escribe aquí la propuesta, el presupuesto en tabla o las actas; o sube PDF y fotos del proyecto.')}</div>`,
      comunidad: () => `<div class="row g-3"><div class="col-lg-5"><div class="dw-card h-100 ro-comu"><div class="ro-h mt-0">Comunidad que se impacta</div>
          ${M ? '<div class="d-flex gap-2 mb-3"><select class="form-select form-select-sm" data-csel aria-label="Comunidad"><option>Cargando…</option></select><button class="btn btn-sm btn-outline-secondary text-nowrap" data-cnueva><i class="bi bi-plus-lg"></i> Nueva</button></div>' : ''}
          ${cm ? `<div class="d-flex gap-2 align-items-center mb-2"><span class="ro-av" style="width:44px;height:44px;font-size:18px"><i class="bi bi-house-heart"></i></span><a href="#c=${cm.id}" data-cir="${cm.id}" class="fs-5 fw-bold text-reset">${esc(cm.nombre)}</a></div>
            ${cm.tipo ? `<div class="small"><i class="bi bi-tag me-1"></i>${esc(cm.tipo)}</div>` : ''}${cm.lugar ? `<div class="small"><i class="bi bi-geo-alt me-1"></i>${esc(cm.lugar)}</div>` : ''}${cm.contacto || cm.telefono ? `<div class="small"><i class="bi bi-person-lines-fill me-1"></i>${esc([cm.contacto, cm.telefono].filter(Boolean).join(' · '))}</div>` : ''}
            ${cm.descripcion ? `<p class="small mt-2 mb-0" style="white-space:pre-wrap">${esc(cm.descripcion)}</p>` : ''}`
            : `<p class="small text-body-secondary">${M ? 'Elige la comunidad (p. ej. <i>Fundación Jardín de Amor</i>) y se traen todos sus beneficiarios.' : 'Aún no tiene comunidad.'}</p>`}
          <div class="ro-pstats mt-3"><span><b>${C.num(p.beneficiados_total)}</b>beneficiados</span><span><b>${d.beneficiarios.length}</b>registrados</span><span><b>${d.beneficiarios.filter((b) => b.autorizacion_datos).length}</b>con autorización</span></div></div></div>
        <div class="col-lg-7"><div class="dw-card h-100"><div class="d-flex align-items-center mb-2"><span class="ro-h m-0 flex-grow-1">Beneficiarios${cm ? ` de ${esc(cm.nombre)}` : ''}</span>${W && cm ? '<button class="btn btn-sm btn-primary" data-bnuevo><i class="bi bi-plus-lg me-1"></i>Beneficiario</button>' : ''}</div>
          ${benefLista(d.beneficiarios) || `<p class="small text-body-secondary mb-0">${cm ? 'Esta comunidad aún no tiene beneficiarios registrados.' : 'Elige primero la comunidad.'}</p>`}</div></div></div>`,
      alianzas: () => `<div class="d-flex mb-2"><span class="flex-grow-1"></span>${M ? '<button class="btn btn-sm btn-primary" data-apali><i class="bi bi-plus-lg me-1"></i>Alianza que aporta</button>' : ''}</div>
        ${ali.length ? `<div class="ro-pgrid">${ali.map((a) => `<div class="dw-card"><div class="d-flex gap-2 align-items-start"><span class="ro-av" style="width:40px;height:40px;font-size:15px">${esc(RO.initials(a.nombre))}</span>
            <div class="flex-grow-1 min-w-0"><b class="d-block">${esc(a.nombre || 'Alianza')}</b><span class="small text-body-secondary">${esc(a.tipo || '')}${a.contacto ? ` · ${esc(a.contacto)}` : ''}${a.telefono ? ` · ${esc(a.telefono)}` : ''}</span></div>${M ? `<button class="btn btn-sm btn-light" data-aped="${a.id}" aria-label="Editar aporte"><i class="bi bi-pencil"></i></button>` : ''}</div>
            <div class="d-flex gap-1 flex-wrap my-2">${aporteChip(a.tipo_aporte)}${a.estado ? C.chip(toneA(a.estado), a.estado) : ''}</div>
            ${a.monto ? barra('Recibido', a.recibido, a.monto, '#16a34a') : ''}${a.notas ? `<p class="small mb-0">${esc(a.notas)}</p>` : ''}</div>`).join('')}</div>`
          : window.App.empty('bi-people', 'Este proyecto aún no tiene alianzas. Agrega las que aportan dinero, especie, difusión…')}`,
    };
    view.innerHTML = `<div class="ro-phero" ${p.foto_url ? `style="--img:url('${esc(p.foto_url)}')"` : ''}><div class="ro-phero-in">
        <div class="d-flex gap-2 flex-wrap mb-1">${C.chip(...(EST[p.estado] || EST.propuesta))}${d.aportes.length ? finBadge(p) : ''}</div><h2 class="h3 mb-1">${esc(p.nombre)}</h2>
        <div class="small">${p.lider ? `<i class="bi bi-person me-1"></i>${esc(p.lider)} · ` : ''}${p.fecha_inicio ? `${C.day(p.fecha_inicio)}${p.fecha_fin ? ` → ${C.day(p.fecha_fin)}` : ''}` : 'Sin fechas'}${(p.comunidades || []).length ? ` · <i class="bi bi-house-heart me-1"></i>${esc(p.comunidades.join(' · '))}` : ''}</div></div></div>
      <div class="d-flex gap-2 flex-wrap my-3" data-secs>${SEC.map(([k, l, ic]) => `<button type="button" class="btn btn-sm rounded-pill ${k === sec ? 'btn-primary' : 'btn-light'}" data-sec="${k}"><i class="bi ${ic} me-1"></i>${l}</button>`).join('')}</div>
      <div data-cuerpo></div>`;
    const pintar = async () => {
      view.querySelector('[data-cuerpo]').innerHTML = cuerpo[sec]();
      const cs = view.querySelector('[data-csel]');
      if (cs) {
        const comus = await comunidades();
        cs.innerHTML = `<option value="">Elige la comunidad…</option>${comus.map((x) => `<option value="${x.id}" ${x.id === p.comunidad_id ? 'selected' : ''}>${esc(x.nombre)}${x.beneficiarios ? ` (${x.beneficiarios})` : ''}</option>`).join('')}`;
        cs.onchange = async () => { try { await api(`/api/impacto/proyectos/${p.id}`, { method: 'PATCH', body: { comunidad_id: Number(cs.value) || null } }); toast('Comunidad del proyecto actualizada'); abrir(p.id); } catch (x) { toast(x.message, false); } };
      }
    };
    await pintar();
    view.onclick = async (e) => {
      const b = e.target.closest('[data-sec]'); if (b) { sec = b.dataset.sec; view.querySelectorAll('[data-sec]').forEach((x) => x.className = `btn btn-sm rounded-pill ${x === b ? 'btn-primary' : 'btn-light'}`); return pintar(); }
      if (e.target.closest('[data-actnueva]')) {
        const out = await C.form({ title: `Nueva obra · ${p.nombre}`, fields: [{ k: 'titulo', label: 'Nombre de la jornada', type: 'text', required: true, full: true }, { k: 'fecha', label: 'Fecha', type: 'date', required: true },
          { k: 'hora_ini', label: 'Hora de inicio', type: 'text', placeholder: '08:00' }, { k: 'hora_fin', label: 'Hora de fin', type: 'text', placeholder: '13:00' }, { k: 'lugar', label: 'Lugar', type: 'text', full: true }, { k: 'descripcion', label: 'Qué se hará', type: 'long' }],
          values: { titulo: `Jornada · ${p.nombre}`, fecha: C.todayCo() }, okText: 'Crear obra' });
        if (!out) return;
        try { await api('/api/reuniones/reuniones', { method: 'POST', body: { ...out, tipo: 'obra', proyecto_id: p.id, estado: 'programada', modalidad: 'presencial' } }); toast('Obra creada: ya está en el calendario'); sec = 'actividades'; abrir(p.id); } catch (x) { toast(x.message, false); }
        return;
      }
      if (e.target.closest('[data-apnuevo]')) return editarAporte(p, null, 'club');
      const so = e.target.closest('[data-sop]'); if (so) return soportes(d, Number(so.dataset.sop));
      const fk = (a) => movsP[+e.target.closest(`[${a}]`)?.getAttribute(a)];
      const fv = fk('data-fver'); if (fv && e.target.closest('[data-fver]')) return verArchivo(fv.url, `${fv.comp} · ${C.money(fv.monto)}`, fv.mime || '');
      const fe = e.target.closest('[data-fed]') && fk('data-fed'); if (fe) return fe.soporte ? editarSoporte(d, fe.soporte.aporte_id, fe.soporte, () => abrir(p.id)) : editarMovDirecto(fe.mv, p);
      const fs = e.target.closest('[data-fsubir]') && fk('data-fsubir'); if (fs) { const file = await RO.elegirArchivo(); if (!file) return; try { await RO.subir(`/api/cajas/movimientos/${fs.mv.id}/comprobante`, file); toast('Comprobante subido'); abrir(p.id); } catch (er) { toast(er.message, false); } return; }
      const fb = e.target.closest('[data-fborrar]') && fk('data-fborrar');
      if (fb) {
        if (fb.soporte) return borrarSoporte(fb.soporte, fb.club, () => abrir(p.id));
        if (!(await window.App.confirm({ title: '¿Borrar este movimiento de Finanzas?', ok: 'Borrar' }))) return;
        try { await api(`/api/cajas/movimientos/${fb.mv.id}`, { method: 'DELETE' }); toast('Movimiento borrado'); abrir(p.id); } catch (er) { toast(er.message, false); } return;
      }
      const fn = e.target.closest('[data-fnuevo]'); if (fn) return editarSoporte(d, Number(fn.dataset.fnuevo), null, () => abrir(p.id));
      if (e.target.closest('[data-fmov]')) {   // elegir de qué fondo es el movimiento
        if (!financiadores.length) { toast('Primero agrega un financiador (del club o de una alianza)', false); return editarAporte(p, null, 'club'); }
        if (financiadores.length === 1) return editarSoporte(d, financiadores[0].id, null, () => abrir(p.id));
        const { el, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">¿De qué fondo es?</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body d-grid gap-2">${financiadores.map((a) => `<button class="btn btn-outline-primary text-start" data-fz="${a.id}"><i class="bi ${a.origen === 'club' ? 'bi-safe2' : 'bi-building'} me-2"></i>${esc(fondoDe(a))}</button>`).join('')}</div>`);
        el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-fz]'); if (b) { m.hide(); editarSoporte(d, Number(b.dataset.fz), null, () => abrir(p.id)); } });
        return;
      }
      if (e.target.closest('[data-apali]')) return editarAporte(p, null, 'alianza');
      const ap = e.target.closest('[data-aped]'); if (ap) return editarAporte(p, d.aportes.find((a) => String(a.id) === ap.dataset.aped));
      if (e.target.closest('[data-dnuevo]')) return abrirEditor(null, p);
      const dv = e.target.closest('[data-dver]'); if (dv) { e.preventDefault(); return verDoc(dv.dataset.dver, p); }
      if (e.target.closest('[data-dsubir]')) { const f = await RO.elegirArchivo(); if (!f) return; try { await RO.subir(`/api/impacto/proyectos/${p.id}/docs`, f); toast('Documento subido'); abrir(p.id); } catch (x) { toast(x.message, false); } return; }
      if (e.target.closest('[data-denlace]')) { const out = await C.form({ title: 'Agregar enlace', fields: [{ k: 'nombre', label: 'Nombre', type: 'text', required: true, full: true }, { k: 'url', label: 'Enlace (https)', type: 'url', required: true, full: true }] }); if (!out) return; try { await api(`/api/impacto/proyectos/${p.id}/docs`, { method: 'POST', body: out }); toast('Enlace agregado'); abrir(p.id); } catch (x) { toast(x.message, false); } return; }
      const db = e.target.closest('[data-dborrar]'); if (db) { if (!(await window.App.confirm({ title: '¿Borrar este documento?', ok: 'Borrar' }))) return; try { await api(`/api/impacto/docs/${db.dataset.dborrar}`, { method: 'DELETE' }); abrir(p.id); } catch (x) { toast(x.message, false); } return; }
      if (e.target.closest('[data-cnueva]')) { const id = await editarC(null); if (id) { try { await api(`/api/impacto/proyectos/${p.id}`, { method: 'PATCH', body: { comunidad_id: id } }); abrir(p.id); } catch (x) { toast(x.message, false); } } return; }
      const ci = e.target.closest('[data-cir]'); if (ci) { e.preventDefault(); return abrirC(ci.dataset.cir); }
      if (e.target.closest('[data-bnuevo]')) {
        const out = await C.form({ title: `Nuevo beneficiario de ${cm.nombre}`, fields: camposB(null) });
        if (!out) return; try { await api('/api/impacto/beneficiarios', { method: 'POST', body: { ...out, comunidad_id: cm.id, proyecto_id: p.id } }); toast('Beneficiario agregado'); abrir(p.id); } catch (x) { toast(x.message, false); }
      }
    };
  }

  /* ---------- página de una comunidad ---------- */
  async function abrirC(id) {
    abierto = null; ir(`c=${id}`); tab = 'comunidades';
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let d; try { d = await api(`/api/impacto/comunidades/${id}/detalle`); } catch (x) { view.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; return; }
    const cm = d.comunidad;
    acciones.innerHTML = `<button class="btn btn-light" data-volver><i class="bi bi-arrow-left me-1"></i>Comunidades</button>${W ? '<button class="btn btn-outline-primary" data-ed><i class="bi bi-pencil me-1"></i>Editar</button>' : ''}`;
    acciones.querySelector('[data-volver]').onclick = () => { ir('comunidades'); cargar(); };
    acciones.querySelector('[data-ed]')?.addEventListener('click', () => editarC(cm, (cid) => abrirC(cid)));
    view.innerHTML = `<div class="ro-phero" ${cm.foto_url ? `style="--img:url('${esc(cm.foto_url)}')"` : ''}><div class="ro-phero-in"><div class="small mb-1"><i class="bi bi-house-heart me-1"></i>${esc(cm.tipo || 'Comunidad')}</div><h2 class="h3 mb-1">${esc(cm.nombre)}</h2>
        <div class="small">${[cm.lugar && `<i class="bi bi-geo-alt me-1"></i>${esc(cm.lugar)}`, (cm.contacto || cm.telefono) && `<i class="bi bi-person-lines-fill me-1"></i>${esc([cm.contacto, cm.telefono].filter(Boolean).join(' · '))}`].filter(Boolean).join(' · ') || ''}</div></div></div>
      <div class="row g-3 my-1"><div class="col-lg-4"><div class="dw-card h-100"><div class="ro-pstats mb-2"><span><b>${C.num(cm.beneficiarios)}</b>beneficiarios</span><span><b>${cm.proyectos}</b>proyectos</span><span><b>${C.num(d.proyectos.reduce((s, p) => s + (p.horas_servicio || 0), 0))}</b>horas</span></div>
          ${cm.descripcion ? `<p class="small mb-2" style="white-space:pre-wrap">${esc(cm.descripcion)}</p>` : ''}<div class="ro-h">Proyectos con esta comunidad</div>
          ${d.proyectos.length ? d.proyectos.map((p) => `<a href="#p=${p.id}" data-p="${p.id}" class="d-flex gap-2 align-items-center small py-1 border-bottom text-reset text-decoration-none"><i class="bi bi-globe-americas"></i><span class="flex-grow-1">${esc(p.nombre)}</span>${C.chip(...(EST[p.estado] || EST.propuesta))}</a>`).join('') : '<p class="small text-body-secondary mb-0">Aún ningún proyecto la tiene. Elígela en la Comunidad de un proyecto.</p>'}</div></div>
        <div class="col-lg-8"><div class="d-flex gap-2 mb-2" data-ctabs><button class="btn btn-sm rounded-pill btn-primary" data-ctab="benef"><i class="bi bi-people me-1"></i>Beneficiarios</button><button class="btn btn-sm rounded-pill btn-light" data-ctab="enc"><i class="bi bi-clipboard2-data me-1"></i>Encuestas</button></div>
          <div data-benef></div><div data-enc hidden></div></div></div>`;
    let encMontada = false;
    view.onclick = async (e) => {
      const a = e.target.closest('[data-p]'); if (a) { e.preventDefault(); tab = 'proyectos'; sec = 'resumen'; abrir(a.dataset.p); return; }
      const t = e.target.closest('[data-ctab]'); if (!t) return;
      view.querySelectorAll('[data-ctab]').forEach((x) => { x.className = `btn btn-sm rounded-pill ${x === t ? 'btn-primary' : 'btn-light'}`; });
      const enc = t.dataset.ctab === 'enc'; view.querySelector('[data-benef]').hidden = enc; view.querySelector('[data-enc]').hidden = !enc;
      if (enc && !encMontada) {
        encMontada = true;
        const bens = (await api(`/api/impacto/beneficiarios?f_comunidad_id=${cm.id}&limit=1000`)).rows;
        window.ROEnc.montar(view.querySelector('[data-enc]'), { comunidad: cm, beneficiarios: bens, M, W });
      }
    };
    const proys = d.proyectos.length ? d.proyectos : [];
    C.table({ el: view.querySelector('[data-benef]'), base: '/api/impacto', entity: 'beneficiarios', title: 'beneficiario', newText: 'Nuevo beneficiario', readOnly: !W, emptyIcon: 'bi-person-heart', empty: 'Esta comunidad aún no tiene beneficiarios registrados.',
      fixed: { comunidad_id: cm.id }, fields: camposB(proys),
      columns: [{ label: 'Nombre', main: true, html: (b) => `${esc(b.nombre)}${b.tipo ? `<div class="small text-body-secondary fw-normal">${esc(b.tipo)}</div>` : ''}` }, { label: 'Edad', html: (b) => (b.edad ?? '—') },
        { label: 'Proyecto', html: (b) => esc(proys.find((p) => p.id === b.proyecto_id)?.nombre || '—') },
        { label: 'Autorizaciones', html: (b) => `${b.autorizacion_datos ? '<i class="bi bi-shield-check text-success" title="Datos"></i>' : '<i class="bi bi-shield-x text-danger" title="Sin autorización de datos"></i>'} ${b.autorizacion_imagen ? '<i class="bi bi-camera text-success" title="Imagen"></i>' : ''}` }] }).load();
  }

  /* ---------- pestañas ---------- */
  async function cargar() {
    acciones.innerHTML = ''; view.onclick = null;
    if (tab === 'proyectos') {
      if (M) { acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nuevo proyecto</button>'; acciones.querySelector('[data-nuevo]').onclick = () => editarP(null); }
      rows = (await api('/api/impacto/tarjetas')).rows;
      view.onclick = (e) => { const c = e.target.closest('[data-p]'); if (c) { sec = 'resumen'; abrir(c.dataset.p); } };
      view.innerHTML = rows.length ? `<div class="ro-pgrid">${rows.map(tarjeta).join('')}</div>` : window.App.empty('bi-globe-americas', 'Aún no hay proyectos de servicio.');
      return;
    }
    if (tab === 'comunidades') {
      if (W) { acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva comunidad</button>'; acciones.querySelector('[data-nuevo]').onclick = () => editarC(null, (id) => abrirC(id)); }
      const cs = await comunidades();
      view.onclick = (e) => { const c = e.target.closest('[data-c]'); if (c) abrirC(c.dataset.c); };
      view.innerHTML = cs.length ? `<div class="ro-pgrid">${cs.map((c) => `<button type="button" class="ro-pcard" data-c="${c.id}">
          <div class="ro-pimg" ${c.foto_url ? `style="background-image:url('${esc(c.foto_url)}')"` : ''}>${c.foto_url ? '' : '<i class="bi bi-house-heart"></i>'}</div>
          <div class="p-3 d-grid gap-2"><b class="fs-6">${esc(c.nombre)}</b>${c.tipo || c.lugar ? `<span class="small text-body-secondary">${esc([c.tipo, c.lugar].filter(Boolean).join(' · '))}</span>` : ''}
            <div class="ro-pstats" style="grid-template-columns:repeat(2,1fr)"><span><b>${C.num(c.beneficiarios)}</b>beneficiarios</span><span><b>${c.proyectos}</b>proyectos</span></div>
            ${c.proyectos_nombres ? `<div class="small text-body-secondary text-truncate">${esc(c.proyectos_nombres)}</div>` : ''}</div></button>`).join('')}</div>`
        : window.App.empty('bi-house-heart', 'Aún no hay comunidades. Crea la primera (p. ej. Fundación Jardín de Amor) y registra sus beneficiarios.');
      return;
    }
    return C.table({ el: view, base: '/api/impacto', entity: 'alianzas', title: 'alianza', newText: 'Nueva alianza', readOnly: !W, emptyIcon: 'bi-building', empty: 'Aún no hay alianzas.',
      filters: [{ k: 'estado', options: [['', 'Todas'], ...EST_A] }], fields: camposA, defaults: () => ({ estado: 'activa', tipo_aporte: 'financiera' }),
      columns: [{ label: 'Entidad', main: true, html: (a) => `${esc(a.nombre)}<div class="small text-body-secondary fw-normal">${esc(a.tipo || '')}${a.municipio ? ` · ${esc(a.municipio)}` : ''}</div>` },
        { label: 'Aporte', html: (a) => `${aporteChip(a.tipo_aporte)}${a.aporta ? `<div class="small text-body-secondary">${C.money(a.aporto)} de ${C.money(a.aporta)}</div>` : ''}` }, { label: 'Estado', html: (a) => C.chip(toneA(a.estado), a.estado) },
        { label: 'Aporta a', html: (a) => (a.proyectos ? `${esc(a.proyectos_nombres)}` : '—') }, { label: 'Próximo paso', html: (a) => `${esc(a.proximo_paso || '—')}${a.proximo_paso_fecha ? `<div class="small text-body-secondary">${C.day(a.proximo_paso_fecha)}</div>` : ''}` }] }).load();
  }

  document.head.insertAdjacentHTML('beforeend', `<style>.ro-pgrid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,290px),1fr))}
    .ro-pcard{padding:0;border-radius:16px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);overflow:hidden;text-align:left;color:inherit;transition:transform .12s}.ro-pcard:hover{transform:translateY(-2px);border-color:var(--dw-p)}
    .ro-pimg{height:120px;background:linear-gradient(135deg,rgba(var(--dw-p-rgb),.35),rgba(var(--dw-p-rgb),.08)) center/cover;display:grid;place-items:center;font-size:2.4rem;color:var(--dw-p);position:relative}.ro-pest{position:absolute;top:8px;right:8px}
    .ro-pstats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center}.ro-pstats span{display:flex;flex-direction:column;font-size:.72rem;color:var(--bs-secondary-color);background:rgba(var(--dw-p-rgb),.05);border-radius:10px;padding:6px 2px}.ro-pstats b{font-size:1.05rem;color:var(--bs-body-color)}
    .ro-phero{position:relative;border-radius:18px;overflow:hidden;min-height:150px;display:flex;align-items:flex-end;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.6)),var(--img,linear-gradient(135deg,var(--dw-p),color-mix(in srgb,var(--dw-p) 50%,#000))) center/cover;color:#fff}.ro-phero-in{padding:18px}
    .ro-docs{display:grid;gap:6px}.ro-doc{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border:1px solid var(--bs-border-color)}.ro-doc .bi{font-size:1.3rem}
    .ro-benef{display:grid;gap:6px;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));max-height:420px;overflow:auto}.ro-b{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:10px;background:rgba(var(--dw-p-rgb),.04)}
    .ro-items td{padding:.25rem}.ro-fz{border:1px solid var(--bs-border-color);border-radius:12px;padding:10px;margin-bottom:8px}
    .ro-fin{display:inline-flex;gap:6px;align-items:center;font-size:.78rem;font-weight:600;color:var(--f);background:color-mix(in srgb,var(--f) 14%,transparent);border-radius:999px;padding:3px 10px}</style>`);
  RO.nav(tab, (k) => { tab = k; abierto = null; cargar(); });
  const ini = /^#([pc])=(\d+)$/.exec(location.hash);
  if (ini?.[1] === 'p') { rows = (await api('/api/impacto/tarjetas')).rows; await abrir(ini[2]); } else if (ini?.[1] === 'c') await abrirC(ini[2]); else await cargar();
});
