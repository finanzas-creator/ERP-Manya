-- Reversión en la base del ERP de Manya: quita el valor 'rrhh' que la migración de planillas agregó por
-- error al tipo rol (13/11/2026). Postgres no borra valores de un enum y Supabase no da superusuario,
-- así que se reconstruye el tipo con sus valores originales (admin, tesoreria, ceo) y se vuelven a crear,
-- con su texto exacto, la función app_rol() y las políticas que dependen de él. Todo en una transacción:
-- si algo falla, la base queda como estaba.
begin;

-- Lo que se reconstruye, tal como está hoy
create temp table _pol on commit drop as
  select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname = 'public';
create temp table _fn on commit drop as
  select pg_get_functiondef('public.app_rol()'::regprocedure) as def,
         (select proacl from pg_proc where oid = 'public.app_rol()'::regprocedure) as acl;

do $$
begin
  if exists (select 1 from usuario where rol::text not in ('admin', 'tesoreria', 'ceo')) then
    raise exception 'Hay usuarios con un rol fuera de admin/tesoreria/ceo: no se toca nada';
  end if;
end $$;

alter type public.rol rename to rol_con_rrhh;
create type public.rol as enum ('admin', 'tesoreria', 'ceo');

drop function public.app_rol() cascade;   -- arrastra solo las políticas que la usan; se recrean abajo
alter table public.usuario alter column rol type public.rol using rol::text::public.rol;

-- app_rol() con su definición y permisos originales
do $$
declare d text; a record;
begin
  select replace(def, 'public.rol_con_rrhh', 'public.rol') into d from _fn;
  execute d;
  -- sin permisos explícitos (acl nula) la función nueva ya queda igual; si los tenía, se copian tal cual
  if (select acl from _fn) is not null then
    execute 'revoke all on function public.app_rol() from public';
  end if;
  for a in select (aclexplode(acl)).* from _fn where acl is not null loop
    execute format('grant %s on function public.app_rol() to %s', a.privilege_type,
                   case when a.grantee = 0 then 'public' else quote_ident(a.grantee::regrole::text) end);
  end loop;
end $$;

-- Las políticas que cayeron, con su mismo texto
do $$
declare p record;
begin
  for p in select * from _pol x
           where not exists (select 1 from pg_policies y where y.schemaname = 'public'
                             and y.tablename = x.tablename and y.policyname = x.policyname) loop
    execute format('create policy %I on public.%I as %s for %s to %s%s%s',
      p.policyname, p.tablename, p.permissive, p.cmd,
      (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(p.roles) r),
      case when p.qual is not null then ' using (' || p.qual || ')' else '' end,
      case when p.with_check is not null then ' with check (' || p.with_check || ')' else '' end);
  end loop;
end $$;

-- Si algo siguiera usando el tipo anterior, esto falla y se revierte todo
drop type public.rol_con_rrhh;

do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public') <> (select count(*) from _pol) then
    raise exception 'El número de políticas no coincide: no se toca nada';
  end if;
  if exists (select 1 from _pol x left join pg_policies y on y.schemaname = 'public' and y.tablename = x.tablename and y.policyname = x.policyname
             where y.policyname is null or y.cmd <> x.cmd or y.roles <> x.roles or y.permissive <> x.permissive
                or y.qual is distinct from x.qual or y.with_check is distinct from x.with_check) then
    raise exception 'Alguna política quedó distinta: no se toca nada';
  end if;
end $$;

commit;
