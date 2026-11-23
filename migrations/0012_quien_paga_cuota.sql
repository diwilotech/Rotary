-- Quién paga cuota: los socios activos (y la junta) siempre; el club decide si también los aspirantes y los honorarios.
ALTER TABLE ro_club_config ADD COLUMN cuota_aspirantes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ro_club_config ADD COLUMN cuota_honorarios INTEGER NOT NULL DEFAULT 0;
