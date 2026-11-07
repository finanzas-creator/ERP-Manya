-- 033 · Cobranza alineada a los reportes de gestión (R-45, R-46, D-23).
-- También corrige el número de las reglas de operación y devolución: R-43 y R-44 (D-24).

-- R-44: mismos chequeos de la devolución, con el número de regla correcto en los mensajes.
create or replace function registrar_devolucion(p_comprobante uuid, p_fecha date, p_cuenta smallint, p_monto numeric,
  p_tc numeric, p_detalle text, p_numero_operacion text default null) returns int language plpgsql as $$
declare q record; total numeric; n int; i int := 0; asignado numeric := 0; parte numeric; op uuid := gen_random_uuid();
  mon moneda := (select moneda from cuenta_bancaria where id = p_cuenta);
begin
  if coalesce(trim(p_detalle), '') = '' then raise exception 'R-44: indica el motivo de la devolución'; end if;
  -- lo cobrado por cuota, en la moneda de la cuenta de la devolución
  select sum(cobrado), count(*) into total, n from (
    select sum(p.monto_usd) * case when mon = 'USD' then 1 else p_tc end as cobrado
    from v_pago p join cuota c on c.id = p.cuota_id
    where c.comprobante_id = p_comprobante group by p.cuota_id having sum(p.monto_usd) > 0) x;
  if coalesce(total, 0) <= 0 then raise exception 'R-44: la factura no tiene cobros que devolver'; end if;
  if p_monto > total + 0.01 then raise exception 'R-44: la devolución (%) supera lo cobrado (%)', round(p_monto, 2), round(total, 2); end if;
  for q in select p.cuota_id, sum(p.monto_usd) * case when mon = 'USD' then 1 else p_tc end as cobrado
           from v_pago p join cuota c on c.id = p.cuota_id
           where c.comprobante_id = p_comprobante group by p.cuota_id having sum(p.monto_usd) > 0 order by p.cuota_id loop
    i := i + 1;
    parte := case when i = n then p_monto - asignado else round(p_monto * q.cobrado / total, 2) end;
    asignado := asignado + parte;
    if parte > 0 then
      insert into pago (cuota_id, fecha, cuenta_id, monto, tc, operacion, numero_operacion, es_devolucion, detalle)
      values (q.cuota_id, p_fecha, p_cuenta, parte, p_tc, op, nullif(trim(p_numero_operacion), ''), true, trim(p_detalle));
    end if;
  end loop;
  return n;
end $$;

-- R-45: ingreso cobrado (base caja) y su explicación, por mes y empresa, en soles y dólares.
create view v_cobrado_mes with (security_invoker = true) as
with p as (
  select date_trunc('month', p.fecha)::date as periodo,
         coalesce(co.empresa_id, vb.empresa_id) as empresa_id,
         vb.naturaleza, vb.modalidad, p.es_detraccion,
         p.monto_usd,
         -- pagos en soles por su monto; en dólares con el TC del mes (R-60)
         p.monto_usd * case when p.moneda_cuenta = 'PEN' then p.tc else tc_de(p.fecha) end as monto_pen,
         coalesce(q.monto_neto / nullif(q.total, 0), 1) as f_neto
  from v_pago p
  join v_cuota q on q.id = p.cuota_id
  join v_venta_base vb on vb.id = q.venta_id
  left join comprobante co on co.id = q.comprobante_id
)
select periodo, empresa_id,
       sum(monto_pen) as cobrado_pen,
       sum(monto_usd) as cobrado_usd,
       coalesce(sum(monto_pen * f_neto) filter (where naturaleza = 'propio'), 0) as ingreso_pen,
       coalesce(sum(monto_usd * f_neto) filter (where naturaleza = 'propio'), 0) as ingreso_usd,
       coalesce(sum(monto_pen * f_neto) filter (where naturaleza = 'propio' and modalidad = 'mensual'), 0) as ingreso_mensual_pen,
       coalesce(sum(monto_pen * f_neto) filter (where naturaleza = 'propio' and modalidad = 'proyecto'), 0) as ingreso_proyecto_pen,
       coalesce(sum(monto_pen * (1 - f_neto)) filter (where naturaleza = 'propio'), 0) as igv_pen,
       coalesce(sum(monto_pen) filter (where naturaleza = 'terceros'), 0) as pauta_pen,
       coalesce(sum(monto_pen) filter (where es_detraccion), 0) as detraccion_pen
from p
group by periodo, empresa_id;

-- R-46: cuentas por cobrar por contrato (total con IGV − cobrado), separadas en vencido,
-- por vencer y por facturar. Un saldo dentro de la tolerancia (R-33) no cuenta.
create view v_cxc_venta with (security_invoker = true) as
with q as (
  select venta_id,
         sum(saldo) filter (where comprobante_id is not null and not pagada) as facturado,
         sum(saldo) filter (where estado = 'vencida') as vencido
  from v_cuota group by venta_id
), v as (
  select v.id as venta_id, v.cliente_id, v.cliente, v.codigo, v.empresa_id, v.naturaleza, v.moneda, v.fecha_contrato,
         greatest(v.total - v.pagado, 0) as por_cobrar, q.facturado, q.vencido
  from v_venta v left join q on q.venta_id = v.id
  where v.fecha_contrato <= current_date
    and a_usd(greatest(v.total - v.pagado, 0), v.moneda, current_date) > tolerancia_usd(a_usd(v.total, v.moneda, current_date))
), c as (
  select v.*, least(coalesce(facturado, 0), por_cobrar) as fact,
         least(coalesce(vencido, 0), coalesce(facturado, 0), por_cobrar) as venc
  from v
)
select venta_id, cliente_id, cliente, codigo, empresa_id, naturaleza, moneda, fecha_contrato,
       por_cobrar, venc as vencido, fact - venc as por_vencer, por_cobrar - fact as por_facturar,
       a_usd(por_cobrar, moneda, current_date) as por_cobrar_usd,
       a_usd(venc, moneda, current_date) as vencido_usd,
       a_usd(fact - venc, moneda, current_date) as por_vencer_usd,
       a_usd(por_cobrar - fact, moneda, current_date) as por_facturar_usd
from c;

-- El KPI de hoy: "pendiente según contratos" pasa a ser R-46 y se agregan sus partes y el TC de hoy.
create or replace view v_kpi_hoy_calc with (security_invoker = true) as
select k.*, x.cxc_usd as pendiente_contratos_usd,
       round(k.por_cobrar_usd / nullif(f.facturado_90d_usd, 0) * 90) as dso_dias,
       c.top5_usd / nullif(c.total_usd, 0) as concentracion_top5,
       a.autodetracciones_pendientes, a.autodetraccion_pendiente_pen,
       x.cxc_vencido_usd, x.cxc_por_vencer_usd, x.cxc_por_facturar_usd, x.cxc_pauta_usd, x.cxc_contratos,
       tc_de(current_date) as tc_hoy
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
  select coalesce(sum(por_cobrar_usd), 0) as cxc_usd, coalesce(sum(vencido_usd), 0) as cxc_vencido_usd,
         coalesce(sum(por_vencer_usd), 0) as cxc_por_vencer_usd, coalesce(sum(por_facturar_usd), 0) as cxc_por_facturar_usd,
         coalesce(sum(por_cobrar_usd) filter (where naturaleza = 'terceros'), 0) as cxc_pauta_usd,
         count(*) as cxc_contratos
  from v_cxc_venta
) x
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

-- Lectura para los tres roles (R-80): el CEO ve el ingreso cobrado.
create function kpi_cobrado_mes() returns setof v_cobrado_mes language sql stable security definer
set search_path = public as $$ select * from v_cobrado_mes where (select app_rol()) is not null $$;
create view v_kpi_cobrado_mes as select * from kpi_cobrado_mes();
revoke execute on function kpi_cobrado_mes() from public, anon;
grant execute on function kpi_cobrado_mes() to authenticated;
grant select on v_cobrado_mes, v_cxc_venta, v_kpi_cobrado_mes to authenticated;
revoke all on v_cobrado_mes, v_cxc_venta, v_kpi_cobrado_mes from anon;
