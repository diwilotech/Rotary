// Logos del club con el logotipo OFICIAL de Rotaract (public/img/marca/, sacado del archivo del Brand Center de Rotary):
//  · rotaract.svg  palabra «Rotaract» + rueda de Rotary, en arándano      · rueda.svg  solo la rueda      · letras.svg  solo la palabra
// El nombre del club va como en el logo oficial del Brand Center: debajo de «Rotaract», en Open Sans Light, alineado a la
// DERECHA con el final de la palabra («Medellín»). Si el nombre es largo, la letra se achica hasta caber (y si no, 2 líneas).
// Arma: el cuadrado de la app (la rueda), horizontal, solo ícono, solo letras (palabra + nombre) y fondo oscuro (todo en blanco).
// La versión vertical no se genera. Se ofrece desde Inicio (presidencia o junta) junto con los colores, la letra y la identidad.
(function () {
  const BASE = '/img/marca/', ROJO = '#D41367', F = "'Open Sans', Arial, sans-serif";
  // Medidas del arte oficial (unidades del archivo, y hacia arriba): caja del logo completo, de la palabra y del nombre
  const ARTE = { x0: 8.624, x1: 460.882, y0: 9.004, y1: 153.221 }, PAL = { x0: 8.624, x1: 299.39, y0: 56.664, y1: 114.181 };
  const NOMBRE = { tam: 48.93, base: -4.8, max: PAL.x1 - PAL.x0 };   // 20.5 pt en el PDF; línea base 61.5 bajo la de «Rotaract»
  const cargar = (n) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = BASE + n; });
  // «Rotaract Club de Medellín» → «Medellín» (el logo oficial lleva solo el nombre del club)
  const club = (nombre) => String(nombre || '').replace(/^\s*rotaract\s+/i, '').replace(/^club\s+(de|del|of)?\s*/i, '').trim() || String(nombre || 'Club');
  const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
  const tinta = (img, color) => { const c = lienzo(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; };

  // Logo con nombre. conRueda: horizontal (palabra + rueda) o solo letras (palabra). k = px por unidad del arte.
  function conNombre(img, nombre, { conRueda = true, color = ROJO, k = 2.6 } = {}) {
    const m = document.createElement('canvas').getContext('2d');
    let fs = NOMBRE.tam, lineas = [nombre];
    m.font = `300 ${fs}px ${F}`;
    if (m.measureText(nombre).width > NOMBRE.max) {   // tamaño dinámico, como el del Brand Center
      fs = Math.max(NOMBRE.tam * 0.62, NOMBRE.tam * (NOMBRE.max / m.measureText(nombre).width));
      m.font = `300 ${fs}px ${F}`;
      if (m.measureText(nombre).width > NOMBRE.max) {   // aún largo: dos líneas
        const p = nombre.split(/\s+/); let a = '', i = 0;
        for (; i < p.length; i++) { const t = a ? `${a} ${p[i]}` : p[i]; if (m.measureText(t).width > NOMBRE.max && a) break; a = t; }
        lineas = [a, p.slice(i).join(' ')].filter(Boolean);
      }
    }
    const caja = conRueda ? ARTE : PAL, pad = 14;
    const abajo = NOMBRE.base - (lineas.length - 1) * fs * 1.15 - fs * 0.3;   // hasta el descendente de la última línea
    const W = (caja.x1 - caja.x0 + pad * 2) * k, H = (caja.y1 - abajo + pad * 2) * k;
    const c = lienzo(W, H), x = c.getContext('2d'), X = (u) => (u - caja.x0 + pad) * k, Y = (u) => (caja.y1 - u + pad) * k;
    const arte = color === ROJO ? img : tinta(img, color);
    x.drawImage(arte, X(caja.x0), Y(caja.y1), (caja.x1 - caja.x0) * k, (caja.y1 - caja.y0) * k);
    x.fillStyle = color; x.font = `300 ${fs * k}px ${F}`; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
    lineas.forEach((l, i) => x.fillText(l, X(PAL.x1), Y(NOMBRE.base - i * fs * 1.15)));
    return c;
  }
  function sola(img, alto, color = ROJO) { const k = alto / img.height, c = lienzo(img.width * k, alto); c.getContext('2d').drawImage(color === ROJO ? img : tinta(img, color), 0, 0, c.width, c.height); return c; }
  function cuadrado(rueda) {
    const c = lienzo(512, 512), x = c.getContext('2d'), s = 400, k = s / Math.max(rueda.width, rueda.height);
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 512, 512);
    x.drawImage(rueda, (512 - rueda.width * k) / 2, (512 - rueda.height * k) / 2, rueda.width * k, rueda.height * k);
    return c;
  }

  async function archivos() { const [logo, rueda, letras] = await Promise.all([cargar('rotaract.svg'), cargar('rueda.svg'), cargar('letras.svg')]); return { logo, rueda, letras }; }
  async function generar(nombreNegocio) {
    const A = await archivos();
    if (!A.logo || !A.rueda || !A.letras) throw new Error('Faltan los archivos oficiales de Rotaract en la app');
    if (!document.querySelector('link[data-opensans]')) {   // la letra del nombre (Open Sans Light, como el logo oficial)
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.opensans = '1'; l.href = 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300&display=swap';
      document.head.appendChild(l); await new Promise((ok) => { l.onload = ok; l.onerror = ok; setTimeout(ok, 3000); });
    }
    await document.fonts.load(`300 40px ${F}`).catch(() => {});
    const n = club(nombreNegocio);
    return { app: cuadrado(A.rueda), horizontal: conNombre(A.logo, n), icono: sola(A.rueda, 420), letras: conNombre(A.letras, n, { conRueda: false }),
      oscuro: conNombre(A.logo, n, { color: '#FFFFFF' }) };
  }
  // Toda la marca del club de una vez: logos oficiales + color de la app (arándano Rotaract) + en Marca: color de la app,
  // letra Open Sans (como Rotary), fondo claro, tono cercano y, si aún no tienen, una descripción y un lema genéricos.
  async function crear(me) {
    const { api } = window.App, L = await generar(me.business.name), png = (c) => c.toDataURL('image/png');
    await api('/api/settings/logo', { method: 'PUT', body: { dataUrl: png(L.app) } });
    await api('/api/marca/logo', { method: 'PUT', body: { dataUrl: png(L.app) } }).catch(() => {});
    for (const t of ['horizontal', 'icono', 'letras', 'oscuro']) await api(`/api/marca/logos/${t}`, { method: 'PUT', body: { dataUrl: png(L[t]) } });
    await api('/api/settings/apariencia', { method: 'PUT', body: { tema: 'rotaract' } }).catch(() => {});
    const actual = await api('/api/marca').then((r) => r.marca || {}).catch(() => ({}));
    const n = club(me.business.name), body = { color: 'app', fondo: 'claro', tono: 'cercano', tipografia: 'opensans' };
    if (!actual.descripcion) body.descripcion = `Rotaract ${n} es un club de jóvenes que se unen para servir a su comunidad, crecer como líderes y hacer amigos en todo el mundo, con el respaldo de Rotary International.`;
    if (!actual.lema) body.lema = 'Gente de acción';
    // Si Marca aún no conoce la letra Open Sans, se guarda lo demás
    await api('/api/marca', { method: 'PUT', body }).catch(() => { const { tipografia: _t, ...resto } = body; return api('/api/marca', { method: 'PUT', body: resto }).catch(() => {}); });
    return 5;
  }
  window.RoLogos = { crear, generar, archivos, club };
})();
