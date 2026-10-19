-- R-03, R-04, R-05, R-06
do $$
declare v numeric;
begin
  -- R-03/R-04: enero = plan 1000 + proyecto 4000; la pauta (terceros) no es venta
  select sum(ventas_usd) into v from v_ventas_mes where periodo = '2026-01-01';
  assert v = 5000, format('R-04 ventas enero: esperado 5000, obtenido %s', v);

  -- R-06: venta en PEN se convierte con el TC del mes (3500 / 3.50 = 1000)
  select sum(ventas_usd) into v from v_ventas_mes where periodo = '2026-03-01';
  assert v = 1000, format('R-06 ventas marzo en PEN: esperado 1000, obtenido %s', v);

  -- R-05: proyecto ene-abr se reparte en 4 meses (1000 c/u); plan mensual todo en enero
  select sum(ingresos_usd) into v from v_ingresos_mes where periodo = '2026-01-01';
  assert v = 2000, format('R-05 ingresos enero: esperado 2000, obtenido %s', v);
  select sum(ingresos_usd) into v from v_ingresos_mes where periodo = '2026-04-01';
  assert v = 1000, format('R-05 ingresos abril: esperado 1000, obtenido %s', v);

  -- R-05: el periodo de servicio editable mueve el ingreso mensual, no la venta
  update venta set periodo_servicio = '2026-02-01' where id = '00000000-0000-0000-0000-0000000000a1';
  select sum(ingresos_usd) into v from v_ingresos_mes where periodo = '2026-02-01';
  assert v = 2000, format('R-05 ingresos febrero tras mover periodo: esperado 2000, obtenido %s', v);
  select sum(ventas_usd) into v from v_ventas_mes where periodo = '2026-01-01';
  assert v = 5000, 'R-04 la venta sigue en el mes del contrato';

  -- R-81: lo anulado no suma
  update venta set anulado_en = now(), anulado_motivo = 'prueba' where id = '00000000-0000-0000-0000-0000000000a2';
  select sum(ventas_usd) into v from v_ventas_mes where periodo = '2026-01-01';
  assert v = 1000, format('R-81 venta anulada no suma: esperado 1000, obtenido %s', v);
end $$;
