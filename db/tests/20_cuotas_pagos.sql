-- R-10, R-12, R-21, R-23, R-30, R-31, R-33, R-34, R-35, R-41
do $$
declare r record; v numeric; ok boolean;
begin
  -- R-10: proyecto 4000 con cuotas por 3500 -> falta planificar 500
  select estado_plan, falta_planificar into r from v_venta where id = '00000000-0000-0000-0000-0000000000a2';
  assert r.estado_plan = 'falta_planificar' and r.falta_planificar = 500, format('R-10: %s', r);
  select estado_plan into r from v_venta where id = '00000000-0000-0000-0000-0000000000a1';
  assert r.estado_plan = 'cuadra', 'R-10 plan completo';

  -- R-12 / R-21: total del comprobante = cuotas + IGV, nunca digitado
  select total, detraccion into r from v_comprobante where id = '00000000-0000-0000-0000-0000000000f1';
  assert r.total = 1180 and r.detraccion = 141.6, format('R-21/R-22 comprobante: %s', r);

  -- R-34: cuota sin comprobante = por facturar
  select estado into r from v_cuota where id = '00000000-0000-0000-0000-0000000000b2';
  assert r.estado in ('por_facturar'), format('R-34 por facturar: %s', r);

  -- R-23 / R-34: vence según cliente (31-ene) -> hoy está vencida
  select estado, vencimiento into r from v_cuota where id = '00000000-0000-0000-0000-0000000000b1';
  assert r.estado = 'vencida' and r.vencimiento = '2026-01-31', format('R-23/R-34: %s', r);

  -- R-30/R-31: pago al banco en USD + detracción en soles al BN (141.6 USD * 3.75)
  insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values
    ('00000000-0000-0000-0000-0000000000b1', '2026-01-25', 1, 1038.40, 1),
    ('00000000-0000-0000-0000-0000000000b1', '2026-02-03', 3, 531.00, 3.75);
  select pagado_banco, pagado_detraccion, saldo, estado into r
    from v_cuota where id = '00000000-0000-0000-0000-0000000000b1';
  assert r.pagado_banco = 1038.40 and r.pagado_detraccion = 141.6 and r.saldo = 0 and r.estado = 'pagada',
    format('R-30/R-31: %s', r);

  -- R-35: comprobante pagado al 100% en la fecha del último pago
  select pagado_100, fecha_pago_completo into r from v_comprobante where id = '00000000-0000-0000-0000-0000000000f1';
  assert r.pagado_100 and r.fecha_pago_completo = '2026-02-03', format('R-35: %s', r);

  -- R-41: comisión 5% de 1000 se gana en febrero (cuando se completó la detracción)
  select comision_usd, periodo_ganada into r from v_comision_cuota where cuota_id = '00000000-0000-0000-0000-0000000000b1';
  assert r.comision_usd = 50 and r.periodo_ganada = '2026-02-01', format('R-41: %s', r);

  -- R-33: un saldo por diferencia de cambio (<= 5 USD y <= 2.5%) cuenta como pagado...
  insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values
    ('00000000-0000-0000-0000-0000000000b2', '2026-01-25', 1, 2357, 1);   -- total 2360, saldo 3
  select pagada into ok from v_cuota where id = '00000000-0000-0000-0000-0000000000b2';
  assert ok, 'R-33 saldo de 3 USD sobre 2360 = pagada';
  -- ...pero nunca una detracción pendiente
  delete from pago where cuota_id = '00000000-0000-0000-0000-0000000000b1' and cuenta_id = 3;
  select pagada into ok from v_cuota where id = '00000000-0000-0000-0000-0000000000b1';
  assert not ok, 'R-33 detracción pendiente no es diferencia de cambio';
end $$;

-- R-21: un comprobante no puede mezclar clientes
do $$
begin
  insert into cuota (venta_id, orden, concepto, monto_neto, comprobante_id) values
    ('00000000-0000-0000-0000-0000000000a4', 1, 'otro cliente', 100, '00000000-0000-0000-0000-0000000000f1');
  raise exception 'R-21 debió rechazar la cuota de otro cliente';
exception when others then
  assert sqlerrm like 'R-21%', sqlerrm;
end $$;

-- R-36: si el cliente paga la factura completa al banco, la agencia debe autodetraer;
-- queda pendiente hasta registrar la constancia
do $$
declare cid uuid := '00000000-0000-0000-0000-0000000000f1';
begin
  insert into pago (cuota_id, fecha, cuenta_id, monto, tc)
  values ('00000000-0000-0000-0000-0000000000b1', '2026-02-01', 1, 1180, 1);
  assert (select estado from v_autodetraccion where comprobante_id = cid) = 'pendiente', 'R-36 obligación de autodetraer';
  assert (select detraccion_pen from v_autodetraccion where comprobante_id = cid) = round(141.6 * 3.75), 'R-36 detracción en soles';
  assert (select autodetracciones_pendientes from v_kpi_hoy_calc) >= 1, 'R-36 alerta en el dashboard';
  update comprobante set autodetraccion_fecha = '2026-02-05', autodetraccion_constancia = 'autodetraccion/x.pdf' where id = cid;
  assert (select estado from v_autodetraccion where comprobante_id = cid) = 'conforme', 'R-36 conforme con constancia';
end $$;
