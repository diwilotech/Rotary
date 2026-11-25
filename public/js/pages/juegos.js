// Juegos del club: la sala de juegos (catálogo, código para unirse, salas abiertas, ranking del año) y cada partida.
// La partida se actualiza sola (consulta cada 1,5 s y solo se redibuja si cambió); los tableros están en /js/juegos/tableros.js.
// Conexión: si falla la red se muestra «Reconectando…» y se reintenta cada vez más espaciado; al volver a la pestaña consulta
// de una vez; la sala queda guardada en el celular y al abrir Juegos vuelve sola. Entrar por enlace: /staff/juegos.html?codigo=ABCD.
// Contenido de cada juego (preguntas, palabras, frases, casillas): /js/juegos/contenido.js. Retos y ranking del distrito.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast, modal } = window.App;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]'), h1 = document.querySelector('[data-h1]');
  let catalogo = [], sala = null, timer = null, sel = null, desfase = 0, ocupado = false, fallos = 0, espera = 0;
  const C = window.App.Crud, LS = `ro_jg_sala_${me.business.id}`;
  const recordar = (id) => { try { id ? localStorage.setItem(LS, String(id)) : localStorage.removeItem(LS); } catch (_) {} };
  const recordada = () => { try { return Number(localStorage.getItem(LS)) || null; } catch (_) { return null; } };
  const deCat = (id) => catalogo.find((g) => g.id === id) || { nombre: id, emoji: '🎮' };

  document.head.insertAdjacentHTML('beforeend', `<style>
    .jg-cat{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))}
    .jg-g{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:16px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg)}.jg-g .e{font-size:2rem;line-height:1}
    .jg-codigo{font:800 2.2rem/1 ui-monospace,monospace;letter-spacing:.3em;color:var(--dw-p)}
    .jg-carta{background:linear-gradient(160deg,rgba(var(--dw-p-rgb),.1),var(--bs-body-bg));border:1px solid var(--bs-border-color);border-radius:18px;padding:18px;text-align:center;margin-bottom:12px}
    .jg-carta.jg-imp{background:linear-gradient(160deg,#1d2433,#3b1a2a);color:#fff}.jg-big{font-size:1.7rem;font-weight:800;margin:6px 0}
    .jg-gr{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
    .jg-persona{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px;border-radius:14px;border:2px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit}.jg-persona.on{border-color:var(--dw-p);background:rgba(var(--dw-p-rgb),.08)}
    .jg-pregunta{font-size:1.25rem;font-weight:700;text-align:center;margin:8px 0 14px}
    .jg-ops{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}.jg-ops1{grid-template-columns:1fr}
    .jg-op{display:flex;gap:10px;align-items:center;text-align:left;padding:12px 14px;border-radius:14px;border:0;color:#fff;background:var(--c);font-weight:600}.jg-op b{background:rgba(255,255,255,.25);border-radius:8px;padding:2px 8px}
    .jg-op.on{outline:3px solid #111;outline-offset:2px}.jg-op.ok{background:#16a34a}.jg-op.mal{background:#dc2626}.jg-op.off{opacity:.45}.jg-op:disabled{cursor:default}
    .jg-triqui{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:300px;margin:0 auto}.jg-tq{aspect-ratio:1;border-radius:14px;border:2px solid var(--bs-border-color);background:var(--bs-body-bg);font-size:2.6rem;font-weight:800}
    .jg-tq.x{color:#17458F}.jg-tq.o{color:#D41367}.jg-tq.gana{background:#fef3c7}
    .jg-chip{display:inline-flex;align-items:center;gap:4px;font-size:.78rem;padding:3px 10px;border-radius:999px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg)}.jg-chip.on{border-color:var(--dw-p);background:rgba(var(--dw-p-rgb),.1);font-weight:700}
    .jg-mesa{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;align-items:center;min-height:64px;padding:10px;border-radius:14px;background:#14532d}
    .jg-ficha{display:inline-flex;align-items:center;background:#fff;border-radius:6px;border:1px solid #222;padding:2px}.jg-ficha.v{flex-direction:column}.jg-sep{background:#999;align-self:stretch;width:1px}.jg-ficha.v .jg-sep{height:1px;width:auto}
    .jg-m{display:grid;grid-template-columns:repeat(3,6px);gap:1px;padding:2px}.jg-m i{width:6px;height:6px;border-radius:50%}.jg-m i.p{background:#111}
    .jg-ficha.sel{outline:3px solid var(--dw-p)}.jg-ficha.ok{box-shadow:0 0 0 2px #16a34a}
    .jg-mano{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:10px;border-radius:14px;background:rgba(var(--dw-p-rgb),.05)}.jg-fb{border:0;background:none;padding:0}.jg-fb:disabled{opacity:.45}
    .jg-parques{display:block;width:100%;max-width:440px;margin:0 auto}.jg-fpq{cursor:pointer}.jg-dados{font-size:2rem;line-height:1}.jg-dado{margin:0 2px}
    .jg-rc{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:52px;height:76px;border-radius:9px;background:var(--c);color:#fff;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);font-weight:800;font-size:1.3rem;line-height:1}
    .jg-rc.w{background:linear-gradient(135deg,#17458F,#D41367,#E08E0B,#0067C8)}.jg-rc small{font-size:.5rem;font-weight:600;margin-top:4px;text-align:center}.jg-rc.g{width:78px;height:112px;font-size:2rem}.jg-rc.sel{transform:translateY(-8px);outline:3px solid #111}
    .jg-lleva{display:inline-flex;flex-direction:column;align-items:center;font-size:.7rem}.jg-lleva .jg-rc{width:40px;height:58px;font-size:1rem}
    .jg-net{position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:1080;background:#b45309;color:#fff;border-radius:999px;padding:6px 14px;font-size:.85rem;box-shadow:0 4px 14px rgba(0,0,0,.25)}
    .jg-jug span.off{opacity:.45;filter:grayscale(1)}
    .jg-reto{display:flex;gap:10px;align-items:center;padding:12px;border-radius:14px;border:1px solid var(--bs-border-color);background:linear-gradient(135deg,rgba(var(--dw-p-rgb),.1),var(--bs-body-bg))}
    .jg-rk-mio{background:rgba(var(--dw-p-rgb),.1);border-radius:8px}
    .jg-bola-w{text-align:center;margin-bottom:12px}.jg-bola{display:inline-grid;place-items:center;min-width:96px;height:96px;padding:0 12px;border-radius:999px;background:radial-gradient(circle at 30% 30%,#fff,#f3c64b 45%,#c2840c);color:#1b1b1b;font-weight:800;font-size:1.6rem;box-shadow:0 8px 20px rgba(0,0,0,.25)}.jg-bola.vacia{background:var(--bs-secondary-bg);color:var(--bs-secondary-color)}
    .jg-aviso{display:inline-block;margin-top:6px;padding:4px 12px;border-radius:999px;background:rgba(var(--dw-p-rgb),.12);font-weight:600}
    .jg-carton{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;max-width:420px;margin:0 auto}.jg-cab{text-align:center;font-weight:800;color:var(--dw-p);font-size:1.2rem}
    .jg-cas{aspect-ratio:1;border-radius:10px;border:2px solid var(--bs-border-color);background:var(--bs-body-bg);font-weight:700;font-size:1.15rem;color:var(--bs-body-color);padding:2px;line-height:1.1;overflow:hidden}
    .jg-carton.palabras .jg-cas{font-size:.68rem;font-weight:600;overflow-wrap:anywhere}
    .jg-cas.sale{border-color:var(--dw-p);background:rgba(var(--dw-p-rgb),.12)}.jg-cas.m{background:var(--dw-p);border-color:var(--dw-p);color:#fff}.jg-cas.libre{background:#f3c64b;border-color:#f3c64b;font-size:1.3rem}.jg-cas:disabled{cursor:default}
    .jg-hist{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.jg-hist span{font-size:.75rem;padding:2px 8px;border-radius:999px;background:var(--bs-secondary-bg)}
    @keyframes jgb{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}.jg-brilla{animation:jgb 1s infinite}
    .jg-jug{display:flex;flex-wrap:wrap;gap:6px}.jg-jug span{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:999px;background:rgba(var(--dw-p-rgb),.07);font-size:.85rem}
  </style>`);
  // Vuelve a dibujar sin perder lo que se está escribiendo en un formulario (Dos verdades y una mentira)
  function pintarSinPerder(html) {
    const keep = {}; view.querySelectorAll('[data-keep]').forEach((i) => { keep[i.dataset.keep] = i.value; });
    const foco = document.activeElement?.dataset?.keep;
    view.innerHTML = html;
    view.querySelectorAll('[data-keep]').forEach((i) => { if (keep[i.dataset.keep] !== undefined) i.value = keep[i.dataset.keep]; if (i.dataset.keep === foco) i.focus(); });
  }

  /* ---------- Sala de juegos ---------- */
  async function lobby() {
    clearInterval(timer); sala = null; sel = null; red(true); history.replaceState(null, '', location.pathname); h1.textContent = 'Juegos';
    acciones.innerHTML = '';
    view.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    const [cat, salas, rk, retos, rkc] = await Promise.all([api('/api/juegos/catalogo'), api('/api/juegos/salas'), api('/api/juegos/ranking').catch(() => ({ rows: [] })),
      api('/api/juegos/retos').catch(() => ({ rows: [] })), api('/api/juegos/ranking-clubes').catch(() => ({ rows: [] }))]);
    catalogo = cat.rows;
    // Volver sola a la partida si la app se cerró o se cayó la conexión con la partida en juego
    if (salas.mia && recordada() === salas.mia.id && salas.mia.estado === 'jugando') return abrir(salas.mia.id);
    view.innerHTML = `<div class="dw-card mb-3 d-flex flex-wrap align-items-center gap-2"><i class="bi bi-controller fs-3" style="color:var(--dw-p)"></i><div class="flex-grow-1"><b>¿Te pasaron un código?</b><div class="small text-body-secondary">Escríbelo para entrar a la sala.</div></div>
        <form class="d-flex gap-2" data-unirse><input class="form-control text-uppercase" name="codigo" maxlength="4" placeholder="ABCD" style="width:110px;letter-spacing:.2em;font-weight:700" required><button class="btn btn-primary">Entrar</button></form></div>
      ${salas.abiertas.length ? `<div class="ro-h mt-0">Salas abiertas</div><div class="d-flex flex-wrap gap-2 mb-3">${salas.abiertas.map((s) => `<button type="button" class="btn btn-outline-primary" data-entrar="${esc(s.codigo)}">${deCat(s.juego).emoji} ${esc(deCat(s.juego).nombre)} · <b>${esc(s.codigo)}</b> · ${s.jugadores} ${s.estado === 'espera' ? '(esperando)' : '(jugando)'}</button>`).join('')}</div>` : ''}
      ${salas.mia ? `<div class="alert alert-primary d-flex align-items-center gap-2 flex-wrap"><i class="bi bi-arrow-repeat fs-5"></i><span class="flex-grow-1">Tienes una partida ${salas.mia.estado === 'jugando' ? 'en juego' : 'esperando'}: <b>${deCat(salas.mia.juego).emoji} ${esc(deCat(salas.mia.juego).nombre)}</b> (sala ${esc(salas.mia.codigo)}).</span><button class="btn btn-primary btn-sm" data-volvera="${salas.mia.id}">Volver a la partida</button></div>` : ''}
      ${retos.rows.length ? `<div class="ro-h mt-0">Retos del distrito ${esc(retos.distrito || '')}</div><div class="d-grid gap-2 mb-3">${retos.rows.map((r) => `<div class="jg-reto"><span class="fs-2">${deCat(r.juego).emoji}</span>
          <div class="flex-grow-1 min-w-0"><b>${esc(r.nombre)}</b><div class="small text-body-secondary">${esc(deCat(r.juego).nombre)} · ${C.day(r.desde)} → ${C.day(r.hasta)}${r.descripcion ? ` · ${esc(r.descripcion)}` : ''}</div></div>
          ${r.abierto ? `<button class="btn btn-primary btn-sm" data-crear="${r.juego}" data-reto="${r.id}"><i class="bi bi-trophy me-1"></i>Jugar el reto</button>` : `<span class="badge text-bg-light border">${r.desde > C.todayCo() ? 'Pronto' : 'Cerrado'}</span>`}</div>`).join('')}</div>` : ''}
      <div class="ro-h mt-0">Elige un juego</div>
      <div class="jg-cat mb-4">${catalogo.map((g) => `<div class="jg-g"><span class="e">${g.emoji}</span><b>${esc(g.nombre)}</b><span class="small text-body-secondary flex-grow-1">${esc(g.resumen)}</span>
        <span class="small"><i class="bi bi-people me-1"></i>${g.min === g.max ? g.min : `${g.min} a ${g.max}`} · <i class="bi bi-clock me-1"></i>${esc(g.duracion)}</span>
        <div class="d-flex gap-2 flex-wrap"><button class="btn btn-primary btn-sm flex-grow-1" data-crear="${g.id}">Crear sala</button><button class="btn btn-light btn-sm" data-como="${g.id}">Cómo se juega</button>${g.contenido ? `<button class="btn btn-outline-primary btn-sm w-100" data-banco="${g.id}"><i class="bi bi-plus-circle me-1"></i>${esc(g.contenido.nombre)}: añadir${me.role === 'owner' ? ' y gestionar' : ''}</button>` : ''}</div></div>`).join('')}</div>
      ${rkc.rows.length ? `<div class="dw-card mb-3"><div class="ro-h mt-0"><i class="bi bi-trophy me-1"></i>Ranking entre clubes · retos del distrito ${esc(rkc.nombre || '')}</div>
          ${rkc.rows.slice(0, 10).map((r) => `<div class="d-flex align-items-center gap-2 py-1 px-1 border-bottom small ${r.id === rkc.mio ? 'jg-rk-mio fw-semibold' : ''}"><b style="width:22px">${['🥇', '🥈', '🥉'][r.puesto - 1] || r.puesto}</b><span class="flex-grow-1">${esc(r.club)}${r.id === rkc.mio ? ' (tu club)' : ''}</span><span class="text-body-secondary">${r.partidas} partidas · ${r.socios} socios</span><b>${r.puntos} pts</b></div>`).join('')}
          ${rkc.rows.some((r) => r.id === rkc.mio) ? '' : '<div class="small text-body-secondary mt-1">Tu club aún no suma puntos: juega un reto del distrito.</div>'}</div>` : ''}
      <div class="row g-3"><div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Ranking del año rotario ${esc(rk.nombre || '')}</div>
          ${rk.rows.length ? rk.rows.slice(0, 10).map((r, i) => `<div class="d-flex align-items-center gap-2 py-1 border-bottom small"><b style="width:22px">${['🥇', '🥈', '🥉'][i] || i + 1}</b><span class="flex-grow-1">${esc(r.nombre)}</span><span>${r.ganadas} ganadas · ${r.partidas} partidas</span></div>`).join('') : '<p class="small text-body-secondary mb-0">Aún no hay partidas este año.</p>'}</div></div>
        <div class="col-lg-6"><div class="dw-card h-100"><div class="ro-h mt-0">Últimas partidas</div>
          ${salas.recientes.length ? salas.recientes.map((s) => `<div class="small py-1 border-bottom">${deCat(s.juego).emoji} ${esc(deCat(s.juego).nombre)}${s.ganador ? ` · ganó <b>${esc(s.ganador)}</b>` : ''}</div>`).join('') : '<p class="small text-body-secondary mb-0">Nada todavía.</p>'}</div></div></div>`;
  }

  /* ---------- Una partida ---------- */
  const ctx = (s) => {
    const J = s.jugadores, por = Object.fromEntries(J.map((p) => [p.id, p]));
    return { yo: s.yo, anfitrion: s.sala.anfitrion_id === s.yo, jugadores: J, sel, njug: J.filter((p) => p.rol === 'jugador').length,
      nombre: (id) => (por[id]?.nombre || 'Alguien').split(' ')[0], nombreCompleto: (id) => por[id]?.nombre || '', foto: (id) => por[id]?.foto || null, juega: (id) => por[id]?.rol === 'jugador' };
  };
  function pintarSala() {
    const s = sala, g = deCat(s.sala.juego), k = ctx(s), anf = k.anfitrion;
    h1.textContent = `${g.emoji} ${g.nombre}${s.sala.reto ? ` · ${s.sala.reto.nombre}` : ''}`;
    recordar(s.sala.estado === 'terminada' ? null : s.sala.id);
    acciones.innerHTML = `<button class="btn btn-light" data-volver><i class="bi bi-arrow-left me-1"></i>Juegos</button>${anf && s.sala.estado !== 'terminada' ? '<button class="btn btn-outline-danger" data-cerrar>Cerrar sala</button>' : ''}`;
    const puntos = (id) => s.puntos?.[id] ?? 0;
    const jug = `<div class="jg-jug">${s.jugadores.map((p) => `<span class="${p.conectado === false ? 'off' : ''}" title="${p.conectado === false ? 'Sin conexión' : ''}">${p.conectado === false ? '<i class="bi bi-wifi-off"></i>' : ''}${window.RO.avatar({ nombre: p.nombre, foto: p.foto }, 26)}${esc(p.nombre.split(' ')[0])}${p.id === s.sala.anfitrion_id ? ' 👑' : ''}${p.rol === 'espectador' ? ' 👀' : ''}${s.juego ? ` · <b>${puntos(p.id)}</b>` : ''}</span>`).join('')}</div>`;
    let cuerpo;
    if (s.sala.estado === 'espera') {
      const n = k.njug, ok = n >= g.min && n <= g.max;
      cuerpo = `<div class="jg-carta"><div class="small">Código de la sala</div><div class="jg-codigo my-2">${esc(s.sala.codigo)}</div><div class="small text-body-secondary">Compártelo: los demás entran desde Juegos con este código.</div>
          <button class="btn btn-sm btn-light mt-2" data-copiar><i class="bi bi-clipboard me-1"></i>Copiar invitación</button></div>
        <div class="dw-card mb-3"><div class="ro-h mt-0">En la sala (${n} de ${g.min === g.max ? g.min : `${g.min} a ${g.max}`})</div>${jug}</div>
        <div class="text-center mb-3">${anf ? `<button class="btn btn-primary btn-lg" data-iniciar ${ok ? '' : 'disabled'}><i class="bi bi-play-fill me-1"></i>Empezar</button>${ok ? '' : `<div class="small text-body-secondary mt-1">Se necesitan ${g.min === g.max ? g.min : `de ${g.min} a ${g.max}`} jugadores</div>`}` : '<div class="text-body-secondary">Esperando a que empiece quien creó la sala…</div>'}</div>
        ${s.sala.juego === 'bingo' ? `<div class="text-center small mb-2">Modo: <b>${s.sala.opciones?.modo === 'palabras' ? 'Bingo rotario (palabras)' : 'Números del 1 al 75'}</b></div>` : ''}${s.sala.reto ? `<div class="alert alert-warning small py-2 text-center"><i class="bi bi-trophy me-1"></i>Partida del reto del distrito «${esc(s.sala.reto.nombre)}»: los puntos suman al ranking entre clubes.</div>` : ''}
        <details class="dw-card small"><summary class="fw-semibold">Cómo se juega</summary><p class="mb-0 mt-2">${esc(g.como || '')}</p></details>`;
    } else if (s.fin || s.sala.estado === 'terminada') {
      const orden = [...s.jugadores].filter((p) => p.rol === 'jugador').sort((a, b) => puntos(b.id) - puntos(a.id));
      cuerpo = `<div class="jg-carta"><div class="jg-big">🏆</div><div class="fs-5 fw-bold">${esc(s.fin?.texto || 'La sala se cerró')}</div></div>
        <div class="dw-card mb-3">${orden.map((p, i) => `<div class="d-flex align-items-center gap-2 py-1 border-bottom"><b style="width:24px">${['🥇', '🥈', '🥉'][i] || i + 1}</b>${window.RO.avatar({ nombre: p.nombre, foto: p.foto }, 28)}<span class="flex-grow-1">${esc(p.nombre)}</span><b>${puntos(p.id)}</b></div>`).join('')}</div>
        <div class="d-flex gap-2 justify-content-center"><button class="btn btn-primary" data-crear="${s.sala.juego}">Jugar otra vez</button><button class="btn btn-light" data-volver>Volver a Juegos</button></div>`;
    } else {
      const R = window.RoJuegos[s.sala.juego];
      cuerpo = `<div class="dw-card mb-2">${jug}</div>${k.juega(k.yo) ? '' : '<div class="alert alert-info small py-2">Estás viendo la partida.</div>'}<div class="dw-card">${R ? R(s.juego, k) : 'Juego no disponible'}</div>`;
    }
    pintarSinPerder(cuerpo);
    relojes();
  }
  function relojes() { view.querySelectorAll('[data-deadline]').forEach((el) => { const s = Math.max(0, Math.ceil((Number(el.dataset.deadline) - (Date.now() + desfase)) / 1000)); el.textContent = `⏱ ${s} s`; el.classList.toggle('text-danger', s <= 5); }); }
  async function abrir(id, datos = null) {
    clearInterval(timer); sel = null;
    try { sala = datos || (await api(`/api/juegos/salas/${id}`)); } catch (x) { toast(x.message, false); return lobby(); }
    desfase = (sala.ahora || Date.now()) - Date.now();
    history.replaceState(null, '', `#sala=${sala.sala.id}`); pintarSala();
    let tic = 0; fallos = 0; espera = 0;
    timer = setInterval(() => { relojes(); if (ocupado || ++tic % 3 !== 0) return; if (espera > 0) { espera--; return; } consultar(); }, 500);   // cada 1,5 s (el reloj, cada 0,5 s)
  }
  // Consulta la sala. Sin red: «Reconectando…» y reintentos cada vez más espaciados (1,5 s → 3 → 6 → hasta 12 s)
  let consultando = false;
  async function consultar() {
    if (!sala || consultando) return; consultando = true;
    try {
      const r = await api(`/api/juegos/salas/${sala.sala.id}?v=${sala.v}`); desfase = (r.ahora || Date.now()) - Date.now();
      fallos = 0; red(true);
      if (r.jugadores) { const cambioFase = r.juego?.fase !== sala.juego?.fase || r.juego?.turno !== sala.juego?.turno; sala = r; if (cambioFase) sel = null; pintarSala(); }
    } catch (x) {
      if (x.status === 404) { recordar(null); toast('La sala ya no existe', false); return lobby(); }
      fallos++; espera = Math.min(7, 2 ** Math.min(fallos, 3) - 1); red(false);
    } finally { consultando = false; }
  }
  function red(ok) {
    let b = document.querySelector('.jg-net');
    if (ok) { b?.remove(); return; }
    if (!b) { b = document.createElement('div'); b.className = 'jg-net'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Reconectando…';
  }
  async function jugar(tipo, datos) {
    ocupado = true;
    try { const r = await api(`/api/juegos/salas/${sala.sala.id}/accion`, { method: 'POST', body: { tipo, datos } }); sala = r; sel = null; pintarSala(); }
    catch (x) { toast(x.status ? x.message : 'Sin conexión: tu jugada no se envió, intenta de nuevo', false); if (!x.status) red(false); } finally { ocupado = false; }
  }
  async function crear(juego, reto_id = null) {
    const body = { juego, reto_id };
    if (juego === 'bingo') {
      const out = await C.form({ title: '🎱 Nueva sala de Bingo', fields: [{ k: 'modo', label: '¿Con qué se juega?', type: 'select', options: [['numeros', 'Números del 1 al 75 (clásico)'], ['palabras', 'Bingo rotario (palabras del club)']], hint: 'El Bingo rotario usa las casillas del club, del distrito y de la app (al menos 24).' }], values: { modo: 'numeros' }, okText: 'Crear sala' });
      if (!out) return; body.modo = out.modo;
    }
    try { const r = await api('/api/juegos/salas', { method: 'POST', body }); abrir(r.sala.id, r); } catch (x) { toast(x.message, false); }
  }
  async function unirse(codigo) { try { const r = await api('/api/juegos/unirse', { method: 'POST', body: { codigo } }); abrir(r.sala.id, r); } catch (x) { toast(x.message, false); if (!sala) lobby(); } }

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],[data-sel],[data-crear],[data-como],[data-entrar],[data-volver],[data-iniciar],[data-cerrar],[data-copiar],[data-banco],[data-volvera]');
    if (!t || !(view.contains(t) || acciones.contains(t))) return;
    if (t.dataset.act) return jugar(t.dataset.act, JSON.parse(t.dataset.d || '{}'));
    if (t.dataset.sel) { const s = JSON.parse(t.dataset.sel); sel = JSON.stringify(sel) === JSON.stringify(s) ? null : s; return pintarSala(); }
    if (t.dataset.crear) return crear(t.dataset.crear, t.dataset.reto ? Number(t.dataset.reto) : null);
    if (t.dataset.banco) { const g = deCat(t.dataset.banco); return window.RoContenido.abrir({ base: '/api/juegos/contenido', juego: g.id, titulo: `${g.emoji} ${g.nombre}` }); }
    if (t.dataset.volvera) return abrir(Number(t.dataset.volvera));
    if (t.dataset.entrar) return unirse(t.dataset.entrar);
    if (t.dataset.como) { const g = deCat(t.dataset.como); modal(`<div class="modal-header"><h2 class="modal-title h5">${g.emoji} ${esc(g.nombre)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div><div class="modal-body"><p>${esc(g.como)}</p><div class="small text-body-secondary">${g.min === g.max ? g.min : `De ${g.min} a ${g.max}`} jugadores · ${esc(g.duracion)}${g.espectadores ? ' · se puede ver como espectador' : ''}</div></div>`); return; }
    if (t.matches('[data-volver]')) { recordar(null); if (sala && sala.sala.estado === 'espera') await api(`/api/juegos/salas/${sala.sala.id}/salir`, { method: 'POST', body: {} }).catch(() => {}); return lobby(); }
    if (t.matches('[data-iniciar]')) { try { const r = await api(`/api/juegos/salas/${sala.sala.id}/iniciar`, { method: 'POST', body: {} }); abrir(r.sala.id, r); } catch (x) { toast(x.message, false); } return; }
    if (t.matches('[data-cerrar]')) { if (!(await window.App.confirm({ title: '¿Cerrar la sala?', text: 'La partida termina para todos.', ok: 'Cerrar' }))) return; await api(`/api/juegos/salas/${sala.sala.id}/cerrar`, { method: 'POST', body: {} }).catch(() => {}); return lobby(); }
    if (t.matches('[data-copiar]')) { const txt = `Te invito a jugar ${deCat(sala.sala.juego).nombre} en ${me.business.name}. Entra aquí: ${location.origin}/staff/juegos.html?codigo=${sala.sala.codigo} (o en Juegos con el código ${sala.sala.codigo})`; navigator.clipboard?.writeText(txt).then(() => toast('Invitación copiada')).catch(() => prompt('Copia:', txt)); }
  });
  view.addEventListener('submit', (e) => {
    const f = e.target; e.preventDefault();
    if (f.matches('[data-unirse]')) return unirse(f.codigo.value.trim());
    if (f.dataset.actform === 'escribir') return jugar('escribir', { frases: [f.f0.value, f.f1.value, f.f2.value], falsa: Number(new FormData(f).get('falsa')) });
    if (f.dataset.actform === 'jugar') { const d = new FormData(f); return jugar('jugar', { id: Number(d.get('id')), color: d.get('color') || undefined, a: d.get('a') ? Number(d.get('a')) : undefined, llevar: d.getAll('llevar').map(Number).slice(0, 3) }); }
  });

  // Al volver a la app o a la pestaña: consultar de una vez (el celular pausa los relojes en segundo plano)
  document.addEventListener('visibilitychange', () => { if (!document.hidden && sala) { espera = 0; consultar(); } });
  window.addEventListener('online', () => { if (sala) { espera = 0; consultar(); } });
  const ini = /^#sala=(\d+)$/.exec(location.hash), cod = new URLSearchParams(location.search).get('codigo');
  if (cod) { history.replaceState(null, '', location.pathname); return unirse(cod.trim().toUpperCase().slice(0, 4)); }
  if (ini) return abrir(Number(ini[1]));
  await lobby().catch((x) => { view.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; });
});
