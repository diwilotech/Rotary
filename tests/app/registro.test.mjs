// Enlace de registro de socios: la junta lo crea, cada socio crea su cuenta solo y en Equipo queda solo la junta.
export default async function ({ check, client, newBusiness, TS_TOKEN, APP }) {
  const K = await newBusiness('Club Registro', { login: true }), lmail = `laura${Date.now()}@ejemplo.com`;
  const ya = await K.app('/api/socios/socios', { method: 'POST', body: { nombre: 'Laura Ya Estaba', email: lmail } });
  const g = await K.app('/api/socios/registro', { method: 'POST' });
  const token = /\/unirse\/([0-9a-f]{36})$/.exec(g.data.url || '')?.[1];
  check('Registro: la junta crea el enlace (/unirse/…) y queda activo', g.status === 200 && !!token && (await K.app('/api/socios/registro')).data.activo === true, JSON.stringify(g.data));
  const pag = await fetch(`${APP}/unirse/${token}`);
  check('Registro: la dirección del enlace abre la página de ingreso', pag.status === 200 && (await pag.text()).includes('id="registro"'));
  check('Registro: datos del club para la página', (await client()(`/api/registro/${token}`)).data.club?.includes('Club Registro'));

  // Socio nuevo: queda como aspirante con acceso de Socio y entra directo a su club
  const P = client(), mail = `nuevo${Date.now()}@ejemplo.com`;
  const r1 = await P(`/api/registro/${token}`, { method: 'POST', body: { nombre: 'Pedro Nuevo', email: mail, telefono: '3001112233', password: 'clave-segura-9', consent: true, adult: true, turnstile: TS_TOKEN } });
  const meP = await P('/api/me');
  const fichaP = (await K.app('/api/socios/socios')).data.rows?.find((s) => s.email === mail);
  check('Registro: un socio nuevo crea su cuenta, entra a su club como Socio y queda aspirante', r1.status === 200 && meP.data.business?.id === K.id && meP.data.role === 'staff' && fichaP?.estado === 'aspirante', JSON.stringify(r1.data));

  // Socio que ya estaba en la lista: se enlaza a su ficha (no se duplica)
  const L = client();
  const r2 = await L(`/api/registro/${token}`, { method: 'POST', body: { nombre: 'Laura', email: lmail, password: 'clave-segura-9', consent: true, adult: true, turnstile: TS_TOKEN } });
  const lauras = (await K.app('/api/socios/socios')).data.rows.filter((s) => (s.email || '').toLowerCase() === lmail);
  check('Registro: si su correo ya estaba en la lista, se enlaza a su ficha', r2.status === 200 && lauras.length === 1 && lauras[0].id === ya.data.id && !!lauras[0].user_id, JSON.stringify(lauras));

  // Cuenta que ya existe: debe usar su contraseña
  check('Registro: con una cuenta que ya existe, la contraseña equivocada no entra', (await client()(`/api/registro/${token}`, { method: 'POST', body: { nombre: 'Pedro Nuevo', email: mail, password: 'otra-clave-123', consent: true, adult: true, turnstile: TS_TOKEN } })).status >= 400);
  check('Registro: sin autorizar datos no se crea la cuenta (400)', (await client()(`/api/registro/${token}`, { method: 'POST', body: { nombre: 'Sin Permiso', email: `x${Date.now()}@ejemplo.com`, password: 'clave-segura-9', turnstile: TS_TOKEN } })).status === 400);

  // Equipo: solo la junta; los socios con acceso se cuentan aparte
  const eq = (await K.app('/api/team')).data;
  check('Equipo: los socios registrados no salen en Equipo', !eq.users.some((u) => u.email === mail) && eq.socios_con_acceso >= 2, JSON.stringify(eq.users.map((u) => u.email)));
  check('Registro: un socio no puede crear el enlace (403)', (await P('/api/socios/registro', { method: 'POST' })).status === 403);

  // Cambiar el enlace invalida el anterior; apagarlo también
  const g2 = await K.app('/api/socios/registro', { method: 'POST' });
  check('Registro: un enlace nuevo deja sin efecto el anterior', (await client()(`/api/registro/${token}`)).status === 404 && g2.status === 200);
  await K.app('/api/socios/registro', { method: 'DELETE' });
  const t2 = /\/unirse\/([0-9a-f]{36})$/.exec(g2.data.url)[1];
  check('Registro: apagado, el enlace ya no sirve', (await client()(`/api/registro/${t2}`)).status === 404 && (await K.app('/api/socios/registro')).data.activo === false);
}
