-- 020 · Tolerancia de redondeo en un solo lugar (R-33) y aplicada también al plan de pagos (R-10):
-- una diferencia de centavos entre la venta y sus cuotas cuenta como plan completo, y una venta de
-- monto 0 no necesita cuotas. Antes 214 ventas del sheet aparecían "descuadradas" por centavos.

-- R-33: diferencia máxima que se considera redondeo o diferencia de cambio, para un monto en USD.
create function tolerancia_usd(base_usd numeric) returns numeric language sql stable as $$
  select least((cfg()).tolerancia_usd, (cfg()).tolerancia_pct * abs(base_usd))
$$;
revoke execute on function tolerancia_usd(numeric) from public, anon;
grant execute on function tolerancia_usd(numeric) to authenticated;

create or replace view v_cuota with (security_invoker = true) as
with pagos as (
  select cuota_id,
         sum(monto_moneda_venta) filter (where not es_detraccion) as pagado_banco,
         sum(monto_moneda_venta) filter (where es_detraccion)     as pagado_detraccion,
         max(fecha) as ultimo_pago
  from v_pago group by cuota_id
), base as (
  select c.id, c.venta_id, c.orden, c.concepto, c.fecha_limite as fecha_limite_contrato,
         co.id as comprobante_id, co.fecha_limite as fecha_limite_cliente,
         vb.moneda, vb.fecha_contrato, vb.cliente_id, vb.cliente, vb.marca, vb.servicio,
         c.monto_neto,
         c.monto_neto * vb.pct_igv as igv,                                     -- R-12
         c.monto_neto * (1 + vb.pct_igv) as total,
         coalesce(p.pagado_banco, 0) as pagado_banco,
         coalesce(p.pagado_detraccion, 0) as pagado_detraccion,
         p.ultimo_pago
  from cuota c
  join v_venta_base vb on vb.id = c.venta_id
  left join comprobante co on co.id = c.comprobante_id and co.anulado_en is null
  left join pagos p on p.cuota_id = c.id
  where c.anulado_en is null
)
select b.*, s1.pagado, s1.saldo, s2.saldo_usd, s1.monto_neto_usd, s1.vencimiento, s3.pagada,
       case                                                                        -- R-34
         when s3.pagada then 'pagada'
         when b.comprobante_id is null then 'por_facturar'
         when s1.vencimiento < current_date then 'vencida'
         else 'por_cobrar'
       end as estado
from base b
cross join lateral (
  select b.pagado_banco + b.pagado_detraccion as pagado,
         b.total - b.pagado_banco - b.pagado_detraccion as saldo,
         a_usd(b.monto_neto, b.moneda, b.fecha_contrato) as monto_neto_usd,
         coalesce(b.fecha_limite_cliente, b.fecha_limite_contrato) as vencimiento    -- R-23
) s1
cross join lateral (select a_usd(s1.saldo, b.moneda, b.fecha_contrato) as saldo_usd) s2
cross join lateral (                                                              -- R-33
  select s2.saldo_usd <= tolerancia_usd(a_usd(b.total, b.moneda, b.fecha_contrato)) as pagada
) s3;

-- Venta con su avance de planificación, facturación y cobro (R-10).
create or replace view v_venta with (security_invoker = true) as
select vb.*,
       coalesce(q.planificado, 0) as planificado,
       vb.monto_neto - coalesce(q.planificado, 0) as falta_planificar,
       coalesce(q.facturado, 0) as facturado,
       vb.monto_neto * (1 + vb.pct_igv) as total,
       coalesce(q.pagado, 0) as pagado,
       coalesce(q.saldo, 0) + case when p.estado_plan in ('falta_planificar', 'sin_plan')
                                   then (vb.monto_neto - coalesce(q.planificado, 0)) * (1 + vb.pct_igv) else 0 end as saldo,
       coalesce(q.cuotas, 0) as cuotas,
       p.estado_plan,
       case
         when vb.monto_neto = 0 and coalesce(q.cuotas, 0) = 0 then 'pagada'
         when coalesce(q.cuotas, 0) = 0 then 'sin_plan'
         when q.todas_pagadas then 'pagada'
         when q.vencidas > 0 then 'vencida'
         else 'por_cobrar'
       end as estado_cobro
from v_venta_base vb
left join (
  select venta_id, count(*) as cuotas, sum(monto_neto) as planificado,
         sum(monto_neto) filter (where comprobante_id is not null) as facturado,
         sum(pagado) as pagado, sum(saldo) as saldo,
         bool_and(pagada) as todas_pagadas,
         count(*) filter (where estado = 'vencida') as vencidas
  from v_cuota group by venta_id
) q on q.venta_id = vb.id
cross join lateral (
  select case                                                                   -- R-10
           when vb.monto_neto = 0 then 'cuadra'
           when coalesce(q.cuotas, 0) = 0 then 'sin_plan'
           when abs(a_usd(vb.monto_neto - q.planificado, vb.moneda, vb.fecha_contrato))
                <= tolerancia_usd(vb.monto_neto_usd) then 'cuadra'
           when vb.monto_neto > q.planificado then 'falta_planificar'
           else 'sobre_planificado'
         end as estado_plan
) p;
