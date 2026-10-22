-- 026 · Dos empresas independientes (D-06): un pago debe entrar a una cuenta de la empresa que
-- emitió el comprobante (R-39). Si entró a la cuenta de la otra, se registra igual (es lo que
-- pasó en el banco) pero queda en esta lista para regularizarlo entre empresas.
create view v_pago_otra_empresa with (security_invoker = true) as
select pg.id as pago_id, pg.fecha, q.venta_id, q.cliente, co.serie_numero,
       eco.nombre as empresa_comprobante, ecu.nombre as empresa_cuenta, cb.nombre as cuenta,
       pg.monto, cb.moneda as moneda_cuenta, cb.es_detraccion
from pago pg
join cuenta_bancaria cb on cb.id = pg.cuenta_id
join v_cuota q on q.id = pg.cuota_id
join comprobante co on co.id = q.comprobante_id
join empresa eco on eco.id = co.empresa_id
join empresa ecu on ecu.id = cb.empresa_id
where pg.anulado_en is null and cb.empresa_id <> co.empresa_id;
grant select on v_pago_otra_empresa to authenticated;
revoke all on v_pago_otra_empresa from anon;
