-- 018 · Costos directos de cada venta (proveedor e influencers, consumo de pauta) con su monto
-- en USD: una sola conversión que usan la venta, el GP y el control de pauta (R-01, R-61, R-64).
create view v_costo_directo with (security_invoker = true) as
select cd.id, cd.venta_id, cd.tipo, cd.fecha, cd.moneda, cd.monto, cd.descripcion,
       a_usd(cd.monto, cd.moneda, cd.fecha) as monto_usd
from costo_directo cd
where cd.anulado_en is null;
grant select on v_costo_directo to authenticated;
revoke all on v_costo_directo from anon;

create or replace view v_costo_proveedor_venta with (security_invoker = true) as
select venta_id, sum(monto_usd) as proveedor_usd
from v_costo_directo
where tipo = 'proveedor'
group by venta_id;

-- R-64: pauta facturada vs consumida.
create or replace view v_control_pauta with (security_invoker = true) as
select vb.id as venta_id, vb.cliente, vb.marca, vb.fecha_contrato, vb.monto_neto_usd as pauta_usd,
       coalesce(sum(cd.monto_usd), 0) as consumo_usd,
       vb.monto_neto_usd - coalesce(sum(cd.monto_usd), 0) as diferencia_usd
from v_venta_base vb
left join v_costo_directo cd on cd.venta_id = vb.id and cd.tipo = 'consumo_pauta'
where vb.naturaleza = 'terceros'
group by vb.id, vb.cliente, vb.marca, vb.fecha_contrato, vb.monto_neto_usd;
