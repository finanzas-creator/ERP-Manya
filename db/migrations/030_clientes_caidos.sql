-- 030 · Clientes activos, caídos y retención (R-53, R-54). Todo sale del ingreso por mes (R-05).

-- Ingreso de cada cliente por mes (solo meses con ingreso real); recurrente = de servicios mensuales.
create view v_cliente_mes with (security_invoker = true) as
select periodo, cliente_id, sum(ingreso_usd) as ingreso_usd,
       coalesce(sum(ingreso_usd) filter (where modalidad = 'mensual'), 0) as recurrente_usd
from v_ingreso_venta_mes
group by 1, 2
having sum(ingreso_usd) > 0.5;

-- R-54: retención mensual de clientes recurrentes (con servicios mensuales). Activos = con ingreso
-- recurrente en el mes; nuevos = primera vez; perdidos = activos el mes anterior que este mes no.
create view v_retencion_mes with (security_invoker = true) as
with rec as (select periodo, cliente_id from v_cliente_mes where recurrente_usd > 0.5),
primera as (select cliente_id, min(periodo) as desde from rec group by 1),
meses as (select distinct periodo from rec)
select m.periodo,
       (select count(*) from rec a where a.periodo = m.periodo) as activos,
       (select count(*) from primera p where p.desde = m.periodo) as nuevos,
       (select count(*) from rec a join rec b on b.cliente_id = a.cliente_id
          and b.periodo = (m.periodo - interval '1 month')::date where a.periodo = m.periodo) as retenidos,
       (select count(*) from rec b where b.periodo = (m.periodo - interval '1 month')::date
          and not exists (select 1 from rec a where a.cliente_id = b.cliente_id and a.periodo = m.periodo)) as perdidos,
       (select count(*) from rec b where b.periodo = (m.periodo - interval '1 month')::date) as activos_mes_anterior
from meses m;

-- R-53: cliente caído = tuvo ingreso en los últimos 12 meses y hoy no tiene ingreso este mes ni en
-- adelante (proyectos en curso) ni servicios mensuales vigentes (un servicio vencido hace más de 30
-- días sin renovar ya no cuenta).
create view v_cliente_caido with (security_invoker = true) as
with historia as (
  select cliente_id, max(periodo) as ultimo_mes, sum(ingreso_usd) as ingreso_total_usd
  from v_cliente_mes group by 1
), ultimos as (
  select cm.cliente_id, avg(cm.ingreso_usd) as ingreso_mensual_usd, sum(cm.recurrente_usd) > 0.5 as recurrente
  from v_cliente_mes cm join historia h on h.cliente_id = cm.cliente_id
  where cm.periodo > (h.ultimo_mes - interval '3 months')::date group by 1
), activos_hoy as (
  select cliente_id from v_cliente_mes where periodo >= date_trunc('month', current_date)::date
  union select cliente_id from v_renovacion where dias_para_vencer >= -30   -- vencido hace más de 30 días sin renovar = caído
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

-- Lectura para los tres roles (R-80).
create function kpi_retencion_mes() returns setof v_retencion_mes language sql stable security definer
set search_path = public as $$ select * from v_retencion_mes where (select app_rol()) is not null $$;
create function kpi_cliente_caido() returns setof v_cliente_caido language sql stable security definer
set search_path = public as $$ select * from v_cliente_caido where (select app_rol()) is not null $$;
create view v_kpi_retencion_mes as select * from kpi_retencion_mes();
create view v_kpi_cliente_caido as select * from kpi_cliente_caido();
revoke execute on function kpi_retencion_mes(), kpi_cliente_caido() from public, anon;
grant execute on function kpi_retencion_mes(), kpi_cliente_caido() to authenticated;
grant select on v_cliente_mes, v_retencion_mes, v_cliente_caido, v_kpi_retencion_mes, v_kpi_cliente_caido to authenticated;
revoke all on v_cliente_mes, v_retencion_mes, v_cliente_caido, v_kpi_retencion_mes, v_kpi_cliente_caido from anon;
