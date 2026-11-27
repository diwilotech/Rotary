-- Equipo distrital por año rotario (RDR, secretaría, tesorería, coordinaciones…) y los certificados que expide el distrito.
-- La persona se enlaza por correo: así sus certificados distritales le salen en «Lo tuyo» desde cualquier club.
CREATE TABLE IF NOT EXISTS ro_distrito_equipo (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, distrito TEXT NOT NULL, anio INTEGER NOT NULL,
  cargo TEXT NOT NULL, nombre TEXT NOT NULL, correo TEXT, telefono TEXT, club_id TEXT, club TEXT, socio_id INTEGER, orden INTEGER NOT NULL DEFAULT 50,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_dequipo_d ON ro_distrito_equipo (distrito, anio);
CREATE TABLE IF NOT EXISTS ro_distrito_certificados (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, distrito TEXT NOT NULL, miembro_id INTEGER,
  tipo TEXT NOT NULL,                -- servicio (cargo distrital en un año) | reconocimiento
  titulo TEXT, texto TEXT, nombre TEXT NOT NULL, correo TEXT, club TEXT, cargo TEXT, anio INTEGER, fecha TEXT NOT NULL, codigo TEXT,
  creado_por TEXT, created_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_dcert_d ON ro_distrito_certificados (distrito, anio);
CREATE INDEX IF NOT EXISTS ro_dcert_correo ON ro_distrito_certificados (correo);
