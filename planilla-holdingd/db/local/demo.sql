-- Datos FICTICIOS para ver Planillas en local (make demo). Nunca se aplica en producción.
-- Tasas AFP de ene–oct 2026 iguales a las de noviembre (sembradas): solo para la demostración.
do $$
declare m date;
begin
  for m in select generate_series('2026-01-01'::date, '2026-10-01', interval '1 month')::date loop
    perform registrar_tasas_afp(m, (select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'aporte', t.aporte * 100,
              'prima', t.prima * 100, 'comision_flujo', t.comision_flujo * 100, 'comision_mixta', 0,
              'comision_saldo', t.comision_saldo * 100, 'remuneracion_maxima', t.remuneracion_maxima))
            from tasa_afp t join afp a on a.id = t.afp_id where t.periodo = '2026-11-01'), 'manual', 'DEMOSTRACIÓN: copia de nov-2026');
  end loop;
end $$;

insert into empleador (razon_social, ruc, direccion, inicio_planilla) values
  ('EMPLEADOR DEMO SAC (ficticio)', '20999999991', 'Av. Demostración 123, Lima', '2026-01-01');
insert into empleador_remype (empleador_id, categoria, desde, constancia)
select id, 'pequena', '2020-01-01', 'DEMO-0001' from empleador where ruc = '20999999991';

insert into trabajador (empleador_id, numero_documento, apellidos_nombres, cargo, fecha_ingreso, sistema_pension, afp_id, comision_afp,
                        cuspp, asignacion_familiar, fecha_nacimiento)
select (select id from empleador where ruc = '20999999991'), x.doc, x.nombre, x.cargo, x.ingreso::date, x.pension::sistema_pension,
       (select id from afp where codigo = x.afp), x.comision::comision_afp, x.cuspp, x.af, '1990-05-10'
from (values
  ('70000001', 'PÉREZ DEMO, ANA', 'Analista contable', '2024-03-01', 'afp', 'INTEGRA', 'mixta', 'DEMO001', false),
  ('70000002', 'GÓMEZ DEMO, LUIS', 'Diseñador', '2023-08-15', 'afp', 'PRIMA', 'flujo', 'DEMO002', true),
  ('70000003', 'RAMOS DEMO, CARLA', 'Ejecutiva comercial', '2025-02-01', 'onp', null, null, null, false),
  ('70000004', 'TORRES DEMO, JORGE', 'Asistente administrativo', '2019-06-01', 'onp', null, null, null, true),
  ('70000005', 'DÍAZ DEMO, MARÍA', 'Jefa de proyectos', '2022-01-10', 'afp', 'HABITAT', 'mixta', 'DEMO005', false),
  ('70000006', 'CASTRO DEMO, PEDRO', 'Practicante profesional', '2026-04-01', 'afp', 'PROFUTURO', 'mixta', 'DEMO006', false)
) as x(doc, nombre, cargo, ingreso, pension, afp, comision, cuspp, af);

insert into remuneracion (trabajador_id, vigente_desde, sueldo_basico, motivo)
select t.id, t.fecha_ingreso, x.sueldo, 'Ingreso' from trabajador t join (values
  ('70000001', 3500), ('70000002', 2800), ('70000003', 2200), ('70000004', 1800), ('70000005', 6500), ('70000006', 1300)) as x(doc, sueldo)
  on x.doc = t.numero_documento;
insert into remuneracion (trabajador_id, vigente_desde, sueldo_basico, motivo)
select id, '2026-07-01', 3800, 'Aumento' from trabajador where numero_documento = '70000001';

-- Un cese con liquidación
update trabajador set fecha_cese = '2026-10-31', motivo_cese = 'RENUNCIA' where numero_documento = '70000003';

-- Novedades de noviembre 2026
insert into ausencia (trabajador_id, tipo, desde, hasta, detalle)
select id, 'VACACIONES', '2026-11-16', '2026-11-30', 'Programadas' from trabajador where numero_documento = '70000005';
insert into ausencia (trabajador_id, tipo, desde, hasta, detalle)
select id, 'FALTA', '2026-11-05', '2026-11-05', null from trabajador where numero_documento = '70000002';
insert into asistencia_dia (trabajador_id, fecha, horas_extra, feriado_trabajado, minutos_tardanza)
select id, x.fecha::date, x.horas, x.feriado, x.tardanza from trabajador, (values ('2026-11-03', 3, false, 0), ('2026-11-10', 2.5, false, 15), ('2026-11-01', 0, true, 0)) as x(fecha, horas, feriado, tardanza)
where numero_documento = '70000001';
insert into movimiento (trabajador_id, periodo, concepto, monto, detalle)
select id, '2026-11-01'::date, 'ADELANTO', 800, 'Quincena' from trabajador where numero_documento = '70000005'
union all
select id, '2026-11-01'::date, 'BONO_PRODUCTIVIDAD', 500, 'Cumplimiento de metas' from trabajador where numero_documento = '70000002';
insert into concepto_fijo (trabajador_id, concepto, monto, desde)
select id, 'MOVILIDAD', 200, '2026-01-01' from trabajador where numero_documento = '70000005';
insert into saldo_vacaciones_inicial (trabajador_id, al, dias_pendientes, detalle)
select id, '2026-01-01', 15, 'Demostración' from trabajador where fecha_ingreso < '2026-01-01' and numero_documento like '7000000%';
