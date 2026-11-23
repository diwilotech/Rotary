// Reuniones: calendario didáctico del mes. Abre en HOY («estás aquí»), muestra reuniones y eventos con colores distintos,
// la próxima con cuenta regresiva y la línea de lo que viene. Tocar un día vacío crea (junta); tocar una reunión abre su detalle:
// confirmaciones, asistencia, minuta y compromisos.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const C = window.App.Crud, RO = window.RO;
  RO.nav('reuniones');
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const M = me.canManage && !me.business.readOnly;
  const COLOR = { reunion: 'var(--dw-p)', evento: '#f59e0b' };
  const ETQ = { reunion: 'Reunión', evento: 'Evento' };
  const EST = { programada: ['free', 'Programada'], confirmada: ['ok', 'Confirmada'], realizada: ['ok', 'Realizada'], cancelada: ['bad', 'Cancelada'] };
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const mas = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const lunes = (iso) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const mesMas = (ym, n) => { const d = new Date(`${ym}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  const hoy = C.todayCo();
  let ym = hoy.slice(0, 7), rows = [], proximas = [];

  if (M) acciones.innerHTML = '<button class="btn btn-primary" data-nuevo><i class="bi bi-plus-lg me-1"></i>Nueva reunión o evento</button>';
  acciones.querySelector('[data-nuevo]')?.addEventListener('click', () => editar(null, hoy));

  const CAMPOS = [{ k: 'tipo', label: 'Tipo', type: 'select', options: [['reunion', 'Reunión'], ['evento', 'Evento']] }, { k: 'titulo', label: 'Título', type: 'text', required: true },
    { k: 'fecha', label: 'Fecha', type: 'date', required: true }, { k: 'estado', label: 'Estado', type: 'select', options: Object.entries(EST).map(([k, [, l]]) => [k, l]) },
    { k: 'hora_ini', label: 'Hora de inicio', type: 'text', placeholder: '19:00' }, { k: 'hora_fin', label: 'Hora de fin', type: 'text', placeholder: '21:00' },
    { k: 'modalidad', label: 'Modalidad', type: 'select', options: [['presencial', 'Presencial'], ['virtual', 'Virtual'], ['mixta', 'Mixta']] }, { k: 'lugar', label: 'Lugar', type: 'text' },
    { k: 'enlace', label: 'Enlace (virtual)', type: 'url', full: true }, { k: 'descripcion', label: 'Descripción / orden del día', type: 'long' },
    { k: 'minuta', label: 'Minuta / acta', type: 'long' }, { k: 'compromisos', label: 'Compromisos', type: 'long' }];

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
  }

  function pintar() {
    const primero = `${ym}-01`, ultimo = mas(`${mesMas(ym, 1)}-01`, -1), desde = lunes(primero), hasta = mas(lunes(ultimo), 6);
    const semanas = Math.round((Date.parse(hasta) - Date.parse(desde)) / 864e5 + 1) / 7;
    const titulo = new Date(`${primero}T12:00:00Z`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const celda = (f) => {
      const ev = rows.filter((x) => x.fecha === f).sort((p, q) => String(p.hora_ini || '').localeCompare(String(q.hora_ini || '')));
      return `<td class="${f === hoy ? 'hoy' : ''} ${f.startsWith(ym) ? '' : 'fuera'} ${f < hoy ? 'ro-pasado' : ''} ${ev.length ? '' : 'vacio'}" data-f="${f}" data-dia="${DIAS[new Date(`${f}T12:00:00Z`).getUTCDay()]} ${+f.slice(8)}">
        <div class="dw-mes-n">${+f.slice(8)}</div>${f === hoy ? '<span class="ro-aqui">Estás aquí</span>' : ''}
        ${ev.map((x) => `<a class="dw-ev dw-ev--mini${x.estado === 'cancelada' ? ' ro-cancel' : ''}" href="#" data-ev="${x.id}" style="--ev:${COLOR[x.tipo]}" title="${esc(x.titulo)}"><b>${esc(x.hora_ini || '')}</b> ${esc(x.titulo)}${x.mi_respuesta === 'si' ? ' ✓' : ''}</a>`).join('')}</td>`;
    };
    const prox = proximas[0];
    view.innerHTML = `<style>.ro-aqui{display:inline-block;margin:0 0 3px;font-size:.62rem;font-weight:700;color:#fff;background:var(--dw-p);border-radius:999px;padding:1px 7px;vertical-align:middle}
        .ro-pasado .dw-ev{opacity:.6}.ro-cancel{text-decoration:line-through;opacity:.5}.ro-hoy-box{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
        .ro-hoy-dia{width:64px;height:64px;border-radius:16px;background:var(--dw-p);color:#fff;display:grid;place-items:center;line-height:1;text-align:center}.ro-hoy-dia b{font-size:1.6rem;display:block}.ro-hoy-dia span{font-size:.7rem;text-transform:uppercase}
        .ro-tl{list-style:none;padding:0;margin:0;border-left:2px solid var(--bs-border-color);margin-left:8px}.ro-tl li{position:relative;padding:0 0 14px 18px}.ro-tl li:before{content:"";position:absolute;left:-7px;top:4px;width:12px;height:12px;border-radius:50%;background:var(--c);box-shadow:0 0 0 3px var(--bs-body-bg)}</style>
      <div class="dw-card mb-3 ro-hoy-box"><div class="ro-hoy-dia"><span>${DIAS[new Date(`${hoy}T12:00:00Z`).getUTCDay()]}</span><b>${+hoy.slice(8)}</b></div>
        <div class="flex-grow-1"><div class="small text-body-secondary">Hoy es</div><div class="fw-semibold text-capitalize">${RO.fechaLarga(hoy)}</div>
        <div class="small mt-1">${prox ? `Próxima: <a href="#" data-ev="${prox.id}"><b>${esc(prox.titulo)}</b></a> · <span style="color:${COLOR[prox.tipo]}">${ETQ[prox.tipo]}</span> · <b>${cuando(prox.fecha)}</b>${prox.hora_ini ? ` a las ${esc(prox.hora_ini)}` : ''}` : 'No hay reuniones programadas.'}</div></div>
        <div class="dw-legend m-0"><span><i style="background:${COLOR.reunion}"></i>Reuniones</span><span><i style="background:${COLOR.evento}"></i>Eventos</span></div></div>
      <div class="row g-3"><div class="col-lg-9"><div class="dw-card">
        <div class="d-flex align-items-center gap-2 mb-3"><button class="btn btn-light" data-prev aria-label="Mes anterior"><i class="bi bi-chevron-left"></i></button>
          <b class="flex-grow-1 text-center text-capitalize fs-5">${titulo}</b>${ym !== hoy.slice(0, 7) ? '<button class="btn btn-outline-primary btn-sm" data-hoy><i class="bi bi-geo-alt-fill me-1"></i>Volver a hoy</button>' : ''}<button class="btn btn-light" data-next aria-label="Mes siguiente"><i class="bi bi-chevron-right"></i></button></div>
        <table class="dw-semana dw-mes" data-dt="off"><thead><tr>${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${Array.from({ length: semanas }, (_, w) => `<tr>${Array.from({ length: 7 }, (_, i) => celda(mas(desde, w * 7 + i))).join('')}</tr>`).join('')}</tbody></table></div></div>
        <div class="col-lg-3"><div class="dw-card"><div class="ro-h mt-0">Lo que viene</div>${proximas.length ? `<ul class="ro-tl">${proximas.slice(0, 8).map((x) => `<li style="--c:${COLOR[x.tipo]}"><a href="#" data-ev="${x.id}" class="fw-semibold d-block text-decoration-none">${esc(x.titulo)}</a><span class="small text-body-secondary text-capitalize">${RO.fechaLarga(x.fecha)}${x.hora_ini ? ` · ${esc(x.hora_ini)}` : ''}</span><div class="small">${cuando(x.fecha)} · ${x.confirmados} confirmados</div></li>`).join('')}</ul>` : '<p class="small text-body-secondary mb-0">Nada programado.</p>'}</div></div></div>`;
  }

  async function cargar() {
    const desde = lunes(`${ym}-01`), hasta = mas(lunes(mas(`${mesMas(ym, 1)}-01`, -1)), 6);
    const [d, p] = await Promise.all([api(`/api/reuniones/calendario?desde=${desde}&hasta=${hasta}`), api(`/api/reuniones/calendario?desde=${hoy}&hasta=${mas(hoy, 120)}`)]);
    rows = d.rows; proximas = p.rows.filter((x) => x.estado !== 'cancelada');
    pintar();
  }

  view.addEventListener('click', (e) => {
    const ev = e.target.closest('[data-ev]');
    if (ev) { e.preventDefault(); const r = [...rows, ...proximas].find((x) => String(x.id) === ev.dataset.ev); if (r) detalle(r); return; }
    if (e.target.closest('[data-prev]')) { ym = mesMas(ym, -1); return cargar(); }
    if (e.target.closest('[data-next]')) { ym = mesMas(ym, 1); return cargar(); }
    if (e.target.closest('[data-hoy]')) { ym = hoy.slice(0, 7); return cargar(); }
    const td = e.target.closest('td[data-f]');
    if (td && M && !e.target.closest('a')) editar(null, td.dataset.f);
  });
  RO._yo = await api('/api/lotuyo/carnet').then((d) => d.carnet).catch(() => null);
  await cargar();
});
