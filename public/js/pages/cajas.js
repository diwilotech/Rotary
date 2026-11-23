// Finanzas: solo dos cajas. Arriba se elige la caja (Caja menor · Club o Caja mayor · Obras) y abajo se ven SUS movimientos,
// su flujo de los 12 meses del año rotario (julio a junio) y en qué se gasta. Cada caja tiene sus propias categorías. Traslados.
// «Proyectado» (#proyectado): la Caja menor mes a mes, con lo real y lo que se espera (cuotas de los socios, otros ingresos)
// frente a las obligaciones del club (cuota distrital que pone el distrito y gasto corriente). Ahí se paga la cuota distrital.
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
  let vista = location.hash === '#proyectado' ? 'proyectado' : 'caja';
  const elegir = (k) => {
    if (k === 'proyectado') { vista = k; return armar(); }
    const antes = vista; vista = 'caja'; caja = k; try { localStorage.setItem('ro_caja', caja); } catch (_) {}
    if (antes !== 'caja') return armar();
    if (res) { pintarCajas(); pintarTabla(); }
  };
  const nav = RO.nav(vista === 'proyectado' ? 'proyectado' : caja, elegir);

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
    // Caja menor: los meses que faltan se muestran con lo proyectado (rayado)
    const pm = caja === 'menor' && pro ? Object.fromEntries(pro.meses.map((m) => [m.mes, m])) : {};
    const filas = k.meses.map((x) => { const p = pm[x.mes]; return p?.proyectado && x.mes > res.mes ? { label: corto(x.mes), a: p.ingresos_proy, b: p.egresos_proy, projected: true } : { label: corto(x.mes), a: x.ingresos, b: x.egresos }; });
    view.querySelector('[data-flujo-t]').innerHTML = `<span class="ro-h m-0">Flujo del año rotario · julio a junio</span>${selAnio(res.nombre_anio)}`;
    C.bars(view.querySelector('[data-flujo]'), filas, { la: 'Ingresos', lb: 'Egresos' });
    view.querySelector('[data-tot]').innerHTML = `Año: <span class="text-success">+${C.money(k.meses.reduce((t, x) => t + x.ingresos, 0))}</span> · <span class="text-danger">−${C.money(k.meses.reduce((t, x) => t + x.egresos, 0))}</span>`;
    C.rank(view.querySelector('[data-cats]'), k.categorias.slice(0, 8).map((x) => ({ k: x.categoria, n: x.total })), C.money);
    if (!k.categorias.length) view.querySelector('[data-cats]').innerHTML = '<p class="small text-body-secondary mb-0">Sin gastos en este año rotario.</p>';
    view.querySelector('[data-tit]').innerHTML = `Movimientos · ${esc(k.nombre)}`;
  }

  /* ---------- Proyectado ---------- */
  const OEST = { pagada: ['ok', 'Pagada'], pendiente: ['soon', 'Pendiente'], vencida: ['bad', 'Vencida'] };
  function pintarProyectado() {
    const p = pro, fut = p.meses.filter((m) => m.proyectado), ultimo = fut.at(-1);
    const sum = (arr, k) => arr.reduce((t, m) => t + (m[k] || 0), 0);
    C.kpis(view.querySelector('[data-pk]'), [['Caja menor hoy', C.money(p.saldo_hoy), 'saldo real', 'bi-cup-hot'],
      ['Ingresos esperados', C.money(sum(fut, 'ingresos_proy')), `cuotas ${C.money(sum(fut, 'cuotas_socios'))} + otros`, 'bi-arrow-down-circle'],
      ['Obligaciones', C.money(sum(fut, 'obligaciones')), `+ gasto corriente ${C.money(sum(fut, 'gasto_corriente'))}`, 'bi-bank'],
      ['Saldo al cierre', ultimo ? `<span class="${ultimo.saldo_proy < 0 ? 'text-danger' : ''}">${C.money(ultimo.saldo_proy)}</span>` : '—', ultimo ? `junio ${p.anio + 1}` : 'año cerrado', 'bi-flag']]);
    view.querySelector('[data-pt]').innerHTML = `<span class="ro-h m-0">Caja menor mes a mes · real y proyectado</span>${selAnio(p.nombre)}`;
    C.bars(view.querySelector('[data-pb]'), p.meses.map((m) => (m.proyectado && m.mes > res.mes ? { label: corto(m.mes), a: m.ingresos_proy, b: m.egresos_proy, projected: true }
      : { label: corto(m.mes), a: m.ingresos + (m.proyectado ? m.ingresos_proy : 0), b: m.egresos + (m.proyectado ? m.egresos_proy : 0) })), { la: 'Ingresos', lb: 'Egresos' });
    const neg = (n) => (n < 0 ? 'text-danger' : '');
    view.querySelector('[data-ptab]').innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle mb-0 ro-ptab"><thead><tr><th>Mes</th><th class="text-end">Ingresos</th><th class="text-end">Egresos</th>
      <th class="text-end ro-pc">Ingresos proyectados</th><th class="text-end ro-pc">Egresos proyectados</th><th class="text-end ro-pc">Saldo proyectado</th></tr></thead>
      <tbody>${p.meses.map((m) => `<tr class="${m.mes === res.mes ? 'table-active' : ''}"><td class="text-capitalize">${C.monthName(m.mes)}</td><td class="text-end text-success">${m.ingresos ? C.money(m.ingresos) : '—'}</td><td class="text-end text-danger">${m.egresos ? C.money(m.egresos) : '—'}</td>
        <td class="text-end ro-pc" title="${m.proyectado ? `Cuotas ${C.money(m.cuotas_socios)} · otros ${C.money(m.otros_ingresos)}` : ''}">${m.proyectado ? C.money(m.ingresos_proy) : ''}</td>
        <td class="text-end ro-pc" title="${m.proyectado ? `Obligaciones ${C.money(m.obligaciones)} · gasto corriente ${C.money(m.gasto_corriente)}` : ''}">${m.proyectado ? `${C.money(m.egresos_proy)}${m.obligaciones ? ' <i class="bi bi-bank small" title="Incluye cuota distrital"></i>' : ''}` : ''}</td>
        <td class="text-end ro-pc fw-semibold ${neg(m.saldo_proy)}">${m.saldo_proy == null ? '' : C.money(m.saldo_proy)}</td></tr>`).join('')}</tbody>
      <tfoot><tr class="fw-semibold"><td>Total</td><td class="text-end text-success">${C.money(sum(p.meses, 'ingresos'))}</td><td class="text-end text-danger">${C.money(sum(p.meses, 'egresos'))}</td>
        <td class="text-end ro-pc">${C.money(sum(fut, 'ingresos_proy'))}</td><td class="text-end ro-pc">${C.money(sum(fut, 'egresos_proy'))}</td><td class="text-end ro-pc ${neg(ultimo?.saldo_proy || 0)}">${ultimo ? C.money(ultimo.saldo_proy) : ''}</td></tr></tfoot></table></div>`;
    // ¿En qué se gasta? Lo real del año + lo que viene
    const menor = res.cajas.find((x) => x.id === 'menor');
    C.rank(view.querySelector('[data-pcats]'), [...menor.categorias.map((x) => ({ k: x.categoria, n: x.total })),
      ...(sum(fut, 'obligaciones') ? [{ k: 'Cuota distrital (proyectado)', n: sum(fut, 'obligaciones') }] : []), ...(sum(fut, 'gasto_corriente') ? [{ k: 'Gasto corriente (proyectado)', n: sum(fut, 'gasto_corriente') }] : [])]
      .sort((a, b) => b.n - a.n).slice(0, 10), C.money);
    view.querySelector('[data-obl]').innerHTML = p.obligaciones.length ? p.obligaciones.map((o) => `<div class="d-flex align-items-center gap-2 py-2 border-bottom flex-wrap">
        <i class="bi bi-bank fs-5" style="color:var(--dw-p)"></i><div class="flex-grow-1 min-w-0"><b>${esc(o.nombre)}</b><div class="small text-body-secondary">Vence ${C.day(o.vence)} · ${C.money(o.valor_socio)} × ${o.socios} socios = <b>${C.money(o.total)}</b>${o.pagado ? ` · pagado ${C.money(o.pagado)}` : ''}</div></div>
        ${C.chip(...OEST[o.estado])}${W && o.saldo > 0 ? `<button class="btn btn-sm btn-primary" data-pagar="${o.id}">Pagar ${C.money(o.saldo)}</button>` : ''}</div>`).join('')
      : '<p class="small text-body-secondary mb-0">El distrito aún no ha puesto cuotas distritales.</p>';
    view.querySelector('[data-pnota]').innerHTML = `Cómo se calcula: cuotas que deben pagar los socios cada mes (según los periodos de Cuotas) + otros ingresos (promedio de los últimos 6 meses: ${C.money(p.promedio.otros_ingresos)}/mes),
      menos las cuotas distritales que vencen y el gasto corriente (promedio de 6 meses: ${C.money(p.promedio.gasto_corriente)}/mes). Parte del saldo real de hoy.`;
  }
  async function pagar(id) {
    const o = pro.obligaciones.find((x) => String(x.id) === id); if (!o) return;
    const out = await C.form({ title: `Pagar: ${o.nombre}`, fields: [{ k: 'monto', label: 'Monto', type: 'money', required: true }, { k: 'fecha', label: 'Fecha', type: 'date', required: true }],
      values: { monto: o.saldo, fecha: C.todayCo() }, okText: 'Registrar pago' });
    if (!out) return;
    try { await api(`/api/cajas/distrital/${o.id}/pagar`, { method: 'POST', body: out }); toast('Pagada: salió de la Caja menor'); await cargar(); } catch (x) { toast(x.message, false); }
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
    [res, pro] = await Promise.all([api(`/api/cajas/resumen${anio ? `?anio=${anio}` : ''}`), api(`/api/cajas/proyectado${anio ? `?anio=${anio}` : ''}`)]);
    anio = res.anio;
    if (vista === 'proyectado') pintarProyectado(); else pintarCajas();
  }
  async function cargar() { await resumen(); if (vista === 'caja') pintarTabla(); }

  const CSS = `<style>.ro-cajas{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));margin-bottom:16px}
    .ro-caja{display:grid;gap:4px;text-align:left;padding:16px;border-radius:16px;border:2px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit}
    .ro-caja.on{border-color:var(--dw-p);background:linear-gradient(160deg,rgba(var(--dw-p-rgb),.12),var(--bs-body-bg) 70%)}.ro-caja.on i{color:var(--dw-p)}.ro-saldo{font-size:1.8rem;font-weight:700;font-variant-numeric:tabular-nums}
    .ro-ptab{font-size:.85rem;font-variant-numeric:tabular-nums}.ro-ptab .ro-pc{background:rgba(var(--dw-p-rgb),.06)}.ro-ptab th{white-space:nowrap;font-size:.75rem;color:var(--bs-secondary-color)}</style>`;
  function armar() {
    acciones.hidden = vista === 'proyectado';
    view.innerHTML = vista === 'proyectado' ? `${CSS}<div class="dw-grid dw-grid--kpi mb-3" data-pk></div>
      <div class="row g-3 mb-3"><div class="col-lg-8"><div class="dw-card h-100"><div class="d-flex align-items-center gap-2 mb-2" data-pt></div><div data-pb></div>
        <div class="small text-body-secondary mt-1"><i class="bi bi-info-circle me-1"></i>Las barras rayadas son proyectadas.</div></div></div>
        <div class="col-lg-4"><div class="dw-card h-100"><div class="ro-h mt-0">¿En qué se gasta?</div><div data-pcats></div></div></div></div>
      <div class="dw-card mb-3 p-0 p-md-2" data-ptab></div>
      <div class="dw-card mb-3"><div class="ro-h mt-0">Obligaciones del club · cuota distrital</div><div data-obl></div></div>
      <p class="small text-body-secondary" data-pnota></p>`
      : `${CSS}<div class="ro-cajas" data-cajas></div>
      <div class="row g-3 mb-3"><div class="col-md-7"><div class="dw-card h-100"><div class="d-flex align-items-center gap-2 mb-2" data-flujo-t></div><div data-flujo></div><div class="small text-body-secondary mt-1" data-tot></div></div></div>
        <div class="col-md-5"><div class="dw-card h-100"><div class="ro-h mt-0">¿En qué se gasta? · año rotario</div><div data-cats></div></div></div></div>
      <h2 class="h6 mb-2" data-tit></h2><div data-movs></div>`;
    return cargar();
  }
  view.addEventListener('click', (e) => {
    const y = e.target.closest('[data-ay]'); if (y) { anio += Number(y.dataset.ay); return resumen(); }
    const pg = e.target.closest('[data-pagar]'); if (pg) return pagar(pg.dataset.pagar);
    const b = e.target.closest('[data-caja]'); if (!b || b.dataset.caja === caja) return;
    history.replaceState(null, '', `#${b.dataset.caja}`);
    nav?.querySelectorAll('a').forEach((x) => x.classList.toggle('on', x.dataset.club === b.dataset.caja));
    elegir(b.dataset.caja);
  });
  await armar();
});
