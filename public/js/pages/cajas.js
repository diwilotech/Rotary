// Finanzas: solo dos cajas. Arriba se elige la caja (Caja menor · Club o Caja mayor · Obras) y abajo se ven SUS movimientos,
// su flujo del mes y su gasto por categoría. Cada caja tiene sus propias categorías. Traslados entre cajas.
DW.ready.then(async (me) => {
  if (!me.pageAllowed) return;
  const { api, esc, toast } = window.App;
  const C = window.App.Crud, RO = window.RO;
  const view = document.querySelector('[data-view]'), acciones = document.querySelector('[data-acciones]');
  const W = !me.business.readOnly;
  const [cat, proys] = await Promise.all([api('/api/cajas/categorias'), me.modules.some((m) => m.id === 'impacto') ? RO.proyectos() : []]);
  const ICON = { menor: 'bi-cup-hot', mayor: 'bi-bricks' };
  let caja = ['menor', 'mayor'].includes(location.hash.slice(1)) ? location.hash.slice(1) : (() => { try { return localStorage.getItem('ro_caja') || 'menor'; } catch (_) { return 'menor'; } })(), res = null, tabla = null;
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

  function pintarCajas() {
    view.querySelector('[data-cajas]').innerHTML = res.cajas.map((k) => `<button type="button" class="ro-caja ${k.id === caja ? 'on' : ''}" data-caja="${k.id}">
      <span class="d-flex align-items-center gap-2"><i class="bi ${ICON[k.id]} fs-4"></i><b>${esc(k.nombre)}</b>${k.id === caja ? '<i class="bi bi-check-circle-fill ms-auto"></i>' : ''}</span>
      <span class="ro-saldo ${k.saldo < 0 ? 'text-danger' : ''}">${C.money(k.saldo)}</span>
      <span class="small">Este mes: <span class="text-success">+${C.money(k.ingresos_mes)}</span> · <span class="text-danger">−${C.money(k.egresos_mes)}</span></span></button>`).join('');
    const k = res.cajas.find((x) => x.id === caja);
    C.bars(view.querySelector('[data-flujo]'), k.meses.map((x) => ({ label: C.monthName(x.mes), a: x.ingresos, b: x.egresos })), { la: 'Ingresos', lb: 'Egresos' });
    C.rank(view.querySelector('[data-cats]'), k.categorias.slice(0, 8).map((x) => ({ k: x.categoria, n: x.total })), C.money);
    view.querySelector('[data-tit]').innerHTML = `Movimientos · ${esc(k.nombre)}`;
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

  async function resumen() { res = await api('/api/cajas/resumen'); pintarCajas(); }
  async function cargar() { await resumen(); pintarTabla(); }

  view.innerHTML = `<style>.ro-cajas{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));margin-bottom:16px}
    .ro-caja{display:grid;gap:4px;text-align:left;padding:16px;border-radius:16px;border:2px solid var(--bs-border-color);background:var(--bs-body-bg);color:inherit}
    .ro-caja.on{border-color:var(--dw-p);background:linear-gradient(160deg,rgba(var(--dw-p-rgb),.12),var(--bs-body-bg) 70%)}.ro-caja.on i{color:var(--dw-p)}.ro-saldo{font-size:1.8rem;font-weight:700;font-variant-numeric:tabular-nums}</style>
    <div class="ro-cajas" data-cajas></div>
    <div class="row g-3 mb-3"><div class="col-md-7"><div class="dw-card h-100"><div class="ro-h mt-0">Flujo de los últimos meses</div><div data-flujo></div></div></div>
      <div class="col-md-5"><div class="dw-card h-100"><div class="ro-h mt-0">¿En qué se gasta?</div><div data-cats></div></div></div></div>
    <h2 class="h6 mb-2" data-tit></h2><div data-movs></div>`;
  view.querySelector('[data-cajas]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-caja]'); if (!b || b.dataset.caja === caja) return;
    history.replaceState(null, '', `#${b.dataset.caja}`);
    nav?.querySelectorAll('a').forEach((x) => x.classList.toggle('on', x.dataset.club === b.dataset.caja));
    elegir(b.dataset.caja);
  });
  await cargar();
});
