// Utilidades comunes de CD Rotaract: orden de los cargos de la junta, el socio de la sesión, cartera de cuotas,
// saldos de las dos cajas y el certificado de activación (HTML listo para imprimir o guardar como PDF).
import { HttpError } from './http.js';
import { all, one, today } from './crud.js';

export const CAJAS = { menor: 'Caja menor (Club)', mayor: 'Caja mayor (Obras)' };
// Categorías sugeridas por caja: cada caja tiene su flujo (se puede escribir otra).
export const CATEGORIAS = {
  menor: { ingreso: ['Cuotas', 'Cajita de macería', 'Donaciones al club', 'Eventos y rifas', 'Traslado', 'Otros ingresos'], egreso: ['Obligaciones RI y Distrito', 'Reconocimiento y protocolo', 'Bonos distritales', 'Camisetas del club', 'Pines', 'Refrigerios', 'Papelería e imagen', 'Logística de reuniones', 'Traslado', 'Otros gastos'] },
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
// Desde qué mes se le cobra cuota a un socio: desde su activación en el club; si aún no está activado, desde su ingreso.
export const inicioCobro = (s) => String(s.activado_at || s.fecha_ingreso || '').slice(0, 7);
export async function configCuota(env, bid) {
  const r = await one(env, 'SELECT cuota_aspirantes, cuota_honorarios FROM ro_club_config WHERE business_id = ?', bid);
  return { aspirantes: !!r?.cuota_aspirantes, honorarios: !!r?.cuota_honorarios };
}

export async function cartera(c, socioId = null) {
  const hoy = today(), mesHoy = hoy.slice(0, 7);
  const [socios, periodos, pagos] = await Promise.all([
    all(c.env, `SELECT id, nombre, cargo, tipo_membresia, estado, fecha_ingreso, activado_at, foto_key, foto_url, telefono FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA} ${socioId ? 'AND id = ?' : ''} ORDER BY nombre`, c.businessId, ...(socioId ? [socioId] : [])),
    all(c.env, 'SELECT mes, monto, vence FROM ro_periodos WHERE business_id = ? AND mes <= ? ORDER BY mes', c.businessId, mesHoy),
    all(c.env, `SELECT socio_id, SUM(monto) total, MAX(fecha) ultimo FROM ro_pagos WHERE business_id = ? AND estado = 'verificado' GROUP BY socio_id`, c.businessId),
  ]);
  return socios.map((s) => {
    const desde = inicioCobro(s);
    const debidos = periodos.filter((p) => !desde || p.mes >= desde);
    const esperado = debidos.reduce((t, p) => t + p.monto, 0);
    const vencido = debidos.filter((p) => (p.vence || `${p.mes}-28`) < hoy).reduce((t, p) => t + p.monto, 0);
    const pg = pagos.find((x) => x.socio_id === s.id);
    const pagado = pg?.total || 0, saldo = Math.max(0, esperado - pagado);
    const estado = pagado >= esperado ? (pagado > esperado ? 'adelantado' : 'al_dia') : pagado >= vencido ? 'por_vencer' : 'debe';
    return { socio_id: s.id, nombre: s.nombre, cargo: s.cargo, telefono: s.telefono || null, tipo: s.tipo_membresia, fecha_ingreso: s.fecha_ingreso, activado_at: s.activado_at, desde: debidos[0]?.mes || null, foto: s.foto_key || s.foto_url ? `/api/socios/foto/${s.id}` : null, esperado, pagado, saldo, a_favor: Math.max(0, pagado - esperado), vencido: Math.max(0, vencido - pagado), estado, ultimo_pago: pg?.ultimo || null, periodos: debidos.length };
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
    all(c.env, `SELECT id, nombre, cargo, fecha_ingreso, activado_at, foto_key, foto_url FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA} ${socioId ? 'AND id = ?' : ''} ORDER BY nombre`, c.businessId, ...(socioId ? [socioId] : [])),
    all(c.env, 'SELECT mes, monto, vence FROM ro_periodos WHERE business_id = ? ORDER BY mes', c.businessId),
    all(c.env, "SELECT socio_id, SUM(monto) total FROM ro_pagos WHERE business_id = ? AND estado = 'verificado' GROUP BY socio_id", c.businessId),
    all(c.env, "SELECT socio_id, COUNT(*) n FROM ro_pagos WHERE business_id = ? AND estado = 'pendiente' GROUP BY socio_id", c.businessId),
  ]);
  const totales = meses.map((mes) => ({ mes, monto: periodos.find((p) => p.mes === mes)?.monto ?? null, esperado: 0, recaudado: 0 }));
  const rows = socios.map((s) => {
    const desde = inicioCobro(s);
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

/* ---------------- Programa del club ---------------- */
// La app sirve a clubes Rotary, Rotaract e Interact (ro_club_config.programa; los de antes quedan Rotaract).
// Solo Rotaract tiene hoy los archivos oficiales del logotipo en public/img/marca/; los demás usan el nombre del club.
export const PROGRAMAS = {
  rotaract: { id: 'rotaract', nombre: 'Rotaract', sigla: 'RTC', club: 'Club Rotaract', socio: 'rotaractiano', logo: true },
  rotary: { id: 'rotary', nombre: 'Rotary', sigla: 'RY', club: 'Club Rotario', socio: 'rotario', logo: false },
  interact: { id: 'interact', nombre: 'Interact', sigla: 'IT', club: 'Club Interact', socio: 'interactiano', logo: false },
};
// Nombre con la sigla del programa (RY / RTC / IT): muchos clubes se llaman igual («Medellín» rotario, Rotaract e Interact).
// No se guarda en el negocio (los certificados y logos usan el nombre limpio); solo se muestra.
export const conSigla = (nombre, prog) => (/^(RY|RTC|IT|IN)\b/i.test(String(nombre || '').trim()) ? nombre : `${programa(prog).sigla} ${nombre}`);   // si ya trae sigla (p. ej. «IN 4271»), se deja
// Etiqueta de varios negocios a la vez (para la lista de «a cuál entrar»): { id → { programa, sigla, distrito, etiqueta } }
export async function etiquetas(env, list) {
  if (!list.length) return {};
  const rows = await all(env, `SELECT business_id, programa, es_distrito FROM ro_club_config WHERE business_id IN (${list.map(() => '?').join(',')})`, ...list.map((b) => b.id));
  return Object.fromEntries(list.map((b) => { const r = rows.find((x) => x.business_id === b.id), p = programa(r?.programa), dist = !!r?.es_distrito;
    return [b.id, { programa: p.id, sigla: p.sigla, distrito: dist, etiqueta: conSigla(b.name, p.id) }]; }));
}
export const programa = (id) => PROGRAMAS[id] || PROGRAMAS.rotaract;
export async function programaDe(env, businessId) {
  return programa((await one(env, 'SELECT programa FROM ro_club_config WHERE business_id = ?', businessId))?.programa);
}

/* ---------------- Distrito ---------------- */
// Código de distrito del negocio (lo pone Diwilo; por defecto DISTRITO_DEFECTO) y si el negocio ES el distrito.
// Hay tres distritos por código, uno por programa (Distrito Rotary 4271, Distrito Rotaract 4271, Distrito Interact 4271): cada
// uno ve solo los clubes de su programa. `clave` identifica al distrito en las tablas (cuotas, bonos, retos, metas, solicitudes):
// Rotaract = el código solo (así quedaron los datos de antes); los demás = «programa:código».
export const claveDistrito = (codigo, prog) => (prog === 'rotaract' ? codigo : `${prog}:${codigo}`);
export async function distritoDe(env, businessId) {
  const r = await one(env, 'SELECT distrito, es_distrito, programa FROM ro_club_config WHERE business_id = ?', businessId);
  const codigo = r?.distrito || env.DISTRITO_DEFECTO || '4271', prog = programa(r?.programa).id;
  return { codigo, es_distrito: !!r?.es_distrito, programa: prog, clave: claveDistrito(codigo, prog) };
}
// Clubes del distrito: los negocios activos con ese código y ese programa que no son distritos.
export async function clubesDelDistrito(env, codigo, prog = 'rotaract') {
  const def = env.DISTRITO_DEFECTO || '4271';
  return (await all(env, `SELECT b.id, b.name, b.slug, COALESCE(k.programa, 'rotaract') programa FROM businesses b LEFT JOIN ro_club_config k ON k.business_id = b.id
    WHERE b.status = 'active' AND b.archived_at IS NULL AND COALESCE(k.es_distrito, 0) = 0 AND COALESCE(k.distrito, ?) = ? AND COALESCE(k.programa, 'rotaract') = ? ORDER BY b.name`, def, codigo, prog)).map((k) => ({ ...k, name: conSigla(k.name, k.programa) }));
}
// Condición SQL «business_id es un club de este distrito» (3 parámetros: defecto, código y programa). Sin listas IN de ids:
// D1 acepta máximo 100 parámetros por consulta y un distrito puede tener más clubes.
export const EN_DISTRITO = `business_id IN (SELECT b.id FROM businesses b LEFT JOIN ro_club_config k ON k.business_id = b.id
  WHERE b.status = 'active' AND b.archived_at IS NULL AND COALESCE(k.es_distrito, 0) = 0 AND COALESCE(k.distrito, ?) = ? AND COALESCE(k.programa, 'rotaract') = ?)`;
export const enDistrito = (env, codigo, prog = 'rotaract') => [env.DISTRITO_DEFECTO || '4271', codigo, prog];
// Orden del día sugerido de una reunión ordinaria. El distrito lo puede cambiar para sus clubes (ro_club_config.orden_dia).
export const ORDEN_DIA = [
  { titulo: 'Toque de campana', detalle: 'La presidencia da apertura oficial a la sesión.' },
  { titulo: 'Saludo a los símbolos y lectura de valores', detalle: 'Invocación del club, La Prueba Cuádruple y el Objetivo de Rotary.' },
  { titulo: 'Presentación de invitados', detalle: 'El macero da la bienvenida a socios visitantes, rotarios o invitados especiales.' },
  { titulo: 'Lectura y aprobación del acta anterior', detalle: 'A cargo de la secretaría del club.' },
  { titulo: 'Informes de directiva y comités', detalle: 'Avances de proyectos de servicio, tesorería y actividades próximas.' },
  { titulo: 'Tema central o capacitación', detalle: 'Charla de un orador invitado, debate o taller de desarrollo profesional.' },
  { titulo: 'Asuntos varios y cajita de macería', detalle: 'Anuncios rápidos y recaudación simbólica para el fondo de compañerismo o proyectos.' },
  { titulo: 'Toque de campana de cierre', detalle: 'Clausura formal de la reunión.' },
];
// Cargos de la junta: los define el distrito para los clubes de su programa (ro_club_config.cargos del negocio del distrito);
// la presidencia de cada club solo asigna de esa lista. Sin lista del distrito, la sugerida (los nombres de siempre).
export const CARGOS_SUGERIDOS = ['Presidente/a del club', 'Vicepresidente/a del club', 'Secretario/a del club', 'Tesorero/a del club', 'Macero/a del club', 'Director/a de Servicio al Club',
  'Director/a de Servicio a la Comunidad', 'Director/a de Servicio Internacional', 'Director/a de Desarrollo Profesional', 'Director/a de Imagen Pública', 'Director/a de Proyectos',
  'Presidente/a del Comité de la Fundación del club'];
export async function cargosDe(env, bid) {
  const { codigo, es_distrito, programa: prog } = await distritoDe(env, bid);
  const r = await one(env, es_distrito ? 'SELECT cargos FROM ro_club_config WHERE business_id = ?' : `SELECT k.cargos FROM ro_club_config k JOIN businesses b ON b.id = k.business_id
    WHERE k.es_distrito = 1 AND COALESCE(k.distrito, ?) = ? AND COALESCE(k.programa, 'rotaract') = ? AND k.cargos IS NOT NULL AND b.archived_at IS NULL ORDER BY k.updated_at DESC LIMIT 1`,
  ...(es_distrito ? [bid] : [env.DISTRITO_DEFECTO || '4271', codigo, prog]));
  try { const l = JSON.parse(r?.cargos || 'null'); if (Array.isArray(l) && l.length) return { items: l, origen: 'distrito' }; } catch (_) { /* la sugerida */ }
  return { items: CARGOS_SUGERIDOS, origen: 'sugerido' };
}

// El orden del día que usa un club: el de su distrito (si el distrito lo editó) o el sugerido
export async function ordenDelDia(env, bid) {
  const { codigo, es_distrito, programa: prog } = await distritoDe(env, bid);
  const r = await one(env, es_distrito ? 'SELECT orden_dia FROM ro_club_config WHERE business_id = ?' : `SELECT k.orden_dia FROM ro_club_config k JOIN businesses b ON b.id = k.business_id
    WHERE k.es_distrito = 1 AND COALESCE(k.distrito, ?) = ? AND COALESCE(k.programa, 'rotaract') = ? AND k.orden_dia IS NOT NULL AND b.archived_at IS NULL ORDER BY k.updated_at DESC LIMIT 1`, ...(es_distrito ? [bid] : [env.DISTRITO_DEFECTO || '4271', codigo, prog]));
  try { const l = JSON.parse(r?.orden_dia || 'null'); if (Array.isArray(l) && l.length) return { items: l, origen: 'distrito', codigo }; } catch (_) { /* el sugerido */ }
  return { items: ORDEN_DIA, origen: 'sugerido', codigo };
}

// Socios que cuentan para la cuota distrital: activos y que pagan cuota.
export const sociosQueCuentan = async (env, bid) => (await one(env, `SELECT COUNT(*) n FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA}`, bid))?.n || 0;
// Cuotas distritales del club con lo que le toca (valor × socios) y lo que ya pagó.
export async function obligacionesClub(env, bid, { anio = null } = {}) {
  const { clave: codigo } = await distritoDe(env, bid);
  const [cuotas, n, pagos] = await Promise.all([
    all(env, `SELECT id, nombre, tipo, valor_socio, vence, anio, notas FROM ro_cuota_distrital WHERE distrito = ? ${anio ? 'AND anio = ?' : ''} ORDER BY vence`, codigo, ...(anio ? [anio] : [])),
    sociosQueCuentan(env, bid),
    all(env, "SELECT distrital_id, SUM(monto) total FROM ro_movimientos WHERE business_id = ? AND distrital_id IS NOT NULL AND tipo = 'egreso' GROUP BY distrital_id", bid),
  ]);
  return cuotas.map((q) => {
    const total = q.tipo === 'por_club' ? q.valor_socio : q.valor_socio * n, pagado = pagos.find((p) => p.distrital_id === q.id)?.total || 0;
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
    all(env, `SELECT fecha_ingreso, activado_at FROM ro_socios WHERE business_id = ? AND ${PAGA_CUOTA}`, bid),
    rubros(env, bid, anio),
    obligacionesClub(env, bid, { anio }),
    saldos(env, bid),
  ]);
  const quienes = (mes) => socios.filter((x) => !inicioCobro(x) || inicioCobro(x) <= mes).length;
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
// Certificado de activación en el club: A4 horizontal para imprimir o «Guardar como PDF». Marco azul Rotary y oro, acento
// arándano Rotaract, logo del club si lo tiene, las 3 fechas del socio (ingreso, activación, My Rotary) y las firmas.
// Fondo del certificado (engranaje de My Rotary): public/img/certificado-fondo.png. Mientras no exista, un aro suave.
const FONDO = false;
// Logotipo oficial de Rotaract (public/img/marca/rotaract.svg) con el nombre del club debajo, alineado a la derecha con
// «Rotaract» en Open Sans Light, igual que el archivo del Brand Center (mismas medidas que public/js/pages/marca-club.js).
export const nombreDelClub = (n) => String(n || '').replace(/^\s*rotaract\s+/i, '').replace(/^club\s+(de|del|of)?\s*/i, '').trim() || String(n || 'Club');
export async function logoOficial(c, club) {
  if (!(await programaDe(c.env, c.businessId)).logo) return `<span class="club">${esc(club)}</span>`;
  let arte = '';
  try { const r = await c.env.ASSETS.fetch(new Request(new URL('/img/marca/rotaract.svg', c.url.origin))); arte = (/<g[\s\S]*<\/g>/.exec(await r.text()) || [''])[0]; } catch (_) { arte = ''; }
  if (!arte) return `<span class="club">${esc(club)}</span>`;
  const nombre = nombreDelClub(club), max = 290.77;
  let fs = 48.93, lineas = [nombre];
  const ancho = (t, f) => [...t].reduce((a, ch) => a + (/[mwMW]/.test(ch) ? 0.82 : /[il.,'ı]/.test(ch) ? 0.24 : /[A-Z]/.test(ch) ? 0.62 : ch === ' ' ? 0.26 : 0.52), 0) * f;
  if (ancho(nombre, fs) > max) { fs = Math.max(30.3, fs * (max / ancho(nombre, fs))); if (ancho(nombre, fs) > max) { const p = nombre.split(/\s+/), mitad = Math.ceil(p.length / 2); lineas = [p.slice(0, mitad).join(' '), p.slice(mitad).join(' ')]; } }
  const alto = 166.8 + (lineas.length - 1) * fs * 1.15 + fs * 0.3;
  return `<svg class="logo-of" viewBox="8.6 8.7 452.4 ${(alto - 8.7).toFixed(1)}" role="img" aria-label="Rotaract ${esc(nombre)}">${arte}${lineas.map((l, i) => `<text x="299.39" y="${(166.8 + i * fs * 1.15).toFixed(1)}" text-anchor="end" font-family="'Open Sans', Arial, sans-serif" font-weight="300" font-size="${fs.toFixed(1)}" fill="#D41367">${esc(l)}</text>`).join('')}</svg>`;
}
// Plantilla común de los certificados (A4 horizontal), al estilo de los certificados de Rotary pero propia: a la izquierda una
// franja azul Rotary con un globo de líneas arándano y oro; a la derecha, en blanco, el logotipo oficial con el nombre del club,
// el título, a quién se otorga (con letra con serifa), un detalle entre paréntesis, el texto y dos firmas, cada una con su fecha.
// d = { titulo, nombre, detalle, cuerpo (HTML ya escapado; {club} = nombre del club), firmas: [{ nombre, rol, fecha, img }], codigo }
async function hojaCertificado(c, d) {
  const biz = await one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId);
  const club = biz?.name || (await programaDe(c.env, c.businessId)).club, logo = await logoOficial(c, club);
  // Franja izquierda moderna: degradado azul Rotary, la rueda oficial grande en blanco muy suave, arcos arándano y oro y una trama de puntos
  let rueda = '';
  try { const r = await c.env.ASSETS.fetch(new Request(new URL('/img/marca/rueda.svg', c.url.origin))); rueda = (/<g[\s\S]*<\/g>/.exec(await r.text()) || [''])[0].replace(/fill="#D41367"/g, 'fill="#FFFFFF"'); } catch (_) { rueda = ''; }
  const globo = `<svg class="globo" viewBox="0 0 280 794" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><pattern id="pt" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#fff" opacity=".18"/></pattern></defs>
    <rect width="280" height="794" fill="url(#pt)"/>
    ${rueda ? `<svg x="-150" y="420" width="470" height="470" viewBox="316.77 8.78 144.12 144.22" opacity=".14">${rueda}</svg>` : ''}
    <circle cx="300" cy="120" r="190" fill="none" stroke="#D41367" stroke-width="26" opacity=".95"/>
    <circle cx="300" cy="120" r="150" fill="none" stroke="#F7A81B" stroke-width="5"/>
    <circle cx="-40" cy="430" r="110" fill="#D41367" opacity=".22"/>
    <circle cx="220" cy="560" r="46" fill="none" stroke="#F7A81B" stroke-width="5" opacity=".9"/>
    <path d="M0 330 L280 250" stroke="#fff" stroke-width="1.5" opacity=".25"/>
  </svg><div class="lema">Gente de acción</div>`;
  const firma = (f) => `<div class="firma"><div class="fimg">${f.img ? `<img src="${esc(f.img)}" alt="Firma">` : ''}</div><div class="l"></div><span class="rol">${esc(f.rol)}</span><b>${esc(f.nombre || '')}</b>
    <div class="fecha">${f.fecha ? esc(fechaLarga(f.fecha)) : '&nbsp;'}</div><div class="l"></div><span class="rol">Fecha</span></div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.titulo)} · ${esc(d.nombre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Open+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4 landscape;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
:root{--azul:#17458f;--celeste:#0067c8;--oro:#f7a81b;--rojo:#d41367;--gris:#3b4a57}
body{margin:0;background:#e9edf4;color:#1d2433;font-family:'Open Sans',Arial,sans-serif}
.bar{display:flex;justify-content:center;padding:12px}.bar button{border:0;border-radius:999px;padding:10px 20px;font:600 15px 'Open Sans',sans-serif;background:var(--azul);color:#fff;cursor:pointer}
.hoja{width:297mm;height:210mm;margin:0 auto 20px;background:#fff;position:relative;overflow:hidden;display:flex;box-shadow:0 10px 40px rgba(23,69,143,.18)}
.banda{width:74mm;flex:none;position:relative;overflow:hidden;background:linear-gradient(170deg,#0b2f63 0%,var(--azul) 45%,var(--celeste) 100%)}
.banda:after{content:"";position:absolute;top:0;right:0;bottom:0;width:1.6mm;background:var(--oro)}
.globo{position:absolute;inset:0;width:100%;height:100%}
.lema{position:absolute;left:9mm;bottom:9mm;font:700 9pt 'Open Sans',sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#fff;opacity:.92}.lema:before{content:"";display:block;width:12mm;height:1mm;background:var(--oro);margin-bottom:3mm}
.cuerpo{flex:1;padding:14mm 20mm 11mm;display:flex;flex-direction:column;align-items:center;text-align:center;position:relative}
.logo-of{height:25mm;width:auto}.club{font:700 12pt 'Open Sans',sans-serif;letter-spacing:.2em;text-transform:uppercase;color:var(--rojo)}
h1{margin:9mm 0 0;font:700 25pt 'Open Sans',sans-serif;color:var(--gris);letter-spacing:.01em}
.raya{width:22mm;height:1mm;background:var(--oro);margin:4mm auto 0;border-radius:1mm}
.otorga{margin-top:6mm;font:400 10.5pt 'Open Sans',sans-serif;color:#6b7385;letter-spacing:.06em;text-transform:uppercase}
.nombre{margin-top:2mm;font:600 29pt 'Cormorant Garamond',Georgia,serif;color:#1d2433;line-height:1.12;max-width:190mm}
.detalle{margin-top:1.5mm;font:500 14pt 'Cormorant Garamond',Georgia,serif;color:#3b4a57}
.texto{margin-top:6mm;font:400 11.5pt/1.6 'Open Sans',sans-serif;color:#2f3749;max-width:175mm}.texto b{color:var(--azul);font-weight:700}
.pie{margin-top:auto;width:100%;display:flex;justify-content:space-around;gap:16mm}
.firma{width:72mm;text-align:center}.fimg{height:15mm;display:flex;align-items:flex-end;justify-content:center}.fimg img{max-height:15mm;max-width:62mm;object-fit:contain;margin-bottom:-2mm}
.firma .l{border-top:.35mm solid #2f3749}.rol{display:block;font:600 6.5pt 'Open Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#6b7385;margin-top:1mm}
.firma b{display:block;font:500 12pt 'Cormorant Garamond',Georgia,serif;color:#1d2433;margin-top:.5mm}
.fecha{margin-top:4mm;font:500 11.5pt 'Cormorant Garamond',Georgia,serif;color:#1d2433;min-height:5mm}
.cod{position:absolute;right:8mm;bottom:5mm;font:400 6.5pt 'Open Sans',sans-serif;color:#9aa1ae}
@media print{body{background:#fff}.bar{display:none}.hoja{margin:0;box-shadow:none}}
</style></head><body>
<div class="bar"><button onclick="print()">Descargar PDF / Imprimir</button></div>
<div class="hoja"><div class="banda">${globo}</div>
 <div class="cuerpo">
  ${logo}
  <h1>${esc(d.titulo)}</h1><div class="raya"></div>
  <div class="otorga">${esc(d.otorga || 'Se otorga a')}</div>
  <div class="nombre">${esc(d.nombre)}</div>
  ${d.detalle ? `<div class="detalle">(${esc(d.detalle)})</div>` : ''}
  <div class="texto">${d.cuerpo.replaceAll('{club}', esc(club))}</div>
  <div class="pie">${d.firmas.map(firma).join('')}</div>
  ${d.codigo ? `<div class="cod">${esc(d.codigo)}</div>` : ''}
 </div>
</div>
<script>/* en pantallas pequeñas la hoja se ve completa (al imprimir vuelve a su tamaño) */(function(){var h=document.querySelector('.hoja');function f(){var w=h.offsetWidth,k=Math.min(1,(innerWidth-16)/w);h.style.transform=k<1?'scale('+k+')':'';h.style.transformOrigin='top left';h.style.marginBottom=k<1?(-(1-k)*h.offsetHeight)+'px':'';h.style.marginLeft=k<1?'8px':''}addEventListener('resize',f);f();matchMedia('print').addEventListener('change',function(e){if(e.matches){h.style.transform='';h.style.margin='0'}else f()})})()</script>
</body></html>`;
}
// Firmas del club: Presidencia y Secretaría (con su firma si la subieron), con la fecha del certificado
async function firmasJunta(c, fecha) {
  const junta = await all(c.env, "SELECT id, nombre, cargo, firma_key FROM ro_socios WHERE business_id = ? AND estado = 'activo' AND cargo IS NOT NULL", c.businessId);
  const pres = junta.find((j) => cargoOrden(j.cargo) === 1), sec = junta.find((j) => /secretari/.test(String(j.cargo).toLowerCase()));
  const f = (j, rol) => ({ nombre: j?.nombre || '', rol, fecha, img: j?.firma_key ? `/api/socios/firma/${j.id}` : null });
  return [f(pres, 'Presidencia del club'), f(sec, 'Secretaría del club')];
}

// Certificado de activación: es socio del club a partir de la fecha de activación
export async function certificadoHtml(c, socio) {
  if (!socio.activado_at) throw new HttpError(409, 'Este socio aún no está activado');
  return hojaCertificado(c, { titulo: 'Certificado de activación', nombre: socio.nombre, detalle: `Socio del club desde el ${fechaLarga(socio.activado_at)}`,
    cuerpo: 'Por haber ingresado a {club} y cumplido con todo lo necesario para ser <b>socio del club</b>, comprometido con el servicio, el compañerismo y el liderazgo que promueve Rotary International.',
    firmas: await firmasJunta(c, socio.activado_at), codigo: socio.activacion_codigo || '' });
}
// Certificados de junta (servicio en un año rotario) y reconocimientos (título y texto propios)
export async function certificadoEspecialHtml(c, socio, k) {
  if (k.tipo === 'junta') {
    return hojaCertificado(c, { titulo: 'Certificado de servicio', nombre: socio.nombre, detalle: `${k.cargo || 'Junta directiva'} · Año rotario ${k.anio}-${k.anio + 1}`,
      cuerpo: `Por haber servido como <b>${esc(k.cargo || 'miembro de la junta directiva')}</b> de {club} durante el año rotario <b>${k.anio}-${k.anio + 1}</b>, con compromiso, liderazgo y espíritu de servicio.`,
      firmas: await firmasJunta(c, k.fecha), codigo: k.codigo || '' });
  }
  return hojaCertificado(c, { titulo: `Reconocimiento · ${k.titulo || 'Al servicio'}`, nombre: socio.nombre, detalle: `Otorgado el ${fechaLarga(k.fecha)}`,
    cuerpo: esc(k.texto || 'Por su compromiso con el servicio y su aporte al club.').replace(/\n/g, '<br>'), firmas: await firmasJunta(c, k.fecha), codigo: k.codigo || '' });
}
// Certificado del club (organización): número del club, fundación y club rotario patrocinador. Datos en ro_club_config.kit.
export async function certificadoClubHtml(c, k) {
  const biz = await one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId), P = await programaDe(c.env, c.businessId), club = biz?.name || P.club;
  const [pres] = await firmasJunta(c, k.fundado || null);
  return hojaCertificado(c, { titulo: 'Certificado de organización', otorga: 'Se certifica que', nombre: club,
    detalle: [k.numero ? `Club No. ${k.numero}` : '', k.distrito ? `Distrito ${k.distrito}` : '', k.fundado ? `Fundado el ${fechaLarga(k.fundado)}` : ''].filter(Boolean).join(' · '),
    cuerpo: `El club ha sido debidamente organizado y se compromete, mediante sus funcionarios y socios, a cumplir con los Estatutos y el Reglamento del programa ${P.nombre} de Rotary International.${k.patrocinador ? `<br><br>Patrocinado por<br><span style="font:500 15pt 'Cormorant Garamond',Georgia,serif;color:#1d2433">${esc(k.patrocinador)}</span>` : ''}`,
    firmas: [{ nombre: k.presidente_patrocinador || '', rol: 'Presidencia del club rotario patrocinador', fecha: k.fundado || null }, { ...pres, fecha: k.fundado || null }] });
}
