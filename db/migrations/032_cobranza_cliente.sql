-- 032 · Cartera por cliente ("¿Quién nos debe?", R-37): una fila por cliente con su deuda y su gestión.
create view v_cobranza_cliente with (security_invoker = true) as
select c.cliente_id, min(c.cliente) as cliente,
       count(distinct c.comprobante_id) as comprobantes,
       sum(c.saldo_usd) as por_cobrar_usd,
       coalesce(sum(c.saldo_usd) filter (where c.dias_atraso > 0), 0) as vencido_usd,
       max(c.dias_atraso) as dias_atraso,
       (array_agg(c.tramo order by c.dias_atraso desc))[1] as tramo,
       min(c.vencimiento) filter (where c.dias_atraso <= 0) as proximo_vencimiento,
       m.estado_gestion, m.ultima_gestion, m.proximo_paso, m.proxima_fecha
from v_cobranza c
left join v_morosidad m on m.cliente_id = c.cliente_id
group by c.cliente_id, m.estado_gestion, m.ultima_gestion, m.proximo_paso, m.proxima_fecha;
grant select on v_cobranza_cliente to authenticated;
revoke all on v_cobranza_cliente from anon;
