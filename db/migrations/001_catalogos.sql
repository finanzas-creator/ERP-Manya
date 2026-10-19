-- 001 · Tipos, configuración y catálogos
-- Catálogos = listas de valores. Nada de texto libre para lo que se repite (DRY).

create domain dinero as numeric(18,6);
create domain porcentaje as numeric(7,6) check (value >= 0 and value <= 1);
create domain mes as date check (extract(day from value) = 1);

create type modalidad as enum ('mensual', 'proyecto');          -- R-02
create type naturaleza as enum ('propio', 'terceros');          -- R-02, R-03
create type moneda as enum ('USD', 'PEN');
create type rol as enum ('admin', 'tesoreria', 'ceo');          -- R-80
create type tipo_comprobante as enum ('factura', 'boleta', 'recibo_honorarios', 'comanda');
create type estado_servicio as enum ('activo', 'finalizado');   -- R-52
create type tipo_costo_directo as enum ('proveedor', 'consumo_pauta');
create type grupo_costo as enum ('directo', 'direccion', 'overhead');  -- R-62
create type momento_cuota as enum ('inicio', 'fin');           -- R-11

-- Parámetros del negocio: una sola fila tipada.
create table config (
  id                     boolean primary key default true check (id),
  igv_pct                porcentaje not null default 0.18,   -- R-12
  detraccion_pct         porcentaje not null default 0.12,   -- R-22
  detraccion_umbral_pen  dinero not null default 700,        -- R-22
  tolerancia_usd         dinero not null default 5,          -- R-33: diferencia de cambio/redondeo...
  tolerancia_pct         porcentaje not null default 0.025   -- R-33: ...que además no supere este % del total
);
insert into config default values;

create function cfg() returns config language sql stable as $$ select * from config $$;

-- Usuarios del sistema (id = auth.users.id en Supabase).
create table usuario (
  id      uuid primary key,
  email   text not null unique,
  nombre  text,
  rol     rol not null,
  activo  boolean not null default true
);

create table empresa (
  id      smallint generated always as identity primary key,
  nombre  text not null unique,
  ruc     text unique
);

create table linea_negocio (
  id      smallint generated always as identity primary key,
  nombre  text not null unique
);

create table categoria (
  id        smallint generated always as identity primary key,
  nombre    text not null unique,
  linea_id  smallint not null references linea_negocio
);

create table servicio (
  id            int generated always as identity primary key,
  categoria_id  smallint not null references categoria,
  nombre        text not null,
  modalidad     modalidad not null,
  naturaleza    naturaleza not null default 'propio',
  activo        boolean not null default true,
  unique (categoria_id, nombre)
);

create table equipo (
  id      smallint generated always as identity primary key,
  nombre  text not null unique,
  activo  boolean not null default true
);

-- Personas: partners comerciales y colaboradores.
create table persona (
  id      int generated always as identity primary key,
  nombre  text not null unique,
  activo  boolean not null default true
);

create table cuenta_bancaria (
  id             smallint generated always as identity primary key,
  nombre         text not null unique,
  empresa_id     smallint references empresa,
  moneda         moneda not null,
  es_detraccion  boolean not null default false,            -- R-31
  activo         boolean not null default true
);

create table plantilla_pago (
  id      smallint generated always as identity primary key,
  nombre  text not null unique
);

create table plantilla_pago_item (
  plantilla_id  smallint not null references plantilla_pago on delete cascade,
  orden         smallint not null,
  concepto      text not null,
  porcentaje    porcentaje not null,
  momento       momento_cuota not null,
  primary key (plantilla_id, orden)
);

-- Tipo de cambio PEN por USD, uno por mes (R-06, R-60).
create table tipo_cambio_mensual (
  periodo  mes primary key,
  tc       numeric(10,6) not null check (tc > 0)
);

-- TC aplicable a una fecha: el último registrado con periodo <= mes de la fecha (R-06).
create function tc_de(fecha date) returns numeric language sql stable as $$
  select tc from tipo_cambio_mensual
  where periodo <= date_trunc('month', fecha)::date
  order by periodo desc limit 1
$$;

-- Planilla: sub-área -> grupo de costo y línea (R-62).
create table sub_area (
  id        smallint generated always as identity primary key,
  nombre    text not null unique,
  grupo     grupo_costo not null,
  linea_id  smallint references linea_negocio,
  check ((grupo = 'directo') = (linea_id is not null))
);

-- Reparto del costo de Dirección entre líneas (R-62). Debe sumar 1.
create table peso_direccion (
  linea_id  smallint primary key references linea_negocio,
  peso      porcentaje not null
);
