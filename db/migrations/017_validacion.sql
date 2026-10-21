-- 017 · Validación contra el sheet: los totales que reportaba el sheet al migrar se guardan
-- como hecho (lo que decía la fuente) y una vista los compara mes a mes con el sistema.
create type concepto_referencia as enum ('ventas_usd', 'consumo_pauta_usd', 'planilla_pen', 'herramientas_usd', 'comisiones_pen');

create table referencia_sheet (
  periodo   mes not null,
  concepto  concepto_referencia not null,
  detalle   text not null default '',          -- p. ej. la categoría en las ventas
  valor     numeric not null,
  primary key (periodo, concepto, detalle)
);
alter table referencia_sheet enable row level security;
create policy lectura on referencia_sheet for select to authenticated using ((select app_rol() in ('admin', 'tesoreria')));
grant select on referencia_sheet to authenticated;
revoke all on referencia_sheet from anon;

-- Cada concepto se calcula con la misma vista que usan las pantallas (R-04, R-60, R-42, R-64).
create view v_validacion_mes with (security_invoker = true) as
with sheet as (
  select periodo, concepto, sum(valor) as sheet from referencia_sheet group by 1, 2
), sistema as (
  select periodo, 'ventas_usd'::concepto_referencia as concepto, sum(ventas_usd) as sistema from v_ventas_mes group by 1
  union all
  select periodo, 'planilla_pen', sum(costo_total) from v_planilla_usd where moneda = 'PEN' group by 1
  union all
  select periodo, 'herramientas_usd', sum(monto) from v_herramienta_usd where moneda = 'USD' group by 1
  union all
  select periodo, 'comisiones_pen', sum(monto) from v_comision_pago_usd where moneda = 'PEN' group by 1
  union all
  select date_trunc('month', fecha_contrato)::date, 'consumo_pauta_usd', sum(consumo_usd) from v_control_pauta group by 1
)
select s.periodo, s.concepto, s.sheet, coalesce(x.sistema, 0) as sistema,
       coalesce(x.sistema, 0) - s.sheet as diferencia,
       abs(coalesce(x.sistema, 0) - s.sheet) <= 0.01 as cuadra
from sheet s
left join sistema x on x.periodo = s.periodo and x.concepto = s.concepto;
grant select on v_validacion_mes to authenticated;
revoke all on v_validacion_mes from anon;
