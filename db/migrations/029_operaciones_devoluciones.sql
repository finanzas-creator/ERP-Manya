-- 029 · Pagos por operación bancaria y devoluciones (R-32, R-40, R-41).
--   · Un pago a una factura completa se reparte entre sus cuotas, pero es UNA operación del banco:
--     se identifica con un id de operación y se anula entera.
--   · Una devolución es dinero que sale hacia el cliente (p. ej. tras una nota de crédito): se
--     registra como pago en negativo, baja lo cobrado del mes y vuelve a abrir el saldo.

alter table pago add column operacion uuid not null default gen_random_uuid();
alter table pago add column numero_operacion text;     -- referencia del banco
alter table pago add column es_devolucion boolean not null default false;
alter table pago add column detalle text;
create index on pago (operacion);

-- R-30 + R-41: la devolución cuenta en negativo.
create or replace view v_pago with (security_invoker = true) as
select pg.id, pg.cuota_id, pg.fecha, pg.cuenta_id, cb.nombre as cuenta, cb.es_detraccion, pg.monto,
       cb.moneda as moneda_cuenta, pg.tc,
       s.signo * case when cb.moneda = 'USD' then pg.monto else pg.monto / pg.tc end as monto_usd,
       s.signo * case when cb.moneda = v.moneda then pg.monto
                      when v.moneda = 'USD' then pg.monto / pg.tc
                      else pg.monto * pg.tc end as monto_moneda_venta,
       c.venta_id, pg.operacion, pg.numero_operacion, pg.es_devolucion, pg.detalle
from pago pg
join cuenta_bancaria cb on cb.id = pg.cuenta_id
join cuota c on c.id = pg.cuota_id
join venta v on v.id = c.venta_id
cross join lateral (select case when pg.es_devolucion then -1 else 1 end as signo) s
where pg.anulado_en is null;

-- Una operación por registro (pagos de una misma operación bancaria, sumados).
create view v_operacion_pago with (security_invoker = true) as
select operacion, min(fecha) as fecha, min(cuenta) as cuenta, bool_or(es_detraccion) as es_detraccion,
       bool_or(es_devolucion) as es_devolucion, min(moneda_cuenta::text)::moneda as moneda_cuenta, min(tc) as tc,
       sum(monto) as monto, sum(monto_usd) as monto_usd, count(*) as cuotas, min(numero_operacion) as numero_operacion,
       min(detalle) as detalle, array_agg(distinct venta_id) as ventas, array_agg(cuota_id) as cuotas_ids
from v_pago group by operacion;

-- R-32: pagar una factura completa reparte el monto en sus cuotas con saldo, como una sola operación.
create or replace function registrar_pago_comprobante(
  p_comprobante uuid, p_fecha date, p_cuenta smallint, p_monto numeric, p_tc numeric default 1,
  p_numero_operacion text default null
) returns int language plpgsql as $$
declare q record; total_saldo numeric; n int; i int := 0; asignado numeric := 0; parte numeric; op uuid := gen_random_uuid();
begin
  select sum(saldo), count(*) into total_saldo, n from v_cuota where comprobante_id = p_comprobante and saldo > 0;
  if coalesce(n, 0) = 0 then raise exception 'R-32: el comprobante no tiene saldo pendiente'; end if;
  for q in select id, saldo from v_cuota where comprobante_id = p_comprobante and saldo > 0 order by orden, id loop
    i := i + 1;
    parte := case when i = n then p_monto - asignado else round(p_monto * q.saldo / total_saldo, 2) end;
    asignado := asignado + parte;
    if parte > 0 then
      insert into pago (cuota_id, fecha, cuenta_id, monto, tc, operacion, numero_operacion)
      values (q.id, p_fecha, p_cuenta, parte, p_tc, op, nullif(trim(p_numero_operacion), ''));
    end if;
  end loop;
  return n;
end $$;
drop function registrar_pago_comprobante(uuid, date, smallint, numeric, numeric);

-- R-40: anular una operación anula todos sus pagos (en todas las cuotas).
create function anular_operacion(p_operacion uuid, p_motivo text) returns int language plpgsql as $$
declare n int;
begin
  if coalesce(trim(p_motivo), '') = '' then raise exception 'R-81: la anulación requiere motivo'; end if;
  update pago set anulado_en = now(), anulado_motivo = p_motivo where operacion = p_operacion and anulado_en is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- R-41: devolver dinero de una factura: se reparte entre sus cuotas según lo pagado y no puede
-- superar lo cobrado.
create function registrar_devolucion(p_comprobante uuid, p_fecha date, p_cuenta smallint, p_monto numeric,
  p_tc numeric, p_detalle text, p_numero_operacion text default null) returns int language plpgsql as $$
declare q record; total numeric; n int; i int := 0; asignado numeric := 0; parte numeric; op uuid := gen_random_uuid();
  mon moneda := (select moneda from cuenta_bancaria where id = p_cuenta);
begin
  if coalesce(trim(p_detalle), '') = '' then raise exception 'R-41: indica el motivo de la devolución'; end if;
  -- lo cobrado por cuota, en la moneda de la cuenta de la devolución
  select sum(cobrado), count(*) into total, n from (
    select sum(p.monto_usd) * case when mon = 'USD' then 1 else p_tc end as cobrado
    from v_pago p join cuota c on c.id = p.cuota_id
    where c.comprobante_id = p_comprobante group by p.cuota_id having sum(p.monto_usd) > 0) x;
  if coalesce(total, 0) <= 0 then raise exception 'R-41: la factura no tiene cobros que devolver'; end if;
  if p_monto > total + 0.01 then raise exception 'R-41: la devolución (%) supera lo cobrado (%)', round(p_monto, 2), round(total, 2); end if;
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

-- R-14: una cuota se puede anular si lo cobrado neto (pagos − devoluciones) es cero.
create or replace function chk_anular_cuota() returns trigger language plpgsql as $$
begin
  if new.anulado_en is not null and old.anulado_en is null
     and abs(coalesce((select sum(monto_usd) from v_pago where cuota_id = new.id), 0)) > 0.01 then
    raise exception 'R-14: la cuota tiene cobros; anula los pagos o registra la devolución primero';
  end if;
  return new;
end $$;

revoke execute on function registrar_pago_comprobante(uuid, date, smallint, numeric, numeric, text),
  anular_operacion(uuid, text), registrar_devolucion(uuid, date, smallint, numeric, numeric, text, text) from public, anon;
grant execute on function registrar_pago_comprobante(uuid, date, smallint, numeric, numeric, text),
  anular_operacion(uuid, text), registrar_devolucion(uuid, date, smallint, numeric, numeric, text, text) to authenticated;
grant select on v_operacion_pago to authenticated;
revoke all on v_operacion_pago from anon;
