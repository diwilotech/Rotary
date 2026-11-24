// Piezas comunes de las pantallas de CD Rotaract (RO): navegación del Club, avatar, listas, subir archivos y etiquetas.
(function () {
  const { api, esc } = window.App;
  const cache = {};
  // [id, etiqueta, enlace, ícono, módulo que debe estar activo]
  const GRUPOS = [
    [['socios', 'Socios', '/staff/socios.html', 'bi-people', 'socios'], ['activacion', 'Activación', '/staff/socios.html#activacion', 'bi-patch-check', 'socios'], ['certificados', 'Certificados', '/staff/socios.html#certificados', 'bi-award', 'socios'],
      ['reuniones', 'Reuniones', '/staff/reuniones.html', 'bi-calendar-event', 'reuniones'], ['tareas', 'Tareas', '/staff/tareas.html', 'bi-kanban', 'tareas']],
    [['proyectos', 'Proyectos', '/staff/impacto.html', 'bi-globe-americas', 'impacto'], ['alianzas', 'Alianzas', '/staff/impacto.html#alianzas', 'bi-people', 'impacto'],
      ['comunidades', 'Comunidades', '/staff/impacto.html#comunidades', 'bi-house-heart', 'impacto']],
    [['menor', 'Caja menor', '/staff/cajas.html#menor', 'bi-cup-hot', 'cajas'], ['mayor', 'Caja mayor', '/staff/cajas.html#mayor', 'bi-bricks', 'cajas'],
      ['cajita', 'Cajita de macería', '/staff/cajas.html#cajita', 'bi-coin', 'cajas'],
      ['cuotas', 'Cuotas', '/staff/cuotas.html', 'bi-wallet2', 'cuotas']],
  ];
  const RO = {
    // Botones de sección arriba de cada módulo (solo los activos para el negocio y el rol).
    // `onTab(id)`: si el botón es de la misma página, cambia de pestaña sin recargar (y deja el #hash).
    nav(activo, onTab) {
      const me = window.DW?.me;
      if (!me) return;
      const tiene = (id) => me.modules.some((m) => m.id === id);
      const grupo = GRUPOS.find((g) => g.some((i) => i[0] === activo)) || [];
      return RO.pills(grupo.filter((i) => tiene(i[4])), activo, onTab);
    },
    // items: [id, etiqueta, href, ícono]. Un href «#x» o de la misma página llama a onTab en vez de navegar.
    pills(items, activo, onTab) {
      const main = document.querySelector('main.dw-main');
      if (!main || items.length < 2) return;
      const nav = document.createElement('nav');
      nav.className = 'ro-club'; nav.setAttribute('aria-label', 'Secciones');
      nav.innerHTML = items.map(([id, l, href, ic]) => `<a href="${href}" class="${id === activo ? 'on' : ''}" data-club="${id}"><i class="bi ${ic}"></i>${l}</a>`).join('');
      nav.addEventListener('click', (e) => {
        const a = e.target.closest('a[data-club]'); if (!a || !onTab) return;
        const u = new URL(a.href, location.href); if (u.pathname.replace(/\.html$/, '') !== location.pathname.replace(/\.html$/, '')) return;
        e.preventDefault(); history.replaceState(null, '', u.hash || location.pathname);
        nav.querySelectorAll('a').forEach((x) => x.classList.toggle('on', x === a)); onTab(a.dataset.club);
      });
      main.prepend(nav);
      return nav;
    },
    initials: (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(''),
    avatar(s, size = 44) {
      const st = `width:${size}px;height:${size}px;font-size:${Math.round(size / 2.6)}px`;
      return s?.foto ? `<img class="ro-av" style="${st}" src="${esc(s.foto)}" alt="" loading="lazy" data-ini="${esc(RO.initials(s.nombre))}" onerror="var e=document.createElement('span');e.className='ro-av';e.style.cssText=this.style.cssText;e.textContent=this.dataset.ini;this.replaceWith(e)">`
        : `<span class="ro-av" style="${st}">${esc(RO.initials(s?.nombre))}</span>`;
    },
    async socios(force) {
      if (!cache.socios || force) cache.socios = api('/api/socios/socios?limit=1000').then((d) => d.rows).catch(() => []);
      return cache.socios;
    },
    async proyectos(force) {
      if (!cache.proy || force) cache.proy = api('/api/impacto/proyectos?limit=1000').then((d) => d.rows).catch(() => []);
      return cache.proy;
    },
    opts: (rows, empty = '—', label = 'nombre') => [['', empty], ...rows.map((r) => [r.id, r[label]])],
    // Sube un archivo crudo (foto o PDF). Devuelve el JSON de la respuesta.
    async subir(url, file) {
      if (file.size > 5 * 1024 * 1024) throw new Error('El archivo pesa más de 5 MB');
      const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}nombre=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-app': '1', 'content-type': 'application/octet-stream' }, body: file });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      return d;
    },
    // Firma para los certificados: se dibuja con el dedo o el mouse (o se sube una imagen). `url` recibe el PNG.
    firmar(url, { titulo = 'Tu firma', actual = null } = {}) {
      const { modal, toast } = window.App;
      return new Promise((listo) => {
        const { el, m } = modal(`<div class="modal-header"><h2 class="modal-title h5">${esc(titulo)}</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>
          <div class="modal-body"><p class="small text-body-secondary mb-2">Firma dentro del recuadro. Sale en los certificados del club.</p>
            ${actual ? `<div class="small mb-1">Firma actual:</div><img src="${esc(actual)}" alt="" style="max-height:60px;max-width:100%" class="mb-2 d-block">` : ''}
            <canvas data-pad style="width:100%;height:180px;border:2px dashed var(--bs-border-color);border-radius:12px;touch-action:none;background:#fff;cursor:crosshair"></canvas></div>
          <div class="modal-footer flex-wrap"><button class="btn btn-light me-auto" data-limpiar><i class="bi bi-eraser me-1"></i>Borrar</button><button class="btn btn-outline-secondary" data-img><i class="bi bi-image me-1"></i>Subir imagen</button><button class="btn btn-primary" data-ok>Guardar firma</button></div>`);
        const cv = el.querySelector('[data-pad]'); let ctx, trazo = false, hay = false, ok = false;
        const prep = () => { const r = cv.getBoundingClientRect(), k = devicePixelRatio || 1; cv.width = r.width * k; cv.height = r.height * k; ctx = cv.getContext('2d'); ctx.scale(k, k); ctx.lineWidth = 2.4; ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1f4d'; hay = false; };
        el.addEventListener('shown.bs.modal', prep, { once: true });
        const pt = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
        cv.addEventListener('pointerdown', (e) => { trazo = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pt(e)); });
        cv.addEventListener('pointermove', (e) => { if (!trazo) return; ctx.lineTo(...pt(e)); ctx.stroke(); hay = true; });
        ['pointerup', 'pointercancel'].forEach((v) => cv.addEventListener(v, () => { trazo = false; }));
        el.querySelector('[data-limpiar]').onclick = prep;
        const enviar = async (file) => { try { await RO.subir(url, file); ok = true; toast('Firma guardada'); m.hide(); } catch (x) { toast(x.message, false); } };
        el.querySelector('[data-img]').onclick = async () => { const f = await RO.elegirArchivo('image/png,image/jpeg,image/webp'); if (f) enviar(f); };
        el.querySelector('[data-ok]').onclick = () => {
          if (!hay) return toast('Dibuja tu firma primero', false);
          // recorta el espacio en blanco alrededor del trazo
          const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
          for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
          const out = document.createElement('canvas'), pad = 8; out.width = x1 - x0 + pad * 2; out.height = y1 - y0 + pad * 2;
          out.getContext('2d').drawImage(cv, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
          out.toBlob((b) => enviar(new File([b], 'firma.png', { type: 'image/png' })), 'image/png');
        };
        el.addEventListener('hidden.bs.modal', () => listo(ok), { once: true });
      });
    },
    elegirArchivo(accept = 'image/*,application/pdf') {
      return new Promise((ok) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => ok(i.files[0] || null); i.click(); });
    },
    TIPO: { socio: 'Socio', socio_externo: 'Socio externo', voluntario_invitado: 'Voluntario invitado', aspirante: 'Aspirante', honorario: 'Honorario' },
    ESTADO: { activo: ['ok', 'Activo'], aspirante: ['soon', 'Aspirante'], inactivo: ['free', 'Inactivo'], retirado: ['bad', 'Retirado'] },
    fechaLarga: (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : ''),
  };
  // Estilos propios (usan las variables del tema)
  const css = document.createElement('style');
  css.textContent = `
    .ro-club{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 14px;padding-bottom:2px}.ro-club::-webkit-scrollbar{display:none}
    .ro-club a{flex:none;display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;border:1px solid var(--bs-border-color);color:inherit;text-decoration:none;font-size:.9rem;font-weight:500}
    .ro-club a.on{background:var(--dw-p);border-color:var(--dw-p);color:#fff}
    .ro-av{display:inline-grid;place-items:center;flex:none;border-radius:50%;object-fit:cover;background:rgba(var(--dw-p-rgb),.14);color:var(--dw-p);font-weight:700}
    .ro-junta{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))}
    .ro-jcard{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:18px 12px;border-radius:16px;border:1px solid var(--bs-border-color);background:linear-gradient(170deg,rgba(var(--dw-p-rgb),.10),var(--bs-body-bg) 60%);cursor:pointer;color:inherit}
    .ro-jcard:hover{border-color:var(--dw-p)}.ro-jcard .cargo{font-size:.8rem;color:var(--dw-p);font-weight:600;line-height:1.25}
    .ro-socios{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}
    .ro-scard{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid var(--bs-border-color);background:var(--bs-body-bg);cursor:pointer;color:inherit;text-align:left;width:100%}
    .ro-scard:hover{border-color:var(--dw-p)}
    .ro-3f{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}.ro-3f>div{display:flex;flex-direction:column;gap:1px;padding:8px;border-radius:12px;border:1px dashed var(--bs-border-color);font-size:.72rem;color:var(--bs-secondary-color);min-width:0}
    .ro-3f>div.on{border-style:solid;border-color:rgba(var(--dw-p-rgb),.4);background:rgba(var(--dw-p-rgb),.06)}.ro-3f i{font-size:1rem;color:var(--dw-p)}.ro-3f b{font-size:.85rem;color:var(--bs-body-color)}.ro-3f small{overflow-wrap:anywhere}
    .ro-cert{display:flex;flex-direction:column;gap:4px;border-top:4px solid var(--c)}.ro-cert>.bi{font-size:1.6rem;color:var(--c)}
    .ro-acc{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:600;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);border-radius:999px;padding:1px 8px;white-space:nowrap}
    .ro-h{font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bs-secondary-color);margin:18px 0 10px}
  `;
  document.head.appendChild(css);
  window.RO = RO;
})();
