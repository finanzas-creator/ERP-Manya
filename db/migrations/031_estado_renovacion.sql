-- 031 · Estado de cada renovación (R-55): vigente / por vencer / vencida / caída, ciclos y deuda.

alter table config
  add column renovacion_aviso_dias integer not null default 30 check (renovacion_aviso_dias > 0),
  add column renovacion_gracia_dias integer not null default 30 check (renovacion_gracia_dias >= 0);

-- Columnas nuevas al final (create or replace no permite reordenar).
create or replace view v_renovacion with (security_invoker = true) as
with deuda as (
  select cliente_id, sum(saldo_usd) as vencido_usd from v_cuota where estado = 'vencida' group by 1
), r as (
  select distinct on (vb.servicio_contratado_id)
         vb.servicio_contratado_id, vb.id as ultima_venta_id, vb.cliente_id, vb.cliente, vb.marca,
         vb.servicio, vb.categoria, vb.monto_neto, vb.moneda, vb.monto_neto_usd,
         vb.fecha_contrato as inicio_ciclo, vb.fecha_fin as vence, vb.fecha_fin - current_date as dias_para_vencer,
         count(*) over (partition by vb.servicio_contratado_id) as ciclos
  from v_venta_base vb
  where vb.modalidad = 'mensual' and vb.estado_servicio = 'activo'
  order by vb.servicio_contratado_id, vb.fecha_contrato desc, vb.codigo desc
)
select r.servicio_contratado_id, r.ultima_venta_id, r.cliente_id, r.cliente, r.marca, r.servicio, r.categoria,
       r.monto_neto, r.moneda, r.monto_neto_usd, r.inicio_ciclo, r.vence, r.dias_para_vencer,
       -- R-55
       case when r.dias_para_vencer is null or r.dias_para_vencer > (cfg()).renovacion_aviso_dias then 'vigente'
            when r.dias_para_vencer >= 0 then 'por_vencer'
            when r.dias_para_vencer >= -(cfg()).renovacion_gracia_dias then 'vencida'
            else 'caida' end as estado,
       r.ciclos,
       coalesce(d.vencido_usd, 0) as deuda_vencida_usd
from r left join deuda d on d.cliente_id = r.cliente_id;

-- R-53 lee la gracia de R-55 (antes: 30 escrito en la vista).
create or replace view v_cliente_caido with (security_invoker = true) as
with historia as (
  select cliente_id, max(periodo) as ultimo_mes, sum(ingreso_usd) as ingreso_total_usd
  from v_cliente_mes group by 1
), ultimos as (
  select cm.cliente_id, avg(cm.ingreso_usd) as ingreso_mensual_usd, sum(cm.recurrente_usd) > 0.5 as recurrente
  from v_cliente_mes cm join historia h on h.cliente_id = cm.cliente_id
  where cm.periodo > (h.ultimo_mes - interval '3 months')::date group by 1
), activos_hoy as (
  select cliente_id from v_cliente_mes where periodo >= date_trunc('month', current_date)::date
  union select cliente_id from v_renovacion where estado <> 'caida'
)
select c.id as cliente_id, c.razon_social as cliente, h.ultimo_mes,
       (h.ultimo_mes + interval '1 month')::date as caido_desde,
       (extract(year from age(date_trunc('month', current_date), h.ultimo_mes)) * 12
        + extract(month from age(date_trunc('month', current_date), h.ultimo_mes)))::int as meses_sin_ingreso,
       u.ingreso_mensual_usd, h.ingreso_total_usd,
       case when u.recurrente then 'recurrente' else 'proyecto' end as tipo,
       (select string_agg(distinct s.nombre, ', ') from servicio_contratado sc join servicio s on s.id = sc.servicio_id
         where sc.cliente_id = c.id) as servicios
from historia h
join cliente c on c.id = h.cliente_id
join ultimos u on u.cliente_id = h.cliente_id
where h.ultimo_mes >= (date_trunc('month', current_date) - interval '12 months')::date
  and not exists (select 1 from activos_hoy a where a.cliente_id = h.cliente_id);

-- El KPI de hoy cuenta por estado (R-55).
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
    (select count(*) from v_renovacion where estado = 'por_vencer') as renovaciones_30d,
    (select count(*) from v_renovacion where estado = 'vencida') as renovaciones_vencidas
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
