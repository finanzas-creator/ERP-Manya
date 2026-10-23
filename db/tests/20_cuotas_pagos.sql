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

-- R-27/R-28: notas de crédito
do $$
declare cid uuid := '00000000-0000-0000-0000-0000000000f1'; n1 uuid; nuevo uuid; antes numeric;
begin
  -- Parcial: baja la deuda (con IGV) y el ingreso del mes de la nota
  antes := (select saldo from v_cuota where id = '00000000-0000-0000-0000-0000000000b1');
  n1 := emitir_nota_credito(cid, 'E001-NC1', '2026-02-10', '04', 100);
  assert (select saldo from v_cuota where id = '00000000-0000-0000-0000-0000000000b1') = antes - 118, 'R-28 saldo';
  assert (select sum(ingreso_usd) from v_ingreso_venta_mes where venta_id = '00000000-0000-0000-0000-0000000000a1'
          and periodo = '2026-02-01') = -100, 'R-28 ingreso del mes de la nota';
  begin
    perform emitir_nota_credito(cid, 'E001-NC2', '2026-02-10', '04', 950);
    raise exception 'debió rechazar una nota mayor a lo que queda';
  exception when others then assert sqlerrm like 'R-28%', sqlerrm;
  end;
  -- Total: la factura queda sin efecto y su cuota vuelve a "por facturar"; se puede facturar de nuevo
  perform anular('pago', id, 'prueba') from pago where cuota_id = '00000000-0000-0000-0000-0000000000b1' and anulado_en is null;
  perform emitir_nota_credito(cid, 'E001-NC3', '2026-02-11', '01');
  assert (select coalesce(sum(ingreso_usd), 0) from v_ingreso_venta_mes where venta_id = '00000000-0000-0000-0000-0000000000a1'
          and periodo = '2026-02-01') = 0, 'R-28 la parcial ya no aplica a una factura sin efecto';
  assert (select estado from v_cuota where id = '00000000-0000-0000-0000-0000000000b1') = 'por_facturar', 'R-27 por facturar';
  assert (select estado from v_facturacion where id = cid) = 'sin_efecto', 'R-27 factura sin efecto';
  assert (select monto_neto from nota_credito where serie_numero = 'E001-NC3') = 900, 'R-27 total = lo que quedaba';
  nuevo := emitir_comprobante(1::smallint, 'factura', 'E001-2', '2026-02-12', array['00000000-0000-0000-0000-0000000000b1'::uuid]);
  assert (select comprobante_id from v_cuota where id = '00000000-0000-0000-0000-0000000000b1') = nuevo, 'R-21 se vuelve a facturar';
end $$;

-- R-40/R-41: operaciones y devoluciones
insert into plantilla_pago (nombre) values ('100% prueba');
insert into plantilla_pago_item values ((select max(id) from plantilla_pago), 1, '100%', 1, 'inicio');
do $$
declare vid uuid; cid uuid; antes numeric;
begin
  vid := registrar_venta(p_cliente => '00000000-0000-0000-0000-0000000000c2', p_servicio => 1,
                         p_fecha_contrato => '2026-06-01', p_monto_neto => 1000, p_plantilla => (select max(id) from plantilla_pago));
  cid := emitir_comprobante(1::smallint, 'factura', 'E001-500', '2026-06-02', array(select id from cuota where venta_id = vid));
  perform registrar_pago_comprobante(cid, '2026-06-05', 1::smallint, 1180, 1, 'OP-123');
  assert (select count(*) from v_operacion_pago where numero_operacion = 'OP-123') = 1, 'R-40 una sola operación';
  -- devolución parcial: baja lo cobrado y reabre saldo
  antes := (select sum(monto_usd) from v_pago where venta_id = vid);
  perform registrar_devolucion(cid, '2026-06-20', 1::smallint, 180, 1, 'Descuento devuelto');
  assert (select sum(monto_usd) from v_pago where venta_id = vid) = antes - 180, 'R-41 cobrado neto';
  assert (select saldo from v_comprobante where id = cid) = 180, 'R-41 saldo reabierto';
  begin
    perform registrar_devolucion(cid, '2026-06-21', 1::smallint, 5000, 1, 'excesiva');
    raise exception 'debió rechazar';
  exception when others then assert sqlerrm like 'R-41%', sqlerrm;
  end;
  -- anular la operación del pago anula todas sus cuotas
  perform anular_operacion((select operacion from pago where numero_operacion = 'OP-123' limit 1), 'error');
  assert not exists (select 1 from v_pago where numero_operacion = 'OP-123'), 'R-40 operación anulada completa';
end $$;
