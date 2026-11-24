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
    { k: 'modalidad', label: 'Modalidad', type: 'select', options: [['presencial', 'Presencial'], ['virtual', 'Virtual'], ['mixta', 'Mixta']] }, { k: 'lugar', label: 'Lugar', type: 'text' },
    { k: 'enlace', label: 'Enlace (virtual)', type: 'url', full: true }, { k: 'descripcion', label: 'Descripción / orden del día', type: 'long' },
    ...(proys.length ? [{ k: 'proyecto_id', label: 'Proyecto de Impacto', type: 'select', options: RO.opts(proys, 'Ninguno'), full: true, hint: 'las obras se anclan a un proyecto' }] : []),
    { k: 'compromisos', label: 'Compromisos', type: 'long' }];

  async function editar(r, fecha) {
    const out = await C.form({ title: r ? 'Editar' : 'Nueva reunión o evento', fields: CAMPOS, values: r ? { ...r } : { tipo: 'reunion', fecha, estado: 'programada', modalidad: 'presencial' },
      onDelete: r ? () => api(`/api/reuniones/reuniones/${r.id}`, { method: 'DELETE' }) : null });
    if (out === 'deleted') { toast('Borrada'); return cargar(); }
    if (!out) return;
    try { await api(r ? `/api/reuniones/reuniones/${r.id}` : '/api/reuniones/reuniones', { method: r ? 'PATCH' : 'POST', body: out }); toast('Guardado'); ym = out.fecha.slice(0, 7); cargar(); } catch (x) { toast(x.message, false); }
  }

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
        <div class="d-flex flex-wrap gap-2 mb-3">${C.chip(...(EST[r.estado] || EST.programada))}<span class="badge rounded-pill text-bg-light text-capitalize">${esc(r.modalidad)}</span>${r.lugar ? `<span class="small"><i class="bi bi-geo-alt me-1"></i>${esc(r.lugar)}</span>` : ''}${r.enlace ? `<a class="small" href="${esc(r.enlace)}" target="_blank" rel="noopener"><i class="bi bi-camera-video me-1"></i>Entrar</a>` : ''}</div>
        ${r.descripcion ? `<p class="small" style="white-space:pre-wrap">${esc(r.descripcion)}</p>` : ''}
        ${yo !== undefined && r.estado !== 'cancelada' && !pasada ? `<div class="dw-card p-2 mb-3 d-flex align-items-center gap-2 flex-wrap"><span class="small flex-grow-1">¿Vas a asistir?</span><button class="btn btn-sm ${yo.respuesta === 'si' ? 'btn-success' : 'btn-outline-success'}" data-resp="si">Sí, voy</button><button class="btn btn-sm ${yo.respuesta === 'no' ? 'btn-secondary' : 'btn-outline-secondary'}" data-resp="no">No puedo</button></div>` : ''}
        <div class="row g-2 mb-3"><div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-5 fw-bold">${conf.length}</div><div class="small text-body-secondary">Confirmaron</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-5 fw-bold">${no.length}</div><div class="small text-body-secondary">No van</div></div></div>
          <div class="col-4"><div class="dw-card p-2 text-center"><div class="fs-5 fw-bold">${a.rows.filter((x) => x.presente === 1).length}</div><div class="small text-body-secondary">Asistieron</div></div></div></div>
        ${M && pasada ? `<div class="ro-h mt-0">Asistencia</div><div class="ro-socios" data-asis>${a.rows.map((x) => `<label class="ro-scard"><input class="form-check-input m-0" type="checkbox" data-s="${x.socio_id}" ${x.presente === 1 ? 'checked' : ''}><span class="flex-grow-1">${esc(x.nombre)}</span>${x.respuesta === 'si' ? '<i class="bi bi-hand-thumbs-up text-success" title="Confirmó"></i>' : ''}</label>`).join('')}</div>
          <button class="btn btn-primary mt-2" data-guardar><i class="bi bi-check2 me-1"></i>Guardar asistencia</button>` : conf.length ? `<div class="small text-body-secondary mb-2">Van: ${conf.map((x) => esc(x.nombre)).join(', ')}</div>` : ''}
        <div class="d-flex gap-2 flex-wrap mb-2"><button class="btn btn-outline-primary btn-sm" data-inv><i class="bi bi-person-plus me-1"></i>Invitados externos (${r.invitados || 0})</button>
          <button class="btn btn-outline-primary btn-sm" data-acta><i class="bi bi-journal-text me-1"></i>${M ? 'Acta de la reunión' : 'Ver acta'}${r.tiene_acta ? ` · ${r.acta_estado === 'aprobada' ? 'aprobada' : 'borrador'}` : ''}</button></div>
        ${r.minuta ? `<div class="ro-h">Minuta</div><div class="dw-card small" style="white-space:pre-wrap;max-height:320px;overflow:auto">${esc(r.minuta)}</div>` : ''}
        ${r.compromisos ? `<div class="ro-h">Compromisos</div><div class="small" style="white-space:pre-wrap">${esc(r.compromisos)}</div>` : ''}
      </div>
      ${M ? '<div class="modal-footer border-0 pt-0"><button class="btn btn-light" data-editar><i class="bi bi-pencil me-1"></i>Editar</button></div>' : ''}`;
    el.querySelectorAll('[data-resp]').forEach((b) => (b.onclick = async () => { try { await api(`/api/reuniones/reuniones/${r.id}/responder`, { method: 'POST', body: { respuesta: b.dataset.resp } }); toast('Respuesta guardada'); m.hide(); cargar(); } catch (x) { toast(x.message, false); } }));
    el.querySelector('[data-guardar]')?.addEventListener('click', async () => {
      const marcas = [...el.querySelectorAll('[data-s]')].map((i) => ({ socio_id: Number(i.dataset.s), presente: i.checked }));
      try { await api(`/api/reuniones/reuniones/${r.id}/asistencia`, { method: 'PUT', body: { marcas } }); toast('Asistencia guardada'); m.hide(); cargar(); } catch (x) { toast(x.message, false); }
    });
    el.querySelector('[data-editar]')?.addEventListener('click', () => { m.hide(); editar(r); });
    el.querySelector('[data-inv]').onclick = () => { m.hide(); invitados(r); };
    el.querySelector('[data-acta]').onclick = () => { m.hide(); M ? acta(r) : window.open(`/api/reuniones/reuniones/${r.id}/acta`, '_blank', 'noopener'); };
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

  /* ---------- Acta: notas por cada punto del orden del día (el del distrito o el sugerido) ---------- */
  async function acta(r) {
    const { el, m } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    let d; try { d = await api(`/api/reuniones/reuniones/${r.id}/acta-datos`); } catch (x) { el.querySelector('.modal-body').textContent = x.message; return; }
    const a = d.acta;
    el.querySelector('.modal-content').innerHTML = `<div class="modal-header"><div><h2 class="modal-title h5">Acta · ${esc(r.titulo)}</h2><div class="small text-body-secondary text-capitalize">${RO.fechaLarga(r.fecha)}</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
      <div class="modal-body"><p class="small text-body-secondary">Orden del día del club (lo puede ajustar el distrito). Escribe lo que pasó en cada punto.</p>
        <ol class="ps-3" data-items>${a.items.map((i, n) => `<li class="mb-3"><b>${esc(i.titulo)}</b>${i.detalle ? `<div class="small text-body-secondary">${esc(i.detalle)}</div>` : ''}<textarea class="form-control form-control-sm mt-1" rows="2" data-n="${n}" placeholder="Lo que se dijo o decidió">${esc(i.notas || '')}</textarea></li>`).join('')}</ol>
        <label class="form-label small fw-semibold">Notas generales</label><textarea class="form-control form-control-sm mb-2" rows="2" data-notas>${esc(a.notas || '')}</textarea>
        <label class="form-label small fw-semibold">Compromisos</label><textarea class="form-control form-control-sm mb-2" rows="2" data-comp>${esc(a.compromisos || '')}</textarea>
        <label class="form-check"><input class="form-check-input" type="checkbox" data-aprob ${d.estado === 'aprobada' ? 'checked' : ''}> <span class="form-check-label">Acta aprobada</span></label></div>
      <div class="modal-footer"><a class="btn btn-light me-auto" href="/api/reuniones/reuniones/${r.id}/acta" target="_blank" rel="noopener"><i class="bi bi-printer me-1"></i>Ver e imprimir</a><button class="btn btn-primary" data-gacta><i class="bi bi-check2 me-1"></i>Guardar acta</button></div>`;
    el.querySelector('[data-gacta]').onclick = async () => {
      const items = a.items.map((i, n) => ({ ...i, notas: el.querySelector(`[data-n="${n}"]`).value }));
      try { await api(`/api/reuniones/reuniones/${r.id}/acta-datos`, { method: 'PUT', body: { items, notas: el.querySelector('[data-notas]').value, compromisos: el.querySelector('[data-comp]').value, estado: el.querySelector('[data-aprob]').checked ? 'aprobada' : 'borrador' } }); toast('Acta guardada'); m.hide(); cargar(); } catch (x) { toast(x.message, false); }
    };
  }

  /* ---------- Listas del año rotario (julio a junio): reuniones y eventos ---------- */
  const barra = () => `<div class="d-flex flex-wrap gap-2 mb-3">${[['calendario', 'Calendario', 'bi-calendar3'], ['reunion', 'Reuniones del año', 'bi-people'], ['evento', 'Eventos del año', 'bi-stars'], ['obra', 'Obras del año', 'bi-hammer']].map(([k, l, ic]) => `<button type="button" class="btn btn-sm rounded-pill ${vista === k ? 'btn-primary' : 'btn-light'}" data-vista="${k}"><i class="bi ${ic} me-1"></i>${l}</button>`).join('')}</div>`;
  function pintarLista() {
    const ACT = (x) => (x.tiene_acta ? C.chip(x.acta_estado === 'aprobada' ? 'ok' : 'soon', x.acta_estado === 'aprobada' ? 'Aprobada' : 'Borrador') : '<span class="small text-body-secondary">—</span>');
    view.innerHTML = `${barra()}<div class="dw-card mb-3 d-flex align-items-center gap-2"><b class="flex-grow-1">${{ evento: 'Eventos', obra: 'Obras' }[vista] || 'Reuniones'} del año rotario ${anio}-${anio + 1}</b>
        <div class="btn-group btn-group-sm"><button class="btn btn-light" data-ay="-1" aria-label="Año anterior"><i class="bi bi-chevron-left"></i></button><button class="btn btn-light" data-ay="1" aria-label="Año siguiente"><i class="bi bi-chevron-right"></i></button></div></div>
      ${lista.length ? window.App.table([{ label: 'Fecha', html: (x) => `<span class="text-capitalize">${C.day(x.fecha)}</span>${x.hora_ini ? `<div class="small text-body-secondary">${esc(x.hora_ini)}</div>` : ''}` },
        { label: ETQ[vista] || 'Reunión', main: true, html: (x) => `<a href="#" data-ev="${x.id}" class="fw-semibold text-decoration-none">${esc(x.titulo)}</a><div class="small text-body-secondary fw-normal">${esc(x.lugar || x.modalidad || '')}${x.proyecto ? ` · <i class="bi bi-globe-americas"></i> ${esc(x.proyecto)}` : ''}</div>` },
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
        ${ev.slice(0, 2).map((x) => `<a class="ro-evc${x.estado === 'cancelada' ? ' ro-cancel' : ''}" href="#" data-ev="${x.id}" style="--ev:${COLOR[x.tipo] || COLOR.reunion}" title="${esc(x.titulo)}">
          <span class="ro-evc-h"><i class="bi ${ICO[x.tipo] || ICO.reunion}"></i>${esc(x.hora_ini || ETQ[x.tipo] || '')}${x.mi_respuesta === 'si' ? '<i class="bi bi-check-circle-fill ms-auto" title="Vas"></i>' : ''}</span>
          <span class="ro-evc-t">${esc(x.titulo)}</span>${x.proyecto ? `<span class="ro-evc-p"><i class="bi bi-globe-americas"></i> ${esc(x.proyecto)}</span>` : ''}</a>`).join('')}
        ${ev.length > 2 ? `<a class="ro-evc-mas" href="#" data-ev="${ev[2].id}">+${ev.length - 2} más</a>` : ''}</td>`;
    };
    const prox = proximas[0];
    view.innerHTML = `<style>.ro-aqui{display:inline-block;margin:0 0 3px;font-size:.62rem;font-weight:700;color:#fff;background:var(--dw-p);border-radius:999px;padding:1px 7px;vertical-align:middle}
        .ro-pasado .ro-evc{opacity:.62}.ro-cal .dw-mes td{height:138px;padding:5px}
        .ro-evc{display:flex;flex-direction:column;gap:1px;margin-bottom:4px;padding:5px 7px;border-radius:9px;border-left:4px solid var(--ev);background:color-mix(in srgb,var(--ev) 13%,var(--bs-body-bg));color:inherit;text-decoration:none;line-height:1.2;overflow:hidden}
        .ro-evc:hover{background:color-mix(in srgb,var(--ev) 22%,var(--bs-body-bg));color:inherit}
        .ro-evc-h{display:flex;align-items:center;gap:4px;font-size:.68rem;font-weight:700;color:var(--ev)}.ro-evc-t{font-size:.78rem;font-weight:600;overflow-wrap:anywhere;hyphens:auto;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
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
