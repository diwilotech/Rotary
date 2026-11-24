// Reuniones: calendario didáctico del mes. Abre en HOY («estás aquí»), muestra reuniones y eventos con colores distintos,
// la próxima con cuenta regresiva y la línea de lo que viene. Tocar un día vacío crea (junta); tocar una reunión abre su detalle:
// confirmaciones, asistencia, invitados externos (con enlace para que se registren solos) y el acta por el orden del día.
// Además, las listas del año rotario: «Reuniones del año» y «Eventos del año».
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud, RO = window.RO;
  RO.nav('reuniones');
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const M = me.canManage && !me.business.readOnly;
  const COLOR = { reunion: 'var(--dw-p)', evento: '#0067C8', obra: '#E08E0B' };
  const ETQ = { reunion: 'Reunión', evento: 'Evento', obra: 'Obra' };
  const ICO = { reunion: 'bi-people-fill', evento: 'bi-stars', obra: 'bi-hammer' };
  const EST = { programada: ['free', 'Programada'], confirmada: ['ok', 'Confirmada'], realizada: ['ok', 'Realizada'], cancelada: ['bad', 'Cancelada'] };
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const lunes = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const mesMas = (ym, n) => { const d = new Date(`${ym}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  const hoy = C.todayCo();
  let ym = hoy.slice(0, 7), rows = [], proximas = [], vista = { '#reuniones': 'reunion', '#eventos': 'evento', '#obras': 'obra' }[location.hash] || 'calendario', anio = +hoy.slice(5, 7) >= 7 ? +hoy.slice(0, 4) : +hoy.slice(0, 4) - 1, lista = [];

  if (M) acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva reunión o evento</button>';
  acciones.querySelector('[data-nuevo]')?.addEventListener('click', () => editar(null, hoy));

  const proys = me.modules.some((x) => x.id === 'impacto') ? await RO.proyectos() : [];
  const CAMPOS = [{ k: 'tipo', label: 'Tipo', type: 'select', options: [['reunion', 'Reunión'], ['evento', 'Evento'], ['obra', 'Obra (jornada de servicio)']] }, { k: 'titulo', label: 'Título', type: 'text', required: true },
    { k: 'fecha', label: 'Fecha', type: 'date', required: true }, { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(EST).map(([k, [, l]]) => [k, l]) },
    { k: 'hora_ini', label: 'Hora de inicio', type: 'text', placeholder: '19:00' }, { k: 'hora_fin', label: 'Hora de fin', type: 'text', placeholder: '21:00' },
    { k: 'modalidad', label: 'Modalidad', type: 'select', options: [['presencial', 'Presencial'], ['virtual', 'Virtual'], ['mixta', 'Mixta']] }, { k: 'lugar', label: 'Lugar', type: 'text', hint: 'dirección o enlace de Google Maps' },
    { k: 'enlace', label: 'Enlace (virtual)', type: 'url', full: true }, { k: 'descripcion', label: 'Qué se va a hacer', type: 'long' },
    ...(proys.length ? [{ k: 'proyecto_id', label: 'Proyecto de Impacto', type: 'select', options: RO.opts(proys, 'Ninguno'), full: true, hint: 'las obras se anclan a un proyecto' }] : []),
    { k: 'compromisos', label: 'Compromisos', type: 'long' }];

  async function editar(r, fecha) {
    const out = await C.form({ title: r ? 'Editar' : 'Nueva reunión o evento', fields: CAMPOS.map((f) => (f.k === 'proyecto_id' ? { ...f, options: RO.optsProyectos(proys, r?.proyecto_id) } : f)), values: r ? { ...r } : { tipo: 'reunion', fecha, estado: 'programada', modalidad: 'presencial' },
      onDelete: r ? () => api(`/api/reuniones/reuniones/${r.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Borrada'); return cargar(); }
    if (!out) return;
    try { await api(r ? `/api/reuniones/reuniones/${r.id}` : '/api/reuniones/reuniones', { method: r ? 'PATCH' : 'POST', body: out }); toast('Guardado'); ym = out.fecha.slice(0, 7); cargar(); } catch (x) { toast(x.message, false); }
  }

  // Enlace para abrir el lugar: si el lugar ya es un enlace (Google Maps, Waze…) se usa tal cual; si no, se busca en Google Maps
  const mapa = (l) => (/^https?:\/\//i.test(l || '') ? l : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l || '')}`);
  const lugarHtml = (l) => (l ? `<span class="small"><i class="bi bi-geo-alt me-1"></i>${/^https?:/i.test(l) ? 'Ubicación' : esc(l)} · <a href="${esc(mapa(l))}" target="_blank" rel="noopener">Abrir en el mapa</a></span>` : '');
  const cuando = (f) => { const d = Math.round((Date.parse(f) - Date.parse(hoy)) / 864e5); return d === 0 ? 'hoy' : d === 1 ? 'mañana' : d > 1 ? `en ${d} días` : d === -1 ? 'ayer' : `hace ${-d} días`; };

  async function detalle(r) {
    const { el, m } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    let a; try { a = await api(`/api/reuniones/reuniones/${r.id}/asistencia`); } catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const yo = a.rows.find((x) => (RO._yo || {}).id === x.socio_id);
    const conf = a.rows.filter((x) => x.respuesta === 'si'), no = a.rows.filter((x) => x.respuesta === 'no');
    const pasada = r.fecha <= hoy;
    el.querySelector('.modal-content').innerHTML = `<div class="modal-header border-0 pb-0" style="border-top:5px solid ${COLOR[r.tipo]}"><div><div class="small fw-semibold" style="color:${COLOR[r.tipo]}">${ETQ[r.tipo]} · ${cuando(r.fecha)}</div>
        <h2 class="modal-title h5">${esc(r.titulo)}</h2><div class="small text-body-secondary text-capitalize">${RO.fechaLarga(r.fecha)}${r.hora_ini ? ` · ${esc(r.hora_ini)}${r.hora_fin ? `–${esc(r.hora_fin)}` : ''}` : ''}</div></div>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">
        <div class="d-flex flex-wrap gap-2 mb-3">${C.chip(...(EST[r.estado] || EST.programada))}<span class="badge rounded-pill text-bg-light text-capitalize">${esc(r.modalidad)}</span>${lugarHtml(r.lugar)}${r.enlace ? `<a class="small" href="${esc(r.enlace)}" target="_blank" rel="noopener"><i class="bi bi-camera-video me-1"></i>Entrar</a>` : ''}</div>
        ${r.descripcion ? `<div class="ro-h mt-0">Qué se va a hacer</div><p class="small" style="white-space:pre-wrap">${esc(r.descripcion)}</p>` : ''}
        ${yo !== undefined && r.estado !== 'cancelada' && !pasada ? `<div class="dw-card p-2 mb-3 d-flex align-items-center gap-2 flex-wrap"><span class="small flex-grow-1">¿Vas a asistir?</span><button class="btn btn-sm ${yo.respuesta === 'si' ? 'btn-success' : 'btn-outline-success'}" data-resp="si">Sí, voy</button><button class="btn btn-sm ${yo.respuesta === 'no' ? 'btn-secondary' : 'btn-outline-secondary'}" data-resp="no">No puedo</button></div>` : ''}
        <div class="row g-2 mb-3"><div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-5 fw-bold">${conf.length}</div><div class="small text-body-secondary">Confirmaron</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-5 fw-bold">${no.length}</div><div class="small text-body-secondary">No van</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-5 fw-bold">${a.rows.filter((x) => x.presente === 1).length}</div><div class="small text-body-secondary">Asistieron</div></div></div></div>
        <div class="d-flex gap-2 flex-wrap">${M && r.estado !== 'cancelada' ? `<button class="btn btn-primary flex-grow-1" data-conducir><i class="bi bi-play-circle me-1"></i>${r.tiene_acta ? 'Continuar' : 'Empezar'} ${{ evento: 'el evento', obra: 'la obra' }[r.tipo] || 'la reunión'}</button>` : ''}
          ${M && r.estado !== 'cancelada' ? '<button class="btn btn-outline-primary" data-preparar><i class="bi bi-pencil-square me-1"></i>Preparar</button>' : ''}
          ${r.tiene_acta ? `<a class="btn btn-outline-primary" href="/api/reuniones/reuniones/${r.id}/acta" target="_blank" rel="noopener"><i class="bi bi-journal-text me-1"></i>Ver acta</a>` : ''}</div>
      </div>
      ${M ? '<div class="modal-footer border-0 pt-0"><button class="btn btn-light" data-editar><i class="bi bi-pencil me-1"></i>Editar</button></div>' : ''}`;
    el.querySelectorAll('[data-resp]').forEach((b) => (b.onclick = async () => { try { await api(`/api/reuniones/reuniones/${r.id}/responder`, { method: 'POST', body: { respuesta: b.dataset.resp } }); toast('Respuesta guardada'); m.hide(); cargar(); } catch (x) { toast(x.message, false); } }));
    el.querySelector('[data-editar]')?.addEventListener('click', () => { m.hide(); editar(r); });
    el.querySelector('[data-conducir]')?.addEventListener('click', () => { m.hide(); conducir(r); });
    el.querySelector('[data-preparar]')?.addEventListener('click', () => { m.hide(); preparar(r); });
  }

  /* ---------- Invitados externos: los agrega la junta o se registran solos con el enlace ---------- */
  const TIPO_INV = { invitado: 'Invitado', rotario: 'Rotario', rotaractiano: 'Rotaractiano de otro club', interactiano: 'Interactiano', orador: 'Orador' };
  async function invitados(r) {
    const { el } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    const pintarI = async () => {
      const d = await api(`/api/reuniones/reuniones/${r.id}/invitados`).catch((x) => ({ rows: [], error: x.message }));
      el.querySelector('.modal-content').innerHTML = `<div class="modal-header"><h2 class="modal-title h5">Invitados externos · ${esc(r.titulo)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body">${M ? `<div class="dw-card p-2 mb-3 d-flex align-items-center gap-2 flex-wrap"><i class="bi bi-link-45deg fs-4" style="color:var(--dw-p)"></i><span class="small flex-grow-1">Comparte un enlace para que los invitados se registren solos (con su autorización de datos).</span><button class="btn btn-sm btn-primary" data-link>Copiar enlace</button></div>
          <form class="row g-2 mb-3" data-fi><div class="col-sm-5"><input class="form-control form-control-sm" name="nombre" placeholder="Nombre" required></div><div class="col-sm-4"><input class="form-control form-control-sm" name="procedencia" placeholder="Club u organización"></div>
            <div class="col-sm-3"><select class="form-select form-select-sm" name="tipo">${Object.entries(TIPO_INV).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div class="col-12"><button class="btn btn-sm btn-outline-primary"><i class="bi bi-plus-lg me-1"></i>Agregar invitado</button></div></form>` : ''}
          ${d.rows.length ? d.rows.map((i) => `<div class="d-flex align-items-center gap-2 py-2 border-bottom">${RO.avatar({ nombre: i.nombre }, 34)}<div class="flex-grow-1 min-w-0"><b class="d-block text-truncate">${esc(i.nombre)}</b><span class="small text-body-secondary">${TIPO_INV[i.tipo] || 'Invitado'}${i.procedencia ? ` · ${esc(i.procedencia)}` : ''}${i.via === 'enlace' ? ' · se registró con el enlace' : ''}</span></div>${M ? `<button class="btn btn-sm btn-light" data-qi="${i.id}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button>` : ''}</div>`).join('')
            : '<p class="small text-body-secondary mb-0">Aún no hay invitados externos.</p>'}</div>`;
      el.querySelector('[data-link]')?.addEventListener('click', async () => { try { const x = await api(`/api/reuniones/reuniones/${r.id}/enlace`, { method: 'POST', body: {} }); await navigator.clipboard?.writeText(x.url).catch(() => prompt('Copia el enlace:', x.url)); toast('Enlace copiado'); } catch (x) { toast(x.message, false); } });
      el.querySelector('[data-fi]')?.addEventListener('submit', async (ev) => { ev.preventDefault(); try { await api(`/api/reuniones/reuniones/${r.id}/invitados`, { method: 'POST', body: Object.fromEntries(new FormData(ev.target)) }); pintarI(); cargar(); } catch (x) { toast(x.message, false); } });
      el.querySelectorAll('[data-qi]').forEach((b) => (b.onclick = async () => { try { await api(`/api/reuniones/invitados/${b.dataset.qi}`, { method: 'DELETE' }); pintarI(); cargar(); } catch (x) { toast(x.message, false); } }));
    };
    pintarI();
  }

  /* ---------- Preparar: antes de la reunión se escribe lo que se va a decir en cada punto ---------- */
  async function preparar(r) {
    const { el, m } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg modal-fullscreen-sm-down' });
    let d; try { d = await api(`/api/reuniones/reuniones/${r.id}/acta-datos`); } catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const a = d.acta;
    el.querySelector('.modal-content').innerHTML = `<div class="modal-header"><div><h2 class="modal-title h5">Preparar · ${esc(r.titulo)}</h2><div class="small text-body-secondary">Escribe lo que se va a decir en cada punto. En la reunión solo tocas «Hecho».</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body">${a.items.map((i, n) => `<div class="mb-3"><div class="d-flex align-items-center gap-2 mb-1"><span class="ro-oi-n" style="display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--dw-p);color:#fff;font-weight:700;font-size:.8rem;flex:none">${n + 1}</span><b>${esc(i.titulo)}</b></div>
          <textarea class="form-control" rows="2" data-prep="${n}" placeholder="${esc(i.detalle || 'Lo que se va a decir')}">${esc(i.preparado || '')}</textarea></div>`).join('')}</div>
      <div class="modal-footer"><span class="small text-body-secondary me-auto">${a.items.filter((i) => i.preparado).length} de ${a.items.length} puntos preparados</span><button class="btn btn-primary" data-gprep><i class="bi bi-check2 me-1"></i>Guardar</button></div>`;
    el.querySelector('[data-gprep]').onclick = async () => {
      a.items.forEach((i, n) => { i.preparado = el.querySelector(`[data-prep="${n}"]`).value; });
      try { await api(`/api/reuniones/reuniones/${r.id}/acta-datos`, { method: 'PUT', body: { ...a, estado: d.estado } }); toast('Listo: la reunión quedó preparada'); m.hide(); cargar(); } catch (x) { toast(x.message, false); }
    };
  }

  /* ---------- Conducir la reunión: pasos de izquierda a derecha ----------
     Arranca en el primer punto del orden del día (al abrir queda la hora de inicio) → un paso por cada punto (se llenan notas;
     el primero trae el llamado a lista, «invitados» la lista de externos, «acta anterior» su aprobación y «cajita» el recaudo)
     → Cierre (compromisos, notas y aprobar el acta). Se guarda solo al pasar de un paso a otro. */
  async function conducir(r) {
    const { el, m } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-xl modal-fullscreen-sm-down' });
    let d, asis, inv;
    try { [d, asis, inv] = await Promise.all([api(`/api/reuniones/reuniones/${r.id}/acta-datos`), api(`/api/reuniones/reuniones/${r.id}/asistencia`), api(`/api/reuniones/reuniones/${r.id}/invitados`)]); }
    catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const a = d.acta, socios = asis.rows; let invitadosL = inv.rows, aprobada = d.estado === 'aprobada';
    // Tareas que salen de la reunión (para un socio; del club o de un proyecto de Impacto)
    const TAREAS = me.modules.some((x) => x.id === 'tareas');
    let tareasL = TAREAS ? (await api(`/api/tareas/tareas?f_reunion_id=${r.id}&limit=200`).catch(() => ({ rows: [] }))).rows : [];
    const listaTareas = () => `<div class="ro-h">Tareas para los socios (${tareasL.length})</div>
      ${tareasL.map((t) => `<div class="d-flex align-items-center gap-2 py-1 border-bottom small"><i class="bi ${t.estado === 'hecha' ? 'bi-check-circle-fill text-success' : 'bi-circle'}"></i><span class="flex-grow-1"><b>${esc(t.titulo)}</b>
        <span class="text-body-secondary"> · ${esc(socios.find((x) => x.socio_id === t.socio_id)?.nombre || 'sin responsable')}${t.fecha_limite ? ` · ${C.day(t.fecha_limite)}` : ''} · ${t.proyecto_id ? `<i class="bi bi-globe-americas"></i> ${esc(proys.find((x) => x.id === t.proyecto_id)?.nombre || 'proyecto')}` : 'del club'}</span></span>
        <button type="button" class="btn btn-sm btn-light py-0" data-tq="${t.id}" aria-label="Quitar"><i class="bi bi-x-lg"></i></button></div>`).join('') || '<p class="small text-body-secondary mb-1">Aún no hay tareas de esta reunión.</p>'}
      <form class="row g-2 mt-1" data-ftarea><div class="col-12"><input class="form-control form-control-sm" name="titulo" placeholder="¿Qué hay que hacer?" required></div>
        <div class="col-sm-6"><select class="form-select form-select-sm" name="socio_id" required><option value="">¿Quién?</option>${RO.GRUPOS_SOCIO.filter(([k]) => k !== 'voluntario_invitado').map(([k, l]) => { const g = socios.filter((x) => RO.grupoSocio(x) === k && x.estado !== 'inactivo' && x.estado !== 'retirado'); return g.length ? `<optgroup label="${l}">${g.map((x) => `<option value="${x.socio_id}">${esc(x.nombre)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select></div>
        <div class="col-sm-6"><input class="form-control form-control-sm" type="date" name="fecha_limite" aria-label="Para cuándo"></div>
        <div class="col-sm-8"><select class="form-select form-select-sm" name="proyecto_id"><option value="">Del club</option>${RO.optsProyectos(proys, r.proyecto_id).slice(1).map(([id, n]) => `<option value="${id}" ${r.proyecto_id === id ? 'selected' : ''}>Proyecto: ${esc(n)}</option>`).join('')}</select></div>
        <div class="col-sm-4"><button class="btn btn-sm btn-primary w-100"><i class="bi bi-plus-lg me-1"></i>Asignar</button></div></form>`;
    a.items = a.items.map((i) => ({ notas: '', responsable_id: null, minutos: null, ...i }));
    let paso = 1, cambios = false, asisCambio = false, editando = false;
    if (!a.inicio) { a.inicio = new Date(Date.now() - 5 * 3600000).toISOString().slice(11, 16); cambios = true; }   // empieza al abrir
    const presentes = () => socios.filter((x) => x.presente === 1).length;
    const N = () => a.items.length, ULT = () => N() + 1;
    const nombreS = (id) => socios.find((x) => x.socio_id === id)?.nombre || '';
    const especial = (t) => (/invitad/i.test(t) ? 'invitados' : /acta anterior/i.test(t) ? 'acta' : /cajita|macer/i.test(t) ? 'cajita' : /registro|llamado|lista|llegada/i.test(t) ? 'lista' : '');
    const guardar = async (final = false) => {
      if (asisCambio) { await api(`/api/reuniones/reuniones/${r.id}/asistencia`, { method: 'PUT', body: { marcas: socios.map((x) => ({ socio_id: x.socio_id, presente: x.presente === 1 })) } }).catch(() => {}); asisCambio = false; }
      if (!cambios && !final) return;
      await api(`/api/reuniones/reuniones/${r.id}/acta-datos`, { method: 'PUT', body: { ...a, estado: aprobada ? 'aprobada' : 'borrador' } }); cambios = false;
    };
    const hora = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(11, 16);
    const listaAsis = () => `<div class="ro-h">Llamado a lista · <span data-np>${presentes()}</span> de ${socios.length}</div><div style="max-height:340px;overflow:auto">${RO.GRUPOS_SOCIO.map(([k, l]) => { const g = socios.filter((x) => RO.grupoSocio(x) === k); return g.length ? `<div class="small fw-semibold text-body-secondary mt-2 mb-1">${l} (${g.length})</div><div class="ro-socios">${g.map((x) => `<label class="ro-scard"><input class="form-check-input m-0" type="checkbox" data-pres="${x.socio_id}" ${x.presente === 1 ? 'checked' : ''}><span class="flex-grow-1">${esc(x.nombre)}</span>${x.respuesta === 'si' ? '<i class="bi bi-hand-thumbs-up text-success" title="Confirmó"></i>' : ''}</label>`).join('')}</div>` : ''; }).join('')}</div>`;
    const externos = socios.filter((x) => x.tipo_membresia === 'socio_externo' && !invitadosL.some((i) => i.nombre === x.nombre));
    const listaInv = () => `<div class="ro-h">Invitados externos (${invitadosL.length})</div>
      ${externos.length ? `<div class="small text-body-secondary mb-1">Socios externos (de otros clubes): toca para registrarlos como invitados</div><div class="d-flex flex-wrap gap-1 mb-2">${externos.map((x) => `<button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" data-ext="${x.socio_id}"><i class="bi bi-plus"></i> ${esc(x.nombre)}</button>`).join('')}</div>` : ''}${invitadosL.map((i) => `<div class="small py-1 border-bottom"><b>${esc(i.nombre)}</b>${i.procedencia ? ` · ${esc(i.procedencia)}` : ''}</div>`).join('') || '<p class="small text-body-secondary">Aún no hay invitados.</p>'}
      <form class="d-flex gap-2 mt-2" data-finv><input class="form-control form-control-sm" name="nombre" placeholder="Nombre del invitado" required><input class="form-control form-control-sm" name="procedencia" placeholder="Club u organización"><button class="btn btn-sm btn-outline-primary">Agregar</button></form>`;
    const tabs = () => [['', ''], ...a.items.map((i) => [i.titulo, '']), ['Cierre', 'bi-flag']];
    function cuerpo() {
      if (paso === ULT()) return `<div class="row g-3"><div class="col-md-5"><div class="dw-card h-100"><div class="ro-h mt-0">Resumen</div>
          <div class="small d-grid gap-1"><span><i class="bi bi-people me-1"></i><b>${presentes()}</b> socios presentes</span><span><i class="bi bi-person-plus me-1"></i><b>${invitadosL.length}</b> invitados externos</span>
          <span><i class="bi bi-clock me-1"></i>${a.inicio ? `Inició ${esc(a.inicio)}` : 'Sin hora de inicio'}${a.fin ? ` · terminó ${esc(a.fin)}` : ''}</span>${a.recaudo ? `<span><i class="bi bi-coin me-1"></i>Cajita: ${C.money(a.recaudo)}</span>` : ''}
          <span><i class="bi bi-check2-square me-1"></i>${a.items.filter((i) => i.notas).length} de ${N()} puntos con notas</span></div></div></div>
        <div class="col-md-7"><label class="form-label small fw-semibold">Compromisos</label><textarea class="form-control mb-2" rows="3" data-comp placeholder="Quién hace qué y para cuándo">${esc(a.compromisos || '')}</textarea>
          <label class="form-label small fw-semibold">Notas generales</label><textarea class="form-control mb-2" rows="2" data-notas>${esc(a.notas || '')}</textarea>
          <label class="form-check"><input class="form-check-input" type="checkbox" data-aprob ${aprobada ? 'checked' : ''}> <span class="form-check-label">Acta aprobada</span></label></div>
        ${TAREAS ? `<div class="col-12"><div class="dw-card" data-tareasbox>${listaTareas()}</div></div>` : ''}</div>`;
      const i = a.items[paso - 1], sp = paso === 1 ? 'lista' : especial(i.titulo);
      return `<div class="row g-3"><div class="${sp ? 'col-lg-6' : 'col-12'}"><div class="d-flex align-items-center gap-2 mb-1"><span class="ro-oi-n">${paso}</span><h3 class="h5 m-0 flex-grow-1">${esc(i.titulo)}</h3></div>
          ${i.detalle ? `<p class="small text-body-secondary mb-1">${esc(i.detalle)}</p>` : ''}
          ${(() => { const txt = i.notas || i.preparado || '';
            if (!i.hecho && txt && !editando) return `<div class="dw-card mb-2" style="white-space:pre-wrap">${esc(txt)}</div><div class="d-flex gap-2"><button class="btn btn-success flex-grow-1" data-hecho-b><i class="bi bi-check2-circle me-1"></i>Hecho</button><button class="btn btn-outline-secondary" data-editar-b><i class="bi bi-pencil me-1"></i>Editar</button></div>`;
            if (i.hecho && !editando) return `<div class="dw-card mb-2" style="white-space:pre-wrap;border-left:4px solid #16a34a">${txt ? esc(txt) : '<span class="text-body-secondary">Sin notas</span>'}</div><div class="d-flex gap-2 align-items-center"><span class="badge rounded-pill text-bg-success"><i class="bi bi-check2 me-1"></i>Hecho</span><button class="btn btn-sm btn-link" data-editar-b>Editar</button></div>`;
            return `<textarea class="form-control mb-2" rows="${sp ? 5 : 7}" data-nota placeholder="Lo que se dijo o decidió en este punto">${esc(txt)}</textarea><button class="btn btn-success w-100" data-hecho-b><i class="bi bi-check2-circle me-1"></i>Hecho</button>`; })()}</div>
        ${sp ? `<div class="col-lg-6">${sp === 'lista' ? listaAsis() + listaInv() : sp === 'invitados' ? listaInv()
          : sp === 'acta' ? `<div class="ro-h mt-0">Acta anterior</div><p class="small">Lee el acta de la reunión anterior y marca si se aprobó.</p><div class="d-flex gap-2"><button class="btn btn-sm ${a.acta_anterior === true ? 'btn-success' : 'btn-outline-success'}" data-aa="1">Aprobada</button><button class="btn btn-sm ${a.acta_anterior === false ? 'btn-secondary' : 'btn-outline-secondary'}" data-aa="0">Con correcciones</button></div>`
          : `<div class="ro-h mt-0">Cajita de macería</div><label class="small">Recaudado</label><input class="form-control" type="number" min="0" step="500" data-recaudo value="${a.recaudo || ''}" placeholder="0">`}</div>` : ''}</div>`;
    }
    function pintar() {
      const T = tabs(), pct = Math.round((paso / ULT()) * 100);
      el.querySelector('.modal-content').innerHTML = `<style>.ro-st{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}.ro-st::-webkit-scrollbar{display:none}
          .ro-st button{flex:none;display:flex;align-items:center;gap:6px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);border-radius:999px;padding:5px 11px;font-size:.78rem;color:inherit;max-width:210px}
          .ro-st button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ro-st button.on{background:var(--dw-p);border-color:var(--dw-p);color:#fff}.ro-st button.ok{border-color:#16a34a}.ro-st b{font-size:.7rem;opacity:.8}
          .ro-oi{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--bs-border-color)}.ro-oi-n{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border-radius:50%;background:var(--dw-p);color:#fff;font-weight:700;font-size:.85rem}
          .ro-paso{animation:roIn .22s ease}@keyframes roIn{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}.ro-paso.atras{animation-name:roOut}@keyframes roOut{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}</style>
        <div class="modal-header flex-column align-items-stretch gap-2"><div class="d-flex align-items-center gap-2"><div class="flex-grow-1"><div class="small fw-semibold" style="color:${COLOR[r.tipo] || COLOR.reunion}">${ETQ[r.tipo] || 'Reunión'} · ${esc(r.titulo)}</div>
            <div class="small text-body-secondary"><span class="text-capitalize">${RO.fechaLarga(r.fecha)}</span>${a.inicio ? ` · en curso desde las ${esc(a.inicio)}` : ''}${r.lugar ? ` · <a href="${esc(mapa(r.lugar))}" target="_blank" rel="noopener"><i class="bi bi-geo-alt"></i> ${/^https?:/i.test(r.lugar) ? 'Ubicación' : esc(r.lugar)}</a>` : ''}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="progress" style="height:4px"><div class="progress-bar" style="width:${pct}%"></div></div>
          <div class="ro-st" data-st>${T.map(([t, ic], n) => (n === 0 ? '' : `<button type="button" class="${n === paso ? 'on' : ''} ${n > 0 && n <= N() && a.items[n - 1].hecho ? 'ok' : ''}" data-ir="${n}">${ic ? `<i class="bi ${ic}"></i>` : `<b>${n}</b>`}<span>${esc(t)}</span></button>`)).join('')}</div></div>
        <div class="modal-body"><div class="ro-paso" data-paso>${cuerpo()}</div></div>
        <div class="modal-footer"><button class="btn btn-light" data-ant ${paso <= 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i> Anterior</button><span class="small text-body-secondary flex-grow-1 text-center">${paso === ULT() ? 'Cierre' : `Punto ${paso} de ${N()}`}</span>
          ${paso === ULT() ? `<a class="btn btn-light" href="/api/reuniones/reuniones/${r.id}/acta" target="_blank" rel="noopener"><i class="bi bi-printer"></i></a><button class="btn btn-success" data-fin><i class="bi bi-check2-circle me-1"></i>Guardar y terminar</button>` : '<button class="btn btn-primary" data-sig>Siguiente <i class="bi bi-chevron-right"></i></button>'}</div>`;
      el.querySelector('[data-st] .on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const ir = async (n, atras = false) => {
      if (n < 1 || n > ULT()) return;
      paso = n; editando = false; pintar(); if (atras) el.querySelector('[data-paso]').classList.add('atras');
      try { await guardar(); } catch (x) { toast(x.message, false); }
    };
    pintar();
    el.addEventListener('input', (e) => {
      const t = e.target, n = Number(t.dataset.ot ?? t.dataset.om ?? -1);
      if (t.dataset.ot !== undefined) a.items[n].titulo = t.value; else if (t.dataset.om !== undefined) a.items[n].minutos = Number(t.value) || null;
      else if (t.matches('[data-nota]')) a.items[paso - 1].notas = t.value; else if (t.matches('[data-comp]')) a.compromisos = t.value; else if (t.matches('[data-notas]')) a.notas = t.value;
      else if (t.matches('[data-recaudo]')) a.recaudo = Number(t.value) || null; else return;
      cambios = true;
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.or !== undefined) { a.items[Number(t.dataset.or)].responsable_id = Number(t.value) || null; cambios = true; }
      else if (t.dataset.pres) { const x = socios.find((y) => String(y.socio_id) === t.dataset.pres); x.presente = t.checked ? 1 : 0; asisCambio = true; const np = el.querySelector('[data-np]'); if (np) np.textContent = presentes(); }
      else if (t.matches('[data-hecho]')) { a.items[paso - 1].hecho = t.checked; cambios = true; el.querySelector(`[data-ir="${paso}"]`)?.classList.toggle('ok', t.checked); }
      else if (t.matches('[data-aprob]')) { aprobada = t.checked; cambios = true; }
    });
    el.addEventListener('submit', async (e) => {
      if (e.target.matches('[data-ftarea]')) {
        e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
        try { await api('/api/tareas/tareas', { method: 'POST', body: { titulo: f.titulo, socio_id: Number(f.socio_id), fecha_limite: f.fecha_limite || null, proyecto_id: Number(f.proyecto_id) || null, reunion_id: r.id, estado: 'pendiente' } });
          tareasL = (await api(`/api/tareas/tareas?f_reunion_id=${r.id}&limit=200`)).rows; el.querySelector('[data-tareasbox]').innerHTML = listaTareas(); toast('Tarea asignada'); } catch (x) { toast(x.message, false); }
        return;
      }
      if (!e.target.matches('[data-finv]')) return; e.preventDefault();
      try { await api(`/api/reuniones/reuniones/${r.id}/invitados`, { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); invitadosL = (await api(`/api/reuniones/reuniones/${r.id}/invitados`)).rows; pintar(); } catch (x) { toast(x.message, false); }
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.ir !== undefined) return ir(Number(b.dataset.ir), Number(b.dataset.ir) < paso);
      if (b.matches('[data-sig]')) return ir(paso + 1);
      if (b.matches('[data-ant]')) return ir(paso - 1, true);
      if (b.matches('[data-editar-b]')) { editando = true; pintar(); el.querySelector('[data-nota]')?.focus(); return; }
      if (b.matches('[data-hecho-b]')) {
        const it = a.items[paso - 1], ta = el.querySelector('[data-nota]');
        it.notas = ta ? ta.value : (it.notas || it.preparado || ''); it.hecho = true; editando = false; cambios = true;
        return ir(paso + 1);
      }
      if (b.dataset.ext) {
        const x = socios.find((y) => String(y.socio_id) === b.dataset.ext);
        try { await api(`/api/reuniones/reuniones/${r.id}/invitados`, { method: 'POST', body: { nombre: x.nombre, procedencia: 'Socio externo (otro club)', tipo: 'rotaractiano' } }); invitadosL = (await api(`/api/reuniones/reuniones/${r.id}/invitados`)).rows; externos.splice(externos.indexOf(x), 1); pintar(); } catch (y) { toast(y.message, false); }
        return;
      }
      if (b.dataset.tq) { try { await api(`/api/tareas/tareas/${b.dataset.tq}`, { method: 'DELETE' }); tareasL = tareasL.filter((t) => String(t.id) !== b.dataset.tq); el.querySelector('[data-tareasbox]').innerHTML = listaTareas(); } catch (x) { toast(x.message, false); } return; }
      if (b.dataset.aa !== undefined) { a.acta_anterior = b.dataset.aa === '1'; cambios = true; return pintar(); }
      const n = Number(b.dataset.oup ?? b.dataset.odn ?? b.dataset.orm ?? -1);
      if (b.dataset.oup !== undefined && n > 0) [a.items[n - 1], a.items[n]] = [a.items[n], a.items[n - 1]];
      else if (b.dataset.odn !== undefined && n < N() - 1) [a.items[n + 1], a.items[n]] = [a.items[n], a.items[n + 1]];
      else if (b.dataset.orm !== undefined) a.items.splice(n, 1);
      else if (b.matches('[data-oadd]')) a.items.push({ titulo: 'Nuevo punto', detalle: '', notas: '', responsable_id: null, minutos: null });
      else if (b.matches('[data-fin]')) { a.fin = a.fin || hora(); try { await guardar(true); toast('Listo: el acta quedó guardada'); m.hide(); cargar(); } catch (x) { toast(x.message, false); } return; }
      else return;
      cambios = true; pintar();
    });
    // Deslizar con el dedo: izquierda = siguiente, derecha = anterior
    let x0 = null;
    el.addEventListener('touchstart', (e) => { if (!e.target.closest('textarea,input,select,[data-st]')) x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 70) ir(paso + (dx < 0 ? 1 : -1), dx > 0); });
    el.addEventListener('hide.bs.modal', () => { guardar().catch(() => {}); cargar(); }, { once: true });
  }

  /* ---------- Listas del año rotario (julio a junio): reuniones y eventos ---------- */
  const barra = () => `<div class="d-flex flex-wrap gap-2 mb-3">${[['calendario', 'Calendario', 'bi-calendar3'], ['reunion', 'Reuniones del año', 'bi-people'], ['evento', 'Eventos del año', 'bi-stars'], ['obra', 'Obras del año', 'bi-hammer']].map(([k, l, ic]) => `<button type="button" class="btn btn-sm rounded-pill ${vista === k ? 'btn-primary' : 'btn-light'}" data-vista="${k}"><i class="bi ${ic} me-1"></i>${l}</button>`).join('')}</div>`;
  function pintarLista() {
    const ACT = (x) => (x.tiene_acta ? C.chip(x.acta_estado === 'aprobada' ? 'ok' : 'soon', x.acta_estado === 'aprobada' ? 'Aprobada' : 'Borrador') : '<span class="small text-body-secondary">—</span>');
    view.innerHTML = `${barra()}<div class="dw-card mb-3 d-flex align-items-center gap-2"><b class="flex-grow-1">${{ evento: 'Eventos', obra: 'Obras' }[vista] || 'Reuniones'} del año rotario ${anio}-${anio + 1}</b>
        <div class="btn-group btn-group-sm"><button class="btn btn-light" data-ay="-1" aria-label="Año anterior"><i class="bi bi-chevron-left"></i></button><button class="btn btn-light" data-ay="1" aria-label="Año siguiente"><i class="bi bi-chevron-right"></i></button></div></div>
      ${lista.length ? window.App.table([{ label: 'Fecha', html: (x) => `<span class="text-capitalize">${C.day(x.fecha)}</span>${x.hora_ini ? `<div class="small text-body-secondary">${esc(x.hora_ini)}</div>` : ''}` },
        { label: ETQ[vista] || 'Reunión', main: true, html: (x) => `<a href="#" data-ev="${x.id}" class="fw-semibold text-decoration-none">${esc(x.titulo)}</a><div class="small text-body-secondary fw-normal">${x.lugar ? `<a href="${esc(mapa(x.lugar))}" target="_blank" rel="noopener"><i class="bi bi-geo-alt"></i> ${/^https?:/i.test(x.lugar) ? 'Ubicación' : esc(x.lugar)}</a>` : esc(x.modalidad || '')}${x.proyecto ? ` · <i class="bi bi-globe-americas"></i> ${esc(x.proyecto)}` : ''}</div>` },
        { label: 'Estado', html: (x) => C.chip(...(EST[x.estado] || EST.programada)) }, { label: 'Socios', cls: 'text-end', html: (x) => (x.presentes || (x.fecha <= hoy ? 0 : `${x.confirmados} conf.`)) },
        { label: 'Externos', cls: 'text-end', html: (x) => x.invitados || '—' }, { label: 'Acta', html: ACT }], lista)
        : window.App.empty(ICO[vista] || 'bi-people', `No hay ${{ evento: 'eventos', obra: 'obras' }[vista] || 'reuniones'} en este año rotario.`)}`;
  }


  function pintar() {
    const primero = `${ym}-01`, ultimo = mas(`${mesMas(ym, 1)}-01`, -1), desde = lunes(primero), hasta = mas(lunes(ultimo), 6);
    const semanas = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1) / 7;
    const titulo = new Date(`${primero}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const celda = (f) => {
      const ev = rows.filter((x) => x.fecha === f).sort((p, q) => String(p.hora_ini || '').localeCompare(String(q.hora_ini || '')));
      return `<td class="${f === hoy ? 'hoy' : ''} ${f.startsWith(ym) ? '' : 'fuera'} ${f < hoy ? 'ro-pasado' : ''} ${ev.length ? '' : 'vacio'}" data-f="${f}" data-dia="${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${+f.slice(8)}">
        <div class="dw-mes-n">${+f.slice(8)}</div>${f === hoy ? '<span class="ro-aqui">Estás aquí</span>' : ''}
        ${ev.slice(0, 2).map((x) => `<a class="ro-evc${x.estado === 'cancelada' ? ' ro-cancel' : ''}" href="#" data-ev="${x.id}" style="--ev:${COLOR[x.tipo] || COLOR.reunion}" title="${esc([x.titulo, x.hora_ini, x.proyecto, x.lugar].filter(Boolean).join(' · '))}">
          <span class="ro-evc-h"><i class="bi ${ICO[x.tipo] || ICO.reunion}"></i>${esc(x.hora_ini || ETQ[x.tipo] || '')}${x.mi_respuesta === 'si' ? '<i class="bi bi-check-circle-fill ms-auto" title="Vas"></i>' : ''}</span>
          <span class="ro-evc-t">${esc(x.titulo)}</span></a>`).join('')}
        ${ev.length > 2 ? `<a class="ro-evc-mas" href="#" data-ev="${ev[2].id}">+${ev.length - 2} más</a>` : ''}</td>`;
    };
    const prox = proximas[0];
    view.innerHTML = `<style>.ro-aqui{display:inline-block;margin:0 0 3px;font-size:.62rem;font-weight:700;color:#fff;background:var(--dw-p);border-radius:999px;padding:1px 7px;vertical-align:middle}
        .ro-pasado .ro-evc{opacity:.62}.ro-cal .dw-mes td{height:128px;padding:5px}
        .ro-evc{display:flex;flex-direction:column;gap:1px;margin-bottom:4px;padding:5px 7px;border-radius:9px;border-left:4px solid var(--ev);background:color-mix(in srgb,var(--ev) 13%,var(--bs-body-bg));color:inherit;text-decoration:none;line-height:1.2;overflow:hidden}
        .ro-evc:hover{background:color-mix(in srgb,var(--ev) 22%,var(--bs-body-bg));color:inherit}
        .ro-evc-h{display:flex;align-items:center;gap:4px;font-size:.72rem;font-weight:700;color:var(--ev)}.ro-evc-t{font-size:.84rem;font-weight:600;overflow-wrap:anywhere;hyphens:auto;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
        .ro-evc-p{font-size:.66rem;color:var(--bs-secondary-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ro-evc-mas{font-size:.7rem;font-weight:600;text-decoration:none}
        @media (max-width:767.98px){.ro-cal .dw-mes td{height:auto}.ro-evc{padding:8px 10px}.ro-evc-t{font-size:.9rem}}.ro-cancel{text-decoration:line-through;opacity:.5}.ro-hoy-box{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
        .ro-hoy-dia{width:64px;height:64px;border-radius:16px;background:var(--dw-p);color:#fff;display:grid;place-items:center;line-height:1;text-align:center}.ro-hoy-dia b{font-size:1.6rem;display:block}.ro-hoy-dia span{font-size:.7rem;text-transform:uppercase}
        .ro-tl{list-style:none;padding:0;margin:0;border-left:2px solid var(--bs-border-color);margin-left:8px}.ro-tl li{position:relative;padding:0 0 14px 18px}.ro-tl li:before{content:"";position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--c);box-shadow:0 0 0 3px var(--bs-body-bg)}</style>
      ${barra()}<div class="dw-card mb-3 ro-hoy-box"><div class="ro-hoy-dia"><span>${DIAS[new Date(`${hoy}T12:00:00Z`).getUTCDay()]}</span><b>${+hoy.slice(8)}</b></div>
        <div class="flex-grow-1"><div class="small text-body-secondary">Hoy es</div><div class="fw-semibold text-capitalize">${RO.fechaLarga(hoy)}</div>
        <div class="small mt-1">${prox ? `Próxima: <a href="#" data-ev="${prox.id}"><b>${esc(prox.titulo)}</b></a> · <span style="color:${COLOR[prox.tipo]}">${ETQ[prox.tipo]}</span> · <b>${cuando(prox.fecha)}</b>${prox.hora_ini ? ` a las ${esc(prox.hora_ini)}` : ''}` : 'No hay reuniones programadas.'}</div></div>
        <div class="dw-legend m-0"><span><i style="background:${COLOR.reunion}"></i>Reuniones</span><span><i style="background:${COLOR.evento}"></i>Eventos</span><span><i style="background:${COLOR.obra}"></i>Obras</span></div></div>
      <div class="row g-3"><div class="col-lg-9"><div class="dw-card ro-cal">
        <div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light" data-prev aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
          <b class="flex-grow-1 text-center text-capitalize fs-5">${titulo}</b>${ym !== hoy.slice(0, 7) ? '<button class="btn btn-outline-primary btn-sm" data-hoy><i class="bi bi-geo-alt-fill me-1"></i>Volver a hoy</button>' : ''}<button class="btn btn-light" data-next aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button></div>
        <table class="dw-semana dw-mes" data-dt="off"><thead><tr>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: semanas }, (_, w) => `<tr>${Array.from({ length: 7 }, (_, i) => celda(mas(desde, w * 7 + i))).join('')}</tr>`).join('')}</tbody></table></div></div>
        <div class="col-lg-3"><div class="dw-card"><div class="ro-h mt-0">Lo que viene</div>${proximas.length ? `<ul class="ro-tl">${proximas.slice(0, 8).map((x) => `<li style="--c:${COLOR[x.tipo]}"><a href="#" data-ev="${x.id}" class="fw-semibold d-block text-decoration-none">${esc(x.titulo)}</a><span class="small text-body-secondary text-capitalize">${RO.fechaLarga(x.fecha)}${x.hora_ini ? ` · ${esc(x.hora_ini)}` : ''}</span><div class="small">${cuando(x.fecha)} · ${x.confirmados} confirmados</div></li>`).join('')}</ul>` : '<p class="small text-body-secondary mb-0">Nada programado.</p>'}</div></div></div>`;
  }

  async function cargar() {
    if (vista !== 'calendario') { lista = (await api(`/api/reuniones/anio?anio=${anio}&tipo=${vista}`)).rows; return pintarLista(); }
    const desde = lunes(`${ym}-01`), hasta = mas(lunes(mas(`${mesMas(ym, 1)}-01`, -1)), 6);
    const [d, p] = await Promise.all([api(`/api/reuniones/calendario?desde=${desde}&hasta=${hasta}`), api(`/api/reuniones/calendario?desde=${hoy}&hasta=${mas(hoy, 120)}`)]);
    rows = d.rows; proximas = p.rows.filter((x) => x.estado !== 'cancelada');
    pintar();
  }

  view.addEventListener('click', (e) => {
    const vb = e.target.closest('[data-vista]'); if (vb) { vista = vb.dataset.vista; history.replaceState(null, '', vista === 'calendario' ? location.pathname : `#${{ evento: 'eventos', obra: 'obras' }[vista] || 'reuniones'}`); return cargar(); }
    const ay = e.target.closest('[data-ay]'); if (ay) { anio += Number(ay.dataset.ay); return cargar(); }
    const ev = e.target.closest('[data-ev]');
    if (ev) { e.preventDefault(); const r = [...rows, ...proximas, ...lista].find((x) => String(x.id) === ev.dataset.ev); if (r) detalle(r); return; }
    if (e.target.closest('[data-prev]')) { ym = mesMas(ym, -1); return cargar(); }
    if (e.target.closest('[data-next]')) { ym = mesMas(ym, 1); return cargar(); }
    if (e.target.closest('[data-hoy]')) { ym = hoy.slice(0, 7); return cargar(); }
    const td = e.target.closest('td[data-f]');
    if (td && M && !e.target.closest('a')) editar(null, td.dataset.f);
  });
  RO._yo = await api('/api/lotuyo/carnet').then((d) => d.carnet).catch(() => null);
  await cargar();
});
