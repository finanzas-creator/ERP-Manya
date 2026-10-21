-- 024 · Consulta de RUC en SUNAT (vía apis.net.pe): devuelve razón social, estado y condición para
-- confirmar los datos del cliente al registrarlo o editarlo. Requiere la extensión http (Supabase).
create function consultar_ruc(p_ruc text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if (select app_rol()) not in ('admin', 'tesoreria') then raise exception 'R-80: sin permiso'; end if;
  if p_ruc !~ '^(10|15|17|20)\d{9}$' then raise exception 'El RUC debe tener 11 dígitos'; end if;
  select status, content into r from extensions.http_get('https://api.apis.net.pe/v1/ruc?numero=' || p_ruc);
  if r.status = 404 then raise exception 'SUNAT no encuentra el RUC %', p_ruc; end if;
  if r.status <> 200 then raise exception 'SUNAT no respondió (%); intenta en un momento', r.status; end if;
  return r.content::jsonb;
end $$;
revoke execute on function consultar_ruc(text) from public, anon;
grant execute on function consultar_ruc(text) to authenticated;
