-- Kit de marca del club: el logotipo oficial del programa (PNG del Brand Center de Rotary, lo sube el club) y los datos
-- con que se arma el logotipo del club (nombre, segunda línea, versión, color) y las piezas.
ALTER TABLE ro_club_config ADD COLUMN kit TEXT;
ALTER TABLE ro_club_config ADD COLUMN emblema_key TEXT;
