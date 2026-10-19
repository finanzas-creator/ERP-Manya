-- 003 · Costos de la agencia (R-60)

create table planilla (
  id              uuid primary key default gen_random_uuid(),
  periodo         mes not null,
  persona_id      int not null references persona,
  cargo           text,
  tipo_cargo      text,
  forma_pago      text,
  tipo_recibo     text,
  sub_area_id     smallint references sub_area,
  equipo_id       smallint references equipo,
  empresa_id      smallint references empresa,
  moneda          moneda not null default 'PEN',
  costo_total     dinero not null,               -- costo empresa del mes (sueldo bruto total)
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on planilla (periodo);

create table herramienta_gasto (
  id              uuid primary key default gen_random_uuid(),
  periodo         mes not null,
  nombre          text not null,
  tipo            text,
  plan            text,
  moneda          moneda not null default 'USD',
  monto           dinero not null,
  tarjeta         text,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on herramienta_gasto (periodo);

-- Comisiones efectivamente pagadas por persona y mes (R-42).
create table comision_pago (
  id              uuid primary key default gen_random_uuid(),
  periodo         mes not null,
  persona_id      int not null references persona,
  moneda          moneda not null default 'PEN',
  monto           dinero not null,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on comision_pago (periodo);

-- Conversión única a USD (R-06, R-60): todo monto en PEN pasa por aquí.
create function a_usd(monto numeric, mon moneda, fecha date) returns numeric
language sql stable as $$
  select case when mon = 'USD' then monto else monto / tc_de(fecha) end
$$;
