-- 027 · Datos fiscales de cada empresa emisora y de cada cliente (R-39), para emitir y conectar
-- con la facturación electrónica: cada entidad con su RUC, dirección, series y cuentas.

-- Empresa emisora: `nombre` es su razón social.
alter table empresa add column nombre_comercial text;
alter table empresa add column direccion_fiscal text;
alter table empresa add column ubigeo text check (ubigeo ~ '^\d{6}$');
alter table empresa add column correo text;
alter table empresa add column telefono text;
alter table empresa add column cuenta_detracciones text;      -- N° de cuenta en el Banco de la Nación

-- Cuentas bancarias: número y CCI (van impresos en el comprobante).
alter table cuenta_bancaria add column numero text;
alter table cuenta_bancaria add column cci text;

-- Series autorizadas por empresa y tipo de comprobante (catálogo). El siguiente número se calcula
-- de los comprobantes ya emitidos; no se guarda.
create table serie_comprobante (
  id          smallint generated always as identity primary key,
  empresa_id  smallint not null references empresa,
  tipo        tipo_comprobante not null,
  serie       text not null check (serie ~ '^[A-Z0-9]{4}$'),
  activo      boolean not null default true,
  unique (empresa_id, tipo, serie)
);

create view v_serie_comprobante with (security_invoker = true) as
select s.id, s.empresa_id, e.nombre as empresa, s.tipo, s.serie, s.activo,
       coalesce(max(substring(c.serie_numero from '-(\d+)$')::int), 0) + 1 as siguiente_numero,
       s.serie || '-' || (coalesce(max(substring(c.serie_numero from '-(\d+)$')::int), 0) + 1) as siguiente
from serie_comprobante s
join empresa e on e.id = s.empresa_id
left join comprobante c on c.empresa_id = s.empresa_id and c.tipo = s.tipo
  and c.serie_numero like s.serie || '-%' and c.anulado_en is null
group by s.id, e.nombre;

-- Cliente: datos para el comprobante electrónico (catálogo 06 de SUNAT para el tipo de documento).
create type tipo_documento as enum ('RUC', 'DNI', 'CE', 'PASAPORTE', 'SIN_DOCUMENTO');
alter table cliente add column tipo_documento tipo_documento not null default 'RUC';
alter table cliente add column direccion_fiscal text;
alter table cliente add column correo_facturacion text;

-- Permisos y bitácora como el resto de catálogos (R-80, R-82).
alter table serie_comprobante enable row level security;
create policy lectura on serie_comprobante for select to authenticated using ((select app_rol() is not null));
create policy admin on serie_comprobante for all to authenticated using ((select app_rol() = 'admin')) with check ((select app_rol() = 'admin'));
grant select, insert, update, delete on serie_comprobante to authenticated;
grant select on v_serie_comprobante to authenticated;
revoke all on serie_comprobante, v_serie_comprobante from anon;
create trigger serie_comprobante_auditoria after insert or update or delete on serie_comprobante
  for each row execute function registrar_auditoria();
