-- 001 · Base del sistema Planillas: tipos, usuarios y roles, bitácora y anulación (R-27, R-28, R-29).
-- Sistema independiente: no comparte base, usuarios ni datos con ningún otro ERP.

create domain dinero as numeric(18,6);
create domain porcentaje as numeric(7,6) check (value >= 0 and value <= 1);
create domain mes as date check (extract(day from value) = 1);

create type tipo_documento as enum ('DNI', 'CE', 'PASAPORTE');
create type rol as enum ('admin', 'rrhh');            -- R-26: administrador · recursos humanos

-- Usuarios (id = auth.users.id en Supabase).
create table usuario (
  id      uuid primary key,
  email   text not null unique,
  nombre  text,
  rol     rol not null,
  activo  boolean not null default true
);

-- Rol del usuario autenticado (activo).
create function app_rol() returns rol language sql stable security definer set search_path = public as $$
  select rol from usuario where id = auth.uid() and activo
$$;

-- R-26: operan planillas el administrador y recursos humanos (incluido el usuario de integración).
create function opera_planilla() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(app_rol() in ('admin', 'rrhh'), false)
$$;

-- Usuario de la sesión (para la app).
create function yo() returns usuario language sql stable security definer set search_path = public as $$
  select * from usuario where id = auth.uid() and activo
$$;

-- R-29: bitácora de todo cambio (quién, cuándo, antes y después).
create table auditoria (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  text not null,
  accion       text not null,
  antes        jsonb,
  despues      jsonb,
  usuario_id   uuid,
  en           timestamptz not null default now()
);

create function registrar_auditoria() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (tabla, registro_id, accion, antes, despues, usuario_id)
  values (tg_table_name,
          coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'), (to_jsonb(new) ->> 'trabajador_id'), (to_jsonb(old) ->> 'trabajador_id'), ''),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

alter table usuario enable row level security;
create policy lectura on usuario for select to authenticated using ((select app_rol() is not null));
create policy admin on usuario for all to authenticated using ((select app_rol() = 'admin')) with check ((select app_rol() = 'admin'));
grant select, insert, update on usuario to authenticated;
create trigger usuario_auditoria after insert or update or delete on usuario for each row execute function registrar_auditoria();

alter table auditoria enable row level security;
create policy lectura on auditoria for select to authenticated using ((select app_rol() = 'admin'));
grant select on auditoria to authenticated;

revoke all on usuario, auditoria from anon;
revoke execute on function app_rol(), opera_planilla(), yo() from public, anon;
grant execute on function app_rol(), opera_planilla(), yo() to authenticated;

-- R-28: nada se borra; los registros se anulan con motivo (queda en la bitácora).
create function anular(p_tabla text, p_id uuid, p_motivo text) returns void language plpgsql as $$
begin
  if p_tabla not in ('trabajador', 'remuneracion', 'concepto_fijo', 'ausencia', 'asistencia_dia', 'movimiento', 'quinta_previa') then
    raise exception 'R-28: % no admite anulación', p_tabla;
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'R-28: la anulación requiere motivo'; end if;
  execute format('update %I set anulado_en = now(), anulado_motivo = $1 where id = $2 and anulado_en is null', p_tabla)
    using p_motivo, p_id;
end $$;
revoke execute on function anular(text, uuid, text) from public, anon;
grant execute on function anular(text, uuid, text) to authenticated;
