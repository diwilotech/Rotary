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
  check('Socios: activar (con su fecha) genera el certificado con firmas', act.data.activado_at === `${mes}-01` && cert.status === 200 && cert.data.text.includes('Ana Socia') && cert.data.text.includes('Camila Presidenta') && cert.data.text.includes('a partir del') && cert.data.text.includes('socio del club'));
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
  await A.app('/api/impacto/beneficiarios', { method: 'POST', body: { nombre: 'Niña 1', proyecto_id: p.data.id } });
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

  /* Impacto: página del proyecto con comunidad, documentación y alianzas financieras */
  const pj2 = await A.app('/api/impacto/proyectos', { method: 'POST', body: { nombre: 'Navidad en Jardín de Amor', financiacion: 'doble', financiador: 'Alcaldía', monto_caja_mayor: 200000, monto_externo: 300000, comunidad: 'Fundación Jardín de Amor', comunidad_lugar: 'Medellín' } });
  await A.app('/api/impacto/alianzas', { method: 'POST', body: { nombre: 'Alcaldía', proyecto_id: pj2.data.id, tipo_aporte: 'financiera', aporte_comprometido: 300000, aporte_recibido: 100000 } });
  const dl = await A.app(`/api/impacto/proyectos/${pj2.data.id}/docs`, { method: 'POST', body: { nombre: 'Propuesta', url: 'https://ejemplo.com/propuesta.pdf' } });
  const df = await A.app(`/api/impacto/proyectos/${pj2.data.id}/docs?nombre=acta.png`, { method: 'POST', body: PNG, headers: raw });
  const det = (await A.app(`/api/impacto/proyectos/${pj2.data.id}/detalle`)).data;
  check('Impacto: el proyecto trae comunidad, documentos y alianza financiera con su aporte', det.proyecto.comunidad === 'Fundación Jardín de Amor' && det.docs.length === 2 && det.alianzas[0]?.tipo_aporte === 'financiera' && det.alianzas[0].aporte_recibido === 100000 && dl.status === 201 && df.status === 201, JSON.stringify(det.docs));
  check('Impacto: B no ve los documentos de A', (await B.app(`/api/impacto/docs/${dl.data.id}`)).status === 404);

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
  check('Inicio: el distrito ve las fechas de sus cuotas', ((await D.app(`/api/club/calendario?desde=${hoy}&hasta=${vence}`)).data.rows || []).some((x) => x.tipo === 'distrital'));
}
