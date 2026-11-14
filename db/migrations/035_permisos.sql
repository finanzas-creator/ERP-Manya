-- 035 · Permisos mínimos (R-81). Supabase da por defecto todos los privilegios sobre lo que se crea en
-- public (borrar, vaciar, disparadores) a los roles de la API; la app nunca borra ni vacía.
-- Deja producción igual a lo que definen las migraciones.
do $$
declare t text;
begin
  for t in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm') loop
    execute format('revoke delete, truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Vistas internas: el CEO y la app leen los envoltorios v_kpi_* (R-80); nadie anónimo lee nada.
revoke all on v_kpi_hoy, v_kpi_mes, v_kpi_linea_mes, v_kpi_hoy_calc, v_kpi_mes_calc, v_costo_proveedor_venta from anon;
revoke all on v_kpi_hoy_calc, v_kpi_mes_calc from authenticated;
