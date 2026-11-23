-- Distrito: un negocio marcado como distrito (es_distrito = 1) ve en solo lectura todos los clubes con su mismo código
-- (por defecto 4271, variable DISTRITO_DEFECTO) y les pone la cuota distrital, que a cada club le llega como obligación
-- proyectada en Finanzas. El código y la marca de distrito los pone Diwilo (SQL), no el club.
CREATE TABLE IF NOT EXISTS ro_club_config (
  business_id TEXT PRIMARY KEY,
  distrito TEXT,                         -- NULL = DISTRITO_DEFECTO
  es_distrito INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS ro_cuota_distrital (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL,             -- el negocio del distrito que la creó
  distrito TEXT NOT NULL,
  nombre TEXT NOT NULL,
  valor_socio INTEGER NOT NULL,          -- valor por socio activo del club
  vence TEXT NOT NULL,                   -- YYYY-MM-DD
  anio INTEGER NOT NULL,                 -- año rotario (julio a junio) en que vence
  notas TEXT,
  creado_por TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_cuota_distrital_cod ON ro_cuota_distrital (distrito, vence);

-- El pago que hace el club de una cuota distrital (egreso de la Caja menor)
ALTER TABLE ro_movimientos ADD COLUMN distrital_id INTEGER;
CREATE INDEX IF NOT EXISTS ro_movimientos_distrital ON ro_movimientos (business_id, distrital_id);
