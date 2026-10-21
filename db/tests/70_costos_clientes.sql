-- R-60, R-42, R-80: detalle de costos, copia de un mes, clientes y KPIs para el CEO
do $$
declare v numeric; n int;
begin
  -- R-60: los subtotales por tipo de recibo y por sub-área suman la planilla del mes
  select sum(costo_usd) into v from v_planilla_grupo_mes where periodo = '2026-01-01' and criterio = 'sub_area';
  assert v = (select planilla_usd from v_costos_mes where periodo = '2026-01-01'), format('R-60 sub-área: %s', v);
  select sum(costo_usd) into v from v_planilla_grupo_mes where periodo = '2026-01-01' and criterio = 'tipo_recibo';
  assert v = (select planilla_usd from v_costos_mes where periodo = '2026-01-01'), format('R-60 tipo de recibo: %s', v);

  -- Copiar planilla a un mes vacío conserva el costo; a un mes con datos no duplica
  n := copiar_costos_mes('planilla', '2026-01-01', '2026-02-01');
  assert n = (select count(*) from planilla where periodo = '2026-01-01' and anulado_en is null), 'copia: filas';
  assert (select sum(costo_total) from planilla where periodo = '2026-02-01')
       = (select sum(costo_total) from planilla where periodo = '2026-01-01'), 'copia: monto';
  begin
    perform copiar_costos_mes('planilla', '2026-01-01', '2026-02-01');
    raise exception 'debió rechazar la copia duplicada';
  exception when others then
    assert sqlerrm like '%ya tiene%', sqlerrm;
  end;

  -- R-81: lo anulado no suma en el detalle ni en el total
  update herramienta_gasto set anulado_en = now(), anulado_motivo = 'prueba' where periodo = '2026-01-01';
  assert not exists (select 1 from v_herramienta_usd where periodo = '2026-01-01'), 'R-81 herramientas';
  assert (select herramientas_usd from v_costos_mes where periodo = '2026-01-01') = 0, 'R-81 costos del mes';

  -- Clientes: lo por cobrar de la ficha es lo mismo que la cartera (una sola fuente)
  select sum(por_cobrar_usd) into v from v_cliente;
  assert v = (select por_cobrar_usd from v_kpi_hoy_calc), format('cliente vs KPI por cobrar: %s', v);
  -- Dos miradas de lo pendiente: según contratos ≥ según facturado
  assert (select pendiente_contratos_usd >= por_cobrar_usd from v_kpi_hoy_calc), 'pendiente según contratos';
end $$;

-- R-80: el CEO lee los nuevos KPIs pero no el detalle de costos ni clientes
insert into usuario (id, email, rol) values ('00000000-0000-0000-0000-0000000000e3', 'ceo@manya.pe', 'ceo');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3"}', false);
do $$
begin
  assert (select count(*) from v_kpi_gp_mes) > 0, 'R-80 CEO lee GP';
  assert (select count(*) from v_kpi_ventas_categoria_mes) > 0, 'R-80 CEO lee ventas por categoría';
  assert (select count(*) from v_kpi_ingresos_mes) > 0, 'R-80 CEO lee ingresos';
  assert (select count(*) from v_kpi_ventas_cliente_mes) > 0, 'R-80 CEO lee ventas por cliente';
  assert (select count(*) from v_planilla_usd) = 0, 'R-80 CEO no lee planilla';
  assert (select count(*) from v_cliente) = 0, 'R-80 CEO no lee clientes';
end $$;
reset role;

-- Validación: compara lo que decía el sheet con las mismas vistas de las pantallas
insert into referencia_sheet (periodo, concepto, valor) values
  ('2026-01-01', 'planilla_pen', 6375), ('2026-01-01', 'herramientas_usd', 999);
do $$
begin
  assert (select cuadra from v_validacion_mes where periodo = '2026-01-01' and concepto = 'planilla_pen'), 'planilla cuadra';
  assert not (select cuadra from v_validacion_mes where periodo = '2026-01-01' and concepto = 'herramientas_usd'), 'herramientas no cuadra';
  assert (select diferencia from v_validacion_mes where periodo = '2026-01-01' and concepto = 'herramientas_usd') = -999, 'diferencia (las herramientas de enero se anularon arriba)';
end $$;
