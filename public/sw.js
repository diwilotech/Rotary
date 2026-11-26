// Service worker de la PWA (JS plano). Solo guarda el shell estático: CSS, JS, íconos y la pantalla de ingreso.
// NUNCA guarda /staff/*, /api/* ni /mcp: los datos siempre salen del servidor, para no romper el aislamiento
// por negocio ni mostrar datos viejos de otra sesión. Sin modo offline ni notificaciones push por ahora.
// Estáticos: primero la red (así una publicación nueva se ve de una vez) y, sin conexión, lo guardado.
// Sube VERSION si cambia la lista SHELL.
const VERSION = 'dw-v30';
const SHELL = ['/css/diwilo.css', '/js/app.js', '/js/crud.js', '/js/shell.js', '/js/login.js', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/assets/logo-diwilo.svg', '/manifest.json'];
const PRIVATE = /^\/(staff|api|mcp)(\/|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || PRIVATE.test(url.pathname)) return; // red directa
  if (!SHELL.includes(url.pathname) && !/^\/(css|js|icons|assets)\//.test(url.pathname)) return;
  // Estáticos: primero la red; si falla (sin conexión), lo guardado.
  e.respondWith(caches.open(VERSION).then((cache) => fetch(e.request, { cache: 'no-cache' })
    .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
    .catch(async () => (await cache.match(e.request)) || Response.error())));
});
