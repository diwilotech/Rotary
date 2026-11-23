-- Impacto: comunidades como directorio propio (cada una con sus beneficiarios), aportes por proyecto (del club o de una
-- alianza, con cuánto ayuda) y documentos escritos en el editor (bloques: texto, tablas, archivos, enlaces).
CREATE TABLE IF NOT EXISTS ro_comunidades (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL,
  nombre TEXT NOT NULL, tipo TEXT, lugar TEXT, contacto TEXT, telefono TEXT, descripcion TEXT, foto_url TEXT,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_comunidades_biz ON ro_comunidades (business_id, nombre);
ALTER TABLE ro_proyectos ADD COLUMN comunidad_id INTEGER;
ALTER TABLE ro_beneficiarios ADD COLUMN comunidad_id INTEGER;
CREATE INDEX IF NOT EXISTS ro_benef_comu ON ro_beneficiarios (business_id, comunidad_id);

CREATE TABLE IF NOT EXISTS ro_proyecto_aportes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, proyecto_id INTEGER NOT NULL,
  origen TEXT NOT NULL DEFAULT 'club', alianza_id INTEGER, tipo_aporte TEXT NOT NULL DEFAULT 'financiera',
  monto INTEGER NOT NULL DEFAULT 0, recibido INTEGER NOT NULL DEFAULT 0, notas TEXT,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_aportes_p ON ro_proyecto_aportes (business_id, proyecto_id);
CREATE INDEX IF NOT EXISTS ro_aportes_a ON ro_proyecto_aportes (business_id, alianza_id);

ALTER TABLE ro_proyecto_docs ADD COLUMN bloques TEXT;

-- Datos que ya existían: la comunidad escrita en cada proyecto pasa al directorio de comunidades…
INSERT INTO ro_comunidades (business_id, nombre, lugar, contacto, descripcion, created_at, updated_at)
  SELECT business_id, TRIM(MAX(comunidad)), MAX(comunidad_lugar), MAX(comunidad_contacto), MAX(comunidad_descripcion), MIN(created_at), MAX(updated_at)
  FROM ro_proyectos WHERE TRIM(COALESCE(comunidad, '')) <> '' GROUP BY business_id, LOWER(TRIM(comunidad));
UPDATE ro_proyectos SET comunidad_id = (SELECT c.id FROM ro_comunidades c WHERE c.business_id = ro_proyectos.business_id AND LOWER(c.nombre) = LOWER(TRIM(ro_proyectos.comunidad)))
  WHERE TRIM(COALESCE(comunidad, '')) <> '';
-- …los beneficiarios quedan en la comunidad de su proyecto…
UPDATE ro_beneficiarios SET comunidad_id = (SELECT p.comunidad_id FROM ro_proyectos p WHERE p.id = ro_beneficiarios.proyecto_id AND p.business_id = ro_beneficiarios.business_id)
  WHERE proyecto_id IS NOT NULL;
-- …el financiador externo escrito a mano (sin alianza financiera en el proyecto) pasa a ser una alianza del proyecto…
INSERT INTO ro_alianzas (business_id, proyecto_id, nombre, estado, tipo_aporte, aporte_comprometido, aporte_recibido, origen_id, created_at, updated_at)
  SELECT p.business_id, p.id, COALESCE(NULLIF(TRIM(p.financiador), ''), 'Financiador externo'), 'activa', 'financiera', p.monto_externo, 0, 'fin-proyecto-' || p.id, p.created_at, p.updated_at
  FROM ro_proyectos p WHERE p.monto_externo > 0
    AND NOT EXISTS (SELECT 1 FROM ro_alianzas a WHERE a.business_id = p.business_id AND a.proyecto_id = p.id AND a.tipo_aporte = 'financiera')
    AND NOT EXISTS (SELECT 1 FROM ro_alianzas a WHERE a.business_id = p.business_id AND a.origen_id = 'fin-proyecto-' || p.id);
-- …y lo que aportaban el club (Caja mayor) y las alianzas del proyecto pasa a aportes.
INSERT INTO ro_proyecto_aportes (business_id, proyecto_id, origen, tipo_aporte, monto, recibido, created_at, updated_at)
  SELECT business_id, id, 'club', 'financiera', monto_caja_mayor, 0, created_at, updated_at FROM ro_proyectos WHERE monto_caja_mayor > 0;
INSERT INTO ro_proyecto_aportes (business_id, proyecto_id, origen, alianza_id, tipo_aporte, monto, recibido, created_at, updated_at)
  SELECT business_id, proyecto_id, 'alianza', id, COALESCE(tipo_aporte, 'otra'), aporte_comprometido, aporte_recibido, created_at, updated_at
  FROM ro_alianzas WHERE proyecto_id IS NOT NULL;
