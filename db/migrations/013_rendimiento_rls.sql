-- 013 · Rendimiento de permisos (R-80). Mismos permisos; solo cambia cómo se evalúan.
--
-- 1) La condición de cada política se escribe como (select <condición>): Postgres la evalúa
--    una vez por consulta y la estima como verdadera o falsa para toda la tabla. Escrita como
--    app_rol() in (...) se evaluaba por fila y el planificador suponía que descartaba casi
--    todas las filas: elegía recorridos anidados (la lista de ventas tardaba 19 s).
-- 2) cfg() y tc_de() leen catálogos que todo usuario activo ya puede leer; como security
--    definer no repiten la verificación de permisos en cada fila de cada vista.
do $$
declare
  t text;
  operativas text[] := array['cliente','marca','servicio_contratado','venta','costo_directo',
                             'comprobante','cuota','pago','planilla','herramienta_gasto','comision_pago'];
  catalogos text[]  := array['config','empresa','linea_negocio','categoria','servicio','equipo','persona',
                             'cuenta_bancaria','plantilla_pago','plantilla_pago_item','tipo_cambio_mensual',
                             'sub_area','peso_direccion','cierre_mensual','usuario'];
  opera constant text := '(select app_rol() in (''admin'',''tesoreria''))';
  activo constant text := '(select app_rol() is not null)';
  admin constant text := '(select app_rol() = ''admin'')';
begin
  foreach t in array operativas loop
    execute format('alter policy lectura on %I using (%s)', t, opera);
    execute format('alter policy alta on %I with check (%s)', t, opera);
    execute format('alter policy edicion on %I using (%s) with check (%s)', t, opera, opera);
  end loop;
  foreach t in array catalogos loop
    execute format('alter policy lectura on %I using (%s)', t, activo);
    execute format('alter policy admin on %I using (%s) with check (%s)', t, admin, admin);
  end loop;
  execute format('alter policy lectura on auditoria using (%s)', admin);
end $$;

alter function cfg() security definer set search_path = public;
alter function tc_de(date) security definer set search_path = public;
revoke execute on function cfg(), tc_de(date) from public, anon;
grant execute on function cfg(), tc_de(date) to authenticated;
