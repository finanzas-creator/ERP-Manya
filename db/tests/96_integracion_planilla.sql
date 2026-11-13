-- R-125, R-126: rol Recursos humanos y API de integración con el ERP de personal.
insert into empleador (razon_social, ruc, inicio_planilla) values ('EMPLEADOR INTEGRADO SAC', '20000000099', '2026-09-01');
insert into empleador_remype (empleador_id, categoria, desde) select id, 'pequena', '2020-01-01' from empleador where ruc = '20000000099';
insert into usuario (id, email, rol) values ('00000000-0000-0000-0000-0000000002d1', 'rrhh@prueba', 'rrhh'),
                                            ('00000000-0000-0000-0000-0000000002d2', 'ceo2@prueba', 'ceo');
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002d1"}', false);
do $$
declare r jsonb; v numeric;
begin
  r := integrar_trabajadores('20000000099', '[
    {"codigo_externo": "H-01", "numero_documento": "40000001", "apellidos_nombres": "Pérez Demo, Ana", "fecha_ingreso": "2025-02-01",
     "sueldo_basico": 3000, "sistema_pension": "afp", "afp": "integra", "comision_afp": "mixta", "cuspp": "X1", "cargo": "Analista"},
    {"codigo_externo": "H-02", "numero_documento": "40000002", "apellidos_nombres": "Gómez Demo, Luis", "fecha_ingreso": "2026-09-15",
     "sueldo_basico": 2000}]');
  assert r = '{"creados": 2, "actualizados": 0, "sueldos": 2}', r::text;
  -- actualizar solo lo que llega; un sueldo nuevo es una nueva vigencia
  r := integrar_trabajadores('20000000099', '[{"codigo_externo": "H-01", "cargo": "Jefa", "sueldo_basico": 3500, "sueldo_desde": "2026-10-01"}]');
  assert r = '{"creados": 0, "actualizados": 1, "sueldos": 1}', r::text;
  assert (select cargo || '|' || cuspp from trabajador where codigo_externo = 'H-01') = 'Jefa|X1', 'campos no enviados se conservan';
  assert sueldo_en((select id from trabajador where codigo_externo = 'H-01'), '2026-09-30') = 3000, 'sueldo anterior';
  assert sueldo_en((select id from trabajador where codigo_externo = 'H-01'), '2026-10-31') = 3500, 'sueldo nuevo';
  -- reenviar el mismo sueldo no crea otra vigencia
  r := integrar_trabajadores('20000000099', '[{"codigo_externo": "H-01", "sueldo_basico": 3500, "sueldo_desde": "2026-10-01"}]');
  assert r ->> 'sueldos' = '0', r::text;

  -- asistencia: 3 horas extra el 5 de octubre; reenviar reemplaza
  r := integrar_asistencia('20000000099', '[{"codigo_externo": "H-01", "fecha": "2026-10-05", "horas_extra": 3}]');
  r := integrar_asistencia('20000000099', '[{"codigo_externo": "H-01", "fecha": "2026-10-05", "horas_extra": 2}]');
  assert (select count(*) from asistencia_dia where fecha = '2026-10-05' and anulado_en is null) = 1, 'un día, una fila';
  select monto into v from v_pl_linea l join trabajador t on t.id = l.trabajador_id where t.codigo_externo = 'H-01' and l.periodo = '2026-10-01' and concepto = 'HE25';
  assert v = round(3500 / 30.0 / 8 * 1.25 * 2, 2), format('HE25 %s', v);

  -- ausencias: vacaciones que cruzan de octubre a noviembre se guardan por mes; reenviar el rango reemplaza
  r := integrar_ausencias('20000000099', '2026-10-01', '2026-11-30', '[{"codigo_externo": "H-01", "tipo": "VACACIONES", "desde": "2026-10-25", "hasta": "2026-11-08"}]');
  assert r ->> 'registradas' = '2', r::text;
  r := integrar_ausencias('20000000099', '2026-10-01', '2026-11-30', '[{"codigo_externo": "H-01", "tipo": "VACACIONES", "desde": "2026-10-26", "hasta": "2026-11-08"}]');
  assert r ->> 'reemplazadas' = '2', r::text;
  assert (select sum(hasta - desde + 1) from ausencia where anulado_en is null and trabajador_id = (select id from trabajador where codigo_externo = 'H-01')) = 14, 'vacaciones reemplazadas';

  -- montos del mes: reemplaza lo enviado antes, respeta lo manual
  insert into movimiento (trabajador_id, periodo, concepto, monto) select id, '2026-10-01', 'ADELANTO', 100 from trabajador where codigo_externo = 'H-02';
  r := integrar_movimientos('20000000099', '2026-10-01', '[{"codigo_externo": "H-02", "concepto": "BONO_PRODUCTIVIDAD", "monto": 300}]');
  r := integrar_movimientos('20000000099', '2026-10-01', '[{"codigo_externo": "H-02", "concepto": "BONO_PRODUCTIVIDAD", "monto": 250}]');
  assert (select string_agg(concepto || ':' || monto::numeric(10,0), ',' order by concepto) from movimiento where anulado_en is null
          and trabajador_id = (select id from trabajador where codigo_externo = 'H-02')) = 'ADELANTO:100,BONO_PRODUCTIVIDAD:250', 'movimientos';

  -- errores claros
  begin perform integrar_asistencia('20000000099', '[{"codigo_externo": "X-99", "fecha": "2026-10-05", "horas_extra": 1}]'); raise exception 'debió fallar';
  exception when others then assert sqlerrm like 'R-126%X-99%', sqlerrm; end;
  begin perform integrar_trabajadores('20999999999', '[]'); raise exception 'debió fallar';
  exception when others then assert sqlerrm like 'R-126%RUC%', sqlerrm; end;

  -- R-125: recursos humanos ve la planilla, pero no ventas ni clientes
  assert (select count(*) from v_planilla where periodo = '2026-10-01') = 2, 'rrhh lee la planilla';
  assert (select count(*) from cliente) = 0 and (select count(*) from venta) = 0, 'rrhh no lee ventas';
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002d2"}', false);
do $$
begin
  begin perform integrar_trabajadores('20000000099', '[]'); raise exception 'debió fallar';
  exception when others then assert sqlerrm like 'R-125%', sqlerrm; end;
  assert (select count(*) from trabajador) = 0, 'el CEO no ve trabajadores';
end $$;
reset role;
