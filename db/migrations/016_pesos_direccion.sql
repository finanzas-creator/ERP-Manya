-- 016 · Los pesos de Dirección se guardan juntos y deben sumar 100% (R-62, D-16).
create function guardar_pesos_direccion(p_pesos jsonb) returns void language plpgsql as $$
declare total numeric;
begin
  select sum(value::numeric) into total from jsonb_each_text(p_pesos);
  if total is null or abs(total - 1) > 0.0001 then
    raise exception 'R-62: los pesos de Dirección deben sumar 100%% (suman %)', round(coalesce(total, 0) * 100, 2);
  end if;
  update peso_direccion w set peso = (p_pesos ->> w.linea_id::text)::numeric
  where p_pesos ? w.linea_id::text;
end $$;
revoke execute on function guardar_pesos_direccion(jsonb) from public, anon;
grant execute on function guardar_pesos_direccion(jsonb) to authenticated;
