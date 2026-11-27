// Pruebas de los módulos de CD Rotaract: rutas clave y aislamiento entre clubes.
import { execSync } from 'node:child_process';
const sql = (q) => execSync(`npx wrangler d1 execute control-de-rotaract-db --local --persist-to .wrangler/state --command "${q}"`, { stdio: 'ignore' });
export default async function ({ check, newBusiness, newMember }) {
  const A = await newBusiness('Club A', { login: true });
  const B = await newBusiness('Club B', { login: true });
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const raw = { 'content-type': 'application/octet-stream' };
  const hoy = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10), mes = hoy.slice(0, 7);

  /* Socios: junta primero y activación */
  const pres = await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Camila Presidenta', cargo: 'Presidente/a del club', email: 'camila@ejemplo.com' } });
  const sec = await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Sara Secretaria', cargo: 'Secretario/a del club' } });
  const ana = await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Ana Socia', email: 'ana@ejemplo.com', fecha_ingreso: `${mes}-01` } });
  const lista = (await A.app('/api/socios/socios')).data.rows;
  check('Socios: la junta va primero, en orden de cargo', lista[0].id === pres.data.id && lista[1].id === sec.data.id && lista[2].id === ana.data.id && lista[0].junta && !lista[2].junta, JSON.stringify(lista.map((x) => x.nombre)));
  check('Socios: un correo repetido se rechaza', (await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Otra', email: 'ana@ejemplo.com' } })).status === 409);
  check('Socios: sin activar no hay certificado', (await A.app(`/api/socios/socios/${ana.data.id}/certificado`)).status === 409);
  const act = await A.app(`/api/socios/socios/${ana.data.id}/activar`, { method: 'POST', body: { fecha: `${mes}-01` } });
  const cert = await A.app(`/api/socios/socios/${ana.data.id}/certificado`);
  check('Socios: activar (con su fecha) genera el certificado con firmas', act.data.activado_at === `${mes}-01` && cert.status === 200 && cert.data.text.includes('Ana Socia') && cert.data.text.includes('Camila Presidenta') && cert.data.text.includes('Socio del club desde') && cert.data.text.includes('socio del club'));
  await A.app(`/api/socios/socios/${ana.data.id}`, { method: 'PATCH', body: { myrotary_id: '12345678', myrotary_at: `${mes}-02` } });
  const cert2 = await A.app(`/api/socios/socios/${ana.data.id}/certificado`);
  const anaR = (await A.app('/api/socios/socios')).data.rows.find((x) => x.id === ana.data.id);
  check('Socios: 3 fechas (ingreso, activación, My Rotary)', anaR.fecha_ingreso && anaR.activado_at && anaR.myrotary_at === `${mes}-02` && anaR.en_myrotary && cert2.status === 200);
  const PNGF = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const fp = await A.app(`/api/socios/socios/${pres.data.id}/firma?nombre=firma.png`, { method: 'POST', body: PNGF, headers: raw });
  const fa = await A.app(`/api/socios/socios/${ana.data.id}/firma?nombre=firma.png`, { method: 'POST', body: PNGF, headers: raw });
  const cert3 = await A.app(`/api/socios/socios/${ana.data.id}/certificado`);
  check('Socios: la junta sube su firma y sale en el certificado; un socio sin cargo no firma', fp.status === 200 && fa.status === 400 && cert3.data.text.includes(`/api/socios/firma/${pres.data.id}`) && (await A.app(`/api/socios/firma/${pres.data.id}`)).status === 200, `${fp.status} ${fa.status}`);
  check('Socios: activación con fecha futura se rechaza', (await A.app(`/api/socios/socios/${sec.data.id}/activar`, { method: 'POST', body: { fecha: '2999-01-01' } })).status === 400);
  check('Socios: B no ve ni activa los socios de A', (await B.app('/api/socios/socios')).data.rows.length === 0 && (await B.app(`/api/socios/socios/${ana.data.id}/activar`, { method: 'POST', body: {} })).status === 404);

  const staff = await newMember(A.id, 'staff');
  check('Socios: el personal no crea socios (403)', (await staff.app('/api/socios/socios', { method: 'POST', body: { nombre: 'X' } })).status === 403);
  check('Socios: el personal no ve datos privados', !('email' in (await staff.app('/api/socios/socios')).data.rows.find((x) => x.id === ana.data.id)));

  /* Reuniones */
  const reu = await A.app('/api/reuniones/reuniones', { method: 'POST', body: { tipo: 'reunion', titulo: 'Reunión de club', fecha: hoy, hora_ini: '19:00', hora_fin: '21:00' } });
  await A.app('/api/reuniones/reuniones', { method: 'POST', body: { tipo: 'evento', titulo: 'Jornada', fecha: hoy } });
  check('Reuniones: hora fuera de orden se rechaza', (await A.app('/api/reuniones/reuniones', { method: 'POST', body: { titulo: 'x', fecha: hoy, hora_ini: '20:00', hora_fin: '19:00' } })).status === 400);
  const cal = await A.app(`/api/reuniones/calendario?desde=${mes}-01&hasta=${mes}-31`);
  check('Reuniones: el calendario trae reuniones y eventos', cal.data.rows.length === 2 && cal.data.rows.some((x) => x.tipo === 'evento'));
  const asis = await A.app(`/api/reuniones/reuniones/${reu.data.id}/asistencia`, { method: 'PUT', body: { marcas: [{ socio_id: ana.data.id, presente: true }, { socio_id: pres.data.id, presente: false }] } });
  check('Reuniones: toma asistencia', asis.status === 200 && (await A.app('/api/reuniones/reuniones')).data.rows.find((x) => x.id === reu.data.id).presentes === 1);
  check('Reuniones: B no marca asistencia en A', (await B.app(`/api/reuniones/reuniones/${reu.data.id}/asistencia`, { method: 'PUT', body: { marcas: [] } })).status === 404);

  /* Tareas */
  const t = await staff.app('/api/tareas/tareas', { method: 'POST', body: { titulo: 'Conseguir refrigerios', socio_id: ana.data.id, checklist: JSON.stringify([{ texto: 'Cotizar', hecho: false }]) } });
  await staff.app(`/api/tareas/tareas/${t.data.id}`, { method: 'PATCH', body: { estado: 'hecha' } });
  const tt = (await A.app('/api/tareas/tareas')).data.rows[0];
  check('Tareas: el socio crea y mueve tareas', t.status === 201 && tt.estado === 'hecha' && tt.completada_at && tt.responsable === 'Ana Socia' && tt.checklist.length === 1);
  check('Tareas: B no ve las tareas de A', (await B.app('/api/tareas/tareas')).data.rows.length === 0);

  /* Impacto */
  check('Impacto: externa sin financiador se rechaza', (await A.app('/api/impacto/proyectos', { method: 'POST', body: { nombre: 'Pinta', financiacion: 'externa' } })).status === 400);
  const p = await A.app('/api/impacto/proyectos', { method: 'POST', body: { nombre: 'Pinta Colombia', estado: 'en_curso', financiacion: 'doble', financiador: 'Alcaldía', monto_caja_mayor: 500000, monto_externo: 2000000, beneficiados: 145 } });
  check('Impacto: un beneficiario sin comunidad se rechaza', (await A.app('/api/impacto/beneficiarios', { method: 'POST', body: { nombre: 'Niña 1', proyecto_id: p.data.id } })).status === 400);
  await A.app('/api/impacto/alianzas', { method: 'POST', body: { nombre: 'Proquident', proyecto_id: p.data.id, estado: 'seguimiento' } });
  await A.app('/api/tareas/tareas', { method: 'POST', body: { titulo: 'Visita', proyecto_id: p.data.id } });
  await A.app('/api/cajas/movimientos', { method: 'POST', body: { caja: 'mayor', tipo: 'egreso', fecha: hoy, concepto: 'Pintura', monto: 120000, proyecto_id: p.data.id } });
  const card = (await A.app('/api/impacto/tarjetas')).data.rows[0];
  check('Impacto: la tarjeta suma beneficiados, tareas, alianzas y gasto de la caja mayor', card.beneficiados_total === 145 && card.tareas === 1 && card.alianzas === 1 && card.gastado_caja_mayor === 120000 && card.financiacion === 'doble', JSON.stringify(card));
  check('Impacto: B no ve los proyectos de A', (await B.app('/api/impacto/tarjetas')).data.rows.length === 0);

  /* Finanzas: dos cajas */
  await A.app('/api/cajas/movimientos', { method: 'POST', body: { caja: 'menor', tipo: 'ingreso', fecha: hoy, concepto: 'Donación', monto: 300000 } });
  const tr = await A.app('/api/cajas/traslado', { method: 'POST', body: { desde: 'menor', monto: 100000 } });
  const res = (await A.app('/api/cajas/resumen')).data;
  check('Cajas: saldos por caja con traslado', tr.status === 201 && res.cajas[0].saldo === 200000 && res.cajas[1].saldo === -20000, JSON.stringify(res.cajas.map((x) => x.saldo)));
  check('Cajas: movimientos filtrados por caja', (await A.app('/api/cajas/movimientos?f_caja=mayor')).data.rows.every((x) => x.caja === 'mayor'));
  check('Cajas: el personal no ve las finanzas (403)', (await staff.app('/api/cajas/movimientos')).status === 403);
  check('Cajas: B no ve movimientos de A', (await B.app('/api/cajas/movimientos')).data.rows.length === 0);

  /* Cuotas: cartera e ingresos que entran a la caja menor */
  await A.app('/api/cuotas/periodos', { method: 'POST', body: { mes, monto: 25000 } });
  let k = (await A.app('/api/cuotas/cartera')).data.rows.find((x) => x.socio_id === ana.data.id);
  check('Cuotas: la cartera muestra lo que debe el socio', k.esperado === 25000 && k.saldo === 25000, JSON.stringify(k));
  // Ana reporta su pago desde «Lo tuyo» (queda pendiente) con comprobante; la junta lo verifica
  const anaU = await newMember(A.id, 'staff');
  const link = await A.app(`/api/socios/socios/${ana.data.id}/acceso`, { method: 'POST', body: {} });
  check('Socios: dar acceso devuelve el link de invitación', link.status === 200 && link.data.invite_url.includes('#invite='));
  // Se enlaza la ficha de Ana con un usuario de prueba (por correo) para «Lo tuyo»
  const vacio = await anaU.app('/api/lotuyo');
  check('Lo tuyo: sin ficha enlazada responde vacío', vacio.status === 200 && vacio.data.socio === null);
  const me = (await staff.app('/api/me')).data;
  await A.app(`/api/socios/socios/${sec.data.id}`, { method: 'PATCH', body: { email: me.user.email } });
  const lt = await staff.app('/api/lotuyo');
  check('Lo tuyo: enlaza la ficha por correo y muestra el carnet', lt.data.socio?.nombre === 'Sara Secretaria' && lt.data.socio.cargo === 'Secretario/a del club');
  check('Lo tuyo: sus cuotas traen los 12 meses del año rotario', !lt.data.cuota || (lt.data.cuota.meses.length === 12 && lt.data.cuota.meses[0].mes.endsWith('-07')), JSON.stringify(lt.data.cuota));
  check('Lo tuyo: edita su carnet', (await staff.app('/api/lotuyo/carnet', { method: 'PATCH', body: { telefono: '3001234567', profesion: 'Ingeniera' } })).status === 200 && (await staff.app('/api/lotuyo/carnet')).data.carnet.profesion === 'Ingeniera');
  const rp = await staff.app('/api/lotuyo/pagos', { method: 'POST', body: { monto: 25000, metodo: 'nequi' } });
  const cp = await staff.app(`/api/lotuyo/pagos/${rp.data.id}/comprobante?nombre=pago`, { method: 'POST', body: PNG, headers: raw });
  check('Lo tuyo: reporta su pago con comprobante (pendiente)', rp.status === 201 && rp.data.estado === 'pendiente' && cp.status === 200);
  check('Cuotas: un pago pendiente no entra a la caja', (await A.app('/api/cajas/resumen')).data.cajas[0].saldo === 200000);
  await A.app(`/api/cuotas/pagos/${rp.data.id}/verificar`, { method: 'POST', body: {} });
  const pagos = (await A.app('/api/cuotas/pagos')).data.rows;
  check('Cuotas: verificado entra a la caja menor y se ve con comprobante', (await A.app('/api/cajas/resumen')).data.cajas[0].saldo === 225000 && pagos[0].estado === 'verificado' && pagos[0].comprobante === true);
  k = (await A.app('/api/cuotas/cartera')).data.rows.find((x) => x.socio_id === sec.data.id);
  check('Cuotas: el socio queda al día', k.estado === 'al_dia' && k.saldo === 0, JSON.stringify(k));
  { const y = (await A.app(`/api/cuotas/anio?anio=${+mes.slice(5) >= 7 ? +mes.slice(0, 4) : +mes.slice(0, 4) - 1}`)).data, f = y.rows.find((x) => x.socio_id === sec.data.id);
    check('Cuotas: año rotario de julio a junio con el mes pagado', y.meses.length === 12 && y.meses[0].mes.endsWith('-07') && f?.celdas.find((c) => c.mes === mes)?.estado === 'pagado', JSON.stringify(f)); }
  check('Cajas: el ingreso de cuota no se borra desde Finanzas (409)', (await A.app(`/api/cajas/movimientos/${(await A.app('/api/cajas/movimientos?f_categoria=Cuotas')).data.rows[0].id}`, { method: 'DELETE' })).status === 409);
  await A.app(`/api/cuotas/pagos/${rp.data.id}/anular`, { method: 'POST', body: {} });
  check('Cuotas: anular saca el ingreso de la caja', (await A.app('/api/cajas/resumen')).data.cajas[0].saldo === 200000);
  check('Cuotas: el personal no ve la cartera (403) y B no ve pagos de A', (await anaU.app('/api/cuotas/cartera')).status === 403 && (await B.app('/api/cuotas/pagos')).data.rows.length === 0);

  /* Cuotas editables (solo quien tiene Cuotas) y acceso de cada socio */
  const pv2 = await A.app('/api/cuotas/pagos', { method: 'POST', body: { socio_id: ana.data.id, monto: 25000 } });
  const ed2 = await A.app(`/api/cuotas/pagos/${pv2.data.id}`, { method: 'PATCH', body: { monto: 30000, metodo: 'nequi' } });
  const mv2 = (await A.app('/api/cajas/movimientos?limit=1000')).data.rows.find((m) => m.pago_id === pv2.data.id);
  check('Cuotas: editar un pago ajusta su ingreso en la Caja menor', ed2.status === 200 && mv2?.monto === 30000 && mv2.cuota?.metodo === 'nequi', JSON.stringify(mv2));
  check('Cuotas: el personal no edita pagos (403)', (await anaU.app(`/api/cuotas/pagos/${pv2.data.id}`, { method: 'PATCH', body: { monto: 1 } })).status === 403);
  const conAcc = (await A.app('/api/socios/socios')).data.rows;
  check('Socios: cada socio muestra su acceso (la junta como Junta)', conAcc.find((x) => x.id === sec.data.id)?.acceso?.rol === 'admin' && conAcc.find((x) => x.id === ana.data.id)?.acceso?.rol === 'staff' && conAcc.find((x) => x.id === pres.data.id)?.acceso?.estado === 'invitado', JSON.stringify(conAcc.map((x) => [x.nombre, x.acceso])));

  /* Quién paga cuota y junta en el equipo */
  const asp = await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Andrés Aspirante', tipo_membresia: 'aspirante' } });
  const enCart = async () => (await A.app('/api/cuotas/cartera')).data.rows.some((x) => x.socio_id === asp.data.id);
  const sinAsp = await enCart();
  await A.app('/api/cuotas/config', { method: 'PUT', body: { aspirantes: true, honorarios: false } });
  const conAsp = await enCart();
  check('Cuotas: el club decide si los aspirantes pagan cuota', !sinAsp && conAsp && (await A.app('/api/cuotas/config')).data.aspirantes === true);
  const ext = await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Eva Externa', tipo_membresia: 'socio_externo' } });
  check('Cuotas: los socios externos no pagan cuota', !(await A.app('/api/cuotas/cartera')).data.rows.some((x) => x.socio_id === ext.data.id));
  const vice = await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Víctor Vice', cargo: 'Vicepresidente/a del club', email: `vice${Date.now()}@ejemplo.com` } });
  const eq = (await A.app('/api/team')).data;
  const vu = (await A.app('/api/socios/socios')).data.rows.find((x) => x.id === vice.data.id);
  check('Equipo: la junta entra sola al equipo con acceso de Junta', vu?.acceso?.rol === 'admin' && eq.users.some((u) => u.id === vu.user_id && u.role === 'admin'), JSON.stringify(vu?.acceso));
  check('Equipo: avisa quién de la junta no tiene correo', eq.junta?.sin_correo?.includes('Camila Presidenta') === false && Array.isArray(eq.junta?.sin_correo), JSON.stringify(eq.junta));

  /* Impacto: comunidades con beneficiarios, aportes del club o de alianzas, documentos con tablas */
  const com = await A.app('/api/impacto/comunidades', { method: 'POST', body: { nombre: 'Fundación Jardín de Amor', lugar: 'Medellín' } });
  const pj2 = await A.app('/api/impacto/proyectos', { method: 'POST', body: { nombre: 'Navidad en Jardín de Amor', comunidad_id: com.data.id, presupuesto: 500000 } });
  await A.app('/api/impacto/beneficiarios', { method: 'POST', body: { nombre: 'Niño Jardín', comunidad_id: com.data.id } });
  await A.app('/api/impacto/beneficiarios', { method: 'POST', body: { nombre: 'Niña Jardín', proyecto_id: pj2.data.id } });
  const alc = await A.app('/api/impacto/alianzas', { method: 'POST', body: { nombre: 'Alcaldía', tipo_aporte: 'financiera' } });
  check('Impacto: aporte de alianza sin elegir la alianza se rechaza', (await A.app('/api/impacto/aportes', { method: 'POST', body: { proyecto_id: pj2.data.id, origen: 'alianza', monto: 1 } })).status === 400);
  await A.app('/api/impacto/aportes', { method: 'POST', body: { proyecto_id: pj2.data.id, origen: 'club', monto: 200000 } });
  const apA = await A.app('/api/impacto/aportes', { method: 'POST', body: { proyecto_id: pj2.data.id, origen: 'alianza', alianza_id: alc.data.id, monto: 300000, recibido: 100000 } });
  const dl = await A.app(`/api/impacto/proyectos/${pj2.data.id}/docs`, { method: 'POST', body: { nombre: 'Propuesta', url: 'https://ejemplo.com/propuesta.pdf' } });
  const df = await A.app(`/api/impacto/proyectos/${pj2.data.id}/docs?nombre=acta.png`, { method: 'POST', body: PNG, headers: raw });
  const arc = await A.app('/api/impacto/archivos?nombre=foto.png', { method: 'POST', body: PNG, headers: raw });
  const dd = await A.app(`/api/impacto/proyectos/${pj2.data.id}/docs`, { method: 'POST', body: { nombre: 'Presupuesto', bloques: [{ tipo: 'titulo', texto: 'Gastos' }, { tipo: 'tabla', filas: [['Ítem', 'Valor'], ['Regalos', '300000', 'x']] }, { tipo: 'archivo', key: arc.data?.key, nombre: 'foto.png', tipoArchivo: 'image/png' }] } });
  const leido = (await A.app(`/api/impacto/docs/${dd.data?.id}`)).data;
  check('Impacto: documento con tabla (filas parejas) e imagen', dd.status === 201 && leido.bloques?.[1]?.filas?.[0]?.length === 3 && leido.bloques[2].key === arc.data.key, JSON.stringify(leido));
  check('Impacto: B no puede usar archivos de A en sus documentos', (await B.app(`/api/impacto/archivos/${encodeURIComponent(arc.data.key)}`)).status === 404);
  check('Impacto: editar el documento', (await A.app(`/api/impacto/docs/${dd.data.id}`, { method: 'PATCH', body: { nombre: 'Presupuesto final', bloques: [{ tipo: 'texto', texto: 'ok' }] } })).status === 200);
  const det = (await A.app(`/api/impacto/proyectos/${pj2.data.id}/detalle`)).data;
  check('Impacto: el proyecto trae la comunidad con TODOS sus beneficiarios, documentos y aportes', det.comunidad?.nombre === 'Fundación Jardín de Amor' && det.beneficiarios.length === 2 && det.docs.length === 3 && det.aportes.length === 2 && dl.status === 201 && df.status === 201, JSON.stringify({ b: det.beneficiarios.length, d: det.docs.length, a: det.aportes.length }));
  check('Impacto: los aportes recalculan la financiación (doble)', det.proyecto.financiacion === 'doble' && det.proyecto.monto_caja_mayor === 200000 && det.proyecto.monto_externo === 300000 && det.proyecto.financiador === 'Alcaldía' && det.proyecto.alianzas === 1, JSON.stringify(det.proyecto));
  await A.app(`/api/impacto/aportes/${apA.data.id}`, { method: 'DELETE' });
  check('Impacto: sin alianzas vuelve a Caja mayor', (await A.app(`/api/impacto/proyectos/${pj2.data.id}/detalle`)).data.proyecto.financiacion === 'caja_mayor');
  const cd = (await A.app(`/api/impacto/comunidades/${com.data.id}/detalle`)).data;
  check('Impacto: la comunidad muestra sus proyectos y beneficiarios', cd.comunidad.beneficiarios === 2 && cd.proyectos.length === 1, JSON.stringify(cd.comunidad));
  check('Impacto: no se borra una comunidad con beneficiarios', (await A.app(`/api/impacto/comunidades/${com.data.id}`, { method: 'DELETE' })).status === 409);
  check('Impacto: B no ve los documentos ni las comunidades de A', (await B.app(`/api/impacto/docs/${dl.data.id}`)).status === 404 && (await B.app('/api/impacto/comunidades')).data.rows.length === 0);

  /* Financiadores con soportes: el gasto del club va a Finanzas con el nombre del proyecto */
  const apC = await A.app('/api/impacto/aportes', { method: 'POST', body: { proyecto_id: pj2.data.id, origen: 'club', caja: 'menor', monto: 100000 } });
  const so1 = await A.app(`/api/impacto/aportes/${apC.data.id}/soportes`, { method: 'POST', body: { fecha: '2026-11-20', monto: 40000, forma: 'factura', notas: 'Dulces' } });
  const soA = await A.app(`/api/impacto/soportes/${so1.data.id}/archivo?nombre=f.png`, { method: 'POST', body: PNG, headers: raw });
  const mv = (await A.app('/api/cajas/movimientos?f_caja=menor')).data.rows.find((x) => x.id === so1.data.movimiento_id);
  check('Impacto: el gasto del club queda en Finanzas (caja elegida, nombre del proyecto y comprobante)', mv && mv.tipo === 'egreso' && mv.monto === 40000 && mv.concepto.includes('Navidad en Jardín de Amor') && mv.proyecto_id === pj2.data.id && mv.comprobante && soA.status === 200, JSON.stringify(mv));
  const apRow = () => A.app(`/api/impacto/proyectos/${pj2.data.id}/detalle`).then((x) => x.data.aportes.find((a) => a.id === apC.data.id));
  check('Impacto: lo gastado del club sale de sus soportes', (await apRow()).recibido === 40000);
  await A.app(`/api/cajas/movimientos/${mv.id}`, { method: 'PATCH', body: { monto: 45000 } });
  check('Impacto: si Finanzas corrige el valor, el proyecto lo refleja', (await apRow()).recibido === 45000);
  await A.app(`/api/impacto/soportes/${so1.data.id}`, { method: 'DELETE' });
  check('Impacto: borrar el soporte borra el egreso de Finanzas', !(await A.app('/api/cajas/movimientos?f_caja=menor')).data.rows.some((x) => x.id === mv.id) && (await apRow()).recibido === 0);
  const apB = await A.app('/api/impacto/aportes', { method: 'POST', body: { proyecto_id: pj2.data.id, origen: 'alianza', alianza_id: alc.data.id, monto: 50000 } });
  const so2 = await A.app(`/api/impacto/aportes/${apB.data.id}/soportes`, { method: 'POST', body: { fecha: '2026-11-21', monto: 20000, forma: 'cuenta_cobro' } });
  check('Impacto: el soporte de una alianza suma lo recibido sin tocar las cajas', so2.status === 201 && !so2.data.movimiento_id && (await A.app(`/api/impacto/proyectos/${pj2.data.id}/detalle`)).data.aportes.find((a) => a.id === apB.data.id).recibido === 20000);
  const so3 = await A.app(`/api/impacto/aportes/${apC.data.id}/soportes`, { method: 'POST', body: { fecha: '2026-11-22', monto: 10000, forma: 'recibo' } });
  await A.app('/api/cajas/movimientos', { method: 'POST', body: { caja: 'mayor', tipo: 'egreso', fecha: '2026-11-22', concepto: 'Transporte directo', categoria: 'Transporte', monto: 5000, proyecto_id: pj2.data.id } });
  const fz = (await A.app(`/api/impacto/proyectos/${pj2.data.id}/detalle`)).data;
  check('Impacto: Finanzas del proyecto = soportes + movimientos directos, sin duplicar', fz.soportes.some((x) => x.id === so3.data.id) && fz.movimientos.some((x) => x.concepto === 'Transporte directo') && !fz.movimientos.some((x) => x.id === so3.data.movimiento_id), JSON.stringify(fz.movimientos));
  const so4 = await A.app(`/api/impacto/aportes/${apC.data.id}/soportes`, { method: 'POST', body: { fecha: '2026-11-23', forma: 'recibo', items: [{ descripcion: 'Pintura', cantidad: 2, valor: 15000 }, { descripcion: 'Brochas', cantidad: 3, valor: 2000 }] } });
  const m4 = () => A.app('/api/cajas/movimientos?f_caja=menor').then((x) => x.data.rows.find((y) => y.id === so4.data.movimiento_id));
  check('Impacto: comprobante con varios ítems suma su total y lo lleva a Finanzas', (await m4())?.monto === 36000, JSON.stringify(await m4()));
  const pe = await A.app(`/api/impacto/soportes/${so4.data.id}`, { method: 'PATCH', body: { fecha: '2026-11-24', forma: 'cuenta_cobro', items: [{ descripcion: 'Pintura', cantidad: 1, valor: 15000 }] } });
  const m4b = await m4();
  check('Impacto: editar el comprobante cambia también el egreso de Finanzas', pe.status === 200 && m4b.monto === 15000 && m4b.fecha === '2026-11-24' && m4b.concepto.includes('Cuenta de cobro'), JSON.stringify(m4b));
  check('Impacto: B no puede editar comprobantes de A', (await B.app(`/api/impacto/soportes/${so4.data.id}`, { method: 'PATCH', body: { monto: 1 } })).status === 404);
  /* Encuestas de la comunidad */
  const pls = (await A.app('/api/impacto/encuestas/plantillas')).data.rows;
  const pc = pls.find((x) => x.tipo === 'conocimiento');
  check('Encuestas: hay plantillas (caracterización y conocimientos con respuestas correctas)', pls.some((x) => x.tipo === 'caracterizacion') && pc?.preguntas.every((q) => q.correcta?.length));
  const en = await A.app('/api/impacto/encuestas', { method: 'POST', body: { titulo: pc.titulo, tipo: 'conocimiento', comunidad_id: com.data.id, preguntas: pc.preguntas } });
  const ben1 = (await A.app(`/api/impacto/beneficiarios?f_comunidad_id=${com.data.id}`)).data.rows[0];
  const correctas = Object.fromEntries(pc.preguntas.map((q) => [q.id, q.correcta[0]]));
  const re1 = await A.app(`/api/impacto/encuestas/${en.data.id}/respuestas`, { method: 'POST', body: { beneficiario_id: ben1.id, respuestas: correctas } });
  check('Encuestas: respuesta con puntaje (todo correcto)', re1.status === 201 && re1.data.puntaje === re1.data.max && re1.data.max === pc.preguntas.length, JSON.stringify(re1.data));
  const malas = Object.fromEntries(pc.preguntas.map((q) => [q.id, q.tema === 'Economía' ? q.correcta[0] : (q.correcta[0] + 1) % q.opciones.length]));
  await A.app(`/api/impacto/encuestas/${en.data.id}/respuestas`, { method: 'POST', body: { beneficiario_id: ben1.id, respuestas: malas } });
  const rese = (await A.app(`/api/impacto/encuestas/${en.data.id}/resultados`)).data;
  const eco = rese.temas.find((t) => t.tema === 'Economía'), emo = rese.temas.find((t) => t.tema === 'Salud emocional');
  check('Encuestas: resultados por tema y por pregunta', rese.total === 2 && eco.pct === 100 && emo.pct === 50 && rese.preguntas[0].conteo.reduce((t, n) => t + n, 0) === 2 && rese.respuestas[0].beneficiario, JSON.stringify(rese.temas));
  check('Encuestas: no se borra una encuesta con respuestas', (await A.app(`/api/impacto/encuestas/${en.data.id}`, { method: 'DELETE' })).status === 409);
  check('Encuestas: preguntas inválidas se rechazan', (await A.app('/api/impacto/encuestas', { method: 'POST', body: { titulo: 'Mala', preguntas: [{ texto: 'x', tipo: 'unica', opciones: ['solo una'] }] } })).status === 400);
  check('Encuestas: B no ve los resultados de A', (await B.app(`/api/impacto/encuestas/${en.data.id}/resultados`)).status === 404);
  const guion = JSON.stringify({ titulo: 'Caracterización IA', objetivo: 'Conocer familias', tipo: 'caracterizacion', preguntas: [{ tema: 'Hogar', texto: '¿Cuántos viven?', tipo: 'numero' }, { tema: 'Hogar', texto: 'Vivienda', tipo: 'unica', opciones: ['Propia', 'Arriendo'] }] });
  const gen = await A.app('/api/impacto/encuestas/generar', { method: 'POST', body: { pedido: `familias [[GUION]]${guion}[[/GUION]]`, comunidad_id: com.data.id } });
  check('Encuestas: crear con IA devuelve un borrador limpio', gen.status === 200 && gen.data.preguntas.length === 2 && gen.data.titulo === 'Caracterización IA', JSON.stringify(gen.data).slice(0, 300));
  check('Impacto: B no ve soportes de A', (await B.app(`/api/impacto/soportes/${so2.data.id}/archivo`)).status === 404);
  const card2 = (await A.app('/api/impacto/tarjetas')).data.rows.find((x) => x.id === pj2.data.id);
  check('Impacto: la tarjeta trae responsable y comunidades', Array.isArray(card2.comunidades) && card2.comunidades.includes('Fundación Jardín de Amor') && 'lider' in card2);

  /* Certificados: junta del año y reconocimientos */
  const cj = await A.app('/api/socios/certificados/junta', { method: 'POST', body: {} });
  const cj2 = await A.app('/api/socios/certificados/junta', { method: 'POST', body: {} });
  const cr = await A.app('/api/socios/certificados', { method: 'POST', body: { tipo: 'reconocimiento', socio_id: ana.data.id, titulo: 'Socio del año', texto: 'por su liderazgo' } });
  const certs = (await A.app('/api/socios/certificados')).data.rows;
  const verJ = await A.app(`/api/socios/certificados/${certs.find((k) => k.tipo === 'junta')?.id}`), verR = await A.app(`/api/socios/certificados/${cr.data.id}`);
  check('Certificados: junta del año (una vez) y reconocimiento con su título', cj.data.creados >= 2 && cj2.data.creados === 0 && cr.status === 201 && verJ.data.text?.includes('Certificado de servicio') && verR.data.text?.includes('Socio del año') && verR.data.text.includes('por su liderazgo'), JSON.stringify(cj.data));
  await A.app('/api/socios/club', { method: 'PUT', body: { numero: '215847', fundado: '2017-07-20', patrocinador: 'Club Rotario Prueba' } });
  const cclub = await A.app('/api/socios/club/certificado');
  check('Certificados: el del club (organización) lleva número, fundación y patrocinador', cclub.status === 200 && cclub.data.text.includes('Club No. 215847') && cclub.data.text.includes('Club Rotario Prueba') && cclub.data.text.includes('Certificado de organización'));
  check('Certificados: B no ve los de A y un socio no ve los de otro', (await B.app(`/api/socios/certificados/${cr.data.id}`)).status === 404 && (await anaU.app('/api/socios/certificados')).status === 403);

  /* Reuniones: listas del año, invitados externos (y enlace público), acta por el orden del día */
  const rr = (await A.app('/api/reuniones/reuniones', { method: 'POST', body: { titulo: 'Reunión ordinaria', fecha: hoy, hora_ini: '19:00' } })).data;
  const anioRot = +hoy.slice(5, 7) >= 7 ? +hoy.slice(0, 4) : +hoy.slice(0, 4) - 1;
  const la = (await A.app(`/api/reuniones/anio?anio=${anioRot}&tipo=reunion`)).data;
  check('Reuniones: lista del año rotario (julio a junio) sin exponer el enlace', la.rows.some((x) => x.id === rr.id) && !('token' in la.rows[0]));
  await A.app(`/api/reuniones/reuniones/${rr.id}/invitados`, { method: 'POST', body: { nombre: 'Rotario Visitante', procedencia: 'Club Rotario Prueba', tipo: 'rotario' } });
  const enl = (await A.app(`/api/reuniones/reuniones/${rr.id}/enlace`, { method: 'POST', body: {} })).data;
  const tok = enl.url.split('/r/')[1];
  const pag = await fetch(enl.url.replace(/^https?:\/\/[^/]+/, 'http://localhost:8799'));
  const pub = await fetch(`http://localhost:8799/api/publico/r/${tok}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-app': '1' }, body: JSON.stringify({ nombre: 'Invitada Externa', tipo: 'invitado', autoriza: true }) });
  const sinAut = await fetch(`http://localhost:8799/api/publico/r/${tok}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-app': '1' }, body: JSON.stringify({ nombre: 'X' }) });
  const invs = (await A.app(`/api/reuniones/reuniones/${rr.id}/invitados`)).data.rows;
  check('Reuniones: invitados externos por la junta y por el enlace (con autorización de datos)', pag.status === 200 && pub.status === 201 && sinAut.status === 400 && invs.length === 2 && invs.some((x) => x.via === 'enlace'), `${pag.status} ${pub.status} ${sinAut.status}`);
  check('Reuniones: B no ve los invitados de A', (await B.app(`/api/reuniones/reuniones/${rr.id}/invitados`)).status === 404);
  const ad = (await A.app(`/api/reuniones/reuniones/${rr.id}/acta-datos`)).data;
  ad.acta.items[0].notas = 'Se abrió a las 7:05 p. m.';
  const ga = await A.app(`/api/reuniones/reuniones/${rr.id}/acta-datos`, { method: 'PUT', body: { ...ad.acta, estado: 'aprobada' } });
  const ah = await A.app(`/api/reuniones/reuniones/${rr.id}/acta`);
  check('Reuniones: acta con el orden del día sugerido (8 puntos), guardada e imprimible', ad.acta.items.length === 8 && ad.acta.items[0].titulo === 'Toque de campana' && ga.status === 200 && ah.data.text.includes('Se abrió a las 7:05') && ah.data.text.includes('Invitada Externa') && ah.data.text.includes('APROBADA'));

  const ad2 = (await A.app(`/api/reuniones/reuniones/${rr.id}/acta-datos`)).data.acta;
  ad2.items[0].responsable_id = pres.data.id; ad2.items[0].minutos = 5; ad2.items[0].hecho = true;
  await A.app(`/api/reuniones/reuniones/${rr.id}/acta-datos`, { method: 'PUT', body: { ...ad2, inicio: '19:05', fin: '20:40', recaudo: 35000, acta_anterior: true } });
  const ad3 = (await A.app(`/api/reuniones/reuniones/${rr.id}/acta-datos`)).data.acta, ah2 = await A.app(`/api/reuniones/reuniones/${rr.id}/acta`);
  check('Reuniones: conducción guarda responsable, minutos, hora de inicio y fin, cajita y acta anterior', ad3.items[0].responsable_id === pres.data.id && ad3.items[0].minutos === 5 && ad3.inicio === '19:05' && ad3.recaudo === 35000 && ah2.data.text.includes('Camila Presidenta') && ah2.data.text.includes('Inicio 19:05'));
  const cj0 = (await A.app('/api/cajas/cajita')).data, filaC = cj0.rows.find((x) => x.id === rr.id);
  const ing = await A.app(`/api/cajas/cajita/${rr.id}/ingresar`, { method: 'POST', body: {} }), ing2 = await A.app(`/api/cajas/cajita/${rr.id}/ingresar`, { method: 'POST', body: {} });
  const cj1 = (await A.app('/api/cajas/cajita')).data;
  check('Finanzas: cajita de macería por reunión y pasa a la Caja menor una sola vez', filaC?.recaudo === 35000 && ing.status === 201 && ing2.status === 409 && cj1.rows.find((x) => x.id === rr.id)?.movimiento_id && cj1.pendiente === cj0.pendiente - 35000, JSON.stringify(filaC));
  check('Finanzas: el personal no ve la cajita', (await anaU.app('/api/cajas/cajita')).status === 403);
  const ev3 = (await A.app('/api/reuniones/reuniones', { method: 'POST', body: { tipo: 'obra', titulo: 'Jornada', fecha: hoy } })).data;
  check('Reuniones: una obra arranca con su propia agenda (no el orden del día de reunión)', (await A.app(`/api/reuniones/reuniones/${ev3.id}/acta-datos`)).data.acta.items[0].titulo === 'Llegada y registro');

  /* Obras ancladas a proyectos de Impacto */
  const pob = (await A.app('/api/impacto/proyectos', { method: 'POST', body: { nombre: 'Obra de prueba', financiacion: 'caja_mayor' } })).data;
  const ob1 = await A.app('/api/reuniones/reuniones', { method: 'POST', body: { tipo: 'obra', titulo: 'Jornada de pintura', fecha: hoy, proyecto_id: pob.id } });
  const detO = (await A.app(`/api/impacto/proyectos/${pob.id}/detalle`)).data, listO = (await A.app(`/api/reuniones/anio?anio=${anioRot}&tipo=obra`)).data.rows;
  check('Reuniones: obra anclada a un proyecto (sale en las actividades del proyecto y en la lista de obras)', ob1.status === 201 && detO.actividades?.some((x) => x.id === ob1.data.id) && listO.find((x) => x.id === ob1.data.id)?.proyecto === 'Obra de prueba', JSON.stringify(detO.actividades));

  /* Juegos: salas con código, turnos del servidor y aislamiento entre clubes */
  const meA = (await A.app('/api/me')).data;
  await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Dueño Jugador', email: meA.user.email } });
  const cat = (await A.app('/api/juegos/catalogo')).data.rows;
  const sj = (await A.app('/api/juegos/salas', { method: 'POST', body: { juego: 'tictactoe' } })).data;
  const un = await staff.app('/api/juegos/unirse', { method: 'POST', body: { codigo: sj.sala.codigo } });
  const unB = await B.app('/api/juegos/unirse', { method: 'POST', body: { codigo: sj.sala.codigo } });
  check('Juegos: 9 juegos; sala con código; se une otro socio; otro club no entra', cat.length === 9 && sj.sala.codigo.length === 4 && un.status === 200 && un.data.rol === 'jugador' && unB.status === 404, `${un.status} ${unB.status}`);
  check('Juegos: solo quien creó la sala la empieza', (await staff.app(`/api/juegos/salas/${sj.sala.id}/iniciar`, { method: 'POST', body: {} })).status === 403);
  const ini = (await A.app(`/api/juegos/salas/${sj.sala.id}/iniciar`, { method: 'POST', body: {} })).data;
  const turno = ini.juego.turno, yoA = ini.yo, otroCli = turno === yoA ? staff : A, mioCli = turno === yoA ? A : staff;
  const fueraTurno = await otroCli.app(`/api/juegos/salas/${sj.sala.id}/accion`, { method: 'POST', body: { tipo: 'marcar', datos: { c: 0 } } });
  const bien = await mioCli.app(`/api/juegos/salas/${sj.sala.id}/accion`, { method: 'POST', body: { tipo: 'marcar', datos: { c: 4 } } });
  const sinCambio = (await A.app(`/api/juegos/salas/${sj.sala.id}?v=${bien.data.v}`)).data;
  check('Juegos: el servidor manda en los turnos y solo envía cambios', ini.sala.estado === 'jugando' && fueraTurno.status === 400 && bien.data.juego.tablero[4] && !sinCambio.jugadores, `${fueraTurno.status}`);
  const sd = (await A.app('/api/juegos/salas', { method: 'POST', body: { juego: 'domino' } })).data;
  await staff.app('/api/juegos/unirse', { method: 'POST', body: { codigo: sd.sala.codigo } });
  const dA = (await A.app(`/api/juegos/salas/${sd.sala.id}/iniciar`, { method: 'POST', body: {} })).data, dS = (await staff.app(`/api/juegos/salas/${sd.sala.id}`)).data;
  check('Juegos: cada quien ve solo sus fichas', dA.juego.mi_mano.length === 7 && dS.juego.mi_mano.length === 7 && JSON.stringify(dA.juego.mi_mano) !== JSON.stringify(dS.juego.mi_mano) && !('manos' in dA.juego));
  await A.app(`/api/juegos/salas/${sd.sala.id}/cerrar`, { method: 'POST', body: {} });
  check('Juegos: B no ve las salas de A', (await B.app(`/api/juegos/salas/${sj.sala.id}`)).status === 404 && (await B.app('/api/juegos/salas')).data.abiertas.length === 0);

  /* Distrito: ve los clubes de su código (solo lectura) y les pone la cuota distrital → Finanzas · Proyectado del club */
  const D = await newBusiness('Distrito 4271', { login: true });
  sql(`INSERT OR REPLACE INTO ro_club_config (business_id, distrito, es_distrito) VALUES ('${D.id}', '4271', 1), ('${B.id}', '9999', 0)`);
  check('Distrito: un club no entra al tablero del distrito (403)', (await A.app('/api/distrito/tablero')).status === 403);
  const tab = (await D.app('/api/distrito/tablero')).data;
  check('Distrito: ve los clubes de su código y no los de otro distrito', tab.clubes.some((k) => k.id === A.id) && !tab.clubes.some((k) => k.id === B.id || k.id === D.id) && tab.meses.length === 12, JSON.stringify(tab.clubes?.map((k) => k.nombre)));
  check('Distrito: detalle del club en solo lectura; el de otro distrito no (404)', (await D.app(`/api/distrito/clubes/${A.id}`)).data.socios?.length >= 3 && (await D.app(`/api/distrito/clubes/${B.id}`)).status === 404);
  const vence = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const vs = 10000 + Math.floor(Math.random() * 900) + 1;   // valor único: la base local guarda cuotas de corridas anteriores
  const qd = await D.app('/api/distrito/cuotas', { method: 'POST', body: { nombre: 'Cuota distrital prueba', valor_socio: vs, vence } });
  const od = await D.app('/api/distrito/orden', { method: 'PUT', body: { items: [{ titulo: 'Apertura' }, { titulo: 'Informe' }, { titulo: 'Cierre' }] } });
  check('Distrito: edita el orden del día y los clubes lo usan; un club no lo puede cambiar', od.status === 200 && (await A.app('/api/reuniones/orden')).data.items.length === 3 && (await A.app('/api/distrito/orden', { method: 'PUT', body: { items: [] } })).status === 403);
  await D.app('/api/distrito/orden', { method: 'PUT', body: { items: [] } });
  check('Distrito: un club no puede crear cuotas distritales', (await A.app('/api/distrito/cuotas', { method: 'POST', body: { nombre: 'x', valor_socio: 1, vence } })).status === 403);
  let pj = (await A.app('/api/cajas/proyectado')).data, ob = pj.rubros.find((r) => r.categoria === 'Obligaciones RI y Distrito')?.cuotas_distritales.find((o) => o.id === qd.data.id);
  check('Finanzas: la cuota distrital llega al club como obligación proyectada', qd.status === 201 && ob && ob.total === ob.socios * vs && ob.socios > 0 && pj.meses.length === 12 && pj.meses.some((m) => m.oblig_proy >= ob.total) && pj.por_pagar >= ob.total && pj.falta === Math.max(0, pj.por_pagar - pj.saldo), JSON.stringify(ob));
  check('Finanzas: un club de otro distrito no la ve ni la paga', !(await B.app('/api/cajas/proyectado')).data.rubros.find((r) => r.categoria === 'Obligaciones RI y Distrito').valor_distrito && (await B.app(`/api/cajas/distrital/${qd.data.id}/pagar`, { method: 'POST', body: { monto: 1000 } })).status === 404);
  const pg = await A.app('/api/cajas/rubros/pagar', { method: 'POST', body: { categoria: 'Obligaciones RI y Distrito', monto: ob.total } });
  const cq = (await D.app('/api/distrito/cuotas')).data.rows.find((q) => q.id === qd.data.id)?.clubes.find((x) => x.club_id === A.id);
  check('Finanzas: el club la paga (egreso de la caja menor) y el distrito lo ve', pg.status === 201 && cq?.estado === 'pagada' && (await A.app('/api/cajas/proyectado')).data.rubros.find((r) => r.categoria === 'Obligaciones RI y Distrito').cuotas_distritales.find((o) => o.id === qd.data.id)?.estado === 'pagada', JSON.stringify(cq));
  check('Distrito: no se borra una cuota que ya pagaron (409)', (await D.app(`/api/distrito/cuotas/${qd.data.id}`, { method: 'DELETE' })).status === 409);
  const rz = (await A.app('/api/cajas/resumen')).data;
  check('Finanzas: los 12 meses del año rotario por caja', rz.cajas[0].meses.length === 12 && rz.cajas[0].meses[0].mes.endsWith('-07'));

  /* Distrito: cuota de representación, programa, solicitudes de clubes, bonos, metas y quitar un club */
  const vr = 50000 + Math.floor(Math.random() * 900) + 1;
  const qr = await D.app('/api/distrito/cuotas', { method: 'POST', body: { nombre: 'Representación prueba', tipo: 'por_club', valor_socio: vr, vence } });
  const obr = (await A.app('/api/cajas/proyectado')).data.rubros.find((r) => r.categoria === 'Obligaciones RI y Distrito')?.cuotas_distritales.find((o) => o.id === qr.data.id);
  check('Distrito: la cuota de representación es un valor fijo por club', qr.status === 201 && obr?.total === vr, JSON.stringify(obr));
  const dc = await A.app('/api/socios/club', { method: 'PUT', body: { numero: '12237', pais: 'Colombia', distrito: '4271', zona: '25', programa: 'rotary' } });
  check('Datos del club: ID de Rotary, zona y programa; si pasa a Rotary sale del Distrito Rotaract', dc.status === 200 && dc.data.numero === '12237' && dc.data.zona === '25' && dc.data.programa === 'rotary'
    && !(await D.app('/api/distrito/tablero')).data.clubes.some((k) => k.id === A.id));
  check('Datos del club: programa inventado se rechaza (400)', (await A.app('/api/socios/club', { method: 'PUT', body: { programa: 'otro' } })).status === 400);
  await A.app('/api/socios/club', { method: 'PUT', body: { programa: 'rotaract' } });
  const tab2 = (await D.app('/api/distrito/tablero')).data, ka = tab2.clubes.find((k) => k.id === A.id);
  check('Distrito: avance del club (semáforo) y lo que le falta', ka?.programa === 'rotaract' && ka.avance >= 0 && ka.avance <= 100 && Array.isArray(ka.falta), JSON.stringify(ka));
  const so = await D.app('/api/distrito/solicitudes', { method: 'POST', body: { nombre: 'Interact Club Prueba', programa: 'interact', presidente: 'Ana' } });
  check('Distrito: solicita un club nuevo (sale por WhatsApp a Diwilo) y un club no puede', so.status === 201 && so.data.whatsapp.startsWith('https://wa.me/') && (await D.app('/api/distrito/solicitudes')).data.rows.some((x) => x.id === so.data.id)
    && (await A.app('/api/distrito/solicitudes', { method: 'POST', body: { nombre: 'x' } })).status === 403);
  check('Distrito: marca la solicitud como creada', (await D.app(`/api/distrito/solicitudes/${so.data.id}`, { method: 'PATCH', body: { estado: 'creado' } })).status === 200);
  const bo = await D.app('/api/distrito/bonos', { method: 'POST', body: { nombre: 'Rifa prueba', valor: 20000 } });
  const ba = await D.app(`/api/distrito/bonos/${bo.data.id}/clubes/${A.id}`, { method: 'PUT', body: { asignados: 10, vendidos: 4, pagado: 80000 } });
  const bnA = (await A.app('/api/club/bonos')).data.rows.find((x) => x.id === bo.data.id), bnD = (await D.app('/api/distrito/bonos')).data.rows.find((x) => x.id === bo.data.id);
  check('Distrito: bonos asignados por club; el club los ve y debe el saldo', ba.status === 200 && bnA?.saldo === 120000 && bnD?.vendidos === 4 && bnD.total === 200000, JSON.stringify(bnA));
  check('Distrito: no se venden más bonos de los asignados (400); a otro distrito no (404)', (await D.app(`/api/distrito/bonos/${bo.data.id}/clubes/${A.id}`, { method: 'PUT', body: { asignados: 1, vendidos: 2 } })).status === 400
    && (await D.app(`/api/distrito/bonos/${bo.data.id}/clubes/${B.id}`, { method: 'PUT', body: { asignados: 1 } })).status === 404);
  check('Inicio del club: aviso de bonos por pagar', (await A.app('/api/club/resumen')).data.alertas.some((a) => a.texto.startsWith('Bonos del distrito')));
  check('Distrito: no se borra un bono ya vendido (409)', (await D.app(`/api/distrito/bonos/${bo.data.id}`, { method: 'DELETE' })).status === 409);
  // Cobros: descuentos por pronto pago y planes en cuotas, datos de pago, bonos por socio y pagos desde la Caja menor
  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10), vd = 30000 + Math.floor(Math.random() * 900) * 100;
  check('Cobros: un QR que no es del distrito se rechaza (400)', (await D.app('/api/distrito/cuotas', { method: 'POST', body: { nombre: 'x', valor_socio: vd, vence, pago: { qr_key: 'otro/qr.png' } } })).status === 400);
  const qx = await D.app('/api/distrito/cuotas', { method: 'POST', body: { nombre: 'Cuota con descuento', tipo: 'por_club', valor_socio: vd, vence,
    descuentos: { pronto: [{ hasta: manana, pct: 10 }], planes: [{ cuotas: 3, pct: 5 }, { cuotas: 1, pct: 50 }] }, pago: { llave: '@distrito4271', banco: 'Bancolombia', numero: '123-456' } } });
  const obx = () => A.app('/api/cajas/proyectado').then((r) => r.data.rubros.find((x) => x.categoria === 'Obligaciones RI y Distrito').cuotas_distritales.find((o) => o.id === qx.data.id));
  let ox = await obx();
  check('Cobros: con pronto pago vigente el club ve el precio con descuento, la oferta y los datos de pago', qx.status === 201 && ox?.base === vd && ox.total === Math.round(vd * 0.9 / 100) * 100 && ox.oferta?.pct === 10
    && ox.pago?.llave === '@distrito4271' && ox.planes.length === 1, JSON.stringify(ox));
  check('Cobros: un plan que el distrito no ofrece no (400); otro distrito no (404)', (await A.app(`/api/cajas/distrital/${qx.data.id}/plan`, { method: 'POST', body: { cuotas: 7 } })).status === 400
    && (await B.app(`/api/cajas/distrital/${qx.data.id}/plan`, { method: 'POST', body: { cuotas: 3 } })).status === 404);
  await A.app(`/api/cajas/distrital/${qx.data.id}/plan`, { method: 'POST', body: { cuotas: 3 } });
  ox = await obx();
  const cqx = (await D.app('/api/distrito/cuotas')).data.rows.find((q) => q.id === qx.data.id);
  check('Cobros: el club elige 3 cuotas (fechas mensuales hasta el vencimiento); se cobra el menor valor; el distrito ve el plan', ox.plan?.cuotas === 3 && ox.cuotas_plan?.length === 3 && ox.cuotas_plan[2].fecha === vence
    && ox.total === Math.round(vd * 0.9 / 100) * 100 && cqx.clubes.find((x) => x.club_id === A.id)?.plan?.cuotas === 3 && cqx.pago?.banco === 'Bancolombia', JSON.stringify(ox));
  sql(`UPDATE ro_cuota_distrital SET descuentos = '{"pronto":[{"hasta":"2000-01-01","pct":10}],"planes":[{"cuotas":3,"pct":5}]}' WHERE id = ${qx.data.id}`);
  ox = await obx();
  check('Cobros: pasada la fecha de pronto pago sin pagar, queda el plan (5%) y ya no hay oferta', ox.total === Math.round(vd * 0.95 / 100) * 100 && !ox.oferta && ox.a_pagar > 0, JSON.stringify(ox));
  const bs = await D.app('/api/distrito/bonos', { method: 'POST', body: { nombre: 'Bono por socio', valor: 5000, reparto: 'por_socio', cantidad: 6, pago: { llave: '@bonos4271' } } });
  const bsA = (await A.app('/api/club/bonos')).data.rows.find((x) => x.id === bs.data.id);
  check('Bonos: 6 por socio × valor = total del club, con su propia llave', bs.status === 201 && bsA?.asignados === 6 * bsA.socios && bsA.total === bsA.asignados * 5000 && bsA.pago?.llave === '@bonos4271', JSON.stringify(bsA));
  check('Bonos: por socio sin cantidad no (400)', (await D.app('/api/distrito/bonos', { method: 'POST', body: { nombre: 'x', valor: 1000, reparto: 'por_socio' } })).status === 400);
  const pb = await A.app(`/api/cajas/bonos/${bs.data.id}/pagar`, { method: 'POST', body: { monto: 5000 } });
  const rb = (await A.app('/api/cajas/proyectado')).data.rubros.find((x) => x.categoria === 'Bonos distritales');
  const bsD = (await D.app('/api/distrito/bonos')).data.rows.find((x) => x.id === bs.data.id)?.clubes.find((x) => x.club_id === A.id);
  check('Bonos: el club los paga desde la Caja menor; salen en sus obligaciones y el distrito lo ve', pb.status === 201 && rb?.bonos.some((x) => x.id === bs.data.id && x.pagado === 5000) && rb.valor_distrito >= bsA.total && bsD?.pagado_caja === 5000, JSON.stringify(rb));
  check('Bonos: otro distrito no lo paga (404)', (await B.app(`/api/cajas/bonos/${bs.data.id}/pagar`, { method: 'POST', body: { monto: 5000 } })).status === 404);
  // Equipo distrital y certificados del distrito; le salen a la persona en «Lo tuyo» (por su correo)
  const mailA = (await A.app('/api/me')).data.user.email, prs = (await D.app('/api/distrito/personas')).data.rows;
  check('Equipo distrital: el distrito ve los socios de sus clubes para elegir; un club no arma el equipo (403)', prs.some((p) => p.club.startsWith('RTC ')) && !prs.some((p) => p.club.includes('Otro distrito'))
    && (await A.app('/api/distrito/equipo', { method: 'POST', body: { cargo: 'x', nombre: 'x' } })).status === 403);
  const eqm = await D.app('/api/distrito/equipo', { method: 'POST', body: { cargo: 'Secretaría distrital', nombre: `Persona Distrito ${vs}`, club: 'RTC Club A', correo: mailA } });
  const eqs = await D.app('/api/distrito/equipo', { method: 'POST', body: { cargo: 'Representante Distrital (RDR)', socio_id: prs[0].id } });
  const eql = (await D.app('/api/distrito/equipo')).data;
  check('Equipo distrital: con cargos del año; el socio elegido trae su club', eqm.status === 201 && eqs.status === 201 && eql.rows.find((m) => m.id === eqs.data.id)?.club === prs[0].club && eql.cargos.length > 5);
  const kc = await D.app('/api/distrito/certificados', { method: 'POST', body: { miembro_id: eqm.data.id, tipo: 'servicio' } });
  check('Equipo distrital: certificado de servicio (uno por persona y año)', kc.status === 201 && (await D.app('/api/distrito/certificados', { method: 'POST', body: { miembro_id: eqm.data.id, tipo: 'servicio' } })).status === 409);
  const misA = (await A.app('/api/lotuyo/mis-certificados')).data.rows;
  const verKA = await A.app(`/api/lotuyo/mis-certificados/distrito/${kc.data.id}`);
  check('Lo tuyo: muestra el certificado distrital de la persona y lo abre; otro no lo ve (404)', misA.some((k) => k.origen === 'distrito' && k.id === kc.data.id && k.cargo === 'Secretaría distrital') && verKA.status === 200 && (await B.app(`/api/lotuyo/mis-certificados/distrito/${kc.data.id}`)).status === 404, JSON.stringify(misA.slice(0, 3)));
  const rec = await D.app('/api/distrito/certificados', { method: 'POST', body: { tipo: 'reconocimiento', titulo: 'Mejor proyecto', socio_id: prs[0].id } });
  check('Equipo distrital: reconocimiento a un socio de un club; servicio sin estar en el equipo no (400)', rec.status === 201 && (await D.app('/api/distrito/certificados', { method: 'POST', body: { tipo: 'servicio', nombre: 'x' } })).status === 400);
  const mt = await D.app('/api/distrito/metas', { method: 'PUT', body: { anio: tab2.anio, metas: { socios: 500, clubes: 40, horas: '' } } });
  const mg = (await D.app(`/api/distrito/metas?anio=${tab2.anio}`)).data.metas;
  check('Distrito: metas del año rotario', mt.status === 200 && mg.socios === 500 && mg.clubes === 40 && !('horas' in mg), JSON.stringify(mg));
  // Tres distritos por código, uno por programa: el Distrito Rotary 4271 no ve los clubes Rotaract ni les cobra
  const DR = await newBusiness('Distrito Rotary 4271', { login: true });
  sql(`INSERT OR REPLACE INTO ro_club_config (business_id, distrito, es_distrito, programa) VALUES ('${DR.id}', '4271', 1, 'rotary')`);
  const R1 = await newBusiness('Club Rotario Prueba', { login: true });
  sql(`INSERT OR REPLACE INTO ro_club_config (business_id, distrito, programa) VALUES ('${R1.id}', '4271', 'rotary')`);
  const tR = (await DR.app('/api/distrito/tablero')).data, tA = (await D.app('/api/distrito/tablero')).data;
  check('Distrito por programa: el Rotary ve sus clubes rotarios y no los Rotaract; el Rotaract no ve los rotarios', tR.clubes.some((k) => k.id === R1.id) && !tR.clubes.some((k) => k.id === A.id) && tA.clubes.some((k) => k.id === A.id) && !tA.clubes.some((k) => k.id === R1.id), JSON.stringify(tR.clubes?.map((k) => k.nombre)));
  const qR = await DR.app('/api/distrito/cuotas', { method: 'POST', body: { nombre: 'Cuota Rotary prueba', tipo: 'por_club', valor_socio: 77000, vence } });
  const oblA = (await A.app('/api/cajas/proyectado')).data.rubros.find((r) => r.categoria === 'Obligaciones RI y Distrito')?.cuotas_distritales || [];
  check('Distrito por programa: la cuota del Distrito Rotary no le llega a un club Rotaract ni el Rotaract la ve', qR.status === 201 && !oblA.some((o) => o.id === qR.data.id) && !(await D.app('/api/distrito/cuotas')).data.rows.some((q) => q.id === qR.data.id)
    && (await DR.app('/api/distrito/cuotas')).data.rows.some((q) => q.id === qR.data.id));
  check('Distrito por programa: el Rotary no entra al detalle de un club Rotaract (404)', (await DR.app(`/api/distrito/clubes/${A.id}`)).status === 404);
  const meSa = (await A.app('/api/me')).data, meSr = (await R1.app('/api/me')).data;
  check('Siglas: RTC para Rotaract y RY para Rotary (en la barra y en la lista de a cuál entrar)', meSa.business.etiqueta.startsWith('RTC ') && meSr.business.etiqueta.startsWith('RY ') && meSa.businesses.every((b) => b.sigla && b.etiqueta), JSON.stringify(meSa.businesses));
  check('Siglas: el distrito ve sus clubes con la sigla', (await D.app('/api/distrito/tablero')).data.clubes.every((k) => k.nombre.startsWith('RTC ')) && tR.clubes.every((k) => k.nombre.startsWith('RY ')));
  // Cargos: el distrito define la lista y el club solo asigna de ella
  const cg = await D.app('/api/distrito/cargos', { method: 'PUT', body: { items: ['Presidente/a del club', 'Secretario/a del club', 'Tesorero/a del club', 'Coordinador/a de Juegos'] } });
  const lc = (await A.app('/api/socios/cargos')).data;
  check('Cargos: el distrito define la lista y sus clubes la reciben', cg.status === 200 && lc.origen === 'distrito' && lc.items.includes('Coordinador/a de Juegos'), JSON.stringify(lc));
  const sjg = await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Socio Juegos', cargo: 'Coordinador/a de Juegos' } });
  check('Cargos: el club asigna un cargo de la lista; uno inventado no (400)', sjg.status === 201 && (await A.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Socio X', cargo: 'Rey del club' } })).status === 400);
  check('Cargos: el club no cambia la lista (403) y la del Distrito Rotary no le llega', (await A.app('/api/distrito/cargos', { method: 'PUT', body: { items: ['x'] } })).status === 403 && (await R1.app('/api/socios/cargos')).data.origen === 'sugerido');
  check('Cargos: la lista debe tener la presidencia (400)', (await D.app('/api/distrito/cargos', { method: 'PUT', body: { items: ['Tesorero/a del club'] } })).status === 400);
  await D.app('/api/distrito/cargos', { method: 'PUT', body: { items: [] } });

  // Formatos del distrito: el distrito arma el formato, el club lo llena y lo envía, el distrito revisa y el club crea el proyecto
  const fpl = (await D.app('/api/distrito/formatos')).data;
  const fm = await D.app('/api/distrito/formatos', { method: 'POST', body: { nombre: 'Presentación de proyectos', descripcion: 'Formato oficial', secciones: fpl.plantilla } });
  check('Formatos: el distrito ya trae el formato oficial con selectores que clasifican', fpl.rows.some((f) => f.nombre === 'Presentación de proyectos' && f.secciones.filter((s) => s.clasifica).length === 3));
  check('Formatos: el distrito crea un formato desde la plantilla', fm.status === 201 && fpl.plantilla.some((s) => s.tipo === 'opciones'));
  const fnota = await D.app('/api/distrito/formatos', { method: 'POST', body: { nombre: 'Formato con nota', secciones: [{ tipo: 'nota', titulo: 'Lee esto antes de llenar', requerido: true }, { tipo: 'texto', titulo: 'Nombre', requerido: true }] } });
  const fnl = (await D.app('/api/distrito/formatos')).data.rows.find((f) => f.id === fnota.data.id);
  check('Formatos: notas de texto libre (no se responden ni son obligatorias); solo notas no basta (400)', fnota.status === 201 && fnl.secciones[0].tipo === 'nota' && !fnl.secciones[0].requerido
    && (await D.app('/api/distrito/formatos', { method: 'POST', body: { nombre: 'x', secciones: [{ tipo: 'nota', titulo: 'Solo nota' }] } })).status === 400);
  await D.app(`/api/distrito/formatos/${fnota.data.id}`, { method: 'DELETE' });
  check('Formatos: un club no crea formatos (403) ni ve lo del distrito', (await A.app('/api/distrito/formatos', { method: 'POST', body: { nombre: 'x', secciones: fpl.plantilla } })).status === 403 && (await A.app('/api/distrito/envios')).status === 403);
  const lfA = (await A.app('/api/formatos')).data, lfR = (await R1.app('/api/formatos')).data;
  check('Formatos: le llega al club de su programa y no al de otro programa', lfA.formatos.some((f) => f.id === fm.data.id) && !lfR.formatos.some((f) => f.id === fm.data.id));
  const encA = (await A.app('/api/formatos/encabezado')).data;
  check('Formatos: encabezado con el distrito y el club', encA.distrito.includes('4271') && encA.programa === 'Rotaract' && encA.club.startsWith('RTC '), JSON.stringify(encA));
  const fe = await A.app('/api/formatos/envios', { method: 'POST', body: { formato_id: fm.data.id, titulo: 'Huerta comunitaria' } });
  const secF = fpl.plantilla, sid = (t) => secF.find((s) => s.titulo === t).id;
  const resp = { [sid('Área de interés')]: 'Medio ambiente', [sid('Avenida de servicio')]: 'Servicio en la comunidad', [sid('Tipo de proyecto')]: 'Del club', [sid('Comunidad beneficiada')]: 'Barrio La Esperanza', [sid('Fecha de inicio')]: '2027-02-01', [sid('Responsable del proyecto')]: 'Ana',
    [sid('Justificación')]: 'Falta de alimentos frescos', [sid('Objetivo general')]: 'Sembrar una huerta', [sid('Personas beneficiadas')]: '120', [sid('Presupuesto total')]: '850000', [sid('Área de interés') + 'x']: 'no' };
  await A.app(`/api/formatos/envios/${fe.data.id}`, { method: 'PATCH', body: { respuestas: { [sid('Área de interés')]: 'Opción inventada' } } });
  const sinOp = (await A.app(`/api/formatos/envios/${fe.data.id}`)).data;
  check('Formatos: el club empieza un borrador; una opción que no está en la lista no se guarda', fe.status === 201 && sinOp.estado === 'borrador' && !sinOp.respuestas[sid('Área de interés')]);
  const ib = (await D.app('/api/distrito/impacto')).data, ibx = ib.rows.find((x) => x.id === fe.data.id);
  check('Impacto del distrito: ve el borrador del club con su avance; lo puede leer pero no revisar (409)', ibx?.estado === 'borrador' && ib.estados.borrador >= 1 && typeof ibx.avance === 'number'
    && (await D.app(`/api/distrito/envios/${fe.data.id}`)).status === 200 && (await D.app(`/api/distrito/envios/${fe.data.id}/revisar`, { method: 'POST', body: { estado: 'aprobado' } })).status === 409);
  check('Impacto del distrito: un club no lo ve (403) y el Rotary no ve los de Rotaract', (await A.app('/api/distrito/impacto')).status === 403 && !(await DR.app('/api/distrito/impacto')).data.rows.some((x) => x.id === fe.data.id));
  check('Formatos: no se envía si faltan obligatorias (400)', (await A.app(`/api/formatos/envios/${fe.data.id}/enviar`, { method: 'POST' })).status === 400);
  await A.app(`/api/formatos/envios/${fe.data.id}`, { method: 'PATCH', body: { titulo: 'Huerta comunitaria', respuestas: resp } });
  const fen = await A.app(`/api/formatos/envios/${fe.data.id}/enviar`, { method: 'POST' });
  check('Formatos: el club lo envía y ya no lo puede cambiar (409)', fen.status === 200 && (await A.app(`/api/formatos/envios/${fe.data.id}`, { method: 'PATCH', body: { titulo: 'Otro' } })).status === 409);
  const ldE = (await D.app('/api/distrito/envios?estado=enviado')).data.rows;
  check('Formatos: el distrito lo ve por revisar con el club; el Rotary no (404)', ldE.some((x) => x.id === fe.data.id && x.club.startsWith('RTC ')) && (await DR.app(`/api/distrito/envios/${fe.data.id}`)).status === 404);
  check('Formatos: devolver sin comentario no (400)', (await D.app(`/api/distrito/envios/${fe.data.id}/revisar`, { method: 'POST', body: { estado: 'devuelto' } })).status === 400);
  await D.app(`/api/distrito/envios/${fe.data.id}/revisar`, { method: 'POST', body: { estado: 'devuelto', comentario: 'Agrega el cronograma' } });
  const dev = (await A.app('/api/formatos')).data.envios.find((x) => x.id === fe.data.id);
  check('Formatos: devuelto → el club ve el comentario y lo puede corregir y reenviar', dev.estado === 'devuelto' && dev.comentario === 'Agrega el cronograma'
    && (await A.app(`/api/formatos/envios/${fe.data.id}`, { method: 'PATCH', body: { respuestas: { ...resp, [sid('Actividades y cronograma')]: 'Febrero: siembra' } } })).status === 200
    && (await A.app(`/api/formatos/envios/${fe.data.id}/enviar`, { method: 'POST' })).status === 200);
  check('Formatos: crear el proyecto antes de aprobarlo no (409)', (await A.app(`/api/formatos/envios/${fe.data.id}/proyecto`, { method: 'POST' })).status === 409);
  const apr = await D.app(`/api/distrito/envios/${fe.data.id}/revisar`, { method: 'POST', body: { estado: 'aprobado', comentario: '¡Adelante!' } });
  const iap = (await D.app('/api/distrito/impacto')).data, iax = iap.rows.find((x) => x.id === fe.data.id);
  check('Impacto del distrito: aprobado, con su clasificación y los selectores del distrito', iax?.estado === 'aprobado' && iax.clases['Área de interés'] === 'Medio ambiente' && iax.clases['Tipo de proyecto'] === 'Del club'
    && iap.selectores.some((x) => x.titulo === 'Avenida de servicio' && x.opciones.includes('Servicio internacional')), JSON.stringify(iax));
  const fpj = await A.app(`/api/formatos/envios/${fe.data.id}/proyecto`, { method: 'POST' });
  const docsF = (await A.app(`/api/impacto/proyectos/${fpj.data.id}/detalle`)).data, pjF = docsF.proyecto || {};
  check('Formatos: aprobado → el club crea el proyecto con sus datos y el formato en Documentación', apr.status === 200 && fpj.status === 201 && pjF.nombre === 'Huerta comunitaria' && pjF.estado === 'planeacion'
    && pjF.beneficiados === 120 && pjF.presupuesto === 850000 && pjF.fecha_inicio === '2027-02-01' && JSON.stringify((await A.app(`/api/impacto/docs/${docsF.docs[0]?.id}`)).data).includes('Barrio La Esperanza'), JSON.stringify(docsF.docs).slice(0, 300));
  check('Formatos: crearlo otra vez devuelve el mismo proyecto', (await A.app(`/api/formatos/envios/${fe.data.id}/proyecto`, { method: 'POST' })).data.id === fpj.data.id);
  check('Formatos: un formato con solicitudes no se borra (409)', (await D.app(`/api/distrito/formatos/${fm.data.id}`, { method: 'DELETE' })).status === 409);
  check('Formatos: otro club no ve la solicitud (404)', (await B.app(`/api/formatos/envios/${fe.data.id}`)).status === 404);
  const E = await newBusiness('Club para quitar', { login: true });
  check('Distrito: el club nuevo aparece en su lista', (await D.app('/api/distrito/tablero')).data.clubes.some((k) => k.id === E.id));
  const qe = await D.app(`/api/distrito/clubes/${E.id}/quitar`, { method: 'POST' });
  check('Distrito: quitar un club lo saca de su lista; el club ve el distrito vacío', qe.status === 200 && !(await D.app('/api/distrito/tablero')).data.clubes.some((k) => k.id === E.id) && (await E.app('/api/socios/club')).data.distrito === '');
  check('Distrito: un club no puede quitar a otro (403)', (await A.app(`/api/distrito/clubes/${E.id}/quitar`, { method: 'POST' })).status === 403);

  /* Obligaciones = rubros de «¿En qué se gasta?» (valor editable, pagar → movimiento) */
  const anioR = pj.anio;
  const pv = await A.app('/api/cajas/rubros', { method: 'PUT', body: { categoria: 'Pines', anio: anioR, valor: 50000 } });
  let tod = (await A.app('/api/cajas/proyectado')).data, pines = tod.rubros.find((r) => r.categoria === 'Pines');
  check('Finanzas: editar el valor de una obligación (pines)', pv.status === 200 && pines?.valor === 50000 && pines.estado === 'pendiente' && tod.total_obligaciones >= 50000, JSON.stringify(pines));
  const dist = tod.rubros.find((r) => r.categoria === 'Obligaciones RI y Distrito');
  check('Finanzas: la cuota distrital suma al rubro RI y Distrito', dist?.valor_distrito >= ob.total, JSON.stringify(dist));
  const pr1 = await A.app('/api/cajas/rubros/pagar', { method: 'POST', body: { categoria: 'Pines', monto: 50000, concepto: 'Pines de socios' } });
  const cp1 = await A.app(`/api/cajas/movimientos/${pr1.data.id}/comprobante?nombre=pago`, { method: 'POST', body: PNG, headers: raw });
  tod = (await A.app('/api/cajas/proyectado')).data;
  const mov1 = (await A.app('/api/cajas/movimientos?f_categoria=Pines')).data.rows[0];
  check('Finanzas: pagar la deja pagada y queda en Movimientos con comprobante', pr1.status === 201 && cp1.status === 200 && tod.rubros.find((r) => r.categoria === 'Pines')?.estado === 'pagada' && mov1?.comprobante === true && mov1.concepto === 'Pines de socios', JSON.stringify(mov1));
  check('Finanzas: categoría inventada se rechaza (400) y B no ve el valor de A', (await A.app('/api/cajas/rubros', { method: 'PUT', body: { categoria: 'Inventada', valor: 1 } })).status === 400
    && !(await B.app('/api/cajas/proyectado')).data.rubros.some((r) => r.categoria === 'Pines' && r.valor));

  /* Calendario del club (Inicio) */
  const calA = (await A.app(`/api/club/calendario?desde=${hoy}&hasta=${vence}`)).data.rows || [];
  check('Inicio: el calendario junta reuniones, tareas y cuota distrital', calA.some((x) => x.tipo === 'distrital') && calA.every((x) => x.fecha >= hoy && x.fecha <= vence), JSON.stringify(calA.map((x) => x.tipo)));
  check('Inicio: el calendario rechaza rangos largos', (await A.app('/api/club/calendario?desde=2026-01-01&hasta=2026-12-31')).status === 400);
  const rsm = await A.app('/api/club/resumen');
  check('Inicio: la junta ve «Cómo va el club» con alertas', rsm.status === 200 && Array.isArray(rsm.data.alertas) && typeof rsm.data.cajas?.menor === 'number' && typeof rsm.data.cuotas?.pct === 'number', JSON.stringify(rsm.data).slice(0, 300));
  const rst = await (await newMember(A.id, 'staff')).app('/api/club/resumen');
  check('Inicio: un socio sin junta no ve el resumen (403)', rst.status === 403, `${rst.status} ${JSON.stringify(rst.data).slice(0, 200)}`);
  const mov = await A.app('/api/cajas/resumen');
  check('Finanzas: cada caja trae su revisión (entradas, salidas, sin comprobante)', mov.data.cajas.every((k) => k.revision && typeof k.revision.sin_comprobante === 'number'));
  check('Inicio: el distrito ve las fechas de sus cuotas', ((await D.app(`/api/club/calendario?desde=${hoy}&hasta=${vence}`)).data.rows || []).some((x) => x.tipo === 'distrital'));

  /* Juegos: contenido propio (todos añaden, la presidencia gestiona sin ver autor), contenido del distrito, Bingo, retos y ranking entre clubes */
  const q1 = await staff.app('/api/juegos/contenido', { method: 'POST', body: { juego: 'trivia', datos: { p: '¿Prueba de pregunta del club', o: ['Correcta', 'Mala 1', 'Mala 2', 'Mala 3'] } } });
  const qMal = await staff.app('/api/juegos/contenido', { method: 'POST', body: { juego: 'trivia', datos: { p: '¿Otra pregunta?', o: ['A', 'B', 'C'] } } });
  const verS = (await staff.app('/api/juegos/contenido?juego=trivia')).data, verA = (await A.app('/api/juegos/contenido?juego=trivia')).data;
  const miQ = verA.items?.find((x) => x.id === q1.data.id);
  check('Juegos: cualquier socio añade preguntas; una mal hecha se rechaza', q1.status === 201 && qMal.status === 400 && verS.gestiona === false && verS.mias.some((x) => x.id === q1.data.id) && !verS.items, `${q1.status} ${qMal.status}`);
  check('Juegos: la presidencia ve todo (del club y de la app) sin saber quién lo añadió', verA.gestiona && miQ?.origen === 'club' && !('socio_id' in miQ) && verA.items.some((x) => x.origen === 'app'));
  const apagaS = await staff.app(`/api/juegos/contenido/${q1.data.id}`, { method: 'PATCH', body: { activo: false } });
  const apagaA = await A.app(`/api/juegos/contenido/${q1.data.id}`, { method: 'PATCH', body: { activo: false } });
  const base1 = verA.items.find((x) => x.origen === 'app');
  await A.app('/api/juegos/contenido/ocultos', { method: 'PUT', body: { juego: 'trivia', clave: base1.clave, activo: false } });
  const verA2 = (await A.app('/api/juegos/contenido?juego=trivia')).data;
  check('Juegos: solo la presidencia apaga (también lo del banco de la app)', apagaS.status === 403 && apagaA.status === 200 && verA2.items.find((x) => x.id === q1.data.id)?.activo === false && verA2.items.find((x) => x.clave === base1.clave)?.activo === false && verA2.activas === verA.activas - 2);
  await A.app('/api/juegos/contenido/ocultos', { method: 'PUT', body: { juego: 'trivia', clave: base1.clave, activo: true } });
  const cdis = await D.app('/api/distrito/juegos/contenido', { method: 'POST', body: { juego: 'bingo', datos: { texto: `Casilla distrital ${vs}` } } });
  check('Juegos: el distrito añade contenido y llega a sus clubes; un club no escribe en el del distrito', cdis.status === 201 && (await A.app('/api/juegos/contenido?juego=bingo')).data.items.some((x) => x.origen === 'distrito' && x.texto.includes(String(vs)))
    && (await A.app('/api/distrito/juegos/contenido', { method: 'POST', body: { juego: 'bingo', datos: { texto: 'x club' } } })).status === 403);

  // Bingo: cartón propio, solo el anfitrión canta, canto falso resta, línea y bingo validados por el servidor
  const juegaBingo = async (salaId) => {
    let a = (await A.app(`/api/juegos/salas/${salaId}`)).data;
    for (let k = 0; k < 80 && a.juego?.fase === 'jugando'; k++) {
      const s2 = (await staff.app(`/api/juegos/salas/${salaId}`)).data;
      for (const [cli, v] of [[A, a], [staff, s2]]) {
        if (v.juego.tengo_bingo) { await cli.app(`/api/juegos/salas/${salaId}/accion`, { method: 'POST', body: { tipo: 'bingo' } }); return (await A.app(`/api/juegos/salas/${salaId}`)).data; }
        if (v.juego.tengo_linea && !v.juego.linea) await cli.app(`/api/juegos/salas/${salaId}/accion`, { method: 'POST', body: { tipo: 'linea' } });
      }
      a = (await A.app(`/api/juegos/salas/${salaId}/accion`, { method: 'POST', body: { tipo: 'cantar' } })).data;
    }
    return a;
  };
  const sb = (await A.app('/api/juegos/salas', { method: 'POST', body: { juego: 'bingo', modo: 'numeros' } })).data;
  await staff.app('/api/juegos/unirse', { method: 'POST', body: { codigo: sb.sala.codigo } });
  const bA = (await A.app(`/api/juegos/salas/${sb.sala.id}/iniciar`, { method: 'POST', body: {} })).data, bS = (await staff.app(`/api/juegos/salas/${sb.sala.id}`)).data;
  const cantaS = await staff.app(`/api/juegos/salas/${sb.sala.id}/accion`, { method: 'POST', body: { tipo: 'cantar' } });
  const falsa = (await staff.app(`/api/juegos/salas/${sb.sala.id}/accion`, { method: 'POST', body: { tipo: 'bingo' } })).data;
  check('Bingo: cada quien su cartón (centro libre); solo el anfitrión canta; cantar bingo sin tenerlo resta', bA.juego.carton.length === 25 && bA.juego.carton[12] === null && JSON.stringify(bA.juego.carton) !== JSON.stringify(bS.juego.carton)
    && !('cartones' in bA.juego) && !('bolsa' in bA.juego) && cantaS.status === 400 && falsa.puntos[falsa.yo] === -2, `${cantaS.status}`);
  const finB = await juegaBingo(sb.sala.id);
  check('Bingo: la partida termina con ¡Bingo! validado por el servidor y suma puntos', finB.sala.estado === 'terminada' && finB.fin?.ganador && (finB.puntos[finB.fin.ganador] || 0) >= 23, JSON.stringify(finB.fin));   // +25 del bingo; si el ganador es quien cantó el falso, −2

  // Retos del distrito y ranking entre clubes
  const retoMal = await A.app('/api/distrito/juegos/retos', { method: 'POST', body: { juego: 'bingo', nombre: 'x', desde: hoy, hasta: hoy } });
  const reto = await D.app('/api/distrito/juegos/retos', { method: 'POST', body: { juego: 'bingo', nombre: `Bingo distrital ${vs}`, desde: hoy, hasta: vence, premio: 'Reconocimiento en la conferencia', gana: 'promedio' } });
  const retosA = (await A.app('/api/juegos/retos')).data, retosB = (await B.app('/api/juegos/retos')).data;
  check('Retos: solo el distrito los crea; los ven sus clubes y no los de otro distrito', retoMal.status === 403 && reto.status === 201 && retosA.rows.some((r) => r.id === reto.data.id && r.abierto) && !retosB.rows.some((r) => r.id === reto.data.id));
  const otroJuego = await A.app('/api/juegos/salas', { method: 'POST', body: { juego: 'trivia', reto_id: reto.data.id } });
  const sr = (await A.app('/api/juegos/salas', { method: 'POST', body: { juego: 'bingo', reto_id: reto.data.id } })).data;
  await staff.app('/api/juegos/unirse', { method: 'POST', body: { codigo: sr.sala.codigo } });
  await A.app(`/api/juegos/salas/${sr.sala.id}/iniciar`, { method: 'POST', body: {} });
  const finR = await juegaBingo(sr.sala.id);
  const rkD = (await D.app(`/api/distrito/juegos/ranking?reto=${reto.data.id}`)).data, rkA = (await A.app(`/api/juegos/ranking-clubes?reto=${reto.data.id}`)).data;
  const filaA = rkD.rows?.find((x) => x.id === A.id);
  check('Retos: las partidas del reto suman al ranking entre clubes (lo ven el distrito y el club)', otroJuego.status === 400 && sr.sala.reto?.id === reto.data.id && finR.sala.estado === 'terminada' && filaA?.partidas === 1 && filaA.puntos === Object.values(finR.puntos).reduce((t, n) => t + n, 0) && rkA.rows.some((x) => x.id === A.id) && rkA.mio === A.id, JSON.stringify(rkD.rows));
  const rtA = (await A.app('/api/juegos/retos')).data.rows.find((r) => r.id === reto.data.id);
  check('Retos: premio, forma de ganar, puesto de mi club y mejores jugadores del distrito', rtA?.premio === 'Reconocimiento en la conferencia' && rtA.gana === 'promedio' && rtA.mio?.puesto >= 1
    && rtA.jugadores.length >= 1 && rtA.jugadores[0].club.startsWith('RTC ') && rkD.jugadores?.length >= 1, JSON.stringify(rtA));
  check('Retos: un reto con partidas no se borra (se desactiva)', (await D.app(`/api/distrito/juegos/retos/${reto.data.id}`, { method: 'DELETE' })).status === 409 && (await D.app(`/api/distrito/juegos/retos/${reto.data.id}`, { method: 'PATCH', body: { activo: false } })).status === 200);

  // Conexión: si quien creó la sala se desconecta, la sala pasa a un jugador conectado; al volver, sigue en su sala
  const sx = (await A.app('/api/juegos/salas', { method: 'POST', body: { juego: 'probable' } })).data;
  await staff.app('/api/juegos/unirse', { method: 'POST', body: { codigo: sx.sala.codigo } });
  sql(`UPDATE ro_juego_jugadores SET visto_at = ${Date.now() - 120000}, entro_at = ${Date.now() - 120000} WHERE sala_id = ${sx.sala.id} AND socio_id = ${sx.yo}`);
  const vx = (await staff.app(`/api/juegos/salas/${sx.sala.id}`)).data;
  const miaA = (await A.app('/api/juegos/salas')).data.mia;
  check('Conexión: relevo del anfitrión desconectado y «volver a la partida»', vx.sala.anfitrion_id === vx.yo && vx.jugadores.find((p) => p.id === sx.yo)?.conectado === false && miaA?.id === sx.sala.id, JSON.stringify(vx.sala));
  await staff.app(`/api/juegos/salas/${sx.sala.id}/cerrar`, { method: 'POST', body: {} });
}
