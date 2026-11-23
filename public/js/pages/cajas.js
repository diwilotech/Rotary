// Finanzas: solo dos cajas. Arriba se elige la caja (Caja menor · Club o Caja mayor · Obras) y abajo se ven SUS movimientos,
// su flujo de los 12 meses del año rotario (julio a junio) y en qué se gasta. Cada caja tiene sus propias categorías. Traslados.
// En la Caja menor, «Obligaciones del club»: lo que el club debe pagar (cuota distrital) frente a la plata que hay → cuánto falta,
// y las cuotas de los socios que se esperan cada mes (en la gráfica, rayado = proyectado).
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast } = window.App;
  const C = window.App.Crud, RO = window.RO;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const W = !me.business.readOnly;
  const [cat, proys] = await Promise.all([api('/api/cajas/categorias'), me.modules.some((m) => m.id === 'impacto') ? RO.proyectos() : []]);
  const ICON = { menor: 'bi-cup-hot', mayor: 'bi-bricks' };
  const corto = (m) => ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][+m.slice(5)];
  let caja = ['menor', 'mayor'].includes(location.hash.slice(1)) ? location.hash.slice(1) : (() => { try { return localStorage.getItem('ro_caja') || 'menor'; } catch (_) { return 'menor'; } })(), res = null, pro = null, tabla = null, anio = null;
  const elegir = (k) => { caja = k; try { localStorage.setItem('ro_caja', caja); } catch (_) {} if (res) { pintarCajas(); pintarTabla(); } };
  const nav = RO.nav(caja, elegir);

  if (W) {
    acciones.innerHTML = '<button class="btn btn-outline-primary" data-tras><i class="bi bi-arrow-left-right me-1"></i>Trasladar</button>';
    acciones.querySelector('[data-tras]').onclick = async () => {
      const out = await C.form({ title: 'Trasladar entre cajas', fields: [{ k: 'desde', label: 'Sale de', type: 'select', options: Object.entries(cat.cajas) }, { k: 'monto', label: 'Monto', type: 'money', required: true },
        { k: 'fecha', label: 'Fecha', type: 'date', default: C.todayCo() }, { k: 'concepto', label: 'Concepto', type: 'text' }], values: { desde: caja }, okText: 'Trasladar' });
      if (!out) return;
      try { await api('/api/cajas/traslado', { method: 'POST', body: out }); toast('Traslado hecho'); cargar(); } catch (x) { toast(x.message, false); }
    };
  }

  const opcionesCat = (k) => { const c = cat.categorias[k]; return [...new Set([...c.egreso, ...c.ingreso])].map((x) => [x, x]); };

  // Selector del año rotario (‹ 2026-2027 ›)
  const selAnio = (nombre) => `<div class="btn-group btn-group-sm ms-auto"><button class="btn btn-light" data-ay="-1" aria-label="Año anterior"><i class="bi bi-chevron-left"></i></button>
    <span class="btn btn-light disabled text-body fw-semibold">${esc(nombre)}</span><button class="btn btn-light" data-ay="1" aria-label="Año siguiente"><i class="bi bi-chevron-right"></i></button></div>`;

  function pintarCajas() {
    view.querySelector('[data-cajas]').innerHTML = res.cajas.map((k) => `<button type="button" class="ro-caja ${k.id === caja ? 'on' : ''}" data-caja="${k.id}">
      <span class="d-flex align-items-center gap-2"><i class="bi ${ICON[k.id]} fs-4"></i><b>${esc(k.nombre)}</b>${k.id === caja ? '<i class="bi bi-check-circle-fill ms-auto"></i>' : ''}</span>
      <span class="ro-saldo ${k.saldo < 0 ? 'text-danger' : ''}">${C.money(k.saldo)}</span>
      <span class="small">Este mes: <span class="text-success">+${C.money(k.ingresos_mes)}</span> · <span class="text-danger">−${C.money(k.egresos_mes)}</span></span></button>`).join('');
    const k = res.cajas.find((x) => x.id === caja);
    // Caja menor: los meses que vienen muestran lo proyectado (rayado): cuotas de socios esperadas y obligaciones que vencen
    const pm = caja === 'menor' && pro ? Object.fromEntries(pro.meses.map((m) => [m.mes, m])) : {};
    const filas = k.meses.map((x) => { const p = pm[x.mes]; return p?.proyectado && x.mes > res.mes ? { label: corto(x.mes), a: p.cuotas_proy, b: p.oblig_proy, projected: true } : { label: corto(x.mes), a: x.ingresos, b: x.egresos }; });
    pintarObligaciones();
    view.querySelector('[data-flujo-t]').innerHTML = `<span class="ro-h m-0">Flujo del año rotario · julio a junio</span>${selAnio(res.nombre_anio)}`;
    C.bars(view.querySelector('[data-flujo]'), filas, { la: 'Ingresos', lb: 'Egresos' });
    view.querySelector('[data-tot]').innerHTML = `${caja === 'menor' && pro ? '<i class="bi bi-info-circle me-1"></i>Rayado = proyectado: cuotas que deben pagar los socios y obligaciones que vencen. ' : ''}Año: <span class="text-success">+${C.money(k.meses.reduce((t, x) => t + x.ingresos, 0))}</span> · <span class="text-danger">−${C.money(k.meses.reduce((t, x) => t + x.egresos, 0))}</span>`;
    C.rank(view.querySelector('[data-cats]'), k.categorias.slice(0, caja === 'menor' && pro ? 5 : 8).map((x) => ({ k: x.categoria, n: x.total })), C.money);
    if (!k.categorias.length) view.querySelector('[data-cats]').innerHTML = '<p class="small text-body-secondary mb-0">Sin gastos en este año rotario.</p>';
    view.querySelector('[data-tit]').innerHTML = `Movimientos · ${esc(k.nombre)}`;
  }

  /* ---------- Obligaciones (solo Caja menor), dentro de la tarjeta «¿En qué se gasta?» ----------
     Arriba el total de obligaciones del año; al fondo un carrusel que se mueve solo con cada obligación (la tarjeta no crece). */
  const OEST = { pagada: ['ok', 'Pagada'], pendiente: ['soon', 'Pendiente'], vencida: ['bad', 'Vencida'] };
  const OICON = { 'Obligaciones distritales': 'bi-bank', 'Reconocimiento y protocolo': 'bi-award', 'Bonos distritales': 'bi-ticket-perforated', 'Camisetas del club': 'bi-person-standing-dress', Pines: 'bi-pin-angle', 'Otras obligaciones': 'bi-receipt' };
  let giro = null;
  function pintarObligaciones() {
    const top = view.querySelector('[data-otop]'), bot = view.querySelector('[data-oslide]');
    clearInterval(giro);
    view.querySelector('[data-cats-t]').hidden = caja === 'menor' && !!pro;
    if (caja !== 'menor' || !pro) { top.innerHTML = ''; bot.innerHTML = ''; return; }
    const p = pro, pagado = p.obligaciones.reduce((t, o) => t + Math.min(o.pagado, o.total), 0);
    top.innerHTML = `<div class="ro-h mt-0">Obligaciones · año rotario</div>
      <div class="d-flex align-items-baseline gap-2 flex-wrap"><span class="ro-saldo" style="font-size:1.5rem">${C.money(p.total_obligaciones)}</span><span class="small text-body-secondary">pagado ${C.money(pagado)}</span></div>
      ${C.meter(pagado, p.total_obligaciones || 1)}
      <div class="small mt-1">Por pagar <b>${C.money(p.por_pagar)}</b> · en caja ${C.money(p.saldo)} · ${p.falta ? `<b class="text-danger">faltan ${C.money(p.falta)}</b>` : `<b class="text-success">alcanza</b>`}</div>
      ${p.cuota_mes ? `<div class="small text-body-secondary">Cuotas de socios proyectadas: ${C.money(p.cuota_mes)} al mes${p.meses_para_cubrir ? ` · cubren lo que falta en ${p.meses_para_cubrir} ${p.meses_para_cubrir === 1 ? 'mes' : 'meses'}` : ''}</div>` : ''}
      <div class="ro-h">¿En qué se gasta?</div>`;
    const slide = (o) => `<div class="ro-os"><div class="d-flex align-items-center gap-2"><i class="bi ${OICON[o.categoria] || 'bi-receipt'}"></i><span class="small text-body-secondary text-truncate flex-grow-1">${esc(o.categoria)}</span>${C.chip(...OEST[o.estado])}</div>
        <b class="d-block text-truncate mt-1" title="${esc(o.nombre)}">${esc(o.nombre)}</b>
        <div class="d-flex align-items-center gap-2 mt-1"><span class="small flex-grow-1">${C.money(o.total)}${o.vence ? ` · ${C.day(o.vence)}` : ''}</span>
        ${W && o.saldo > 0 ? `<button class="btn btn-sm btn-primary py-0" data-pagar="${o.clave}">Pagar</button>` : ''}${W && o.origen === 'club' ? `<button class="btn btn-sm btn-light py-0" data-oed="${o.id}" aria-label="Editar"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-light py-0" data-odel="${o.id}" aria-label="Borrar"><i class="bi bi-trash"></i></button>` : ''}</div></div>`;
    bot.innerHTML = `<div class="d-flex align-items-center gap-2 mt-3 mb-1"><span class="ro-h m-0 flex-grow-1">Lista de obligaciones</span>
        <button class="btn btn-sm btn-light" data-os="-1" aria-label="Anterior"><i class="bi bi-chevron-left"></i></button><button class="btn btn-sm btn-light" data-os="1" aria-label="Siguiente"><i class="bi bi-chevron-right"></i></button>
        ${W ? '<button class="btn btn-sm btn-outline-primary" data-onueva><i class="bi bi-plus-lg"></i> Nueva</button>' : ''}</div>
      <div class="ro-oslider" data-track>${p.obligaciones.length ? p.obligaciones.map(slide).join('') : `<div class="ro-os text-body-secondary small">Aún no hay obligaciones. Ejemplos: ${p.tipos.slice(0, 5).join(', ')}.</div>`}</div>`;
    const track = bot.querySelector('[data-track]');
    if (p.obligaciones.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      let quieto = false;
      ['pointerenter', 'touchstart', 'focusin'].forEach((ev) => track.addEventListener(ev, () => (quieto = true), { passive: true }));
      ['pointerleave', 'focusout'].forEach((ev) => track.addEventListener(ev, () => (quieto = false)));
      giro = setInterval(() => { if (quieto || !track.isConnected) return; mover(track, 1, true); }, 4000);
    }
  }
  const mover = (track, dir, vuelta) => {
    const w = track.firstElementChild?.getBoundingClientRect().width + 10 || 200;
    if (vuelta && track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) track.scrollTo({ left: 0, behavior: 'smooth' });
    else track.scrollBy({ left: dir * w, behavior: 'smooth' });
  };
  async function editarObligacion(o) {
    const out = await C.form({ title: o ? 'Editar obligación' : 'Nueva obligación', fields: [{ k: 'categoria', label: 'Tipo', type: 'select', options: pro.tipos.filter((t) => t !== 'Obligaciones distritales').map((t) => [t, t]) },
      { k: 'nombre', label: 'Nombre', type: 'text', required: true, full: true, hint: 'p. ej. Bonos de la conferencia distrital, Camisetas del club, Pines de socios' }, { k: 'monto', label: 'Monto', type: 'money', required: true },
      { k: 'vence', label: 'Vence', type: 'date' }, { k: 'notas', label: 'Notas', type: 'long' }], values: o || { categoria: 'Reconocimiento y protocolo' }, okText: 'Guardar' });
    if (!out) return;
    try { await api(o ? `/api/cajas/obligaciones/${o.id}` : '/api/cajas/obligaciones', { method: o ? 'PATCH' : 'POST', body: out }); toast('Obligación guardada'); await resumen(); } catch (x) { toast(x.message, false); }
  }
  async function pagar(clave) {
    const o = pro.obligaciones.find((x) => x.clave === clave); if (!o) return;
    const out = await C.form({ title: `Pagar: ${o.nombre}`, fields: [{ k: 'monto', label: 'Monto', type: 'money', required: true }, { k: 'fecha', label: 'Fecha', type: 'date', required: true }],
      values: { monto: o.saldo, fecha: C.todayCo() }, okText: 'Registrar pago' });
    if (!out) return;
    try { await api(o.origen === 'distrito' ? `/api/cajas/distrital/${o.id}/pagar` : `/api/cajas/obligaciones/${o.id}/pagar`, { method: 'POST', body: out }); toast('Pagada: salió de la Caja menor'); await cargar(); } catch (x) { toast(x.message, false); }
  }

  function pintarTabla() {
    tabla = C.table({ el: view.querySelector('[data-movs]'), base: '/api/cajas', entity: 'movimientos', title: 'movimiento', newText: 'Nuevo movimiento', readOnly: !W, fixed: { caja }, emptyIcon: 'bi-cash-stack', empty: 'Esta caja aún no tiene movimientos.',
      defaults: () => ({ caja, tipo: 'egreso', fecha: C.todayCo() }), onChanged: () => resumen(),
      filters: [{ k: 'tipo', options: [['', 'Ingresos y egresos'], ['ingreso', 'Ingresos'], ['egreso', 'Egresos']] }],
      fields: [{ k: 'tipo', label: 'Tipo', type: 'select', options: [['egreso', 'Egreso'], ['ingreso', 'Ingreso']] }, { k: 'fecha', label: 'Fecha', type: 'date', required: true },
        { k: 'concepto', label: 'Concepto', type: 'text', required: true, full: true }, { k: 'categoria', label: 'Categoría', type: 'select', options: opcionesCat(caja) }, { k: 'monto', label: 'Monto', type: 'money', required: true },
        ...(proys.length ? [{ k: 'proyecto_id', label: 'Proyecto (obra)', type: 'select', options: RO.opts(proys, 'Ninguno') }] : []), { k: 'observaciones', label: 'Observaciones', type: 'long' }],
      columns: [{ label: 'Fecha', html: (m) => C.day(m.fecha) }, { label: 'Concepto', main: true, html: (m) => `${esc(m.concepto)}<div class="small text-body-secondary fw-normal">${esc(m.categoria || '')}${m.proyecto ? ` · ${esc(m.proyecto)}` : ''}${m.pago_id ? ' · <i class="bi bi-wallet2"></i> cuota' : ''}${m.traslado ? ' · <i class="bi bi-arrow-left-right"></i> traslado' : ''}</div>` },
        { label: 'Monto', cls: 'text-end', html: (m) => `<b class="${m.tipo === 'egreso' ? 'text-danger' : 'text-success'}">${m.tipo === 'egreso' ? '−' : '+'}${C.money(m.monto)}</b>` }],
      rowActions: (m) => `${m.comprobante ? `<a class="btn btn-sm btn-light" href="/api/cajas/movimientos/${m.id}/comprobante" target="_blank" rel="noopener" title="Ver comprobante"><i class="bi bi-paperclip"></i></a>` : ''}${W && !m.pago_id ? ` <button class="btn btn-sm btn-light" data-act="subir" title="Adjuntar comprobante"><i class="bi bi-upload"></i></button>` : ''}`,
      onAction: async (a, m) => { if (a !== 'subir') return; const f = await RO.elegirArchivo(); if (!f) return; try { await RO.subir(`/api/cajas/movimientos/${m.id}/comprobante`, f); toast('Comprobante adjunto'); tabla.load(); } catch (x) { toast(x.message, false); } } });
    tabla.load();
  }

  async function resumen() {
    [res, pro] = await Promise.all([api(`/api/cajas/resumen${anio ? `?anio=${anio}` : ''}`), api(`/api/cajas/proyectado${anio ? `?anio=${anio}` : ''}`).catch(() => null)]);
    anio = res.anio;
    pintarCajas();
  }
  async function cargar() { await resumen(); pintarTabla(); }

  view.innerHTML = `<style>.ro-cajas{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));margin-bottom:16px}
    .ro-caja{display:grid;gap:4px;text-align:left;padding:16px;border-radius:16px;border:2px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit}
    .ro-caja.on{border-color:var(--dw-p);background:linear-gradient(160deg,rgba(var(--dw-p-rgb),.12),var(--bs-body-bg) 70%)}.ro-caja.on i{color:var(--dw-p)}.ro-saldo{font-size:1.8rem;font-weight:700;font-variant-numeric:tabular-nums}
    .ro-oslider{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;height:118px}.ro-oslider::-webkit-scrollbar{display:none}
    .ro-os{flex:0 0 min(240px,85%);scroll-snap-align:start;padding:10px 12px;border-radius:12px;border:1px solid var(--bs-border-color);background:rgba(var(--dw-p-rgb),.04);overflow:hidden}.ro-os .bi{color:var(--dw-p)}
    .ro-ob{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ro-ob>div{flex:1;min-width:120px;padding:10px 12px;border-radius:12px;background:rgba(var(--dw-p-rgb),.06)}.ro-ob>i{color:var(--bs-secondary-color)}
    .ro-ob span{display:block;font-size:.75rem;color:var(--bs-secondary-color)}.ro-ob b{font-size:1.25rem;font-variant-numeric:tabular-nums}
    .ro-ob .ok{background:rgba(25,135,84,.12)}.ro-ob .ok b{color:var(--bs-success)}.ro-ob .bad{background:rgba(220,53,69,.12)}.ro-ob .bad b{color:var(--bs-danger)}</style>
    <div class="ro-cajas" data-cajas></div>
    <div class="row g-3 mb-3"><div class="col-md-7"><div class="dw-card h-100"><div class="d-flex align-items-center gap-2 mb-2" data-flujo-t></div><div data-flujo></div><div class="small text-body-secondary mt-1" data-tot></div></div></div>
      <div class="col-md-5"><div class="dw-card h-100 d-flex flex-column"><div data-otop></div><div class="ro-h mt-0" data-cats-t>¿En qué se gasta? · año rotario</div><div data-cats></div><div class="mt-auto" data-oslide></div></div></div></div>
    <h2 class="h6 mb-2" data-tit></h2><div data-movs></div>`;
  view.addEventListener('click', (e) => {
    const y = e.target.closest('[data-ay]'); if (y) { anio += Number(y.dataset.ay); return resumen(); }
    const pg = e.target.closest('[data-pagar]'); if (pg) return pagar(pg.dataset.pagar);
    const os = e.target.closest('[data-os]'); if (os) { clearInterval(giro); return mover(view.querySelector('[data-track]'), Number(os.dataset.os)); }
    if (e.target.closest('[data-onueva]')) return editarObligacion(null);
    const od = e.target.closest('[data-odel]'); if (od) return (async () => {
      if (!(await window.App.confirm({ title: '¿Borrar esta obligación?', text: 'Si ya tiene pagos, primero borra el pago en Movimientos.', ok: 'Borrar' }))) return;
      try { await api(`/api/cajas/obligaciones/${od.dataset.odel}`, { method: 'DELETE' }); toast('Borrada'); await resumen(); } catch (x) { toast(x.message, false); }
    })();
    const oe = e.target.closest('[data-oed]'); if (oe) return editarObligacion(pro.obligaciones.find((o) => o.clave === `c:${oe.dataset.oed}`));
    const b = e.target.closest('[data-caja]'); if (!b || b.dataset.caja === caja) return;
    history.replaceState(null, '', `#${b.dataset.caja}`);
    nav?.querySelectorAll('a').forEach((x) => x.classList.toggle('on', x.dataset.club === b.dataset.caja));
    elegir(b.dataset.caja);
  });
  await cargar();
});
