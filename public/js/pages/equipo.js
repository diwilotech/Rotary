// Equipo: quién entra a la app y con qué rol (Presidencia = propietario, Junta = administrador, Socio = personal) y qué módulos ve cada socio.
// Para enlazar a un socio con su ficha, lo normal es darle acceso desde Socios (botón «Dar acceso a la app»).
DW.ready.then(async (me) => {
  const { api, esc, toast, modal, confirm } = window.App;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const ROL = { owner: 'Presidencia', admin: 'Junta', staff: 'Socio' };
  const M = me.canManage && !me.business.readOnly;
  let data = { users: [], catalogo: [] };

  const enlace = (url, mail) => {
    const { el } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Enlace de invitación</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small">Envíale este enlace a <b>${esc(mail || '')}</b> para que cree su contraseña:</p><div class="input-group"><input class="form-control" readonly value="${esc(url)}"><button class="btn btn-primary" data-c>Copiar</button></div></div>`);
    el.querySelector('[data-c]').onclick = () => navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado'));
  };
  const casillas = (sel) => data.catalogo.map((m) => `<label class="form-check"><input class="form-check-input" type="checkbox" value="${esc(m.id)}" ${(sel ? sel.includes(m.id) : m.defecto) ? 'checked' : ''}> ${esc(m.nombre)}</label>`).join('');
  const marcados = (el) => [...el.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value);

  async function invitar() {
    const { el, m } = modal(`<form><div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Invitar a la app</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body d-grid gap-2"><input class="form-control" name="email" type="email" placeholder="Correo" required><input class="form-control" name="name" placeholder="Nombre">
        <select class="form-select" name="role"><option value="staff">Socio</option><option value="admin">Junta</option></select><div class="small text-body-secondary">Módulos que verá (solo para Socio):</div><div data-mods>${casillas(null)}</div><div class="small text-danger" data-err></div></div>
      <div class="modal-footer border-0 pt-0"><button type="button" class="btn btn-light" data-bs-dismiss="modal">Cancelar</button><button class="btn btn-primary">Invitar</button></div></form>`);
    el.querySelector('form').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try { const r = await api('/api/team', { method: 'POST', body: { email: f.email.value, name: f.name.value, role: f.role.value, modulos: marcados(el.querySelector('[data-mods]')) } }); m.hide(); enlace(r.invite_url, f.email.value); cargar(); }
      catch (x) { el.querySelector('[data-err]').textContent = x.message; }
    };
  }

  async function cargar() {
    data = await api('/api/team');
    const j = data.junta;
    view.innerHTML = `${j?.agregados ? `<div class="alert alert-success small">Se agregaron ${j.agregados} de la junta al equipo con acceso de Junta. Envíales su enlace para que creen la contraseña.</div>` : ''}
      ${j?.sin_correo?.length ? `<div class="alert alert-warning small"><i class="bi bi-envelope-exclamation me-1"></i>De la junta les falta correo para entrar: <b>${j.sin_correo.map(esc).join(', ')}</b>. Agrégalo en su ficha de Socios y entran solos al equipo.</div>` : ''}
      <p class="small text-body-secondary">La junta (socios con cargo) está siempre en el equipo con acceso de Junta.</p>
      <div class="dw-card p-0 p-md-2">${window.App.table([
      { label: 'Persona', main: true, html: (u) => `${esc(u.name || u.email)}<div class="small text-body-secondary fw-normal">${esc(u.email)}${u.status === 'invited' ? ' · invitación pendiente' : ''}</div>` },
      { label: 'Rol', html: (u) => (M && u.role !== 'owner' && u.id !== me.user.id ? `<select class="form-select form-select-sm w-auto" data-rol="${esc(u.id)}"><option value="staff" ${u.role === 'staff' ? 'selected' : ''}>Socio</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Junta</option></select>` : esc(ROL[u.role] || u.role)) },
      { label: 'Módulos', html: (u) => (u.role === 'staff' ? `<span class="small">${u.modulos.map((id) => esc(data.catalogo.find((m) => m.id === id)?.nombre || id)).join(', ') || '—'}</span>` : '<span class="small text-body-secondary">Todos</span>') },
      { label: '', cls: 'text-end text-nowrap', html: (u) => (M && u.role !== 'owner' ? `${u.role === 'staff' ? `<button class="btn btn-sm btn-light" data-mods="${esc(u.id)}" title="Módulos"><i class="bi bi-grid"></i></button> ` : ''}<button class="btn btn-sm btn-light" data-link="${esc(u.id)}" data-email="${esc(u.email)}" title="Enlace de acceso"><i class="bi bi-link-45deg"></i></button> <button class="btn btn-sm btn-light text-danger" data-del="${esc(u.id)}" title="Quitar"><i class="bi bi-person-x"></i></button>` : '') },
    ], data.users)}</div>`;
  }

  if (M) { acciones.innerHTML = '<button class="btn btn-primary"><i class="bi bi-person-plus me-1"></i>Invitar</button>'; acciones.firstElementChild.onclick = invitar; }
  view.addEventListener('change', async (e) => {
    const s = e.target.closest('[data-rol]'); if (!s) return;
    try { await api(`/api/team/${s.dataset.rol}`, { method: 'PATCH', body: { role: s.value } }); toast('Rol actualizado'); cargar(); } catch (x) { toast(x.message, false); }
  });
  view.addEventListener('click', async (e) => {
    const mo = e.target.closest('[data-mods]');
    if (mo) {
      const u = data.users.find((x) => x.id === mo.dataset.mods);
      const { el, m } = modal(`<div class="modal-header border-0 pb-0"><h2 class="modal-title h5">Módulos de ${esc(u.name || u.email)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body">${casillas(u.modulos)}</div>
        <div class="modal-footer border-0 pt-0"><button class="btn btn-primary" data-ok>Guardar</button></div>`);
      el.querySelector('[data-ok]').onclick = async () => { try { await api(`/api/team/${u.id}`, { method: 'PATCH', body: { modulos: marcados(el) } }); m.hide(); toast('Guardado'); cargar(); } catch (x) { toast(x.message, false); } };
      return;
    }
    const l = e.target.closest('[data-link]');
    if (l) { try { const r = await api(`/api/team/${l.dataset.link}/invite`, { method: 'POST' }); enlace(r.invite_url, l.dataset.email); } catch (x) { toast(x.message, false); } return; }
    const d = e.target.closest('[data-del]');
    if (d && (await confirm({ title: '¿Quitarle el acceso?', text: 'Deja de entrar a la app. Su ficha de socio no se borra.', ok: 'Quitar' }))) {
      try { await api(`/api/team/${d.dataset.del}`, { method: 'DELETE' }); toast('Acceso quitado'); cargar(); } catch (x) { toast(x.message, false); }
    }
  });
  await cargar();
});
