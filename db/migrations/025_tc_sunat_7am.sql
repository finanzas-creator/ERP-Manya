-- 025 · El TC SUNAT se toma cada día a las 7:00 de Lima (12:00 UTC). Un segundo intento a las
-- 10:00 cubre los días en que SUNAT publica tarde; si el TC ya se guardó, solo lo vuelve a escribir.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job where jobname in ('tc-sunat-manana', 'tc-sunat-tarde');
    perform cron.schedule('tc-sunat-7am', '0 12 * * *', 'select actualizar_tc_sunat()');
    perform cron.schedule('tc-sunat-reintento', '0 15 * * *', 'select actualizar_tc_sunat()');
  end if;
end $$;
