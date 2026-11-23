# CD Rotaract — guía rápida

Responde en español. Modo económico: sin capturas salvo que se pidan; de las pruebas mostrar solo el resumen. Ver también `AGENTS.md`.

## Qué es
App `cdrotaract` (cdrotaract.diwilo.com) para clubes Rotaract. Cloudflare Workers + D1 `control-de-rotaract-db` + R2 `cdrotaract-files`, JS sin framework, Bootstrap.
Partió de CD Academia (misma base: shell, login, panel con marco, contrato con Diwilo). Repo previsto: diwilotech/cdrotaract.

## Mapa
- `src/index.js` rutas; `src/api/platform.js` + `src/lib/platform-rpc.js` = contrato con Diwilo (NO tocar). Roles: owner = Presidencia, admin = Junta, staff = Socio.
- Panel `/<slug>` con marco; páginas `/staff/<modulo>.html` + `public/js/pages/<modulo>.js`. Comunes del club en `public/js/pages/club.js` (`RO`: pestañas del Club, avatar, subir archivos).
- `src/lib/rotaract.js`: orden de cargos de la junta (`cargoOrden`), socio de la sesión (`socioDeSesion`, enlaza por correo), `cartera`, `saldos`, `certificadoHtml`.
- Módulos propios (`modulos.app.json`), tablas `ro_*` (migración 0009):
  - `socios` (`src/api/socios.js`): junta primero por cargo y luego socios; ficha 360; **Activar** → `activado_at` + código `RTC-…` y certificado HTML (`/certificado`, botón «Descargar PDF / Imprimir»). «Dar acceso» crea usuario + membresía staff y enlaza `user_id`. Pestaña **Activación** en la misma página (`#activacion`).
  - `reuniones`: reuniones y eventos (`tipo`), calendario `/api/reuniones/calendario`, confirmación (`/responder`) y asistencia (`ro_asistencia`).
  - `tareas`: kanban con checklist (JSON).
  - `impacto`: sin estadísticas arriba; al tocar un proyecto se abre su página (`#p=<id>`) con Resumen (barras de aporte del club y de cada alianza financiera), Documentación (`ro_proyecto_docs`: archivos o enlaces), Comunidad (`ro_proyectos.comunidad*` + beneficiarios) y Alianzas (`tipo_aporte`, `aporte_comprometido/recibido`). Migración 0015. Antes: (`/api/impacto/tarjetas`: beneficiados, tareas, alianzas, gasto de la caja mayor), origen de recursos `caja_mayor | externa | doble`; beneficiarios y alianzas.
  - `cajas` (menú «Finanzas»): solo **Caja menor (Club)** y **Caja mayor (Obras)** en `ro_movimientos.caja`; traslados (`traslado` = par egreso/ingreso). NO usa el módulo central Finanzas.
  - `cuotas`: periodos (`ro_periodos`), cartera y pagos (`ro_pagos`). Pago verificado → ingreso «Cuotas» en la caja menor (`pago_id`); anular lo saca.
  - **Distrito** (perfil aparte, migración 0010): negocio con `ro_club_config.es_distrito = 1` (lo pone Diwilo por SQL). Ve en solo lectura los clubes con su código (`ro_club_config.distrito`, por defecto `DISTRITO_DEFECTO` = 4271) en `/staff/distrito.html` (`src/api/distrito.js`) y pone la cuota distrital (`ro_cuota_distrital`, valor × socios activos que pagan cuota). Al club le llega en Finanzas → Caja menor → **Obligaciones del club** (`/api/cajas/proyectado`: plata en caja vs. por pagar → falta/sobra; cuotas de socios esperadas por mes; en la gráfica, rayado = proyectado) y la paga desde ahí (`ro_movimientos.distrital_id`). Único lugar que lee otros negocios.
- Inicio: widget «Calendario del club» (`/api/club/calendario`: reuniones, eventos, tareas, cumpleaños, proyectos, cuotas y cuota distrital según módulos activos). Finanzas y Cuotas muestran el año rotario (julio a junio).
- Quién paga cuota: `PAGA_CUOTA` (rotaract.js) = socios activos y junta siempre; aspirantes/honorarios si el club lo marca (`ro_club_config.cuota_aspirantes/cuota_honorarios`, migración 0012, `/api/cuotas/config`); externos y voluntarios nunca.
- Socios: 3 fechas — `fecha_ingreso` (ingreso al club), `activado_at` (activación en el club, con certificado; «Activar» pide la fecha) y `myrotary_at` (My Rotary). El código del socio es `myrotary_id` (va en el certificado); se puede estar activo sin My Rotary. `activacion_codigo` (RTC-…) queda solo como verificación interna. Migración 0013.
- Certificado de activación (`certificadoHtml`): solo la fecha de activación en el club («socio del club a partir del…»), logo del club arriba, firmas de Presidencia y Secretaría (`ro_socios.firma_key`, migración 0014; se dibujan en Lo tuyo o en la ficha con `RO.firmar`). Fondo: `public/img/certificado-fondo.png` + `FONDO = true` en rotaract.js cuando llegue el engranaje. Certificados por cargo: pendientes (otro tipo).
- Cobro de cuotas: desde la activación en el club (`inicioCobro`: `activado_at`, si no hay, `fecha_ingreso`).
- La junta está siempre en Equipo con rol admin: `juntaAlEquipo` (socios.js) al guardar un socio y al abrir Equipo.
- `lotuyo` (base, siempre activo): vista del socio, carnet (`/api/lotuyo/carnet`), reportar pago con comprobante, certificado propio.
- `kit` (Kit de marca, migración 0016): logotipo del club = PNG oficial del programa (lo sube la junta desde el Brand Center, `ro_club_config.emblema_key`) + nombre del club; horizontal/centrada, a todo color o a una tinta; descarga PNG/JPG/SVG. Piezas (publicación, historia, portada, volante A5) con foto local, colores de marca y el logotipo en blanco. Todo en canvas (`public/js/pages/kit.js`); el servidor guarda `ro_club_config.kit` (JSON).
- Shell (`public/js/shell.js`): botón **Mi carnet** en la barra superior (`DW.carnet()`); en celular, accesos fijos Inicio · Club · Lo tuyo · Juegos (si existe el módulo `juegos`) + «Más».
- Centrales: marketing, whatsapp, marca, ai, dashboard (sin finanzas ni nómina). IA propia: `src/ia/control.js`, pendientes en `src/ia/pendientes.js`.
- Importación del sistema anterior: `scripts/importar-rotaract.mjs` (genera SQL idempotente por `origen_id`).

## Comandos
- `npm run db:migrate:local && npm test` → "Todo bien". Las pruebas levantan Diwilo Modulos con `scripts/modulos-local/wrangler.jsonc` (sin IA ni correo, no pide credenciales).

## Reglas
- Toda consulta filtra por negocio. Vencida = solo lectura.
- Migraciones nuevas: solo agregar, preservar datos.
- En Diwilo Admin la app está con `modulosPorDefecto: false`: los negocios nuevos arrancan sin módulos.
