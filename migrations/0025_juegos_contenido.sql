-- Juegos: contenido propio (preguntas, palabras, frases y casillas de bingo que añade cualquier socio), lo que la
-- presidencia oculta del banco del sistema o del distrito, retos del distrito (ranking entre clubes) y la conexión de cada
-- jugador (visto_at: la última vez que su celular consultó la sala).
CREATE TABLE IF NOT EXISTS ro_juego_contenido (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, juego TEXT NOT NULL,
  datos TEXT NOT NULL,              -- JSON según el juego: trivia {p,o:[4],c:0} · impostor {categoria,palabra} · probable {frase} · bingo {texto}
  activo INTEGER NOT NULL DEFAULT 1,
  socio_id INTEGER,                 -- quien la añadió (no se muestra a nadie; solo sirve para «mis aportes»)
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_juego_contenido_biz ON ro_juego_contenido (business_id, juego, activo);

-- Lo que la presidencia apaga del banco que trae la app («b:…») o del contenido del distrito («d:<id>»)
CREATE TABLE IF NOT EXISTS ro_juego_ocultos (
  business_id TEXT NOT NULL, juego TEXT NOT NULL, clave TEXT NOT NULL, created_at INTEGER,
  PRIMARY KEY (business_id, juego, clave)
);

-- Retos del distrito: un juego en unas fechas; las partidas de los clubes en ese reto suman al ranking entre clubes
CREATE TABLE IF NOT EXISTS ro_juego_retos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, distrito TEXT NOT NULL, juego TEXT NOT NULL,
  nombre TEXT NOT NULL, descripcion TEXT, desde TEXT NOT NULL, hasta TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_juego_retos_distrito ON ro_juego_retos (distrito, desde, hasta);

ALTER TABLE ro_juego_salas ADD COLUMN reto_id INTEGER;
ALTER TABLE ro_juego_salas ADD COLUMN opciones TEXT;
ALTER TABLE ro_juego_jugadores ADD COLUMN visto_at INTEGER;
CREATE INDEX IF NOT EXISTS ro_juego_salas_reto ON ro_juego_salas (reto_id, estado);
