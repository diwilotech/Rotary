-- Impacto: encuestas de las comunidades (caracterización, conocimientos con puntaje por tema, satisfacción…), creadas
-- desde plantillas o con IA, y llenadas por los socios con cada beneficiario.
--   preguntas = [{ id, tema, texto, tipo: unica|multiple|si_no|escala|numero|texto, opciones: [..], correcta: [índices] }]
CREATE TABLE IF NOT EXISTS ro_encuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, comunidad_id INTEGER,
  titulo TEXT NOT NULL, objetivo TEXT, tipo TEXT NOT NULL DEFAULT 'caracterizacion', estado TEXT NOT NULL DEFAULT 'activa',
  preguntas TEXT NOT NULL DEFAULT '[]', con_ia INTEGER NOT NULL DEFAULT 0, creado_por TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_encuestas_biz ON ro_encuestas (business_id, comunidad_id);
CREATE TABLE IF NOT EXISTS ro_encuesta_respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, business_id TEXT NOT NULL, encuesta_id INTEGER NOT NULL, comunidad_id INTEGER,
  beneficiario_id INTEGER, fecha TEXT NOT NULL, respuestas TEXT NOT NULL DEFAULT '{}', puntaje INTEGER, puntaje_max INTEGER,
  registrado_por TEXT, created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS ro_enc_resp ON ro_encuesta_respuestas (business_id, encuesta_id);
CREATE INDEX IF NOT EXISTS ro_enc_resp_ben ON ro_encuesta_respuestas (business_id, beneficiario_id);
