-- R-11, R-22, R-32, R-51, R-81
insert into plantilla_pago (nombre) values ('60/40');
insert into plantilla_pago_item values (1, 1, '60% inicial', 0.6, 'inicio'), (1, 2, '40% final', 0.4, 'fin');

do $$
declare vid uuid; nueva uuid; cid uuid; r record; n int;
begin
  -- R-11: venta de 1000.01 con plantilla 60/40 -> 600.01 + 400.00 (la última absorbe el redondeo)
  vid := registrar_venta(p_cliente => '00000000-0000-0000-0000-0000000000c2', p_servicio => 2,
                         p_fecha_contrato => '2026-05-01', p_fecha_fin => '2026-07-31',
                         p_monto_neto => 1000.01, p_plantilla => 1::smallint);
  select array_agg(monto_neto::numeric order by orden) as m, array_agg(fecha_limite order by orden) as f into r
    from cuota where venta_id = vid;
  assert r.m = array[600.01, 400.00]::numeric[], format('R-11 montos %s', r.m);
  assert r.f = array['2026-05-01', '2026-07-31']::date[], format('R-11 fechas %s', r.f);
  select estado_plan, pct_igv into r from v_venta where id = vid;
  assert r.estado_plan = 'cuadra' and r.pct_igv = 0.18, format('R-10/R-12 %s', r);

  -- R-22: factura de 1180 USD (> S/ 700) lleva 12% de detracción sugerida
  cid := emitir_comprobante(1::smallint, 'factura', 'E001-99', '2026-05-02',
                            array(select id from cuota where venta_id = vid));
  select pct_detraccion into r from comprobante where id = cid;
  assert r.pct_detraccion = 0.12, format('R-22 %s', r);

  -- R-32: pago completo de la factura se reparte por saldo y deja todo pagado
  n := registrar_pago_comprobante(cid, '2026-05-10', 1::smallint, 1180.01);
  assert n = 2, 'R-32 dos cuotas';
  select bool_and(pagada) as ok, sum(pagado) as p into r from v_cuota where comprobante_id = cid;
  assert r.ok and r.p = 1180.01, format('R-32 %s', r);

  -- R-51: renovar el plan mensual de enero -> nuevo ciclo feb 10 -> mar 10 con la misma cuota
  nueva := renovar_venta('00000000-0000-0000-0000-0000000000a1');
  select fecha_contrato, fecha_fin, monto_neto, cuotas into r from v_venta where id = nueva;
  assert r.fecha_contrato = '2026-02-10' and r.fecha_fin = '2026-03-10' and r.monto_neto = 1000 and r.cuotas = 1,
    format('R-51 %s', r);

  -- R-81: anular exige motivo
  begin
    perform anular('venta', nueva, ' ');
    raise exception 'R-81 debió exigir motivo';
  exception when others then assert sqlerrm like 'R-81%', sqlerrm;
  end;
  perform anular('venta', nueva, 'renovación duplicada');
  assert not exists (select 1 from v_venta where id = nueva), 'R-81 anulada no aparece';
end $$;

-- R-02: al registrar, la venta guarda su modalidad solo si difiere de la del catálogo
do $$
declare v1 uuid; v2 uuid;
begin
  v1 := registrar_venta(p_cliente => '00000000-0000-0000-0000-0000000000c2', p_servicio => 2,
                        p_fecha_contrato => '2026-05-01', p_monto_neto => 500, p_plantilla => 1::smallint,
                        p_modalidad => 'mensual');
  v2 := registrar_venta(p_cliente => '00000000-0000-0000-0000-0000000000c2', p_servicio => 2,
                        p_fecha_contrato => '2026-05-01', p_monto_neto => 500, p_plantilla => 1::smallint,
                        p_modalidad => 'proyecto');
  assert (select modalidad from venta where id = v1) = 'mensual', 'R-02 modalidad fijada en el contrato';
  assert (select modalidad from venta where id = v2) is null, 'R-02 igual al catálogo: no se guarda';
  assert (select modalidad from v_venta_base where id = v1) = 'mensual', 'R-02 la vista usa la de la venta';
end $$;
