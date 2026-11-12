-- R-100…R-125: planillas. Casos calculados a mano (montos en soles).
-- Empleador 1 (pequeña empresa REMYPE desde 2020) y empleador 2 (microempresa). Planilla desde ene-2026.

-- Tasas AFP de prueba para ene–oct 2026 (iguales a nov-2026, ya sembrada) (R-102).
do $$
declare m date;
begin
  for m in select generate_series('2026-01-01'::date, '2026-10-01', interval '1 month')::date loop
    perform registrar_tasas_afp(m, (select jsonb_agg(jsonb_build_object('codigo', a.codigo, 'aporte', t.aporte * 100,
              'prima', t.prima * 100, 'comision_flujo', t.comision_flujo * 100, 'comision_mixta', 0,
              'comision_saldo', t.comision_saldo * 100, 'remuneracion_maxima', t.remuneracion_maxima))
            from tasa_afp t join afp a on a.id = t.afp_id where t.periodo = '2026-11-01'), 'manual', 'prueba');
  end loop;
end $$;

insert into empleador (razon_social, ruc, inicio_planilla) values ('EMPLEADOR PEQUEÑA SAC', '20000000001', '2026-01-01'),
                                                                  ('EMPLEADOR MICRO EIRL', '20000000002', '2026-01-01');
insert into empleador_remype (empleador_id, categoria, desde) values
  ((select id from empleador where ruc = '20000000001'), 'pequena', '2020-01-01'),
  ((select id from empleador where ruc = '20000000002'), 'micro', '2020-01-01');

insert into trabajador (id, empleador_id, numero_documento, apellidos_nombres, fecha_ingreso, fecha_cese, motivo_cese,
                        sistema_pension, afp_id, comision_afp, cuspp, asignacion_familiar, jornada_horas)
select x.id::uuid, (select id from empleador where ruc = x.ruc), x.doc, x.nombre, x.ingreso::date, x.cese::date, x.motivo,
       x.pension::sistema_pension, (select id from afp where codigo = x.afp), x.comision::comision_afp, x.cuspp, x.af, x.jornada
from (values
  ('00000000-0000-0000-0000-0000000001a1', '20000000001', '10000001', 'ANA (AFP flujo)',        '2025-03-01', null, null, 'afp', 'INTEGRA', 'flujo', 'CUSPP1', false, 8),
  ('00000000-0000-0000-0000-0000000001a2', '20000000001', '10000002', 'BETO (antes del REMYPE)', '2019-06-01', null, null, 'onp', null, null, null, true, 8),
  ('00000000-0000-0000-0000-0000000001a3', '20000000001', '10000003', 'CARO (novedades)',       '2025-01-01', null, null, 'afp', 'PRIMA', 'mixta', 'CUSPP3', false, 8),
  ('00000000-0000-0000-0000-0000000001a4', '20000000001', '10000004', 'DANI (despido)',         '2023-02-01', '2026-09-30', 'DESPIDO_ARBITRARIO', 'afp', 'HABITAT', 'flujo', 'CUSPP4', false, 8),
  ('00000000-0000-0000-0000-0000000001a5', '20000000001', '10000005', 'ELI (renuncia)',         '2023-01-01', '2026-06-30', 'RENUNCIA', 'onp', null, null, null, false, 8),
  ('00000000-0000-0000-0000-0000000001a6', '20000000002', '10000006', 'FABI (micro)',           '2025-01-01', null, null, 'onp', null, null, null, false, 8),
  ('00000000-0000-0000-0000-0000000001a7', '20000000001', '10000007', 'GABO (medio tiempo)',    '2025-01-01', null, null, 'onp', null, null, null, false, 4)
) as x(id, ruc, doc, nombre, ingreso, cese, motivo, pension, afp, comision, cuspp, af, jornada);

insert into remuneracion (trabajador_id, vigente_desde, sueldo_basico)
select id, fecha_ingreso, x.sueldo from trabajador t join (values
  ('10000001', 3000), ('10000002', 2000), ('10000003', 2400), ('10000004', 3600), ('10000005', 2000),
  ('10000006', 1130), ('10000007', 700)) as x(doc, sueldo) on x.doc = t.numero_documento;

-- Novedades de CARO: marzo con faltas, horas extra, feriado, tardanza, bono y adelanto; abril con subsidio
insert into ausencia (trabajador_id, tipo, desde, hasta) values
  ('00000000-0000-0000-0000-0000000001a3', 'FALTA', '2026-03-10', '2026-03-11'),
  ('00000000-0000-0000-0000-0000000001a3', 'SUBSIDIO_IT', '2026-04-01', '2026-04-10');
insert into asistencia_dia (trabajador_id, fecha, horas_extra, feriado_trabajado, minutos_tardanza) values
  ('00000000-0000-0000-0000-0000000001a3', '2026-03-05', 3, false, 0),
  ('00000000-0000-0000-0000-0000000001a3', '2026-03-15', 0, true, 0),
  ('00000000-0000-0000-0000-0000000001a3', '2026-03-20', 0, false, 30);
insert into movimiento (trabajador_id, periodo, concepto, monto) values
  ('00000000-0000-0000-0000-0000000001a3', '2026-03-01', 'BONO_PRODUCTIVIDAD', 300),
  ('00000000-0000-0000-0000-0000000001a3', '2026-03-01', 'ADELANTO', 500);

-- DANI: saldo inicial de 15 días al 01/01/2026; vacaciones en marzo y junio; adelanto de 6 días en agosto
insert into saldo_vacaciones_inicial values ('00000000-0000-0000-0000-0000000001a4', '2026-01-01', 15, 'prueba');
insert into ausencia (trabajador_id, tipo, desde, hasta) values
  ('00000000-0000-0000-0000-0000000001a4', 'VACACIONES', '2026-03-02', '2026-03-16'),
  ('00000000-0000-0000-0000-0000000001a4', 'VACACIONES', '2026-06-01', '2026-06-15'),
  ('00000000-0000-0000-0000-0000000001a4', 'VACACIONES', '2026-08-03', '2026-08-08');
-- ELI: 30 días pendientes al 01/01/2026 (15 ya vencidos)
insert into saldo_vacaciones_inicial values ('00000000-0000-0000-0000-0000000001a5', '2026-01-01', 30, 'prueba');

do $$
declare
  ana constant uuid := '00000000-0000-0000-0000-0000000001a1';
  beto constant uuid := '00000000-0000-0000-0000-0000000001a2';
  caro constant uuid := '00000000-0000-0000-0000-0000000001a3';
  dani constant uuid := '00000000-0000-0000-0000-0000000001a4';
  eli constant uuid := '00000000-0000-0000-0000-0000000001a5';
  fabi constant uuid := '00000000-0000-0000-0000-0000000001a6';
  gabo constant uuid := '00000000-0000-0000-0000-0000000001a7';
  v numeric; r record;
  linea constant text := 'select coalesce(sum(monto), 0) from v_boleta_linea where trabajador_id = $1 and periodo = $2 and concepto = $3';
begin
  -- R-100: régimen según REMYPE e ingreso
  assert regimen_en(ana, '2026-01-31') = 'pequena', 'R-100 ana pequeña';
  assert regimen_en(beto, '2026-01-31') = 'general', 'R-100 ingresó antes del REMYPE: general';
  assert regimen_en(fabi, '2026-01-31') = 'micro', 'R-100 micro';

  -- R-103: días del mes
  assert dias_tramo('2026-02-01', '2026-02-28') = 30, 'R-103 febrero completo = 30';
  assert dias_tramo('2026-01-15', '2026-01-31') = 17, 'R-103 mes parcial = días calendario';
  assert dias_laborales('2026-05-01', '2026-09-30') = 150, 'R-103 cinco meses';

  -- R-111: AFP flujo de ANA en enero: aporte 10%, prima 1.37%, comisión Integra 1.55%
  execute linea into v using ana, '2026-01-01'::date, 'AFP_APORTE';  assert v = 300.00, format('R-111 aporte %s', v);
  execute linea into v using ana, '2026-01-01'::date, 'AFP_PRIMA';   assert v = 41.10, format('R-111 prima %s', v);
  execute linea into v using ana, '2026-01-01'::date, 'AFP_COMISION'; assert v = 46.50, format('R-111 comisión %s', v);
  -- R-112: EsSalud 9%
  execute linea into v using ana, '2026-01-01'::date, 'ESSALUD'; assert v = 270.00, format('R-112 %s', v);
  -- R-111: ONP 13% sobre sueldo + asignación familiar (10% de RMV 1130)
  execute linea into v using beto, '2026-01-01'::date, 'ASIG_FAMILIAR'; assert v = 113.00, format('R-105 AF %s', v);
  execute linea into v using beto, '2026-01-01'::date, 'ONP'; assert v = 274.69, format('R-111 ONP %s', v);
  -- R-105: la asignación familiar sube con la RMV de octubre (1230)
  execute linea into v using beto, '2026-10-01'::date, 'ASIG_FAMILIAR'; assert v = 123.00, format('R-105 AF oct %s', v);

  -- R-113: quinta de ANA: (3000×12 + 2×(1500+135) − 7 UIT) × 8% = 61.60 al año; enero 61.60/12
  execute linea into v using ana, '2026-01-01'::date, 'QUINTA'; assert v = 5.13, format('R-113 enero %s', v);
  select sum(retencion) into v from v_pl_quinta where trabajador_id = ana and periodo between '2026-01-01' and '2026-12-01';
  assert v = 61.60, format('R-113 retención anual = impuesto anual: %s', v);

  -- R-116: gratificación de julio, pequeña empresa = ½ sueldo; bonificación 9%
  execute linea into v using ana, '2026-07-01'::date, 'GRATI'; assert v = 1500.00, format('R-116 grati %s', v);
  execute linea into v using ana, '2026-07-01'::date, 'BONIF_EXTRA'; assert v = 135.00, format('R-116 bonif %s', v);
  -- general = 1 sueldo computable (sueldo + AF); diciembre con la RMV nueva
  execute linea into v using beto, '2026-07-01'::date, 'GRATI'; assert v = 2113.00, format('R-116 general %s', v);
  execute linea into v using beto, '2026-12-01'::date, 'GRATI'; assert v = 2123.00, format('R-116 dic %s', v);
  -- micro: sin gratificación ni CTS
  execute linea into v using fabi, '2026-07-01'::date, 'GRATI'; assert v = 0, format('R-101 micro grati %s', v);
  assert (select sum(gratificacion + cts) from v_provision_mes where trabajador_id = fabi) = 0, 'R-101 micro sin provisiones';
  -- faltas reducen 1/30 de la fracción: 1200 − 1200/180×2
  select monto into v from v_gratificacion where trabajador_id = caro and sem_inicio = '2026-01-01';
  assert v = 1186.67, format('R-116 días no computables %s', v);

  -- R-117: CTS de ANA nov-25–abr-26: (3000 + 1500/6) / 30 × 7.5 días = 812.50
  select monto into v from v_cts where trabajador_id = ana and sem_inicio = '2025-11-01'; assert v = 812.50, format('R-117 mayo %s', v);
  select monto into v from v_cts where trabajador_id = ana and sem_inicio = '2026-05-01'; assert v = 812.50, format('R-117 noviembre %s', v);
  -- general: (2113 + 2113/6) / 30 × 15 días
  select monto into v from v_cts where trabajador_id = beto and sem_inicio = '2025-11-01'; assert v = 1232.59, format('R-117 general %s', v);

  -- R-118: las provisiones del semestre suman lo pagado (sin ajuste manual)
  select sum(gratificacion) into v from v_provision_mes where trabajador_id = ana and periodo between '2026-01-01' and '2026-06-01';
  assert v = 1500.00, format('R-118 grati ene–jun %s', v);
  select sum(cts) into v from v_provision_mes where trabajador_id = ana and periodo between '2026-05-01' and '2026-10-01';
  assert v = 812.50, format('R-118 CTS may–oct %s', v);
  select sum(gratificacion) into v from v_provision_mes where trabajador_id = beto and periodo between '2026-07-01' and '2026-12-01';
  assert v = 2123.00, format('R-118 grati jul–dic con alza de RMV %s', v);
  assert (select vacaciones from v_provision_mes where trabajador_id = ana and periodo = '2026-01-01') = 125.00, 'R-118 vacaciones = 3000/24';

  -- R-114: costo empresa de julio = ingresos − grati y bonificación (provisionadas) + EsSalud + provisiones
  select * into r from v_planilla where trabajador_id = ana and periodo = '2026-07-01';
  assert r.costo_empresa = 4635.00 - 1635.00 + 270.00 + 250.00 + 22.50 + 156.25 + 125.00, format('R-114 costo %s', r.costo_empresa);

  -- R-104…R-109: CARO en marzo
  execute linea into v using caro, '2026-03-01'::date, 'SUELDO';   assert v = 2240.00, format('R-105 2 faltas %s', v);
  execute linea into v using caro, '2026-03-01'::date, 'HE25';     assert v = 25.00, format('R-107 HE25 %s', v);
  execute linea into v using caro, '2026-03-01'::date, 'HE35';     assert v = 13.50, format('R-107 HE35 %s', v);
  execute linea into v using caro, '2026-03-01'::date, 'FERIADO';  assert v = 160.00, format('R-108 feriado %s', v);
  execute linea into v using caro, '2026-03-01'::date, 'TARDANZA'; assert v = 5.00, format('R-109 tardanza %s', v);
  -- R-110: la tardanza reduce la base; mixta no paga comisión sobre la remuneración
  execute linea into v using caro, '2026-03-01'::date, 'AFP_APORTE'; assert v = 273.35, format('R-110 base %s', v);
  execute linea into v using caro, '2026-03-01'::date, 'AFP_COMISION'; assert v = 0, format('R-111 mixta %s', v);
  select * into r from v_planilla where trabajador_id = caro and periodo = '2026-03-01';
  assert r.ingresos = 2738.50, format('R-114 ingresos %s', r.ingresos);
  assert r.neto = r.ingresos - (select sum(monto) from v_boleta_linea where trabajador_id = caro and periodo = '2026-03-01' and tipo = 'descuento'), 'R-114 neto';
  assert exists (select 1 from v_boleta_linea where trabajador_id = caro and periodo = '2026-03-01' and concepto = 'ADELANTO' and monto = 500), 'adelanto';
  -- R-104, R-112: subsidio no afecto; EsSalud con mínimo RMV × días no subsidiados
  execute linea into v using caro, '2026-04-01'::date, 'SUBSIDIO_IT'; assert v = 800.00, format('R-104 subsidio %s', v);
  execute linea into v using caro, '2026-04-01'::date, 'ESSALUD'; assert v = 144.00, format('R-112 essalud %s', v);
  -- R-112: mínimo RMV para quien gana menos (medio tiempo)
  execute linea into v using gabo, '2026-01-01'::date, 'ESSALUD'; assert v = 101.70, format('R-112 mínimo %s', v);
  assert exists (select 1 from v_pl_observacion where trabajador_id = gabo and codigo = 'SUELDO_MENOR_RMV'), 'R-124 sueldo < RMV';

  -- R-119: vacaciones de DANI al cese: 45 ganados, 55 consumidos → 10 adelantados... (15 previos + 15 + 15 + 6 = 51)
  select * into r from v_vacaciones where trabajador_id = dani;
  assert r.dias_ganados = 45 and r.dias_gozados = 51, format('R-119 ganados %s gozados %s', r.dias_ganados, r.dias_gozados);
  assert r.dias_adelantados = 6 and r.dias_pendientes = 0 and r.dias_vencidos = 0, format('R-119 adelanto %s', r.dias_adelantados);
  assert r.dias_trunca = 10, format('R-119 truncas (8 meses) %s', r.dias_trunca);
  -- ELI: 30 pendientes, 15 vencidos
  select * into r from v_vacaciones where trabajador_id = eli;
  assert r.dias_pendientes = 30 and r.dias_vencidos = 15 and r.dias_trunca = 7.5, format('R-119 eli %s/%s/%s', r.dias_pendientes, r.dias_vencidos, r.dias_trunca);

  -- R-120, R-121: liquidación de DANI (despido arbitrario, pequeña empresa, 3 años 8 meses)
  assert (select monto from v_liquidacion_linea where trabajador_id = dani and concepto = 'CTS') = 812.50, 'R-120 CTS trunca (3600+300)/30×6.25';
  assert (select monto from v_liquidacion_linea where trabajador_id = dani and concepto = 'GRATI_TRUNCA') = 900.00, 'R-120 grati trunca 3 meses';
  assert (select monto from v_liquidacion_linea where trabajador_id = dani and concepto = 'BONIF_TRUNCA') = 81.00, 'R-120 bonificación trunca';
  assert (select monto from v_liquidacion_linea where trabajador_id = dani and concepto = 'VAC_TRUNCA') = 480.00, 'R-120 truncas − adelanto: 4 días';
  assert (select monto from v_liquidacion_linea where trabajador_id = dani and concepto = 'INDEM_DESPIDO') = 8800.00, 'R-121 20 días × 44/12';
  assert (select monto from v_liquidacion_linea where trabajador_id = dani and concepto = 'AFP_APORTE') = 48.00, 'R-120 AFP sobre vacaciones';
  -- R-122: lo percibido en el año no llega a 7 UIT: se devuelve todo lo retenido
  select sum(retencion) into v from v_pl_quinta where trabajador_id = dani and periodo between '2026-01-01' and '2026-09-01';
  assert v = 459.95, format('R-113 retenido dani %s', v);
  assert (select monto from v_liquidacion_linea where trabajador_id = dani and concepto = 'DEVOL_QUINTA') = 459.95, 'R-122 devolución';
  assert (select retencion from v_pl_quinta where trabajador_id = dani and periodo = '2026-09-01') = 0, 'R-122 mes de cese sin quinta';
  select * into r from v_liquidacion where trabajador_id = dani;
  assert r.neto = 11471.81, format('R-120 neto liquidación %s', r.neto);
  assert r.fecha_limite_pago = '2026-10-02', 'R-120 48 horas';
  -- ELI (renuncia): sin indemnización; vacaciones pendientes, vencidas y truncas
  assert not exists (select 1 from v_liquidacion_linea where trabajador_id = eli and concepto = 'INDEM_DESPIDO'), 'R-121 renuncia no indemniza';
  assert (select monto from v_liquidacion_linea where trabajador_id = eli and concepto = 'VAC_PENDIENTE') = 2000.00, 'R-120 pendientes';
  assert (select monto from v_liquidacion_linea where trabajador_id = eli and concepto = 'INDEM_VACACIONAL') = 1000.00, 'R-119 vencidas';
  assert (select monto from v_liquidacion_linea where trabajador_id = eli and concepto = 'VAC_TRUNCA') = 500.00, 'R-120 truncas';
  assert (select monto from v_liquidacion_linea where trabajador_id = eli and concepto = 'GRATI_TRUNCA') = 1000.00, 'R-116 cese 30/06 = trunca';
  assert (select monto from v_liquidacion_linea where trabajador_id = eli and concepto = 'CTS') = 166.67, 'R-117 CTS trunca sin sexto';
  assert (select monto from v_liquidacion_linea where trabajador_id = eli and concepto = 'ONP') = 325.00, 'R-120 ONP sobre vacaciones';
  assert not exists (select 1 from v_boleta_linea where trabajador_id = eli and periodo = '2026-07-01'), 'después del cese no hay planilla';

  -- R-102: con las tasas del mes no hay observación; sin ellas, provisional y bloquea
  assert not exists (select 1 from v_pl_observacion where periodo = '2026-03-01' and codigo = 'TASAS_AFP'), 'R-102 tasas exactas';
  assert exists (select 1 from v_pl_observacion where periodo = '2026-12-01' and codigo = 'TASAS_AFP' and bloquea), 'R-102 diciembre provisional';
  assert (select tasas_provisionales from v_planilla where trabajador_id = ana and periodo = '2026-12-01'), 'R-102 marca provisional';
  execute linea into v using ana, '2026-12-01'::date, 'AFP_APORTE'; assert v = 300.00, 'R-102 usa las del último mes';
end $$;

-- R-102: lectura de la tabla de la SBS (formato de la página de comisiones y primas)
do $$
declare
  t text := '<html><h2>Al mes de devengue 2026-12</h2><table><tr><th>AFP</th><th>COMISI&Oacute;N SOBRE FLUJO</th>'
    || '<th>COMISI&Oacute;N ANUAL SOBRE SALDO</th><th>PRIMA DE SEGUROS</th><th>APORTE OBLIGATORIO</th><th>REMUNERACI&Oacute;N M&Aacute;XIMA ASEGURABLE</th></tr>'
    || '<tr><td>HABITAT</td><td>1,47%</td><td>1,25%</td><td>1,37%</td><td>10,00%</td><td>12&nbsp;732,70</td></tr>'
    || '<tr><td>INTEGRA</td><td>1,55%</td><td>0,78%</td><td>1,37%</td><td>10,00%</td><td>12&nbsp;732,70</td></tr>'
    || '<tr><td>PRIMA</td><td>1,60%</td><td>1,25%</td><td>1,37%</td><td>10,00%</td><td>12&nbsp;732,70</td></tr>'
    || '<tr><td>PROFUTURO</td><td>1,69%</td><td>0,68%</td><td>1,37%</td><td>10,00%</td><td>12&nbsp;732,70</td></tr></table></html>';
  r record;
begin
  select * into r from parsear_tasas_sbs(t) where codigo = 'INTEGRA';
  assert r.periodo = '2026-12-01' and r.comision_flujo = 1.55 and r.comision_saldo = 0.78 and r.prima = 1.37
     and r.aporte = 10 and r.remuneracion_maxima = 12732.70, 'R-102 parser SBS';
  begin
    perform parsear_tasas_sbs('<script src="/_Incapsula_Resource"></script>');
    raise exception 'debió rechazar';
  exception when others then assert sqlerrm like '%bloqueo%', sqlerrm; end;
  begin
    perform parsear_tasas_sbs(replace(t, 'PROFUTURO', 'OTRA'));
    raise exception 'debió rechazar';
  exception when others then assert sqlerrm like '%PROFUTURO%', sqlerrm; end;
  begin
    perform parsear_tasas_sbs(replace(t, '<td>PRIMA</td><td>1,60%</td><td>1,25%</td><td>1,37%</td><td>10,00%</td><td>12&nbsp;732,70</td>',
                                         '<td>PRIMA</td><td>1,60%</td><td>1,25%</td><td>1,37%</td><td>10,00%</td><td>14&nbsp;000,00</td>'));
    raise exception 'debió rechazar';
  exception when others then assert sqlerrm like '%diferencias%', sqlerrm; end;
  -- con la tabla de diciembre registrada, diciembre deja de ser provisional
  perform registrar_tasas_afp(r.periodo, (select jsonb_agg(to_jsonb(p) - 'periodo') from parsear_tasas_sbs(t) p), 'sbs', 'prueba SBS');
  assert not exists (select 1 from v_pl_observacion where periodo = '2026-12-01' and codigo = 'TASAS_AFP'), 'R-102 diciembre exacto';
end $$;

-- R-123: cerrar emite boletas y bloquea novedades; reabrir solo el administrador, anulando boletas
insert into usuario (id, email, rol) values ('00000000-0000-0000-0000-0000000001d1', 'admin-pl@prueba', 'admin'),
                                            ('00000000-0000-0000-0000-0000000001d2', 'ceo-pl@prueba', 'ceo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001d1"}', false);
do $$
declare n int; emp smallint := (select id from empleador where ruc = '20000000001');
begin
  n := cerrar_planilla(emp, '2026-03-01');
  assert n = (select count(*) from v_planilla where empleador_id = emp and periodo = '2026-03-01'), format('R-123 boletas %s', n);
  assert (select neto from boleta where trabajador_id = '00000000-0000-0000-0000-0000000001a3' and periodo = '2026-03-01' and anulado_en is null)
       = (select neto from v_planilla where trabajador_id = '00000000-0000-0000-0000-0000000001a3' and periodo = '2026-03-01'), 'R-123 copia fiel';
  assert jsonb_array_length((select datos -> 'lineas' from boleta where trabajador_id = '00000000-0000-0000-0000-0000000001a3'
                             and periodo = '2026-03-01' and anulado_en is null)) >= 8, 'R-123 boleta con líneas';
  assert not exists (select 1 from v_pl_observacion where periodo = '2026-03-01' and codigo = 'BOLETA_DIFIERE'), 'R-124 boleta coincide';
  begin
    insert into ausencia (trabajador_id, tipo, desde, hasta) values ('00000000-0000-0000-0000-0000000001a1', 'FALTA', '2026-03-20', '2026-03-20');
    raise exception 'debió bloquear';
  exception when others then assert sqlerrm like 'R-123%', sqlerrm; end;
  -- abril está abierto
  insert into ausencia (trabajador_id, tipo, desde, hasta) values ('00000000-0000-0000-0000-0000000001a1', 'FALTA', '2026-04-20', '2026-04-20');
  -- no se cierra con observaciones que bloquean (diciembre de 2026 de otro empleador no aplica; aquí: sin CUSPP)
  update trabajador set cuspp = null where id = '00000000-0000-0000-0000-0000000001a1';
  begin
    perform cerrar_planilla(emp, '2026-04-01');
    raise exception 'debió rechazar';
  exception when others then assert sqlerrm like '%CUSPP%', sqlerrm; end;
  update trabajador set cuspp = 'CUSPP1' where id = '00000000-0000-0000-0000-0000000001a1';
  n := reabrir_planilla(emp, '2026-03-01', 'prueba');
  assert not exists (select 1 from boleta where periodo = '2026-03-01' and anulado_en is null), 'R-123 reabrir anula';
  assert not exists (select 1 from planilla_cierre where periodo = '2026-03-01'), 'R-123 reabierta';
end $$;

-- R-125: el CEO no ve sueldos
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001d2"}', false);
set role authenticated;
do $$
begin
  assert (select count(*) from trabajador) = 0, 'R-125 CEO no lee trabajadores';
  assert (select count(*) from v_planilla) = 0, 'R-125 CEO no lee planilla';
  begin
    perform cerrar_planilla(1::smallint, '2026-04-01');
    raise exception 'debió rechazar';
  exception when others then assert sqlerrm like 'R-125%', sqlerrm; end;
end $$;
reset role;
