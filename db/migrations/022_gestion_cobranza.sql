-- 022 · Gestión de cobranza (R-37, R-38): qué se hizo para cobrar a cada cliente con deuda
-- vencida, y la lista de morosos para el dashboard.

-- Días de atraso desde los que un cliente se considera moroso.
alter table config add column morosidad_dias int not null default 60 check (morosidad_dias > 0);

-- Tipos de acción de cobranza (catálogo).
create table tipo_gestion (
  id      smallint generated always as identity primary key,
  nombre  text not null unique,
  activo  boolean not null default true
);
insert into tipo_gestion (nombre) values
  ('Llamada'), ('Correo'), ('WhatsApp'), ('Reunión'), ('Acuerdo de pago'), ('Carta de cobranza'),
  ('Suspensión del servicio'), ('Escalado a gerencia'), ('Proceso legal');

-- Cada acción de cobranza: un hecho que registra tesorería.
create table gestion_cobranza (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references cliente,
  fecha           date not null default current_date,
  tipo_id         smallint not null references tipo_gestion,
  detalle         text not null,
  compromiso_fecha date,                    -- fecha en que el cliente prometió pagar
  compromiso_monto dinero,                  -- en USD
  proximo_paso    text,
  proxima_fecha   date,
  registrado_por  uuid default auth.uid(),
  registrado_en   timestamptz not null default now(),
  anulado_en      timestamptz,
  anulado_motivo  text,
  check ((anulado_en is null) = (anulado_motivo is null))
);
create index on gestion_cobranza (cliente_id, fecha);

-- Mismos permisos y bitácora que el resto (R-80, R-82).
alter table gestion_cobranza enable row level security;
alter table tipo_gestion enable row level security;
create policy lectura on gestion_cobranza for select to authenticated using ((select app_rol() in ('admin', 'tesoreria')));
create policy alta on gestion_cobranza for insert to authenticated with check ((select app_rol() in ('admin', 'tesoreria')));
create policy edicion on gestion_cobranza for update to authenticated
  using ((select app_rol() in ('admin', 'tesoreria'))) with check ((select app_rol() in ('admin', 'tesoreria')));
create policy lectura on tipo_gestion for select to authenticated using ((select app_rol() is not null));
create policy admin on tipo_gestion for all to authenticated using ((select app_rol() = 'admin')) with check ((select app_rol() = 'admin'));
grant select, insert, update on gestion_cobranza to authenticated;
grant select, insert, update, delete on tipo_gestion to authenticated;
revoke all on gestion_cobranza, tipo_gestion from anon;
create trigger gestion_cobranza_auditoria after insert or update or delete on gestion_cobranza
  for each row execute function registrar_auditoria();
create trigger tipo_gestion_auditoria after insert or update or delete on tipo_gestion
  for each row execute function registrar_auditoria();

-- R-81: la gestión también se anula con motivo.
create or replace function anular(p_tabla text, p_id uuid, p_motivo text) returns void language plpgsql as $$
begin
  if p_tabla not in ('venta', 'cuota', 'comprobante', 'pago', 'costo_directo', 'planilla',
                     'herramienta_gasto', 'comision_pago', 'gestion_cobranza') then
    raise exception 'R-81: % no admite anulación', p_tabla;
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'R-81: la anulación requiere motivo'; end if;
  execute format('update %I set anulado_en = now(), anulado_motivo = $1 where id = $2 and anulado_en is null', p_tabla)
    using p_motivo, p_id;
end $$;

create view v_gestion_cobranza with (security_invoker = true) as
select g.id, g.cliente_id, c.razon_social as cliente, g.fecha, t.nombre as tipo, g.detalle,
       g.compromiso_fecha, g.compromiso_monto, g.proximo_paso, g.proxima_fecha,
       u.email as registrado_por, g.registrado_en
from gestion_cobranza g
join cliente c on c.id = g.cliente_id
join tipo_gestion t on t.id = g.tipo_id
left join usuario u on u.id = g.registrado_por
where g.anulado_en is null;
grant select on v_gestion_cobranza to authenticated;
revoke all on v_gestion_cobranza from anon;

-- R-37: clientes con deuda vencida y su última gestión. Moroso = alguna deuda con más de
-- config.morosidad_dias de atraso. Estado de la gestión: sin gestión, compromiso incumplido
-- (pasó la fecha prometida), próximo paso atrasado o en seguimiento.
create view v_morosidad with (security_invoker = true) as
with deuda as (
  select cliente_id, min(cliente) as cliente,
         sum(saldo_usd) filter (where dias_atraso > 0) as vencido_usd,
         sum(saldo_usd) filter (where dias_atraso > (cfg()).morosidad_dias) as moroso_usd,
         max(dias_atraso) as dias_atraso,
         count(distinct comprobante_id) filter (where dias_atraso > 0) as comprobantes_vencidos
  from v_cobranza group by cliente_id
), ultima as (
  select distinct on (cliente_id) * from v_gestion_cobranza order by cliente_id, fecha desc, registrado_en desc
)
select d.cliente_id, d.cliente, d.vencido_usd, coalesce(d.moroso_usd, 0) as moroso_usd, d.dias_atraso,
       d.comprobantes_vencidos, d.dias_atraso > (cfg()).morosidad_dias as moroso,
       u.fecha as ultima_gestion, u.tipo as ultima_tipo, u.detalle as ultima_detalle,
       u.compromiso_fecha, u.compromiso_monto, u.proximo_paso, u.proxima_fecha,
       case
         when u.fecha is null then 'sin_gestion'
         when u.compromiso_fecha < current_date then 'compromiso_incumplido'
         when u.proxima_fecha < current_date then 'seguimiento_atrasado'
         else 'en_gestion'
       end as estado_gestion
from deuda d
left join ultima u on u.cliente_id = d.cliente_id
where d.vencido_usd > 0;
grant select on v_morosidad to authenticated;
revoke all on v_morosidad from anon;

-- Para el dashboard de los tres roles (el CEO no lee tablas operativas, R-80).
create function kpi_morosidad() returns setof v_morosidad language sql stable security definer
set search_path = public as $$ select * from v_morosidad where (select app_rol()) is not null $$;
create view v_kpi_morosidad as select * from kpi_morosidad();
revoke execute on function kpi_morosidad() from public, anon;
grant execute on function kpi_morosidad() to authenticated;
grant select on v_kpi_morosidad to authenticated;
revoke all on v_kpi_morosidad from anon;
