-- 012 · Rendimiento: costos y GP se calculan una vez por mes con agregados, no con
-- subconsultas por fila. Mismas columnas y mismos resultados (R-60, R-61, R-62).

-- R-60: costos del mes en USD.
create or replace view v_costos_mes with (security_invoker = true) as
with partes as (
  select periodo, costo_usd as planilla, 0::numeric as herramientas, 0::numeric as comisiones, 0::numeric as directos
  from v_planilla_usd
  union all
  select periodo, 0, a_usd(monto, moneda, periodo), 0, 0 from herramienta_gasto where anulado_en is null
  union all
  select periodo, 0, 0, a_usd(monto, moneda, periodo), 0 from comision_pago where anulado_en is null
  union all
  select date_trunc('month', cd.fecha)::date, 0, 0, 0,
         case when cd.tipo = 'proveedor' and vb.id is not null
              then a_usd(cd.monto, cd.moneda, cd.fecha) else 0 end         -- R-64: consumo de pauta no entra
  from costo_directo cd left join v_venta_base vb on vb.id = cd.venta_id
  where cd.anulado_en is null
)
select periodo,
       sum(planilla) as planilla_usd,
       sum(herramientas) as herramientas_usd,
       sum(comisiones) as comisiones_usd,
       sum(directos) as costos_directos_usd
from partes
group by periodo;

-- R-62: GP por línea. La fila con linea nula es el overhead no asignado.
-- Por construcción, la suma de líneas + overhead = GP agencia del mes.
create or replace view v_gp_linea_mes with (security_invoker = true) as
with ing as (
  select periodo, linea_id, sum(ingreso_usd) as ingreso from v_ingreso_venta_mes group by 1, 2
), tot as (
  select periodo, sum(ingreso) as ingreso from ing group by 1
), directos as (
  select date_trunc('month', cd.fecha)::date as periodo, vb.linea_id,
         sum(a_usd(cd.monto, cd.moneda, cd.fecha)) as monto
  from costo_directo cd join v_venta_base vb on vb.id = cd.venta_id
  where cd.anulado_en is null and cd.tipo = 'proveedor' group by 1, 2
), pla as (
  select periodo, linea_id, sum(costo_usd) as monto from v_planilla_usd where grupo = 'directo' group by 1, 2
), dir as (
  select p.periodo, w.linea_id, sum(p.costo_usd) * w.peso as monto
  from v_planilla_usd p cross join peso_direccion w
  where p.grupo = 'direccion' group by p.periodo, w.linea_id, w.peso
), costos as materialized (
  select * from v_costos_mes
), lineas as (
  select periodo, linea_id from ing union select periodo, linea_id from directos
  union select periodo, linea_id from pla union select periodo, linea_id from dir
), por_linea as materialized (
  select l.periodo, l.linea_id,
         coalesce(i.ingreso, 0) as ingreso_usd,
         coalesce(d.monto, 0) as costos_directos_usd,
         coalesce(p.monto, 0) as planilla_usd,
         coalesce(r.monto, 0) as direccion_usd,
         coalesce((c.herramientas_usd + c.comisiones_usd) * i.ingreso / nullif(t.ingreso, 0), 0) as compartidos_usd
  from lineas l
  left join ing i on i.periodo = l.periodo and i.linea_id = l.linea_id
  left join tot t on t.periodo = l.periodo
  left join directos d on d.periodo = l.periodo and d.linea_id = l.linea_id
  left join pla p on p.periodo = l.periodo and p.linea_id = l.linea_id
  left join dir r on r.periodo = l.periodo and r.linea_id = l.linea_id
  left join costos c on c.periodo = l.periodo
), asignado as (
  select periodo, sum(planilla_usd + direccion_usd) as planilla, sum(compartidos_usd) as compartidos
  from por_linea group by periodo
), overhead as (      -- planilla overhead/sin sub-área + compartidos de meses sin ingreso
  select m.periodo, null::smallint as linea_id, 0::numeric as ingreso_usd, 0::numeric as costos_directos_usd,
         coalesce(c.planilla_usd, 0) - coalesce(a.planilla, 0) as planilla_usd,
         0::numeric as direccion_usd,
         coalesce(c.herramientas_usd + c.comisiones_usd, 0) - coalesce(a.compartidos, 0) as compartidos_usd
  from (select periodo from tot union select periodo from costos) m
  left join costos c on c.periodo = m.periodo
  left join asignado a on a.periodo = m.periodo
)
select u.periodo, u.linea_id, coalesce(l.nombre, 'Overhead') as linea,
       u.ingreso_usd, u.costos_directos_usd, u.planilla_usd, u.direccion_usd, u.compartidos_usd,
       u.costos_directos_usd + u.planilla_usd + u.direccion_usd + u.compartidos_usd as costo_usd,
       u.ingreso_usd - u.costos_directos_usd - u.planilla_usd - u.direccion_usd - u.compartidos_usd as gp_usd
from (select * from por_linea union all select * from overhead) u
left join linea_negocio l on l.id = u.linea_id;
