// Cobros del distrito a sus clubes: cuota distrital con descuentos y bonos, con los datos de pago (QR, llave, cuenta).
// Cuota: base = valor × socios que cuentan (o fija por club). Descuentos que pone el distrito:
//   · pronto pago: [{hasta, pct}] → si el club paga TODO (con ese descuento) hasta esa fecha; mientras la fecha no pase, el
//     precio vigente es el del descuento; pasada sin pagar, se cobra completo.
//   · planes: [{cuotas, pct}] → el club elige pagar en N cuotas (mensuales, la última en la fecha de vencimiento) con ese descuento.
// Se cobra el menor valor que aplique. Bonos: por socio (cantidad × socios), por club (cantidad) o asignados a mano.
import { HttpError } from './http.js';

const leer = (s, def) => { try { return JSON.parse(s || '') ?? def; } catch { return def; } };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const pctOk = (v) => Math.min(90, Math.max(0, Math.round(Number(v) || 0)));
const redondo = (n) => Math.round(n / 100) * 100;   // a centenas de peso

export function limpiarDescuentos(v) {
  const d = typeof v === 'object' && v ? v : {};
  const pronto = (Array.isArray(d.pronto) ? d.pronto : []).filter((x) => FECHA.test(x?.hasta) && pctOk(x.pct) > 0).map((x) => ({ hasta: x.hasta, pct: pctOk(x.pct) }))
    .sort((a, b) => a.hasta.localeCompare(b.hasta)).slice(0, 4);
  const planes = (Array.isArray(d.planes) ? d.planes : []).map((x) => ({ cuotas: Math.round(Number(x?.cuotas) || 0), pct: pctOk(x?.pct) }))
    .filter((x) => x.cuotas >= 2 && x.cuotas <= 12).filter((x, i, a) => a.findIndex((y) => y.cuotas === x.cuotas) === i).sort((a, b) => a.cuotas - b.cuotas).slice(0, 6);
  return pronto.length || planes.length ? { pronto, planes } : null;
}
export function limpiarPago(v, carpeta) {
  const p = typeof v === 'object' && v ? v : {}, t = (k, n = 120) => String(p[k] || '').trim().slice(0, n) || undefined;
  const qr = String(p.qr_key || '');
  if (qr && !qr.startsWith(carpeta)) throw new HttpError(400, 'El QR no es de este distrito');
  const o = { llave: t('llave'), banco: t('banco'), tipo_cuenta: t('tipo_cuenta', 40), numero: t('numero', 40), titular: t('titular'), documento: t('documento', 40), instrucciones: t('instrucciones', 600), qr_key: qr || undefined };
  return Object.values(o).some(Boolean) ? JSON.stringify(o) : null;
}
// Datos de pago para mostrar (sin la llave de R2: el QR se pide por su ruta)
export function pagoPublico(json, ruta) {
  const p = leer(json, null);
  if (!p) return null;
  const { qr_key: qr, ...resto } = p;
  return { ...resto, qr: qr ? ruta : null };
}

const sumarMeses = (iso, n) => { const [y, m, d] = iso.split('-').map(Number), f = new Date(Date.UTC(y, m - 1 + n, 1)); const ult = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ult)).padStart(2, '0')}`; };

// q = fila de ro_cuota_distrital; base = lo que le toca sin descuento; pagos = [{fecha, monto}] del club a esa cuota;
// plan = {cuotas, pct} elegido por el club o null; hoy = 'YYYY-MM-DD'
export function cobroCuota(q, base, pagos, plan, hoy) {
  const desc = leer(q.descuentos, null) || { pronto: [], planes: [] };
  const pagado = pagos.reduce((t, p) => t + p.monto, 0);
  const opciones = [{ total: base, motivo: null }];
  let oferta = null;
  for (const t of desc.pronto || []) {
    const monto = redondo(base * (1 - t.pct / 100)), hasta = pagos.filter((p) => p.fecha <= t.hasta).reduce((s, p) => s + p.monto, 0);
    if (hasta >= monto) opciones.push({ total: monto, motivo: `Pronto pago (${t.pct}% hasta ${t.hasta})` });
    else if (t.hasta >= hoy) { opciones.push({ total: monto, motivo: `Pronto pago (${t.pct}% hasta ${t.hasta})` }); if (!oferta) oferta = { ...t, monto, ahorro: base - monto }; }
  }
  const vigente = plan && (desc.planes || []).find((x) => x.cuotas === plan.cuotas);
  let cuotas = null;
  if (plan) {
    const pct = vigente ? vigente.pct : plan.pct, totalPlan = redondo(base * (1 - pct / 100)), n = plan.cuotas, una = redondo(totalPlan / n);
    opciones.push({ total: totalPlan, motivo: `Plan de ${n} cuotas${pct ? ` (${pct}%)` : ''}` });
    let acum = 0;
    cuotas = Array.from({ length: n }, (_, i) => { const monto = i === n - 1 ? totalPlan - una * (n - 1) : una; acum += monto; return { n: i + 1, fecha: sumarMeses(q.vence, i - (n - 1)), monto, pagada: pagado >= acum }; });
  }
  const mejor = opciones.reduce((a, b) => (b.total < a.total ? b : a));
  const total = mejor.total, saldo = Math.max(0, total - pagado);
  const proxima = cuotas?.find((c) => !c.pagada) || null;
  const estado = total > 0 && pagado >= total ? 'pagada' : (proxima ? proxima.fecha : q.vence) < hoy ? 'vencida' : 'pendiente';
  return { base, total, descuento: base - total, motivo: mejor.motivo, pagado, saldo, estado, oferta: estado === 'pagada' ? null : oferta,
    planes: desc.planes || [], pronto: desc.pronto || [], plan: plan ? { cuotas: plan.cuotas, pct: vigente ? vigente.pct : plan.pct } : null, cuotas_plan: cuotas,
    a_pagar: estado === 'pagada' ? 0 : aPagar(cuotas, pagado, saldo, hoy),
    proxima_fecha: proxima ? proxima.fecha : q.vence };
}

// Lo que toca pagar ahora: sin plan, el saldo; con plan, hasta la próxima cuota (más las vencidas) menos lo ya pagado
function aPagar(cuotas, pagado, saldo, hoy) {
  if (!cuotas) return saldo;
  const k = cuotas.findIndex((c) => !c.pagada);
  if (k < 0) return 0;
  let idx = k;
  cuotas.forEach((c, i) => { if (c.fecha < hoy) idx = Math.max(idx, i); });
  const hasta = cuotas.slice(0, idx + 1).reduce((t, c) => t + c.monto, 0);
  return Math.max(0, Math.min(saldo, hasta - pagado));
}

// Bonos que le tocan a un club: por socio, por club o asignados a mano por el distrito
export const asignadosBono = (b, socios, manual) => (b.reparto === 'por_socio' ? (b.cantidad || 0) * socios : b.reparto === 'por_club' ? (b.cantidad || 0) : (manual || 0));
