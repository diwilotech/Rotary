// Tareas del club en kanban: Pendiente → En curso → Hecha. Se arrastran entre columnas (o con los botones en celular).
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast } = window.App;
  const C = window.App.Crud, RO = window.RO;
  RO.nav('tareas');
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const RO_APP = me.business.readOnly;
  const COLS = [['pendiente', 'Pendiente', 'bi-circle'], ['en_curso', 'En curso', 'bi-arrow-repeat'], ['hecha', 'Hecha', 'bi-check-circle']];
  const [socios, proyectos] = await Promise.all([RO.socios(), me.modules.some((m) => m.id === 'impacto') ? RO.proyectos() : []]);
  let rows = [], soloMias = false, yo = null;

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

  function pintar() {
    const f = rows.filter((t) => t.estado !== 'cancelada' && (!soloMias || (yo && t.socio_id === yo.id)));
    const venc = f.filter((t) => t.vencida).length;
    view.querySelector('[data-k]').innerHTML = `<div class="dw-kanban">${COLS.map(([k, l, ic]) => {
      const col = f.filter((t) => t.estado === k).slice(0, k === 'hecha' ? 30 : 500);
      return `<div class="dw-kcol" data-col="${k}"><h3><span><i class="bi ${ic} me-1"></i>${l}</span><span class="badge text-bg-light">${f.filter((t) => t.estado === k).length}</span></h3>${col.map(tarjeta).join('') || '<div class="small text-body-secondary p-2">Nada aquí.</div>'}</div>`;
    }).join('')}</div>`;
    view.querySelector('[data-info]').innerHTML = venc ? `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>${venc} vencida${venc > 1 ? 's' : ''}</span>` : '';
  }

  async function cargar() { rows = (await api('/api/tareas/tareas?limit=1000')).rows; pintar(); }

  view.innerHTML = `<div class="d-flex flex-wrap gap-2 align-items-center mb-3"><div class="btn-group btn-group-sm" role="group"><button class="btn btn-outline-secondary active" data-ver="todas">Todas</button><button class="btn btn-outline-secondary" data-ver="mias">Mis tareas</button></div><span data-info></span></div><div data-k></div>`;
  view.addEventListener('click', (e) => {
    const v = e.target.closest('[data-ver]');
    if (v) { soloMias = v.dataset.ver === 'mias'; view.querySelectorAll('[data-ver]').forEach((b) => b.classList.toggle('active', b === v)); return pintar(); }
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
