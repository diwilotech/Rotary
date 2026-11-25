// Tableros de los juegos del club. Cada uno recibe la vista del servidor (v) y el contexto (k) y devuelve HTML.
// Las jugadas van en botones con data-act (tipo) y data-d (datos en JSON); lo local (qué dado o carta elegiste) con data-sel.
(function () {
  const { esc } = window.App;
  const D = (o) => esc(JSON.stringify(o));
  const btn = (act, d, html, cls = 'btn-primary', extra = '') => `<button type="button" class="btn ${cls}" data-act="${act}" data-d="${D(d || {})}" ${extra}>${html}</button>`;
  const quien = (k, id) => k.nombre(id);
  const avatar = (k, id, s = 34) => window.RO.avatar({ nombre: k.nombreCompleto(id), foto: k.foto(id) }, s);
  const solo = (k, html) => (k.anfitrion ? html : '<div class="small text-body-secondary">Espera a quien creó la sala…</div>');
  const grilla = (items) => `<div class="jg-gr">${items.join('')}</div>`;
  const reloj = (dl) => (dl ? `<span class="badge text-bg-light border jg-reloj" data-deadline="${dl}"></span>` : '');

  const T = {};
  /* El Impostor */
  T.impostor = (v, k) => {
    if (v.fase === 'pistas') return `<div class="jg-carta ${v.soy_impostor ? 'jg-imp' : ''}"><div class="small">Ronda ${v.ronda} de ${v.rondas} · ${esc(v.categoria)}</div>
        ${v.soy_impostor ? '<div class="jg-big">🕵️ Eres el impostor</div><div>No sabes la palabra: escucha las pistas e improvisa.</div>' : `<div class="small">Tu palabra</div><div class="jg-big">${esc(v.palabra || '')}</div>`}</div>
      <p class="text-center">Por turnos, cada quien dice <b>en voz alta</b> una pista de una sola palabra. Empieza <b>${esc(quien(k, v.empieza))}</b>.</p>
      <div class="text-center">${solo(k, btn('a_votar', {}, '<i class="bi bi-hand-index me-1"></i>Pasar a votar'))}</div>`;
    if (v.fase === 'votacion') return `<h3 class="h6 text-center">¿Quién es el impostor?</h3>${grilla(k.jugadores.filter((p) => p.id !== k.yo && k.juega(p.id)).map((p) => `<button type="button" class="jg-persona ${v.mi_voto === p.id ? 'on' : ''}" data-act="votar" data-d="${D({ a: p.id })}">${avatar(k, p.id)}<span>${esc(quien(k, p.id))}</span>${v.votaron.includes(p.id) ? '<i class="bi bi-check2"></i>' : ''}</button>`))}
      <p class="small text-center text-body-secondary mt-2">${v.votaron.length} de ${k.njug} votaron</p>`;
    return `<div class="jg-carta"><div class="jg-big">${v.resultado.pillado ? '¡Lo descubrieron!' : '¡El impostor se salió con la suya!'}</div>
        <div>El impostor era <b>${esc(quien(k, v.impostor))}</b> · la palabra era <b>${esc(v.palabra)}</b></div></div>
      ${grilla(k.jugadores.filter((p) => k.juega(p.id)).map((p) => `<div class="jg-persona">${avatar(k, p.id)}<span>${esc(quien(k, p.id))}</span><b>${v.resultado.cuenta[p.id] || 0} votos</b></div>`))}
      <div class="text-center mt-3">${solo(k, btn('siguiente', {}, v.ronda >= v.rondas ? 'Ver resultado final' : 'Siguiente ronda'))}</div>`;
  };
  /* Trivia */
  T.trivia = (v, k) => {
    const L = ['A', 'B', 'C', 'D'], COL = ['#17458F', '#D41367', '#E08E0B', '#009739'];
    const ops = v.opciones.map((o, i) => {
      const est = v.fase === 'pregunta' ? (v.mi_resp === i ? 'on' : '') : i === v.correcta ? 'ok' : v.mi_resp === i ? 'mal' : 'off';
      return `<button type="button" class="jg-op ${est}" style="--c:${COL[i]}" ${v.fase === 'pregunta' && v.mi_resp === null ? `data-act="responder" data-d="${D({ o: i })}"` : 'disabled'}><b>${L[i]}</b><span>${esc(o)}</span></button>`;
    });
    return `<div class="small text-center text-body-secondary">Pregunta ${v.n} de ${v.total}</div><div class="jg-pregunta">${esc(v.pregunta)}</div><div class="jg-ops">${ops.join('')}</div>
      <div class="text-center mt-3">${v.fase === 'pregunta' ? `<div class="small text-body-secondary mb-2">${v.respondieron.length} de ${k.njug} respondieron</div>${solo(k, btn('revelar', {}, 'Revelar', 'btn-outline-primary'))}`
        : `<div class="mb-2">${v.primero ? `⚡ Primero en acertar: <b>${esc(quien(k, v.primero))}</b> (+15)` : 'Nadie acertó'}</div>${solo(k, btn('siguiente', {}, v.n >= v.total ? 'Ver resultado final' : 'Siguiente pregunta'))}`}</div>`;
  };
  /* ¿Quién es más probable? */
  T.probable = (v, k) => {
    const js = k.jugadores.filter((p) => k.juega(p.id));
    if (v.fase === 'votar') return `<div class="small text-center text-body-secondary">${v.n} de ${v.total}</div><div class="jg-pregunta">${esc(v.frase)}</div>
      ${grilla(js.map((p) => `<button type="button" class="jg-persona ${v.mi_voto === p.id ? 'on' : ''}" data-act="votar" data-d="${D({ a: p.id })}">${avatar(k, p.id)}<span>${esc(quien(k, p.id))}</span></button>`))}
      <div class="text-center mt-2 small text-body-secondary">${v.votaron.length} de ${k.njug} votaron</div><div class="text-center mt-2">${solo(k, btn('revelar', {}, 'Revelar votos', 'btn-outline-primary'))}</div>`;
    const c = {}; Object.values(v.votos).forEach((a) => { c[a] = (c[a] || 0) + 1; }); const max = Math.max(1, ...Object.values(c));
    return `<div class="jg-pregunta">${esc(v.frase)}</div>${js.sort((a, b) => (c[b.id] || 0) - (c[a.id] || 0)).map((p) => `<div class="d-flex align-items-center gap-2 mb-2">${avatar(k, p.id, 30)}<span style="min-width:90px">${esc(quien(k, p.id))}</span>
        <div class="progress flex-grow-1" style="height:14px"><div class="progress-bar" style="width:${((c[p.id] || 0) / max) * 100}%"></div></div><b>${c[p.id] || 0}</b></div>`).join('')}
      <div class="text-center mt-3">${solo(k, btn('siguiente', {}, v.n >= v.total ? 'Ver resultado final' : 'Siguiente frase'))}</div>`;
  };
  /* Triqui */
  T.tictactoe = (v, k) => {
    const mio = v.marcas[k.yo], miTurno = v.fase === 'jugando' && v.turno === k.yo;
    const casillas = v.tablero.map((x, i) => `<button type="button" class="jg-tq ${v.linea?.includes(i) ? 'gana' : ''} ${x === 'X' ? 'x' : x === 'O' ? 'o' : ''}" ${!x && miTurno ? `data-act="marcar" data-d="${D({ c: i })}"` : 'disabled'}>${x || ''}</button>`).join('');
    const est = v.fase === 'jugando' ? (miTurno ? `Tu turno (${mio})` : `Turno de ${esc(quien(k, v.turno))}`) : v.fase === 'gano' ? `¡Ganó ${esc(quien(k, v.ganador_partida))}!` : 'Empate';
    return `<div class="text-center fw-semibold mb-2">${est}</div><div class="jg-triqui">${casillas}</div>
      ${v.fase !== 'jugando' && k.juega(k.yo) ? `<div class="d-flex gap-2 justify-content-center mt-3">${btn('revancha', {}, 'Revancha')}${btn('terminar', {}, 'Terminar', 'btn-outline-secondary')}</div>` : ''}`;
  };
  /* Dos verdades y una mentira */
  T.mentira = (v, k) => {
    const autor = quien(k, v.autor);
    if (v.fase === 'escribir') return v.autor === k.yo ? `<h3 class="h6">Te toca: escribe tres cosas tuyas</h3><p class="small text-body-secondary">Dos ciertas y una mentira. Marca cuál es la mentira.</p>
        <form data-actform="escribir">${[0, 1, 2].map((i) => `<div class="input-group mb-2"><div class="input-group-text"><input class="form-check-input mt-0" type="radio" name="falsa" value="${i}" ${i === 2 ? 'checked' : ''} aria-label="Esta es la mentira"></div><input class="form-control" name="f${i}" maxlength="160" required placeholder="Cosa ${i + 1}" data-keep="m${i}"></div>`).join('')}
        <div class="small text-body-secondary mb-2">El círculo marcado es la mentira.</div><button class="btn btn-primary w-100">Listo</button></form>`
      : `<div class="jg-carta"><div class="jg-big">✍️</div><div><b>${esc(autor)}</b> está escribiendo sus tres cosas…</div></div>`;
    const frases = v.frases.map((f, i) => {
      const est = v.fase === 'revelar' ? (i === v.falsa ? 'mal' : 'ok') : v.mi_voto === i ? 'on' : '';
      const cnt = v.fase === 'revelar' ? Object.values(v.votos).filter((x) => x === i).length : null;
      return `<button type="button" class="jg-op ${est}" style="--c:#17458F" ${v.fase === 'votar' && v.autor !== k.yo ? `data-act="votar" data-d="${D({ i })}"` : 'disabled'}><b>${i + 1}</b><span>${esc(f)}${cnt !== null ? ` · ${cnt} votos` : ''}${v.autor === k.yo && i === v.falsa && v.fase !== 'revelar' ? ' (tu mentira)' : ''}</span></button>`;
    });
    return `<div class="small text-center text-body-secondary">Turno ${v.n} de ${v.total}</div><div class="jg-pregunta">¿Cuál es la mentira de ${esc(autor)}?</div><div class="jg-ops jg-ops1">${frases.join('')}</div>
      <div class="text-center mt-3">${v.fase === 'votar' ? `<div class="small text-body-secondary mb-2">${v.votaron.length} de ${k.njug - 1} votaron</div>${solo(k, btn('revelar', {}, 'Revelar', 'btn-outline-primary'))}` : solo(k, btn('siguiente', {}, v.n >= v.total ? 'Ver resultado final' : 'Siguiente turno'))}</div>`;
  };
  /* Dominó */
  const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const mitad = (n) => `<span class="jg-m">${[...Array(9)].map((_, i) => `<i class="${PIPS[n].includes(i) ? 'p' : ''}"></i>`).join('')}</span>`;
  const ficha = (f, extra = '', vertical = false) => `<span class="jg-ficha ${vertical ? 'v' : ''} ${extra}">${mitad(f[0])}<span class="jg-sep"></span>${mitad(f[1])}</span>`;
  T.domino = (v, k) => {
    const miTurno = v.fase === 'jugando' && v.turno === k.yo, sel = k.sel?.f;
    const otros = k.jugadores.filter((p) => k.juega(p.id) && p.id !== k.yo).map((p) => `<span class="jg-chip ${v.turno === p.id ? 'on' : ''}">${esc(quien(k, p.id))} · ${v.cuantas[p.id]} 🁢</span>`).join('');
    let accion = '';
    if (v.fase === 'jugando' && v.mi_mano) {
      const elegida = sel !== undefined ? v.mi_mano[sel] : null, p = v.puntas;
      const lados = elegida && p ? ['izq', 'der'].filter((l) => elegida.includes(l === 'izq' ? p[0] : p[1])) : [];
      accion = miTurno ? (elegida && lados.length > 1 ? `<div class="d-flex gap-2 justify-content-center">${btn('poner', { f: sel, lado: 'izq' }, '⬅ Izquierda')}${btn('poner', { f: sel, lado: 'der' }, 'Derecha ➡')}</div>`
        : !v.puedo ? (v.pozo ? btn('robar', {}, `Robar del pozo (${v.pozo})`, 'btn-warning') : btn('pasar', {}, 'Pasar', 'btn-secondary')) : '<div class="small text-body-secondary">Toca la ficha que vas a poner</div>') : `<div class="small">Turno de <b>${esc(quien(k, v.turno))}</b></div>`;
    }
    const mano = v.mi_mano ? `<div class="jg-mano">${v.mi_mano.map((f, i) => { const p = v.puntas, ok = !p || f.some((x) => x === p[0] || x === p[1]);
      return `<button type="button" class="jg-fb" ${miTurno && ok ? (p && f.includes(p[0]) && f.includes(p[1]) && p[0] !== p[1] ? `data-sel="${D({ f: i })}"` : `data-act="poner" data-d="${D({ f: i })}"`) : 'disabled'}>${ficha(f, `${sel === i ? 'sel' : ''} ${miTurno && ok ? 'ok' : ''}`, true)}</button>`; }).join('')}</div>` : '';
    const fin = v.resultado_mano ? `<div class="jg-carta"><div class="jg-big">${v.resultado_mano.tranque ? '¡Tranque!' : '¡Dominó!'}</div><div><b>${esc(quien(k, v.resultado_mano.ganador))}</b> gana la mano y suma ${v.resultado_mano.puntos}</div></div>
      ${v.fase === 'fin_mano' ? `<div class="text-center">${k.anfitrion || k.yo === v.resultado_mano.ganador ? btn('otra_mano', {}, 'Otra mano') : '<span class="small text-body-secondary">Espera la siguiente mano…</span>'}</div>` : ''}` : '';
    return `<div class="d-flex flex-wrap gap-1 mb-2 justify-content-center">${otros}<span class="jg-chip">Pozo ${v.pozo}</span><span class="jg-chip">Mano ${v.mano_n} · a ${v.meta}</span></div>
      <div class="jg-mesa">${v.mesa.length ? v.mesa.map((f) => ficha(f, '', f[0] === f[1])).join('') : '<span class="text-body-secondary small">La mesa está vacía</span>'}</div>
      <div class="small text-center text-body-secondary my-2">${esc(v.ultimo || '')}</div>${fin}<div class="text-center my-2">${accion}</div>${mano}`;
  };
  /* Parqués: tablero circular (pista), llegadas hacia el centro (cielo) y cárceles afuera */
  T.parques = (v, k) => {
    const S = 360, C = S / 2, R = 150, L = v.L, pos = {};
    const ang = (a) => (2 * Math.PI * a) / L - Math.PI / 2;
    const xy = (r, t) => [C + r * Math.cos(t), C + r * Math.sin(t)];
    const seg = new Set(v.seguros), dueno = {}; for (const [id, p] of Object.entries(v.puesto)) dueno[p] = Number(id);
    const colorPuesto = (p) => (dueno[p] ? v.color[dueno[p]] : '#cbd5e1');
    let svg = '';
    for (let a = 0; a < L; a++) { const p = Math.floor(a / v.SEG), [x, y] = xy(R, ang(a)), sal = a % v.SEG === 0;
      svg += `<circle cx="${x}" cy="${y}" r="${sal ? 6.5 : 5}" fill="${sal ? colorPuesto(p) : '#fff'}" stroke="${colorPuesto(p)}" stroke-width="1.6"/>${seg.has(a) && !sal ? `<text x="${x}" y="${y + 3}" font-size="8" text-anchor="middle" fill="${colorPuesto(p)}">★</text>` : ''}`; }
    for (let p = 0; p < v.puestos; p++) {   // llegada de cada puesto: 8 casillas hacia el centro
      const t = ang(p * v.SEG - 5);
      for (let h = 1; h <= 8; h++) { const [x, y] = xy(R - h * 14, t); svg += `<circle cx="${x}" cy="${y}" r="4.5" fill="${colorPuesto(p)}" opacity=".28"/>`; }
      const [jx, jy] = xy(R + 26, ang(p * v.SEG + 8)); svg += `<circle cx="${jx}" cy="${jy}" r="15" fill="${colorPuesto(p)}" opacity=".14" stroke="${colorPuesto(p)}"/>`;
    }
    svg += `<circle cx="${C}" cy="${C}" r="22" fill="#fff8e1" stroke="#F7A81B" stroke-width="2"/><text x="${C}" y="${C + 4}" font-size="11" text-anchor="middle" fill="#9a6a00" font-weight="700">CIELO</text>`;
    const miTurno = v.turno === k.yo, op = v.opciones, sel = k.sel || (op && op.dados.length === 1 ? { dado: 0 } : op && !op.dados.length && op.premios.length === 1 ? { premio: 0 } : null);
    const movibles = !miTurno ? [] : v.fase === 'al_cielo' ? v.fichas[k.yo].map((p, i) => (p >= 0 && p < v.CIELO ? i : -1)).filter((i) => i >= 0) : sel && op ? (sel.premio !== undefined ? op.premios[sel.premio] : op.dados[sel.dado]) || [] : [];
    for (const [ids, fs] of Object.entries(v.fichas)) {
      const id = Number(ids), p0 = v.puesto[id];
      fs.forEach((p, i) => {
        let x, y;
        if (p < 0) [x, y] = xy(R + 26, ang(p0 * v.SEG + 8)).map((n, z) => n + [[-6, -6], [6, -6], [-6, 6], [6, 6]][i][z]);
        else if (p >= v.CIELO) { const t = (2 * Math.PI * (p0 * 4 + i)) / (v.puestos * 4); [x, y] = [C + 12 * Math.cos(t), C + 12 * Math.sin(t)]; }
        else if (p > v.SAL) [x, y] = xy(R - (p - v.SAL) * 14, ang(p0 * v.SEG - 5));
        else [x, y] = xy(R, ang((p0 * v.SEG + p) % L));
        const key = `${Math.round(x)},${Math.round(y)}`; pos[key] = (pos[key] || 0) + 1; const off = (pos[key] - 1) * 3;
        const puede = id === k.yo && movibles.includes(i);
        const d = v.fase === 'al_cielo' ? { act: 'al_cielo', d: { f: i } } : { act: 'mover', d: { ...(sel || {}), f: i } };
        svg += `<g ${puede ? `data-act="${d.act}" data-d="${D(d.d)}" class="jg-fpq"` : ''}><circle cx="${x + off}" cy="${y - off}" r="${puede ? 7.5 : 6}" fill="${v.color[id]}" stroke="${puede ? '#111' : '#fff'}" stroke-width="${puede ? 2.5 : 1.5}"/></g>`;
      });
    }
    const dados = v.dados ? `<span class="jg-dados">${v.dados.map((n) => `<span class="jg-dado">${'⚀⚁⚂⚃⚄⚅'[n - 1]}</span>`).join('')}</span>` : '';
    let ctrl = '';
    if (miTurno && v.fase === 'tirar') ctrl = btn('tirar', {}, '<i class="bi bi-dice-5 me-1"></i>Tirar los dados', 'btn-primary btn-lg');
    else if (miTurno && v.fase === 'mover') ctrl = `<div class="d-flex flex-wrap gap-1 justify-content-center">${v.pendientes.map((n, i) => `<button type="button" class="btn ${sel?.dado === i ? 'btn-dark' : 'btn-outline-dark'}" data-sel="${D({ dado: i })}" ${op.dados[i].length ? '' : 'disabled'}>Mover ${n}</button>`).join('')}
      ${v.premios.map((n, i) => `<button type="button" class="btn ${sel?.premio === i ? 'btn-warning' : 'btn-outline-warning'}" data-sel="${D({ premio: i })}" ${op.premios[i].length ? '' : 'disabled'}>Premio ${n}</button>`).join('')}${btn('pasar', {}, 'Pasar', 'btn-light')}</div>
      <div class="small text-body-secondary mt-1">${sel ? 'Toca la ficha resaltada' : 'Elige un dado'}</div>`;
    else if (miTurno && v.fase === 'al_cielo') ctrl = '<div class="fw-semibold">¡Tres pares! Toca la ficha que mandas al cielo</div>';
    else ctrl = `<div class="small">Turno de <b style="color:${v.color[v.turno]}">${esc(quien(k, v.turno))}</b></div>`;
    return `<div class="d-flex align-items-center justify-content-center gap-2 mb-1"><span class="jg-chip" style="border-color:${v.color[k.yo] || '#ccc'}">${k.juega(k.yo) ? `Tu color <i class="bi bi-circle-fill" style="color:${v.color[k.yo]}"></i>` : 'Viendo la partida'}</span>${dados}${reloj(v.deadline)}</div>
      <svg class="jg-parques" viewBox="0 0 ${S} ${S}">${svg}</svg><div class="small text-center text-body-secondary">${esc(v.log || '')}</div><div class="text-center mt-2">${ctrl}</div>`;
  };
  /* RotaCartas */
  const COLC = { azul: '#17458F', oro: '#E08E0B', arandano: '#D41367', celeste: '#0067C8' };
  const NOMC = { azul: 'Azul', oro: 'Oro', arandano: 'Arándano', celeste: 'Celeste' };
  const cara = (c, P) => (c.t === 'n' ? c.v : c.t === 'mas2' ? '+2' : c.t === 'salta' ? '⊘' : c.t === 'sentido' ? '⇄' : c.t === 'comodin' ? '★' : c.t === 'mas4' ? '+4' : c.t === 'ph' ? '🏅' : P[c.p][0]);
  const carta = (c, P, extra = '', grande = false) => `<span class="jg-rc ${grande ? 'g' : ''} ${c.c ? '' : 'w'} ${extra}" style="--c:${COLC[c.c] || '#111'}" title="${c.t === 'p' ? esc(`${P[c.p][1]}: ${P[c.p][2]}`) : c.t === 'ph' ? 'Paul Harris' : ''}"><b>${cara(c, P)}</b>${c.t === 'p' ? `<small>${esc(P[c.p][1])}</small>` : c.t === 'ph' ? '<small>Paul Harris</small>' : ''}</span>`;
  T.rotacartas = (v, k) => {
    const P = v.poderes, miTurno = v.fase === 'jugando' && v.turno === k.yo;
    const otros = k.jugadores.filter((p) => k.juega(p.id) && p.id !== k.yo).map((p) => `<span class="jg-chip ${v.turno === p.id ? 'on' : ''}">${esc(quien(k, p.id))} · ${v.cuantas[p.id]} 🂠${v.una.includes(p.id) ? ' <b class="text-danger">¡RotaCartas!</b>' : ''}</span>`).join('');
    const mano = v.mi_mano ? `<div class="jg-mano">${v.mi_mano.map((c) => `<button type="button" class="jg-fb" ${miTurno && (!v.robo || v.robo === c.id) ? `data-sel="${D({ carta: c.id })}"` : 'disabled'}>${carta(c, P, k.sel?.carta === c.id ? 'sel' : '')}</button>`).join('')}</div>` : '';
    let ctrl = '';
    if (miTurno) {
      const c = v.mi_mano.find((x) => x.id === k.sel?.carta);
      if (c) {
        const wild = ['comodin', 'mas4', 'ph'].includes(c.t), obj = c.t === 'p' && ['companerismo', 'donacion', 'interact'].includes(c.p);
        ctrl = `<form data-actform="jugar" class="jg-carta text-start"><input type="hidden" name="id" value="${c.id}">
          ${wild ? `<div class="mb-2"><b>Elige color</b><div class="d-flex gap-1 flex-wrap mt-1">${Object.keys(COLC).map((x, i) => `<label class="btn btn-sm" style="background:${COLC[x]};color:#fff"><input type="radio" name="color" value="${x}" ${i === 0 ? 'checked' : ''}> ${NOMC[x]}</label>`).join('')}</div></div>` : ''}
          ${obj ? `<div class="mb-2"><b>¿A quién?</b><select class="form-select form-select-sm mt-1" name="a">${k.jugadores.filter((p) => k.juega(p.id) && p.id !== k.yo).map((p) => `<option value="${p.id}">${esc(quien(k, p.id))}</option>`).join('')}</select></div>` : ''}
          ${c.t === 'ph' ? `<div class="mb-2"><b>Llévate hasta tres cartas más</b><div class="d-flex flex-wrap gap-1 mt-1">${v.mi_mano.filter((x) => x.id !== c.id).map((x) => `<label class="jg-lleva"><input type="checkbox" name="llevar" value="${x.id}">${carta(x, P)}</label>`).join('')}</div></div>` : ''}
          ${c.t === 'p' ? `<div class="small text-body-secondary mb-2">${esc(P[c.p][1])}: ${esc(P[c.p][2])}</div>` : ''}<button class="btn btn-primary w-100">Jugar esta carta</button></form>`;
      } else ctrl = `<div class="d-flex gap-2 justify-content-center">${v.robo ? btn('pasar', {}, 'Quedármela y pasar', 'btn-secondary') : btn('robar', {}, 'Robar', 'btn-warning')}</div><div class="small text-body-secondary mt-1">${v.robo ? 'La que robaste calza: tócala para jugarla' : 'Toca una carta que calce'}</div>`;
    } else if (v.fase === 'jugando') ctrl = `<div class="small">Turno de <b>${esc(quien(k, v.turno))}</b></div>`;
    const fin = v.resultado ? `<div class="jg-carta"><div class="jg-big">¡${esc(quien(k, v.resultado.ganador))} se salió!</div><div>Suma ${v.resultado.puntos} puntos (la partida es a ${v.meta})</div></div>
      ${v.fase === 'fin_ronda' ? `<div class="text-center">${k.anfitrion || k.yo === v.resultado.ganador ? btn('otra_ronda', {}, 'Otra ronda') : '<span class="small text-body-secondary">Espera la siguiente ronda…</span>'}</div>` : ''}` : '';
    return `<div class="d-flex flex-wrap gap-1 mb-2 justify-content-center">${otros}<span class="jg-chip">Mazo ${v.mazo}</span><span class="jg-chip">${v.dir === 1 ? '↻' : '↺'}</span>${v.fase === 'jugando' ? reloj(v.deadline) : ''}</div>
      <div class="d-flex align-items-center justify-content-center gap-3 my-2">${carta(v.top, P, '', true)}<div class="small">Color<br><b style="color:${COLC[v.color]}">● ${NOMC[v.color]}</b></div></div>
      <div class="small text-center text-body-secondary">${esc(v.log || '')}</div>${fin}<div class="text-center my-2">${ctrl}</div>${mano}
      <details class="small mt-2"><summary>Poderes del club</summary>${Object.values(P).map(([e, n, t]) => `<div>${e} <b>${esc(n)}</b>: ${esc(t)}</div>`).join('')}<div>🏅 <b>Paul Harris</b> (legendaria): eliges color y te llevas hasta tres cartas más.</div></details>`;
  };
  /* Bingo: cartón propio, última balota grande, historial y botones de Línea / Bingo */
  const LET = 'BINGO';
  const balota = (v, modo) => (modo === 'numeros' ? `${LET[Math.min(4, Math.floor((v - 1) / 15))]}-${v}` : v);
  T.bingo = (v, k) => {
    const salio = new Set(v.cantadas.map(String)), marcas = new Set(v.marcas);
    const ult = v.ultima != null ? balota(v.ultima, v.modo) : null;
    const cab = `<div class="jg-bola-w"><div class="jg-bola ${ult ? '' : 'vacia'}">${ult ? esc(String(ult)) : '?'}</div>
      <div class="small text-body-secondary">${v.cantadas.length} de ${v.total} · quedan ${v.quedan}</div>
      ${v.aviso ? `<div class="jg-aviso">${esc(v.aviso)}</div>` : v.linea ? `<div class="small mt-1">Línea: <b>${esc(quien(k, v.linea.id))}</b> · ahora va por el cartón lleno</div>` : '<div class="small mt-1">Primero: ¡Línea! (fila, columna o diagonal)</div>'}
      ${solo(k, btn('cantar', {}, `<i class="bi bi-megaphone me-1"></i>${v.cantadas.length ? 'Cantar la siguiente' : 'Cantar la primera'}`, 'btn-primary btn-lg mt-2', v.quedan ? '' : 'disabled'))}</div>`;
    const carton = v.carton ? `<div class="jg-carton ${v.modo}">${v.modo === 'numeros' ? [...LET].map((l) => `<div class="jg-cab">${l}</div>`).join('') : ''}
        ${v.carton.map((x, i) => { const libre = x === null, ok = libre || salio.has(String(x)), m = libre || marcas.has(i);
          return `<button type="button" class="jg-cas ${libre ? 'libre' : ''} ${m ? 'm' : ok ? 'sale' : ''}" ${!libre && ok ? `data-act="marcar" data-d="${D({ i })}"` : 'disabled'}>${libre ? '⭐' : esc(String(x))}</button>`; }).join('')}</div>
      <div class="d-flex gap-2 justify-content-center mt-3">${btn('linea', {}, '¡Línea!', `btn-lg ${v.tengo_linea && !v.linea ? 'btn-warning jg-brilla' : 'btn-outline-warning'}`, v.linea ? 'disabled' : '')}${btn('bingo', {}, '¡BINGO!', `btn-lg ${v.tengo_bingo ? 'btn-success jg-brilla' : 'btn-outline-success'}`)}</div>
      <div class="small text-body-secondary text-center mt-1">Las casillas que ya salieron se iluminan: tócalas para marcarlas.</div>` : '';
    const hist = v.cantadas.length > 1 ? `<details class="mt-3"><summary class="small">Todas las que han salido (${v.cantadas.length})</summary><div class="jg-hist">${[...v.cantadas].reverse().map((x) => `<span>${esc(String(balota(x, v.modo)))}</span>`).join('')}</div></details>` : '';
    return cab + carton + hist;
  };
  window.RoJuegos = T;
})();
