// Utilidades comunes de CD Rotaract: orden de los cargos de la junta, el socio de la sesión, cartera de cuotas,
// saldos de las dos cajas y el certificado de activación (HTML listo para imprimir o guardar como PDF).
import { HttpError } from './http.js';
import { all, one, today } from './crud.js';

export const CAJAS = { menor: 'Caja menor (Club)', mayor: 'Caja mayor (Obras)' };
// Categorías sugeridas por caja: cada caja tiene su flujo (se puede escribir otra).
export const CATEGORIAS = {
  menor: { ingreso: ['Cuotas', 'Donaciones al club', 'Eventos y rifas', 'Traslado', 'Otros ingresos'], egreso: ['Obligaciones RI y Distrito', 'Reconocimiento y protocolo', 'Bonos distritales', 'Camisetas del club', 'Pines', 'Refrigerios', 'Papelería e imagen', 'Logística de reuniones', 'Traslado', 'Otros gastos'] },
  mayor: { ingreso: ['Donaciones para obras', 'Financiación externa', 'Recaudo de actividades', 'Traslado', 'Otros ingresos'], egreso: ['Materiales de obra', 'Transporte', 'Alimentación de jornada', 'Logística de obra', 'Traslado', 'Otros gastos'] },
};

// Orden oficial de la junta: Presidencia, Vicepresidencia, Secretaría, Tesorería, Direcciones, Comités; sin cargo al final.
export function cargoOrden(cargo) {
  const c = String(cargo || '').toLowerCase().trim();
  if (!c || c === 'socio' || c === 'socia') return 99;
  if (/^presidente?\/?a? (del|de) club|^presidente?\/?a?$/.test(c) || c.startsWith('presidente/a del club')) return 1;
  if (c.includes('vicepresident')) return 2;
  if (c.includes('secretari')) return 3;
  if (c.includes('tesorer')) return 4;
  if (c.includes('director')) return 5;
  if (c.includes('comit') || c.includes('coordinador') || c.includes('president')) return 6;
  return 7;
}
export const esJunta = (cargo) => cargoOrden(cargo) < 99;

// Ficha de socio de quien tiene la sesión (por usuario; si no está enlazada, por correo y la enlaza).
export async function socioDeSesion(c) {
  let s = await one(c.env, 'SELECT * FROM ro_socios WHERE business_id = ? AND user_id = ?', c.businessId, c.session.user_id);
  if (!s && c.session.email) {
    s = await one(c.env, "SELECT * FROM ro_socios WHERE business_id = ? AND user_id IS NULL AND lower(email) = lower(?) AND estado <> 'retirado'", c.businessId, c.session.email);
    if (s) { await c.env.DB.prepare('UPDATE ro_socios SET user_id = ?, updated_at = ? WHERE id = ? AND business_id = ?').bind(c.session.user_id, Date.now(), s.id, c.businessId).run(); s.user_id = c.session.user_id; }
  }
  return s || null;
}
export async function socioDeSesionOError(c) {
  const s = await socioDeSesion(c);
  if (!s) throw new HttpError(404, 'Tu usuario no está enlazado a una ficha de socio. Pídele a la junta que te dé acceso desde Socios.', 'SIN_FICHA');
  return s;
}

// Cartera: por socio que paga cuota, lo esperado (periodos vencidos o del mes desde su ingreso) contra lo pagado y verificado.
// Quién paga cuota (condición SQL sobre ro_socios, sin alias): socios activos y la junta siempre; aspirantes y honorarios
// solo si el club lo decide (ro_club_config.cuota_aspirantes / cuota_honorarios). Externos y voluntarios nunca.
// paga_cuota = 0 en la ficha sigue sirviendo para eximir a alguien.
const CFG = (col) => `COALESCE((SELECT k.${col} FROM ro_club_config k WHERE k.business_id = ro_socios.business_id), 0) = 1`;
export const PAGA_CUOTA = `ro_socios.paga_cuota = 1 AND (
  (ro_socios.estado = 'activo' AND (ro_socios.tipo_membresia = 'socio' OR (COALESCE(ro_socios.cargo, '') <> '' AND lower(ro_socios.cargo) NOT IN ('socio', 'socia'))))
  OR (ro_socios.estado = 'activo' AND ro_socios.tipo_membresia = 'honorario' AND ${CFG('cuota_honorarios')})
  OR ((ro_socios.estado = 'aspirante' OR (ro_socios.estado = 'activo' AND ro_socios.tipo_membresia = 'aspirante')) AND ${CFG('cuota_aspirantes')}))`;
export async function configCuota(env, bid) {
  const r = await one(env, 'SELECT cuota_aspirantes, cuota_honorarios FROM ro_club_config WHERE business_id = ?', bid);
  return { aspirantes: !!r?.cuota_aspirantes, honorarios: !!r?.cuota_honorarios };
}

export async function cartera(c, socioId = null) {
  const hoy = today(), mesHoy = hoy.slice(0, 7);
  const [socios, periodos, pagos] = await Promise.all([
    all(c.env, `SELECT id, nombre, cargo, tipo_membresia, estado, fecha_ingreso, foto_key, foto_url FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA} ${socioId ? 'AND id = ?' : ''} ORDER BY nombre`, c.businessId, ...(socioId ? [socioId] : [])),
    all(c.env, 'SELECT mes, monto, vence FROM ro_periodos WHERE business_id = ? AND mes <= ? ORDER BY mes', c.businessId, mesHoy),
    all(c.env, `SELECT socio_id, SUM(monto) total, MAX(fecha) ultimo FROM ro_pagos WHERE business_id = ? AND estado = 'verificado' GROUP BY socio_id`, c.businessId),
  ]);
  return socios.map((s) => {
    const desde = (s.fecha_ingreso || '').slice(0, 7);
    const debidos = periodos.filter((p) => !desde || p.mes >= desde);
    const esperado = debidos.reduce((t, p) => t + p.monto, 0);
    const vencido = debidos.filter((p) => (p.vence || `${p.mes}-28`) < hoy).reduce((t, p) => t + p.monto, 0);
    const pg = pagos.find((x) => x.socio_id === s.id);
    const pagado = pg?.total || 0, saldo = Math.max(0, esperado - pagado);
    const estado = pagado >= esperado ? (pagado > esperado ? 'adelantado' : 'al_dia') : pagado >= vencido ? 'por_vencer' : 'debe';
    return { socio_id: s.id, nombre: s.nombre, cargo: s.cargo, tipo: s.tipo_membresia, fecha_ingreso: s.fecha_ingreso, desde: debidos[0]?.mes || null, foto: s.foto_key || s.foto_url ? `/api/socios/foto/${s.id}` : null, esperado, pagado, saldo, a_favor: Math.max(0, pagado - esperado), vencido: Math.max(0, vencido - pagado), estado, ultimo_pago: pg?.ultimo || null, periodos: debidos.length };
  });
}

// Año rotario (julio → junio): por socio, qué meses quedan cubiertos. Los pagos verificados se aplican en orden a los
// periodos desde su ingreso (el más viejo primero), así un pago de varios meses llena varias casillas.
// Casilla: pagado | parcial | debe (vencido) | pendiente (aún no vence) | na (sin periodo o antes de su ingreso).
export const anioRotarioDe = (iso) => { const [y, m] = String(iso).slice(0, 7).split('-').map(Number); return m >= 7 ? y : y - 1; };
export const mesesDelAnio = (anio) => Array.from({ length: 12 }, (_, i) => { const m = ((6 + i) % 12) + 1; return `${anio + (m < 7 ? 1 : 0)}-${String(m).padStart(2, '0')}`; });
export async function anioRotario(c, anio, socioId = null) {
  const hoy = today(), meses = mesesDelAnio(anio);
  const [socios, periodos, pagos, pend] = await Promise.all([
    all(c.env, `SELECT id, nombre, cargo, fecha_ingreso, foto_key, foto_url FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA} ${socioId ? 'AND id = ?' : ''} ORDER BY nombre`, c.businessId, ...(socioId ? [socioId] : [])),
    all(c.env, 'SELECT mes, monto, vence FROM ro_periodos WHERE business_id = ? ORDER BY mes', c.businessId),
    all(c.env, "SELECT socio_id, SUM(monto) total FROM ro_pagos WHERE business_id = ? AND estado = 'verificado' GROUP BY socio_id", c.businessId),
    all(c.env, "SELECT socio_id, COUNT(*) n FROM ro_pagos WHERE business_id = ? AND estado = 'pendiente' GROUP BY socio_id", c.businessId),
  ]);
  const totales = meses.map((mes) => ({ mes, monto: periodos.find((p) => p.mes === mes)?.monto ?? null, esperado: 0, recaudado: 0 }));
  const rows = socios.map((s) => {
    const desde = (s.fecha_ingreso || '').slice(0, 7);
    let resto = pagos.find((x) => x.socio_id === s.id)?.total || 0;
    const cubierto = {};
    for (const p of periodos) { if (desde && p.mes < desde) continue; const a = Math.min(resto, p.monto); cubierto[p.mes] = [a, p]; resto -= a; }
    const celdas = meses.map((mes, i) => {
      const x = cubierto[mes]; if (!x) return { mes, estado: 'na' };
      const [aplicado, p] = x;
      totales[i].esperado += p.monto; totales[i].recaudado += aplicado;
      const estado = aplicado >= p.monto ? 'pagado' : (p.vence || `${p.mes}-28`) < hoy ? 'debe' : aplicado ? 'parcial' : 'pendiente';
      return { mes, estado, aplicado, monto: p.monto };
    });
    return { socio_id: s.id, nombre: s.nombre, cargo: s.cargo, foto: s.foto_key || s.foto_url ? `/api/socios/foto/${s.id}` : null, celdas, a_favor: resto,
      pagados: celdas.filter((x) => x.estado === 'pagado').length, por_verificar: pend.find((x) => x.socio_id === s.id)?.n || 0 };
  });
  const anios = [...new Set([anioRotarioDe(hoy), ...periodos.map((p) => anioRotarioDe(p.mes))])].sort();
  return { anio, nombre: `${anio}-${anio + 1}`, actual: anioRotarioDe(hoy), anios, meses: totales, rows };
}

/* ---------------- Distrito ---------------- */
// Código de distrito del negocio (lo pone Diwilo; por defecto DISTRITO_DEFECTO) y si el negocio ES el distrito.
export async function distritoDe(env, businessId) {
  const r = await one(env, 'SELECT distrito, es_distrito FROM ro_club_config WHERE business_id = ?', businessId);
  return { codigo: r?.distrito || env.DISTRITO_DEFECTO || '4271', es_distrito: !!r?.es_distrito };
}
// Clubes del distrito: los negocios activos con ese código que no son distritos.
export async function clubesDelDistrito(env, codigo) {
  const def = env.DISTRITO_DEFECTO || '4271';
  return all(env, `SELECT b.id, b.name, b.slug FROM businesses b LEFT JOIN ro_club_config k ON k.business_id = b.id
    WHERE b.status = 'active' AND b.archived_at IS NULL AND COALESCE(k.es_distrito, 0) = 0 AND COALESCE(k.distrito, ?) = ? ORDER BY b.name`, def, codigo);
}
// Socios que cuentan para la cuota distrital: activos y que pagan cuota.
export const sociosQueCuentan = async (env, bid) => (await one(env, `SELECT COUNT(*) n FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA}`, bid))?.n || 0;
// Cuotas distritales del club con lo que le toca (valor × socios) y lo que ya pagó.
export async function obligacionesClub(env, bid, { anio = null } = {}) {
  const { codigo } = await distritoDe(env, bid);
  const [cuotas, n, pagos] = await Promise.all([
    all(env, `SELECT id, nombre, valor_socio, vence, anio, notas FROM ro_cuota_distrital WHERE distrito = ? ${anio ? 'AND anio = ?' : ''} ORDER BY vence`, codigo, ...(anio ? [anio] : [])),
    sociosQueCuentan(env, bid),
    all(env, "SELECT distrital_id, SUM(monto) total FROM ro_movimientos WHERE business_id = ? AND distrital_id IS NOT NULL AND tipo = 'egreso' GROUP BY distrital_id", bid),
  ]);
  return cuotas.map((q) => {
    const total = q.valor_socio * n, pagado = pagos.find((p) => p.distrital_id === q.id)?.total || 0;
    return { ...q, socios: n, total, pagado, saldo: Math.max(0, total - pagado), estado: pagado >= total && total > 0 ? 'pagada' : q.vence < today() ? 'vencida' : 'pendiente' };
  });
}

// Tipos de obligación del club (la cuota distrital llega sola desde el distrito como «Obligaciones distritales»)
/* ---------------- Obligaciones = rubros de «¿En qué se gasta?» (Caja menor) ---------------- */
// Cada categoría de gasto de la Caja menor es una obligación del año rotario: tiene un VALOR (lo que hay que pagar, se edita)
// y lo PAGADO (los egresos de esa categoría en el año). La cuota distrital suma sola al valor de «Obligaciones RI y Distrito».
// El valor propio del club se guarda en ro_obligaciones (una fila por categoría y año: vence = 30 de junio del cierre).
export const RUBRO_DISTRITO = 'Obligaciones RI y Distrito';
export const RUBROS = () => CATEGORIAS.menor.egreso.filter((x) => x !== 'Traslado');
export const finDeAnio = (anio) => `${anio + 1}-06-30`;
export async function rubros(env, bid, anio) {
  const rango = [`${anio}-07-01`, `${anio + 1}-07-01`];
  const [gasto, valores, dist] = await Promise.all([
    all(env, "SELECT COALESCE(categoria, 'Otros gastos') categoria, SUM(monto) total FROM ro_movimientos WHERE business_id = ? AND caja = 'menor' AND tipo = 'egreso' AND traslado IS NULL AND fecha >= ? AND fecha < ? GROUP BY 1", bid, ...rango),
    all(env, 'SELECT categoria, monto FROM ro_obligaciones WHERE business_id = ? AND vence = ?', bid, finDeAnio(anio)),
    obligacionesClub(env, bid, { anio }),
  ]);
  const distTotal = dist.reduce((t, o) => t + o.total, 0);
  const cats = [...new Set([...RUBROS(), ...gasto.map((g) => g.categoria).filter((c) => c !== 'Traslado')])];
  return cats.map((categoria) => {
    const club = valores.find((v) => v.categoria === categoria)?.monto || 0, distrito = categoria === RUBRO_DISTRITO ? distTotal : 0;
    const valor = club + distrito, pagado = gasto.find((g) => g.categoria === categoria)?.total || 0;
    return { categoria, valor, valor_club: club, valor_distrito: distrito, pagado, saldo: Math.max(0, valor - pagado),
      estado: !valor ? 'sin_valor' : pagado >= valor ? 'pagada' : 'pendiente', cuotas_distritales: categoria === RUBRO_DISTRITO ? dist : undefined };
  }).filter((r) => r.valor || r.pagado || r.categoria === RUBRO_DISTRITO)
    .sort((a, b) => b.valor - a.valor || b.pagado - a.pagado);
}

// Obligaciones frente a la Caja menor y lo proyectado por mes: cuotas que deben pagar los socios contra lo que falta pagar
// (la cuota distrital en su mes de vencimiento; el resto de valores, repartido en los meses que quedan del año).
export async function proyeccion(env, bid, anio) {
  const hoy = today(), mesHoy = hoy.slice(0, 7), meses = mesesDelAnio(anio);
  const [reales, periodos, socios, rs, dist, s] = await Promise.all([
    all(env, `SELECT substr(fecha, 1, 7) mes, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) ingresos, SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) egresos,
      SUM(CASE WHEN pago_id IS NOT NULL THEN monto ELSE 0 END) cuotas
      FROM ro_movimientos WHERE business_id = ? AND caja = 'menor' AND traslado IS NULL AND fecha >= ? AND fecha < ? GROUP BY mes`, bid, `${meses[0]}-01`, `${anio + 1}-07-01`),
    all(env, 'SELECT mes, monto FROM ro_periodos WHERE business_id = ?', bid),
    all(env, `SELECT fecha_ingreso FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA}`, bid),
    rubros(env, bid, anio),
    obligacionesClub(env, bid, { anio }),
    saldos(env, bid),
  ]);
  const quienes = (mes) => socios.filter((x) => !x.fecha_ingreso || x.fecha_ingreso.slice(0, 7) <= mes).length;
  const porPagar = rs.reduce((t, r) => t + r.saldo, 0);
  const distPend = dist.filter((o) => o.estado !== 'pagada');
  const resto = Math.max(0, porPagar - distPend.reduce((t, o) => t + o.saldo, 0));
  const futuros = meses.filter((m) => m >= mesHoy);
  let saldo = s.menor;
  const rows = meses.map((mes) => {
    const r = reales.find((x) => x.mes === mes) || { ingresos: 0, egresos: 0, cuotas: 0 };
    const futuro = mes >= mesHoy, per = periodos.find((p) => p.mes === mes);
    const cuotas_proy = futuro ? Math.max(0, (per ? per.monto * quienes(mes) : 0) - (mes === mesHoy ? r.cuotas : 0)) : 0;
    const distMes = futuro ? distPend.filter((o) => o.vence.slice(0, 7) === mes || (mes === mesHoy && o.vence.slice(0, 7) < mesHoy)).reduce((t, o) => t + o.saldo, 0) : 0;
    const oblig_proy = futuro ? distMes + Math.round(resto / (futuros.length || 1)) : 0;
    if (futuro) saldo += cuotas_proy - oblig_proy;
    return { mes, ingresos: r.ingresos, egresos: r.egresos, proyectado: futuro, cuotas_proy, oblig_proy, saldo_proy: futuro ? saldo : null };
  });
  const perHoy = periodos.find((p) => p.mes === mesHoy) || [...periodos].sort((a, b) => b.mes.localeCompare(a.mes))[0];
  const cuotaMes = perHoy ? perHoy.monto * quienes(mesHoy) : 0, falta = Math.max(0, porPagar - s.menor);
  return { anio, nombre: `${anio}-${anio + 1}`, saldo: s.menor, por_pagar: porPagar, falta, sobra: Math.max(0, s.menor - porPagar),
    cuota_mes: cuotaMes, socios_cuota: quienes(mesHoy), meses_para_cubrir: falta && cuotaMes ? Math.ceil(falta / cuotaMes) : null, meses: rows,
    rubros: rs, total_obligaciones: rs.reduce((t, r) => t + r.valor, 0), pagado: rs.reduce((t, r) => t + Math.min(r.pagado, r.valor), 0) };
}

export async function saldos(env, businessId) {
  const r = await all(env, "SELECT caja, SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) saldo FROM ro_movimientos WHERE business_id = ? GROUP BY caja", businessId);
  return { menor: r.find((x) => x.caja === 'menor')?.saldo || 0, mayor: r.find((x) => x.caja === 'mayor')?.saldo || 0 };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };

// Certificado de activación de un socio: página para imprimir o «Guardar como PDF».
export async function certificadoHtml(c, socio) {
  if (!socio.activado_at) throw new HttpError(409, 'Este socio aún no está activado');
  const biz = await one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId);
  const st = await one(c.env, 'SELECT logo_key FROM business_settings WHERE business_id = ?', c.businessId);
  const junta = await all(c.env, "SELECT nombre, cargo FROM ro_socios WHERE business_id = ? AND estado = 'activo' AND cargo IS NOT NULL", c.businessId);
  const firma = (re) => junta.find((j) => re.test(String(j.cargo).toLowerCase()));
  const pres = junta.find((j) => cargoOrden(j.cargo) === 1), sec = firma(/secretari/);
  const club = biz?.name || 'Club Rotaract';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificado de activación · ${esc(socio.nombre)}</title>
<style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Georgia,'Times New Roman',serif;background:#f3f1f4;color:#1f1d24}
.bar{display:flex;gap:8px;justify-content:center;padding:12px;font-family:system-ui,sans-serif}.bar button{border:0;border-radius:8px;padding:10px 18px;font-size:15px;background:#d41367;color:#fff;cursor:pointer}
.hoja{width:297mm;height:210mm;margin:0 auto;background:#fff;position:relative;padding:18mm 22mm;display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden}
.hoja:before{content:"";position:absolute;inset:8mm;border:2px solid #d41367;border-radius:6px}.hoja:after{content:"";position:absolute;inset:11mm;border:1px solid #f0a6c6;border-radius:4px}
.logo{height:26mm;margin-top:4mm}.logo img{height:100%}.club{font-size:13pt;letter-spacing:.18em;text-transform:uppercase;color:#d41367;margin-top:4mm}
h1{font-size:34pt;margin:6mm 0 2mm;font-weight:normal}.sub{font-size:13pt;color:#555}.nombre{font-size:30pt;margin:8mm 0 3mm;border-bottom:1px solid #ccc;padding:0 18mm 2mm;font-style:italic}
.texto{font-size:13pt;max-width:200mm;line-height:1.55}.firmas{display:flex;gap:40mm;margin-top:auto;margin-bottom:6mm}.firma{min-width:62mm;border-top:1px solid #333;padding-top:2mm;font-size:11pt}.firma small{display:block;color:#666;font-size:9.5pt}
.cod{position:absolute;bottom:13mm;right:16mm;font:9pt system-ui,sans-serif;color:#777}
@media print{body{background:#fff}.bar{display:none}.hoja{margin:0}}
</style></head><body>
<div class="bar"><button onclick="print()">Descargar PDF / Imprimir</button></div>
<div class="hoja">
  <div class="logo">${st?.logo_key ? '<img src="/api/settings/logo" alt="">' : ''}</div>
  <div class="club">${esc(club)}</div>
  <h1>Certificado de activación</h1>
  <div class="sub">Otorgado a</div>
  <div class="nombre">${esc(socio.nombre)}</div>
  <div class="texto">por haber completado su proceso de ingreso y quedar <b>activo${socio.cargo && esJunta(socio.cargo) ? ` como ${esc(socio.cargo)}` : ' como socio'}</b> de ${esc(club)}, comprometido con el servicio, el compañerismo y el liderazgo que promueve Rotary International.<br>Expedido el ${fechaLarga(socio.activado_at)}.</div>
  <div class="firmas">
    <div class="firma">${esc(pres?.nombre || '')}<small>Presidencia del club</small></div>
    <div class="firma">${esc(sec?.nombre || '')}<small>Secretaría del club</small></div>
  </div>
  <div class="cod">${socio.myrotary_id ? `ID My Rotary ${esc(socio.myrotary_id)}${socio.myrotary_at ? ` · desde ${fechaLarga(socio.myrotary_at)}` : ''}` : 'Activo en el club'}${socio.fecha_ingreso ? ` · Ingresó el ${fechaLarga(socio.fecha_ingreso)}` : ''}</div>
</div></body></html>`;
}
