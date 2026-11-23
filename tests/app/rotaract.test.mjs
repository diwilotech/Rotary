// Pruebas de los módulos de CD Rotaract: rutas clave y aislamiento entre clubes.
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
  const act = await A.app(`/api/socios/socios/${ana.data.id}/activar`, { method: 'POST', body: {} });
  const cert = await A.app(`/api/socios/socios/${ana.data.id}/certificado`);
  check('Socios: activar genera el certificado con código y firmas', act.data.codigo?.startsWith('RTC-') && cert.status === 200 && cert.data.text.includes('Ana Socia') && cert.data.text.includes('Camila Presidenta') && cert.data.text.includes(act.data.codigo));
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
  check('Cuotas: el personal no ve la cartera (403) y B no ve pagos de A', (await staff.app('/api/cuotas/cartera')).status === 403 && (await B.app('/api/cuotas/pagos')).data.rows.length === 0);
}
