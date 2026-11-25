-- Gestión del distrito: cuota de representación (valor fijo por club), solicitudes de clubes nuevos, bonos por club y metas del año.
ALTER TABLE ro_cuota_distrital ADD COLUMN tipo TEXT NOT NULL DEFAULT 'por_socio';   -- por_socio | por_club (representación)

CREATE TABLE IF NOT EXISTS ro_distrito_solicitudes (   -- club nuevo: lo crea Diwilo en su admin
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL, distrito TEXT NOT NULL,
  nombre TEXT NOT NULL, programa TEXT NOT NULL DEFAULT 'rotaract', ciudad TEXT,
  presidente TEXT, correo TEXT, telefono TEXT, notas TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente',              -- pendiente | creado | descartado
  creado_por TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_distrito_solicitudes_d ON ro_distrito_solicitudes (distrito, estado);

CREATE TABLE IF NOT EXISTS ro_bonos (                    -- bonos/boletas del distrito que se reparten entre los clubes
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id TEXT NOT NULL, distrito TEXT NOT NULL,
  nombre TEXT NOT NULL, valor INTEGER NOT NULL, vence TEXT, notas TEXT,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_bonos_d ON ro_bonos (distrito);
CREATE TABLE IF NOT EXISTS ro_bonos_clubes (
  bono_id INTEGER NOT NULL, club_id TEXT NOT NULL,
  asignados INTEGER NOT NULL DEFAULT 0, vendidos INTEGER NOT NULL DEFAULT 0, pagado INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  PRIMARY KEY (bono_id, club_id)
);

CREATE TABLE IF NOT EXISTS ro_distrito_metas (           -- metas del año rotario del distrito por indicador
  distrito TEXT NOT NULL, anio INTEGER NOT NULL, indicador TEXT NOT NULL, meta INTEGER NOT NULL,
  updated_at INTEGER,
  PRIMARY KEY (distrito, anio, indicador)
);
