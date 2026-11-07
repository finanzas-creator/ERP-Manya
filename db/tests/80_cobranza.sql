-- R-45, R-46: ingreso cobrado (base caja) y cuentas por cobrar por contrato

-- R-45: el pago de una factura de USD 1,180 (1,000 + IGV) es ingreso 1,000; el IGV y la pauta se separan
do $$
declare m record;
begin
  insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values ('00000000-0000-0000-0000-0000000000b1', '2026-01-25', 1, 1180, 1);
  -- pauta de clientes (terceros) cobrada en soles
  insert into cuota (id, venta_id, orden, concepto, monto_neto, fecha_limite)
  values ('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000a3', 1, '100%', 500, '2026-01-20');
  insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values ('00000000-0000-0000-0000-0000000000b9', '2026-01-26', 2, 2212.5, 3.75);
  select round(sum(ingreso_usd), 2) ingreso_usd, round(sum(ingreso_pen), 2) ingreso_pen, round(sum(igv_pen), 2) igv_pen, round(sum(pauta_pen), 2) pauta_pen, round(sum(cobrado_pen), 2) cobrado_pen
  into m from v_cobrado_mes where periodo = '2026-01-01';
  assert m.ingreso_usd = 1000, format('R-45 ingreso sin IGV: %s', m);
  assert m.ingreso_pen = 3750, format('R-45 ingreso en soles con el TC del mes: %s', m);
  assert m.igv_pen = 675, format('R-45 IGV aparte: %s', m);
  assert m.pauta_pen = 2212.5, format('R-45 pauta aparte (con su IGV, en soles por su monto): %s', m);
  assert m.ingreso_pen + m.igv_pen + m.pauta_pen = m.cobrado_pen, format('R-45 ingreso + IGV + pauta = cobrado: %s', m);
end $$;

-- R-46: por cobrar = total del contrato − cobrado, facturado o no
do $$
declare k record;
begin
  -- a1 y a3 pagadas: no cuentan. a2 proyecto 4,720 sin facturar. a4 en soles 4,130 = 1,180 USD (TC 3.50)
  insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values ('00000000-0000-0000-0000-0000000000b1', '2026-01-25', 1, 1180, 1);
  assert not exists (select 1 from v_cxc_venta where venta_id = '00000000-0000-0000-0000-0000000000a1'), 'R-46 contrato pagado no cuenta';
  select round(sum(por_cobrar_usd), 2) t, round(sum(por_facturar_usd), 2) pf, round(sum(vencido_usd), 2) v into k from v_cxc_venta;
  assert k.t = 4720 + 1180 and k.pf = k.t and k.v = 0, format('R-46 todo por facturar: %s', k);
  -- se factura la primera cuota del proyecto (vencida): pasa a facturado vencido
  insert into comprobante (id, empresa_id, tipo, serie_numero, fecha_emision, fecha_limite)
  values ('00000000-0000-0000-0000-0000000000f2', 1, 'factura', 'E001-2', '2026-01-16', '2026-01-31');
  update cuota set comprobante_id = '00000000-0000-0000-0000-0000000000f2' where id = '00000000-0000-0000-0000-0000000000b2';
  select round(vencido_usd, 2) v, round(por_vencer_usd, 2) pv, round(por_facturar_usd, 2) pf, round(por_cobrar_usd, 2) t into k from v_cxc_venta
  where venta_id = '00000000-0000-0000-0000-0000000000a2';
  assert k.v = 2360 and k.pv = 0 and k.pf = 2360 and k.t = 4720, format('R-46 vencido + por facturar: %s', k);
  -- un saldo dentro de la tolerancia (R-33) no cuenta
  insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values ('00000000-0000-0000-0000-0000000000b2', '2026-02-01', 1, 2358, 1);
  update venta set monto_neto = 2000 where id = '00000000-0000-0000-0000-0000000000a2';
  delete from cuota where id = '00000000-0000-0000-0000-0000000000b3';
  assert not exists (select 1 from v_cxc_venta where venta_id = '00000000-0000-0000-0000-0000000000a2'), 'R-46 saldo de USD 2 dentro de la tolerancia';
  -- el KPI de hoy suma lo mismo
  assert (select pendiente_contratos_usd from v_kpi_hoy_calc) = (select sum(por_cobrar_usd) from v_cxc_venta), 'R-46 KPI = suma por contrato';
end $$;
