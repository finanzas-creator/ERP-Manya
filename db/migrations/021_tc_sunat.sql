-- 021 · Tipo de cambio SUNAT (R-06, D-14): cada día se guarda el TC compra/venta publicado por
-- SUNAT y el TC del mes en curso pasa a ser el de venta más reciente (al cerrar el mes, el del
-- último día publicado). Un TC corregido a mano no se sobrescribe. Los meses ya migrados quedan
-- con su TC (conciliado con el sheet).

-- Hecho externo: lo que SUNAT publicó cada día.
create table tipo_cambio_sunat (
  fecha        date primary key,
  compra       numeric(10,4) not null check (compra > 0),
  venta        numeric(10,4) not null check (venta > 0),
  obtenido_en  timestamptz not null default now()
);
alter table tipo_cambio_sunat enable row level security;
create policy lectura on tipo_cambio_sunat for select to authenticated using ((select app_rol() is not null));
grant select on tipo_cambio_sunat to authenticated;
revoke all on tipo_cambio_sunat from anon;

-- De dónde salió el TC de cada mes: 'sunat' (automático) o 'manual' (corregido por el administrador).
-- Vacío = migrado del sheet.
alter table tipo_cambio_mensual add column fuente text check (fuente in ('sunat', 'manual'));

-- Registra el TC publicado un día y actualiza el TC de su mes, salvo que sea manual o del sheet.
create function registrar_tc_sunat(p_fecha date, p_compra numeric, p_venta numeric) returns text
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and app_rol() is distinct from 'admin' then
    raise exception 'R-80: solo el administrador actualiza el tipo de cambio';
  end if;
  insert into tipo_cambio_sunat (fecha, compra, venta) values (p_fecha, p_compra, p_venta)
  on conflict (fecha) do update set compra = excluded.compra, venta = excluded.venta, obtenido_en = now();
  begin
    insert into tipo_cambio_mensual (periodo, tc, fuente) values (date_trunc('month', p_fecha)::date, p_venta, 'sunat')
    on conflict (periodo) do update set tc = excluded.tc, fuente = 'sunat'
      where tipo_cambio_mensual.fuente = 'sunat';
  exception when raise_exception then   -- R-70: mes cerrado; su TC ya no cambia
    return format('TC venta %s del %s guardado; el mes está cerrado', p_venta, p_fecha);
  end;
  return format('TC venta %s del %s', p_venta, p_fecha);
end $$;

-- Consulta el TC del día (apis.net.pe replica el publicado por SUNAT). Requiere la extensión
-- http (Supabase); la ejecuta el cron diario o el administrador desde Configuración.
create function actualizar_tc_sunat() returns text language plpgsql security definer set search_path = public as $$
declare r record; j jsonb;
begin
  select status, content into r from extensions.http_get('https://api.apis.net.pe/v1/tipo-cambio-sunat');
  if r.status <> 200 then return format('SUNAT no respondió (%s)', r.status); end if;
  j := r.content::jsonb;
  return registrar_tc_sunat((j ->> 'fecha')::date, (j ->> 'compra')::numeric, (j ->> 'venta')::numeric);
end $$;
revoke execute on function actualizar_tc_sunat(), registrar_tc_sunat(date, numeric, numeric) from public, anon;
grant execute on function actualizar_tc_sunat(), registrar_tc_sunat(date, numeric, numeric) to authenticated;

-- Cron diario (solo donde existe pg_cron, es decir en Supabase): 8:05 y 13:05 hora de Lima.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'http') then
    create extension if not exists http with schema extensions;
    create extension if not exists pg_cron;
    perform cron.schedule('tc-sunat-manana', '5 13 * * *', 'select actualizar_tc_sunat()');
    perform cron.schedule('tc-sunat-tarde', '5 18 * * *', 'select actualizar_tc_sunat()');
  end if;
end $$;
