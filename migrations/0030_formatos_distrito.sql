-- Formatos del distrito: el distrito arma el formato (secciones) y cada club de su programa lo llena como un documento formal
-- (presentación de proyectos). El envío guarda una copia de las secciones para que cambiar el formato no dañe lo ya llenado.
CREATE TABLE IF NOT EXISTS ro_formatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,   -- negocio del distrito
  distrito TEXT NOT NULL,                                            -- clave del distrito (claveDistrito)
  nombre TEXT NOT NULL, descripcion TEXT,
  secciones TEXT NOT NULL DEFAULT '[]',                              -- JSON [{id, titulo, ayuda, tipo, requerido, opciones}]
  activo INTEGER NOT NULL DEFAULT 1, fecha_limite TEXT,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_formatos_d ON ro_formatos (distrito, activo);

CREATE TABLE IF NOT EXISTS ro_formato_envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,   -- el club
  distrito TEXT NOT NULL, formato_id INTEGER NOT NULL, formato_nombre TEXT, secciones TEXT NOT NULL DEFAULT '[]',
  titulo TEXT NOT NULL, respuestas TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'borrador',                           -- borrador | enviado | aprobado | devuelto | rechazado
  comentario TEXT, proyecto_id INTEGER, creado_por TEXT,
  enviado_at INTEGER, revisado_at INTEGER, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_fenvios_club ON ro_formato_envios (business_id, estado);
CREATE INDEX IF NOT EXISTS ro_fenvios_d ON ro_formato_envios (distrito, estado);
