// Tareas del club en kanban: Pendiente → En curso → Hecha. Se arrastran entre columnas (o con los botones en celular).
// Filtros: todas / mías / vencidas y por proyecto. Las vencidas van primero en su columna; en «Hecha» solo las de los últimos
// 30 días (botón para ver todas). «Revisar vencidas» (junta): reprogramar, cerrar o cancelar cada una en un solo lugar.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast } = window.App;
  const C = window.App.Crud, RO = window.RO;
  RO.nav('tareas');
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const RO_APP = me.business.readOnly;
  const COLS = [['pendiente', 'Pendiente', 'bi-circle'], ['en_curso', 'En curso', 'bi-arrow-repeat'], ['hecha', 'Hecha', 'bi-check-circle']];
  const [socios, proyectos] = await Promise.all([RO.socios(), me.modules.some((m) => m.id === 'impacto') ? RO.proyectos() : []]);
  let rows = [], ver = 'todas', proy = '', todasHechas = false, yo = null;
  const M = me.canManage;

  if (!RO_APP) acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva tarea</button>';
  acciones.querySelector('[data-nuevo]')?.addEventListener('click', () => editar(null));

  const campos = [{ k: 'titulo', label: 'Tarea', type: 'text', required: true, full: true }, { k: 'socio_id', label: 'Responsable', type: 'select', options: RO.optsSocios(socios) },
    { k: 'fecha_limite', label: 'Fecha límite', type: 'date' }, { k: 'estado', label: 'Estado', type: 'select', options: [...COLS.map(([k, l]) => [k, l]), ['cancelada', 'Cancelada']] },
    { k: 'prioridad', label: 'Prioridad', type: 'select', options: [['normal', 'Normal'], ['alta', 'Alta'], ['baja', 'Baja']] },
    ...(proyectos.length ? [{ k: 'proyecto_id', label: 'Proyecto', type: 'select', options: RO.opts(proyectos, 'Ninguno') }] : []),
    { k: 'descripcion', label: 'Detalle', type: 'long' }, { k: 'checklist_txt', label: 'Checklist', type: 'long', hint: 'un paso por línea; «x » al inicio = hecho' }];

  async function editar(t) {
    const ck = (t?.checklist || []).map((i) => `${i.hecho ? 'x ' : ''}${i.texto}`).join('\n');
    const out = await C.form({ title: t ? 'Editar tarea' : 'Nueva tarea', fields: campos.map((f) => (f.k === 'proyecto_id' ? { ...f, options: RO.optsProyectos(proyectos, t?.proyecto_id) } : f.k === 'socio_id' ? { ...f, options: RO.optsSocios(socios, 'Sin responsable', t?.socio_id) } : f)), values: t ? { ...t, checklist_txt: ck } : { estado: 'pendiente', prioridad: 'normal', socio_id: yo?.id || '' },
      onDelete: t && me.canManage ? () => api(`/api/tareas/tareas/${t.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Tarea borrada'); return cargar(); }
    if (!out) return;
    const { checklist_txt, ...body } = out;
    body.checklist = JSON.stringify(checklist_txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => ({ hecho: /^x\s/i.test(l), texto: l.replace(/^x\s+/i, '') })));
    try { await api(t ? `/api/tareas/tareas/${t.id}` : '/api/tareas/tareas', { method: t ? 'PATCH' : 'POST', body }); toast('Guardado'); cargar(); } catch (x) { toast(x.message, false); }
  }
  async function mover(t, estado) {
    if (t.estado === estado) return;
    try { await api(`/api/tareas/tareas/${t.id}`, { method: 'PATCH', body: { estado } }); cargar(); } catch (x) { toast(x.message, false); }
  }

  const tarjeta = (t) => {
    const ck = t.checklist || [], hechos = ck.filter((i) => i.hecho).length, i = COLS.findIndex(([k]) => k === t.estado);
    return `<div class="dw-kcard" draggable="${!RO_APP}" data-t="${t.id}">
      <b>${t.prioridad === 'alta' ? '<i class="bi bi-flag-fill text-danger me-1"></i>' : ''}${esc(t.titulo)}</b>
      ${t.proyecto ? `<span class="small text-body-secondary"><i class="bi bi-globe-americas me-1"></i>${esc(t.proyecto)}</span>` : ''}
      <span class="d-flex align-items-center gap-2 small mt-1">${t.responsable ? `${RO.avatar({ nombre: t.responsable }, 22)}<span class="text-truncate">${esc(t.responsable)}</span>` : '<span class="text-body-secondary">Sin responsable</span>'}
        <span class="ms-auto ${t.vencida ? 'text-danger fw-semibold' : 'text-body-secondary'}">${t.fecha_limite ? C.day(t.fecha_limite) : ''}</span></span>
      ${ck.length ? `<div class="progress mt-1" style="height:4px" title="${hechos}/${ck.length}"><div class="progress-bar" style="width:${(hechos / ck.length) * 100}%"></div></div>` : ''}
      ${RO_APP ? '' : `<span class="d-flex d-md-none gap-1 mt-1">${i > 0 ? `<button class="btn btn-sm btn-light" data-mv="${COLS[i - 1][0]}" aria-label="Mover atrás"><i class="bi bi-arrow-left"></i></button>` : ''}${i < 2 && i >= 0 ? `<button class="btn btn-sm btn-light ms-auto" data-mv="${COLS[i + 1][0]}" aria-label="Mover adelante"><i class="bi bi-arrow-right"></i></button>` : ''}</span>`}
    </div>`;
  };

  const HACE30 = Date.now() - 30 * 864e5;
  const ordenar = (a, b) => (b.vencida - a.vencida) || String(a.fecha_limite || '9999').localeCompare(String(b.fecha_limite || '9999')) || (a.orden || 0) - (b.orden || 0);
  function pintar() {
    const base = rows.filter((t) => t.estado !== 'cancelada' && (!proy || String(t.proyecto_id || '') === proy));
    const f = base.filter((t) => (ver !== 'mias' || (yo && t.socio_id === yo.id)) && (ver !== 'vencidas' || t.vencida));
    const venc = base.filter((t) => t.vencida).length;
    view.querySelector('[data-k]').innerHTML = `<div class="dw-kanban">${COLS.map(([k, l, ic]) => {
      const todas = f.filter((t) => t.estado === k).sort(k === 'hecha' ? (a, b) => (b.completada_at || 0) - (a.completada_at || 0) : ordenar);
      const col = k === 'hecha' && !todasHechas ? todas.filter((t) => (t.completada_at || 0) > HACE30) : todas;
      const ocultas = todas.length - col.length;
      return `<div class="dw-kcol" data-col="${k}"><h3><span><i class="bi ${ic} me-1"></i>${l}</span><span class="badge text-bg-light">${todas.length}</span></h3>${k === 'hecha' && !todasHechas && todas.length ? '<div class="small text-body-secondary px-1 pb-1">Últimos 30 días</div>' : ''}${col.map(tarjeta).join('') || '<div class="small text-body-secondary p-2">Nada aquí.</div>'}${ocultas ? `<button class="btn btn-sm btn-link w-100" data-hechas>Ver las ${ocultas} anteriores</button>` : todasHechas && k === 'hecha' && todas.length ? '<button class="btn btn-sm btn-link w-100" data-hechas>Solo los últimos 30 días</button>' : ''}</div>`;
    }).join('')}</div>`;
    view.querySelector('[data-info]').innerHTML = venc ? `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>${venc} vencida${venc > 1 ? 's' : ''}</span>${M && !RO_APP ? ' <button class="btn btn-sm btn-outline-danger" data-revisar><i class="bi bi-calendar-check me-1"></i>Revisar vencidas</button>' : ''}` : '';
    const ps = [...new Map(rows.filter((t) => t.proyecto_id && t.estado !== 'cancelada').map((t) => [String(t.proyecto_id), t.proyecto || 'Proyecto'])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const sel = view.querySelector('[data-proy]');
    sel.hidden = !ps.length;
    sel.innerHTML = `<option value="">Todos los proyectos</option><option value="" disabled>──────</option>${ps.map(([id, n]) => `<option value="${id}" ${id === proy ? 'selected' : ''}>${esc(n)}</option>`).join('')}`;
  }

  // Revisión de vencidas: una fila por tarea con nueva fecha, «Hecha» o «Cancelar». Lo que se cambia sale de la lista.
  function revisar() {
    const lista = rows.filter((t) => t.vencida && (!proy || String(t.proyecto_id || '') === proy)).sort(ordenar);
    const { el, m } = window.App.modal(`<div class="modal-header"><h2 class="modal-title h5">Revisar ${lista.length} tareas vencidas</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Para cada una: ponle una nueva fecha, márcala hecha o cancélala si ya no aplica.</p>
      <div class="list-group">${lista.map((t) => `<div class="list-group-item" data-r="${t.id}"><div class="d-flex flex-wrap align-items-center gap-2">
        <div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(t.titulo)}</b><span class="small text-body-secondary">${esc(t.responsable || 'Sin responsable')}${t.proyecto ? ` · ${esc(t.proyecto)}` : ''} · venció ${C.day(t.fecha_limite)}</span></div>
        <input type="date" class="form-control form-control-sm" style="width:150px" value="" aria-label="Nueva fecha"><button class="btn btn-sm btn-outline-primary" data-a="fecha">Reprogramar</button>
        <button class="btn btn-sm btn-success" data-a="hecha">Hecha</button><button class="btn btn-sm btn-light" data-a="cancelada">Cancelar</button></div></div>`).join('')}</div></div>`, { size: 'modal-lg' });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const fila = b.closest('[data-r]'), id = fila.dataset.r, a = b.dataset.a;
      const body = a === 'fecha' ? { fecha_limite: fila.querySelector('input').value } : { estado: a };
      if (a === 'fecha' && !body.fecha_limite) return toast('Elige la nueva fecha', false);
      b.disabled = true;
      try { await api(`/api/tareas/tareas/${id}`, { method: 'PATCH', body }); fila.remove(); if (!el.querySelector('[data-r]')) m.hide(); } catch (x) { toast(x.message, false); b.disabled = false; }
    });
    el.addEventListener('hidden.bs.modal', () => cargar());
  }

  async function cargar() { rows = (await api('/api/tareas/tareas?limit=1000')).rows; pintar(); }

  view.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><div class="btn-group btn-group-sm" role="group"><button class="btn btn-outline-secondary active" data-ver="todas">Todas</button><button class="btn btn-outline-secondary" data-ver="mias">Mis tareas</button><button class="btn btn-outline-secondary" data-ver="vencidas">Vencidas</button></div>
    <select class="form-select form-select-sm" style="max-width:260px" data-proy aria-label="Filtrar por proyecto" hidden></select><span data-info></span></div><div data-k></div>`;
  view.querySelector('[data-proy]').addEventListener('change', (e) => { proy = e.target.value; pintar(); });
  view.addEventListener('click', (e) => {
    const v = e.target.closest('[data-ver]');
    if (v) { ver = v.dataset.ver; view.querySelectorAll('[data-ver]').forEach((b) => b.classList.toggle('active', b === v)); return pintar(); }
    if (e.target.closest('[data-hechas]')) { todasHechas = !todasHechas; return pintar(); }
    if (e.target.closest('[data-revisar]')) return revisar();
    const card = e.target.closest('[data-t]'); if (!card) return;
    const t = rows.find((x) => String(x.id) === card.dataset.t);
    const mv = e.target.closest('[data-mv]');
    if (mv) return mover(t, mv.dataset.mv);
    editar(t);
  });
  view.addEventListener('dragstart', (e) => { const c = e.target.closest('[data-t]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.t); });
  view.addEventListener('dragover', (e) => { if (e.target.closest('[data-col]')) e.preventDefault(); });
  view.addEventListener('drop', (e) => { const col = e.target.closest('[data-col]'); if (!col) return; e.preventDefault(); const t = rows.find((x) => String(x.id) === e.dataTransfer.getData('text/plain')); if (t) mover(t, col.dataset.col); });
  yo = await api('/api/lotuyo/carnet').then((d) => d.carnet).catch(() => null);
  await cargar();
});
