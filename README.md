# CD Rotaract (cdrotaract.diwilo.com)

App de Diwilo para clubes Rotaract (club piloto: Rotaract Club de Medellín).
Reglas: skill `diwilo-nueva-app` (partió de CD Academia) · Fecha: 2026-11-22 · Estado: **Producción** (publicada con wrangler el 2026-11-22; falta Turnstile propio y repo).

## Qué tiene (primera entrega)
- **Club**
  - **Socios:** la junta arriba con su cargo, en el orden oficial, y los demás socios abajo. Ficha 360, foto y acceso a la app.
  - **Activación:** botón **Activar** que genera el certificado de activación (código `RTC-…`) para descargar en PDF, y una pestaña con el estado de activación de cada socio.
  - **Reuniones:** calendario didáctico que abre en hoy («Estás aquí»). Muestra reuniones y eventos en colores distintos, la próxima reunión con cuenta regresiva, confirmaciones, asistencia, minuta y compromisos.
  - **Tareas:** kanban con responsable, fecha y checklist.
- **Impacto:** proyectos en tarjetas con beneficiados, tareas, alianzas y origen de los recursos (Caja mayor, Financiación externa o Doble). También pestañas de Alianzas y Beneficiarios.
- **Finanzas:** solo **Caja menor (Club)** y **Caja mayor (Obras)**, cada una con su flujo de categorías. Se elige la caja para ver sus movimientos. Hay traslados entre cajas.
- **Cuotas:** cartera arriba e ingresos con comprobante abajo. Lo que reporta el socio llega pendiente; al verificarlo entra a la Caja menor. Ya no existe la sección «Pagos».
- **Lo tuyo:** las tareas, reuniones, asistencia y cuotas del socio, más su certificado.
- **Mi carnet:** botón en la barra superior, con opción de editar los datos y la foto.
- **Celular:** accesos fijos Inicio · Club · Lo tuyo · Juegos.
- **Diwilo Admin:** la app se registra con `modulosPorDefecto: false`. Su plan inicial es «Sin módulos», así que cada negocio arranca sin módulos y se activan a mano.

## Distrito (2026-11-23)
- Perfil **Distrito**: tablero de todos los clubes del código (4271 por defecto), detalle de cada club en solo lectura, los 12 meses del año rotario sumados y la **cuota distrital** por socio activo.
- Para activarlo: crear «Distrito 4271» en diwilo.com/admin → Rotaract y marcarlo:
  `npx wrangler d1 execute control-de-rotaract-db --remote --command "INSERT OR REPLACE INTO ro_club_config (business_id, distrito, es_distrito) VALUES ('<id>', '4271', 1)"`
- Un club de otro distrito: `INSERT OR REPLACE INTO ro_club_config (business_id, distrito) VALUES ('<id club>', '<código>')`.
- Finanzas: flujo de los 12 meses del año rotario por caja. En la Caja menor, «¿En qué se gasta?» son las **obligaciones** del año: arriba el total (pagado, por pagar, en caja, cuánto falta, cuotas proyectadas al mes) y cada rubro (Obligaciones RI y Distrito —incluye la cuota distrital—, Reconocimiento y protocolo, Bonos distritales, Camisetas del club, Pines…) con su valor editable (`PUT /api/cajas/rubros`, en `ro_obligaciones`) y botón **Pagar** (`POST /api/cajas/rubros/pagar` → egreso en Movimientos, luego comprobante).
- Socios: después de la junta, grupos por tipo (socios, honorarios, aspirantes, socios externos, voluntarios invitados). «Socios» cuenta solo a los miembros del club.

## Pruebas
- `npm run db:migrate:local && npm test` → «Todo bien»: 115 verificaciones en total, 32 de ellas de los módulos del club.
- Pantallas revisadas en Chromium sin interfaz, en tamaño celular: las 8 cargan sin errores de JS.

## Importar los datos del club
1. En diwilo.com/admin → Negocios → Rotaract, crea «Rotaract Club de Medellín» y copia su id.
2. Genera el SQL: `node scripts/importar-rotaract.mjs --json ~/Downloads/rotaract-datos.json --negocio <id> --salida importacion.sql`
3. Aplícalo: `npx wrangler d1 execute control-de-rotaract-db --remote --file importacion.sql`

El importador se puede repetir sin duplicar. Trae socios con su cargo vigente, reuniones, asistencia y confirmaciones, tareas, proyectos, beneficiarios, alianzas, movimientos y cuotas.
Los comprobantes y fotos que no tenían enlace público quedan anotados con su ruta del sistema anterior.

## Despliegue (pendiente)
1. `npx wrangler login`. La sesión de Cloudflare de este equipo venció.
2. `npx wrangler d1 create control-de-rotaract-db` y pegar el `database_id` en `wrangler.jsonc`.
3. `npx wrangler r2 bucket create cdrotaract-files`.
4. Crear un widget de Turnstile para `cdrotaract.diwilo.com`:
   - poner la llave pública en `TURNSTILE_SITE_KEY` de `wrangler.jsonc`;
   - guardar el secreto con `npx wrangler secret put TURNSTILE_SECRET_KEY`.
5. Crear el repo `diwilotech/cdrotaract`, subir `main` y conectar Workers Builds. Al desplegar aplica las migraciones.
6. Después, publicar Diwilo Web. Los cambios ya están en su carpeta: `platform.js`, `modulos.js` y `wrangler.jsonc`.
7. Comprobar:
   - que en diwilo.com/admin → Negocios aparezca «Rotaract»;
   - que `https://cdrotaract.diwilo.com/api/platform/businesses` responda 401.

## Pendiente (segunda entrega)
- **Juegos:** 8 juegos del club, con salas y rondas.
- **Del sistema anterior:** inventario, pines y reconocimientos, capacitación, mentorías, metas del año rotario y certificación del club.
- **Inicio:** figura isométrica de la línea «Clubes y asociaciones».
