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

-- Indicadores: lo vencido cae en la semana actual; la concentración es una proporción
do $$
begin
  assert not exists (select 1 from v_proyeccion_cobros where semana < date_trunc('week', current_date)), 'proyección: nada antes de esta semana';
  assert coalesce((select sum(vencido_usd) from v_proyeccion_cobros), 0)
       = coalesce((select sum(saldo_usd) from v_cuota where not pagada and vencimiento < current_date), 0), 'proyección: vencido completo';
  assert (select coalesce(concentracion_top5, 0) between 0 and 1 from v_kpi_hoy_calc), 'concentración entre 0 y 1';
end $$;

-- R-37/R-38: morosos y estado de su gestión de cobranza
do $$
declare c uuid := '00000000-0000-0000-0000-0000000000c1'; g uuid;
begin
  assert (select moroso and estado_gestion = 'sin_gestion' from v_morosidad where cliente_id = c), 'R-37 moroso sin gestión';
  insert into gestion_cobranza (cliente_id, fecha, tipo_id, detalle, compromiso_fecha)
  values (c, current_date - 10, 1, 'Llamada a finanzas', current_date - 2) returning id into g;
  assert (select estado_gestion from v_morosidad where cliente_id = c) = 'compromiso_incumplido', 'R-38 compromiso vencido';
  insert into gestion_cobranza (cliente_id, fecha, tipo_id, detalle, proxima_fecha)
  values (c, current_date, 2, 'Correo con estado de cuenta', current_date + 3);
  assert (select estado_gestion from v_morosidad where cliente_id = c) = 'en_gestion', 'R-38 la última gestión manda';
  perform anular('gestion_cobranza', (select id from gestion_cobranza where detalle like 'Correo%'), 'prueba');
  assert (select estado_gestion from v_morosidad where cliente_id = c) = 'compromiso_incumplido', 'R-81 lo anulado no cuenta';
end $$;

-- R-53/R-54: un cliente caído no tiene ingreso actual ni servicios activos; la retención cuadra
do $$
begin
  assert not exists (select 1 from v_cliente_caido c where exists (select 1 from v_renovacion r where r.cliente_id = c.cliente_id and r.dias_para_vencer >= -30)), 'R-53 caído sin servicios vigentes';
  assert not exists (select 1 from v_cliente_caido c join v_cliente_mes m on m.cliente_id = c.cliente_id
                     where m.periodo >= date_trunc('month', current_date)), 'R-53 caído sin ingreso actual';
  assert not exists (select 1 from v_retencion_mes where retenidos + perdidos <> activos_mes_anterior), 'R-54 retenidos + perdidos = activos del mes anterior';
  -- un proyecto que terminó hace 2 meses deja al cliente caído (si no tiene servicios mensuales)
  insert into servicio_contratado (id, cliente_id, servicio_id, estado) values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000c2', 2, 'activo');
  insert into venta (id, servicio_contratado_id, fecha_contrato, fecha_fin, moneda, monto_neto, pct_igv)
  values ('00000000-0000-0000-0000-00000000aa02', '00000000-0000-0000-0000-00000000aa01',
          (date_trunc('month', current_date) - interval '3 months')::date, (date_trunc('month', current_date) - interval '2 months')::date, 'USD', 1000, 0.18);
  assert exists (select 1 from v_cliente_caido where cliente_id = '00000000-0000-0000-0000-0000000000c2' and tipo = 'proyecto'), 'R-53 cliente de proyecto terminado';
end $$;
