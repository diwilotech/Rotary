-- Cada socio tiene 3 fechas: ingreso al club (fecha_ingreso), activación en el club (activado_at, con certificado) y
-- activación en My Rotary (myrotary_at). El código del socio es su ID de My Rotary. Se puede estar activo en el club
-- (con certificado) sin estar todavía en My Rotary.
ALTER TABLE ro_socios ADD COLUMN myrotary_id TEXT;
ALTER TABLE ro_socios ADD COLUMN myrotary_at TEXT;
