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
  const CUO = me.canManage && me.modules.some((x) => x.id === 'cuotas');   // ver/editar las cuotas desde la caja
  const [cat, proys] = await Promise.all([api('/api/cajas/categorias'), me.modules.some((m) => m.id === 'impacto') ? RO.proyectos() : []]);
  const ICON = { menor: 'bi-cup-hot', mayor: 'bi-bricks' };
  const corto = (m) => ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][+m.slice(5)];
  let caja = ['menor', 'mayor'].includes(location.hash.slice(1)) ? location.hash.slice(1) : (() => { try { return localStorage.getItem('ro_caja') || 'menor'; } catch (_) { return 'menor'; } })(), res = null, pro = null, tabla = null, anio = null;
  let cajita = location.hash === '#cajita';
  const elegir = (k) => {
    if (k === 'cajita') { cajita = true; view.classList.add('ro-modo-cajita'); return pintarCajita(); }
    cajita = false; view.classList.remove('ro-modo-cajita');
    caja = k; try { localStorage.setItem('ro_caja', caja); } catch (_) {} if (res) { pintarCajas(); pintarTabla(); }
  };
  const nav = RO.nav(cajita ? 'cajita' : caja, elegir);

  /* ---------- Cajita de macería: lo que se recoge en cada reunión (se anota al conducirla) ---------- */
  let anioC = null;
  async function pintarCajita() {
    const el = view.querySelector('[data-cajita]'); el.innerHTML = '<div class="dw-card text-body-secondary">Cargando…</div>';
    let d; try { d = await api(`/api/cajas/cajita${anioC ? `?anio=${anioC}` : ''}`); } catch (x) { el.innerHTML = `<div class="dw-card">${esc(x.message)}</div>`; return; }
    anioC = d.anio; const max = Math.max(1, ...d.rows.map((x) => x.recaudo));
    el.innerHTML = `<div class="dw-card mb-3"><div class="d-flex align-items-center gap-2 flex-wrap"><i class="bi bi-coin fs-2" style="color:#E08E0B"></i>
        <div class="flex-grow-1"><div class="small text-body-secondary">Cajita de macería · año rotario ${esc(d.nombre)}</div><div class="ro-saldo">${C.money(d.total)}</div>
        <div class="small">${d.rows.length} reuniones · promedio ${C.money(d.promedio)} por reunión${d.pendiente ? ` · <b class="text-warning-emphasis">${C.money(d.pendiente)} por pasar a la Caja menor</b>` : d.total ? ' · <span class="text-success">todo está en la Caja menor</span>' : ''}</div></div>
        <div class="btn-group btn-group-sm"><button class="btn btn-light" data-cay="-1" aria-label="Año anterior"><i class="bi bi-chevron-left"></i></button><button class="btn btn-light" data-cay="1" aria-label="Año siguiente"><i class="bi bi-chevron-right"></i></button></div></div></div>
      ${d.rows.length ? `<div class="dw-card">${d.rows.map((x) => `<div class="d-flex align-items-center gap-3 py-2 border-bottom flex-wrap">
          <div style="min-width:92px" class="small text-capitalize">${C.day(x.fecha)}</div>
          <div class="flex-grow-1 min-w-0"><b class="d-block text-truncate small">${esc(x.titulo)}</b><div class="progress mt-1" style="height:8px"><div class="progress-bar" style="width:${Math.round((x.recaudo / max) * 100)}%;background:#E08E0B"></div></div></div>
          <b style="min-width:90px" class="text-end">${C.money(x.recaudo)}</b>
          ${x.movimiento_id ? '<span class="badge rounded-pill text-bg-success"><i class="bi bi-check2 me-1"></i>En la caja</span>' : W ? `<button class="btn btn-sm btn-outline-primary" data-cing="${x.id}">Pasar a la Caja menor</button>` : '<span class="badge rounded-pill text-bg-warning">Pendiente</span>'}</div>`).join('')}</div>`
        : window.App.empty('bi-coin', 'Aún no hay recaudos. Se anotan al conducir cada reunión, en el punto «Cajita de macería».')}`;
    el.onclick = async (e) => {
      const y = e.target.closest('[data-cay]'); if (y) { anioC += Number(y.dataset.cay); return pintarCajita(); }
      const b = e.target.closest('[data-cing]'); if (!b) return;
      b.disabled = true;
      try { await api(`/api/cajas/cajita/${b.dataset.cing}/ingresar`, { method: 'POST', body: {} }); toast('Listo: entró a la Caja menor'); pintarCajita(); resumen(); } catch (x) { toast(x.message, false); b.disabled = false; }
    };
  }

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
    if (!k.categorias.length) view.querySelector('[data-cats]').innerHTML = '<p class="small text-body-secondary mb-0">Sin inversiones en este año rotario.</p>';
    view.querySelector('[data-tit]').innerHTML = `Movimientos · ${esc(k.nombre)}`;
  }

  /* ---------- Obligaciones (solo Caja menor) = «¿En qué se gasta?» ----------
     Cada rubro de gasto es una obligación del año rotario: valor (se edita), pagado y botón Pagar (con comprobante; queda en
     Movimientos). Arriba el total de obligaciones. La lista tiene alto fijo y se desplaza por dentro: la tarjeta no crece. */
  const OEST = { pagada: ['ok', 'Pagada'], pendiente: ['soon', 'Pendiente'], sin_valor: ['free', 'Sin valor'] };
  function pintarObligaciones() {
    const top = view.querySelector('[data-otop]'), lista = view.querySelector('[data-olista]');
    const menor = caja === 'menor' && !!pro;
    view.querySelector('[data-cats-t]').hidden = menor; view.querySelector('[data-cats]').hidden = menor;
    if (!menor) { top.innerHTML = ''; lista.innerHTML = ''; return; }
    const p = pro;
    top.innerHTML = `<div class="ro-h mt-0">Obligaciones · año rotario ${esc(p.nombre)}</div>
      <div class="d-flex align-items-baseline gap-2 flex-wrap"><span class="ro-saldo" style="font-size:1.5rem">${C.money(p.total_obligaciones)}</span><span class="small text-body-secondary">pagado ${C.money(p.pagado)}</span></div>
      ${C.meter(p.pagado, p.total_obligaciones || 1)}
      <div class="small mt-1">Por pagar <b>${C.money(p.por_pagar)}</b> · en caja ${C.money(p.saldo)} · ${p.falta ? `<b class="text-danger">faltan ${C.money(p.falta)}</b>` : '<b class="text-success">alcanza</b>'}</div>
      ${p.cuota_mes ? `<div class="small text-body-secondary">Cuotas de socios proyectadas: ${C.money(p.cuota_mes)} al mes${p.meses_para_cubrir ? ` · cubren lo que falta en ${p.meses_para_cubrir} ${p.meses_para_cubrir === 1 ? 'mes' : 'meses'}` : ''}</div>` : ''}
      <div class="ro-h">Inversión del club</div>`;
    lista.innerHTML = `<div class="ro-rubros">${p.rubros.map((r) => `<div class="ro-rubro">
        <div class="d-flex align-items-center gap-2"><b class="flex-grow-1 text-truncate small" title="${esc(r.categoria)}">${esc(r.categoria)}</b>${C.chip(...OEST[r.estado])}</div>
        <div class="d-flex justify-content-between small"><span>${C.money(r.pagado)}${r.valor ? ` de ${C.money(r.valor)}` : ' invertido'}</span>${r.valor_distrito ? `<span class="text-body-secondary" title="Cuota distrital">incl. distrito ${C.money(r.valor_distrito)}</span>` : ''}</div>
        ${r.valor ? C.meter(r.pagado, r.valor) : ''}
        ${W ? `<div class="d-flex gap-1 mt-1"><button class="btn btn-sm btn-primary py-0" data-rpagar="${esc(r.categoria)}"><i class="bi bi-cash me-1"></i>Pagar</button>
          <button class="btn btn-sm btn-light py-0" data-reditar="${esc(r.categoria)}"><i class="bi bi-pencil me-1"></i>Editar valor</button></div>` : ''}</div>`).join('')}</div>
      ${W ? '<button class="btn btn-sm btn-link px-0" data-ragregar><i class="bi bi-plus-lg me-1"></i>Otra obligación</button>' : ''}`;
  }
  const rub = (cat) => pro.rubros.find((r) => r.categoria === cat);
  async function editarValor(cat) {
    const r = rub(cat) || { categoria: cat, valor: 0, valor_distrito: 0 };
    const out = await C.form({ title: `Valor de «${cat}»`, fields: [{ k: 'valor', label: `Valor para el año ${pro.nombre}`, type: 'money', required: true,
      hint: r.valor_distrito ? `Incluye la cuota distrital (${C.money(r.valor_distrito)}): súbelo para agregar más.` : 'Súbelo o bájalo cuando cambie lo que hay que pagar.' }], values: { valor: r.valor }, okText: 'Guardar' });
    if (!out) return;
    try { await api('/api/cajas/rubros', { method: 'PUT', body: { categoria: cat, anio: pro.anio, valor: out.valor } }); toast('Valor actualizado'); await resumen(); } catch (x) { toast(x.message, false); }
  }
  async function agregar() {
    const usados = new Set(pro.rubros.map((r) => r.categoria));
    const opciones = cat.categorias.menor.egreso.filter((x) => x !== 'Traslado' && !usados.has(x));
    if (!opciones.length) return toast('Todas las categorías ya están en la lista', false);
    const out = await C.form({ title: 'Otra obligación', fields: [{ k: 'categoria', label: 'Categoría', type: 'select', options: opciones.map((x) => [x, x]) }, { k: 'valor', label: `Valor para el año ${pro.nombre}`, type: 'money', required: true }], okText: 'Guardar' });
    if (!out) return;
    try { await api('/api/cajas/rubros', { method: 'PUT', body: { categoria: out.categoria, anio: pro.anio, valor: out.valor } }); toast('Obligación agregada'); await resumen(); } catch (x) { toast(x.message, false); }
  }
  async function pagarRubro(cat) {
    const r = rub(cat);
    const out = await C.form({ title: `Pagar: ${cat}`, fields: [{ k: 'concepto', label: 'Concepto', type: 'text', full: true }, { k: 'monto', label: 'Monto', type: 'money', required: true }, { k: 'fecha', label: 'Fecha', type: 'date', required: true }],
      values: { concepto: cat, monto: r?.saldo || '', fecha: C.todayCo() }, okText: 'Registrar pago' });
    if (!out) return;
    let id;
    try { id = (await api('/api/cajas/rubros/pagar', { method: 'POST', body: { ...out, categoria: cat } })).id; } catch (x) { return toast(x.message, false); }
    await cargar();
    if (await window.App.confirm({ title: 'Pago registrado', text: 'Salió de la Caja menor y quedó en Movimientos. ¿Subes el comprobante?', ok: 'Subir comprobante' })) {
      const f = await RO.elegirArchivo(); if (!f) return;
      try { await RO.subir(`/api/cajas/movimientos/${id}/comprobante`, f); toast('Comprobante adjunto'); tabla?.load(); } catch (x) { toast(x.message, false); }
    }
  }

  function pintarTabla() {
    tabla = C.table({ el: view.querySelector('[data-movs]'), base: '/api/cajas', entity: 'movimientos', title: 'movimiento', newText: 'Nuevo movimiento', readOnly: !W, fixed: { caja }, emptyIcon: 'bi-cash-stack', empty: 'Esta caja aún no tiene movimientos.',
      defaults: () => ({ caja, tipo: 'egreso', fecha: C.todayCo() }), onChanged: () => resumen(),
      filters: [{ k: 'tipo', options: [['', 'Ingresos y egresos'], ['ingreso', 'Ingresos'], ['egreso', 'Egresos']] }],
      fields: (row) => [{ k: 'tipo', label: 'Tipo', type: 'select', options: [['egreso', 'Egreso'], ['ingreso', 'Ingreso']] }, { k: 'fecha', label: 'Fecha', type: 'date', required: true },
        { k: 'concepto', label: 'Concepto', type: 'text', required: true, full: true }, { k: 'categoria', label: 'Categoría', type: 'select', options: opcionesCat(caja) }, { k: 'monto', label: 'Monto', type: 'money', required: true },
        ...(proys.length ? [{ k: 'proyecto_id', label: 'Proyecto (obra)', type: 'select', options: RO.optsProyectos(proys, row?.proyecto_id) }] : []), { k: 'observaciones', label: 'Observaciones', type: 'long' }],
      columns: [{ label: 'Fecha', html: (m) => C.day(m.fecha) }, { label: 'Concepto', main: true, html: (m) => `${esc(m.concepto)}<div class="small text-body-secondary fw-normal">${esc(m.categoria || '')}${m.proyecto ? ` · ${esc(m.proyecto)}` : ''}${m.pago_id ? ' · <i class="bi bi-wallet2"></i> cuota' : ''}${m.traslado ? ' · <i class="bi bi-arrow-left-right"></i> traslado' : ''}</div>` },
        { label: 'Monto', cls: 'text-end', html: (m) => `<b class="${m.tipo === 'egreso' ? 'text-danger' : 'text-success'}">${m.tipo === 'egreso' ? '−' : '+'}${C.money(m.monto)}</b>` }],
      // Ingreso de una cuota: su comprobante y su edición son los de la cuota (solo quien tiene Cuotas)
      rowActions: (m) => (m.pago_id ? (CUO ? `${m.cuota?.comprobante ? `<a class="btn btn-sm btn-light" href="/api/cuotas/pagos/${m.pago_id}/comprobante" target="_blank" rel="noopener" title="Ver comprobante de la cuota"><i class="bi bi-paperclip"></i></a>` : ''}
          ${W ? ` <button class="btn btn-sm btn-light" data-act="csubir" title="${m.cuota?.comprobante ? 'Cambiar' : 'Subir'} comprobante"><i class="bi bi-upload"></i></button> <button class="btn btn-sm btn-light" data-act="ceditar" title="Editar la cuota"><i class="bi bi-pencil"></i></button>` : ''}`
          : '<span class="small text-body-secondary" title="Solo quien tiene Cuotas la edita"><i class="bi bi-lock"></i></span>')
        : `${m.comprobante ? `<a class="btn btn-sm btn-light" href="/api/cajas/movimientos/${m.id}/comprobante" target="_blank" rel="noopener" title="Ver comprobante"><i class="bi bi-paperclip"></i></a>` : ''}${W ? ` <button class="btn btn-sm btn-light" data-act="subir" title="Adjuntar comprobante"><i class="bi bi-upload"></i></button>` : ''}`),
      onRow: (m) => { if (!m.pago_id) return true; if (CUO && W) editarCuota(m); return false; },
      onAction: async (a, m) => {
        if (a === 'ceditar') return editarCuota(m);
        if (a !== 'subir' && a !== 'csubir') return;
        const f = await RO.elegirArchivo(); if (!f) return;
        try { await RO.subir(a === 'csubir' ? `/api/cuotas/pagos/${m.pago_id}/comprobante` : `/api/cajas/movimientos/${m.id}/comprobante`, f); toast('Comprobante adjunto'); tabla.load(); } catch (x) { toast(x.message, false); }
      } });
    tabla.load();
  }

  async function editarCuota(m) {
    const out = await C.form({ title: `Editar cuota · ${m.socio || ''}`, fields: [{ k: 'monto', label: 'Monto', type: 'money', required: true }, { k: 'fecha', label: 'Fecha del pago', type: 'date', required: true },
      { k: 'metodo', label: 'Método', type: 'select', options: [['transferencia', 'Transferencia'], ['nequi', 'Nequi'], ['daviplata', 'Daviplata'], ['efectivo', 'Efectivo'], ['bre-b', 'Bre-B'], ['otro', 'Otro']] },
      { k: 'observaciones', label: 'Observaciones', type: 'long' }], values: { monto: m.monto, fecha: m.fecha, metodo: m.cuota?.metodo || 'transferencia', observaciones: m.cuota?.observaciones || '' }, okText: 'Guardar' });
    if (!out) return;
    try { await api(`/api/cuotas/pagos/${m.pago_id}`, { method: 'PATCH', body: out }); toast('Cuota actualizada (también en Cuotas)'); await cargar(); } catch (x) { toast(x.message, false); }
  }

  async function resumen() {
    [res, pro] = await Promise.all([api(`/api/cajas/resumen${anio ? `?anio=${anio}` : ''}`), api(`/api/cajas/proyectado${anio ? `?anio=${anio}` : ''}`).catch(() => null)]);
    anio = res.anio;
    pintarCajas();
  }
  async function cargar() { await resumen(); pintarTabla(); }

  view.innerHTML = `<style>.ro-modo-cajita>:not([data-cajita]):not(style){display:none!important}.ro-cajas{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));margin-bottom:16px}
    .ro-caja{display:grid;gap:4px;text-align:left;padding:16px;border-radius:16px;border:2px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit}
    .ro-caja.on{border-color:var(--dw-p);background:linear-gradient(160deg,rgba(var(--dw-p-rgb),.12),var(--bs-body-bg) 70%)}.ro-caja.on i{color:var(--dw-p)}.ro-saldo{font-size:1.8rem;font-weight:700;font-variant-numeric:tabular-nums}
    .ro-rubros{display:grid;gap:8px;max-height:250px;overflow-y:auto;padding-right:4px}.ro-rubro{padding:8px 10px;border-radius:12px;border:1px solid var(--bs-border-color);background:rgba(var(--dw-p-rgb),.03)}
    .ro-ob{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ro-ob>div{flex:1;min-width:120px;padding:10px 12px;border-radius:12px;background:rgba(var(--dw-p-rgb),.06)}.ro-ob>i{color:var(--bs-secondary-color)}
    .ro-ob span{display:block;font-size:.75rem;color:var(--bs-secondary-color)}.ro-ob b{font-size:1.25rem;font-variant-numeric:tabular-nums}
    .ro-ob .ok{background:rgba(25,135,84,.12)}.ro-ob .ok b{color:var(--bs-success)}.ro-ob .bad{background:rgba(220,53,69,.12)}.ro-ob .bad b{color:var(--bs-danger)}</style>
    <div class="ro-cajas" data-cajas></div>
    <div class="row g-3 mb-3"><div class="col-md-7"><div class="dw-card h-100"><div class="d-flex align-items-center gap-2 mb-2" data-flujo-t></div><div data-flujo></div><div class="small text-body-secondary mt-1" data-tot></div></div></div>
      <div class="col-md-5"><div class="dw-card h-100 d-flex flex-column"><div data-otop></div><div class="ro-h mt-0" data-cats-t>Inversión del club · año rotario</div><div data-cats></div><div data-olista></div></div></div></div>
    <h2 class="h6 mb-2" data-tit></h2><div data-movs></div><div data-cajita></div>`;
  view.addEventListener('click', (e) => {
    const y = e.target.closest('[data-ay]'); if (y) { anio += Number(y.dataset.ay); return resumen(); }
    const rp = e.target.closest('[data-rpagar]'); if (rp) return pagarRubro(rp.dataset.rpagar);
    const re = e.target.closest('[data-reditar]'); if (re) return editarValor(re.dataset.reditar);
    if (e.target.closest('[data-ragregar]')) return agregar();
    const b = e.target.closest('[data-caja]'); if (!b || b.dataset.caja === caja) return;
    history.replaceState(null, '', `#${b.dataset.caja}`);
    nav?.querySelectorAll('a').forEach((x) => x.classList.toggle('on', x.dataset.club === b.dataset.caja));
    elegir(b.dataset.caja);
  });
  await cargar();
  if (cajita) elegir('cajita');
});
