-- 034 · Planillas: parámetros legales, catálogos y datos que se registran (R-100…R-125).
-- Aquí solo se guardan hechos (normas vigentes, tasas publicadas, lo que pasó con cada trabajador).
-- Todo lo demás (días, montos, bases, quinta, beneficios, liquidaciones) se calcula en 035.

create type regimen_laboral as enum ('micro', 'pequena', 'general');      -- R-100
create type sistema_pension as enum ('onp', 'afp', 'sin_sistema');        -- R-111
create type comision_afp as enum ('flujo', 'mixta');                      -- R-111
create type sistema_salud as enum ('essalud', 'eps', 'sis');              -- R-112
create type tipo_concepto as enum ('ingreso', 'descuento', 'aporte');     -- R-110 (aporte = cargo del empleador)
create type parametro_legal_tipo as enum (
  'rmv', 'uit', 'onp', 'essalud', 'asignacion_familiar', 'bonificacion_essalud', 'bonificacion_eps',
  'quinta_deduccion_uit', 'prima_edad_maxima', 'descanso_medico_dias');

-- ---------- Parámetros legales con vigencia (hechos: norma publicada) ----------
create table parametro_legal (
  parametro      parametro_legal_tipo not null,
  vigente_desde  date not null,
  valor          numeric(14,6) not null check (valor >= 0),
  norma          text not null,
  fuente_url     text,
  primary key (parametro, vigente_desde)
);

-- Valor vigente de un parámetro en una fecha (lo único que consulta el cálculo).
create function legal(p parametro_legal_tipo, f date)
returns numeric
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  return (
  select valor from parametro_legal where parametro = p and vigente_desde <= f
  order by vigente_desde desc limit 1
  );
end
$$;

insert into parametro_legal (parametro, vigente_desde, valor, norma, fuente_url) values
  ('rmv', '2022-05-01', 1025, 'D.S. 003-2022-TR', null),
  ('rmv', '2025-01-01', 1130, 'D.S. 006-2024-TR', 'https://www.gob.pe/institucion/mtpe/normas-legales/6335262-006-2024-tr'),
  ('rmv', '2026-10-01', 1230, 'D.S. 015-2026-TR', 'https://busquedas.elperuano.pe/dispositivo/EX/2559163-1/pdf/'),
  ('uit', '2024-01-01', 5150, 'D.S. 309-2023-EF', 'https://www.sunat.gob.pe/indicestasas/uit.html'),
  ('uit', '2025-01-01', 5350, 'D.S. 260-2024-EF', 'https://www.sunat.gob.pe/indicestasas/uit.html'),
  ('uit', '2026-01-01', 5500, 'D.S. 301-2025-EF', 'https://www.sunat.gob.pe/indicestasas/uit.html'),
  ('onp', '2000-01-01', 0.13, 'D.L. 19990 (tasa 13%)', 'https://orientacion.sunat.gob.pe/08-tasa-y-calculo-del-aporte-al-snp-onp'),
  ('essalud', '2000-01-01', 0.09, 'Ley 26790 (tasa 9%)', 'https://orientacion.sunat.gob.pe/07-tasa-y-calculo-del-aporte-al-essalud'),
  ('asignacion_familiar', '2000-01-01', 0.10, 'Ley 25129 (10% de la RMV)', null),
  ('bonificacion_essalud', '2015-07-01', 0.09, 'Ley 30334', null),
  ('bonificacion_eps', '2015-07-01', 0.0675, 'Ley 30334', null),
  ('quinta_deduccion_uit', '2015-01-01', 7, 'TUO Ley del Impuesto a la Renta, art. 46', null),
  ('prima_edad_maxima', '2000-01-01', 65, 'TUO Ley del SPP: sin prima de seguro desde los 65 años', null),
  ('descanso_medico_dias', '2000-01-01', 20, 'Ley 26790: primeros 20 días de incapacidad a cargo del empleador', null);

-- Tramos del impuesto de quinta categoría (en UIT).
create table tramo_quinta (
  vigente_desde  date not null,
  desde_uit      numeric(8,2) not null,
  tasa           porcentaje not null,
  norma          text not null,
  primary key (vigente_desde, desde_uit)
);
insert into tramo_quinta values
  ('2015-01-01', 0, 0.08, 'TUO LIR art. 53 (Ley 30296)'),
  ('2015-01-01', 5, 0.14, 'TUO LIR art. 53 (Ley 30296)'),
  ('2015-01-01', 20, 0.17, 'TUO LIR art. 53 (Ley 30296)'),
  ('2015-01-01', 35, 0.20, 'TUO LIR art. 53 (Ley 30296)'),
  ('2015-01-01', 45, 0.30, 'TUO LIR art. 53 (Ley 30296)');

-- Impuesto anual por tramos sobre una renta neta (R-113).
create function impuesto_quinta(renta_neta numeric, f date)
returns numeric
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  return (
  with t as (
    select desde_uit * legal('uit', f) as desde,
           lead(desde_uit) over (order by desde_uit) * legal('uit', f) as hasta, tasa
    from tramo_quinta
    where vigente_desde = (select max(vigente_desde) from tramo_quinta where vigente_desde <= f)
  )
  select round(coalesce(sum(greatest(0, least(greatest(renta_neta, 0), coalesce(hasta, greatest(renta_neta, 0))) - desde) * tasa), 0), 2)
  from t
  );
end
$$;

-- Derechos de cada régimen (R-101).
create table regimen_derecho (
  regimen               regimen_laboral primary key,
  grati_factor          numeric(4,2) not null,     -- sueldos por gratificación
  cts_dias_anio         numeric(6,2) not null,     -- remuneraciones diarias de CTS por año
  cts_tope_dias         numeric(6,2),              -- tope acumulado (pequeña empresa)
  vacaciones_dias       numeric(6,2) not null,
  indem_dias_anio       numeric(6,2),              -- MYPE: remuneraciones diarias por año
  indem_tope_dias       numeric(6,2),
  indem_sueldos_anio    numeric(6,2),              -- general: sueldos por año
  indem_tope_sueldos    numeric(6,2),
  norma                 text not null
);
insert into regimen_derecho values
  ('general', 1, 30, null, 30, null, null, 1.5, 12, 'D.Leg. 728, Ley 27735, D.S. 001-97-TR, D.Leg. 713'),
  ('pequena', 0.5, 15, 90, 15, 20, 120, null, null, 'D.S. 013-2013-PRODUCE (TUO Ley MYPE)'),
  ('micro', 0, 0, null, 15, 10, 90, null, null, 'D.S. 013-2013-PRODUCE (TUO Ley MYPE)');

-- ---------- AFP y tasas por periodo de devengue (R-102) ----------
create table afp (
  id      smallint generated always as identity primary key,
  codigo  text not null unique check (codigo ~ '^[A-Z]+$'),
  nombre  text not null unique
);
insert into afp (codigo, nombre) values
  ('HABITAT', 'AFP Habitat'), ('INTEGRA', 'AFP Integra'), ('PRIMA', 'Prima AFP'), ('PROFUTURO', 'Profuturo AFP');

create table tasa_afp (
  periodo               mes not null,
  afp_id                smallint not null references afp,
  aporte                porcentaje not null,
  prima                 porcentaje not null,
  comision_flujo        porcentaje not null,
  comision_mixta        porcentaje not null default 0,   -- componente sobre la remuneración
  comision_saldo        porcentaje,                       -- anual sobre el saldo (lo cobra la AFP)
  remuneracion_maxima   dinero not null check (remuneracion_maxima > 0),
  fuente                text not null check (fuente in ('sbs', 'manual')),
  sustento              text not null,
  registrado_en         timestamptz not null default now(),
  primary key (periodo, afp_id)
);
-- D-32: tabla SBS de devengue noviembre 2026, contrastada en la revisión anterior.
insert into tasa_afp (periodo, afp_id, aporte, prima, comision_flujo, comision_mixta, comision_saldo, remuneracion_maxima, fuente, sustento)
select '2026-11-01', a.id, 0.10, 0.0137, x.flujo, 0, x.saldo, 12732.70, 'manual',
       'Tabla SBS "Comisiones y primas" devengue 2026-11, verificada el 12/11/2026 (paquete HoldingD v3)'
from afp a join (values ('HABITAT', 0.0147, 0.0125), ('INTEGRA', 0.0155, 0.0078),
                        ('PRIMA', 0.0160, 0.0125), ('PROFUTURO', 0.0169, 0.0068)) as x(codigo, flujo, saldo)
  on x.codigo = a.codigo;

-- Feriados nacionales (para avisos; el pago lo decide el registro de asistencia, R-108).
create table feriado (
  fecha   date primary key,
  nombre  text not null
);
insert into feriado (fecha, nombre)
select (a.anio || '-' || f.md)::date, f.nombre
from (values (2025), (2026), (2027)) as a(anio),
     (values ('01-01', 'Año Nuevo'), ('05-01', 'Día del Trabajo'), ('06-07', 'Batalla de Arica y Día de la Bandera'),
             ('06-29', 'San Pedro y San Pablo'), ('07-23', 'Día de la Fuerza Aérea del Perú'), ('07-28', 'Fiestas Patrias'),
             ('07-29', 'Fiestas Patrias'), ('08-06', 'Batalla de Junín'), ('08-30', 'Santa Rosa de Lima'),
             ('10-08', 'Combate de Angamos'), ('11-01', 'Todos los Santos'), ('12-08', 'Inmaculada Concepción'),
             ('12-09', 'Batalla de Ayacucho'), ('12-25', 'Navidad')) as f(md, nombre);
insert into feriado values
  ('2025-04-17', 'Jueves Santo'), ('2025-04-18', 'Viernes Santo'),
  ('2026-04-02', 'Jueves Santo'), ('2026-04-03', 'Viernes Santo'),
  ('2027-03-25', 'Jueves Santo'), ('2027-03-26', 'Viernes Santo');

-- ---------- Conceptos de la boleta y sus afectaciones (R-110) ----------
create table concepto_planilla (
  codigo                 text primary key check (codigo ~ '^[A-Z0-9_]+$'),
  nombre                 text not null unique,
  tipo                   tipo_concepto not null,
  plame                  text check (plame ~ '^\d{4}$'),        -- código de la tabla 22 SUNAT
  afecto_essalud         boolean not null default false,
  afecto_pension         boolean not null default false,
  afecto_quinta          boolean not null default false,
  quinta_extraordinaria  boolean not null default false,        -- R-113 (D-28)
  computable             boolean not null default false,        -- integra la remuneración computable (R-115)
  variable               boolean not null default false,        -- solo si es regular: 3 de 6 meses
  cubierto_provision     boolean not null default false,        -- R-114: no suma al costo del mes
  manual                 boolean not null default false,        -- se registra como movimiento o concepto fijo
  liquidacion            boolean not null default false,        -- solo aparece en la liquidación
  orden                  smallint not null
);
insert into concepto_planilla (codigo, nombre, tipo, plame, afecto_essalud, afecto_pension, afecto_quinta,
  quinta_extraordinaria, computable, variable, cubierto_provision, manual, liquidacion, orden) values
  -- ingresos que calcula el sistema
  ('SUELDO',          'Remuneración básica',                         'ingreso', '0121', true,  true,  true,  false, false, false, false, false, false, 10),
  ('ASIG_FAMILIAR',   'Asignación familiar',                         'ingreso', '0201', true,  true,  true,  false, false, false, false, false, false, 20),
  ('REM_VACACIONAL',  'Remuneración vacacional',                     'ingreso', '0118', true,  true,  true,  false, false, false, true,  false, false, 30),
  ('SUBSIDIO_IT',     'Subsidio por incapacidad temporal',           'ingreso', null,   false, false, true,  false, false, false, false, false, false, 40),
  ('SUBSIDIO_MAT',    'Subsidio por maternidad',                     'ingreso', null,   false, false, true,  false, false, false, false, false, false, 41),
  ('HE25',            'Horas extra 25%',                             'ingreso', '0105', true,  true,  true,  true,  true,  true,  false, false, false, 50),
  ('HE35',            'Horas extra 35%',                             'ingreso', '0106', true,  true,  true,  true,  true,  true,  false, false, false, 51),
  ('FERIADO',         'Trabajo en feriado o día de descanso',        'ingreso', '0107', true,  true,  true,  true,  false, false, false, false, false, 52),
  ('GRATI',           'Gratificación (Ley 27735)',                   'ingreso', '0406', false, false, true,  false, false, false, true,  false, false, 70),
  ('BONIF_EXTRA',     'Bonificación extraordinaria (Ley 30334)',     'ingreso', '0312', false, false, true,  false, false, false, true,  false, false, 71),
  ('DEVOL_QUINTA',    'Devolución de retención de quinta',           'ingreso', null,   false, false, false, false, false, false, false, false, false, 90),
  -- ingresos que se registran (movimientos o fijos)
  ('BONO_FIJO',       'Bonificación fija',                           'ingreso', null,   true,  true,  true,  false, true,  false, false, true,  false, 60),
  ('COMISION',        'Comisiones',                                  'ingreso', null,   true,  true,  true,  true,  true,  true,  false, true,  false, 61),
  ('BONO_PRODUCTIVIDAD','Bono por productividad',                    'ingreso', null,   true,  true,  true,  true,  true,  true,  false, true,  false, 62),
  ('BONO_EXTRA',      'Bonificación extraordinaria no regular',      'ingreso', null,   true,  true,  true,  true,  false, false, false, true,  false, 63),
  ('REINTEGRO',       'Reintegro de remuneraciones',                 'ingreso', null,   true,  true,  true,  true,  false, false, false, true,  false, 64),
  ('MOVILIDAD',       'Movilidad supeditada a asistencia',           'ingreso', null,   false, false, false, false, false, false, false, true,  false, 65),
  ('OTRO_NO_REM',     'Otro ingreso no remunerativo',                'ingreso', null,   false, false, false, false, false, false, false, true,  false, 66),
  -- descuentos que reducen las bases (calculados)
  ('TARDANZA',        'Descuento por tardanzas',                     'descuento', '0704', true, true, true, false, false, false, false, false, false, 110),
  ('DOMINICAL',       'Descuento de descanso semanal por faltas',    'descuento', '0705', true, true, true, false, false, false, false, false, false, 111),
  -- retenciones (calculadas)
  ('ONP',             'ONP (SNP)',                                   'descuento', '0607', false, false, false, false, false, false, false, false, false, 120),
  ('AFP_APORTE',      'AFP aporte obligatorio',                      'descuento', '0608', false, false, false, false, false, false, false, false, false, 121),
  ('AFP_PRIMA',       'AFP prima de seguro',                         'descuento', '0606', false, false, false, false, false, false, false, false, false, 122),
  ('AFP_COMISION',    'AFP comisión',                                'descuento', '0601', false, false, false, false, false, false, false, false, false, 123),
  ('QUINTA',          'Renta de quinta categoría',                   'descuento', '0605', false, false, false, false, false, false, false, false, false, 124),
  -- descuentos que se registran
  ('ADELANTO',        'Adelanto de remuneración',                    'descuento', '0701', false, false, false, false, false, false, false, true,  false, 130),
  ('PRESTAMO',        'Cuota de préstamo',                           'descuento', '0706', false, false, false, false, false, false, false, true,  false, 131),
  ('JUDICIAL',        'Retención judicial',                          'descuento', '0703', false, false, false, false, false, false, false, true,  false, 132),
  ('DESC_OTRO',       'Otro descuento autorizado',                   'descuento', '0706', false, false, false, false, false, false, false, true,  false, 133),
  -- aportes del empleador
  ('ESSALUD',         'EsSalud (aporte del empleador)',              'aporte',  '0804', false, false, false, false, false, false, false, false, false, 200),
  -- liquidación (R-120)
  ('CTS_PENDIENTE',   'CTS del semestre anterior (no depositada)',   'ingreso', '0904', false, false, false, false, false, false, false, false, true, 299),
  ('CTS',             'CTS trunca',                                  'ingreso', '0904', false, false, false, false, false, false, false, false, true, 300),
  ('GRATI_TRUNCA',    'Gratificación trunca',                        'ingreso', '0407', false, false, true,  false, false, false, false, false, true, 301),
  ('BONIF_TRUNCA',    'Bonificación extraordinaria trunca (Ley 30334)', 'ingreso', '0313', false, false, true, false, false, false, false, false, true, 302),
  ('VAC_PENDIENTE',   'Vacaciones ganadas no gozadas',               'ingreso', '0118', true,  true,  true,  false, false, false, false, false, true, 303),
  ('VAC_TRUNCA',      'Vacaciones truncas',                          'ingreso', '0114', true,  true,  true,  false, false, false, false, false, true, 304),
  ('INDEM_VACACIONAL','Indemnización vacacional (vacaciones vencidas)', 'ingreso', null, false, false, false, false, false, false, false, false, true, 305),
  ('INDEM_DESPIDO',   'Indemnización por despido arbitrario',        'ingreso', null,   false, false, false, false, false, false, false, false, true, 306),
  ('DESC_LIQUIDACION','Descuento autorizado en la liquidación',      'descuento', '0706', false, false, false, false, false, false, false, true, true, 330);

-- Tipos de ausencia (R-104): con qué concepto se pagan sus días (null = no se pagan) y qué computan.
create table tipo_ausencia (
  codigo                  text primary key check (codigo ~ '^[A-Z0-9_]+$'),
  nombre                  text not null unique,
  concepto_pago           text references concepto_planilla,
  computable_cts          boolean not null,
  computable_grati        boolean not null,
  computable_vacaciones   boolean not null,
  es_vacaciones           boolean not null default false,
  es_descanso_medico      boolean not null default false,   -- cuenta para el tope de 20 días (R-124)
  reduce_descanso_semanal boolean not null default false,   -- R-109: falta injustificada
  orden                   smallint not null
);
insert into tipo_ausencia values
  ('FALTA',           'Falta injustificada',                       null,             false, false, false, false, false, true, 10),
  ('LICENCIA_SG',     'Licencia sin goce',                          null,             false, false, false, false, false, false, 20),
  ('SUSPENSION',      'Suspensión disciplinaria',                   null,             false, false, false, false, false, false, 30),
  ('LICENCIA_CG',     'Licencia con goce',                          'SUELDO',         true,  true,  true,  false, false, false, 40),
  ('DESCANSO_MEDICO', 'Descanso médico (a cargo del empleador)',    'SUELDO',         true,  true,  true,  false, true,  false, 50),
  ('SUBSIDIO_IT',     'Incapacidad temporal subsidiada por EsSalud', 'SUBSIDIO_IT',   true,  true,  true,  false, false, false, 60),
  ('MATERNIDAD',      'Maternidad (subsidio EsSalud)',              'SUBSIDIO_MAT',   true,  true,  true,  false, false, false, 70),
  ('PATERNIDAD',      'Licencia por paternidad',                    'SUELDO',         true,  true,  true,  false, false, false, 80),
  ('VACACIONES',      'Vacaciones',                                 'REM_VACACIONAL', true,  true,  true,  true,  false, false, 90);

-- Motivos de cese (R-121): solo los que indemnizan generan indemnización.
create table motivo_cese (
  codigo     text primary key check (codigo ~ '^[A-Z0-9_]+$'),
  nombre     text not null unique,
  indemniza  boolean not null default false,
  orden      smallint not null
);
insert into motivo_cese values
  ('RENUNCIA',            'Renuncia voluntaria',                         false, 10),
  ('FIN_CONTRATO',        'Vencimiento del contrato',                    false, 20),
  ('MUTUO_DISENSO',       'Mutuo disenso',                               false, 30),
  ('DESPIDO_ARBITRARIO',  'Despido arbitrario',                          true,  40),
  ('DESPIDO_JUSTIFICADO', 'Despido por causa justa (falta grave)',       false, 50),
  ('NO_SUPERA_PRUEBA',    'No supera el periodo de prueba',              false, 60),
  ('FALLECIMIENTO',       'Fallecimiento',                               false, 70),
  ('JUBILACION',          'Jubilación',                                  false, 80);

-- ---------- Empleadores (D-25) ----------
create table empleador (
  id                      smallint generated always as identity primary key,
  razon_social            text not null unique,
  ruc                     text unique check (ruc ~ '^\d{11}$'),
  nombre_comercial        text,
  direccion               text,
  empresa_id              smallint unique references empresa,   -- si además emite comprobantes en el ERP
  inicio_planilla         mes not null,                         -- primer mes calculado en el sistema
  descuento_dominical     boolean not null default false,       -- R-109
  dias_laborables_semana  smallint not null default 6 check (dias_laborables_semana in (5, 6)),
  activo                  boolean not null default true
);

-- Inscripción REMYPE (R-100): un hecho con constancia y fecha.
create table empleador_remype (
  id            smallint generated always as identity primary key,
  empleador_id  smallint not null references empleador,
  categoria     regimen_laboral not null check (categoria <> 'general'),
  desde         date not null,
  hasta         date,
  constancia    text,
  check (hasta is null or hasta >= desde),
  unique (empleador_id, desde)
);

-- ---------- Trabajadores ----------
create table trabajador (
  id                    uuid primary key default gen_random_uuid(),
  empleador_id          smallint not null references empleador,
  codigo_externo        text,                                 -- id en el ERP de control de personal
  tipo_documento        tipo_documento not null default 'DNI',
  numero_documento      text not null,
  apellidos_nombres     text not null,
  fecha_nacimiento      date,
  cargo                 text,
  persona_id            int references persona,               -- vínculo con costos (Planilla y gastos)
  fecha_ingreso         date not null,
  fecha_cese            date,
  motivo_cese           text references motivo_cese,
  fecha_fin_contrato    date,                                 -- plazo fijo; vacío = indeterminado
  periodo_prueba_meses  smallint not null default 3 check (periodo_prueba_meses between 0 and 12),
  regimen_pactado       regimen_laboral,                      -- R-100: decisión humana; vacío = según REMYPE
  sistema_pension       sistema_pension not null default 'onp',
  afp_id                smallint references afp,
  comision_afp          comision_afp,
  cuspp                 text,
  asignacion_familiar   boolean not null default false,       -- R-105
  salud                 sistema_salud not null default 'essalud',
  jornada_horas         numeric(4,2) not null default 8 check (jornada_horas > 0 and jornada_horas <= 8),
  banco                 text,
  cuenta_sueldo         text,
  banco_cts             text,
  cuenta_cts            text,
  correo                text,
  creado_en             timestamptz not null default now(),
  anulado_en            timestamptz,
  anulado_motivo        text,
  check ((anulado_en is null) = (anulado_motivo is null)),
  check ((sistema_pension = 'afp') = (afp_id is not null)),
  check ((sistema_pension = 'afp') = (comision_afp is not null)),
  check ((fecha_cese is null) = (motivo_cese is null)),
  check (fecha_cese is null or fecha_cese >= fecha_ingreso)
);
create unique index trabajador_documento on trabajador (empleador_id, tipo_documento, numero_documento) where anulado_en is null;
create unique index trabajador_codigo_externo on trabajador (empleador_id, codigo_externo) where anulado_en is null;

-- Sueldo básico con vigencia (el sueldo de un mes es el vigente al final del vínculo en el mes).
create table remuneracion (
  id              uuid primary key default gen_random_uuid(),
  trabajador_id   uuid not null references trabajador,
  vigente_desde   date not null,
  sueldo_basico   dinero not null check (sueldo_basico > 0),
  motivo          text,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create unique index remuneracion_vigencia on remuneracion (trabajador_id, vigente_desde) where anulado_en is null;

-- Conceptos fijos mensuales (bono fijo, movilidad…), de un mes a otro (o sin fin).
create table concepto_fijo (
  id              uuid primary key default gen_random_uuid(),
  trabajador_id   uuid not null references trabajador,
  concepto        text not null references concepto_planilla,
  monto           dinero not null check (monto > 0),
  desde           mes not null,
  hasta           mes,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null)),
  check (hasta is null or hasta >= desde)
);

-- ---------- Novedades del mes ----------
create table ausencia (
  id              uuid primary key default gen_random_uuid(),
  trabajador_id   uuid not null references trabajador,
  tipo            text not null references tipo_ausencia,
  desde           date not null,
  hasta           date not null,
  detalle         text,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null)),
  check (hasta >= desde),
  check (date_trunc('month', desde) = date_trunc('month', hasta))   -- una fila por mes: se cierra por mes
);
create index on ausencia (trabajador_id, desde);

-- Un día con incidencias: horas extra, trabajo en feriado/descanso sin sustitutorio, tardanza.
create table asistencia_dia (
  id                 uuid primary key default gen_random_uuid(),
  trabajador_id      uuid not null references trabajador,
  fecha              date not null,
  horas_extra        numeric(5,2) not null default 0 check (horas_extra >= 0 and horas_extra <= 16),
  feriado_trabajado  boolean not null default false,
  minutos_tardanza   int not null default 0 check (minutos_tardanza >= 0),
  detalle            text,
  anulado_en         timestamptz,
  anulado_motivo     text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create unique index asistencia_dia_unico on asistencia_dia (trabajador_id, fecha) where anulado_en is null;

-- Montos del mes: bonos, comisiones, adelantos, préstamos, descuentos.
create table movimiento (
  id              uuid primary key default gen_random_uuid(),
  trabajador_id   uuid not null references trabajador,
  periodo         mes not null,
  concepto        text not null references concepto_planilla,
  monto           dinero not null check (monto > 0),
  detalle         text,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on movimiento (trabajador_id, periodo);

-- Solo se registran conceptos manuales (los demás los calcula el sistema).
create function chk_concepto_manual() returns trigger language plpgsql as $$
begin
  if not (select manual from concepto_planilla where codigo = new.concepto) then
    raise exception 'R-110: % lo calcula el sistema; no se registra a mano', new.concepto;
  end if;
  return new;
end $$;
create trigger movimiento_manual before insert or update on movimiento for each row execute function chk_concepto_manual();
create trigger concepto_fijo_manual before insert or update on concepto_fijo for each row execute function chk_concepto_manual();

-- Dos ausencias no se cruzan (R-104).
create function chk_ausencia_cruce() returns trigger language plpgsql as $$
begin
  if new.anulado_en is null and exists (
      select 1 from ausencia a where a.trabajador_id = new.trabajador_id and a.id <> new.id and a.anulado_en is null
        and a.desde <= new.hasta and a.hasta >= new.desde) then
    raise exception 'R-104: ya hay una ausencia registrada en esas fechas';
  end if;
  return new;
end $$;
create trigger ausencia_cruce before insert or update on ausencia for each row execute function chk_ausencia_cruce();

-- Rentas y retenciones de quinta de otros empleadores o anteriores al sistema (certificado) (R-113).
create table quinta_previa (
  id              uuid primary key default gen_random_uuid(),
  trabajador_id   uuid not null references trabajador,
  anio            smallint not null check (anio between 2000 and 2100),
  renta_bruta     dinero not null check (renta_bruta >= 0),
  retencion       dinero not null check (retencion >= 0),
  detalle         text,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);

-- Saldo de vacaciones al empezar a usar el sistema (R-119): días ganados y no gozados a una fecha.
-- Negativo = días adelantados. Lo ganado antes de esa fecha más allá del saldo se considera gozado.
create table saldo_vacaciones_inicial (
  trabajador_id   uuid primary key references trabajador,
  al              date not null,
  dias_pendientes numeric(6,2) not null,
  detalle         text
);

-- ---------- Cierre de planilla y boletas emitidas (R-123, D-31) ----------
create table planilla_cierre (
  empleador_id  smallint not null references empleador,
  periodo       mes not null,
  cerrado_en    timestamptz not null default now(),
  cerrado_por   uuid default auth.uid(),
  primary key (empleador_id, periodo)
);

create table boleta (
  id                uuid primary key default gen_random_uuid(),
  empleador_id      smallint not null references empleador,
  periodo           mes not null,
  trabajador_id     uuid not null references trabajador,
  datos             jsonb not null,          -- copia fiel: cabecera, líneas y totales
  neto              dinero not null,
  retencion_quinta  dinero not null,
  emitida_en        timestamptz not null default now(),
  emitida_por       uuid default auth.uid(),
  entregada_en      date,
  entrega_detalle   text,
  anulado_en        timestamptz,
  anulado_motivo    text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create unique index boleta_unica on boleta (trabajador_id, periodo) where anulado_en is null;

-- Una novedad de un mes con planilla cerrada no se crea ni cambia (R-123).
create function bloquear_planilla_cerrada() returns trigger language plpgsql as $$
declare
  col text := tg_argv[0];
  f_new date; f_old date; t_new uuid; t_old uuid;
begin
  if tg_op <> 'DELETE' then f_new := (to_jsonb(new) ->> col)::date; t_new := (to_jsonb(new) ->> 'trabajador_id')::uuid; end if;
  if tg_op <> 'INSERT' then f_old := (to_jsonb(old) ->> col)::date; t_old := (to_jsonb(old) ->> 'trabajador_id')::uuid; end if;
  if exists (select 1 from planilla_cierre c join trabajador t on t.empleador_id = c.empleador_id
             where (t.id = t_new and c.periodo = date_trunc('month', f_new)::date)
                or (t.id = t_old and c.periodo = date_trunc('month', f_old)::date)) then
    raise exception 'R-123: la planilla de ese mes está cerrada; reábrela para cambiarla';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t record;
begin
  for t in select * from (values ('ausencia', 'desde'), ('asistencia_dia', 'fecha'), ('movimiento', 'periodo'),
                                 ('remuneracion', 'vigente_desde'), ('concepto_fijo', 'desde')) as x(tabla, col)
  loop
    execute format('create trigger %I before insert or update or delete on %I
                    for each row execute function bloquear_planilla_cerrada(%L)', t.tabla || '_cierre', t.tabla, t.col);
  end loop;
end $$;

-- ---------- Permisos y bitácora (R-80, R-82, R-125) ----------
do $$
declare
  t text;
  operativas text[] := array['trabajador','remuneracion','concepto_fijo','ausencia','asistencia_dia','movimiento',
                             'quinta_previa','saldo_vacaciones_inicial'];
  solo_lectura text[] := array['planilla_cierre','boleta'];          -- se escriben por función (036)
  catalogos text[] := array['parametro_legal','tramo_quinta','regimen_derecho','afp','tasa_afp','feriado',
                            'concepto_planilla','tipo_ausencia','motivo_cese','empleador','empleador_remype'];
  opera constant text := '(select app_rol() in (''admin'',''tesoreria''))';
  admin constant text := '(select app_rol() = ''admin'')';
begin
  foreach t in array operativas || solo_lectura || catalogos loop
    execute format('alter table %I enable row level security', t);
    execute format('create trigger %I after insert or update or delete on %I
                    for each row execute function registrar_auditoria()', t || '_auditoria', t);
    execute format('revoke all on %I from anon', t);
  end loop;
  foreach t in array operativas loop
    execute format('create policy lectura on %I for select to authenticated using (%s)', t, opera);
    execute format('create policy alta on %I for insert to authenticated with check (%s)', t, opera);
    execute format('create policy edicion on %I for update to authenticated using (%s) with check (%s)', t, opera, opera);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
  foreach t in array solo_lectura loop
    execute format('create policy lectura on %I for select to authenticated using (%s)', t, opera);
    execute format('grant select on %I to authenticated', t);
  end loop;
  -- R-125: los sueldos son reservados; los catálogos de planilla los leen administrador y tesorería.
  foreach t in array catalogos loop
    execute format('create policy lectura on %I for select to authenticated using (%s)', t, opera);
    execute format('create policy admin on %I for all to authenticated using (%s) with check (%s)', t, admin, admin);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
-- La entrega de la boleta la registra tesorería (R-123).
create policy entrega on boleta for update to authenticated
  using ((select app_rol() in ('admin','tesoreria'))) with check ((select app_rol() in ('admin','tesoreria')));
grant update (entregada_en, entrega_detalle) on boleta to authenticated;
-- saldo_vacaciones_inicial no tiene columna id: la bitácora usa trabajador_id (registro_id vacío es aceptable).
grant usage on all sequences in schema public to authenticated;
revoke execute on function legal(parametro_legal_tipo, date), impuesto_quinta(numeric, date) from public, anon;
grant execute on function legal(parametro_legal_tipo, date), impuesto_quinta(numeric, date) to authenticated;
