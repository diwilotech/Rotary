-- Programa del club: la app sirve a clubes Rotary, Rotaract e Interact. Los clubes que ya existen quedan como Rotaract.
-- El programa cambia textos, certificados y logos; socios, reuniones, tareas, impacto, cajas, cuotas y juegos son iguales.
ALTER TABLE ro_club_config ADD COLUMN programa TEXT NOT NULL DEFAULT 'rotaract';
