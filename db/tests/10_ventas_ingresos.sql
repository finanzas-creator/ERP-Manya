-- R-03, R-04, R-05, R-06
do $$
declare v numeric; nueva uuid;
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

  -- R-04/R-61 (D-20): el costo de proveedor resta de la venta y del GP una sola vez,
  -- no del ingreso ni del plan de pagos (el cliente paga el precio completo)
  insert into costo_directo (venta_id, tipo, fecha, monto)
  values ('00000000-0000-0000-0000-0000000000a2', 'proveedor', '2026-01-15', 400);
  select sum(ventas_usd) into v from v_ventas_mes where periodo = '2026-01-01';
  assert v = 4600, format('R-04 ventas enero netas de proveedor: esperado 4600, obtenido %s', v);
  select sum(ingresos_usd) into v from v_ingresos_mes where periodo = '2026-02-01';
  assert v = 2000, format('R-05 el ingreso no resta proveedor: esperado 2000, obtenido %s', v);
  select gp_usd into v from v_gp_venta where venta_id = '00000000-0000-0000-0000-0000000000a2';
  assert v = (select ingreso_usd - costo_asignado_usd - 400 from v_gp_venta
              where venta_id = '00000000-0000-0000-0000-0000000000a2'),
    format('R-61 GP resta el proveedor una vez: obtenido %s', v);
  select falta_planificar into v from v_venta where id = '00000000-0000-0000-0000-0000000000a2';
  assert v = 500, format('R-10 el plan se compara con el precio: esperado 500, obtenido %s', v);
  delete from costo_directo where venta_id = '00000000-0000-0000-0000-0000000000a2';

  -- R-02 (D-21): la venta puede fijar otra modalidad que la del catálogo; renovar la conserva
  update venta set modalidad = 'mensual' where id = '00000000-0000-0000-0000-0000000000a2';
  select sum(ingreso_usd) into v from v_ingreso_venta_mes
   where venta_id = '00000000-0000-0000-0000-0000000000a2' and periodo = '2026-01-01';
  assert v = 4000, format('R-02 proyecto fijado como mensual: todo en enero, obtenido %s', v);
  nueva := renovar_venta('00000000-0000-0000-0000-0000000000a2');
  assert (select modalidad from venta where id = nueva) = 'mensual', 'R-51 renovar conserva la modalidad de la venta';
  delete from cuota where venta_id = nueva;
  delete from venta where id = nueva;
  update venta set modalidad = null where id = '00000000-0000-0000-0000-0000000000a2';

  -- R-81: lo anulado no suma
  update venta set anulado_en = now(), anulado_motivo = 'prueba' where id = '00000000-0000-0000-0000-0000000000a2';
  select sum(ventas_usd) into v from v_ventas_mes where periodo = '2026-01-01';
  assert v = 1000, format('R-81 venta anulada no suma: esperado 1000, obtenido %s', v);
end $$;
