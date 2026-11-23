# AGENTS.md — CD Rotaract
Stack: Worker + D1 (+R2), JS sin framework, Bootstrap 5. Reglas completas: skill `diwilo-nueva-app`.
Multi-tenant: toda consulta lleva `WHERE business_id = ?`.
Contrato Diwilo (no tocar): `platform.js`, `platform-rpc.js`, clase `Platform`, roles, invitación, `paid_until`.
Módulos: del catálogo por `modulos.app.json` → `centrales`; propios en `modulos.app.json` → `modulos`.
IA: herramientas en `src/ia/control.js` + bloque `mcp` del módulo; llaves nunca en la app.
Pruebas: `npm run db:migrate:local && npm test` (usa `scripts/modulos-local/` para levantar Diwilo Modulos sin la nube).
Trampas: nunca cachear `/staff/*` ni `/api/*`; Turnstile se verifica en el Worker; secrets nunca en el código; en móvil el menú va a la derecha.
Estado: versión de reglas, fecha y pendientes en el README.
