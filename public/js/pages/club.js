// Piezas comunes de las pantallas de CD Rotaract (RO): navegación del Club, avatar, listas, subir archivos y etiquetas.
(function () {
  const { api, esc } = window.App;
  const cache = {};
  // [id, etiqueta, enlace, ícono, módulo que debe estar activo]
  const GRUPOS = [
    [['socios', 'Socios', '/staff/socios.html', 'bi-people', 'socios'], ['activacion', 'Activación', '/staff/socios.html#activacion', 'bi-patch-check', 'socios'],
      ['reuniones', 'Reuniones', '/staff/reuniones.html', 'bi-calendar-event', 'reuniones'], ['tareas', 'Tareas', '/staff/tareas.html', 'bi-kanban', 'tareas']],
    [['proyectos', 'Proyectos', '/staff/impacto.html', 'bi-globe-americas', 'impacto'], ['alianzas', 'Alianzas', '/staff/impacto.html#alianzas', 'bi-people', 'impacto'],
      ['beneficiarios', 'Beneficiarios', '/staff/impacto.html#beneficiarios', 'bi-heart', 'impacto']],
    [['menor', 'Caja menor', '/staff/cajas.html#menor', 'bi-cup-hot', 'cajas'], ['mayor', 'Caja mayor', '/staff/cajas.html#mayor', 'bi-bricks', 'cajas'],
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
    .ro-acc{display:inline-flex;align-items:center;gap:4px;font-size:.72rem;font-weight:600;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);border-radius:999px;padding:1px 8px;white-space:nowrap}
    .ro-h{font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bs-secondary-color);margin:18px 0 10px}
  `;
  document.head.appendChild(css);
  window.RO = RO;
})();
