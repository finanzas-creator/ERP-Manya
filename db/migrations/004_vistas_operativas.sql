-- 004 · Vistas operativas: la única fuente de saldos y estados.
-- security_invoker: cada vista respeta los permisos de quien consulta (R-80).
-- Lo anulado no entra en ningún cálculo (R-81).

-- Venta con su contexto de catálogo y su monto en USD (R-02, R-06, R-07).
create view v_venta_base with (security_invoker = true) as
select v.id, v.codigo, v.codigo_legacy, v.servicio_contratado_id, v.empresa_id,
       v.fecha_contrato, v.fecha_fin, v.descripcion, v.moneda, v.monto_neto, v.pct_igv,
       v.equipo_id, v.partner_id, v.pct_comision,
       coalesce(v.periodo_servicio, date_trunc('month', v.fecha_contrato)::date) as periodo_servicio,  -- R-05
       a_usd(v.monto_neto, v.moneda, v.fecha_contrato) as monto_neto_usd,                             -- R-06
       sc.cliente_id, sc.marca_id, sc.servicio_id, sc.estado as estado_servicio,
       s.nombre as servicio, s.modalidad, s.naturaleza,
       s.categoria_id, cat.nombre as categoria, cat.linea_id, l.nombre as linea,
       cl.razon_social as cliente, m.nombre as marca,
       e.nombre as equipo, p.nombre as partner
from venta v
join servicio_contratado sc on sc.id = v.servicio_contratado_id
join servicio s on s.id = sc.servicio_id
join categoria cat on cat.id = s.categoria_id
join linea_negocio l on l.id = cat.linea_id
join cliente cl on cl.id = sc.cliente_id
left join marca m on m.id = sc.marca_id
left join equipo e on e.id = v.equipo_id
left join persona p on p.id = v.partner_id
where v.anulado_en is null;

-- Pago expresado en USD y en la moneda de la venta de su cuota (R-30, R-31).
create view v_pago with (security_invoker = true) as
select pg.id, pg.cuota_id, pg.fecha, pg.cuenta_id, cb.nombre as cuenta, cb.es_detraccion,
       pg.monto, cb.moneda as moneda_cuenta, pg.tc,
       case when cb.moneda = 'USD' then pg.monto else pg.monto / pg.tc end as monto_usd,
       case when cb.moneda = v.moneda then pg.monto
            when v.moneda = 'USD' then pg.monto / pg.tc
            else pg.monto * pg.tc end as monto_moneda_venta,
       c.venta_id
from pago pg
join cuenta_bancaria cb on cb.id = pg.cuenta_id
join cuota c on c.id = pg.cuota_id
join venta v on v.id = c.venta_id
where pg.anulado_en is null;

-- Cuota con totales, pagos, saldo, vencimiento y estado (R-12, R-23, R-33, R-34).
create view v_cuota with (security_invoker = true) as
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
  select s2.saldo_usd <= least((cfg()).tolerancia_usd,
                               (cfg()).tolerancia_pct * a_usd(b.total, b.moneda, b.fecha_contrato)) as pagada
) s3;

-- Comprobante con totales derivados de sus cuotas (R-21, R-22, R-35).
create view v_comprobante with (security_invoker = true) as
select co.id, co.empresa_id, e.nombre as empresa, co.tipo, co.serie_numero,
       co.fecha_emision, co.fecha_limite, co.pct_detraccion, co.autodetraccion_fecha,
       min(q.cliente_id::text)::uuid as cliente_id, min(q.cliente) as cliente,
       min(q.moneda::text)::moneda as moneda,
       count(q.id) as cuotas,
       sum(q.monto_neto) as neto, sum(q.igv) as igv, sum(q.total) as total,
       sum(q.total) * co.pct_detraccion as detraccion,                              -- R-22
       sum(q.pagado_banco) as pagado_banco, sum(q.pagado_detraccion) as pagado_detraccion,
       sum(q.saldo) as saldo, sum(q.saldo_usd) as saldo_usd,
       bool_and(q.pagada) as pagado_100,                                            -- R-35
       case when bool_and(q.pagada) then max(q.ultimo_pago) end as fecha_pago_completo,
       min(q.vencimiento) as vencimiento
from comprobante co
join empresa e on e.id = co.empresa_id
join v_cuota q on q.comprobante_id = co.id
where co.anulado_en is null
group by co.id, e.nombre;

-- Venta con su avance de planificación, facturación y cobro (R-10).
create view v_venta with (security_invoker = true) as
select vb.*,
       coalesce(q.planificado, 0) as planificado,
       vb.monto_neto - coalesce(q.planificado, 0) as falta_planificar,
       coalesce(q.facturado, 0) as facturado,
       vb.monto_neto * (1 + vb.pct_igv) as total,
       coalesce(q.pagado, 0) as pagado,
       coalesce(q.saldo, 0) + greatest(vb.monto_neto - coalesce(q.planificado, 0), 0) * (1 + vb.pct_igv) as saldo,
       coalesce(q.cuotas, 0) as cuotas,
       case                                                                         -- R-10 (al centavo)
         when coalesce(q.cuotas, 0) = 0 then 'sin_plan'
         when round(vb.monto_neto - q.planificado, 2) > 0 then 'falta_planificar'
         when round(vb.monto_neto - q.planificado, 2) < 0 then 'sobre_planificado'
         else 'cuadra'
       end as estado_plan,
       case
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
) q on q.venta_id = vb.id;

-- Cartera por cobrar con antigüedad (R-34).
create view v_cobranza with (security_invoker = true) as
select q.*, co.serie_numero, co.empresa_id,
       greatest(current_date - q.vencimiento, 0) as dias_atraso,
       case when q.vencimiento is null or q.vencimiento >= current_date then 'al_dia'
            when current_date - q.vencimiento <= 30 then '1-30'
            when current_date - q.vencimiento <= 60 then '31-60'
            when current_date - q.vencimiento <= 90 then '61-90'
            else '>90' end as tramo
from v_cuota q
join comprobante co on co.id = q.comprobante_id
where not q.pagada;

-- Renovaciones de servicios mensuales activos (R-50).
create view v_renovacion with (security_invoker = true) as
select distinct on (vb.servicio_contratado_id)
       vb.servicio_contratado_id, vb.id as ultima_venta_id, vb.cliente_id, vb.cliente, vb.marca,
       vb.servicio, vb.categoria, vb.monto_neto, vb.moneda, vb.monto_neto_usd,
       vb.fecha_contrato as inicio_ciclo, vb.fecha_fin as vence,
       vb.fecha_fin - current_date as dias_para_vencer
from v_venta_base vb
where vb.modalidad = 'mensual' and vb.estado_servicio = 'activo'
order by vb.servicio_contratado_id, vb.fecha_contrato desc, vb.codigo desc;
