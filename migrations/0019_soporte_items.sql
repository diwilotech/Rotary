-- Impacto: un comprobante (recibo de caja, cuenta de cobro…) puede tener varios ítems: [{descripcion, cantidad, valor}].
-- El valor del soporte es la suma de cantidad × valor.
ALTER TABLE ro_aporte_soportes ADD COLUMN items TEXT;
