-- Cargos de la junta: los define el distrito (en su negocio) para todos los clubes de su programa; la presidencia de cada club los asigna.
ALTER TABLE ro_club_config ADD COLUMN cargos TEXT;   -- JSON ["Presidente/a del club", …]; NULL = la lista sugerida
