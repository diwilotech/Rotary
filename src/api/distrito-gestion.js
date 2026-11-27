// Gestión del distrito (perfil del distrito, junta del distrito para cambiar):
//   Clubes nuevos: el distrito SOLICITA el club (lo crea Diwilo en su admin, que maneja invitación, cobro y módulos) y la
//   solicitud sale por WhatsApp a Diwilo con los datos listos. Quitar un club = sacarlo del distrito (ro_club_config.distrito = '0');
//   el club vuelve a unirse escribiendo el código en Socios → Certificados → Datos del club. Borrar un club solo desde el admin.
//   GET/POST /api/distrito/solicitudes · PATCH /api/distrito/solicitudes/:id {estado} · POST /api/distrito/clubes/:id/quitar
//   Bonos: GET/POST /api/distrito/bonos · PATCH/DELETE /api/distrito/bonos/:id · PUT /api/distrito/bonos/:id/clubes/:club {asignados, vendidos, pagado}
//   Metas del año rotario: GET /api/distrito/metas?anio= · PUT /api/distrito/metas {anio, metas: {indicador: valor|null}}
//   Del lado del club: GET /api/club/bonos (los bonos que el distrito le asignó, solo lectura)
import { json, readJson, HttpError } from '../lib/http.js';
import { all, one, today, cast } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { distritoDe, clubesDelDistrito, anioRotarioDe, PROGRAMAS, EN_DISTRITO, enDistrito, PAGA_CUOTA, bonosClub } from '../lib/rotaract.js';
import { asignadosBono, limpiarPago, pagoPublico } from '../lib/cobros.js';
import { distritoOError, clubDelDistrito } from './distrito.js';

const DIWILO_WA = '573053840193';
export const INDICADORES = ['clubes', 'socios', 'activados', 'proyectos', 'beneficiados', 'horas', 'asistencia', 'distrital'];
const ESTADOS_SOL = ['pendiente', 'creado', 'descartado'];

const mensajeSolicitud = (d, s) => [`Solicitud de club nuevo · Distrito ${PROGRAMAS[d.programa]?.nombre || ''} ${d.codigo}`, `Club: ${s.nombre}`, `Programa: ${PROGRAMAS[s.programa]?.nombre || s.programa}`,
  s.ciudad ? `Ciudad: ${s.ciudad}` : '', s.presidente ? `Presidencia: ${s.presidente}` : '', s.correo ? `Correo: ${s.correo}` : '', s.telefono ? `Teléfono: ${s.telefono}` : '',
  s.notas ? `Notas: ${s.notas}` : ''].filter(Boolean).join('\n');
const waDe = (d, s) => `https://wa.me/${DIWILO_WA}?text=${encodeURIComponent(mensajeSolicitud(d, s))}`;

async function bonoOr404(c, d, id) {
  const b = await one(c.env, 'SELECT * FROM ro_bonos WHERE id = ? AND distrito = ? AND business_id = ?', Number(id), d.clave, c.businessId);
  if (!b) throw new HttpError(404, 'Bono no encontrado');
  return b;
}

export function routes(r) {
  /* ---------- Clubes nuevos y quitar clubes ---------- */
  r.get('/api/distrito/solicitudes', 'tenant', async (c) => {
    const d = await distritoOError(c);
    const rows = await all(c.env, 'SELECT * FROM ro_distrito_solicitudes WHERE distrito = ? AND business_id = ? ORDER BY created_at DESC LIMIT 100', d.clave, c.businessId);
    return json({ rows: rows.map((s) => ({ ...s, whatsapp: waDe(d, s) })) });
  });
  r.post('/api/distrito/solicitudes', 'manager', async (c) => {
    const d = await distritoOError(c), b = await readJson(c.req), t = Date.now();
    const s = { nombre: cast('nombre', 'text', b.nombre), programa: cast('programa', Object.keys(PROGRAMAS), b.programa || 'rotaract'), ciudad: cast('ciudad', 'text', b.ciudad),
      presidente: cast('presidente', 'text', b.presidente), correo: b.correo ? cast('correo', 'email', b.correo) : null, telefono: cast('telefono', 'text', b.telefono), notas: cast('notas', 'long', b.notas) };
    if (!s.nombre) throw new HttpError(400, 'Escribe el nombre del club');
    const x = await c.env.DB.prepare(`INSERT INTO ro_distrito_solicitudes (business_id, distrito, nombre, programa, ciudad, presidente, correo, telefono, notas, creado_por, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(c.businessId, d.clave, s.nombre, s.programa, s.ciudad, s.presidente, s.correo, s.telefono, s.notas, c.session.user_id, t, t).run();
    await audit(c, `Solicitó el club nuevo «${s.nombre}»`, { modulo: 'distrito' });
    return json({ id: x.meta.last_row_id, ...s, estado: 'pendiente', whatsapp: waDe(d, s) }, 201);
  });
  r.patch('/api/distrito/solicitudes/:id', 'manager', async (c) => {
    const d = await distritoOError(c), b = await readJson(c.req), estado = cast('estado', ESTADOS_SOL, b.estado);
    const x = await c.env.DB.prepare('UPDATE ro_distrito_solicitudes SET estado = ?, updated_at = ? WHERE id = ? AND distrito = ? AND business_id = ?')
      .bind(estado, Date.now(), Number(c.params.id), d.clave, c.businessId).run();
    if (!x.meta.changes) throw new HttpError(404, 'Solicitud no encontrada');
    return json({ ok: true });
  });
  r.post('/api/distrito/clubes/:id/quitar', 'manager', async (c) => {
    const { club } = await clubDelDistrito(c, c.params.id);
    await c.env.DB.prepare("INSERT INTO ro_club_config (business_id, distrito, updated_at) VALUES (?, '0', ?) ON CONFLICT(business_id) DO UPDATE SET distrito = '0', updated_at = excluded.updated_at")
      .bind(club.id, Date.now()).run();
    await audit(c, `Quitó del distrito al club «${club.name}»`, { modulo: 'distrito' });
    return json({ ok: true });
  });

  /* ---------- Bonos por club ---------- */
  const camposBono = (b, parcial, bid) => {
    const o = {};
    if (!parcial || 'nombre' in b) { o.nombre = cast('nombre', 'text', b.nombre); if (!o.nombre) throw new HttpError(400, 'Escribe el nombre del bono'); }
    if (!parcial || 'valor' in b) { o.valor = cast('valor', 'money', b.valor); if (!(o.valor > 0)) throw new HttpError(400, 'El valor de cada bono debe ser mayor que cero'); }
    if ('vence' in b) o.vence = b.vence ? cast('vence', 'date', b.vence) : null;
    if ('notas' in b) o.notas = cast('notas', 'long', b.notas);
    if (!parcial || 'reparto' in b) o.reparto = ['por_socio', 'por_club'].includes(b.reparto) ? b.reparto : 'manual';
    if (!parcial || 'cantidad' in b) { o.cantidad = Math.max(0, Math.round(Number(b.cantidad) || 0)); if (o.reparto !== 'manual' && !o.cantidad) throw new HttpError(400, 'Indica cuántos bonos le tocan a cada socio o a cada club'); }
    if ('pago' in b) o.pago = limpiarPago(b.pago, `${bid}/distrito-qr/`);
    return o;
  };
  r.get('/api/distrito/bonos', 'tenant', async (c) => {
    const d = await distritoOError(c);
    const [bonos, clubes] = await Promise.all([all(c.env, 'SELECT * FROM ro_bonos WHERE distrito = ? AND business_id = ? ORDER BY created_at DESC', d.clave, c.businessId), clubesDelDistrito(c.env, d.codigo, d.programa)]);
    const P = enDistrito(c.env, d.codigo, d.programa);
    const [asig, soc, movs] = bonos.length ? await Promise.all([
      all(c.env, `SELECT * FROM ro_bonos_clubes WHERE bono_id IN (SELECT id FROM ro_bonos WHERE distrito = ? AND business_id = ?)`, d.clave, c.businessId),
      all(c.env, `SELECT business_id, COUNT(*) n FROM ro_socios WHERE ${EN_DISTRITO} AND ${PAGA_CUOTA} GROUP BY business_id`, ...P),
      all(c.env, `SELECT business_id, bono_id, SUM(monto) total FROM ro_movimientos WHERE ${EN_DISTRITO} AND bono_id IS NOT NULL AND tipo = 'egreso' GROUP BY business_id, bono_id`, ...P),
    ]) : [[], [], []];
    return json({ rows: bonos.map(({ pago, ...b }) => {
      const por = clubes.map((k) => { const a = asig.find((x) => x.bono_id === b.id && x.club_id === k.id) || {}, socios = soc.find((x) => x.business_id === k.id)?.n || 0;
        const asignados = asignadosBono(b, socios, a.asignados), total = asignados * b.valor, caja = movs.find((x) => x.business_id === k.id && x.bono_id === b.id)?.total || 0, pagado = (a.pagado || 0) + caja;
        return { club_id: k.id, club: k.name, socios, asignados, vendidos: a.vendidos || 0, pagado, pagado_distrito: a.pagado || 0, pagado_caja: caja, total, saldo: Math.max(0, total - pagado) }; });
      const s = (k) => por.reduce((t, x) => t + x[k], 0), pg = (() => { try { return JSON.parse(pago || '') || null; } catch { return null; } })();
      return { ...b, pago: pagoPublico(pago, `/api/cobros/qr?bono=${b.id}`), qr_key: pg?.qr_key || null, clubes: por, asignados: s('asignados'), vendidos: s('vendidos'), total: s('total'), pagado: s('pagado') };
    }) });
  });
  r.post('/api/distrito/bonos', 'manager', async (c) => {
    const d = await distritoOError(c), o = camposBono(await readJson(c.req), false, c.businessId), t = Date.now();
    const x = await c.env.DB.prepare('INSERT INTO ro_bonos (business_id, distrito, nombre, valor, vence, notas, reparto, cantidad, pago, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(c.businessId, d.clave, o.nombre, o.valor, o.vence || null, o.notas || null, o.reparto, o.cantidad, o.pago || null, t, t).run();
    await audit(c, `Creó el bono «${o.nombre}»`, { modulo: 'distrito' });
    return json({ id: x.meta.last_row_id, ...o }, 201);
  });
  r.patch('/api/distrito/bonos/:id', 'manager', async (c) => {
    const d = await distritoOError(c), b = await bonoOr404(c, d, c.params.id), o = camposBono(await readJson(c.req), true, c.businessId), ks = Object.keys(o);
    if (ks.length) await c.env.DB.prepare(`UPDATE ro_bonos SET ${ks.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).bind(...ks.map((k) => o[k]), Date.now(), b.id).run();
    return json({ ok: true });
  });
  r.delete('/api/distrito/bonos/:id', 'manager', async (c) => {
    const d = await distritoOError(c), b = await bonoOr404(c, d, c.params.id);
    if (await one(c.env, 'SELECT 1 FROM ro_bonos_clubes WHERE bono_id = ? AND (vendidos > 0 OR pagado > 0) LIMIT 1', b.id)) throw new HttpError(409, 'Algún club ya vendió o pagó este bono: no se puede borrar');
    await c.env.DB.batch([c.env.DB.prepare('DELETE FROM ro_bonos_clubes WHERE bono_id = ?').bind(b.id), c.env.DB.prepare('DELETE FROM ro_bonos WHERE id = ?').bind(b.id)]);
    await audit(c, `Borró el bono «${b.nombre}»`, { modulo: 'distrito' });
    return json({ ok: true });
  });
  r.put('/api/distrito/bonos/:id/clubes/:club', 'manager', async (c) => {
    const d = await distritoOError(c), b = await bonoOr404(c, d, c.params.id), { club } = await clubDelDistrito(c, c.params.club), x = await readJson(c.req);
    const asignados = cast('asignados', 'money', x.asignados) || 0, vendidos = cast('vendidos', 'money', x.vendidos) || 0, pagado = cast('pagado', 'money', x.pagado) || 0;
    if (vendidos > asignados) throw new HttpError(400, 'No puede vender más bonos de los que tiene asignados');
    await c.env.DB.prepare(`INSERT INTO ro_bonos_clubes (bono_id, club_id, asignados, vendidos, pagado, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(bono_id, club_id) DO UPDATE SET asignados = excluded.asignados, vendidos = excluded.vendidos, pagado = excluded.pagado, updated_at = excluded.updated_at`)
      .bind(b.id, club.id, asignados, vendidos, pagado, Date.now()).run();
    await audit(c, `Bono «${b.nombre}» · ${club.name}: ${asignados} asignados, ${vendidos} vendidos`, { modulo: 'distrito' });
    return json({ ok: true });
  });
  // Lado del club: sus bonos (solo lectura; los registra el distrito)
  r.get('/api/club/bonos', 'tenant', async (c) => json({ rows: await bonosClub(c.env, c.businessId) }));

  /* ---------- Metas del año rotario ---------- */
  r.get('/api/distrito/metas', 'tenant', async (c) => {
    const d = await distritoOError(c), anio = Number(c.url.searchParams.get('anio')) || anioRotarioDe(today());
    const rows = await all(c.env, 'SELECT indicador, meta FROM ro_distrito_metas WHERE distrito = ? AND anio = ?', d.clave, anio);
    return json({ anio, metas: Object.fromEntries(rows.map((x) => [x.indicador, x.meta])) });
  });
  r.put('/api/distrito/metas', 'manager', async (c) => {
    const d = await distritoOError(c), b = await readJson(c.req), anio = Number(b.anio);
    if (!(anio > 2000 && anio < 2100)) throw new HttpError(400, 'Año rotario no válido');
    const st = [];
    for (const k of INDICADORES) {
      if (!(k in (b.metas || {}))) continue;
      const v = b.metas[k] === '' || b.metas[k] == null ? null : cast(k, 'money', b.metas[k]);
      st.push(v ? c.env.DB.prepare('INSERT INTO ro_distrito_metas (distrito, anio, indicador, meta, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(distrito, anio, indicador) DO UPDATE SET meta = excluded.meta, updated_at = excluded.updated_at').bind(d.clave, anio, k, v, Date.now())
        : c.env.DB.prepare('DELETE FROM ro_distrito_metas WHERE distrito = ? AND anio = ? AND indicador = ?').bind(d.clave, anio, k));
    }
    if (st.length) await c.env.DB.batch(st);
    await audit(c, `Cambió las metas del distrito ${anio}-${anio + 1}`, { modulo: 'distrito' });
    return json({ ok: true });
  });
}
