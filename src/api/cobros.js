// Datos de pago del distrito (QR de cada cuota o bono) y lo que el club hace con sus cobros desde la Caja menor.
//   Distrito: POST /api/distrito/cobros/qr (imagen cruda → {key}; se guarda luego en el `pago` de la cuota o el bono)
//   Club y distrito: GET /api/cobros/qr?cuota=ID | ?bono=ID (el QR; solo los clubes de ese distrito o el mismo distrito)
//   Club: POST /api/cajas/distrital/:id/plan {cuotas} (plan de pago; 1 o 0 = de contado) · POST /api/cajas/bonos/:id/pagar {monto, fecha}
import { json, readJson, HttpError } from '../lib/http.js';
import { one, cast, today } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { guardarArchivo, servirArchivo } from '../lib/archivos.js';
import { distritoDe, bonosClub, RUBRO_BONOS } from '../lib/rotaract.js';
import { distritoOError } from './distrito.js';

const leer = (s) => { try { return JSON.parse(s || '') || {}; } catch { return {}; } };

export function routes(r) {
  r.post('/api/distrito/cobros/qr', 'manager', async (c) => {
    await distritoOError(c);
    const f = await guardarArchivo(c, 'distrito-qr', { max: 2 * 1024 * 1024 });
    if (!f.mime.startsWith('image/')) { await c.env.FILES.delete(f.key); throw new HttpError(400, 'El QR debe ser una imagen (JPG, PNG o WebP)'); }
    return json({ key: f.key }, 201);
  });
  r.get('/api/cobros/qr', 'tenant', async (c) => {
    const q = c.url.searchParams, d = await distritoDe(c.env, c.businessId);
    const tabla = q.get('cuota') ? 'ro_cuota_distrital' : q.get('bono') ? 'ro_bonos' : null;
    if (!tabla) throw new HttpError(400, 'Falta la cuota o el bono');
    const x = await one(c.env, `SELECT business_id, distrito, pago FROM ${tabla} WHERE id = ?`, Number(q.get('cuota') || q.get('bono')) || 0);
    if (!x || (x.business_id !== c.businessId && x.distrito !== d.clave)) throw new HttpError(404, 'No encontrado');
    const key = leer(x.pago).qr_key;
    return servirArchivo(c, { key, mime: /\.png$/.test(key || '') ? 'image/png' : /\.webp$/.test(key || '') ? 'image/webp' : 'image/jpeg', nombre: 'qr-de-pago' });
  });

  r.post('/api/cajas/distrital/:id/plan', 'manager:cajas', async (c) => {
    const { clave } = await distritoDe(c.env, c.businessId), b = await readJson(c.req);
    const q = await one(c.env, 'SELECT id, nombre, descuentos FROM ro_cuota_distrital WHERE id = ? AND distrito = ?', Number(c.params.id) || 0, clave);
    if (!q) throw new HttpError(404, 'Cuota distrital no encontrada');
    const n = Math.round(Number(b.cuotas) || 0);
    if (n <= 1) {
      await c.env.DB.prepare('DELETE FROM ro_cuota_plan_club WHERE cuota_id = ? AND club_id = ?').bind(q.id, c.businessId).run();
      await audit(c, `Pagará de contado «${q.nombre}»`, { modulo: 'cajas' });
      return json({ ok: true });
    }
    const plan = (leer(q.descuentos).planes || []).find((x) => x.cuotas === n);
    if (!plan) throw new HttpError(400, 'El distrito no ofrece ese plan de pago');
    await c.env.DB.prepare(`INSERT INTO ro_cuota_plan_club (cuota_id, club_id, cuotas, pct, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(cuota_id, club_id) DO UPDATE SET cuotas = excluded.cuotas, pct = excluded.pct, updated_at = excluded.updated_at`).bind(q.id, c.businessId, n, plan.pct, Date.now()).run();
    await audit(c, `Eligió pagar «${q.nombre}» en ${n} cuotas`, { modulo: 'cajas' });
    return json({ ok: true });
  });
  r.post('/api/cajas/bonos/:id/pagar', 'manager:cajas', async (c) => {
    const b = await readJson(c.req), bono = (await bonosClub(c.env, c.businessId)).find((x) => x.id === Number(c.params.id));
    if (!bono) throw new HttpError(404, 'Bono no encontrado');
    const monto = cast('monto', 'money', b.monto), fecha = cast('fecha', 'date', b.fecha || today());
    if (!(monto > 0)) throw new HttpError(400, 'El monto debe ser mayor que cero');
    const t = Date.now();
    const x = await c.env.DB.prepare(`INSERT INTO ro_movimientos (business_id, caja, tipo, fecha, concepto, categoria, monto, bono_id, registrado_por, created_at, updated_at)
      VALUES (?, 'menor', 'egreso', ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, fecha, `Bonos del distrito: ${bono.nombre}`, RUBRO_BONOS, monto, bono.id, c.session.user_id, t, t).run();
    await audit(c, `Pagó ${monto} del bono «${bono.nombre}»`, { modulo: 'cajas' });
    return json({ id: x.meta.last_row_id }, 201);
  });
}
