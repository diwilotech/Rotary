// Kit de marca del club, como pestañas del módulo central Marca (window.DwMarcaTabs, se carga antes de /m/marca.js):
//  · «Logo del club»: logotipo oficial del programa (PNG del Brand Center, lo sube la junta) + nombre del club debajo, en versión
//    horizontal (alineado a la izquierda) o centrada, a todo color o a una tinta. Descarga en PNG (transparente), JPG y SVG.
//  · «Piezas»: publicación, historia, portada y volante con foto, título, texto, fecha y el logotipo del club en blanco.
// Todo se dibuja en el navegador con <canvas>; el servidor solo guarda los datos del kit y el PNG oficial (/api/kit).
(function () {
async function montar(view, me, M, tab) {
  const { api, esc, toast } = window.App;
  const RO = window.RO;
  const COL = { azul: ['Azul Rotary', '#17458F'], arandano: ['Arándano', '#D41367'], celeste: ['Celeste', '#0067C8'], oro: ['Oro', '#F7A81B'], carbon: ['Carbón', '#54565A'], negro: ['Negro', '#000000'], blanco: ['Blanco', '#FFFFFF'] };
  const FUENTE = '"Open Sans", Arial, sans-serif';
  document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap">');

  let d = await api('/api/kit'), emblema = null, foto = null;
  const base = d.club.replace(/^\s*rotaract\s*/i, '').trim();
  const K = { linea1: base || 'Club', linea2: '', version: 'horizontal', color: 'todo', nombreColor: 'arandano', tam: 22, sangria: 30,
    pieza: 'post', titulo: 'Jornada de servicio', texto: 'Únete a nuestro club y sé parte del cambio en tu comunidad.', fecha: 'Sábado 14 de diciembre · 9:00 a. m.', lugar: 'Medellín', fondo: 'azul', estilo: 'banda', ...d.kit };
  const cargarEmblema = () => new Promise((ok) => { if (!d.emblema) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = d.emblema; });
  emblema = await cargarEmblema();
  await document.fonts.load(`700 40px ${FUENTE}`).catch(() => {});

  /* ---------- dibujo ---------- */
  // Emblema a una tinta: pinta el PNG con un solo color (respeta su transparencia)
  function tinta(img, color) {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    if (color) { x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); }
    return c;
  }
  // Arma el logotipo del club en un canvas propio (transparente). h = alto del emblema en px.
  function logo({ h = 360, color = K.color, nombre = K.nombreColor } = {}) {
    const unaTinta = color !== 'todo', tc = unaTinta ? COL[color][1] : COL[nombre][1];
    const em = emblema ? tinta(emblema, unaTinta ? COL[color][1] : null) : null;
    const ew = em ? Math.round(em.width * (h / em.height)) : Math.round(h * 2.6);
    const fs = Math.round(h * (K.tam / 100)), fs2 = Math.round(fs * 0.62), gap = Math.round(h * 0.1), pad = Math.round(h * 0.12);
    const m = document.createElement('canvas').getContext('2d');
    m.font = `700 ${fs}px ${FUENTE}`; const w1 = m.measureText(K.linea1).width;
    m.font = `600 ${fs2}px ${FUENTE}`; const w2 = K.linea2 ? m.measureText(K.linea2).width : 0;
    const ind = K.version === 'horizontal' ? Math.round(ew * (K.sangria / 100)) : 0;
    const W = Math.ceil(Math.max(ew, ind + w1, ind + w2)) + pad * 2, H = h + gap + fs * 1.15 + (K.linea2 ? fs2 * 1.3 : 0) + pad * 2;
    const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(H);
    const x = c.getContext('2d'), cx = K.version === 'horizontal' ? pad : W / 2;
    if (em) x.drawImage(em, K.version === 'horizontal' ? pad : (W - ew) / 2, pad, ew, h);
    else { x.strokeStyle = tc; x.setLineDash([12, 10]); x.lineWidth = 3; x.strokeRect(pad, pad, ew, h); x.setLineDash([]); x.fillStyle = tc; x.font = `600 ${Math.round(h * 0.12)}px ${FUENTE}`; x.textAlign = 'center'; x.fillText('Logotipo oficial', pad + ew / 2, pad + h / 2); }
    x.fillStyle = tc; x.textBaseline = 'top'; x.textAlign = K.version === 'horizontal' ? 'left' : 'center';
    x.font = `700 ${fs}px ${FUENTE}`; x.fillText(K.linea1, cx + ind, pad + h + gap);
    if (K.linea2) { x.font = `600 ${fs2}px ${FUENTE}`; x.fillText(K.linea2, cx + ind, pad + h + gap + fs * 1.15); }
    return c;
  }
  const wrap = (x, txt, maxW) => { const out = []; let l = ''; for (const w of String(txt).split(/\s+/)) { const t = l ? `${l} ${w}` : w; if (x.measureText(t).width > maxW && l) { out.push(l); l = w; } else l = t; } if (l) out.push(l); return out; };
  const PIEZA = { post: ['Publicación', 1080, 1080], historia: ['Historia', 1080, 1920], portada: ['Portada (Facebook)', 1640, 624], volante: ['Volante (A5)', 1240, 1748] };
  function pieza() {
    const [, W, H] = PIEZA[K.pieza], c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'), fondo = COL[K.fondo][1], claro = ['oro', 'blanco'].includes(K.fondo), tinta1 = claro ? COL.azul[1] : '#FFFFFF';
    const ancho = W > H * 1.8;   // portada
    const fotoH = !foto || K.estilo === 'color' ? 0 : K.estilo === 'completa' ? H : ancho ? H : Math.round(H * 0.55);
    const fotoW = ancho && foto && K.estilo === 'banda' ? Math.round(W * 0.5) : W;
    x.fillStyle = fondo; x.fillRect(0, 0, W, H);
    // aro de fondo muy suave cuando no hay foto (da profundidad sin recargar)
    if (!fotoH) { x.save(); x.globalAlpha = 0.07; x.strokeStyle = claro ? COL.azul[1] : '#FFFFFF'; x.lineWidth = Math.min(W, H) * 0.09; x.beginPath(); x.arc(W * 0.92, H * 0.12, Math.min(W, H) * 0.38, 0, Math.PI * 2); x.stroke(); x.restore(); }
    if (fotoH) {   // foto recortada para cubrir su área
      const aw = ancho && K.estilo === 'banda' ? fotoW : W, ah = fotoH, ax = ancho && K.estilo === 'banda' ? W - fotoW : 0;
      const k = Math.max(aw / foto.width, ah / foto.height), sw = aw / k, sh = ah / k;
      x.drawImage(foto, (foto.width - sw) / 2, (foto.height - sh) / 2, sw, sh, ax, 0, aw, ah);
      if (K.estilo === 'completa') { const g = x.createLinearGradient(0, H * 0.3, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.78)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    }
    // franja de acento (oro) entre la foto y el color
    if (fotoH && K.estilo === 'banda' && !ancho) { x.fillStyle = K.fondo === 'oro' ? COL.azul[1] : COL.oro[1]; x.fillRect(0, fotoH, W, Math.round(H * 0.012)); }
    const m = Math.round(Math.min(W, H) * 0.07), areaX = m, areaW = (ancho && fotoH && K.estilo === 'banda' ? W - fotoW : W) - m * 2;
    const txtCol = K.estilo === 'completa' && fotoH ? '#FFFFFF' : tinta1;
    const t1 = Math.round(Math.min(W, H) * (ancho ? 0.11 : 0.085)), t2 = Math.round(t1 * 0.42);
    // primero se miden las líneas para ubicar el bloque de texto
    x.font = `800 ${t1}px ${FUENTE}`; const L1 = wrap(x, K.titulo, areaW).slice(0, 3);
    x.font = `400 ${t2}px ${FUENTE}`; const L2 = wrap(x, K.texto, areaW).slice(0, ancho ? 2 : 4);
    const pie = [K.fecha, K.lugar].filter(Boolean).join(' · ');
    const alto = t1 * 0.25 + L1.length * t1 * 1.08 + (L2.length ? t2 * 0.6 + L2.length * t2 * 1.35 : 0) + (pie ? t2 * 1.6 : 0);
    const logoZona = Math.min(W, H) * (ancho ? 0.3 : 0.2);
    const top = K.estilo === 'banda' && fotoH && !ancho ? fotoH + m * 0.8 : m, bottom = H - logoZona - m * 0.4;
    // con foto completa el texto va abajo; en los demás casos, centrado en el espacio libre
    let y = K.estilo === 'completa' && fotoH ? Math.max(top, bottom - alto) : top + Math.max(0, (bottom - top - alto) / (fotoH ? 3 : 2));
    // línea de acento sobre el título
    x.fillStyle = K.fondo === 'oro' ? COL.azul[1] : COL.oro[1]; x.fillRect(areaX, y, Math.round(t1 * 1.6), Math.max(6, Math.round(t1 * 0.1))); y += t1 * 0.35;
    x.fillStyle = txtCol; x.textBaseline = 'top'; x.textAlign = 'left';
    x.font = `800 ${t1}px ${FUENTE}`; for (const l of L1) { x.fillText(l, areaX, y); y += t1 * 1.08; }
    if (L2.length) { y += t2 * 0.6; x.font = `400 ${t2}px ${FUENTE}`; for (const l of L2) { x.fillText(l, areaX, y); y += t2 * 1.35; } }
    if (pie) { y += t2 * 0.5; x.font = `700 ${t2}px ${FUENTE}`; x.fillStyle = K.estilo === 'completa' && fotoH ? COL.oro[1] : claro ? COL.arandano[1] : COL.oro[1]; x.fillText(pie, areaX, y); }
    // logotipo del club abajo a la izquierda (blanco sobre fondo oscuro, a todo color sobre fondo claro)
    const lg = logo({ h: Math.round(Math.min(W, H) * (ancho ? 0.17 : 0.1)), color: claro ? 'todo' : 'blanco' });
    const lw = Math.min(lg.width, areaW), lh = lg.height * (lw / lg.width);
    x.drawImage(lg, areaX - lg.width * 0.03, H - lh - m * 0.5, lw, lh);
    return c;
  }

  /* ---------- descargas ---------- */
  const nombreArchivo = (s) => `${(K.linea1 || 'club').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}-${s}`;
  const bajar = (url, n) => { const a = document.createElement('a'); a.href = url; a.download = n; document.body.appendChild(a); a.click(); a.remove(); };
  const png = (c, n) => c.toBlob((b) => { const u = URL.createObjectURL(b); bajar(u, n); setTimeout(() => URL.revokeObjectURL(u), 5000); }, 'image/png');
  function jpg(c, n) { const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; const x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); o.toBlob((b) => { const u = URL.createObjectURL(b); bajar(u, n); setTimeout(() => URL.revokeObjectURL(u), 5000); }, 'image/jpeg', 0.95); }
  function svg() {   // emblema como imagen incrustada + textos editables
    const h = 360, l = logo({ h }), unaTinta = K.color !== 'todo', tc = unaTinta ? COL[K.color][1] : COL[K.nombreColor][1];
    const em = emblema ? tinta(emblema, unaTinta ? tc : null) : null, ew = em ? Math.round(em.width * (h / em.height)) : 0, pad = Math.round(h * 0.12), gap = Math.round(h * 0.1), fs = Math.round(h * (K.tam / 100)), fs2 = Math.round(fs * 0.62);
    const hor = K.version === 'horizontal', ind = hor ? Math.round(ew * (K.sangria / 100)) : 0, tx = hor ? pad + ind : l.width / 2, anchor = hor ? 'start' : 'middle';
    const e = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const out = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${l.width}" height="${l.height}" viewBox="0 0 ${l.width} ${l.height}">
${em ? `<image x="${hor ? pad : (l.width - ew) / 2}" y="${pad}" width="${ew}" height="${h}" xlink:href="${em.toDataURL('image/png')}"/>` : ''}
<text x="${tx}" y="${pad + h + gap + fs * 0.92}" font-family="Open Sans, Arial, sans-serif" font-weight="700" font-size="${fs}" fill="${tc}" text-anchor="${anchor}">${e(K.linea1)}</text>
${K.linea2 ? `<text x="${tx}" y="${pad + h + gap + fs * 1.15 + fs2 * 0.92}" font-family="Open Sans, Arial, sans-serif" font-weight="600" font-size="${fs2}" fill="${tc}" text-anchor="${anchor}">${e(K.linea2)}</text>` : ''}
</svg>`;
    const u = URL.createObjectURL(new Blob([out], { type: 'image/svg+xml' })); bajar(u, nombreArchivo('logotipo.svg')); setTimeout(() => URL.revokeObjectURL(u), 5000);
  }

  /* ---------- pantalla ---------- */
  const sel = (k, opts) => `<select class="form-select form-select-sm" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(K[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const inp = (k, ph = '') => `<input class="form-control form-control-sm" data-k="${k}" value="${esc(K[k] || '')}" placeholder="${esc(ph)}">`;
  const rng = (k, a, b) => `<input type="range" class="form-range" data-k="${k}" min="${a}" max="${b}" value="${K[k]}">`;
  const campo = (l, h) => `<label class="d-block mb-2"><span class="small fw-semibold d-block mb-1">${l}</span>${h}</label>`;
  const colores = (k, lista) => `<div class="d-flex flex-wrap gap-1" data-colores="${k}">${lista.map((c) => `<button type="button" class="ro-sw ${K[k] === c ? 'on' : ''}" data-c="${c}" title="${COL[c][0]}" style="--s:${COL[c][1]}"></button>`).join('')}</div>`;

  function pintar() {
    const aviso = emblema ? '' : `<div class="alert alert-info small"><b>Falta el logotipo oficial.</b> Descárgalo del <a href="https://brandcenter.rotary.org/es-xl/" target="_blank" rel="noopener">Brand Center de Rotary</a> (Rotaract, en PNG con fondo transparente) ${M ? 'y súbelo con «Subir logotipo oficial».' : 'y pídele a la junta que lo suba.'} Mientras tanto ves un recuadro en su lugar.</div>`;
    view.innerHTML = `<style>.ro-sw{width:30px;height:30px;border-radius:50%;border:2px solid var(--bs-border-color);background:var(--s)}.ro-sw.on{outline:3px solid var(--dw-p);outline-offset:2px}
        .ro-prev{border-radius:14px;padding:16px;display:grid;place-items:center;min-height:260px;background:repeating-conic-gradient(#e9ecef 0 25%,#fff 0 50%) 0 0/20px 20px}.ro-prev.osc{background:#1d2433}
        .ro-prev canvas{max-width:100%;max-height:560px;height:auto;box-shadow:0 6px 24px rgba(0,0,0,.12)}.ro-prev.logo canvas{box-shadow:none}</style>${aviso}
      <div class="row g-3"><div class="col-lg-4"><div class="dw-card">${tab === 'logo' ? `
          ${campo('Nombre del club (1.ª línea)', inp('linea1', 'Club Medellín'))}${campo('2.ª línea (opcional)', inp('linea2', 'Distrito 4271'))}
          ${campo('Versión', sel('version', [['horizontal', 'Horizontal (a la izquierda)'], ['centrada', 'Centrada']]))}
          ${campo('Color', sel('color', [['todo', 'A todo color'], ['azul', 'Una tinta · Azul Rotary'], ['arandano', 'Una tinta · Arándano'], ['negro', 'Una tinta · Negro'], ['blanco', 'Una tinta · Blanco (para fondos oscuros)']]))}
          ${K.color === 'todo' ? campo('Color del nombre', colores('nombreColor', ['arandano', 'azul', 'celeste', 'carbon'])) : ''}
          ${campo(`Tamaño del nombre <span class="text-body-secondary fw-normal">${K.tam}%</span>`, rng('tam', 16, 45))}
          ${K.version === 'horizontal' ? campo(`Alinear con la palabra <span class="text-body-secondary fw-normal">${K.sangria}%</span>`, rng('sangria', 0, 60)) : ''}
          ${M ? `<div class="d-flex gap-2 flex-wrap mt-3"><button class="btn btn-sm btn-outline-secondary" data-emb><i class="bi bi-upload me-1"></i>${emblema ? 'Cambiar' : 'Subir'} logotipo oficial</button></div>` : ''}`
        : `${campo('Formato', sel('pieza', Object.entries(PIEZA).map(([k, [l, w, h]]) => [k, `${l} · ${w}×${h}`])))}
          ${campo('Título', inp('titulo'))}${campo('Texto', `<textarea class="form-control form-control-sm" rows="3" data-k="texto">${esc(K.texto)}</textarea>`)}
          ${campo('Fecha y hora', inp('fecha'))}${campo('Lugar', inp('lugar'))}
          ${campo('Color de fondo', colores('fondo', ['azul', 'arandano', 'celeste', 'oro', 'carbon']))}
          ${campo('Foto', `<div class="d-flex gap-2"><button class="btn btn-sm btn-outline-secondary" data-foto><i class="bi bi-image me-1"></i>${foto ? 'Cambiar foto' : 'Elegir foto'}</button>${foto ? '<button class="btn btn-sm btn-light" data-sinfoto>Quitar</button>' : ''}</div><div class="small text-body-secondary mt-1">La foto no se sube: se usa solo en tu equipo.</div>`)}
          ${campo('Diseño', sel('estilo', [['banda', 'Foto arriba y color abajo'], ['completa', 'Foto completa con degradado'], ['color', 'Solo color']]))}`}
          ${M ? '<button class="btn btn-sm btn-outline-primary w-100 mt-3" data-guardar><i class="bi bi-save me-1"></i>Guardar para todo el club</button>' : ''}
        </div></div>
        <div class="col-lg-8"><div class="dw-card"><div class="ro-prev ${tab === 'logo' ? 'logo' : ''} ${tab === 'logo' && K.color === 'blanco' ? 'osc' : ''}" data-prev></div>
          <div class="d-flex gap-2 flex-wrap mt-3">${tab === 'logo' ? '<button class="btn btn-primary" data-png><i class="bi bi-download me-1"></i>PNG transparente</button><button class="btn btn-outline-primary" data-jpg>JPG</button><button class="btn btn-outline-primary" data-svg>SVG</button>'
            : '<button class="btn btn-primary" data-pz><i class="bi bi-download me-1"></i>Descargar PNG</button>'}</div>
          <p class="small text-body-secondary mt-2 mb-0">${tab === 'logo' ? 'Usa siempre el logotipo oficial sin deformarlo ni cambiarle los colores; el nombre del club va debajo, alineado con la palabra.' : 'Las piezas llevan el logotipo del club en blanco (o a todo color sobre oro).'}</p></div></div></div>`;
    dibujar();
  }
  function dibujar() {
    const box = view.querySelector('[data-prev]'); if (!box) return;
    box.innerHTML = ''; box.appendChild(tab === 'logo' ? logo() : pieza());
  }

  view.addEventListener('input', (e) => { const k = e.target.dataset.k; if (!k) return; K[k] = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    if (e.target.type === 'range') e.target.closest('label').querySelector('.text-body-secondary').textContent = `${K[k]}%`; dibujar(); });
  view.addEventListener('change', (e) => { if (['version', 'color', 'pieza'].includes(e.target.dataset.k)) pintar(); });
  view.addEventListener('click', async (e) => {
    if (e.target.closest('[data-guardar]')) { try { await api('/api/kit', { method: 'PUT', body: K }); toast('Kit guardado para todo el club'); } catch (x) { toast(x.message, false); } return; }
    const sw = e.target.closest('[data-c]'); if (sw) { K[sw.parentElement.dataset.colores] = sw.dataset.c; sw.parentElement.querySelectorAll('.ro-sw').forEach((b) => b.classList.toggle('on', b === sw)); return dibujar(); }
    if (e.target.closest('[data-png]')) return png(logo({ h: 720 }), nombreArchivo('logotipo.png'));
    if (e.target.closest('[data-jpg]')) return jpg(logo({ h: 720 }), nombreArchivo('logotipo.jpg'));
    if (e.target.closest('[data-svg]')) return svg();
    if (e.target.closest('[data-pz]')) return png(pieza(), nombreArchivo(`${K.pieza}.png`));
    if (e.target.closest('[data-sinfoto]')) { foto = null; return pintar(); }
    if (e.target.closest('[data-foto]')) { const f = await RO.elegirArchivo('image/*'); if (!f) return; const i = new Image(); i.onload = () => { foto = i; pintar(); }; i.src = URL.createObjectURL(f); return; }
    if (e.target.closest('[data-emb]')) {
      const f = await RO.elegirArchivo('image/png'); if (!f) return;
      try { await RO.subir('/api/kit/emblema', f); d = await api('/api/kit'); emblema = await cargarEmblema(); toast('Logotipo oficial guardado'); pintar(); } catch (x) { toast(x.message, false); }
    }
  });
  pintar();
}
(window.DwMarcaTabs = window.DwMarcaTabs || []).push(
  { id: 'logoclub', label: 'Logo del club', icon: 'bi-award', mount: (h, { me, can }) => montar(h, me, can, 'logo') },
  { id: 'piezas', label: 'Piezas', icon: 'bi-image', mount: (h, { me, can }) => montar(h, me, can, 'piezas') });
})();
