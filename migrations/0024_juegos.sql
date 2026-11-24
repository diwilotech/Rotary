-- Juegos del club: salas con código, jugadores y el estado completo de cada partida (solo lo lee el servidor; a cada
-- celular le llega su vista: lo público + lo suyo). Puntos por partida para el ranking del club.
CREATE TABLE IF NOT EXISTS ro_juego_salas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, codigo TEXT NOT NULL, juego TEXT NOT NULL,
  anfitrion_id INTEGER NOT NULL, estado TEXT NOT NULL DEFAULT 'espera',   -- espera | jugando | terminada
  datos TEXT,                       -- JSON con todo el estado de la partida
  version INTEGER NOT NULL DEFAULT 1, ganador_id INTEGER, created_at INTEGER, updated_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS ro_juego_salas_codigo ON ro_juego_salas (business_id, codigo) WHERE estado <> 'terminada';
CREATE INDEX IF NOT EXISTS ro_juego_salas_biz ON ro_juego_salas (business_id, estado, updated_at);
CREATE TABLE IF NOT EXISTS ro_juego_jugadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, sala_id INTEGER NOT NULL, socio_id INTEGER NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0, puntos INTEGER NOT NULL DEFAULT 0, rol TEXT NOT NULL DEFAULT 'jugador', activo INTEGER NOT NULL DEFAULT 1, entro_at INTEGER,
  UNIQUE (sala_id, socio_id)
);
CREATE INDEX IF NOT EXISTS ro_juego_jugadores_socio ON ro_juego_jugadores (business_id, socio_id);
