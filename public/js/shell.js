// Shell común de las apps Diwilo: barra superior, barra lateral (escritorio) y barra inferior con «Más» (celular).
// Lo pinta todo a partir de GET /api/me (módulos activos, rol y tema). Cada página solo trae:
//   <div id="dw-shell"></div>
//   <main class="dw-main" data-titulo="Elementos" data-modulo="items"> … </main>
// y espera a DW.ready (Promise con /api/me) para cargar sus datos.
(function () {
  const { api, esc, changePassword } = window.App;
  // Colores de la app (paleta cerrada): se cambian desde el menú de usuario; el logo y el resto de la marca, en Marca
  const ROLE = { owner: 'Presidencia', admin: 'Junta', staff: 'Socio' };
  const CLUB = ['socios', 'reuniones', 'tareas'];   // el acceso «Club» del celular abre la primera de estas que esté activa
  const RANK = { staff: 1, admin: 2, owner: 3 };
  const main = document.querySelector('main.dw-main');
  const page = { titulo: main?.dataset.titulo || '', modulo: main?.dataset.modulo || '' };
  // Panel (/<dirección del negocio>): una sola página con el menú; cada módulo se carga en un marco y la dirección no cambia.
  // Páginas «incrustadas»: las de los módulos dentro de ese marco; no pintan menú ni barras, solo su contenido.
  const PANEL = document.body.hasAttribute('data-panel');
  const EMBED = window.top !== window.self;
  if (EMBED) document.body.classList.add('dw-embed');   // desde ya, para que no salte el diseño mientras carga
  const panel = { modulo: 'inicio', titulo: '' };
  const aInicio = () => (EMBED ? window.top : window).location.replace('/');

  // Módulos base (siempre activos) + los del negocio, en el orden del menú.
  const BASE_START = [{ id: 'inicio', nombre: 'Inicio', icono: 'bi-house', ruta: '/staff/' }, { id: 'lotuyo', nombre: 'Lo tuyo', icono: 'bi-person-heart', ruta: '/staff/lotuyo.html' }];
  const BASE_END = [
    { id: 'equipo', nombre: 'Equipo', icono: 'bi-people', ruta: '/staff/equipo.html' },
  ];

  function applyTheme(s) {
    const root = document.documentElement;
    root.dataset.dwTema = s.tema;
    root.setAttribute('data-bs-theme', s.modo);
    try { localStorage.setItem('dw_tema', JSON.stringify({ tema: s.tema, modo: s.modo })); } catch (_) {}
    // Dentro del panel (marco), avisa al panel para que el encabezado y el menú cambien al mismo tiempo.
    if (EMBED) try { window.parent.postMessage({ dw: 'tema', tema: s.tema, modo: s.modo }, location.origin); } catch (_) {}
    const color = getComputedStyle(root).getPropertyValue('--dw-p').trim();
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
    meta.content = s.modo === 'dark' ? '#171a23' : color || '#6d28d9';
  }

  const isActive = (m) => {
    const here = location.pathname.replace(/index\.html$/, '');
    if (PANEL) return m.id === panel.modulo || (m.id === 'club' && CLUB.includes(panel.modulo));
    if (m.id === 'club' && CLUB.includes(page.modulo)) return true;
    return m.id === page.modulo || (m.ruta && m.ruta.replace(/index\.html$/, '') === here);
  };
  let inBottom = new Set();
  const link = (m) => `<li class="${inBottom.has(m.id) ? 'dw-in-bottom' : ''}"><a data-mod="${esc(m.id)}" href="${esc(m.ruta)}" class="${isActive(m) ? 'active' : ''}" ${isActive(m) ? 'aria-current="page"' : ''} title="${esc(m.nombre)}"><i class="bi ${esc(m.icono || 'bi-grid')}"></i><span>${esc(m.nombre)}</span></a></li>`;

  function render(me) {
    // Perfil del distrito: en vez de «Lo tuyo» (no es socio de un club) tiene «Distrito»; sin carnet.
    const DIST = !!me.distrito?.es_distrito;
    if (DIST) BASE_START[1] = { id: 'distrito', nombre: `Distrito ${me.distrito.codigo}`, icono: 'bi-diagram-3', ruta: '/staff/distrito.html' };
    // «IA» va abajo, junto a Equipo; «Marca» tiene su propia pantalla en el menú (módulo central de Diwilo Modulos)
    const iaMod = me.modules.find((m) => m.id === 'ai');
    const FOOT = [...BASE_END, ...(iaMod ? [iaMod] : [])];
    const mods = [...BASE_START, ...me.modules.filter((m) => !m.oculto && m.id !== 'ai' && m.id !== 'dashboard').sort((a, b) => a.orden - b.orden), ...FOOT];
    const initials = (me.user.name || me.user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
    const logo = me.settings.logo ? `<img src="${esc(me.settings.logo)}" alt="">` : esc(me.business.name.trim()[0] || 'D').toUpperCase();
    const canManage = RANK[me.role] >= RANK.admin;
    // Celular: accesos fijos Inicio · Club · Lo tuyo · Juegos (los que estén activos) + «Más» (abre la barra lateral como offcanvas).
    const club = CLUB.map((id) => me.modules.find((m) => m.id === id)).find(Boolean);
    const bottom = [BASE_START[0], ...(club ? [{ id: 'club', nombre: 'Club', icono: 'bi-people-fill', ruta: club.ruta }] : []), BASE_START[1], ...me.modules.filter((m) => m.id === 'juegos')];
    inBottom = new Set(bottom.map((m) => m.id).filter((id) => id !== 'club'));
    const moreActive = !bottom.some(isActive);

    if (!EMBED) document.getElementById('dw-shell').innerHTML = `
      <a class="visually-hidden-focusable position-absolute top-0 start-0 m-2 btn btn-primary" style="z-index:2000" href="#dw-content">Saltar al contenido</a>
      <header class="dw-top">
        <a class="dw-brand" data-mod="inicio" href="/staff/"><span class="dw-brand__logo">${logo}</span><span class="dw-brand__name d-none d-lg-inline">${esc(me.business.etiqueta || me.business.name)}</span></a>
        <span class="dw-top__sep d-none d-lg-inline">/</span>
        <span class="dw-top__title" data-top-title>${esc(page.titulo)}</span>
        <span class="dw-top__spacer"></span>
        ${DIST ? '' : '<button class="dw-iconbtn" data-carnet aria-label="Mi carnet" title="Mi carnet"><i class="bi bi-person-vcard"></i></button>'}
        <div class="dropdown">
          <button class="dw-iconbtn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Notificaciones"><i class="bi bi-bell"></i><span class="dw-dot" data-bell-dot ${me.business.readOnly ? '' : 'hidden'}></span></button>
          <div class="dropdown-menu dropdown-menu-end p-0" style="width:300px"><div class="px-3 py-2 fw-semibold border-bottom">Notificaciones</div>
            ${me.business.readOnly ? `<div class="px-3 py-2 small"><i class="bi bi-lock-fill text-danger me-1"></i>La suscripción venció: la app quedó en solo lectura. Escríbele a Diwilo para reactivarla.</div>` : ''}<div data-notifs><div class="px-3 py-3 small text-body-secondary text-center">No tienes notificaciones.</div></div></div>
        </div>
        <div class="dropdown">
          <button class="dw-user" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Menú de usuario"><span class="dw-avatar">${esc(initials)}</span><i class="bi bi-chevron-down small d-none d-sm-inline"></i></button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm">
            <li class="px-3 py-2"><div class="fw-semibold">${esc(me.user.name || me.user.email)}</div><div class="small text-body-secondary">${esc(me.user.email)} · ${ROLE[me.role] || esc(me.role)}</div></li>
            <li><hr class="dropdown-divider"></li>
            ${me.businesses.length > 1 ? `<li><h6 class="dropdown-header">Entrar a</h6></li>${me.businesses.map((b) => `<li><button class="dropdown-item ${b.id === me.business.id ? 'active' : ''}" data-biz="${esc(b.id)}"><i class="bi ${b.distrito ? 'bi-diagram-3' : 'bi-people'} me-2"></i>${esc(b.etiqueta || b.name)}${b.distrito ? ' <span class="badge text-bg-light">Distrito</span>' : ''}</button></li>`).join('')}<li><hr class="dropdown-divider"></li>` : ''}
            ${canManage && me.modules.some((m) => m.id === 'marca') ? `<li><a class="dropdown-item" data-mod="marca" href="/staff/marca.html"><i class="bi bi-palette me-2"></i>Color y marca</a></li>` : ''}
            <li><button class="dropdown-item" data-pass><i class="bi bi-key me-2"></i>Cambiar contraseña</button></li>
            <li><a class="dropdown-item" href="/privacidad" target="_blank" rel="noopener"><i class="bi bi-shield-check me-2"></i>Política de datos</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><button class="dropdown-item text-danger" data-logout><i class="bi bi-box-arrow-right me-2"></i>Cerrar sesión</button></li>
          </ul>
        </div>
      </header>
      <aside class="offcanvas-lg offcanvas-start dw-side" tabindex="-1" id="dwSide" aria-label="Menú">
        <div class="offcanvas-header border-bottom"><span class="fw-bold">${esc(me.app.nombre)}</span><button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#dwSide" aria-label="Cerrar"></button></div>
        <div class="offcanvas-body"><nav><ul class="dw-nav">${mods.slice(0, -FOOT.length).map(link).join('')}</ul></nav></div>
        <div class="dw-side__foot"><ul class="dw-nav dw-nav--foot">${FOOT.map(link).join('')}</ul><button class="dw-iconbtn w-100 dw-collapse" data-mini title="Contraer o expandir el menú" aria-label="Contraer o expandir el menú"><i class="bi bi-chevron-double-left"></i></button></div>
      </aside>
      <nav class="dw-bottom" aria-label="Menú principal">
        ${bottom.map((m) => `<a data-mod="${esc(m.id)}" href="${esc(m.ruta)}" class="${isActive(m) ? 'active' : ''}"><i class="bi ${esc(m.icono)}"></i><span>${esc(m.nombre)}</span></a>`).join('')}
        <button type="button" class="${moreActive ? 'active' : ''}" data-bs-toggle="offcanvas" data-bs-target="#dwSide" aria-controls="dwSide"><i class="bi bi-grid"></i><span>Más</span></button>
      </nav>`;
    if (main) main.id = 'dw-content';
    if (me.business.readOnly && main) main.insertAdjacentHTML('afterbegin', '<div class="dw-readonly"><i class="bi bi-lock-fill me-1"></i>Suscripción vencida: la app está en solo lectura. Escríbele a Diwilo para reactivarla.</div>');
    document.querySelectorAll('[data-write]').forEach((b) => (b.disabled = me.business.readOnly));
    document.title = `${page.titulo ? page.titulo + ' · ' : ''}${me.business.name} · ${me.app.nombre}`;

    if (!EMBED) {
      try { if (localStorage.getItem('dw_mini') === '1') document.body.classList.add('dw-mini'); } catch (_) {}
      document.querySelector('[data-mini]').onclick = () => {
        document.body.classList.toggle('dw-mini');
        try { localStorage.setItem('dw_mini', document.body.classList.contains('dw-mini') ? '1' : '0'); } catch (_) {}
      };
      document.querySelector('[data-pass]').onclick = changePassword;
      const kb = document.querySelector('[data-carnet]'); if (kb) kb.onclick = () => carnet();
      // El color y el modo ya no se eligen aquí: los maneja Marca → Color y letra (guarda para todo el equipo y este panel los toma por mensaje)
      document.querySelector('[data-logout]').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.replace('/'); };
      document.querySelectorAll('[data-biz]').forEach((b) => (b.onclick = async () => {
        await api('/api/auth/business', { method: 'POST', body: { businessId: b.dataset.biz } });
        location.replace('/');
      }));

    }

    // Página de un módulo inactivo o sin permiso: no se muestra su contenido.
    if (page.modulo && !['inicio', 'equipo', 'lotuyo', 'distrito'].includes(page.modulo) && !me.modules.some((m) => m.id === page.modulo) && main) {
      main.innerHTML = `<div class="dw-card">${window.App.empty('bi-slash-circle', 'Este módulo no está activo para tu negocio o tu rol no tiene acceso.', '<a class="btn btn-primary" href="/staff/">Ir al inicio</a>')}</div>`;
      if (EMBED) notificar();
      return false;
    }
    if (EMBED) { document.body.classList.add('dw-embed'); notificar(); }
    if (PANEL) { iniciarPanel(); bienvenida(me); }
    return true;
  }

  // Una página incrustada le avisa al panel dónde está para marcar el menú y poner el título.
  function notificar() {
    document.body.classList.add('dw-embed');
    window.parent.postMessage({ dw: 'page', modulo: page.modulo || 'inicio', titulo: page.titulo, url: location.pathname + location.search + location.hash }, location.origin);
  }

  // Bienvenida con la marca (logo, nombre y lema): una vez por sesión, breve, se cierra sola o al tocarla
  async function bienvenida(me) {
    try { if (sessionStorage.getItem('dw_splash') === '1') return; sessionStorage.setItem('dw_splash', '1'); } catch (_) {}
    const el = document.createElement('div');
    el.id = 'dw-splash'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Bienvenida');
    el.innerHTML = `<div class="dw-splash__logo">${me.settings.logo ? `<img src="${esc(me.settings.logo)}" alt="">` : `<span>${esc((me.business.name.trim()[0] || 'D').toUpperCase())}</span>`}</div><div class="dw-splash__name">${esc(me.business.name)}</div><div class="dw-splash__lema" data-splash-lema></div>`;
    document.body.appendChild(el);
    const cerrar = () => { el.classList.add('out'); setTimeout(() => el.remove(), 450); };
    el.addEventListener('click', cerrar);
    const t0 = Date.now();
    const lema = await Promise.race([api('/api/marca').then((d) => d.marca?.lema || '').catch(() => ''), new Promise((r) => setTimeout(() => r(''), 900))]);
    const l = el.querySelector('[data-splash-lema]'); if (l) l.textContent = lema;
    setTimeout(cerrar, Math.max(500, 1200 - (Date.now() - t0)));
  }

  // Campana: avisos de las pantallas (alertas del Dashboard) además del aviso de suscripción vencida
  function setNotifs(list) {
    const box = document.querySelector('[data-notifs]'); if (!box) return;
    box.innerHTML = list.length ? list.map((n) => `<a class="dropdown-item d-flex gap-2 align-items-start py-2 text-wrap" ${n.ruta ? `data-go="${esc(n.ruta)}"` : ''} href="${esc(n.ruta || '#')}"><i class="bi ${esc(n.icono || 'bi-bell')} text-primary mt-1"></i><span class="small">${esc(n.texto)}</span></a>`).join('')
      : '<div class="px-3 py-3 small text-body-secondary text-center">No tienes notificaciones.</div>';
    const dot = document.querySelector('[data-bell-dot]'); if (dot) dot.hidden = !list.length && !DW.me?.business?.readOnly;
  }

  function iniciarPanel() {
    const frame = document.getElementById('dw-frame');
    const OK = /^\/staff\/[\w\-./?=&%]*(#[\w\-=]*)?$/;   // el #pestaña admite «=» (#sala=12, #p=5)
    // El #pestaña de un enlace directo (p. ej. cajas.html#proyectado) sobrevive a la redirección: se le pasa a la página
    let go = new URLSearchParams(location.search).get('go');
    if (go && !go.includes('#') && /^#[\w=-]+$/.test(location.hash)) go += location.hash;
    let ultimo = null; try { ultimo = sessionStorage.getItem('dw_ultimo'); } catch (_) {}
    frame.src = [go, ultimo, '/staff/'].find((u) => u && OK.test(u));
    history.replaceState(null, '', location.pathname);   // la dirección queda fija: /<dirección del negocio>
    const marcar = () => {
      document.querySelectorAll('.dw-nav a[data-mod], .dw-bottom a[data-mod]').forEach((a) => {
        const on = a.dataset.mod === panel.modulo || (a.dataset.mod === 'club' && CLUB.includes(panel.modulo));
        a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      const mas = document.querySelector('.dw-bottom button');
      if (mas) mas.classList.toggle('active', ![...document.querySelectorAll('.dw-bottom a[data-mod]')].some((a) => a.classList.contains('active')));
    };
    window.addEventListener('message', (e) => {
      if (e.origin === location.origin && e.source === frame.contentWindow && e.data?.dw === 'tema') { applyTheme(e.data); return; }
      if (e.origin === location.origin && e.source === frame.contentWindow && e.data?.dw === 'avisos' && Array.isArray(e.data.alertas)) {
        setNotifs(e.data.alertas.slice(0, 6).map((a) => ({ icono: String(a.icono || ''), texto: String(a.texto || '').slice(0, 200), ruta: /^[a-z]+$/.test(a.mod || '') ? `/staff/${a.mod}.html` : null })));
        return;
      }
      if (e.origin !== location.origin || e.source !== frame.contentWindow || e.data?.dw !== 'page') return;
      panel.modulo = e.data.modulo; panel.titulo = e.data.titulo || '';
      const t = document.querySelector('[data-top-title]'); if (t) t.textContent = panel.titulo;
      document.title = `${panel.titulo ? panel.titulo + ' · ' : ''}${DW.me.business.name} · ${DW.me.app.nombre}`;
      marcar();
      try { if (OK.test(e.data.url)) sessionStorage.setItem('dw_ultimo', e.data.url); } catch (_) {}
    });
    document.addEventListener('click', (e) => {
      const g = e.target.closest('a[data-go]');
      if (g && /^\/staff\/[\w\-.]+$/.test(g.dataset.go)) { e.preventDefault(); frame.src = g.dataset.go; return; }
      const a = e.target.closest('a[data-mod]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      frame.src = a.getAttribute('href');
      const oc = document.getElementById('dwSide'); if (oc) window.bootstrap?.Offcanvas.getInstance(oc)?.hide();
    });
  }

  const ready = api('/api/me').then((me) => {
    applyTheme(me.settings);
    me.canManage = RANK[me.role] >= RANK.admin;
    me.reaches = (min) => (RANK[me.role] || 0) >= (RANK[min] || 1);
    me.pageAllowed = render(me);
    window.DW.me = me;
    return me;
  }).catch((e) => {
    if (e.code === 'NO_BUSINESS' || e.status === 401) aInicio();
    throw e;
  });

  // Mi carnet (barra superior): credencial de dos caras (frente con foto e ID de Rotary; reverso con QR). Tocarla la voltea.
  let qrLib;
  const qrSvg = async (txt) => {
    qrLib ||= new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; sc.onload = res; sc.onerror = () => { qrLib = null; rej(); }; document.head.appendChild(sc); });
    await qrLib; const q = window.qrcode(0, 'M'); q.addData(txt); q.make(); return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  };
  const CARNET_CSS = `<style>
    .ro-k-stage{background:radial-gradient(120% 90% at 50% 0%,#1c2f6b 0%,#0b1430 70%);padding:22px 12px 26px;perspective:1400px}
    .ro-k{position:relative;width:min(100%,330px);aspect-ratio:5/7.4;margin:0 auto;cursor:pointer;transform-style:preserve-3d;transition:transform .7s cubic-bezier(.2,.7,.2,1)}
    .ro-k.is-back{transform:rotateY(180deg)}
    .ro-k__face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:20px;overflow:hidden;color:#fff;display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 18px 16px;
      background:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 1px,transparent 1px 4px),linear-gradient(160deg,#22377a 0%,#172a63 45%,#0f1e4d 100%);
      border:1.5px solid #d9b45a;box-shadow:0 18px 40px rgba(0,0,0,.45),inset 0 0 0 7px rgba(10,20,55,.0)}
    .ro-k__face::before{content:"";position:absolute;inset:9px;border:1px solid rgba(217,180,90,.35);border-radius:14px;pointer-events:none}
    .ro-k__back{transform:rotateY(180deg)}
    .ro-k__gold{background:linear-gradient(135deg,#f6dd8f,#c9962e 55%,#f3d27a)}
    .ro-k__wheel{-webkit-mask:url(/img/marca/rueda.svg) center/contain no-repeat;mask:url(/img/marca/rueda.svg) center/contain no-repeat}
    .ro-k__wm{position:absolute;width:78%;aspect-ratio:1;left:11%;top:34%;background:#fff;opacity:.05}
    .ro-k__logo{align-self:stretch;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:62px;padding:2px 6px}
    .ro-k__logo img,.ro-k__logo svg{max-width:100%;max-height:74px;width:auto;height:auto;display:block}
    .ro-k__svg svg{filter:brightness(0) invert(1)}
    .ro-k__logo b{color:#f2d27e;letter-spacing:.14em;font-size:1.02rem}.ro-k__logo span{font-size:.78rem;opacity:.85}
    .ro-k__brand{align-self:stretch;display:flex;align-items:center;gap:10px;text-align:left;position:relative}
    .ro-k__brand .ro-k__wheel{width:42px;height:42px;flex:none}
    .ro-k__brand img{height:40px;max-width:60px;object-fit:contain;border-radius:6px}
    .ro-k__brand b{display:block;color:#f2d27e;letter-spacing:.14em;font-size:1.02rem;line-height:1.1}
    .ro-k__brand span{font-size:.78rem;opacity:.85}
    .ro-k__badge{margin:12px 0 10px;padding:3px 16px;border-radius:999px;color:#1a1a1a;font-weight:800;font-size:.68rem;letter-spacing:.16em;box-shadow:0 2px 6px rgba(0,0,0,.35)}
    .ro-k__band{position:absolute;left:0;right:0;top:41%;height:13%;background:linear-gradient(90deg,#c86ad1cc,#8f7fe0aa 40%,#7fc9a9aa 75%,#a5d98acc);opacity:.75}
    .ro-k__foto{position:relative;width:46%;aspect-ratio:1;border-radius:50%;padding:5px;z-index:1;box-shadow:0 6px 18px rgba(0,0,0,.45)}
    .ro-k__foto>*{width:100%;height:100%;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:#d41367;color:#fff;font-size:2.4rem;font-weight:800}
    .ro-k__name{font-weight:800;font-size:1.28rem;line-height:1.15;margin-top:12px;position:relative;text-shadow:0 2px 6px rgba(0,0,0,.4)}
    .ro-k__role{color:#f2d27e;font-weight:700;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;margin-top:4px;position:relative}
    .ro-k__foot{margin-top:auto;align-self:stretch;border-top:1px solid rgba(217,180,90,.35);padding-top:10px;position:relative}
    .ro-k__lbl{font-size:.64rem;letter-spacing:.2em;text-transform:uppercase;opacity:.8;font-weight:700}
    .ro-k__id{font-size:1.7rem;font-weight:800;letter-spacing:.12em;line-height:1.1;color:#fbeecb}
    .ro-k__since{font-size:.74rem;opacity:.85}
    .ro-k__qr{background:#fff;border-radius:14px;padding:12px;width:68%;aspect-ratio:1;display:grid;place-items:center;color:#555;position:relative}
    .ro-k__qr svg{width:100%;height:100%}
    .ro-k__rows{align-self:stretch;text-align:left;margin-top:8px;position:relative}
    .ro-k__rows>div{border-bottom:1px solid rgba(255,255,255,.12);padding:6px 2px}
    .ro-k__rows b{display:block;font-size:.92rem}
    .ro-k__motto{margin-top:auto;align-self:stretch;display:flex;align-items:center;gap:12px;font-style:italic;font-size:.82rem;position:relative}
    .ro-k__motto .ro-k__wheel{width:36px;height:36px;flex:none}
    .ro-k-hint{color:rgba(255,255,255,.6);font-size:.75rem;text-align:center;margin-top:12px}
  </style>`;
  async function carnet() {
    const { modal, toast } = window.App;
    const head = `<div class="modal-header"><h2 class="modal-title h5"><i class="bi bi-person-vcard me-2" style="color:var(--dw-p)"></i>Mi carnet</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>`;
    const foot = (extra = '') => `<div class="modal-footer">${extra}<button type="button" class="btn btn-light" data-bs-dismiss="modal">Cerrar</button></div>`;
    const { el } = modal(`${head}<div class="modal-body p-4 text-center text-body-secondary">Cargando…</div>${foot()}`);
    const body = () => el.querySelector('.modal-body');
    let k; try { k = (await api('/api/lotuyo/carnet')).carnet; } catch (x) { body().textContent = x.message; return; }
    if (!k) { body().innerHTML = `${window.App.empty('bi-person-vcard', 'Tu usuario aún no está enlazado a una ficha de socio. Pídele a la junta que te dé acceso desde Socios.')}`; return; }
    // Logo completo del club arriba: el de fondo oscuro (blanco) hecho en Marca; si no hay, el logotipo oficial con el nombre del club.
    const logos = (DW.me?.modules || []).some((x) => x.id === 'marca') ? ((await api('/api/marca/logos').catch(() => null))?.logos || []) : [];
    const logoClub = logos.find((x) => x.tipo === 'oscuro' && x.data_url)?.data_url || null;
    const ini = k.nombre.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const fecha = (d) => d ? new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
    let atras = false;
    const pinta = () => {
      const activado = !!k.activado_at, desde = k.activado_at || k.fecha_ingreso;
      const id = k.myrotary_id || '—';
      el.querySelector('.modal-content').innerHTML = `${CARNET_CSS}${head}
        <div class="modal-body p-0"><div class="ro-k-stage">
          <div class="ro-k${atras ? ' is-back' : ''}" data-flip role="button" tabindex="0" aria-label="Voltear carnet">
            <div class="ro-k__face">
              <div class="ro-k__wm ro-k__wheel"></div>
              <div class="ro-k__logo">${logoClub ? `<img src="${esc(logoClub)}" alt="${esc(k.club)}">` : k.logo_oficial ? `<div class="ro-k__svg">${k.logo_oficial}</div>` : `<b>ROTARACT</b><span>${esc(k.club)}</span>`}</div>
              <div class="ro-k__badge ro-k__gold">${activado ? 'SOCIO ACTIVADO' : esc((k.tipo || 'Socio').toUpperCase())}</div>
              <div class="ro-k__band"></div>
              <div class="ro-k__foto ro-k__gold">${k.foto ? `<img src="${esc(k.foto)}" alt="">` : `<div>${esc(ini)}</div>`}</div>
              <div class="ro-k__name">${esc(k.nombre)}</div>
              <div class="ro-k__role">${esc(k.cargo || 'Rotary International')}</div>
              <div class="ro-k__foot"><div class="ro-k__lbl">ID de Rotary</div><div class="ro-k__id">${esc(id)}</div>${desde ? `<div class="ro-k__since">Socio desde ${esc(fecha(desde))}</div>` : ''}</div>
            </div>
            <div class="ro-k__face ro-k__back">
              <div class="ro-k__wm ro-k__wheel" style="top:46%"></div>
              <div class="ro-k__lbl" style="color:#f2d27e;opacity:1;margin:4px 0 12px">${activado ? 'Carné de socio activado' : 'Carné de socio'}</div>
              <div class="ro-k__qr" data-qr><span class="small">Generando QR…</span></div>
              <div class="small mt-2" style="opacity:.8;position:relative">Escanéalo para verificar el carné o pasar lista</div>
              <div class="ro-k__rows"><div><span class="ro-k__lbl">Titular</span><b>${esc(k.nombre)}</b></div><div><span class="ro-k__lbl">ID de Rotary</span><b>${esc(id)}</b></div></div>
              <div class="ro-k__motto"><div class="ro-k__wheel ro-k__gold"></div><span>«Dar de sí antes de pensar en sí»</span></div>
            </div>
          </div>
          <div class="ro-k-hint"><i class="bi bi-arrow-repeat me-1"></i>Toca el carnet para voltearlo</div>
        </div></div>
        ${foot('<button type="button" class="btn btn-light me-auto" data-voltear><i class="bi bi-arrow-repeat me-1"></i>Voltear</button><button type="button" class="btn btn-light" data-foto><i class="bi bi-camera me-1"></i>Foto</button><button type="button" class="btn btn-primary" data-editar><i class="bi bi-pencil me-1"></i>Editar</button>')}`;
      const card = el.querySelector('[data-flip]');
      const flip = () => { atras = !atras; card.classList.toggle('is-back', atras); };
      card.onclick = flip; card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
      el.querySelector('[data-voltear]').onclick = flip;
      const qrTxt = [`ROTARACT · ${k.club}`, `Titular: ${k.nombre}`, `ID de Rotary: ${k.myrotary_id || 'sin registrar'}`, activado ? `Activado: ${k.activado_at}` : '', k.codigo ? `Verificación: ${k.codigo}` : ''].filter(Boolean).join('\n');
      qrSvg(qrTxt).then((svg) => { const q = el.querySelector('[data-qr]'); if (q) q.innerHTML = svg; }).catch(() => { const q = el.querySelector('[data-qr]'); if (q) q.innerHTML = '<span class="small">No se pudo generar el QR</span>'; });
      el.querySelector('[data-editar]').onclick = async () => {
        const out = await window.App.Crud.form({ title: 'Editar mi carnet', fields: [{ k: 'telefono', label: 'Celular', type: 'text' }, { k: 'profesion', label: 'Profesión', type: 'text' }, { k: 'instagram', label: 'Instagram', type: 'text' }, { k: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' }], values: k });
        if (!out) return;
        try { await api('/api/lotuyo/carnet', { method: 'PATCH', body: out }); Object.assign(k, out); toast('Carnet actualizado'); pinta(); } catch (x) { toast(x.message, false); }
      };
      el.querySelector('[data-foto]').onclick = () => {
        const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
        i.onchange = async () => {
          const f = i.files[0]; if (!f) return;
          const r = await fetch(`/api/lotuyo/foto?nombre=${encodeURIComponent(f.name)}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-app': '1', 'content-type': 'application/octet-stream' }, body: f });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) return toast(d.error || 'No se pudo subir la foto', false);
          k.foto = d.foto; atras = false; toast('Foto actualizada'); pinta();
        };
        i.click();
      };
    };
    pinta();
  }

  window.DW = { ready, applyTheme, carnet };

})();
