-- 009 · Venta neta: el monto de la venta es el precio al cliente; las ventas del mes
-- restan el costo de proveedor (R-01, R-04, R-61, D-20).

-- Costo de proveedor por venta: única definición, la usan ventas y GP por venta.
create view v_costo_proveedor_venta with (security_invoker = true) as
select venta_id, sum(a_usd(monto, moneda, fecha)) as proveedor_usd
from costo_directo
where anulado_en is null and tipo = 'proveedor'
group by venta_id;

-- R-04: ventas por fecha de contrato, netas del costo de proveedor; solo naturaleza propia (R-03).
create or replace view v_ventas_mes with (security_invoker = true) as
select date_trunc('month', vb.fecha_contrato)::date as periodo,
       vb.linea, vb.categoria, vb.modalidad,
       sum(vb.monto_neto_usd - coalesce(p.proveedor_usd, 0)) as ventas_usd,
       count(*) as ventas
from v_venta_base vb
left join v_costo_proveedor_venta p on p.venta_id = vb.id
where vb.naturaleza = 'propio'
group by 1, 2, 3, 4;

-- R-63: GP por venta; el costo de proveedor se resta una vez (R-61).
create or replace view v_gp_venta with (security_invoker = true) as
with lm as (
  select periodo, linea_id, ingreso_usd,
         planilla_usd + direccion_usd + compartidos_usd as indirecto_usd
  from v_gp_linea_mes where linea_id is not null
), asignado as (
  select iv.venta_id, sum(iv.ingreso_usd) as ingreso_usd,
         sum(lm.indirecto_usd * iv.ingreso_usd / nullif(lm.ingreso_usd, 0)) as indirecto_usd
  from v_ingreso_venta_mes iv
  join lm on lm.periodo = iv.periodo and lm.linea_id = iv.linea_id
  group by iv.venta_id
)
select vb.id as venta_id, vb.codigo, vb.cliente_id, vb.cliente, vb.marca, vb.servicio, vb.categoria,
       vb.linea, vb.fecha_contrato,
       coalesce(a.ingreso_usd, 0) as ingreso_usd,
       coalesce(d.proveedor_usd, 0) as costos_directos_usd,
       coalesce(a.indirecto_usd, 0) as costo_asignado_usd,
       coalesce(a.ingreso_usd, 0) - coalesce(d.proveedor_usd, 0) - coalesce(a.indirecto_usd, 0) as gp_usd
from v_venta_base vb
left join asignado a on a.venta_id = vb.id
left join v_costo_proveedor_venta d on d.venta_id = vb.id
where vb.naturaleza = 'propio';

grant select on v_costo_proveedor_venta to authenticated;
