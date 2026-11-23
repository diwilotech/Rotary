-- Impacto: control de lo que entra o sale de cada financiador del proyecto (soportes: recibo, cuenta de cobro, factura…
-- con su archivo). Si el aporte es del club, sale de una caja (mayor u menor) y cada soporte crea su egreso en Finanzas.
ALTER TABLE ro_proyecto_aportes ADD COLUMN caja TEXT;
UPDATE ro_proyecto_aportes SET caja = 'mayor' WHERE origen = 'club';
CREATE TABLE IF NOT EXISTS ro_aporte_soportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, aporte_id INTEGER NOT NULL, proyecto_id INTEGER NOT NULL,
  fecha TEXT NOT NULL, monto INTEGER NOT NULL DEFAULT 0, forma TEXT NOT NULL DEFAULT 'recibo', notas TEXT,
  archivo_key TEXT, mime TEXT, movimiento_id INTEGER, registrado_por TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_soportes_ap ON ro_aporte_soportes (business_id, aporte_id);
CREATE INDEX IF NOT EXISTS ro_soportes_mov ON ro_aporte_soportes (business_id, movimiento_id);

-- Todo beneficiario va en una comunidad: los que no tenían quedan en «Jardín De Amor».
INSERT INTO ro_comunidades (business_id, nombre, created_at, updated_at)
  SELECT DISTINCT b.business_id, 'Jardín De Amor', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM ro_beneficiarios b WHERE b.comunidad_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM ro_comunidades c WHERE c.business_id = b.business_id AND LOWER(c.nombre) LIKE '%jard%n de amor%');
UPDATE ro_beneficiarios SET comunidad_id = (SELECT MIN(c.id) FROM ro_comunidades c WHERE c.business_id = ro_beneficiarios.business_id AND LOWER(c.nombre) LIKE '%jard%n de amor%')
  WHERE comunidad_id IS NULL;
