// Socios: arriba la Junta (con su cargo, en el orden oficial) y abajo los demás socios sin cargo. Ficha de cada socio con
// botón «Activar» (genera el certificado de activación para descargar). Pestaña «Certificados»: todos (activación, junta y reconocimientos) y «Nueva activación».
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal, confirm } = window.App;
  const C = window.App.Crud;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const RO_ = window.RO, M = me.canManage, RO_APP = me.business.readOnly;
  const CARGOS = ['Presidente/a del club', 'Vicepresidente/a del club', 'Secretario/a del club', 'Tesorero/a del club', 'Macero/a del club', 'Director/a de Servicio al Club', 'Director/a de Servicio a la Comunidad',
    'Director/a de Servicio Internacional', 'Director/a de Desarrollo Profesional', 'Director/a de Imagen Pública', 'Director/a de Proyectos', 'Presidente/a del Comité de la Fundación del club'];
  let tab = location.hash === '#certificados' || location.hash === '#activacion' ? 'certificados' : 'socios', filtro = '', rows = [], chip = 'todos';
  let vista = (() => { try { return localStorage.getItem('ro_socios_vista') || 'tarjetas'; } catch (_) { return 'tarjetas'; } })();
  RO_.nav(tab, (k) => { tab = k; pintar(); });

  if (M && !RO_APP) acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-person-plus me-1"></i>Nuevo socio</button>';
  acciones.querySelector('[data-nuevo]')?.addEventListener('click', () => editar(null));

  const campos = (s) => [{ k: 'nombre', label: 'Nombre completo', type: 'text', required: true, full: true },
    { k: 'cargo', label: 'Cargo en la junta', type: 'select', options: [['', 'Sin cargo (socio)'], ...[...new Set([...CARGOS, ...(s?.cargo ? [s.cargo] : [])])].map((x) => [x, x])] },
    { k: 'tipo_membresia', label: 'Tipo de membresía', type: 'select', options: Object.entries(RO_.TIPO) }, { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(RO_.ESTADO).map(([k, [, l]]) => [k, l]) },
    { k: 'email', label: 'Correo', type: 'email' }, { k: 'telefono', label: 'Celular', type: 'text' }, { k: 'documento', label: 'Documento', type: 'text' }, { k: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
    { k: 'fecha_ingreso', label: '1 · Ingreso al club', type: 'date' }, { k: 'activado_at', label: '2 · Activación en el club', type: 'date', hint: 'con certificado' },
    { k: 'myrotary_at', label: '3 · Activación en My Rotary', type: 'date' }, { k: 'myrotary_id', label: 'ID de My Rotary', type: 'text', hint: 'su código de socio' }, { k: 'profesion', label: 'Profesión', type: 'text' }, { k: 'instagram', label: 'Instagram', type: 'text' },
    { k: 'paga_cuota', label: 'Cuotas', type: 'bool', check: 'Paga cuota mensual', default: true }, { k: 'notas', label: 'Notas', type: 'long' }];

  async function editar(s) {
    const out = await C.form({ title: s ? `Editar a ${s.nombre}` : 'Nuevo socio', fields: campos(s), values: s ? { ...s } : { estado: 'activo', tipo_membresia: 'socio', paga_cuota: 1 },
      onDelete: s ? () => api(`/api/socios/socios/${s.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Socio borrado'); return cargar(); }
    if (!out) return;
    try { await api(s ? `/api/socios/socios/${s.id}` : '/api/socios/socios', { method: s ? 'PATCH' : 'POST', body: out }); toast(s ? 'Guardado' : 'Socio creado'); cargar(); } catch (x) { toast(x.message, false); }
  }

  const certificado = (s) => window.open(`/api/socios/socios/${s.id}/certificado`, '_blank', 'noopener');
  // Activar en el club: pide la fecha (por defecto hoy) y genera el certificado. My Rotary se registra aparte en la ficha.
  async function activar(s) {
    const out = await C.form({ title: `Activar a ${s.nombre} en el club`, fields: [{ k: 'fecha', label: 'Fecha de activación en el club', type: 'date', required: true, hint: 'queda en su certificado' }],
      values: { fecha: C.todayCo() }, okText: 'Activar' });
    if (!out) return false;
    try { await api(`/api/socios/socios/${s.id}/activar`, { method: 'POST', body: out }); toast('Activado en el club: ya tiene su certificado'); await cargar(); return true; } catch (x) { toast(x.message, false); return false; }
  }
  // Las 3 fechas de cada socio
  const fechas = (s) => `<div class="ro-3f">
      <div class="${s.fecha_ingreso ? 'on' : ''}"><i class="bi bi-door-open"></i><span>Ingreso al club</span><b>${s.fecha_ingreso ? C.day(s.fecha_ingreso) : '—'}</b></div>
      <div class="${s.activado_at ? 'on' : ''}"><i class="bi bi-patch-check"></i><span>Activación en el club</span><b>${s.activado_at ? C.day(s.activado_at) : 'Sin activar'}</b></div>
      <div class="${s.myrotary_at || s.myrotary_id ? 'on' : ''}"><i class="bi bi-globe2"></i><span>My Rotary</span><b>${s.myrotary_at ? C.day(s.myrotary_at) : s.myrotary_id ? 'Sin fecha' : 'No está'}</b>${s.myrotary_id ? `<small>ID ${esc(s.myrotary_id)}</small>` : ''}</div></div>`;

  // Ciclo del socio: lo que le falta para quedar completo (ingreso → activación con certificado → My Rotary, acceso y firma si es junta)
  function pasos(s, R) {
    if (!['activo', 'aspirante'].includes(s.estado) || ['socio_externo', 'voluntario_invitado'].includes(s.tipo_membresia) && !s.junta) return '';
    const p = [];
    if (!s.fecha_ingreso) p.push(['bi-door-open', 'Registrar la fecha de ingreso al club', M ? `data-editar="${s.id}"` : '']);
    if (s.estado === 'aspirante' || s.tipo_membresia === 'aspirante') p.push(['bi-hourglass-split', 'Aspirante: cuando cumpla el proceso, cámbialo a socio y actívalo', M ? `data-editar="${s.id}"` : '']);
    else if (!s.activado) p.push(['bi-patch-check', 'Activarlo en el club (genera su certificado)', M ? `data-activar="${s.id}"` : '']);
    if (!s.myrotary_id && !s.myrotary_at && s.estado === 'activo') p.push(['bi-globe2', 'Registrarlo en My Rotary', M ? `data-mr="${s.id}"` : '']);
    if (!s.email) p.push(['bi-envelope', 'Falta su correo (sin él no puede entrar a la app)', M ? `data-editar="${s.id}"` : '']);
    else if (!(R && R.acceso)) p.push(['bi-key', 'Darle acceso a la app', '']);
    if (s.junta && !s.tiene_firma) p.push(['bi-pen', 'Falta su firma para los certificados', '']);
    if (!p.length) return '<div class="alert alert-success py-2 small d-flex align-items-center gap-2"><i class="bi bi-check-circle-fill"></i>Ficha completa: no le falta ningún paso.</div>';
    return `<div class="dw-card p-2 mb-3" style="border-left:4px solid var(--bs-warning)"><div class="small fw-semibold mb-1">Le falta (${p.length})</div>
      ${p.map(([i, t, a]) => `<div class="d-flex align-items-center gap-2 small py-1"><i class="bi ${i} text-warning"></i><span class="flex-grow-1">${t}</span>${a && !RO_APP ? `<button type="button" class="btn btn-sm btn-light py-0" ${a}>Hacerlo</button>` : ''}</div>`).join('')}</div>`;
  }

  async function ficha(s0) {
    const { el, m } = modal('<div class="modal-body p-4 text-center text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    let d; try { d = await api(`/api/socios/socios/${s0.id}/ficha`); } catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const s = d.socio, cu = d.cuota, mio = s.user_id && s.user_id === me.user.id, R0 = rows.find((x) => x.id === s0.id) || s0;
    const linea = (i, t) => (t ? `<div class="d-flex gap-2 small"><i class="bi ${i} text-body-secondary"></i><span>${t}</span></div>` : '');
    el.querySelector('.modal-content').innerHTML = `<div class="modal-header border-0 pb-0"><button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body pt-0">
        <div class="d-flex gap-3 align-items-center mb-3">${RO_.avatar(s, 84)}<div class="min-w-0"><h2 class="h4 mb-1">${esc(s.nombre)}</h2>
          ${s.junta ? `<div class="fw-semibold" style="color:var(--dw-p)">${esc(s.cargo)}</div>` : ''}
          <div class="d-flex flex-wrap gap-1 mt-1">${C.chip(...(RO_.ESTADO[s.estado] || RO_.ESTADO.activo))} <span class="badge rounded-pill text-bg-light">${esc(RO_.TIPO[s.tipo_membresia] || s.tipo_membresia)}</span>
          ${s.activado ? '<span class="badge rounded-pill text-bg-success"><i class="bi bi-patch-check me-1"></i>Activo en el club</span>' : '<span class="badge rounded-pill text-bg-warning">Sin activar</span>'} ${s.myrotary_id || s.myrotary_at ? '<span class="badge rounded-pill text-bg-info"><i class="bi bi-globe2 me-1"></i>En My Rotary</span>' : '<span class="badge rounded-pill text-bg-light border">Sin My Rotary</span>'}</div></div></div>
        ${fechas(s)}
        ${pasos(s, R0)}
        <div class="row g-2 mb-3">
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-4 fw-bold">${d.asistencia.pct ?? '—'}${d.asistencia.pct != null ? '%' : ''}</div><div class="small text-body-secondary">Asistencia (${d.asistencia.presente}/${d.asistencia.total})</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-4 fw-bold">${d.tareas.filter((t) => t.estado !== 'hecha').length}</div><div class="small text-body-secondary">Tareas abiertas</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-4 fw-bold ${cu?.saldo ? 'text-danger' : ''}">${cu ? (cu.saldo ? C.money(cu.saldo) : 'Al día') : '—'}</div><div class="small text-body-secondary">Cuotas</div></div></div>
        </div>
        <div class="dw-card p-2 mb-3 d-flex align-items-center gap-2 flex-wrap"><span class="small text-body-secondary">Acceso a la app</span>${accesoBadge(R0)}
          ${M && !RO_APP && R0.acceso && R0.acceso.rol !== 'owner' && s.user_id !== me.user.id ? `<select class="form-select form-select-sm ms-auto" style="width:auto" data-rol aria-label="Tipo de acceso"><option value="admin" ${R0.acceso.rol === 'admin' ? 'selected' : ''}>Junta: ve y edita todo</option><option value="staff" ${R0.acceso.rol === 'staff' ? 'selected' : ''}>Socio: lo del club y lo suyo</option></select>
            ${R0.acceso.estado === 'invitado' ? '<button class="btn btn-sm btn-light" data-reinv><i class="bi bi-link-45deg"></i> Enlace</button>' : ''}` : ''}</div>
        <div class="d-grid gap-1 mb-3">${linea('bi-envelope', esc(s.email || ''))}${linea('bi-phone', esc(s.telefono || ''))}${linea('bi-briefcase', esc(s.profesion || ''))}${linea('bi-instagram', esc(s.instagram || ''))}</div>
        ${d.tareas.length ? `<div class="ro-h mt-0">Tareas</div><ul class="list-unstyled small mb-0">${d.tareas.slice(0, 8).map((t) => `<li class="d-flex gap-2 py-1 border-bottom"><i class="bi ${t.estado === 'hecha' ? 'bi-check-circle-fill text-success' : 'bi-circle'}"></i><span class="flex-grow-1">${esc(t.titulo)}</span><span class="text-body-secondary">${t.fecha_limite ? C.day(t.fecha_limite) : ''}</span></li>`).join('')}</ul>` : ''}
      </div>
      <div class="modal-footer border-0 flex-wrap gap-2 justify-content-start">
        ${s.activado ? (M || mio ? '<button class="btn btn-outline-primary" data-cert><i class="bi bi-download me-1"></i>Descargar activación</button>' : '') : M && !RO_APP ? '<button class="btn btn-primary" data-act><i class="bi bi-patch-check me-1"></i>Activar</button>' : ''}
        ${M && !RO_APP ? `<button class="btn btn-light" data-edit><i class="bi bi-pencil me-1"></i>Editar</button><button class="btn btn-light" data-foto><i class="bi bi-camera me-1"></i>Foto</button>${s.junta ? `<button class="btn btn-light" data-firma><i class="bi bi-pen me-1"></i>${R0.tiene_firma ? 'Cambiar firma' : 'Firma'}</button>` : ''}${s.user_id ? '' : '<button class="btn btn-light" data-acceso><i class="bi bi-key me-1"></i>Dar acceso a la app</button>'}` : ''}
      </div>`;
    const on = (sel, f) => el.querySelector(sel)?.addEventListener('click', f);
    on('[data-cert]', () => certificado(s));
    on('[data-firma]', async () => { m.hide(); if (await RO_.firmar(`/api/socios/socios/${s.id}/firma`, { titulo: `Firma de ${s.nombre}`, actual: R0.tiene_firma ? `/api/socios/firma/${s.id}?v=${Date.now()}` : null })) cargar(); });
    on('[data-act]', async () => { if (await activar(s)) { m.hide(); ficha(s); } });
    // Botones «Hacerlo» de los pasos pendientes
    el.querySelectorAll('[data-activar]').forEach((b) => b.addEventListener('click', async () => { if (await activar(s)) { m.hide(); ficha(s); } }));
    el.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => { m.hide(); editar(rows.find((x) => x.id === s.id) || s); }));
    el.querySelectorAll('[data-mr]').forEach((b) => b.addEventListener('click', async () => { m.hide(); await myRotary(rows.find((x) => x.id === s.id) || s); }));
    on('[data-edit]', () => { m.hide(); editar(rows.find((x) => x.id === s.id) || s); });
    on('[data-foto]', async () => { const f = await RO_.elegirArchivo('image/*'); if (!f) return; try { await RO_.subir(`/api/socios/socios/${s.id}/foto`, f); toast('Foto actualizada'); m.hide(); await cargar(); ficha(s); } catch (x) { toast(x.message, false); } });
    el.querySelector('[data-rol]')?.addEventListener('change', async (e) => {
      try { await api(`/api/team/${s.user_id}`, { method: 'PATCH', body: { role: e.target.value } }); toast(`Ahora tiene acceso de ${ROL[e.target.value][0]}`); await cargar(); } catch (x) { toast(x.message, false); }
    });
    on('[data-reinv]', async () => { try { const r = await api(`/api/team/${s.user_id}/invite`, { method: 'POST', body: {} }); await navigator.clipboard?.writeText(r.invite_url); toast('Enlace de invitación copiado'); } catch (x) { toast(x.message, false); } });
    on('[data-acceso]', async () => {
      try {
        const r = await api(`/api/socios/socios/${s.id}/acceso`, { method: 'POST', body: {} });
        el.querySelector('.modal-footer').insertAdjacentHTML('beforeend', `<div class="w-100 small">Envíale este enlace para que cree su contraseña:<div class="input-group mt-1"><input class="form-control form-control-sm" readonly value="${esc(r.invite_url)}"><button class="btn btn-sm btn-primary" data-copiar>Copiar</button></div></div>`);
        el.querySelector('[data-copiar]').onclick = () => navigator.clipboard?.writeText(r.invite_url).then(() => toast('Enlace copiado'));
        el.querySelector('[data-acceso]').remove();
      } catch (x) { toast(x.message, false); }
    });
  }

  const tarjetaJunta = (s) => `<button type="button" class="ro-jcard" data-id="${s.id}">${RO_.avatar(s, 76)}<b>${esc(s.nombre)}</b><span class="cargo">${esc(s.cargo)}</span>${accesoBadge(s)}${s.activado ? '' : '<span class="badge rounded-pill text-bg-warning">Sin activar</span>'}</button>`;
  const tarjetaSocio = (s) => `<button type="button" class="ro-scard" data-id="${s.id}">${RO_.avatar(s, 44)}<span class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(s.nombre)}</b><span class="small text-body-secondary">${esc(RO_.TIPO[s.tipo_membresia] || '')}</span> ${accesoBadge(s)}</span>${s.estado !== 'activo' ? C.chip(...(RO_.ESTADO[s.estado] || RO_.ESTADO.activo)) : s.activado ? '<i class="bi bi-patch-check-fill text-success" title="Activado"></i>' : ''}</button>`;

  // Acceso a la app: Presidencia (owner) · Junta (admin, ve y edita todo) · Socio (staff, ve lo del club y lo suyo) · invitado · sin acceso
  const ROL = { owner: ['Acceso completo', 'bi-shield-fill-check', '#7c3aed'], admin: ['Junta', 'bi-shield-check', '#0284c7'], staff: ['Socio', 'bi-person-badge', '#16a34a'] };
  const accesoBadge = (s) => { if (!s.acceso) return '<span class="ro-acc" style="--c:#94a3b8"><i class="bi bi-slash-circle"></i>Sin acceso</span>';
    const [l, i, c] = ROL[s.acceso.rol] || ROL.staff; return `<span class="ro-acc" style="--c:${c}"><i class="bi ${i}"></i>${l}${s.acceso.estado === 'invitado' ? ' · invitado' : ''}</span>`; };
  // [tipo, título, nota, ícono]. La junta (con cargo) va aparte, arriba.
  const GRUPOS = [['socio', 'Socios', 'miembros del club', 'bi-person-check'], ['honorario', 'Honorarios', '', 'bi-star'], ['aspirante', 'Aspirantes', 'en proceso de ingreso', 'bi-hourglass-split'],
    ['socio_externo', 'Socios externos', 'entran a la app, pero no son socios del club', 'bi-box-arrow-in-right'], ['voluntario_invitado', 'Voluntarios invitados', 'apoyan sin ser socios', 'bi-hand-thumbs-up']];
  // Filtros rápidos con conteo. Externos y voluntarios van plegados (no son socios del club) salvo que se filtre por ellos o se busque.
  const grupo = (s) => (s.estado === 'aspirante' ? 'aspirante' : s.tipo_membresia || 'socio');
  const vivo = (s) => ['activo', 'aspirante'].includes(s.estado);
  const miembro = (s) => s.junta || ['socio', 'honorario'].includes(grupo(s));
  const CHIPS = [['todos', 'Todos', (s) => vivo(s)], ['junta', 'Junta', (s) => vivo(s) && s.junta], ['socios', 'Socios', (s) => vivo(s) && !s.junta && ['socio', 'honorario'].includes(grupo(s))],
    ['aspirantes', 'Aspirantes', (s) => vivo(s) && !s.junta && grupo(s) === 'aspirante'], ['externos', 'Externos', (s) => vivo(s) && !s.junta && grupo(s) === 'socio_externo'],
    ['voluntarios', 'Voluntarios', (s) => vivo(s) && !s.junta && grupo(s) === 'voluntario_invitado'], ['sin_activar', 'Sin activar', (s) => s.estado === 'activo' && miembro(s) && !s.activado],
    ['sin_acceso', 'Sin acceso', (s) => vivo(s) && miembro(s) && !s.acceso], ['inactivos', 'Inactivos', (s) => !vivo(s)]];
  const PLEGADOS = new Set(['socio_externo', 'voluntario_invitado']);
  function pintarSocios() {
    const q = filtro.toLowerCase(), f0 = rows.filter((s) => !q || `${s.nombre} ${s.cargo || ''} ${s.profesion || ''}`.toLowerCase().includes(q));
    const regla = (CHIPS.find((c) => c[0] === chip) || CHIPS[0])[2];
    view.querySelector('[data-chips]').innerHTML = CHIPS.map(([k, l, fn]) => { const n = f0.filter(fn).length; return n || k === chip || k === 'todos'
      ? `<button type="button" class="btn btn-sm rounded-pill ${k === chip ? 'btn-primary' : 'btn-light'}" data-chip="${k}">${l} <span class="badge rounded-pill ${k === chip ? 'text-bg-light' : 'text-bg-secondary'}">${n}</span></button>` : ''; }).join('')
      + `<div class="btn-group btn-group-sm ms-auto" role="group" aria-label="Vista"><button type="button" class="btn ${vista === 'tarjetas' ? 'btn-primary' : 'btn-light'}" data-vista="tarjetas" title="Tarjetas"><i class="bi bi-grid-3x2-gap"></i></button><button type="button" class="btn ${vista === 'tabla' ? 'btn-primary' : 'btn-light'}" data-vista="tabla" title="Tabla"><i class="bi bi-table"></i></button></div>`;
    const f = chip === 'todos' ? f0 : f0.filter(regla);
    const L = view.querySelector('[data-lista]');
    if (!rows.length) { L.innerHTML = window.App.empty('bi-people', 'Aún no hay socios. Crea la junta y los socios del club.'); return; }
    if (!f.length) { L.innerHTML = window.App.empty('bi-search', 'Nadie con ese filtro.'); return; }
    if (vista === 'tabla') {
      const orden = [...f].sort((a, b) => (a.junta ? a.orden_cargo : 99) - (b.junta ? b.orden_cargo : 99) || a.nombre.localeCompare(b.nombre));
      L.innerHTML = `<div class="dw-card p-0 table-responsive"><table class="table dw-table align-middle mb-0"><thead><tr><th>Nombre</th><th>Cargo / tipo</th><th>Estado</th><th>Ingreso</th><th>Activación</th><th>My Rotary</th><th>Acceso</th></tr></thead><tbody>
        ${orden.map((s) => `<tr data-id="${s.id}" style="cursor:pointer"><td><div class="d-flex align-items-center gap-2">${RO_.avatar(s, 30)}<b>${esc(s.nombre)}</b></div></td>
          <td>${s.junta ? esc(s.cargo) : esc(RO_.TIPO[s.tipo_membresia] || '')}</td><td>${C.chip(...(RO_.ESTADO[s.estado] || RO_.ESTADO.activo))}</td>
          <td data-order="${esc(s.fecha_ingreso || '')}">${s.fecha_ingreso ? C.day(s.fecha_ingreso) : '—'}</td><td data-order="${esc(s.activado_at || '')}">${s.activado ? C.day(s.activado_at) : miembro(s) ? '<span class="badge text-bg-warning">Sin activar</span>' : '—'}</td>
          <td>${s.myrotary_id ? esc(s.myrotary_id) : '—'}</td><td>${accesoBadge(s)}</td></tr>`).join('')}</tbody></table></div>`;
      return;
    }
    const vivos = f.filter(vivo);
    const junta = vivos.filter((s) => s.junta).sort((a, b) => a.orden_cargo - b.orden_cargo || a.nombre.localeCompare(b.nombre));
    const demas = vivos.filter((s) => !s.junta).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const otros = f.filter((s) => !vivo(s));
    // Después de la junta, un grupo por tipo: los socios del club primero y los externos e invitados al final (plegados)
    const bloques = GRUPOS.map(([k, titulo, nota, ic]) => [k, titulo, nota, ic, demas.filter((s) => grupo(s) === k)]).filter(([, , , , l]) => l.length);
    const abierto = (k) => !PLEGADOS.has(k) || q || chip !== 'todos';
    const cab = (t, nota, ic, n) => `<i class="bi ${ic} me-1"></i>${t} (${n})${nota ? ` <span class="fw-normal" style="text-transform:none;letter-spacing:0">· ${nota}</span>` : ''}`;
    L.innerHTML = (junta.length ? `<div class="ro-h mt-0"><i class="bi bi-award me-1"></i>Junta directiva (${junta.length})</div><div class="ro-junta">${junta.map(tarjetaJunta).join('')}</div>` : '')
      + bloques.map(([k, t, nota, ic, l]) => `<details class="ro-grupo" ${abierto(k) ? 'open' : ''}><summary class="ro-h">${cab(t, nota, ic, l.length)}</summary><div class="ro-socios">${l.map(tarjetaSocio).join('')}</div></details>`).join('')
      + (otros.length ? `<details class="mt-3" ${chip === 'inactivos' ? 'open' : ''}><summary class="ro-h d-inline-block">Inactivos y retirados (${otros.length})</summary><div class="ro-socios mt-2">${otros.map(tarjetaSocio).join('')}</div></details>` : '');
  }

  async function myRotary(s) {
    const out = await C.form({ title: `My Rotary · ${s.nombre}`, fields: [{ k: 'myrotary_id', label: 'ID de My Rotary', type: 'text' }, { k: 'myrotary_at', label: 'Fecha de activación en My Rotary', type: 'date' }],
      values: { myrotary_id: s.myrotary_id || '', myrotary_at: s.myrotary_at || '' }, okText: 'Guardar' });
    if (!out) return;
    try { await api(`/api/socios/socios/${s.id}`, { method: 'PATCH', body: { myrotary_id: out.myrotary_id || null, myrotary_at: out.myrotary_at || null } }); toast('My Rotary actualizado'); await cargar(); } catch (x) { toast(x.message, false); }
  }

  /* ---------- Certificados: activación (de cada socio), junta del año y reconocimientos ---------- */
  const RECONOC = ['Socio del año', 'Compromiso con el servicio', 'Liderazgo', 'Mejor proyecto del año', 'Compañerismo', 'Mérito rotario'];
  async function pintarCertificados() {
    const el = view.querySelector('[data-lista]'); el.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let ks = []; try { ks = (await api('/api/socios/certificados')).rows; } catch (x) { el.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; return; }
    const hoy = C.todayCo(), anioR = +hoy.slice(5, 7) >= 7 ? +hoy.slice(0, 4) : +hoy.slice(0, 4) - 1;
    // Las activaciones viven en cada socio: se suman a la lista para ver todos los certificados juntos
    const acts = rows.filter((s) => s.activado).map((s) => ({ act: true, id: s.id, socio: s.nombre, tipo: 'activacion', fecha: s.activado_at }));
    ks = [...acts, ...ks].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || a.socio.localeCompare(b.socio));
    const porActivar = rows.filter((s) => !s.activado && ['activo', 'aspirante'].includes(s.estado) && (s.junta || ['socio', 'honorario', 'aspirante'].includes(s.tipo_membresia)));
    const tipoTxt = (k) => (k.tipo === 'activacion' ? 'Activación en el club' : k.tipo === 'junta' ? `Junta ${k.anio}-${k.anio + 1}${k.cargo ? ` · ${k.cargo}` : ''}` : `Reconocimiento · ${k.titulo}`);
    const PUEDE = M && !RO_APP;
    el.innerHTML = `<div class="d-flex flex-wrap gap-2 mb-3">
        ${PUEDE ? `<button class="btn btn-primary" data-cact><i class="bi bi-patch-check me-1"></i>Nueva activación</button>` : ''}
        <a class="btn btn-outline-primary" href="/api/socios/club/certificado" target="_blank" rel="noopener"><i class="bi bi-building-check me-1"></i>Certificado del club</a>
        ${PUEDE ? `<button class="btn btn-light" data-cclub><i class="bi bi-pencil me-1"></i>Datos del club</button>
        <button class="btn btn-outline-primary" data-cjunta><i class="bi bi-people-fill me-1"></i>Expedir a la junta ${anioR}-${anioR + 1}</button>
        <button class="btn btn-outline-primary" data-creco><i class="bi bi-award-fill me-1"></i>Nuevo reconocimiento</button>` : ''}</div>
      ${ks.length ? window.App.table([{ label: 'Socio', main: true, html: (k) => esc(k.socio) }, { label: 'Certificado', html: (k) => `<i class="bi ${k.act ? 'bi-patch-check text-success' : k.tipo === 'junta' ? 'bi-people-fill text-primary' : 'bi-award-fill text-warning'} me-1"></i>${esc(tipoTxt(k))}` }, { label: 'Fecha', html: (k) => C.day(k.fecha) },
        { label: '', cls: 'text-end text-nowrap', html: (k) => k.act ? `<button class="btn btn-sm btn-outline-primary" data-cert="${k.id}"><i class="bi bi-download me-1"></i>Ver</button>` : `<a class="btn btn-sm btn-outline-primary" href="/api/socios/certificados/${k.id}" target="_blank" rel="noopener"><i class="bi bi-download me-1"></i>Ver</a>${PUEDE ? ` <button class="btn btn-sm btn-light" data-cborrar="${k.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}` }], ks)
        : window.App.empty('bi-award', 'Aún no hay certificados. Activa a un socio o expide los de la junta.')}`;
    el.onclick = async (e) => {
      if (e.target.closest('[data-cact]')) {
        if (!porActivar.length) return toast('Todos los socios del club ya están activados');
        const out = await C.form({ title: 'Nueva activación', fields: [{ k: 'socio_id', label: 'Socio', type: 'select', required: true, options: porActivar.map((s) => [s.id, s.nombre]) }], okText: 'Seguir' });
        if (out) await activar(porActivar.find((s) => String(s.id) === String(out.socio_id)));   // activar recarga y repinta la lista
        return;
      }
      if (e.target.closest('[data-cclub]')) {
        const actual = await api('/api/socios/club').catch(() => ({}));
        const out = await C.form({ title: 'Datos del club', fields: [{ k: 'numero', label: 'ID del club en Rotary', type: 'text', placeholder: '12237' }, { k: 'fundado', label: 'Fecha de fundación', type: 'date' },
          { k: 'pais', label: 'País', type: 'text' }, { k: 'distrito', label: 'Distrito', type: 'text', placeholder: '4271' }, { k: 'zona', label: 'Zona', type: 'text', placeholder: '25' },
          { k: 'patrocinador', label: 'Club rotario patrocinador', type: 'text', full: true, placeholder: 'Club Rotario de Medellín' }, { k: 'presidente_patrocinador', label: 'Presidencia del club patrocinador', type: 'text', full: true }], values: actual, okText: 'Guardar' });
        if (!out) return;
        try { await api('/api/socios/club', { method: 'PUT', body: out }); toast('Datos del club guardados'); window.open('/api/socios/club/certificado', '_blank', 'noopener'); } catch (x) { toast(x.message, false); }
        return;
      }
      if (e.target.closest('[data-cjunta]')) {
        const out = await C.form({ title: 'Certificados de la junta', fields: [{ k: 'anio', label: 'Año rotario', type: 'select', options: [anioR, anioR - 1, anioR - 2].map((a) => [a, `${a}-${a + 1}`]) }, { k: 'fecha', label: 'Fecha de expedición', type: 'date', required: true }],
          values: { anio: anioR, fecha: hoy }, okText: 'Expedir' });
        if (!out) return;
        try { const r = await api('/api/socios/certificados/junta', { method: 'POST', body: out }); toast(r.creados ? `Listo: ${r.creados} certificados de la junta` : 'La junta ya tenía su certificado de ese año'); pintarCertificados(); } catch (x) { toast(x.message, false); }
        return;
      }
      if (e.target.closest('[data-creco]')) {
        const out = await C.form({ title: 'Nuevo reconocimiento', fields: [{ k: 'socio_id', label: 'Socio', type: 'select', required: true, options: rows.filter((s) => ['activo', 'aspirante'].includes(s.estado)).map((s) => [s.id, s.nombre]) },
          { k: 'titulo', label: 'Reconocimiento', type: 'select', options: RECONOC.map((t) => [t, t]) }, { k: 'texto', label: 'Por qué se reconoce', type: 'long', placeholder: 'por su liderazgo en la jornada de servicio…' }, { k: 'fecha', label: 'Fecha', type: 'date', required: true }],
          values: { fecha: hoy, titulo: RECONOC[0] }, okText: 'Expedir' });
        if (!out) return;
        try { const r = await api('/api/socios/certificados', { method: 'POST', body: { ...out, tipo: 'reconocimiento' } }); toast('Reconocimiento expedido'); window.open(`/api/socios/certificados/${r.id}`, '_blank', 'noopener'); pintarCertificados(); } catch (x) { toast(x.message, false); }
        return;
      }
      const b = e.target.closest('[data-cborrar]');
      if (b && (await confirm({ title: '¿Borrar este certificado?', ok: 'Borrar' }))) { try { await api(`/api/socios/certificados/${b.dataset.cborrar}`, { method: 'DELETE' }); pintarCertificados(); } catch (x) { toast(x.message, false); } }
    };
  }

  function pintar() {
    document.querySelector('[data-h1]').textContent = tab === 'certificados' ? 'Certificados' : 'Socios';
    view.querySelector('[data-buscar]').hidden = tab !== 'socios';
    view.querySelector('[data-chips]').hidden = tab !== 'socios';
    (tab === 'certificados' ? pintarCertificados : pintarSocios)();
  }

  async function cargar() {
    rows = await RO_.socios(true);
    pintar();
  }

  view.innerHTML = `<style>.ro-grupo>summary{list-style:none;cursor:pointer}.ro-grupo>summary::-webkit-details-marker{display:none}.ro-grupo>summary::before{content:"\\F285";font-family:bootstrap-icons;display:inline-block;margin-right:6px;transition:transform .15s}.ro-grupo[open]>summary::before{transform:rotate(90deg)}</style>
    <div class="mb-2" data-buscar><input class="form-control" placeholder="Buscar socio, cargo o profesión…" style="max-width:340px" aria-label="Buscar socio"></div>
    <div class="d-flex flex-wrap gap-1 align-items-center mb-3" data-chips></div><div data-lista></div>`;
  view.querySelector('[data-buscar] input').addEventListener('input', (e) => { filtro = e.target.value.trim(); pintarSocios(); });
  view.addEventListener('click', async (e) => {
    const ch = e.target.closest('[data-chip]'); if (ch) { chip = ch.dataset.chip; return pintarSocios(); }
    const vi = e.target.closest('[data-vista]'); if (vi) { vista = vi.dataset.vista; try { localStorage.setItem('ro_socios_vista', vista); } catch (_) {} return pintarSocios(); }
    const c = e.target.closest('[data-cert]'); if (c) return certificado({ id: c.dataset.cert });
    const a = e.target.closest('[data-activar]'); if (a) return activar(rows.find((s) => String(s.id) === a.dataset.activar));
    const mr = e.target.closest('[data-mr]'); if (mr) return myRotary(rows.find((s) => String(s.id) === mr.dataset.mr));
    const t = e.target.closest('[data-id]'); if (t) ficha(rows.find((s) => String(s.id) === t.dataset.id));
  });
  await cargar();
});
