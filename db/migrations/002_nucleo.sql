-- 002 · Núcleo: clientes, ventas, cuotas, comprobantes, pagos
-- Solo hechos. Totales, saldos y estados se calculan en vistas (004).
-- Anulación en lugar de borrado (R-81): anulado_en + anulado_motivo.

create table cliente (
  id               uuid primary key default gen_random_uuid(),
  razon_social     text not null unique,
  ruc              text unique,
  no_domiciliado   boolean not null default false,   -- IGV 0% por defecto (R-12)
  creado_en        timestamptz not null default now()
);

create table marca (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references cliente,
  nombre      text not null,
  unique (cliente_id, nombre)
);

-- Acuerdo con un cliente para un servicio; agrupa sus ciclos (ventas).
create table servicio_contratado (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references cliente,
  marca_id       uuid references marca,
  servicio_id    int not null references servicio,
  estado         estado_servicio not null default 'activo',   -- R-52
  codigo_legacy  text unique,
  creado_en      timestamptz not null default now()
);

create sequence venta_codigo_seq;

create table venta (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text not null unique default 'V-' || lpad(nextval('venta_codigo_seq')::text, 6, '0'),
  servicio_contratado_id  uuid not null references servicio_contratado,
  empresa_id              smallint references empresa,
  fecha_contrato          date not null,                 -- R-04
  fecha_fin               date,                          -- fin de ciclo / entrega (R-05, R-50)
  periodo_servicio        mes,                           -- R-05: nulo = mes de fecha_contrato
  descripcion             text,
  moneda                  moneda not null default 'USD',
  monto_neto              dinero not null check (monto_neto >= 0),
  pct_igv                 porcentaje not null,           -- R-12
  equipo_id               smallint references equipo,
  partner_id              int references persona,
  pct_comision            porcentaje not null default 0, -- R-40
  anulado_en              timestamptz,
  anulado_motivo          text,
  codigo_legacy           text unique,
  creado_en               timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_contrato),
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on venta (servicio_contratado_id);
create index on venta (fecha_contrato);

create table costo_directo (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references venta,
  tipo            tipo_costo_directo not null,
  fecha           date not null,
  moneda          moneda not null default 'USD',
  monto           dinero not null check (monto >= 0),
  descripcion     text,
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on costo_directo (venta_id);

create table comprobante (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           smallint not null references empresa,     -- R-20
  tipo                 tipo_comprobante not null,
  serie_numero         text,                                     -- nulo solo en comandas
  fecha_emision        date not null,
  fecha_limite         date,                                     -- según cliente (R-23)
  pct_detraccion       porcentaje not null default 0,            -- R-22: dato legal impreso
  autodetraccion_fecha date,                                     -- R-36
  anulado_en           timestamptz,
  anulado_motivo       text,
  creado_en            timestamptz not null default now(),
  check (serie_numero is not null or tipo = 'comanda'),
  check ((anulado_en is null) = (anulado_motivo is null))
);
create unique index comprobante_identidad on comprobante (empresa_id, tipo, serie_numero)
  where anulado_en is null;                                      -- R-20

create table cuota (
  id              uuid primary key default gen_random_uuid(),
  venta_id        uuid not null references venta,
  orden           smallint not null,
  concepto        text not null,
  monto_neto      dinero not null check (monto_neto >= 0),
  fecha_limite    date,                                          -- según contrato (R-23)
  comprobante_id  uuid references comprobante,                   -- R-21
  anulado_en      timestamptz,
  anulado_motivo  text,
  codigo_legacy   text unique,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on cuota (venta_id);
create index on cuota (comprobante_id);

create table pago (
  id              uuid primary key default gen_random_uuid(),
  cuota_id        uuid not null references cuota,                -- R-30
  fecha           date not null,
  cuenta_id       smallint not null references cuenta_bancaria,
  monto           dinero not null check (monto > 0),             -- en moneda de la cuenta
  tc              numeric(10,6) not null default 1 check (tc > 0),
  anulado_en      timestamptz,
  anulado_motivo  text,
  creado_en       timestamptz not null default now(),
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on pago (cuota_id);
create index on pago (fecha);

-- R-21: las cuotas de un comprobante son del mismo cliente y moneda.
create function chk_cuota_comprobante() returns trigger language plpgsql as $$
declare n int;
begin
  if new.comprobante_id is null then return new; end if;
  -- cuotas ya ligadas al comprobante + la fila que se está guardando
  select count(distinct k) into n from (
    select (sc.cliente_id, v.moneda) k
    from cuota c join venta v on v.id = c.venta_id
    join servicio_contratado sc on sc.id = v.servicio_contratado_id
    where c.comprobante_id = new.comprobante_id and c.id <> new.id and c.anulado_en is null
    union all
    select (sc.cliente_id, v.moneda)
    from venta v join servicio_contratado sc on sc.id = v.servicio_contratado_id
    where v.id = new.venta_id
  ) s;
  if n > 1 then
    raise exception 'R-21: un comprobante solo agrupa cuotas del mismo cliente y moneda';
  end if;
  return new;
end $$;
create trigger cuota_comprobante_chk before insert or update of comprobante_id, venta_id on cuota
  for each row execute function chk_cuota_comprobante();
