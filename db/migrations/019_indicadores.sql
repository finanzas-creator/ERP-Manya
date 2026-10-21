-- 019 · Indicadores de caja y riesgo (R4): cobros esperados por semana, días de cobro (DSO)
-- y concentración de ventas en los 5 mayores clientes.

-- Cobros esperados: saldo de cada cuota pendiente en la semana de su vencimiento (R-23, R-33).
-- Tres partes que no se superponen: lo ya vencido (en la semana actual), lo facturado que vence
-- y lo que aún falta facturar, cada uno en la semana de su vencimiento.
create view v_proyeccion_cobros with (security_invoker = true) as
select greatest(date_trunc('week', vencimiento), date_trunc('week', current_date))::date as semana,
       coalesce(sum(saldo_usd) filter (where vencimiento < current_date), 0) as vencido_usd,
       coalesce(sum(saldo_usd) filter (where vencimiento >= current_date and comprobante_id is not null), 0) as facturado_usd,
       coalesce(sum(saldo_usd) filter (where vencimiento >= current_date and comprobante_id is null), 0) as por_facturar_usd
from v_cuota
where not pagada and vencimiento is not null and vencimiento < current_date + 91
group by 1;
grant select on v_proyeccion_cobros to authenticated;
revoke all on v_proyeccion_cobros from anon;

-- DSO = cartera facturada por cobrar / facturado de los últimos 90 días × 90.
-- Concentración = venta neta de los 5 mayores clientes / venta neta de los últimos 12 meses (R-04).
create or replace view v_kpi_hoy_calc with (security_invoker = true) as
select k.*, k.por_cobrar_usd + k.por_facturar_usd + k.falta_planificar_usd as pendiente_contratos_usd,
       round(k.por_cobrar_usd / nullif(f.facturado_90d_usd, 0) * 90) as dso_dias,
       c.top5_usd / nullif(c.total_usd, 0) as concentracion_top5
from (
  select
    (select coalesce(sum(saldo_usd), 0) from v_cuota where not pagada and comprobante_id is not null) as por_cobrar_usd,
    (select coalesce(sum(saldo_usd), 0) from v_cuota where estado = 'vencida') as vencido_usd,
    (select coalesce(sum(saldo_usd), 0) from v_cuota where estado = 'por_facturar') as por_facturar_usd,
    (select coalesce(sum(a_usd(falta_planificar, moneda, fecha_contrato)), 0) from v_venta
       where estado_plan = 'falta_planificar') as falta_planificar_usd,
    (select count(*) from v_venta where estado_plan in ('sin_plan', 'falta_planificar', 'sobre_planificado'))
       as ventas_plan_descuadrado,
    (select count(*) from v_renovacion where dias_para_vencer between 0 and 30) as renovaciones_30d,
    (select count(*) from v_renovacion where dias_para_vencer < 0) as renovaciones_vencidas
) k
cross join (
  select sum(a_usd(total, moneda, fecha_emision)) as facturado_90d_usd
  from v_comprobante where fecha_emision > current_date - 90
) f
cross join (
  with por_cliente as (
    select cliente_id, sum(ventas_usd) as v from v_ventas_cliente_mes
    where periodo > (date_trunc('month', current_date) - interval '12 months') group by 1
  )
  select (select sum(v) from (select v from por_cliente order by v desc limit 5) t) as top5_usd,
         (select sum(v) from por_cliente) as total_usd
) c;
create or replace view v_kpi_hoy as select * from kpi_hoy();
