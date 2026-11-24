-- Reuniones: acta estructurada por el orden del día, invitados externos (los registra la junta o ellos mismos con un enlace)
-- y el orden del día sugerido que cada distrito puede editar para sus clubes.
ALTER TABLE ro_reuniones ADD COLUMN acta TEXT;          -- JSON { items: [{ titulo, detalle, notas }], compromisos }
ALTER TABLE ro_reuniones ADD COLUMN acta_estado TEXT;   -- borrador | aprobada
ALTER TABLE ro_reuniones ADD COLUMN token TEXT;         -- enlace público para que los externos se registren
CREATE UNIQUE INDEX IF NOT EXISTS ro_reuniones_token ON ro_reuniones (token) WHERE token IS NOT NULL;
CREATE TABLE IF NOT EXISTS ro_reunion_invitados (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, reunion_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, procedencia TEXT, tipo TEXT, correo TEXT, telefono TEXT,
  via TEXT NOT NULL DEFAULT 'junta', created_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_reunion_invitados_r ON ro_reunion_invitados (business_id, reunion_id);
ALTER TABLE ro_club_config ADD COLUMN orden_dia TEXT;   -- JSON [{ titulo, detalle }] (lo edita el distrito)
