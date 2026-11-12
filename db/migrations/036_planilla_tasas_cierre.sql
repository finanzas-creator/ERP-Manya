-- 036 · Planillas: tasas AFP de la SBS automáticas (R-102) y cierre con boletas emitidas (R-123).

-- ---------- Tasas AFP ----------
-- Número como lo publica la SBS: "1,47", "12 732,70", "12,732.70".
create function sbs_numero(p text) returns numeric language plpgsql immutable as $$
declare s text := regexp_replace(coalesce(p, ''), '[\s%]', '', 'g'); coma int; punto int;
begin
  if s !~ '^\d+([.,]\d+)*$' then raise exception 'Número de la SBS no reconocible: %', p; end if;
  coma := length(s) - position(',' in reverse(s)) + 1;
  punto := length(s) - position('.' in reverse(s)) + 1;
  if position(',' in s) > 0 and position('.' in s) > 0 then
    if coma > punto then s := replace(replace(s, '.', ''), ',', '.'); else s := replace(s, ',', ''); end if;
  elsif position(',' in s) > 0 then
    s := replace(s, ',', '.');
  end if;
  return s::numeric;
end $$;

-- Lee la tabla "Comisiones y primas" de la SBS. Exige el mes de devengue, las 4 AFP en una fila
-- cada una y que aporte, prima y remuneración máxima sean iguales para todas. Nunca extrapola.
create function parsear_tasas_sbs(p_html text)
returns table (periodo date, codigo text, comision_flujo numeric, comision_saldo numeric, prima numeric,
               aporte numeric, remuneracion_maxima numeric)
language plpgsql immutable as $$
declare
  t text; m text[]; per date; a record; ent record; fila text[]; n int; comun text;
  pct constant text := '(\d+(?:[.,]\d+)?)\s*%';
  monto constant text := '((?:\d{1,3}(?:[ .]\d{3})+|\d+),\d{2}|(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})';
begin
  if p_html is null or length(trim(p_html)) = 0 then raise exception 'La SBS devolvió una respuesta vacía'; end if;
  if p_html ~* '_Incapsula_Resource|captcha|access denied|request unsuccessful|verify (that )?you are human|cf-chl-' then
    raise exception 'La SBS devolvió un bloqueo de acceso; no se actualizaron tasas';
  end if;
  t := regexp_replace(p_html, '<script\b[^>]*>.*?</script>', ' ', 'gi');
  t := regexp_replace(t, '<style\b[^>]*>.*?</style>', ' ', 'gi');
  t := regexp_replace(t, '<[^>]+>', ' ', 'g');
  t := replace(replace(replace(t, '&nbsp;', ' '), '&#160;', ' '), '&amp;', '&');
  for ent in select * from (values ('aacute', 'á'), ('eacute', 'é'), ('iacute', 'í'), ('oacute', 'ó'), ('uacute', 'ú'),
                                   ('Aacute', 'Á'), ('Eacute', 'É'), ('Iacute', 'Í'), ('Oacute', 'Ó'), ('Uacute', 'Ú'),
                                   ('ntilde', 'ñ'), ('Ntilde', 'Ñ')) as x(nombre, letra) loop
    t := replace(t, '&' || ent.nombre || ';', ent.letra);
  end loop;
  t := regexp_replace(t, '\s+', ' ', 'g');
  m := regexp_match(t, 'mes de devengue\s*:?\s*(\d{4})\s*[-/]\s*(\d{2})', 'i');
  if m is null then raise exception 'No se identificó el mes de devengue en la tabla de la SBS'; end if;
  per := make_date(m[1]::int, m[2]::int, 1);
  if t !~* 'APORTE OBLIGATORIO' or t !~* 'FLUJO' or t !~* 'SALDO' or t !~* 'REMUNERACI(O|Ó)N M(A|Á)XIMA' then
    raise exception 'La estructura de la tabla de la SBS cambió o está incompleta';
  end if;
  for a in select x.codigo from afp x order by x.id loop
    select count(*) into n from regexp_matches(t, '\m' || a.codigo || '\s+' || pct || '\s+' || pct || '\s+' || pct || '\s+' || pct || '\s+' || monto || '(?![\d.,])', 'gi');
    if n <> 1 then raise exception 'Se esperaba una única fila completa de % en la tabla de la SBS', a.codigo; end if;
    fila := regexp_match(t, '\m' || a.codigo || '\s+' || pct || '\s+' || pct || '\s+' || pct || '\s+' || pct || '\s+' || monto || '(?![\d.,])', 'i');
    periodo := per; codigo := a.codigo;
    comision_flujo := sbs_numero(fila[1]); comision_saldo := sbs_numero(fila[2]); prima := sbs_numero(fila[3]);
    aporte := sbs_numero(fila[4]); remuneracion_maxima := sbs_numero(fila[5]);
    -- aporte, prima y remuneración máxima son únicos para el sistema: si difieren, se revisa a mano
    if comun is not null and comun <> format('%s|%s|%s', aporte, prima, remuneracion_maxima) then
      raise exception 'La tabla de la SBS presenta diferencias entre AFP que requieren revisión';
    end if;
    comun := format('%s|%s|%s', aporte, prima, remuneracion_maxima);
    return next;
  end loop;
end $$;

-- Registra las tasas de un mes (en %: 10 = 10%). Una por AFP, con su sustento. No cambia un mes
-- con planilla cerrada.
create function registrar_tasas_afp(p_periodo date, p_tasas jsonb, p_fuente text, p_sustento text) returns text
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; afp_id_ smallint;
begin
  if auth.uid() is not null and (select app_rol()) is distinct from 'admin' then
    raise exception 'R-125: solo el administrador registra tasas AFP';
  end if;
  p_periodo := date_trunc('month', p_periodo)::date;
  if coalesce(trim(p_sustento), '') = '' then raise exception 'Indica el sustento de las tasas (tabla SBS del mes)'; end if;
  if exists (select 1 from planilla_cierre where periodo = p_periodo) then
    raise exception 'R-123: hay planillas cerradas en %; reábrelas antes de cambiar sus tasas', to_char(p_periodo, 'MM/YYYY');
  end if;
  for r in select * from jsonb_array_elements(p_tasas) loop
    select id into afp_id_ from afp where codigo = upper(r ->> 'codigo');
    if afp_id_ is null then raise exception 'AFP desconocida: %', r ->> 'codigo'; end if;
    if (r ->> 'aporte')::numeric not between 0.01 and 30 or (r ->> 'prima')::numeric not between 0 and 10
       or (r ->> 'comision_flujo')::numeric not between 0 and 10 or (r ->> 'remuneracion_maxima')::numeric <= 0 then
      raise exception 'Tasas fuera de rango para %', r ->> 'codigo';
    end if;
    insert into tasa_afp (periodo, afp_id, aporte, prima, comision_flujo, comision_mixta, comision_saldo, remuneracion_maxima, fuente, sustento)
    values (p_periodo, afp_id_, (r ->> 'aporte')::numeric / 100, (r ->> 'prima')::numeric / 100,
            (r ->> 'comision_flujo')::numeric / 100, coalesce((r ->> 'comision_mixta')::numeric, 0) / 100,
            (r ->> 'comision_saldo')::numeric / 100, (r ->> 'remuneracion_maxima')::numeric, p_fuente, p_sustento)
    on conflict (periodo, afp_id) do update set aporte = excluded.aporte, prima = excluded.prima,
      comision_flujo = excluded.comision_flujo, comision_mixta = excluded.comision_mixta, comision_saldo = excluded.comision_saldo,
      remuneracion_maxima = excluded.remuneracion_maxima, fuente = excluded.fuente, sustento = excluded.sustento, registrado_en = now()
    where (tasa_afp.aporte, tasa_afp.prima, tasa_afp.comision_flujo, tasa_afp.comision_mixta, tasa_afp.remuneracion_maxima, tasa_afp.fuente)
          is distinct from (excluded.aporte, excluded.prima, excluded.comision_flujo, excluded.comision_mixta, excluded.remuneracion_maxima, excluded.fuente);
    n := n + 1;
  end loop;
  if n <> (select count(*) from afp) then raise exception 'Registra las tasas de las % AFP', (select count(*) from afp); end if;
  return format('Tasas AFP de %s registradas (%s)', to_char(p_periodo, 'MM/YYYY'), p_fuente);
end $$;

-- Toma la tabla vigente de la SBS (la del mes de devengue en curso). La ejecuta el cron diario o el
-- administrador desde Parámetros. Requiere la extensión http (Supabase).
create function actualizar_tasas_afp() returns text language plpgsql security definer set search_path = public as $$
declare r record; filas jsonb; per date;
  url constant text := 'https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/Paginas/comision_prima.aspx';
begin
  if auth.uid() is not null and (select app_rol()) is distinct from 'admin' then
    raise exception 'R-125: solo el administrador actualiza tasas AFP';
  end if;
  select status, content into r from extensions.http_get(url);
  if r.status <> 200 then return format('La SBS no respondió (%s); registra las tasas a mano', r.status); end if;
  select min(p.periodo), jsonb_agg(jsonb_build_object('codigo', p.codigo, 'aporte', p.aporte, 'prima', p.prima,
           'comision_flujo', p.comision_flujo, 'comision_mixta', 0, 'comision_saldo', p.comision_saldo,
           'remuneracion_maxima', p.remuneracion_maxima))
    into per, filas from parsear_tasas_sbs(r.content) p;
  if exists (select 1 from planilla_cierre where periodo = per) then
    return format('La SBS publica %s, pero ya hay planillas cerradas de ese mes: no se cambian', to_char(per, 'MM/YYYY'));
  end if;
  return registrar_tasas_afp(per, filas, 'sbs', 'Tabla SBS "Comisiones y primas" devengue ' || to_char(per, 'YYYY-MM') || ', ' || url);
exception when others then
  return 'No se actualizaron las tasas: ' || sqlerrm;
end $$;

revoke execute on function registrar_tasas_afp(date, jsonb, text, text), actualizar_tasas_afp(), parsear_tasas_sbs(text), sbs_numero(text) from public, anon;
grant execute on function registrar_tasas_afp(date, jsonb, text, text), actualizar_tasas_afp(), parsear_tasas_sbs(text), sbs_numero(text) to authenticated;

-- Cron diario (solo donde hay pg_cron y http, es decir en Supabase): 8:20 de Lima. Si la SBS ya
-- publicó el mes, se registra; si no cambió, no hace nada.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'http') then
    perform cron.schedule('tasas-afp-sbs', '20 13 * * *', 'select actualizar_tasas_afp()');
  end if;
end $$;

-- ---------- Cierre de planilla y boletas (R-123) ----------
create function cerrar_planilla(p_empleador smallint, p_periodo date) returns int
language plpgsql security definer set search_path = public as $$
declare n int; obs text;
begin
  if coalesce((select app_rol()) in ('admin', 'tesoreria'), false) is false then raise exception 'R-125: sin permiso'; end if;
  p_periodo := date_trunc('month', p_periodo)::date;
  if exists (select 1 from planilla_cierre where empleador_id = p_empleador and periodo = p_periodo) then
    raise exception 'La planilla de % ya está cerrada', to_char(p_periodo, 'MM/YYYY');
  end if;
  select string_agg(distinct coalesce(apellidos_nombres || ': ', '') || mensaje, ' · ') into obs
  from v_pl_observacion where empleador_id = p_empleador and periodo = p_periodo and bloquea;
  if obs is not null then raise exception 'R-123: resuelve antes de cerrar · %', obs; end if;

  insert into planilla_cierre (empleador_id, periodo) values (p_empleador, p_periodo);
  insert into boleta (empleador_id, periodo, trabajador_id, datos, neto, retencion_quinta)
  select p.empleador_id, p.periodo, p.trabajador_id,
         jsonb_build_object(
           'empleador', (select jsonb_build_object('razon_social', e.razon_social, 'ruc', e.ruc, 'direccion', e.direccion)
                         from empleador e where e.id = p.empleador_id),
           'cabecera', to_jsonb(p) - 'boleta_id' - 'neto_emitido' - 'entregada_en' - 'cerrada',
           'lineas', (select coalesce(jsonb_agg(jsonb_build_object('concepto', l.concepto, 'nombre', l.nombre, 'tipo', l.tipo,
                                                                    'plame', l.plame, 'cantidad', l.cantidad, 'monto', l.monto)
                                                 order by l.orden), '[]')
                      from v_boleta_linea l where l.trabajador_id = p.trabajador_id and l.periodo = p.periodo)),
         p.neto,
         coalesce((select q.retencion from v_pl_quinta q where q.trabajador_id = p.trabajador_id and q.periodo = p.periodo), 0)
  from v_planilla p
  where p.empleador_id = p_empleador and p.periodo = p_periodo;
  get diagnostics n = row_count;
  return n;
end $$;

create function reabrir_planilla(p_empleador smallint, p_periodo date, p_motivo text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if (select app_rol()) is distinct from 'admin' then raise exception 'R-123: solo el administrador reabre una planilla'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo para reabrir'; end if;
  p_periodo := date_trunc('month', p_periodo)::date;
  update boleta set anulado_en = now(), anulado_motivo = p_motivo
  where empleador_id = p_empleador and periodo = p_periodo and anulado_en is null;
  get diagnostics n = row_count;
  delete from planilla_cierre where empleador_id = p_empleador and periodo = p_periodo;
  return n;
end $$;

revoke execute on function cerrar_planilla(smallint, date), reabrir_planilla(smallint, date, text) from public, anon;
grant execute on function cerrar_planilla(smallint, date), reabrir_planilla(smallint, date, text) to authenticated;
