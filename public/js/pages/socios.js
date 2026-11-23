// Socios: arriba la Junta (con su cargo, en el orden oficial) y abajo los demás socios sin cargo. Ficha de cada socio con
// botón «Activar» (genera el certificado de activación para descargar). Pestaña «Activación»: el certificado de cada socio.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal, confirm } = window.App;
  const C = window.App.Crud;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const RO_ = window.RO, M = me.canManage, RO_APP = me.business.readOnly;
  const CARGOS = ['Presidente/a del club', 'Vicepresidente/a del club', 'Secretario/a del club', 'Tesorero/a del club', 'Macero/a del club', 'Director/a de Servicio al Club', 'Director/a de Servicio a la Comunidad',
    'Director/a de Servicio Internacional', 'Director/a de Desarrollo Profesional', 'Director/a de Imagen Pública', 'Director/a de Proyectos', 'Presidente/a del Comité de la Fundación del club'];
  let tab = location.hash === '#activacion' ? 'activacion' : 'socios', filtro = '', rows = [];
  const nav = RO_.nav(tab);
  nav?.addEventListener('click', (e) => { const a = e.target.closest('a[data-club]'); if (!a || !['socios', 'activacion'].includes(a.dataset.club)) return; e.preventDefault(); tab = a.dataset.club; history.replaceState(null, '', tab === 'activacion' ? '#activacion' : '#'); nav.querySelectorAll('a').forEach((x) => x.classList.toggle('on', x === a)); pintar(); });

  if (M && !RO_APP) acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-person-plus me-1"></i>Nuevo socio</button>';
  acciones.querySelector('[data-nuevo]')?.addEventListener('click', () => editar(null));

  const campos = (s) => [{ k: 'nombre', label: 'Nombre completo', type: 'text', required: true, full: true },
    { k: 'cargo', label: 'Cargo en la junta', type: 'select', options: [['', 'Sin cargo (socio)'], ...[...new Set([...CARGOS, ...(s?.cargo ? [s.cargo] : [])])].map((x) => [x, x])] },
    { k: 'tipo_membresia', label: 'Tipo de membresía', type: 'select', options: Object.entries(RO_.TIPO) }, { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(RO_.ESTADO).map(([k, [, l]]) => [k, l]) },
    { k: 'email', label: 'Correo', type: 'email' }, { k: 'telefono', label: 'Celular', type: 'text' }, { k: 'documento', label: 'Documento', type: 'text' }, { k: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
    { k: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date' }, { k: 'profesion', label: 'Profesión', type: 'text' }, { k: 'instagram', label: 'Instagram', type: 'text' },
    { k: 'paga_cuota', label: 'Cuotas', type: 'bool', check: 'Paga cuota mensual', default: true }, { k: 'notas', label: 'Notas', type: 'long' }];

  async function editar(s) {
    const out = await C.form({ title: s ? `Editar a ${s.nombre}` : 'Nuevo socio', fields: campos(s), values: s ? { ...s } : { estado: 'activo', tipo_membresia: 'socio', paga_cuota: 1 },
      onDelete: s ? () => api(`/api/socios/socios/${s.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Socio borrado'); return cargar(); }
    if (!out) return;
    try { await api(s ? `/api/socios/socios/${s.id}` : '/api/socios/socios', { method: s ? 'PATCH' : 'POST', body: out }); toast(s ? 'Guardado' : 'Socio creado'); cargar(); } catch (x) { toast(x.message, false); }
  }

  const certificado = (s) => window.open(`/api/socios/socios/${s.id}/certificado`, '_blank', 'noopener');
  async function activar(s) {
    if (!(await confirm({ title: `¿Activar a ${s.nombre}?`, text: 'Queda activo en el club y se genera su certificado de activación con un código único.', ok: 'Activar', danger: false }))) return false;
    try { const r = await api(`/api/socios/socios/${s.id}/activar`, { method: 'POST', body: {} }); toast(`Activado · ${r.codigo}`); await cargar(); return true; } catch (x) { toast(x.message, false); return false; }
  }

  async function ficha(s0) {
    const { el, m } = modal('<div class="modal-body p-4 text-center text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    let d; try { d = await api(`/api/socios/socios/${s0.id}/ficha`); } catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const s = d.socio, cu = d.cuota, mio = s.user_id && s.user_id === me.user.id;
    const linea = (i, t) => (t ? `<div class="d-flex gap-2 small"><i class="bi ${i} text-body-secondary"></i><span>${t}</span></div>` : '');
    el.querySelector('.modal-content').innerHTML = `<div class="modal-header border-0 pb-0"><button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body pt-0">
        <div class="d-flex gap-3 align-items-center mb-3">${RO_.avatar(s, 84)}<div class="min-w-0"><h2 class="h4 mb-1">${esc(s.nombre)}</h2>
          ${s.junta ? `<div class="fw-semibold" style="color:var(--dw-p)">${esc(s.cargo)}</div>` : ''}
          <div class="d-flex flex-wrap gap-1 mt-1">${C.chip(...(RO_.ESTADO[s.estado] || RO_.ESTADO.activo))} <span class="badge rounded-pill text-bg-light">${esc(RO_.TIPO[s.tipo_membresia] || s.tipo_membresia)}</span>
          ${s.activado ? `<span class="badge rounded-pill text-bg-success"><i class="bi bi-patch-check me-1"></i>Activado ${C.day(s.activado_at)}</span>` : '<span class="badge rounded-pill text-bg-warning">Sin activar</span>'}</div></div></div>
        <div class="row g-2 mb-3">
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-4 fw-bold">${d.asistencia.pct ?? '—'}${d.asistencia.pct != null ? '%' : ''}</div><div class="small text-body-secondary">Asistencia (${d.asistencia.presente}/${d.asistencia.total})</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-4 fw-bold">${d.tareas.filter((t) => t.estado !== 'hecha').length}</div><div class="small text-body-secondary">Tareas abiertas</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-4 fw-bold ${cu?.saldo ? 'text-danger' : ''}">${cu ? (cu.saldo ? C.money(cu.saldo) : 'Al día') : '—'}</div><div class="small text-body-secondary">Cuotas</div></div></div>
        </div>
        <div class="d-grid gap-1 mb-3">${linea('bi-envelope', esc(s.email || ''))}${linea('bi-phone', esc(s.telefono || ''))}${linea('bi-briefcase', esc(s.profesion || ''))}${linea('bi-calendar-check', s.fecha_ingreso ? `Ingresó el ${C.day(s.fecha_ingreso)}` : '')}${linea('bi-instagram', esc(s.instagram || ''))}</div>
        ${d.tareas.length ? `<div class="ro-h mt-0">Tareas</div><ul class="list-unstyled small mb-0">${d.tareas.slice(0, 8).map((t) => `<li class="d-flex gap-2 py-1 border-bottom"><i class="bi ${t.estado === 'hecha' ? 'bi-check-circle-fill text-success' : 'bi-circle'}"></i><span class="flex-grow-1">${esc(t.titulo)}</span><span class="text-body-secondary">${t.fecha_limite ? C.day(t.fecha_limite) : ''}</span></li>`).join('')}</ul>` : ''}
      </div>
      <div class="modal-footer border-0 flex-wrap gap-2 justify-content-start">
        ${s.activado ? (M || mio ? '<button class="btn btn-outline-primary" data-cert><i class="bi bi-download me-1"></i>Descargar activación</button>' : '') : M && !RO_APP ? '<button class="btn btn-primary" data-act><i class="bi bi-patch-check me-1"></i>Activar</button>' : ''}
        ${M && !RO_APP ? `<button class="btn btn-light" data-edit><i class="bi bi-pencil me-1"></i>Editar</button><button class="btn btn-light" data-foto><i class="bi bi-camera me-1"></i>Foto</button>${s.user_id ? '' : '<button class="btn btn-light" data-acceso><i class="bi bi-key me-1"></i>Dar acceso a la app</button>'}` : ''}
      </div>`;
    const on = (sel, f) => el.querySelector(sel)?.addEventListener('click', f);
    on('[data-cert]', () => certificado(s));
    on('[data-act]', async () => { if (await activar(s)) { m.hide(); ficha(s); } });
    on('[data-edit]', () => { m.hide(); editar(rows.find((x) => x.id === s.id) || s); });
    on('[data-foto]', async () => { const f = await RO_.elegirArchivo('image/*'); if (!f) return; try { await RO_.subir(`/api/socios/socios/${s.id}/foto`, f); toast('Foto actualizada'); m.hide(); await cargar(); ficha(s); } catch (x) { toast(x.message, false); } });
    on('[data-acceso]', async () => {
      try {
        const r = await api(`/api/socios/socios/${s.id}/acceso`, { method: 'POST', body: {} });
        el.querySelector('.modal-footer').insertAdjacentHTML('beforeend', `<div class="w-100 small">Envíale este enlace para que cree su contraseña:<div class="input-group mt-1"><input class="form-control form-control-sm" readonly value="${esc(r.invite_url)}"><button class="btn btn-sm btn-primary" data-copiar>Copiar</button></div></div>`);
        el.querySelector('[data-copiar]').onclick = () => navigator.clipboard?.writeText(r.invite_url).then(() => toast('Enlace copiado'));
        el.querySelector('[data-acceso]').remove();
      } catch (x) { toast(x.message, false); }
    });
  }

  const tarjetaJunta = (s) => `<button type="button" class="ro-jcard" data-id="${s.id}">${RO_.avatar(s, 76)}<b>${esc(s.nombre)}</b><span class="cargo">${esc(s.cargo)}</span>${s.activado ? '' : '<span class="badge rounded-pill text-bg-warning">Sin activar</span>'}</button>`;
  const tarjetaSocio = (s) => `<button type="button" class="ro-scard" data-id="${s.id}">${RO_.avatar(s, 44)}<span class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(s.nombre)}</b><span class="small text-body-secondary">${esc(RO_.TIPO[s.tipo_membresia] || '')}</span></span>${s.estado !== 'activo' ? C.chip(...(RO_.ESTADO[s.estado] || RO_.ESTADO.activo)) : s.activado ? '<i class="bi bi-patch-check-fill text-success" title="Activado"></i>' : ''}</button>`;

  function pintarSocios() {
    const q = filtro.toLowerCase(), f = rows.filter((s) => !q || `${s.nombre} ${s.cargo || ''} ${s.profesion || ''}`.toLowerCase().includes(q));
    const vivos = f.filter((s) => ['activo', 'aspirante'].includes(s.estado));
    const junta = vivos.filter((s) => s.junta).sort((a, b) => a.orden_cargo - b.orden_cargo || a.nombre.localeCompare(b.nombre));
    const demas = vivos.filter((s) => !s.junta).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const otros = f.filter((s) => !['activo', 'aspirante'].includes(s.estado));
    view.querySelector('[data-lista]').innerHTML = (rows.length ? '' : window.App.empty('bi-people', 'Aún no hay socios. Crea la junta y los socios del club.'))
      + (junta.length ? `<div class="ro-h mt-0"><i class="bi bi-award me-1"></i>Junta directiva</div><div class="ro-junta">${junta.map(tarjetaJunta).join('')}</div>` : '')
      + (demas.length ? `<div class="ro-h">Socios (${demas.length})</div><div class="ro-socios">${demas.map(tarjetaSocio).join('')}</div>` : '')
      + (otros.length ? `<details class="mt-3"><summary class="ro-h d-inline-block">Inactivos y retirados (${otros.length})</summary><div class="ro-socios mt-2">${otros.map(tarjetaSocio).join('')}</div></details>` : '');
  }

  function pintarActivacion() {
    const act = rows.filter((s) => ['activo', 'aspirante'].includes(s.estado)).sort((a, b) => Number(a.activado) - Number(b.activado) || a.orden_cargo - b.orden_cargo || a.nombre.localeCompare(b.nombre));
    const hechos = act.filter((s) => s.activado).length;
    view.querySelector('[data-lista]').innerHTML = `<div class="dw-card mb-3"><div class="d-flex justify-content-between small mb-1"><b>Socios activados</b><span>${hechos} de ${act.length}</span></div>${C.meter(hechos, act.length || 1)}</div>`
      + (act.length ? window.App.table([
        { label: 'Socio', main: true, html: (s) => `<span class="d-flex align-items-center gap-2">${RO_.avatar(s, 32)}<span>${esc(s.nombre)}${s.junta ? `<div class="small text-body-secondary fw-normal">${esc(s.cargo)}</div>` : ''}</span></span>` },
        { label: 'Estado', html: (s) => (s.activado ? '<span class="badge rounded-pill text-bg-success"><i class="bi bi-patch-check me-1"></i>Activado</span>' : '<span class="badge rounded-pill text-bg-warning">Pendiente</span>') },
        { label: 'Fecha', html: (s) => (s.activado_at ? C.day(s.activado_at) : '—') },
        { label: 'Código', html: (s) => esc(s.activacion_codigo || '—') },
        { label: '', cls: 'text-end text-nowrap', html: (s) => (s.activado ? `<button class="btn btn-sm btn-outline-primary" data-cert="${s.id}"><i class="bi bi-download me-1"></i>Certificado</button>` : M && !RO_APP ? `<button class="btn btn-sm btn-primary" data-activar="${s.id}"><i class="bi bi-patch-check me-1"></i>Activar</button>` : '') },
      ], act) : window.App.empty('bi-patch-check', 'No hay socios activos todavía.'));
  }

  function pintar() {
    document.querySelector('[data-h1]').textContent = tab === 'activacion' ? 'Activación' : 'Socios';
    view.querySelector('[data-buscar]').hidden = tab !== 'socios';
    (tab === 'activacion' ? pintarActivacion : pintarSocios)();
  }

  async function cargar() {
    rows = await RO_.socios(true);
    const activos = rows.filter((s) => s.estado === 'activo');
    C.kpis(view.querySelector('[data-kpis]'), [['Socios activos', activos.length, '', 'bi-people'], ['En la junta', activos.filter((s) => s.junta).length, '', 'bi-award'],
      ['Aspirantes', rows.filter((s) => s.estado === 'aspirante').length, '', 'bi-person-plus'], ['Sin activar', activos.filter((s) => !s.activado).length, 'certificado pendiente', 'bi-patch-exclamation']]);
    pintar();
  }

  view.innerHTML = `<div class="dw-grid dw-grid--kpi mb-3" data-kpis></div>
    <div class="mb-3" data-buscar><input class="form-control" placeholder="Buscar socio, cargo o profesión…" style="max-width:340px" aria-label="Buscar socio"></div><div data-lista></div>`;
  view.querySelector('[data-buscar] input').addEventListener('input', (e) => { filtro = e.target.value.trim(); pintarSocios(); });
  view.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cert]'); if (c) return certificado({ id: c.dataset.cert });
    const a = e.target.closest('[data-activar]'); if (a) return activar(rows.find((s) => String(s.id) === a.dataset.activar));
    const t = e.target.closest('[data-id]'); if (t) ficha(rows.find((s) => String(s.id) === t.dataset.id));
  });
  await cargar();
});
