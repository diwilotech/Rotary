// Logos del club, creados automáticamente con el nombre del club y los colores de Rotaract (arándano, oro, azul real).
// Arma los 6 logos que pide Marca → Identidad: el cuadrado de la app, horizontal, vertical, solo ícono, solo letras y para
// fondo oscuro, en SVG, y los sube a Marca (y el cuadrado también como logo de la app).
//  · Se cargan solos la primera vez que la presidencia o la junta abre la app y el club aún no tiene logo (Inicio).
//  · En Marca → Identidad aparece «Crear los logos del club» para hacerlos (o rehacerlos) cuando quieran.
// Se carga antes de /m/marca.js (EXTRA_CENTRAL en src/lib/central.js) y desde Inicio.
(function () {
  const ROJO = '#D41367', ORO = '#F7A81B', AZUL = '#17458F', F = "'Open Sans', Arial, Helvetica, sans-serif";
  const e = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  // «Rotaract Club de Medellín» → programa «Rotaract», club «Club de Medellín», inicial «M»
  function partes(nombre) {
    const n = String(nombre || '').trim(), m = /^(rotaract|rotary|interact)\s+(.*)$/i.exec(n);
    const programa = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : 'Rotaract', club = (m ? m[2] : n) || 'Club';
    const pal = club.split(/\s+/).filter((w) => w.length > 2 && !/^(club|de|del|la|las|los|el)$/i.test(w));
    return { programa, club, inicial: (pal[pal.length - 1] || club)[0].toUpperCase() };
  }
  // Ícono: círculo arándano con aro de oro y la inicial del club
  const icono = (cx, cy, r, { letra, fondo = ROJO, aro = ORO, txt = '#FFFFFF' }) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fondo}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.84}" fill="none" stroke="${aro}" stroke-width="${r * 0.09}"/>
     <text x="${cx}" y="${cy + r * 0.36}" text-anchor="middle" font-family="${F}" font-weight="800" font-size="${r * 1.02}" fill="${txt}">${e(letra)}</text>`;
  const svg = (w, h, inner, bg = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${inner}</svg>`;
  // Ancho aproximado del texto (Open Sans/Arial) para dimensionar sin medir en pantalla
  const ancho = (t, px, peso = 700) => [...String(t)].reduce((s, ch) => s + (/[mwMW]/.test(ch) ? 0.9 : /[il.,'|]/.test(ch) ? 0.3 : /[A-Z]/.test(ch) ? 0.7 : ch === ' ' ? 0.28 : 0.55), 0) * px * (peso >= 700 ? 1.04 : 1);
  function logos(nombre) {
    const { programa, club, inicial } = partes(nombre);
    const p1 = 96, p2 = 50, palabras = (x, y, colA, colB, anchor = 'start') => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${F}" font-weight="800" font-size="${p1}" fill="${colA}">${e(programa)}</text>
      <text x="${x}" y="${y + p2 * 1.35}" text-anchor="${anchor}" font-family="${F}" font-weight="600" font-size="${p2}" fill="${colB}">${e(club)}</text>`;
    const tw = Math.max(ancho(programa, p1, 800), ancho(club, p2, 600));
    const hW = Math.ceil(40 + 220 + 40 + tw + 40), hH = 300;
    const horizontal = (colA, colB, ico) => svg(hW, hH, icono(150, 150, 110, { letra: inicial, ...ico }) + palabras(300, 145, colA, colB));
    const vW = Math.ceil(Math.max(tw + 80, 360)), vH = 470;
    return {
      app: svg(512, 512, icono(256, 256, 178, { letra: inicial, fondo: '#FFFFFF', txt: ROJO }), `<rect width="512" height="512" rx="96" fill="${ROJO}"/>`),
      horizontal: horizontal(ROJO, AZUL, {}),
      vertical: svg(vW, vH, icono(vW / 2, 130, 110, { letra: inicial }) + palabras(vW / 2, 340, ROJO, AZUL, 'middle')),
      icono: svg(260, 260, icono(130, 130, 120, { letra: inicial })),
      letras: svg(Math.ceil(tw + 80), 210, palabras(40, 110, ROJO, AZUL)),
      oscuro: horizontal('#FFFFFF', ORO, { fondo: ROJO, aro: '#FFFFFF' }),
    };
  }
  const dataUrl = (s) => `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(s)))}`;
  async function crear(me, { silencioso = false } = {}) {
    const { api, toast } = window.App, L = logos(me.business.name);
    await api('/api/settings/logo', { method: 'PUT', body: { dataUrl: dataUrl(L.app) } });
    await api('/api/marca/logo', { method: 'PUT', body: { dataUrl: dataUrl(L.app) } }).catch(() => {});
    for (const t of ['horizontal', 'vertical', 'icono', 'letras', 'oscuro']) await api(`/api/marca/logos/${t}`, { method: 'PUT', body: { dataUrl: dataUrl(L[t]) } });
    if (!silencioso) toast('Listo: los 6 logos del club quedaron creados');
    return true;
  }
  window.RoLogos = { crear, logos, partes };

  // Marca → Identidad: tarjeta «Crear los logos del club» arriba de los logos (solo presidencia o junta)
  DW.ready.then((me) => {
    if (!document.querySelector('main[data-modulo="marca"]') || !me.canManage || me.business.readOnly) return;
    const poner = () => {
      const grid = document.querySelector('[data-logos]');
      if (!grid || grid.previousElementSibling?.matches('[data-rologos]')) return;
      const { programa, club } = partes(me.business.name);
      grid.insertAdjacentHTML('beforebegin', `<div class="dw-card mb-3 d-flex align-items-center gap-3 flex-wrap" data-rologos style="border-left:4px solid ${ROJO}">
        <i class="bi bi-magic fs-3" style="color:${ROJO}"></i><div class="flex-grow-1"><b>Crear los logos del club automáticamente</b>
        <div class="small text-body-secondary">Con el nombre «${e(programa)} ${e(club)}» y los colores de Rotaract arma los 6 logos de abajo (cuadrado de la app, horizontal, vertical, solo ícono, solo letras y fondo oscuro). Reemplaza los que haya.</div></div>
        <button class="btn btn-primary" data-rocrear><i class="bi bi-stars me-1"></i>Crear los logos</button></div>`);
      grid.previousElementSibling.querySelector('[data-rocrear]').onclick = async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Creando…';
        try { await crear(me); location.hash = 'identidad'; location.reload(); } catch (x) { window.App.toast(x.message, false); b.disabled = false; b.textContent = 'Crear los logos'; }
      };
    };
    new MutationObserver(poner).observe(document.body, { childList: true, subtree: true });
  });
})();
