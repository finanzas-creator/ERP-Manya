-- 014 · Vistas para los módulos de costos, clientes, pauta y estado de resultados, y
-- KPIs de lectura para el CEO. Cada monto en USD se convierte en un solo lugar (R-06, R-60).

-- ---------- Costos con su monto en USD (R-60) ----------
-- v_planilla_usd gana el detalle de cada fila (se agregan columnas al final).
create or replace view v_planilla_usd with (security_invoker = true) as
select pl.periodo, pl.persona_id, pl.sub_area_id, sa.grupo, sa.linea_id, pl.equipo_id,
       a_usd(pl.costo_total, pl.moneda, pl.periodo) as costo_usd,
       pl.id, pe.nombre as persona, pl.cargo, pl.tipo_cargo, pl.forma_pago, pl.tipo_recibo,
       sa.nombre as sub_area, e.nombre as equipo, pl.empresa_id, pl.moneda, pl.costo_total
from planilla pl
join persona pe on pe.id = pl.persona_id
left join sub_area sa on sa.id = pl.sub_area_id
left join equipo e on e.id = pl.equipo_id
where pl.anulado_en is null;

create view v_herramienta_usd with (security_invoker = true) as
select h.id, h.periodo, h.nombre, h.tipo, h.plan, h.moneda, h.monto, h.tarjeta,
       a_usd(h.monto, h.moneda, h.periodo) as monto_usd
from herramienta_gasto h
where h.anulado_en is null;

create view v_comision_pago_usd with (security_invoker = true) as
select c.id, c.periodo, c.persona_id, pe.nombre as persona, c.moneda, c.monto,
       a_usd(c.monto, c.moneda, c.periodo) as monto_usd
from comision_pago c
join persona pe on pe.id = c.persona_id
where c.anulado_en is null;

-- R-60: costos del mes, ahora desde las vistas de detalle (una sola conversión por costo).
create or replace view v_costos_mes with (security_invoker = true) as
with partes as (
  select periodo, costo_usd as planilla, 0::numeric as herramientas, 0::numeric as comisiones, 0::numeric as directos
  from v_planilla_usd
  union all
  select periodo, 0, monto_usd, 0, 0 from v_herramienta_usd
  union all
  select periodo, 0, 0, monto_usd, 0 from v_comision_pago_usd
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

-- R-42: ganado vs pagado por persona y mes.
create or replace view v_comision_persona_mes with (security_invoker = true) as
with ganado as (
  select partner_id as persona_id, periodo_ganada as periodo, sum(comision_usd) as ganado_usd
  from v_comision_cuota where periodo_ganada is not null group by 1, 2
), pagado as (
  select persona_id, periodo, sum(monto_usd) as pagado_usd from v_comision_pago_usd group by 1, 2
)
select coalesce(g.persona_id, p.persona_id) as persona_id, pe.nombre as persona,
       coalesce(g.periodo, p.periodo) as periodo,
       coalesce(g.ganado_usd, 0) as ganado_usd, coalesce(p.pagado_usd, 0) as pagado_usd
from ganado g
full join pagado p on p.persona_id = g.persona_id and p.periodo = g.periodo
join persona pe on pe.id = coalesce(g.persona_id, p.persona_id);

-- Planilla del mes agrupada por tipo de recibo y por sub-área (subtotales de la pantalla).
create view v_planilla_grupo_mes with (security_invoker = true) as
select periodo,
       case when grouping(tipo_recibo) = 0 then 'tipo_recibo' else 'sub_area' end as criterio,
       coalesce(case when grouping(tipo_recibo) = 0 then tipo_recibo else sub_area end, 'Sin dato') as grupo,
       count(*) as personas,
       sum(costo_total) filter (where moneda = 'PEN') as costo_pen,
       sum(costo_usd) as costo_usd
from v_planilla_usd
group by grouping sets ((periodo, tipo_recibo), (periodo, sub_area));

-- Copia los costos recurrentes de un mes a otro (planilla o herramientas) para luego ajustarlos.
-- Solo copia a un mes vacío, así no duplica.
create function copiar_costos_mes(p_tabla text, p_origen date, p_destino date) returns int
language plpgsql as $$
declare n int;
begin
  if p_tabla not in ('planilla', 'herramienta_gasto') then
    raise exception 'Solo se copian planilla o herramientas';
  end if;
  p_origen := date_trunc('month', p_origen)::date;
  p_destino := date_trunc('month', p_destino)::date;
  execute format('select count(*) from %I where periodo = $1 and anulado_en is null', p_tabla) into n using p_destino;
  if n > 0 then raise exception '% ya tiene % registros; edítalos en lugar de copiar', to_char(p_destino, 'MM/YYYY'), n; end if;
  if p_tabla = 'planilla' then
    insert into planilla (periodo, persona_id, cargo, tipo_cargo, forma_pago, tipo_recibo, sub_area_id, equipo_id,
                          empresa_id, moneda, costo_total)
    select p_destino, persona_id, cargo, tipo_cargo, forma_pago, tipo_recibo, sub_area_id, equipo_id,
           empresa_id, moneda, costo_total
    from planilla where periodo = p_origen and anulado_en is null;
  else
    insert into herramienta_gasto (periodo, nombre, tipo, plan, moneda, monto, tarjeta)
    select p_destino, nombre, tipo, plan, moneda, monto, tarjeta
    from herramienta_gasto where periodo = p_origen and anulado_en is null;
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function copiar_costos_mes(text, date, date) from public, anon;
grant execute on function copiar_costos_mes(text, date, date) to authenticated;

-- ---------- Ventas por cliente y pauta por mes ----------
-- R-04: la misma venta neta de v_ventas_mes, por cliente.
create view v_ventas_cliente_mes with (security_invoker = true) as
select date_trunc('month', vb.fecha_contrato)::date as periodo, vb.cliente_id, vb.cliente,
       sum(vb.monto_neto_usd - coalesce(p.proveedor_usd, 0)) as ventas_usd,
       count(*) as ventas
from v_venta_base vb
left join v_costo_proveedor_venta p on p.venta_id = vb.id
where vb.naturaleza = 'propio'
group by 1, 2, 3;

-- R-64: pauta (terceros) facturada vs consumida, por mes de contrato.
create view v_control_pauta_mes with (security_invoker = true) as
select date_trunc('month', fecha_contrato)::date as periodo,
       count(*) as contratos, sum(pauta_usd) as pauta_usd, sum(consumo_usd) as consumo_usd,
       sum(diferencia_usd) as diferencia_usd
from v_control_pauta
group by 1;

-- ---------- Clientes ----------
create view v_cliente with (security_invoker = true) as
with ventas as (
  select cliente_id, count(*) as ventas, max(fecha_contrato) as ultima_venta,
         sum(monto_neto_usd) filter (where naturaleza = 'propio' and fecha_contrato > current_date - 365) as ventas_12m_usd
  from v_venta_base group by 1
), servicios as (
  select cliente_id, count(*) filter (where estado = 'activo') as servicios_activos
  from servicio_contratado group by 1
), deuda as (
  select cliente_id, sum(saldo_usd) as por_cobrar_usd,
         sum(saldo_usd) filter (where estado = 'vencida') as vencido_usd
  from v_cuota where not pagada and comprobante_id is not null group by 1
), marcas as (
  select cliente_id, string_agg(nombre, ', ' order by nombre) as marcas from marca group by 1
)
select c.id, c.razon_social, c.ruc, c.no_domiciliado, m.marcas,
       coalesce(s.servicios_activos, 0) as servicios_activos,
       coalesce(v.ventas, 0) as ventas, v.ultima_venta,
       coalesce(v.ventas_12m_usd, 0) as ventas_12m_usd,
       coalesce(d.por_cobrar_usd, 0) as por_cobrar_usd,
       coalesce(d.vencido_usd, 0) as vencido_usd
from cliente c
left join ventas v on v.cliente_id = c.id
left join servicios s on s.cliente_id = c.id
left join deuda d on d.cliente_id = c.id
left join marcas m on m.cliente_id = c.id;

-- ---------- KPIs: dos miradas de lo pendiente y lo facturado del mes ----------
-- Pendiente según contratos = facturado por cobrar + cuotas por facturar + lo que falta planificar.
create or replace view v_kpi_hoy_calc with (security_invoker = true) as
select k.*, k.por_cobrar_usd + k.por_facturar_usd + k.falta_planificar_usd as pendiente_contratos_usd
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
) k;
create or replace view v_kpi_hoy as select * from kpi_hoy();

-- Facturado del mes: total (con IGV) de los comprobantes emitidos, en USD.
create or replace view v_kpi_mes_calc with (security_invoker = true) as
with ventas as (select periodo, sum(ventas_usd) as ventas_usd from v_ventas_mes group by 1),
ingresos as (
  select periodo, sum(ingreso_usd) filter (where modalidad = 'mensual') as recurrente_usd,
         count(distinct cliente_id) as clientes_activos
  from v_ingreso_venta_mes group by 1
),
cobrado as (select date_trunc('month', fecha)::date as periodo, sum(monto_usd) as cobrado_usd from v_pago group by 1),
facturado as (
  select date_trunc('month', fecha_emision)::date as periodo,
         sum(a_usd(total, moneda, fecha_emision)) as facturado_usd, count(*) as comprobantes
  from v_comprobante group by 1
)
select a.periodo,
       coalesce(v.ventas_usd, 0) as ventas_usd,
       a.ingresos_usd,
       coalesce(i.recurrente_usd, 0) as ingresos_recurrentes_usd,
       coalesce(i.clientes_activos, 0) as clientes_activos,
       coalesce(c.cobrado_usd, 0) as cobrado_usd,
       a.costos_directos_usd + a.planilla_usd + a.herramientas_usd + a.comisiones_usd as costos_usd,
       a.gp_usd,
       a.gp_usd / nullif(a.ingresos_usd, 0) as margen,
       coalesce(f.facturado_usd, 0) as facturado_usd,
       coalesce(f.comprobantes, 0) as comprobantes
from v_gp_agencia_mes a
left join ventas v on v.periodo = a.periodo
left join ingresos i on i.periodo = a.periodo
left join cobrado c on c.periodo = a.periodo
left join facturado f on f.periodo = a.periodo;
create or replace view v_kpi_mes as select * from kpi_mes();

-- ---------- KPIs de lectura para los tres roles (R-80) ----------
-- El CEO no lee tablas operativas; estas funciones exponen solo agregados.
create function kpi_gp_mes() returns setof v_gp_agencia_mes language sql stable security definer
set search_path = public as $$ select * from v_gp_agencia_mes where (select app_rol()) is not null $$;

create function kpi_ventas_categoria_mes() returns setof v_ventas_mes language sql stable security definer
set search_path = public as $$ select * from v_ventas_mes where (select app_rol()) is not null $$;

create function kpi_ingresos_mes() returns setof v_ingresos_mes language sql stable security definer
set search_path = public as $$ select * from v_ingresos_mes where (select app_rol()) is not null $$;

create function kpi_ventas_cliente_mes() returns setof v_ventas_cliente_mes language sql stable security definer
set search_path = public as $$ select * from v_ventas_cliente_mes where (select app_rol()) is not null $$;

create function kpi_pauta_mes() returns setof v_control_pauta_mes language sql stable security definer
set search_path = public as $$ select * from v_control_pauta_mes where (select app_rol()) is not null $$;

create view v_kpi_gp_mes as select * from kpi_gp_mes();
create view v_kpi_ventas_categoria_mes as select * from kpi_ventas_categoria_mes();
create view v_kpi_ingresos_mes as select * from kpi_ingresos_mes();
create view v_kpi_ventas_cliente_mes as select * from kpi_ventas_cliente_mes();
create view v_kpi_pauta_mes as select * from kpi_pauta_mes();

revoke execute on function kpi_gp_mes(), kpi_ventas_categoria_mes(), kpi_ingresos_mes(),
  kpi_ventas_cliente_mes(), kpi_pauta_mes() from public, anon;
grant execute on function kpi_gp_mes(), kpi_ventas_categoria_mes(), kpi_ingresos_mes(),
  kpi_ventas_cliente_mes(), kpi_pauta_mes() to authenticated;

grant select on v_herramienta_usd, v_comision_pago_usd, v_planilla_grupo_mes, v_ventas_cliente_mes,
  v_control_pauta_mes, v_cliente, v_kpi_gp_mes, v_kpi_ventas_categoria_mes, v_kpi_ingresos_mes,
  v_kpi_ventas_cliente_mes, v_kpi_pauta_mes to authenticated;
revoke all on v_herramienta_usd, v_comision_pago_usd, v_planilla_grupo_mes, v_ventas_cliente_mes,
  v_control_pauta_mes, v_cliente, v_kpi_gp_mes, v_kpi_ventas_categoria_mes, v_kpi_ingresos_mes,
  v_kpi_ventas_cliente_mes, v_kpi_pauta_mes from anon;
