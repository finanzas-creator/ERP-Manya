-- 036 · Lo que viene del sheet no se registra en el ERP (R-71, D-27) y usuarios desde la app (R-83, D-26).

-- ---------------------------------------------------------------- R-71: registro solo en el sheet
alter table config add column datos_desde_sheet boolean not null default true;  -- R-71: decisión del negocio

-- Lo que la app sí registra en tablas que vienen del sheet: columnas que solo viven en el ERP y tablas
-- donde se pueden agregar filas propias. Único lugar de la lista: el disparador la aplica, la app la lee
-- (v_origen_sheet) y aplicar_carga() conserva esos datos (prueba 90_carga).
create function registro_en_erp() returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'columnas', jsonb_build_object(
      'empresa', jsonb_build_array('nombre_comercial', 'direccion_fiscal', 'ubigeo', 'correo', 'telefono', 'cuenta_detracciones'),
      'cuenta_bancaria', jsonb_build_array('numero', 'cci', 'activo'),
      'cliente', jsonb_build_array('ruc', 'tipo_documento', 'direccion_fiscal', 'correo_facturacion'),
      'comprobante', jsonb_build_array('autodetraccion_fecha', 'autodetraccion_operacion', 'autodetraccion_constancia',
                                       'archivo_pdf', 'archivo_xml'),
      'tipo_cambio_mensual', jsonb_build_array('tc', 'fuente')),           -- D-14: TC de los meses sin sheet
    'altas', jsonb_build_array('marca', 'tipo_cambio_mensual'))
$$;

-- R-71: un alta o un cambio hecho desde la app en una tabla del sheet se rechaza, salvo lo de registro_en_erp().
-- La carga (dueño de la base) no pasa por aquí.
create function r71_solo_en_sheet() returns trigger language plpgsql as $$
declare libres text[];
begin
  if current_user <> 'authenticated' or not (cfg()).datos_desde_sheet then return new; end if;
  if tg_op = 'INSERT' then
    if registro_en_erp() -> 'altas' ? tg_table_name then return new; end if;
  else
    libres := array(select jsonb_array_elements_text(coalesce(registro_en_erp() -> 'columnas' -> tg_table_name, '[]')));
    if to_jsonb(new) - libres = to_jsonb(old) - libres then return new; end if;
  end if;
  raise exception 'R-71: esto (%) se registra en el sheet administrativo; el ERP lo trae en la siguiente actualización', tg_table_name;
end $$;

do $$
declare t text;
begin
  foreach t in array tablas_carga() loop
    execute format('create trigger %I before insert or update on %I for each row execute function r71_solo_en_sheet()',
                   t || '_r71', t);
  end loop;
end $$;

-- Para la app: qué tablas vienen del sheet y qué se puede registrar en cada una (vacía si el ERP ya es la fuente).
create view v_origen_sheet with (security_invoker = true) as
select t as tabla,
       coalesce(registro_en_erp() -> 'columnas' -> t, '[]'::jsonb) as columnas_erp,
       registro_en_erp() -> 'altas' ? t as alta_en_erp
from unnest(tablas_carga()) t
where (cfg()).datos_desde_sheet;

grant execute on function tablas_carga(), registro_en_erp() to authenticated;
revoke all on v_origen_sheet from anon, authenticated;
grant select on v_origen_sheet to authenticated;

-- ---------------------------------------------------------------- R-83: usuarios
-- Lista con estado calculado (lee auth.users, por eso es del dueño); solo el Administrador ve filas.
create function listar_usuarios()
returns table (id uuid, email text, nombre text, rol rol, activo boolean, estado text,
               invitado_en timestamptz, ultimo_ingreso timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.email, u.nombre, u.rol, u.activo,
         case when not u.activo then 'desactivado'
              when a.email_confirmed_at is not null or a.last_sign_in_at is not null then 'activo'
              else 'invitado' end,
         a.invited_at, a.last_sign_in_at
  from usuario u
  left join auth.users a on a.id = u.id
  where (select app_rol()) = 'admin'
  order by u.activo desc, u.email
$$;
revoke execute on function listar_usuarios() from public, anon;
grant execute on function listar_usuarios() to authenticated;

-- R-83: siempre queda al menos un Administrador activo.
create function r83_queda_un_admin() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from usuario where rol = 'admin' and activo) then
    raise exception 'R-83: debe quedar al menos un Administrador activo';
  end if;
  return null;
end $$;
revoke execute on function r83_queda_un_admin() from public, anon, authenticated;
create constraint trigger usuario_queda_admin after update or delete on usuario
  for each row execute function r83_queda_un_admin();
