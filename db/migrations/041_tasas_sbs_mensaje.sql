-- 041 · R-102: la SBS bloquea consultas automatizadas (redirecciones de su protección anti-bots). El
-- intento diario sigue, pero si falla el mensaje dice qué hacer: registrar las tasas del mes a mano.
create or replace function actualizar_tasas_afp() returns text language plpgsql security definer set search_path = public as $$
declare r record; filas jsonb; per date;
  url constant text := 'https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/Paginas/comision_prima.aspx';
begin
  if auth.uid() is not null and (select app_rol()) is distinct from 'admin' then
    raise exception 'R-125: solo el administrador actualiza tasas AFP';
  end if;
  select status, content into r from extensions.http_get(url);
  if r.status <> 200 then
    return format('La SBS no respondió (%s): registra las tasas del mes a mano con la tabla publicada en sbs.gob.pe', r.status);
  end if;
  select min(p.periodo), jsonb_agg(jsonb_build_object('codigo', p.codigo, 'aporte', p.aporte, 'prima', p.prima,
           'comision_flujo', p.comision_flujo, 'comision_mixta', 0, 'comision_saldo', p.comision_saldo,
           'remuneracion_maxima', p.remuneracion_maxima))
    into per, filas from parsear_tasas_sbs(r.content) p;
  if exists (select 1 from planilla_cierre where periodo = per) then
    return format('La SBS publica %s, pero ya hay planillas cerradas de ese mes: no se cambian', to_char(per, 'MM/YYYY'));
  end if;
  return registrar_tasas_afp(per, filas, 'sbs', 'Tabla SBS "Comisiones y primas" devengue ' || to_char(per, 'YYYY-MM') || ', ' || url);
exception when others then
  return 'La SBS no permitió la consulta automática (' || sqlerrm || '). Registra las tasas del mes a mano: '
      || 'Parámetros → Tasas AFP → Registrar tasas, con la tabla publicada en sbs.gob.pe.';
end $$;
