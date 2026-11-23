// Cuotas de los socios: arriba la cartera (cómo va cada socio) y abajo los ingresos de esas cuotas con su comprobante.
// Un pago verificado entra solo a la Caja menor (Club) como ingreso «Cuotas»; anularlo lo saca de la caja.
//   CRUD /api/cuotas/periodos                 (junta)   ·   POST /api/cuotas/periodos/generar { desde: 'AAAA-MM', hasta, monto, dia_vence? }
//   GET  /api/cuotas/cartera
//   GET  /api/cuotas/anio?anio=2026   año rotario (julio → junio): meses pagados por socio
//   GET  /api/cuotas/pagos?estado=            ingresos con su comprobante
//   POST /api/cuotas/pagos                    { socio_id, monto, fecha, metodo, observaciones }  la junta lo registra ya verificado
//   POST /api/cuotas/pagos/:id/comprobante    (cuerpo = foto o PDF)   ·   GET …/comprobante
//   POST /api/cuotas/pagos/:id/verificar · /rechazar { motivo } · /anular
//   GET  /api/cuotas/resumen
import { json, readJson, HttpError } from '../lib/http.js';
import { crud, all, one, today, cast, MONTH } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from '../lib/archivos.js';
import { cartera, anioRotario, anioRotarioDe } from '../lib/rotaract.js';

const MOD = 'cuotas';
export const METODOS = ['transferencia', 'nequi', 'daviplata', 'efectivo', 'bre-b', 'otro'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const nombreMes = (ym) => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const finDeMes = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);

export const ENTITIES = {
  periodos: { table: 'ro_periodos', label: 'el periodo', title: 'nombre', crear: 'manager', order: 'mes DESC',
    fields: { mes: 'month', nombre: 'text', monto: 'money', vence: 'date' },
    async beforeCreate(c, row) {
      if (!row.mes) throw new HttpError(400, 'Falta el mes');
      if (!(row.monto > 0)) throw new HttpError(400, 'El valor de la cuota debe ser mayor que cero');
      if (await one(c.env, 'SELECT 1 FROM ro_periodos WHERE business_id = ? AND mes = ?', c.businessId, row.mes)) throw new HttpError(409, 'Ese mes ya existe');
      row.nombre ||= nombreMes(row.mes); row.vence ||= finDeMes(row.mes);
    } },
};

// Un pago verificado = un ingreso en la caja menor (no se duplica).
async function aCaja(c, p, socio) {
  if (await one(c.env, 'SELECT 1 FROM ro_movimientos WHERE business_id = ? AND pago_id = ?', c.businessId, p.id)) return;
  const t = Date.now();
  await c.env.DB.prepare(`INSERT INTO ro_movimientos (business_id, caja, tipo, fecha, concepto, categoria, monto, socio_id, pago_id, comprobante_key, comprobante_url, registrado_por, created_at, updated_at)
    VALUES (?, 'menor', 'ingreso', ?, ?, 'Cuotas', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, p.fecha, `Cuota · ${socio?.nombre || 'socio'}`, p.monto, p.socio_id, p.id, null, p.comprobante_url || null, c.session.user_id, t, t).run();
}

async function pagoOr404(c, id) {
  const p = await one(c.env, 'SELECT * FROM ro_pagos WHERE id = ? AND business_id = ?', Number(id) || 0, c.businessId);
  if (!p) throw new HttpError(404, 'Pago no encontrado');
  return p;
}
const socioOf = (c, id) => one(c.env, 'SELECT id, nombre, user_id FROM ro_socios WHERE id = ? AND business_id = ?', id, c.businessId);

// Lo usa también «Lo tuyo»: un socio reporta su pago (queda pendiente de verificar).
export async function nuevoPago(c, b, { socioId, verificado }) {
  const monto = cast('monto', 'money', b.monto), fecha = cast('fecha', 'date', b.fecha || today());
  if (!(monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
  if (fecha > today()) throw new HttpError(400, 'La fecha del pago no puede ser futura');
  const metodo = cast('metodo', METODOS, b.metodo || 'transferencia'), obs = cast('observaciones', 'long', b.observaciones);
  const socio = await socioOf(c, socioId);
  if (!socio) throw new HttpError(400, 'Socio no válido');
  const t = Date.now();
  const res = await c.env.DB.prepare(`INSERT INTO ro_pagos (business_id, socio_id, monto, fecha, metodo, estado, observaciones, subido_por, verificado_por, verificado_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(c.businessId, socio.id, monto, fecha, metodo, verificado ? 'verificado' : 'pendiente', obs, c.session.user_id, verificado ? c.session.user_id : null, verificado ? t : null, t, t).run();
  const p = await pagoOr404(c, res.meta.last_row_id);
  if (verificado) await aCaja(c, p, socio);
  await audit(c, `${verificado ? 'Registró' : 'Reportó'} un pago de cuota de ${socio.nombre} por $${monto.toLocaleString('es-CO')}`, { modulo: MOD });
  return p;
}
export async function subirComprobante(c, p) {
  if (p.estado === 'anulado') throw new HttpError(409, 'El pago está anulado');
  const f = await guardarArchivo(c, 'cuotas');
  await c.env.DB.prepare('UPDATE ro_pagos SET comprobante_key = ?, comprobante_mime = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(f.key, f.mime, Date.now(), p.id, c.businessId).run();
  await borrarArchivo(c.env, p.comprobante_key);
  return { ok: true };
}
export function servirComprobante(c, p) {
  if (!p.comprobante_key && p.comprobante_url && /^https:\/\//.test(p.comprobante_url)) return Response.redirect(p.comprobante_url, 302);
  return servirArchivo(c, { key: p.comprobante_key, mime: p.comprobante_mime || 'image/jpeg', nombre: `comprobante-cuota-${p.id}` });
}

export async function pagosDe(c, { estado, socioId } = {}) {
  const w = ['p.business_id = ?'], a = [c.businessId];
  if (estado) { w.push('p.estado = ?'); a.push(estado); }
  if (socioId) { w.push('p.socio_id = ?'); a.push(socioId); }
  const rows = await all(c.env, `SELECT p.*, s.nombre socio FROM ro_pagos p LEFT JOIN ro_socios s ON s.id = p.socio_id AND s.business_id = p.business_id WHERE ${w.join(' AND ')} ORDER BY p.fecha DESC, p.id DESC LIMIT 1000`, ...a);
  return rows.map(({ comprobante_key, origen_id, ...p }) => ({ ...p, comprobante: !!(comprobante_key || p.comprobante_url) }));
}

export function routes(r) {
  crud(r, { base: '/api/cuotas', modulo: MOD, entities: ENTITIES });

  r.post('/api/cuotas/periodos/generar', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    if (!MONTH.test(b.desde || '') || !MONTH.test(b.hasta || '') || b.hasta < b.desde) throw new HttpError(400, 'Indica desde y hasta (AAAA-MM)');
    const monto = cast('monto', 'money', b.monto);
    if (!(monto > 0)) throw new HttpError(400, 'El valor de la cuota debe ser mayor que cero');
    const t = Date.now(), stmts = [];
    for (let ym = b.desde; ym <= b.hasta && stmts.length < 36;) {
      stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO ro_periodos (business_id, mes, nombre, monto, vence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(c.businessId, ym, nombreMes(ym), monto, finDeMes(ym), t, t));
      const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 1)); ym = d.toISOString().slice(0, 7);
    }
    const res = await c.env.DB.batch(stmts);
    const creados = res.reduce((s, x) => s + (x.meta?.changes || 0), 0);
    await audit(c, `Generó ${creados} periodos de cuota`, { modulo: MOD });
    return json({ creados });
  });

  r.get('/api/cuotas/cartera', `manager:${MOD}`, async (c) => json({ rows: await cartera(c) }));
  r.get('/api/cuotas/anio', `manager:${MOD}`, async (c) => {
    const a = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    if (a < 2000 || a > 2100) throw new HttpError(400, 'Año rotario no válido');
    return json(await anioRotario(c, a));
  });
  r.get('/api/cuotas/pagos', `manager:${MOD}`, async (c) => json({ rows: await pagosDe(c, { estado: c.url.searchParams.get('estado') || null }) }));
  r.post('/api/cuotas/pagos', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req);
    return json(await nuevoPago(c, b, { socioId: Number(b.socio_id), verificado: b.verificado !== false }), 201);
  });
  r.post('/api/cuotas/pagos/:id/comprobante', `manager:${MOD}`, async (c) => json(await subirComprobante(c, await pagoOr404(c, c.params.id))));
  r.get('/api/cuotas/pagos/:id/comprobante', `manager:${MOD}`, async (c) => servirComprobante(c, await pagoOr404(c, c.params.id)));

  // Editar un pago (monto, fecha, método, observaciones): solo quien tiene Cuotas. Si ya entró a la Caja menor, el ingreso se ajusta.
  r.patch('/api/cuotas/pagos/:id', `manager:${MOD}`, async (c) => {
    const p = await pagoOr404(c, c.params.id), b = await readJson(c.req);
    if (p.estado === 'anulado') throw new HttpError(409, 'El pago está anulado');
    const o = {};
    if ('monto' in b) { o.monto = cast('monto', 'money', b.monto); if (!(o.monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero'); }
    if ('fecha' in b) { o.fecha = cast('fecha', 'date', b.fecha); if (!o.fecha || o.fecha > today()) throw new HttpError(400, 'La fecha del pago no puede ser futura'); }
    if ('metodo' in b) o.metodo = cast('metodo', METODOS, b.metodo);
    if ('observaciones' in b) o.observaciones = cast('observaciones', 'long', b.observaciones);
    const ks = Object.keys(o); if (!ks.length) return json({ ok: true });
    const t = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE ro_pagos SET ${ks.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND business_id = ?`).bind(...ks.map((k) => o[k]), t, p.id, c.businessId),
      c.env.DB.prepare('UPDATE ro_movimientos SET monto = ?, fecha = ?, updated_at = ? WHERE business_id = ? AND pago_id = ?').bind(o.monto ?? p.monto, o.fecha ?? p.fecha, t, c.businessId, p.id),
    ]);
    await audit(c, `Editó un pago de cuota (${ks.join(', ')})`, { modulo: MOD });
    return json({ ok: true });
  });

  r.post('/api/cuotas/pagos/:id/verificar', `manager:${MOD}`, async (c) => {
    const p = await pagoOr404(c, c.params.id);
    if (p.estado === 'verificado') return json({ ok: true });
    if (p.estado === 'anulado') throw new HttpError(409, 'El pago está anulado');
    await c.env.DB.prepare("UPDATE ro_pagos SET estado = 'verificado', verificado_por = ?, verificado_at = ?, motivo_rechazo = NULL, updated_at = ? WHERE id = ? AND business_id = ?").bind(c.session.user_id, Date.now(), Date.now(), p.id, c.businessId).run();
    const s = await socioOf(c, p.socio_id);
    await aCaja(c, p, s);
    await audit(c, `Verificó el pago de cuota de ${s?.nombre || ''} por $${p.monto.toLocaleString('es-CO')}`, { modulo: MOD });
    return json({ ok: true });
  });
  r.post('/api/cuotas/pagos/:id/rechazar', `manager:${MOD}`, async (c) => {
    const p = await pagoOr404(c, c.params.id);
    if (p.estado !== 'pendiente') throw new HttpError(409, 'Solo se rechaza un pago pendiente');
    const motivo = cast('motivo', 'text', (await readJson(c.req)).motivo);
    if (!motivo) throw new HttpError(400, 'Escribe el motivo para que el socio sepa qué corregir');
    await c.env.DB.prepare("UPDATE ro_pagos SET estado = 'rechazado', motivo_rechazo = ?, updated_at = ? WHERE id = ? AND business_id = ?").bind(motivo, Date.now(), p.id, c.businessId).run();
    await audit(c, 'Rechazó un pago de cuota', { modulo: MOD, detalle: motivo });
    return json({ ok: true });
  });
  r.post('/api/cuotas/pagos/:id/anular', `manager:${MOD}`, async (c) => {
    const p = await pagoOr404(c, c.params.id);
    if (p.estado === 'anulado') return json({ ok: true });
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE ro_pagos SET estado = 'anulado', updated_at = ? WHERE id = ? AND business_id = ?").bind(Date.now(), p.id, c.businessId),
      c.env.DB.prepare('DELETE FROM ro_movimientos WHERE business_id = ? AND pago_id = ?').bind(c.businessId, p.id),
    ]);
    await audit(c, `Anuló un pago de cuota por $${p.monto.toLocaleString('es-CO')}`, { modulo: MOD });
    return json({ ok: true });
  });

  r.get('/api/cuotas/resumen', `manager:${MOD}`, async (c) => {
    const k = await cartera(c);
    const pend = (await one(c.env, "SELECT COUNT(*) n FROM ro_pagos WHERE business_id = ? AND estado = 'pendiente'", c.businessId)).n;
    const mes = (await one(c.env, "SELECT COALESCE(SUM(monto), 0) t FROM ro_pagos WHERE business_id = ? AND estado = 'verificado' AND substr(fecha, 1, 7) = ?", c.businessId, today().slice(0, 7))).t;
    return json({ valor: k.filter((x) => x.estado === 'debe').length, al_dia: k.filter((x) => x.estado !== 'debe').length, deben: k.filter((x) => x.estado === 'debe').length,
      por_cobrar: k.reduce((s, x) => s + x.saldo, 0), vencido: k.reduce((s, x) => s + x.vencido, 0), recaudo_mes: mes, por_verificar: pend });
  });
}
