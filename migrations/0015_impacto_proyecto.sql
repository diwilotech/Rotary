-- Impacto: cada proyecto con su comunidad (a quién se impacta, p. ej. «Fundación Jardín de Amor»), su documentación
-- (archivos o enlaces) y alianzas con tipo de aporte (financiera, social, en especie…) y lo comprometido/recibido.
ALTER TABLE ro_proyectos ADD COLUMN comunidad TEXT;
ALTER TABLE ro_proyectos ADD COLUMN comunidad_lugar TEXT;
ALTER TABLE ro_proyectos ADD COLUMN comunidad_contacto TEXT;
ALTER TABLE ro_proyectos ADD COLUMN comunidad_descripcion TEXT;
ALTER TABLE ro_alianzas ADD COLUMN tipo_aporte TEXT;
ALTER TABLE ro_alianzas ADD COLUMN aporte_comprometido INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ro_alianzas ADD COLUMN aporte_recibido INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS ro_proyecto_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, proyecto_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, tipo TEXT, archivo_key TEXT, mime TEXT, url TEXT, notas TEXT,
  subido_por TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_proyecto_docs_p ON ro_proyecto_docs (business_id, proyecto_id);
