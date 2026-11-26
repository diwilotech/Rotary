-- Enlace de registro del club: la presidencia/junta lo comparte y cada socio crea ahí su cuenta (rol Socio).
-- Guardamos solo el hash del token; NULL = enlace apagado. Cambiarlo invalida el anterior.
ALTER TABLE ro_club_config ADD COLUMN registro_hash TEXT;
ALTER TABLE ro_club_config ADD COLUMN registro_at INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS ro_club_config_registro ON ro_club_config (registro_hash) WHERE registro_hash IS NOT NULL;
