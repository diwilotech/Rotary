// Kit de marca: arma el logotipo del club (logotipo oficial del programa + nombre del club, versión horizontal o vertical,
// a todo color o a una tinta) y piezas para redes e impresos con los colores de marca. Todo se dibuja en el navegador;
// aquí solo se guardan los datos del kit y el logotipo oficial (PNG con fondo transparente, del Brand Center de Rotary).
//   GET /api/kit · PUT /api/kit {…}   ·   POST /api/kit/emblema (PNG) · GET /api/kit/emblema · DELETE /api/kit/emblema
import { json, readJson, HttpError } from '../lib/http.js';
import { one } from '../lib/crud.js';
import { audit } from '../lib/audit.js';
import { guardarArchivo, servirArchivo, borrarArchivo } from '../lib/archivos.js';

const MOD = 'kit';
const cfg = (c) => one(c.env, 'SELECT kit, emblema_key FROM ro_club_config WHERE business_id = ?', c.businessId);
const upsert = (c, col, v) => c.env.DB.prepare(`INSERT INTO ro_club_config (business_id, ${col}, updated_at) VALUES (?, ?, ?) ON CONFLICT(business_id) DO UPDATE SET ${col} = excluded.${col}, updated_at = excluded.updated_at`).bind(c.businessId, v, Date.now()).run();

export function routes(r) {
  r.get('/api/kit', `tenant:${MOD}`, async (c) => {
    const k = await cfg(c), biz = await one(c.env, 'SELECT name FROM businesses WHERE id = ?', c.businessId);
    let kit = {}; try { kit = JSON.parse(k?.kit || '{}'); } catch (_) { kit = {}; }
    return json({ kit, emblema: k?.emblema_key ? `/api/kit/emblema?v=${encodeURIComponent(k.emblema_key.slice(-12))}` : null, club: biz?.name || '' });
  });
  r.put('/api/kit', `manager:${MOD}`, async (c) => {
    const b = await readJson(c.req), s = JSON.stringify(b || {});
    if (s.length > 4000) throw new HttpError(400, 'Datos del kit demasiado grandes');
    await upsert(c, 'kit', s);
    return json({ ok: true });
  });
  r.post('/api/kit/emblema', `manager:${MOD}`, async (c) => {
    const f = await guardarArchivo(c, 'marca', { max: 3 * 1024 * 1024 });
    if (f.mime !== 'image/png') { await borrarArchivo(c.env, f.key); throw new HttpError(400, 'Sube el logotipo en PNG con fondo transparente'); }
    const k = await cfg(c);
    await upsert(c, 'emblema_key', f.key);
    await borrarArchivo(c.env, k?.emblema_key);
    await audit(c, 'Subió el logotipo oficial del programa al kit de marca', { modulo: MOD });
    return json({ ok: true });
  });
  r.get('/api/kit/emblema', `tenant:${MOD}`, async (c) => servirArchivo(c, { key: (await cfg(c))?.emblema_key, mime: 'image/png', nombre: 'logotipo.png' }));
  r.delete('/api/kit/emblema', `manager:${MOD}`, async (c) => {
    const k = await cfg(c);
    await upsert(c, 'emblema_key', null);
    await borrarArchivo(c.env, k?.emblema_key);
    return json({ ok: true });
  });
}
