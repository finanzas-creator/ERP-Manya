-- 037 · R-70 mientras el sheet sea la fuente (R-71): los meses no se cierran en el ERP.
-- Cada carga reescribe los meses pasados desde el sheet; un mes cerrado aquí haría fallar todas las cargas.
create function r70_sin_cierre_con_sheet() returns trigger language plpgsql as $$
begin
  if (cfg()).datos_desde_sheet then
    raise exception 'R-70: mientras el sheet sea la fuente (R-71), los meses se cierran en el sheet, no en el ERP';
  end if;
  return new;
end $$;
create trigger cierre_mensual_r70_sheet before insert on cierre_mensual
  for each row execute function r70_sin_cierre_con_sheet();
