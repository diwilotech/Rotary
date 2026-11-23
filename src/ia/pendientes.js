// Pendientes del club para la IA proactiva (botón «IA Diwilo» → «Lo de hoy»). Los pide el módulo central de IA por ctx.propias.pendientes().
// Cada uno: { id, nivel: mala|aviso|info, icono, texto, ruta, pregunta }. Sin IA: son consultas a la base.
import { all, one, today } from '../lib/crud.js';
import { cartera } from '../lib/rotaract.js';

const peso = (n) => `$${Math.round(n || 0).toLocaleString('es-CO')}`;
const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export async function pendientesDe(c, activos, alcanza) {
  const out = [], seguro = async (f) => { try { await f(); } catch (e) { console.error('pendientes', e.message); } };
  const tiene = (m, rol = 'staff') => activos.has(m) && alcanza(rol);
  if (tiene('cuotas', 'admin')) {
    await seguro(async () => {
      const n = (await one(c.env, "SELECT COUNT(*) n FROM ro_pagos WHERE business_id = ? AND estado = 'pendiente'", c.businessId)).n;
      if (n) out.push({ id: 'ro-pagos', nivel: 'aviso', icono: 'bi-receipt', texto: `${pl(n, 'pago de cuota espera', 'pagos de cuota esperan')} verificación`, ruta: '/staff/cuotas.html', pregunta: 'Muéstrame los pagos de cuota por verificar' });
    });
    await seguro(async () => {
      const d = (await cartera(c)).filter((x) => x.estado === 'debe');
      if (d.length) out.push({ id: 'ro-cartera', nivel: 'mala', icono: 'bi-wallet2', texto: `${pl(d.length, 'socio debe', 'socios deben')} cuotas por ${peso(d.reduce((s, x) => s + x.saldo, 0))}`, ruta: '/staff/cuotas.html', pregunta: '¿Quién debe cuotas y cuánto?' });
    });
  }
  if (tiene('tareas')) await seguro(async () => {
    const n = (await one(c.env, "SELECT COUNT(*) n FROM ro_tareas WHERE business_id = ? AND estado IN ('pendiente','en_curso') AND fecha_limite < ?", c.businessId, today())).n;
    if (n) out.push({ id: 'ro-tareas', nivel: 'aviso', icono: 'bi-kanban', texto: pl(n, 'tarea vencida', 'tareas vencidas'), ruta: '/staff/tareas.html', pregunta: '¿Qué tareas están vencidas y de quién son?' });
  });
  if (tiene('reuniones')) await seguro(async () => {
    const h = await all(c.env, "SELECT titulo, hora_ini FROM ro_reuniones WHERE business_id = ? AND fecha = ? AND estado <> 'cancelada' ORDER BY hora_ini", c.businessId, today());
    if (h.length) out.push({ id: 'ro-hoy', nivel: 'info', icono: 'bi-calendar-event', texto: `Hoy: ${h.map((x) => `${x.hora_ini || ''} ${x.titulo}`.trim()).join(' · ')}`, ruta: '/staff/reuniones.html', pregunta: '¿Quién confirmó para la reunión de hoy?' });
  });
  return out;
}
