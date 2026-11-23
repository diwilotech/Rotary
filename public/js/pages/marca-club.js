// Logos del club con los archivos OFICIALES de Rotary (public/img/marca/): nada inventado.
//  · rotaract.png  logotipo oficial de Rotaract (rueda + palabra), a todo color, fondo transparente
//  · rueda.png     solo la rueda (el engranaje), fondo transparente
//  · letras.png    (opcional) solo la palabra «Rotaract»
// Con ellos arma: el cuadrado de la app (la rueda), horizontal (logotipo + nombre del club debajo, alineado con la palabra),
// solo ícono (la rueda), solo letras (si está letras.png) y para fondo oscuro (palabra y nombre en blanco, rueda en oro).
// La versión vertical no se genera. Se ofrece desde Inicio (tarjeta para la presidencia o la junta si el club no tiene logos).
(function () {
  const BASE = '/img/marca/', ROJO = '#D41367', F = "'Open Sans', Arial, Helvetica, sans-serif";
  const ALINEAR = 0.335;   // dónde empieza la palabra dentro del logotipo oficial (fracción del ancho): ahí arranca el nombre del club
  const cargar = (n) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = BASE + n; });
  const club = (nombre) => String(nombre || '').replace(/^\s*(rotaract|rotary|interact)\s+/i, '').trim() || 'Club';
  const lienzo = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
  // Pinta de blanco lo que no es oro (la palabra), para la versión de fondo oscuro
  function enBlanco(img) {
    const c = lienzo(img.naturalWidth, img.naturalHeight), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) { if (!p[i + 3]) continue; const oro = p[i] > 200 && p[i + 1] > 120 && p[i + 2] < 110; if (!oro) { p[i] = p[i + 1] = p[i + 2] = 255; } }
    x.putImageData(d, 0, 0); return c;
  }
  const ancho = (i) => i.naturalWidth || i.width, alto = (i) => i.naturalHeight || i.height;
  function horizontal(logo, nombre, color) {
    const W = 1000, h = Math.round(alto(logo) * (W / ancho(logo))), fs = Math.round(h * 0.2), pad = 24;
    const c = lienzo(W + pad * 2, h + fs * 1.5 + pad * 2), x = c.getContext('2d');
    x.drawImage(logo, pad, pad, W, h);
    x.fillStyle = color; x.font = `700 ${fs}px ${F}`; x.textBaseline = 'top'; x.fillText(nombre, pad + W * ALINEAR, pad + h + fs * 0.2);
    return c;
  }
  function cuadrado(rueda, fondo = '#FFFFFF') {
    const c = lienzo(512, 512), x = c.getContext('2d'), s = 380;
    x.fillStyle = fondo; x.fillRect(0, 0, 512, 512);
    const k = s / Math.max(rueda.naturalWidth, rueda.naturalHeight); x.drawImage(rueda, (512 - rueda.naturalWidth * k) / 2, (512 - rueda.naturalHeight * k) / 2, rueda.naturalWidth * k, rueda.naturalHeight * k);
    return c;
  }
  function sola(img, alto = 600) { const k = alto / img.naturalHeight, c = lienzo(img.naturalWidth * k, alto); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; }

  async function archivos() { const [logo, rueda, letras] = await Promise.all([cargar('rotaract.png'), cargar('rueda.png'), cargar('letras.png')]); return { logo, rueda, letras }; }
  async function crear(me) {
    const { api } = window.App, A = await archivos();
    if (!A.logo || !A.rueda) throw new Error('Faltan los archivos oficiales de Rotary en la app');
    await document.fonts.load(`700 40px ${F}`).catch(() => {});
    const n = club(me.business.name), png = (c) => c.toDataURL('image/png');
    const L = { horizontal: horizontal(A.logo, n, ROJO), icono: sola(A.rueda, 400), oscuro: horizontal(enBlanco(A.logo), n, '#FFFFFF'), ...(A.letras ? { letras: sola(A.letras, 300) } : {}) };
    const app = png(cuadrado(A.rueda));
    await api('/api/settings/logo', { method: 'PUT', body: { dataUrl: app } });
    await api('/api/marca/logo', { method: 'PUT', body: { dataUrl: app } }).catch(() => {});
    for (const [t, c] of Object.entries(L)) await api(`/api/marca/logos/${t}`, { method: 'PUT', body: { dataUrl: png(c) } });
    return Object.keys(L).length + 1;
  }
  window.RoLogos = { crear, archivos, club };
})();
