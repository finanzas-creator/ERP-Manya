-- R-60, R-61, R-62, R-63
do $$
declare r record; v numeric;
begin
  -- R-60/R-61: enero ingresos 2000 (plan 1000 + 1/4 proyecto); planilla 6375 S/ / 3.75 = 1700; herramientas 100
  select * into r from v_gp_agencia_mes where periodo = '2026-01-01';
  assert r.ingresos_usd = 2000 and r.planilla_usd = 1700 and r.herramientas_usd = 100 and r.gp_usd = 200,
    format('R-61: %s', r);

  -- R-62: líneas + overhead = agencia
  select sum(gp_usd) into v from v_gp_linea_mes where periodo = '2026-01-01';
  assert v = r.gp_usd, format('R-62 reconciliación: líneas %s vs agencia %s', v, r.gp_usd);

  -- R-62: Performance = 1000 ingreso - 1000 directo - 250 dirección - 50 herramientas (50% del ingreso)
  select * into r from v_gp_linea_mes where periodo = '2026-01-01' and linea = 'Performance';
  assert r.planilla_usd = 1000 and r.direccion_usd = 250 and r.compartidos_usd = 50 and r.gp_usd = -300,
    format('R-62 Performance: %s', r);
  select * into r from v_gp_linea_mes where periodo = '2026-01-01' and linea = 'Overhead';
  assert r.planilla_usd = 200, format('R-62 overhead: %s', r);
  -- Inbound no tiene ingreso: su 10% de Dirección igual se le asigna
  select * into r from v_gp_linea_mes where periodo = '2026-01-01' and linea = 'Inbound';
  assert r.direccion_usd = 50, format('R-62 Inbound: %s', r);

  -- R-63: el costo indirecto de la línea se reparte entre sus ventas por ingreso
  select sum(costo_asignado_usd) into v from v_gp_venta g
    join v_ingreso_venta_mes i on i.venta_id = g.venta_id and i.periodo = '2026-01-01'
    where g.linea = 'Performance';
  assert v = 1300, format('R-63 asignado Performance: %s', v);
end $$;

-- R-62: los pesos de Dirección se guardan solo si suman 100%
do $$
begin
  begin
    perform guardar_pesos_direccion('{"1": 0.5, "2": 0.4, "3": 0.2}');
    raise exception 'debió rechazar pesos que suman 110%%';
  exception when others then
    assert sqlerrm like 'R-62%', sqlerrm;
  end;
  perform guardar_pesos_direccion('{"1": 0.6, "2": 0.3, "3": 0.1}');
  assert (select peso from peso_direccion where linea_id = 1) = 0.6, 'R-62 pesos guardados';
end $$;
