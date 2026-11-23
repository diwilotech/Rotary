-- Obligaciones propias del club (además de la cuota distrital que pone el distrito): reconocimiento y protocolo,
-- bonos distritales, camisetas del club, pines… Se pagan desde la Caja menor (ro_movimientos.obligacion_id).
CREATE TABLE IF NOT EXISTS ro_obligaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
  categoria TEXT NOT NULL, nombre TEXT NOT NULL, monto INTEGER NOT NULL, vence TEXT, notas TEXT,
  creado_por TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_obligaciones_biz ON ro_obligaciones (business_id, vence);
ALTER TABLE ro_movimientos ADD COLUMN obligacion_id INTEGER;
CREATE INDEX IF NOT EXISTS ro_movimientos_obligacion ON ro_movimientos (business_id, obligacion_id);
