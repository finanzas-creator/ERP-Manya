-- 005 · Vistas analíticas: ventas, ingresos, comisiones, costos y GP (macro -> micro).

-- Ventas por fecha de contrato, solo naturaleza propia (R-03, R-04).
create view v_ventas_mes with (security_invoker = true) as
select date_trunc('month', fecha_contrato)::date as periodo,
       linea, categoria, modalidad,
       sum(monto_neto_usd) as ventas_usd,
       count(*) as ventas
from v_venta_base
where naturaleza = 'propio'
group by 1, 2, 3, 4;

-- Ingreso devengado de cada venta por mes de ejecución (R-03, R-05).
create view v_ingreso_venta_mes with (security_invoker = true) as
select vb.id as venta_id, vb.cliente_id, vb.linea_id, vb.linea, vb.categoria, vb.modalidad,
       vb.equipo_id, m.mes::date as periodo,
       vb.monto_neto_usd / r.meses as ingreso_usd
from v_venta_base vb
cross join lateral (
  select vb.periodo_servicio as ini,
         case when vb.modalidad = 'proyecto' and vb.fecha_fin is not null
              then date_trunc('month', vb.fecha_fin)::date
              else vb.periodo_servicio end as fin
) p
cross join lateral (
  select (extract(year from p.fin) * 12 + extract(month from p.fin))
       - (extract(year from p.ini) * 12 + extract(month from p.ini)) + 1 as meses
) r
cross join lateral generate_series(p.ini, p.fin, interval '1 month') m(mes)
where vb.naturaleza = 'propio';

create view v_ingresos_mes with (security_invoker = true) as
select periodo, linea, categoria, modalidad, sum(ingreso_usd) as ingresos_usd
from v_ingreso_venta_mes
group by 1, 2, 3, 4;

-- Comisión por cuota; se gana cuando su comprobante queda pagado al 100% (R-40, R-41).
create view v_comision_cuota with (security_invoker = true) as
select q.id as cuota_id, q.venta_id, vb.partner_id, vb.partner, vb.pct_comision,
       q.monto_neto_usd * vb.pct_comision as comision_usd,
       co.fecha_pago_completo,
       date_trunc('month', co.fecha_pago_completo)::date as periodo_ganada
from v_cuota q
join v_venta_base vb on vb.id = q.venta_id
left join v_comprobante co on co.id = q.comprobante_id
where vb.pct_comision > 0 and vb.partner_id is not null;

-- Ganado vs pagado por persona y mes (R-42).
create view v_comision_persona_mes with (security_invoker = true) as
with ganado as (
  select partner_id as persona_id, periodo_ganada as periodo, sum(comision_usd) as ganado_usd
  from v_comision_cuota where periodo_ganada is not null group by 1, 2
), pagado as (
  select persona_id, periodo, sum(a_usd(monto, moneda, periodo)) as pagado_usd
  from comision_pago where anulado_en is null group by 1, 2
)
select coalesce(g.persona_id, p.persona_id) as persona_id, pe.nombre as persona,
       coalesce(g.periodo, p.periodo) as periodo,
       coalesce(g.ganado_usd, 0) as ganado_usd, coalesce(p.pagado_usd, 0) as pagado_usd
from ganado g
full join pagado p on p.persona_id = g.persona_id and p.periodo = g.periodo
join persona pe on pe.id = coalesce(g.persona_id, p.persona_id);

-- Costos del mes en USD (R-60).
create view v_planilla_usd with (security_invoker = true) as
select pl.periodo, pl.persona_id, pl.sub_area_id, sa.grupo, sa.linea_id, pl.equipo_id,
       a_usd(pl.costo_total, pl.moneda, pl.periodo) as costo_usd
from planilla pl
left join sub_area sa on sa.id = pl.sub_area_id
where pl.anulado_en is null;

create view v_costos_mes with (security_invoker = true) as
with meses as (
  select periodo from planilla where anulado_en is null
  union select periodo from herramienta_gasto where anulado_en is null
  union select periodo from comision_pago where anulado_en is null
  union select date_trunc('month', fecha)::date from costo_directo where anulado_en is null
)
select m.periodo,
       coalesce((select sum(costo_usd) from v_planilla_usd p where p.periodo = m.periodo), 0) as planilla_usd,
       coalesce((select sum(a_usd(monto, moneda, periodo)) from herramienta_gasto h
                 where h.periodo = m.periodo and h.anulado_en is null), 0) as herramientas_usd,
       coalesce((select sum(a_usd(monto, moneda, periodo)) from comision_pago c
                 where c.periodo = m.periodo and c.anulado_en is null), 0) as comisiones_usd,
       coalesce((select sum(a_usd(cd.monto, cd.moneda, cd.fecha))
                 from costo_directo cd join v_venta_base vb on vb.id = cd.venta_id
                 where date_trunc('month', cd.fecha) = m.periodo and cd.anulado_en is null
                   and cd.tipo = 'proveedor'), 0) as costos_directos_usd       -- R-64: consumo de pauta no entra
from meses m;

-- GP agencia (R-61).
create view v_gp_agencia_mes with (security_invoker = true) as
with ing as (select periodo, sum(ingreso_usd) as ingresos_usd from v_ingreso_venta_mes group by 1),
meses as (select periodo from ing union select periodo from v_costos_mes)
select m.periodo,
       coalesce(i.ingresos_usd, 0) as ingresos_usd,
       coalesce(c.costos_directos_usd, 0) as costos_directos_usd,
       coalesce(c.planilla_usd, 0) as planilla_usd,
       coalesce(c.herramientas_usd, 0) as herramientas_usd,
       coalesce(c.comisiones_usd, 0) as comisiones_usd,
       coalesce(i.ingresos_usd, 0) - coalesce(c.costos_directos_usd, 0) - coalesce(c.planilla_usd, 0)
         - coalesce(c.herramientas_usd, 0) - coalesce(c.comisiones_usd, 0) as gp_usd
from meses m
left join ing i on i.periodo = m.periodo
left join v_costos_mes c on c.periodo = m.periodo;

-- GP por línea (R-62). La fila con linea nula es el overhead no asignado.
-- Por construcción, la suma de líneas + overhead = GP agencia del mes.
create view v_gp_linea_mes with (security_invoker = true) as
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
), compartidos as (   -- herramientas + comisiones: se reparten por participación en el ingreso
  select periodo, herramientas_usd + comisiones_usd as monto from v_costos_mes
), lineas as (
  select periodo, linea_id from ing union select periodo, linea_id from directos
  union select periodo, linea_id from pla union select periodo, linea_id from dir
), por_linea as (
  select l.periodo, l.linea_id,
         coalesce(i.ingreso, 0) as ingreso_usd,
         coalesce(d.monto, 0) as costos_directos_usd,
         coalesce(p.monto, 0) as planilla_usd,
         coalesce(r.monto, 0) as direccion_usd,
         coalesce(c.monto * i.ingreso / nullif(t.ingreso, 0), 0) as compartidos_usd
  from lineas l
  left join ing i on i.periodo = l.periodo and i.linea_id = l.linea_id
  left join tot t on t.periodo = l.periodo
  left join directos d on d.periodo = l.periodo and d.linea_id = l.linea_id
  left join pla p on p.periodo = l.periodo and p.linea_id = l.linea_id
  left join dir r on r.periodo = l.periodo and r.linea_id = l.linea_id
  left join compartidos c on c.periodo = l.periodo
), overhead as (      -- planilla overhead/sin sub-área + compartidos de meses sin ingreso
  select a.periodo, null::smallint as linea_id, 0::numeric as ingreso_usd, 0::numeric as costos_directos_usd,
         a.planilla_usd - coalesce((select sum(planilla_usd + direccion_usd) from por_linea x where x.periodo = a.periodo), 0)
           as planilla_usd,
         0::numeric as direccion_usd,
         a.herramientas_usd + a.comisiones_usd
           - coalesce((select sum(compartidos_usd) from por_linea x where x.periodo = a.periodo), 0) as compartidos_usd
  from v_gp_agencia_mes a
)
select u.periodo, u.linea_id, coalesce(l.nombre, 'Overhead') as linea,
       u.ingreso_usd, u.costos_directos_usd, u.planilla_usd, u.direccion_usd, u.compartidos_usd,
       u.costos_directos_usd + u.planilla_usd + u.direccion_usd + u.compartidos_usd as costo_usd,
       u.ingreso_usd - u.costos_directos_usd - u.planilla_usd - u.direccion_usd - u.compartidos_usd as gp_usd
from (select * from por_linea union all select * from overhead) u
left join linea_negocio l on l.id = u.linea_id;

-- GP por venta (R-63, v1): costo indirecto de su línea repartido por participación
-- en el ingreso de la línea en cada mes + sus costos directos.
create view v_gp_venta with (security_invoker = true) as
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
), directos as (
  select venta_id, sum(a_usd(monto, moneda, fecha)) as directos_usd
  from costo_directo where anulado_en is null and tipo = 'proveedor' group by venta_id
)
select vb.id as venta_id, vb.codigo, vb.cliente_id, vb.cliente, vb.marca, vb.servicio, vb.categoria,
       vb.linea, vb.fecha_contrato,
       coalesce(a.ingreso_usd, 0) as ingreso_usd,
       coalesce(d.directos_usd, 0) as costos_directos_usd,
       coalesce(a.indirecto_usd, 0) as costo_asignado_usd,
       coalesce(a.ingreso_usd, 0) - coalesce(d.directos_usd, 0) - coalesce(a.indirecto_usd, 0) as gp_usd
from v_venta_base vb
left join asignado a on a.venta_id = vb.id
left join directos d on d.venta_id = vb.id
where vb.naturaleza = 'propio';

-- Control de pauta: facturado vs consumido (R-64).
create view v_control_pauta with (security_invoker = true) as
select vb.id as venta_id, vb.cliente, vb.marca, vb.fecha_contrato, vb.monto_neto_usd as pauta_usd,
       coalesce(sum(a_usd(cd.monto, cd.moneda, cd.fecha)), 0) as consumo_usd,
       vb.monto_neto_usd - coalesce(sum(a_usd(cd.monto, cd.moneda, cd.fecha)), 0) as diferencia_usd
from v_venta_base vb
left join costo_directo cd on cd.venta_id = vb.id and cd.tipo = 'consumo_pauta' and cd.anulado_en is null
where vb.naturaleza = 'terceros'
group by vb.id, vb.cliente, vb.marca, vb.fecha_contrato, vb.monto_neto_usd;
