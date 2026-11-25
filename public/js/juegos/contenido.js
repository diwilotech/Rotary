// Contenido de los juegos (preguntas de Trivia, palabras del Impostor, frases de ¿Quién es más probable?, casillas del
// Bingo). Ventana común para la sala de Juegos del club y para el Distrito.
//   RoContenido.abrir({ base: '/api/juegos/contenido' | '/api/distrito/juegos/contenido', juego, titulo })
// Cualquiera añade. Quien gestiona (presidencia del club o junta del distrito) ve TODO lo que hay —lo de la app, lo del
// distrito y lo del club— sin saber quién lo añadió, y puede apagar, prender o borrar. Los demás ven cuántas hay y las suyas.
(function () {
  const { api, esc, toast, modal } = window.App;
  const ORIGEN = { app: ['Banco de la app', 'bi-box-seam'], distrito: ['Del distrito', 'bi-diagram-3'], club: ['Del club', 'bi-people'] };

  function formulario(juego) {
    if (juego === 'trivia') return `<div class="mb-2"><label class="form-label small mb-1">Pregunta</label><input class="form-control" name="p" maxlength="200" required placeholder="¿En qué año se fundó nuestro club?"></div>
      <div class="row g-2"><div class="col-sm-6"><label class="form-label small mb-1 text-success fw-semibold">Respuesta correcta</label><input class="form-control border-success" name="o0" maxlength="90" required></div>
      <div class="col-sm-6"><label class="form-label small mb-1">Incorrecta 1</label><input class="form-control" name="o1" maxlength="90" required></div>
      <div class="col-sm-6"><label class="form-label small mb-1">Incorrecta 2</label><input class="form-control" name="o2" maxlength="90" required></div>
      <div class="col-sm-6"><label class="form-label small mb-1">Incorrecta 3</label><input class="form-control" name="o3" maxlength="90" required></div></div>
      <div class="form-text">En el juego las respuestas salen en desorden.</div>`;
    if (juego === 'impostor') return `<div class="row g-2"><div class="col-sm-7"><label class="form-label small mb-1">Palabra secreta</label><input class="form-control" name="palabra" maxlength="40" required placeholder="Rotaparche"></div>
      <div class="col-sm-5"><label class="form-label small mb-1">Categoría</label><input class="form-control" name="categoria" maxlength="40" list="ro-cats" placeholder="Del club"><datalist id="ro-cats"><option>Del club</option><option>Rotary y el club</option><option>Lugares</option><option>Comida</option><option>Profesiones</option><option>Objetos</option></datalist></div></div>
      <div class="form-text">Todos menos el impostor la ven; la categoría sí la ven todos.</div>`;
    if (juego === 'probable') return `<label class="form-label small mb-1">¿Quién es más probable que…?</label><div class="input-group"><span class="input-group-text">¿Quién es más probable que</span><input class="form-control" name="frase" maxlength="140" required placeholder="llegue con donas a la reunión"><span class="input-group-text">?</span></div>`;
    if (juego === 'bingo') return `<label class="form-label small mb-1">Casilla del Bingo rotario</label><input class="form-control" name="texto" maxlength="40" required placeholder="Rotaparche"><div class="form-text">Una palabra o frase corta. El Bingo rotario necesita al menos 24 casillas.</div>`;
    return '';
  }
  function datosDe(juego, f) {
    if (juego === 'trivia') return { p: f.p.value, o: [f.o0.value, f.o1.value, f.o2.value, f.o3.value] };
    if (juego === 'impostor') return { palabra: f.palabra.value, categoria: f.categoria.value };
    if (juego === 'probable') return { frase: f.frase.value };
    return { texto: f.texto.value };
  }

  async function abrir({ base, juego, titulo }) {
    const { el } = modal('<div class="modal-body p-4 text-body-secondary">Cargando…</div>', { size: 'modal-lg' });
    let filtro = '', origen = '', estado = '';
    const pintar = async () => {
      let d; try { d = await api(`${base}?juego=${encodeURIComponent(juego)}`); } catch (x) { el.querySelector('.modal-content').innerHTML = `<div class="modal-body">${esc(x.message)}</div>`; return; }
      const T = d.tipo;
      const lista = d.gestiona ? d.items.filter((x) => (!filtro || `${x.texto} ${x.detalle}`.toLowerCase().includes(filtro)) && (!origen || x.origen === origen) && (!estado || (estado === 'on' ? x.activo : !x.activo))) : [];
      const cuenta = (o) => d.items.filter((x) => x.origen === o).length;
      el.querySelector('.modal-content').innerHTML = `<div class="modal-header"><h2 class="modal-title h5">${esc(titulo)} · ${esc(T.nombre)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
        <div class="modal-body">
          <form class="dw-card mb-3" data-nueva><div class="fw-semibold mb-2"><i class="bi bi-plus-circle me-1"></i>Añadir ${esc(T.uno)}</div>${formulario(juego)}<div class="text-end mt-2"><button class="btn btn-primary">Añadir</button></div></form>
          <div class="small text-body-secondary mb-2"><i class="bi bi-collection me-1"></i><b class="text-body">${d.activas}</b> ${esc(T.nombre.toLowerCase())} en juego${d.gestiona ? '' : ' (las del club, las del distrito y las de la app)'}.</div>
          ${d.gestiona ? `<div class="d-flex flex-wrap gap-1 align-items-center mb-2">
              ${[['', 'Todas', d.items.length], ['club', 'Del club', cuenta('club')], ['distrito', 'Del distrito', cuenta('distrito')], ['app', 'De la app', cuenta('app')]].filter(([k, , n]) => !k || n).map(([k, l, n]) => `<button type="button" class="btn btn-sm rounded-pill ${origen === k ? 'btn-primary' : 'btn-light'}" data-or="${k}">${l} <span class="badge rounded-pill ${origen === k ? 'text-bg-light' : 'text-bg-secondary'}">${n}</span></button>`).join('')}
              <select class="form-select form-select-sm" style="max-width:150px" data-est aria-label="Estado"><option value="">Prendidas y apagadas</option><option value="on" ${estado === 'on' ? 'selected' : ''}>Solo prendidas</option><option value="off" ${estado === 'off' ? 'selected' : ''}>Solo apagadas</option></select>
              <input class="form-control form-control-sm ms-auto" style="max-width:200px" placeholder="Buscar…" data-buscar value="${esc(filtro)}" aria-label="Buscar"></div>
            <div class="small text-body-secondary mb-2">Ves todo lo que hay, sin saber quién lo añadió. Apagar = no sale en las partidas (se puede volver a prender).</div>
            <div class="list-group" style="max-height:48vh;overflow:auto">${lista.map((x) => `<div class="list-group-item d-flex align-items-start gap-2 ${x.activo ? '' : 'opacity-50'}">
                <div class="form-check form-switch m-0 pt-1"><input class="form-check-input" type="checkbox" role="switch" ${x.activo ? 'checked' : ''} data-sw="${esc(x.clave)}" ${x.id ? `data-id="${x.id}"` : ''} aria-label="Prendida"></div>
                <div class="flex-grow-1 min-w-0"><div class="fw-semibold">${esc(x.texto)}</div>${x.detalle ? `<div class="small text-body-secondary">${esc(x.detalle)}</div>` : ''}
                  <span class="badge rounded-pill text-bg-light border mt-1"><i class="bi ${ORIGEN[x.origen][1]} me-1"></i>${ORIGEN[x.origen][0]}</span></div>
                ${x.id ? `<button type="button" class="btn btn-sm btn-light" data-borrar="${x.id}" title="Borrar" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div>`).join('') || '<div class="list-group-item small text-body-secondary">Nada con ese filtro.</div>'}</div>`
            : `${d.mias.length ? `<div class="ro-h">Lo que has añadido</div><div class="list-group">${d.mias.map((x) => `<div class="list-group-item d-flex gap-2 align-items-center"><span class="flex-grow-1">${esc(x.texto)}${x.detalle ? ` <span class="small text-body-secondary">· ${esc(x.detalle)}</span>` : ''}</span>${x.activo ? '<span class="badge text-bg-success">En juego</span>' : '<span class="badge text-bg-secondary">Apagada</span>'}</div>`).join('')}</div>` : ''}`}
        </div>`;
      const f = el.querySelector('[data-nueva]');
      f.onsubmit = async (e) => { e.preventDefault(); const b = f.querySelector('button'); b.disabled = true;
        try { await api(base, { method: 'POST', body: { juego, datos: datosDe(juego, f) } }); toast(`Listo: ${T.uno} añadida`); await pintar(); el.querySelector('[data-nueva] input')?.focus(); } catch (x) { toast(x.message, false); b.disabled = false; } };
      el.querySelectorAll('[data-or]').forEach((b) => (b.onclick = () => { origen = b.dataset.or; pintar(); }));
      el.querySelector('[data-est]')?.addEventListener('change', (e) => { estado = e.target.value; pintar(); });
      const bu = el.querySelector('[data-buscar]'); if (bu) bu.oninput = () => { filtro = bu.value.trim().toLowerCase(); clearTimeout(bu._t); bu._t = setTimeout(() => { pintar().then(() => { const n = el.querySelector('[data-buscar]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }); }, 250); };
      el.querySelectorAll('[data-sw]').forEach((i) => (i.onchange = async () => {
        try {
          if (i.dataset.id) await api(`${base}/${i.dataset.id}`, { method: 'PATCH', body: { activo: i.checked } });
          else await api(`${base}/ocultos`, { method: 'PUT', body: { juego, clave: i.dataset.sw, activo: i.checked } });
          i.closest('.list-group-item').classList.toggle('opacity-50', !i.checked);
        } catch (x) { toast(x.message, false); i.checked = !i.checked; }
      }));
      el.querySelectorAll('[data-borrar]').forEach((b) => (b.onclick = async () => {
        if (!(await window.App.confirm({ title: `¿Borrar esta ${T.uno}?`, text: 'Se borra para siempre. Si solo quieres que no salga, apágala.', ok: 'Borrar' }))) return;
        try { await api(`${base}/${b.dataset.borrar}`, { method: 'DELETE' }); toast('Borrada'); pintar(); } catch (x) { toast(x.message, false); }
      }));
    };
    pintar();
  }
  window.RoContenido = { abrir };
})();
