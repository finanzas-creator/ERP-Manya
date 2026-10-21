-- 023 · Autodetracción (R-36): si el cliente paga la factura completa al banco (sin depositar la
-- detracción), la agencia debe depositarla ella misma. Queda pendiente, con alerta, hasta que se
-- registra el depósito con su constancia de pago.

-- Desde qué fecha de emisión se exige (lo anterior se revisa aparte; config).
alter table config add column autodetraccion_desde date not null default '2026-01-01';

-- Datos del depósito: hechos que registra tesorería. La constancia es la ruta del archivo.
alter table comprobante add column autodetraccion_operacion text;
alter table comprobante add column autodetraccion_constancia text;

-- R-36: comprobantes con detracción que el cliente no depositó y ya pagó el total al banco.
-- La detracción se deposita en soles, redondeada al sol (TC del mes de emisión).
create view v_autodetraccion with (security_invoker = true) as
select co.id as comprobante_id, co.cliente_id, co.cliente, co.empresa, co.serie_numero, co.fecha_emision,
       co.fecha_pago_completo, co.moneda, co.total, co.pct_detraccion, co.detraccion,
       round(case when co.moneda = 'PEN' then co.detraccion else co.detraccion * tc_de(co.fecha_emision) end)
         as detraccion_pen,
       c.autodetraccion_fecha, c.autodetraccion_operacion, c.autodetraccion_constancia,
       case when c.autodetraccion_constancia is not null then 'conforme' else 'pendiente' end as estado,
       current_date - co.fecha_pago_completo as dias_pendiente
from v_comprobante co
join comprobante c on c.id = co.id
where co.pct_detraccion > 0
  and co.pagado_100
  and co.pagado_detraccion < co.detraccion - 0.01
  and co.fecha_emision >= (cfg()).autodetraccion_desde;
grant select on v_autodetraccion to authenticated;
revoke all on v_autodetraccion from anon;

-- La alerta llega a los tres roles por el KPI de hoy.
create or replace view v_kpi_hoy_calc with (security_invoker = true) as
select k.*, k.por_cobrar_usd + k.por_facturar_usd + k.falta_planificar_usd as pendiente_contratos_usd,
       round(k.por_cobrar_usd / nullif(f.facturado_90d_usd, 0) * 90) as dso_dias,
       c.top5_usd / nullif(c.total_usd, 0) as concentracion_top5,
       a.autodetracciones_pendientes, a.autodetraccion_pendiente_pen
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
) c
cross join (
  select count(*) as autodetracciones_pendientes, coalesce(sum(detraccion_pen), 0) as autodetraccion_pendiente_pen
  from v_autodetraccion where estado = 'pendiente'
) a;
create or replace view v_kpi_hoy as select * from kpi_hoy();

-- Archivo de las constancias: carpeta privada de Supabase Storage (solo donde existe Storage).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('constancias', 'constancias', false)
    on conflict (id) do nothing;
    execute $p$create policy constancias_lectura on storage.objects for select to authenticated
             using (bucket_id = 'constancias' and (select public.app_rol() in ('admin', 'tesoreria')))$p$;
    execute $p$create policy constancias_alta on storage.objects for insert to authenticated
             with check (bucket_id = 'constancias' and (select public.app_rol() in ('admin', 'tesoreria')))$p$;
  end if;
end $$;
