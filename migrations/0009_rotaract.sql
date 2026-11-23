-- CD Rotaract: socios (junta y activación), reuniones y eventos, tareas, impacto (proyectos, beneficiarios, alianzas),
-- finanzas en dos cajas (menor = club, mayor = obras) y cuotas. Todas las tablas filtran por business_id.
-- origen_id = id del sistema anterior (importación), para no duplicar.

CREATE TABLE IF NOT EXISTS ro_socios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, user_id TEXT,
  nombre TEXT NOT NULL, email TEXT, telefono TEXT, documento TEXT, fecha_nacimiento TEXT, profesion TEXT, instagram TEXT,
  foto_key TEXT, foto_url TEXT,
  fecha_ingreso TEXT, tipo_membresia TEXT NOT NULL DEFAULT 'socio', estado TEXT NOT NULL DEFAULT 'activo',
  cargo TEXT, cargo_desde TEXT, paga_cuota INTEGER NOT NULL DEFAULT 1, notas TEXT,
  activado_at TEXT, activacion_codigo TEXT, activado_por TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_socios_biz ON ro_socios (business_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ro_socios_user ON ro_socios (business_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ro_socios_origen ON ro_socios (business_id, origen_id) WHERE origen_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ro_socios_codigo ON ro_socios (activacion_codigo) WHERE activacion_codigo IS NOT NULL;

CREATE TABLE IF NOT EXISTS ro_reuniones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'reunion', titulo TEXT NOT NULL, fecha TEXT NOT NULL, hora_ini TEXT, hora_fin TEXT,
  lugar TEXT, modalidad TEXT NOT NULL DEFAULT 'presencial', enlace TEXT, descripcion TEXT, minuta TEXT, compromisos TEXT,
  estado TEXT NOT NULL DEFAULT 'programada', proyecto_id INTEGER,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_reuniones_biz ON ro_reuniones (business_id, fecha);
CREATE UNIQUE INDEX IF NOT EXISTS ro_reuniones_origen ON ro_reuniones (business_id, origen_id) WHERE origen_id IS NOT NULL;

-- Una fila por socio y reunión: confirmación (si/no) y asistencia (1/0).
CREATE TABLE IF NOT EXISTS ro_asistencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, reunion_id INTEGER NOT NULL, socio_id INTEGER NOT NULL,
  respuesta TEXT, presente INTEGER, created_at INTEGER, updated_at INTEGER,
  UNIQUE (business_id, reunion_id, socio_id)
);
CREATE INDEX IF NOT EXISTS ro_asistencia_socio ON ro_asistencia (business_id, socio_id);

CREATE TABLE IF NOT EXISTS ro_tareas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
  titulo TEXT NOT NULL, descripcion TEXT, estado TEXT NOT NULL DEFAULT 'pendiente', prioridad TEXT NOT NULL DEFAULT 'normal',
  fecha_limite TEXT, socio_id INTEGER, proyecto_id INTEGER, reunion_id INTEGER, checklist TEXT, orden INTEGER NOT NULL DEFAULT 0,
  completada_at INTEGER, creada_por TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_tareas_biz ON ro_tareas (business_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ro_tareas_origen ON ro_tareas (business_id, origen_id) WHERE origen_id IS NOT NULL;

-- Impacto
CREATE TABLE IF NOT EXISTS ro_proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
  nombre TEXT NOT NULL, descripcion TEXT, objetivo TEXT, estado TEXT NOT NULL DEFAULT 'propuesta',
  fecha_inicio TEXT, fecha_fin TEXT, socio_lider_id INTEGER, foto_url TEXT,
  beneficiados INTEGER NOT NULL DEFAULT 0, horas_servicio INTEGER NOT NULL DEFAULT 0,
  financiacion TEXT NOT NULL DEFAULT 'caja_mayor', presupuesto INTEGER NOT NULL DEFAULT 0,
  monto_caja_mayor INTEGER NOT NULL DEFAULT 0, monto_externo INTEGER NOT NULL DEFAULT 0, financiador TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_proyectos_biz ON ro_proyectos (business_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ro_proyectos_origen ON ro_proyectos (business_id, origen_id) WHERE origen_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ro_beneficiarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, proyecto_id INTEGER,
  nombre TEXT NOT NULL, tipo TEXT, edad INTEGER, autorizacion_datos INTEGER NOT NULL DEFAULT 0, autorizacion_imagen INTEGER NOT NULL DEFAULT 0, notas TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_benef_biz ON ro_beneficiarios (business_id, proyecto_id);
CREATE UNIQUE INDEX IF NOT EXISTS ro_benef_origen ON ro_beneficiarios (business_id, origen_id) WHERE origen_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ro_alianzas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, proyecto_id INTEGER,
  nombre TEXT NOT NULL, tipo TEXT, contacto TEXT, telefono TEXT, correo TEXT, municipio TEXT,
  estado TEXT NOT NULL DEFAULT 'prospecto', descripcion TEXT, proximo_paso TEXT, proximo_paso_fecha TEXT, ultimo_contacto TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_alianzas_biz ON ro_alianzas (business_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ro_alianzas_origen ON ro_alianzas (business_id, origen_id) WHERE origen_id IS NOT NULL;

-- Finanzas: solo dos cajas. menor = Club, mayor = Obras.
CREATE TABLE IF NOT EXISTS ro_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
  caja TEXT NOT NULL, tipo TEXT NOT NULL, fecha TEXT NOT NULL, concepto TEXT NOT NULL, categoria TEXT, monto INTEGER NOT NULL,
  proyecto_id INTEGER, socio_id INTEGER, pago_id INTEGER, traslado TEXT,
  comprobante_key TEXT, comprobante_url TEXT, observaciones TEXT, registrado_por TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_mov_biz ON ro_movimientos (business_id, caja, fecha);
CREATE UNIQUE INDEX IF NOT EXISTS ro_mov_origen ON ro_movimientos (business_id, origen_id) WHERE origen_id IS NOT NULL;

-- Cuotas: periodos (lo esperado por socio) y pagos (con comprobante; al verificarse entran a la caja menor).
CREATE TABLE IF NOT EXISTS ro_periodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
  mes TEXT NOT NULL, nombre TEXT NOT NULL, monto INTEGER NOT NULL, vence TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER,
  UNIQUE (business_id, mes)
);
CREATE TABLE IF NOT EXISTS ro_pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, socio_id INTEGER NOT NULL,
  monto INTEGER NOT NULL, fecha TEXT NOT NULL, metodo TEXT, estado TEXT NOT NULL DEFAULT 'pendiente',
  comprobante_key TEXT, comprobante_mime TEXT, comprobante_url TEXT, observaciones TEXT, motivo_rechazo TEXT,
  verificado_por TEXT, verificado_at INTEGER, subido_por TEXT,
  origen_id TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_pagos_biz ON ro_pagos (business_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS ro_pagos_origen ON ro_pagos (business_id, origen_id) WHERE origen_id IS NOT NULL;
