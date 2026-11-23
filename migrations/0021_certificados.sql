-- Certificados del club además del de activación: servicio en la junta de un año rotario y reconocimientos a un socio.
CREATE TABLE IF NOT EXISTS ro_certificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, socio_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,              -- junta | reconocimiento
  titulo TEXT, texto TEXT, cargo TEXT, anio INTEGER, fecha TEXT NOT NULL, codigo TEXT,
  creado_por TEXT, created_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_certificados_socio ON ro_certificados (business_id, socio_id);
