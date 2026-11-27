-- Cobros del distrito: descuentos de la cuota distrital (pronto pago y pago en cuotas), datos de pago (QR, llave Bre-B,
-- cuenta) por cuota y por bono, reparto de bonos (por socio, por club o a mano), pagos de bonos desde la Caja menor del club
-- y premio/forma de ganar de los retos de juegos.
ALTER TABLE ro_cuota_distrital ADD COLUMN descuentos TEXT;          -- JSON {pronto:[{hasta, pct}], planes:[{cuotas, pct}]}
ALTER TABLE ro_cuota_distrital ADD COLUMN pago TEXT;                -- JSON {llave, banco, tipo_cuenta, numero, titular, instrucciones, qr_key}
ALTER TABLE ro_bonos ADD COLUMN pago TEXT;
ALTER TABLE ro_bonos ADD COLUMN reparto TEXT NOT NULL DEFAULT 'manual';   -- manual | por_socio | por_club
ALTER TABLE ro_bonos ADD COLUMN cantidad INTEGER NOT NULL DEFAULT 0;      -- bonos por socio o por club
CREATE TABLE IF NOT EXISTS ro_cuota_plan_club (                     -- plan de pago que eligió cada club
  cuota_id INTEGER NOT NULL, club_id TEXT NOT NULL, cuotas INTEGER NOT NULL, pct INTEGER NOT NULL DEFAULT 0, updated_at INTEGER,
  PRIMARY KEY (cuota_id, club_id)
);
ALTER TABLE ro_movimientos ADD COLUMN bono_id INTEGER;
CREATE INDEX IF NOT EXISTS ro_movimientos_bono ON ro_movimientos (business_id, bono_id);
ALTER TABLE ro_juego_retos ADD COLUMN premio TEXT;
ALTER TABLE ro_juego_retos ADD COLUMN gana TEXT NOT NULL DEFAULT 'puntos';   -- puntos (total) | promedio (por socio)
