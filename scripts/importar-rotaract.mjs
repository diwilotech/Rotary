// Importa la exportación del sistema anterior (rotaract-datos.json) a un negocio de CD Rotaract. Genera un archivo SQL que
// se aplica con wrangler; no toca nada por sí solo. Se puede repetir: cada fila lleva origen_id y no se duplica (INSERT OR IGNORE).
//
//   node scripts/importar-rotaract.mjs --json ~/Downloads/rotaract-datos.json --negocio <business_id> --salida importacion.sql
//   npx wrangler d1 execute control-de-rotaract-db --remote --file importacion.sql      (en local: --local --persist-to .wrangler/state)
//
// Qué trae: socios (con su cargo vigente), reuniones y eventos, confirmaciones y asistencia, tareas (con responsable y checklist),
// proyectos, beneficiarios, alianzas, movimientos (club → Caja menor, proyectos → Caja mayor, traslados), periodos y pagos de cuota
// (los verificados entran a la Caja menor). Fotos y comprobantes: solo si su enlace es público (https); los demás quedan anotados.
import { readFileSync, writeFileSync } from 'node:fs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const NEG = arg('negocio'), JSONF = arg('json'), OUT = arg('salida') || 'importacion.sql';
if (!NEG || !JSONF) { console.error('Uso: node scripts/importar-rotaract.mjs --json <archivo> --negocio <business_id> [--salida importacion.sql]'); process.exit(1); }
const T = JSON.parse(readFileSync(JSONF, 'utf8')).tablas;
const t = (n) => T[n] || [];

const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : typeof v === 'number' ? String(Math.round(v)) : typeof v === 'boolean' ? (v ? '1' : '0') : `'${String(v).replace(/'/g, "''")}'`);
const ahora = Date.now();
const ref = (tabla, origen) => (origen ? `(SELECT id FROM ${tabla} WHERE business_id = ${q(NEG)} AND origen_id = ${q(origen)})` : null);
// Fecha y hora en Colombia (UTC-5) desde un timestamp ISO
const co = (iso) => (iso ? new Date(Date.parse(iso) - 5 * 3600000).toISOString() : null);
const dia = (iso) => (iso ? (iso.length === 10 ? iso : co(iso).slice(0, 10)) : null);
const hora = (iso) => (iso && iso.length > 10 ? co(iso).slice(11, 16) : null);
const https = (u) => (u && /^https:\/\//.test(u) ? u : null);
const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const sql = [];
const ins = (tabla, row) => { const k = Object.keys(row); sql.push(`INSERT OR IGNORE INTO ${tabla} (business_id, ${k.join(', ')}, created_at, updated_at) VALUES (${q(NEG)}, ${k.map((x) => (String(row[x]).startsWith('(SELECT') ? row[x] : q(row[x]))).join(', ')}, ${ahora}, ${ahora});`); };

// Orden de cargos (igual que src/lib/rotaract.js) para quedarse con el principal cuando alguien tiene dos vigentes
const orden = (c) => { c = String(c || '').toLowerCase(); return !c || c === 'socio' ? 99 : c.startsWith('presidente/a del club') ? 1 : c.includes('vicepresident') ? 2 : c.includes('secretari') ? 3 : c.includes('tesorer') ? 4 : c.includes('director') ? 5 : 6; };

/* Socios */
const cargos = t('cargos_socio').filter((c) => !c.hasta);
for (const s of t('socios')) {
  const vig = cargos.filter((c) => c.socio_id === s.id).sort((a, b) => orden(a.cargo) - orden(b.cargo))[0];
  const cargo = vig?.cargo || (s.cargo && s.cargo.toLowerCase() !== 'socio' ? s.cargo : null);
  ins('ro_socios', { nombre: s.nombre_completo, email: s.email ? s.email.toLowerCase() : null, telefono: s.telefono, fecha_nacimiento: s.fecha_nacimiento, profesion: s.profesion, instagram: s.instagram,
    foto_url: https(s.foto_url), fecha_ingreso: s.fecha_ingreso || s.estado_desde || dia(s.created_at), myrotary_id: s.rotary_id ? String(s.rotary_id).trim() : null, tipo_membresia: ['socio', 'socio_externo', 'voluntario_invitado'].includes(s.tipo_membresia) ? s.tipo_membresia : 'socio',
    estado: s.estado === 'inactivo' ? 'inactivo' : 'activo', cargo, cargo_desde: vig?.desde || null, paga_cuota: s.tipo_membresia === 'socio' ? 1 : 0,
    notas: [s.biografia, s.cargo_club_origen ? `Cargo en su club de origen: ${s.cargo_club_origen}` : null].filter(Boolean).join('\n') || null, origen_id: s.id });
}

/* Proyectos (antes que reuniones, tareas y movimientos que los referencian) */
const EP = { finalizado: 'finalizado', 'en curso': 'en_curso', propuesta: 'propuesta', cancelado: 'cancelado' };
for (const p of t('proyectos')) {
  ins('ro_proyectos', { nombre: p.nombre, descripcion: p.descripcion || p.resumen_ejecutivo, objetivo: p.objetivo_general, estado: EP[p.estado] || 'propuesta', fecha_inicio: dia(p.fecha_inicio), fecha_fin: dia(p.fecha_fin),
    socio_lider_id: ref('ro_socios', p.socio_lider_id), foto_url: https(p.logo_url), beneficiados: p.personas_impactadas || 0, horas_servicio: p.horas_servicio || 0,
    financiacion: p.patrocinador ? 'externa' : 'caja_mayor', presupuesto: p.presupuesto || 0, financiador: p.patrocinador || null, origen_id: p.id });
}
for (const b of t('beneficiarios')) ins('ro_beneficiarios', { proyecto_id: ref('ro_proyectos', b.proyecto_id), nombre: b.nombre, tipo: b.tipo, edad: b.edad, autorizacion_datos: !!b.autorizacion_datos, autorizacion_imagen: !!b.autorizacion_imagen, origen_id: b.id });
const EA = { frio: 'prospecto', tibio: 'seguimiento', caliente: 'seguimiento', seguimiento: 'seguimiento', formalizada: 'activa', aliada: 'activa', descartada: 'descartada' };
for (const a of t('alianzas')) {
  ins('ro_alianzas', { proyecto_id: ref('ro_proyectos', a.proyecto_id), nombre: a.nombre_entidad, tipo: a.tipo_entidad, contacto: a.persona_contacto, telefono: a.telefono_contacto, correo: a.correo_contacto && /@/.test(a.correo_contacto) ? a.correo_contacto.toLowerCase() : null,
    municipio: a.municipio, estado: EA[a.estado] || 'prospecto', descripcion: [a.descripcion, a.observaciones].filter(Boolean).join('\n\n') || null, proximo_paso: a.proximo_paso, proximo_paso_fecha: dia(a.proximo_paso_fecha), ultimo_contacto: dia(a.ultimo_contacto), origen_id: a.id });
}

/* Reuniones y eventos */
const ER = { confirmada: 'confirmada', programada: 'programada', reprogramada: 'programada', cancelada: 'cancelada' };
for (const r of t('reuniones')) {
  const fecha = dia(r.fecha_inicio), est = ER[r.estado] || 'programada';
  ins('ro_reuniones', { tipo: r.categoria === 'club' ? 'reunion' : 'evento', titulo: r.tipo || 'Reunión', fecha, hora_ini: hora(r.fecha_inicio), hora_fin: hora(r.fecha_fin), lugar: r.lugar, modalidad: r.modalidad === 'virtual' ? 'virtual' : 'presencial',
    enlace: https(r.link), minuta: r.minuta, compromisos: r.compromisos, estado: est !== 'cancelada' && fecha < hoy ? 'realizada' : est, proyecto_id: ref('ro_proyectos', r.proyecto_id), origen_id: r.id });
}
const asis = (reu, soc, campo, valor) => sql.push(`INSERT INTO ro_asistencia (business_id, reunion_id, socio_id, ${campo}, created_at, updated_at) SELECT ${q(NEG)}, ${ref('ro_reuniones', reu)}, ${ref('ro_socios', soc)}, ${q(valor)}, ${ahora}, ${ahora} WHERE ${ref('ro_reuniones', reu)} IS NOT NULL AND ${ref('ro_socios', soc)} IS NOT NULL ON CONFLICT(business_id, reunion_id, socio_id) DO UPDATE SET ${campo} = excluded.${campo};`);
for (const r of t('reunion_respuestas')) asis(r.reunion_id, r.socio_id, 'respuesta', r.respuesta === 'confirmado' ? 'si' : 'no');
for (const a of t('asistencia')) asis(a.reunion_id, a.socio_id, 'presente', a.presente ? 1 : 0);

/* Tareas */
const ET = { completada: 'hecha', 'en curso': 'en_curso', pendiente: 'pendiente', cancelada: 'cancelada' };
for (const x of t('tareas')) {
  const resp = t('tarea_asignados').find((a) => a.tarea_id === x.id)?.socio_id || x.socio_id;
  const ck = t('tarea_checklist').filter((c) => c.tarea_id === x.id).sort((a, b) => a.orden - b.orden).map((c) => ({ texto: c.texto, hecho: !!c.hecho }));
  ins('ro_tareas', { titulo: x.titulo, descripcion: x.descripcion, estado: ET[x.estado] || 'pendiente', prioridad: ['alta', 'baja'].includes(x.prioridad) ? x.prioridad : 'normal', fecha_limite: dia(x.fecha_limite),
    socio_id: ref('ro_socios', resp), proyecto_id: ref('ro_proyectos', x.proyecto_id), reunion_id: ref('ro_reuniones', x.reunion_id), checklist: ck.length ? JSON.stringify(ck) : null, orden: x.orden || 0,
    completada_at: x.completada_at ? Date.parse(x.completada_at) : null, origen_id: x.id });
}

/* Finanzas: club → Caja menor, proyectos → Caja mayor */
const nota = (u) => (u && !https(u) ? `Comprobante en el sistema anterior: ${u}` : null);
for (const m of t('movimientos_club')) ins('ro_movimientos', { caja: 'menor', tipo: m.tipo === 'ingreso' ? 'ingreso' : 'egreso', fecha: m.fecha, concepto: m.concepto, categoria: m.categoria, monto: m.monto, comprobante_url: https(m.comprobante_url), observaciones: [m.observaciones, nota(m.comprobante_url)].filter(Boolean).join('\n') || null, origen_id: m.id });
for (const m of t('movimientos_proyecto')) ins('ro_movimientos', { caja: 'mayor', tipo: m.tipo === 'ingreso' ? 'ingreso' : 'egreso', fecha: m.fecha, concepto: m.concepto, categoria: m.categoria, monto: m.monto, proyecto_id: ref('ro_proyectos', m.proyecto_id), comprobante_url: https(m.comprobante_url), observaciones: nota(m.comprobante_url), origen_id: m.id });
// Traslados entre bolsillos: el bolsillo de los movimientos del club es la Caja menor; el otro, la Caja mayor
const bolsilloClub = t('movimientos_club').find((m) => m.bolsillo_id)?.bolsillo_id;
for (const x of t('traslados_bolsillo')) {
  const desde = x.desde_id === bolsilloClub ? 'menor' : 'mayor', hacia = desde === 'menor' ? 'mayor' : 'menor';
  ins('ro_movimientos', { caja: desde, tipo: 'egreso', fecha: x.fecha, concepto: x.concepto || 'Traslado', categoria: 'Traslado', monto: x.monto, traslado: x.id.slice(0, 12), origen_id: `${x.id}:e` });
  ins('ro_movimientos', { caja: hacia, tipo: 'ingreso', fecha: x.fecha, concepto: x.concepto || 'Traslado', categoria: 'Traslado', monto: x.monto, traslado: x.id.slice(0, 12), origen_id: `${x.id}:i` });
}

/* Cuotas */
for (const p of t('periodos_cuota')) ins('ro_periodos', { mes: `${p.anio}-${String(p.mes).padStart(2, '0')}`, nombre: p.nombre, monto: p.monto_esperado, vence: p.fecha_vencimiento, origen_id: p.id });
for (const p of t('pagos_cuota')) {
  ins('ro_pagos', { socio_id: ref('ro_socios', p.socio_id), monto: p.monto, fecha: p.fecha_pago, metodo: ['transferencia', 'nequi', 'daviplata', 'efectivo'].includes(p.metodo) ? p.metodo : 'otro', estado: p.verificado ? 'verificado' : 'pendiente',
    comprobante_url: https(p.comprobante_url), observaciones: [p.observaciones, nota(p.comprobante_url)].filter(Boolean).join('\n') || null, verificado_at: p.verificado_at ? Date.parse(p.verificado_at) : null, origen_id: p.id });
  if (p.verificado) {
    const soc = t('socios').find((s) => s.id === p.socio_id);
    ins('ro_movimientos', { caja: 'menor', tipo: 'ingreso', fecha: p.fecha_pago, concepto: `Cuota · ${soc?.nombre_completo || 'socio'}`, categoria: 'Cuotas', monto: p.monto, socio_id: ref('ro_socios', p.socio_id), pago_id: ref('ro_pagos', p.id), origen_id: `pago:${p.id}` });
  }
}

writeFileSync(OUT, `-- Importación de ${JSONF.split('/').pop()} al negocio ${NEG} (${new Date().toISOString()})\n${sql.join('\n')}\n`);
const n = (k) => t(k).length;
console.log(`Listo: ${OUT} (${sql.length} instrucciones) · socios ${n('socios')}, reuniones ${n('reuniones')}, tareas ${n('tareas')}, proyectos ${n('proyectos')}, alianzas ${n('alianzas')}, pagos ${n('pagos_cuota')}`);
