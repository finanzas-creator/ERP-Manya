-- 003 · Planillas: cálculo (R-01…R-25). Todo número de planilla sale de estas funciones y vistas.
-- Orden: utilidades de fechas → datos vigentes del trabajador → días del mes → líneas → bases →
-- quinta → boleta → beneficios (grati, CTS, vacaciones) → provisiones → liquidación → observaciones.

-- ---------- Fechas (R-04) ----------
create function fin_mes(m date) returns date language sql immutable as $$
  select (date_trunc('month', m) + interval '1 month - 1 day')::date
$$;

-- Días laborales de un tramo dentro de un mismo mes: mes completo = 30; parcial = días calendario (máx. 30).
create function dias_tramo(p_desde date, p_hasta date) returns int language sql immutable as $$
  select case when p_hasta < p_desde then 0
              when p_desde = date_trunc('month', p_desde)::date and p_hasta = fin_mes(p_desde) then 30
              else least(30, p_hasta - p_desde + 1) end
$$;

-- Días laborales entre dos fechas cualesquiera: suma de cada mes con la regla anterior.
create function dias_laborales(p_desde date, p_hasta date)
returns int
language plpgsql immutable as $$
#variable_conflict use_column
begin
  return (
  select coalesce(sum(dias_tramo(greatest(p_desde, m::date), least(p_hasta, fin_mes(m::date)))), 0)::int
  from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') m
  where p_hasta >= p_desde
  );
end
$$;

-- Meses calendario completos entre dos fechas (R-17).
create function meses_completos(p_desde date, p_hasta date)
returns int
language plpgsql immutable as $$
#variable_conflict use_column
begin
  return (
  select count(*)::int
  from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') m
  where p_hasta >= p_desde and m::date >= p_desde and fin_mes(m::date) <= p_hasta
  );
end
$$;

-- Inicio del semestre de gratificación (ene–jun, jul–dic) y de CTS (nov–abr, may–oct) de una fecha.
create function semestre_grati(f date) returns date language sql immutable as $$
  select (date_trunc('year', f) + case when extract(month from f) >= 7 then interval '6 months' else interval '0' end)::date
$$;
create function semestre_cts(f date) returns date language sql immutable as $$
  select case when extract(month from f) >= 11 then make_date(extract(year from f)::int, 11, 1)
              when extract(month from f) >= 5 then make_date(extract(year from f)::int, 5, 1)
              else make_date(extract(year from f)::int - 1, 11, 1) end
$$;

-- ---------- Datos vigentes del trabajador en una fecha ----------
-- R-01: pactado → REMYPE vigente a la fecha si ingresó después de la inscripción → general.
create function regimen_en(p_t uuid, f date)
returns regimen_laboral
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  -- la inscripción vigente cuenta desde el inicio de su cadena continua (renovaciones o cambio de categoría)
  with recursive cadena as (
    select r.desde, r.categoria from empleador_remype r join trabajador t on t.empleador_id = r.empleador_id
    where t.id = p_t and r.desde <= f and (r.hasta is null or r.hasta >= f)
    union
    select r.desde, c.categoria from cadena c join empleador_remype r on r.desde < c.desde and r.hasta >= c.desde - 1
    join trabajador t on t.empleador_id = r.empleador_id and t.id = p_t
  )
  select coalesce(t.regimen_pactado,
           (select (array_agg(c.categoria))[1] from cadena c having t.fecha_ingreso >= min(c.desde)),
           'general')
  from trabajador t where t.id = p_t
  );
end
$$;

create function sueldo_en(p_t uuid, f date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select sueldo_basico from remuneracion
  where trabajador_id = p_t and anulado_en is null and vigente_desde <= f
  order by vigente_desde desc limit 1
  );
end
$$;

-- R-06: sueldo de un tramo del mes ponderado por los días de cada sueldo vigente (base 30).
create function sueldo_mes(p_t uuid, p_desde date, p_hasta date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select sum(x.sueldo * x.d) / nullif(sum(x.d), 0)
  from (
    select r.sueldo_basico as sueldo,
           case when least(coalesce(r.siguiente - 1, p_hasta), p_hasta) = fin_mes(p_desde)
                then 30 - extract(day from greatest(r.vigente_desde, p_desde))::int + 1
                else least(coalesce(r.siguiente - 1, p_hasta), p_hasta) - greatest(r.vigente_desde, p_desde) + 1 end as d
    from (select vigente_desde, sueldo_basico, lead(vigente_desde) over (order by vigente_desde) as siguiente
          from remuneracion where trabajador_id = p_t and anulado_en is null) r
    where r.vigente_desde <= p_hasta and (r.siguiente is null or r.siguiente > p_desde)
  ) x where x.d > 0
  );
end
$$;

-- R-02, R-20: días de vacaciones por año del régimen (0 con jornada menor a la mínima).
create function vacaciones_dias_en(p_t uuid, f date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select case when t.jornada_horas >= legal('jornada_minima_horas', f) then rd.vacaciones_dias else 0 end
  from trabajador t join regimen_derecho rd on rd.regimen = regimen_en(p_t, f) where t.id = p_t
  );
end
$$;

-- R-06: 10% de la RMV vigente, si el trabajador la tiene registrada.
create function asig_familiar_en(p_t uuid, f date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select case when t.asignacion_familiar then round(legal('asignacion_familiar', f) * legal('rmv', f), 2) else 0 end
  from trabajador t where t.id = p_t
  );
end
$$;

-- Conceptos fijos del mes de la fecha: los computables para beneficios (R-16) o los afectos a quinta (R-14).
create function fijos_en(p_t uuid, f date, p_solo_computables boolean)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select coalesce(sum(cf.monto), 0)
  from concepto_fijo cf join concepto_planilla c on c.codigo = cf.concepto
  where cf.trabajador_id = p_t and cf.anulado_en is null
    and cf.desde <= date_trunc('month', f) and (cf.hasta is null or cf.hasta >= date_trunc('month', f))
    and case when p_solo_computables then c.computable else c.afecto_quinta end
  );
end
$$;

-- Días de ausencia de un trabajador entre dos fechas, por efecto (R-05). Se cuentan con R-04.
create function ausencias_en(p_t uuid, p_desde date, p_hasta date)
returns table (dias int, no_sueldo int, no_pagados int, vacaciones int, subsidiados int,
               no_cts int, no_grati int, no_vacaciones int, descanso_medico int, reducen_descanso int)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select coalesce(sum(x.d), 0)::int,
         coalesce(sum(x.d) filter (where ta.concepto_pago is distinct from 'SUELDO'), 0)::int,
         coalesce(sum(x.d) filter (where ta.concepto_pago is null), 0)::int,
         coalesce(sum(x.d) filter (where ta.es_vacaciones), 0)::int,
         coalesce(sum(x.d) filter (where ta.concepto_pago is not null and not c.afecto_essalud), 0)::int,
         coalesce(sum(x.d) filter (where not ta.computable_cts), 0)::int,
         coalesce(sum(x.d) filter (where not ta.computable_grati), 0)::int,
         coalesce(sum(x.d) filter (where not ta.computable_vacaciones), 0)::int,
         coalesce(sum(x.d) filter (where ta.es_descanso_medico), 0)::int,
         coalesce(sum(x.d) filter (where ta.reduce_descanso_semanal), 0)::int
  from ausencia a
  join tipo_ausencia ta on ta.codigo = a.tipo
  left join concepto_planilla c on c.codigo = ta.concepto_pago
  cross join lateral (select dias_tramo(greatest(a.desde, p_desde), least(a.hasta, p_hasta)) as d) x
  where a.trabajador_id = p_t and a.anulado_en is null and a.desde <= p_hasta and a.hasta >= p_desde;
end
$$;

create view v_trabajador with (security_invoker = true) as
select t.id, t.empleador_id, e.razon_social as empleador, t.codigo_externo, t.tipo_documento, t.numero_documento,
       t.apellidos_nombres, t.cargo, t.fecha_ingreso, t.fecha_cese, t.motivo_cese, mc.nombre as motivo_cese_nombre,
       t.sistema_pension, t.afp_id, a.nombre as afp, t.comision_afp, t.cuspp, t.asignacion_familiar, t.salud,
       t.jornada_horas, t.regimen_pactado, t.fecha_nacimiento, t.fecha_fin_contrato, t.periodo_prueba_meses,
       t.domiciliado, t.banco, t.cuenta_sueldo, t.banco_cts, t.cuenta_cts, t.correo,
       regimen_en(t.id, least(coalesce(t.fecha_cese, current_date), current_date)) as regimen,
       sueldo_en(t.id, least(coalesce(t.fecha_cese, current_date), current_date)) as sueldo_basico,
       case when t.fecha_cese is not null and t.fecha_cese < current_date then 'cesado' else 'activo' end as estado
from trabajador t
join empleador e on e.id = t.empleador_id
left join afp a on a.id = t.afp_id
left join motivo_cese mc on mc.codigo = t.motivo_cese
where t.anulado_en is null;

-- ---------- Cada trabajador y mes (R-04…R-10) ----------
-- Desde el primer mes del empleador en el sistema (o el ingreso) hasta el cese o el mes siguiente a hoy.
create view v_pl_mes with (security_invoker = true) as
select g.trabajador_id, g.empleador_id, g.periodo, g.desde, g.hasta, g.dias_vinculo,
       least(g.dias_vinculo, au.dias) as dias_ausencia,
       -- ausencias que juntas cubren todo el vínculo del mes cuentan todos sus días (R-04)
       case when au.no_sueldo >= g.hasta - g.desde + 1 then 0 else greatest(0, g.dias_vinculo - au.no_sueldo) end as dias_sueldo,
       case when au.no_pagados >= g.hasta - g.desde + 1 then g.dias_vinculo else least(g.dias_vinculo, au.no_pagados) end as dias_no_pagados,
       least(g.dias_vinculo, au.vacaciones) as dias_vacaciones,
       least(g.dias_vinculo, au.subsidiados) as dias_subsidiados,
       least(g.dias_vinculo, au.no_cts) as dias_no_cts,
       least(g.dias_vinculo, au.no_vacaciones) as dias_no_vacaciones,
       au.descanso_medico as dias_descanso_medico, au.reducen_descanso as dias_reducen_descanso,
       regimen_en(g.trabajador_id, g.hasta) as regimen,
       sueldo_en(g.trabajador_id, g.hasta) as sueldo_basico,
       asig_familiar_en(g.trabajador_id, g.hasta) as asig_familiar,
       legal('rmv', g.hasta) as rmv,
       coalesce(g.periodo = date_trunc('month', g.fecha_cese), false) as mes_cese
from (
  select t.id as trabajador_id, t.empleador_id, t.fecha_cese, m::date as periodo,
         greatest(t.fecha_ingreso, m::date) as desde,
         least(coalesce(t.fecha_cese, fin_mes(m::date)), fin_mes(m::date)) as hasta,
         dias_tramo(greatest(t.fecha_ingreso, m::date), least(coalesce(t.fecha_cese, fin_mes(m::date)), fin_mes(m::date))) as dias_vinculo
  from trabajador t
  join empleador e on e.id = t.empleador_id
  cross join lateral generate_series(greatest(date_trunc('month', t.fecha_ingreso), e.inicio_planilla),
                                     date_trunc('month', coalesce(t.fecha_cese, (current_date + interval '1 month')::date)),
                                     interval '1 month') m
  where t.anulado_en is null
) g
cross join lateral ausencias_en(g.trabajador_id, g.desde, g.hasta) au;

-- Horas extra, feriados trabajados y tardanzas del mes, valorizados (R-08, R-09, R-10).
create view v_pl_asistencia_mes with (security_invoker = true) as
select x.trabajador_id, x.periodo, x.h25, x.h35, x.dias_feriado, x.minutos_tardanza,
       round(x.valor_dia, 6) as valor_dia, round(x.valor_dia / x.jornada_horas, 6) as valor_hora,
       round(x.valor_dia / x.jornada_horas * 1.25 * x.h25, 2) as monto_he25,
       round(x.valor_dia / x.jornada_horas * 1.35 * x.h35, 2) as monto_he35,
       round(x.valor_dia * 2 * x.dias_feriado, 2) as monto_feriado,
       round(x.valor_dia / x.jornada_horas * x.minutos_tardanza / 60, 2) as monto_tardanza
from (
  select a.trabajador_id, date_trunc('month', a.fecha)::date as periodo, t.jornada_horas,
         sum(least(2, a.horas_extra)) as h25, sum(greatest(0, a.horas_extra - 2)) as h35,
         count(*) filter (where a.feriado_trabajado) as dias_feriado, sum(a.minutos_tardanza) as minutos_tardanza,
         (sueldo_en(a.trabajador_id, fin_mes(date_trunc('month', a.fecha)::date))
          + asig_familiar_en(a.trabajador_id, fin_mes(date_trunc('month', a.fecha)::date))) / 30 as valor_dia
  from asistencia_dia a join trabajador t on t.id = a.trabajador_id
  where a.anulado_en is null
  group by a.trabajador_id, date_trunc('month', a.fecha), t.jornada_horas
) x;

-- Montos variables computables de cada mes (para el promedio de R-16).
create view v_pl_variable_mes with (security_invoker = true) as
select v.trabajador_id, v.periodo, v.concepto, v.monto
from (
  select a.trabajador_id, a.periodo, x.concepto, x.monto
  from v_pl_asistencia_mes a
  cross join lateral (values ('HE25', a.monto_he25), ('HE35', a.monto_he35), ('FERIADO', a.monto_feriado)) as x(concepto, monto)
  union all
  select trabajador_id, periodo, concepto, sum(monto) from movimiento where anulado_en is null group by 1, 2, 3
) v
join concepto_planilla c on c.codigo = v.concepto and c.computable and c.variable
where v.monto > 0;

-- Promedio de los variables regulares (cobrados en al menos 3 de los 6 meses que terminan en p_mes).
create function promedio_variable(p_t uuid, p_mes date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select coalesce(sum(s) / 6, 0) from (
    select concepto, sum(monto) as s, count(distinct periodo) as n
    from v_pl_variable_mes
    where trabajador_id = p_t and periodo between (date_trunc('month', p_mes) - interval '5 months')::date and date_trunc('month', p_mes)::date
    group by concepto
  ) x where n >= 3
  );
end
$$;

-- R-16: remuneración computable con el sueldo vigente en p_fecha y variables de los 6 meses hasta p_ventana.
create function remuneracion_computable(p_t uuid, p_fecha date, p_ventana date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select round(coalesce(sueldo_en(p_t, p_fecha), 0) + asig_familiar_en(p_t, p_fecha) + fijos_en(p_t, p_fecha, true)
               + promedio_variable(p_t, p_ventana), 2)
  );
end
$$;

-- ---------- Gratificación (R-17) ----------
create function grati_calculo(p_t uuid, p_sem date, p_al date, p_fecha_rc date, p_ventana date)
returns table (desde date, meses int, dias_no_computables int, regimen regimen_laboral, factor numeric,
               computable numeric, monto numeric, bonificacion numeric)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select d.desde, x.meses, x.nc, x.reg, rd.grati_factor, x.rc, m.monto,
         round(m.monto * case when t.salud = 'eps' then legal('bonificacion_eps', p_al) else legal('bonificacion_essalud', p_al) end, 2)
  from trabajador t
  cross join lateral (select greatest(t.fecha_ingreso, p_sem) as desde) d
  -- solo los meses completos computan: los días no computables se cuentan desde el primer mes completo
  cross join lateral (select case when d.desde = date_trunc('month', d.desde)::date then d.desde
                                  else (date_trunc('month', d.desde) + interval '1 month')::date end as desde_completo) dc
  cross join lateral (select meses_completos(d.desde, p_al) as meses,
                             (select no_grati from ausencias_en(p_t, dc.desde_completo,
                                case when p_al = fin_mes(p_al) then p_al else (date_trunc('month', p_al) - interval '1 day')::date end)) as nc,
                             regimen_en(p_t, p_al) as reg,
                             remuneracion_computable(p_t, p_fecha_rc, p_ventana) as rc) x
  join regimen_derecho rd on rd.regimen = x.reg
  cross join lateral (select case when x.meses >= 1
                             then greatest(0, round(x.rc * rd.grati_factor * x.meses / 6 - x.rc * rd.grati_factor / 180 * x.nc, 2))
                             else 0 end as monto) m
  where t.id = p_t and p_al >= t.fecha_ingreso;
end
$$;

-- R-17: qué gratificación toca en un semestre: la regular (laborando al 1 de julio / 15 de diciembre)
-- o la trunca del cese; con qué fecha de sueldo y ventana de variables se calcula y en qué mes se paga.
create function grati_semestre_tipo(p_t uuid, p_sem date)
returns table (tipo text, pago_mes date, hasta date, fecha_rc date, ventana date)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select y.tipo,
         case when y.tipo = 'regular' then date_trunc('month', y.fecha_derecho)::date else date_trunc('month', y.fecha_cese)::date end,
         case when y.tipo = 'regular' then (p_sem + interval '6 months - 1 day')::date else y.fecha_cese end,
         case when y.tipo = 'regular' then date_trunc('month', y.fecha_derecho)::date else y.fecha_cese end,
         case when y.tipo = 'regular' then (date_trunc('month', y.fecha_derecho) - interval '1 month')::date
              else (date_trunc('month', y.fecha_cese) - interval '1 month')::date end
  from (
    select t.fecha_cese, f.fecha_derecho,
           case when t.fecha_cese is null or t.fecha_cese >= f.fecha_derecho then 'regular' else 'trunca' end as tipo
    from trabajador t
    cross join lateral (select case when extract(month from p_sem) = 1 then (p_sem + interval '6 months')::date
                                    else (p_sem + interval '5 months 14 days')::date end as fecha_derecho) f
    where t.id = p_t and (p_sem + interval '6 months - 1 day')::date >= t.fecha_ingreso
      and (t.fecha_cese is null or t.fecha_cese >= p_sem)
  ) y;
end
$$;

create function grati_semestre(p_t uuid, p_sem date)
returns table (tipo text, pago_mes date, hasta date, desde date, meses int, dias_no_computables int, regimen regimen_laboral,
               factor numeric, computable numeric, monto numeric, bonificacion numeric)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select g.tipo, g.pago_mes, g.hasta, c.desde, c.meses, c.dias_no_computables, c.regimen, c.factor, c.computable, c.monto, c.bonificacion
  from grati_semestre_tipo(p_t, p_sem) g
  cross join lateral grati_calculo(p_t, p_sem, g.hasta, g.fecha_rc, g.ventana) c;
end
$$;

-- Cada semestre de cada trabajador con su gratificación.
create view v_gratificacion with (security_invoker = true) as
select t.id as trabajador_id, t.empleador_id, s::date as sem_inicio, (s + interval '6 months - 1 day')::date as sem_fin, g.*
from trabajador t
join empleador e on e.id = t.empleador_id
cross join lateral generate_series(date_trunc('year', greatest(t.fecha_ingreso, (e.inicio_planilla - interval '6 months')::date)),
                                   coalesce(t.fecha_cese, (current_date + interval '1 month')::date), interval '6 months') s
cross join lateral grati_semestre(t.id, s::date) g
where t.anulado_en is null;

-- ---------- CTS (R-18) ----------
create function cts_calculo(p_t uuid, p_sem date, p_al date, p_ventana date)
returns table (desde date, dias int, dias_no_computables int, elegible boolean, regimen regimen_laboral,
               computable numeric, sexto numeric, dias_ganados numeric, monto numeric)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select d.desde, x.dias, x.nc, x.elegible, x.reg, x.rc, x.sexto, g.dias_ganados,
         round((x.rc + x.sexto) * g.dias_ganados / 30, 2)
  from trabajador t
  -- quien no completaba un mes al cerrar el semestre anterior arrastra sus días a este
  cross join lateral (select case when t.fecha_ingreso < p_sem and t.fecha_ingreso > (p_sem - interval '1 month')::date
                                  then t.fecha_ingreso else greatest(t.fecha_ingreso, p_sem) end as desde) d
  cross join lateral (select (select no_cts from ausencias_en(p_t, d.desde, p_al)) as nc) a
  cross join lateral (
    select greatest(0, dias_laborales(d.desde, p_al) - a.nc) as dias, a.nc,
           (t.fecha_ingreso + interval '1 month')::date <= p_al + 1 and t.jornada_horas >= legal('jornada_minima_horas', p_al) as elegible,
           regimen_en(p_t, p_al) as reg,
           remuneracion_computable(p_t, p_al, p_ventana) as rc,
           -- 1/6 de la gratificación cobrada dentro del semestre (no incluye la bonificación)
           -- (nov–abr: la de diciembre; may–oct: la de julio; semestre de grati = 4 meses antes)
           round(coalesce((select g.monto from grati_semestre(p_t, (p_sem - interval '4 months')::date) g
                           where g.tipo = 'regular' and g.pago_mes between date_trunc('month', p_sem)::date and p_al), 0) / 6, 2) as sexto
  ) x
  join regimen_derecho rd on rd.regimen = x.reg
  cross join lateral (
    select case when not x.elegible then 0
                when rd.cts_tope_dias is null then rd.cts_dias_anio * x.dias / 360
                else least(rd.cts_dias_anio * x.dias / 360,
                           greatest(0, rd.cts_tope_dias - rd.cts_dias_anio * dias_laborales(t.fecha_ingreso, d.desde - 1) / 360.0))
           end as dias_ganados
  ) g
  where t.id = p_t and p_al >= d.desde;
end
$$;

-- R-18: qué CTS toca en un semestre (nov–abr → mayo; may–oct → noviembre) o la trunca del cese.
create function cts_semestre_tipo(p_t uuid, p_sem date)
returns table (tipo text, deposito_mes date, hasta date, ventana date)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select y.tipo,
         case when y.tipo = 'deposito' then (p_sem + interval '6 months')::date else date_trunc('month', y.fecha_cese)::date end,
         case when y.tipo = 'deposito' then (p_sem + interval '6 months - 1 day')::date else y.fecha_cese end,
         case when y.tipo = 'deposito' then (p_sem + interval '5 months')::date
              else (date_trunc('month', y.fecha_cese) - interval '1 month')::date end
  from (
    select t.fecha_cese,
           case when t.fecha_cese between p_sem and (p_sem + interval '6 months - 1 day')::date then 'trunca' else 'deposito' end as tipo
    from trabajador t
    where t.id = p_t and (p_sem + interval '6 months - 1 day')::date >= t.fecha_ingreso
      and (t.fecha_cese is null or t.fecha_cese >= p_sem)
  ) y;
end
$$;

create function cts_semestre(p_t uuid, p_sem date)
returns table (tipo text, deposito_mes date, hasta date, desde date, dias int, dias_no_computables int, elegible boolean,
               regimen regimen_laboral, computable numeric, sexto numeric, dias_ganados numeric, monto numeric)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select s.tipo, s.deposito_mes, s.hasta, c.desde, c.dias, c.dias_no_computables, c.elegible, c.regimen, c.computable,
         c.sexto, c.dias_ganados, c.monto
  from cts_semestre_tipo(p_t, p_sem) s
  cross join lateral cts_calculo(p_t, p_sem, s.hasta, s.ventana) c;
end
$$;

create view v_cts with (security_invoker = true) as
select t.id as trabajador_id, t.empleador_id, s::date as sem_inicio, (s + interval '6 months - 1 day')::date as sem_fin,
       c.tipo, c.deposito_mes, c.hasta, c.desde, c.dias, c.dias / 30 as meses, c.dias % 30 as dias_resto,
       c.dias_no_computables, c.elegible, c.regimen, c.computable, c.sexto, c.dias_ganados, c.monto
from trabajador t
join empleador e on e.id = t.empleador_id
cross join lateral generate_series((date_trunc('year', greatest(t.fecha_ingreso, (e.inicio_planilla - interval '6 months')::date)) - interval '2 months'),
                                   coalesce(t.fecha_cese, (current_date + interval '1 month')::date), interval '6 months') s
cross join lateral cts_semestre(t.id, s::date) c
where t.anulado_en is null;

-- ---------- Vacaciones (R-20) ----------
-- Días de vacaciones consumidos hasta una fecha: los anteriores al saldo inicial + los gozados después.
create function vacaciones_consumidas(p_t uuid, p_corte date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select coalesce((
           select (
             select coalesce(sum(vacaciones_dias_en(p_t, (t.fecha_ingreso + make_interval(years => k) - interval '1 day')::date)), 0)
             from generate_series(1, extract(year from age(s.al + 1, t.fecha_ingreso))::int) k
           ) - s.dias_pendientes
           from saldo_vacaciones_inicial s where s.trabajador_id = p_t), 0)
       + coalesce((
           select sum(least(a.hasta, p_corte) - a.desde + 1)
           from ausencia a join tipo_ausencia ta on ta.codigo = a.tipo and ta.es_vacaciones
           where a.trabajador_id = p_t and a.anulado_en is null and a.desde <= p_corte
             and a.desde > coalesce((select al from saldo_vacaciones_inicial where trabajador_id = p_t), '-infinity'::date)), 0)
  from trabajador t where t.id = p_t
  );
end
$$;

-- Periodos anuales ganados (al cese, o a hoy si sigue activo), con lo gozado de cada uno (el más antiguo primero).
create view v_vacacion_periodo with (security_invoker = true) as
select p.trabajador_id, p.k as periodo, p.inicio, p.fin, p.vence, p.ganados,
       p.ganados - least(p.ganados, greatest(0, p.consumido - (p.acumulado - p.ganados))) as pendientes,
       least(p.ganados, greatest(0, p.consumido - (p.acumulado - p.ganados))) as gozados,
       p.ganados - least(p.ganados, greatest(0, p.consumido - (p.acumulado - p.ganados))) > 0 and p.vence < p.corte as vencido
from (
  select b.trabajador_id, b.corte, b.consumido, k,
         (b.fecha_ingreso + make_interval(years => k - 1))::date as inicio,
         (b.fecha_ingreso + make_interval(years => k) - interval '1 day')::date as fin,
         (b.fecha_ingreso + make_interval(years => k + 1) - interval '1 day')::date as vence,
         vacaciones_dias_en(b.trabajador_id, (b.fecha_ingreso + make_interval(years => k) - interval '1 day')::date) as ganados,
         sum(vacaciones_dias_en(b.trabajador_id, (b.fecha_ingreso + make_interval(years => k) - interval '1 day')::date))
           over (partition by b.trabajador_id order by k) as acumulado
  from (
    select t.id as trabajador_id, t.fecha_ingreso, coalesce(t.fecha_cese, current_date) as corte,
           vacaciones_consumidas(t.id, coalesce(t.fecha_cese, current_date)) as consumido
    from trabajador t where t.anulado_en is null
  ) b
  cross join lateral generate_series(1, extract(year from age(b.corte + 1, b.fecha_ingreso))::int) k
) p;

-- Resumen por trabajador: pendientes, vencidas, adelantadas, truncas y su valor.
create view v_vacaciones with (security_invoker = true) as
select b.trabajador_id, b.empleador_id, b.corte, b.consumido as dias_gozados,
       coalesce(p.ganados, 0) as dias_ganados, coalesce(p.pendientes, 0) as dias_pendientes,
       coalesce(p.vencidos, 0) as dias_vencidos,
       greatest(0, b.consumido - coalesce(p.ganados, 0)) as dias_adelantados,
       b.dias_trunca, b.computable,
       round(b.computable * coalesce(p.pendientes, 0) / 30, 2) as monto_pendientes,
       round(b.computable * greatest(0, b.dias_trunca - greatest(0, b.consumido - coalesce(p.ganados, 0))) / 30, 2) as monto_truncas,
       round(b.computable * coalesce(p.vencidos, 0) / 30, 2) as monto_indemnizacion
from (
  select t.id as trabajador_id, t.empleador_id, c.corte, vacaciones_consumidas(t.id, c.corte) as consumido,
         -- truncas: días del régimen × días del año en curso / 360, con al menos un mes de servicio
         case when (t.fecha_ingreso + interval '1 month')::date <= c.corte + 1
              then round(vacaciones_dias_en(t.id, c.corte) * dias_laborales(
                     (t.fecha_ingreso + make_interval(years => extract(year from age(c.corte + 1, t.fecha_ingreso))::int))::date, c.corte) / 360.0, 2)
              else 0 end as dias_trunca,
         remuneracion_computable(t.id, c.corte, (date_trunc('month', c.corte) - interval '1 month')::date) as computable
  from trabajador t
  cross join lateral (select coalesce(t.fecha_cese, current_date) as corte) c
  where t.anulado_en is null
) b
left join (
  select trabajador_id, sum(ganados) as ganados, sum(pendientes) as pendientes,
         sum(pendientes) filter (where vencido) as vencidos
  from v_vacacion_periodo group by trabajador_id
) p on p.trabajador_id = b.trabajador_id;

-- ---------- Líneas de la planilla del mes (R-06…R-11, R-17) ----------
create view v_pl_linea with (security_invoker = true) as
select l.trabajador_id, l.periodo, l.concepto, c.nombre, c.tipo, l.cantidad, l.monto, c.orden
from (
  -- R-06: sueldo por los días que se pagan como sueldo
  select m.trabajador_id, m.periodo, 'SUELDO' as concepto, m.dias_sueldo::numeric as cantidad,
         round(sueldo_mes(m.trabajador_id, m.desde, m.hasta) * m.dias_sueldo / 30, 2) as monto
  from v_pl_mes m
  union all
  select m.trabajador_id, m.periodo, 'ASIG_FAMILIAR', null, m.asig_familiar
  from v_pl_mes m where m.dias_vinculo > 0
  union all
  -- R-05, R-07: días pagados con otro concepto (remuneración vacacional, subsidios)
  select m.trabajador_id, m.periodo, ta.concepto_pago, sum(x.d),
         round(sum(x.d) * case when bool_or(ta.es_vacaciones)
                               then m.sueldo_basico + promedio_variable(m.trabajador_id, (m.periodo - interval '1 month')::date)
                               else m.sueldo_basico end / 30, 2)   -- la asignación familiar ya va completa
  from v_pl_mes m
  join ausencia a on a.trabajador_id = m.trabajador_id and a.anulado_en is null and a.desde <= m.hasta and a.hasta >= m.desde
  join tipo_ausencia ta on ta.codigo = a.tipo and ta.concepto_pago is not null and ta.concepto_pago <> 'SUELDO'
  cross join lateral (select dias_tramo(greatest(a.desde, m.desde), least(a.hasta, m.hasta)) as d) x
  group by m.trabajador_id, m.periodo, ta.concepto_pago, m.sueldo_basico
  union all
  -- R-08, R-09, R-10: horas extra, feriados trabajados, tardanzas
  select a.trabajador_id, a.periodo, x.concepto, x.cantidad, x.monto
  from v_pl_asistencia_mes a
  join v_pl_mes m on m.trabajador_id = a.trabajador_id and m.periodo = a.periodo
  cross join lateral (values ('HE25', a.h25, a.monto_he25), ('HE35', a.h35, a.monto_he35),
                             ('FERIADO', a.dias_feriado::numeric, a.monto_feriado),
                             ('TARDANZA', a.minutos_tardanza::numeric, a.monto_tardanza)) as x(concepto, cantidad, monto)
  union all
  -- R-10: descanso semanal proporcional por faltas (si el empleador lo aplica)
  select m.trabajador_id, m.periodo, 'DOMINICAL', m.dias_reducen_descanso,
         round((m.sueldo_basico + m.asig_familiar) / 30 * m.dias_reducen_descanso / e.dias_laborables_semana, 2)
  from v_pl_mes m join empleador e on e.id = m.empleador_id
  where e.descuento_dominical and m.dias_reducen_descanso > 0
  union all
  -- R-06: conceptos fijos, en proporción a los días no descontados
  select m.trabajador_id, m.periodo, cf.concepto, null, round(cf.monto * (m.dias_vinculo - m.dias_no_pagados) / 30, 2)
  from v_pl_mes m
  join concepto_fijo cf on cf.trabajador_id = m.trabajador_id and cf.anulado_en is null
    and cf.desde <= m.periodo and (cf.hasta is null or cf.hasta >= m.periodo)
  union all
  -- montos registrados del mes (los de la liquidación van en la liquidación)
  select mv.trabajador_id, mv.periodo, mv.concepto, null, round(sum(mv.monto), 2)
  from movimiento mv
  join concepto_planilla cm on cm.codigo = mv.concepto and not cm.liquidacion
  join v_pl_mes m on m.trabajador_id = mv.trabajador_id and m.periodo = mv.periodo
  where mv.anulado_en is null
  group by 1, 2, 3
  union all
  -- R-17: gratificación regular y su bonificación en julio y diciembre
  select m.trabajador_id, m.periodo, x.concepto, g.meses, x.monto
  from v_pl_mes m
  -- julio paga el semestre ene–jun; diciembre, jul–dic
  cross join lateral grati_semestre(m.trabajador_id, semestre_grati((m.periodo - interval '1 month')::date)) g
  cross join lateral (values ('GRATI', g.monto), ('BONIF_EXTRA', g.bonificacion)) as x(concepto, monto)
  where extract(month from m.periodo) in (7, 12) and g.tipo = 'regular' and g.pago_mes = m.periodo
) l
join concepto_planilla c on c.codigo = l.concepto
where l.monto > 0;

-- Bases afectas y datos para la quinta (R-11, R-14).
create view v_pl_base with (security_invoker = true) as
select m.trabajador_id, m.empleador_id, m.periodo, m.hasta, m.dias_vinculo, m.dias_subsidiados, m.mes_cese, m.regimen,
       m.rmv, m.sueldo_basico, m.asig_familiar,
       coalesce(s.ingresos, 0) as ingresos, coalesce(s.descuentos_registrados, 0) as descuentos_registrados,
       coalesce(s.cubierto_provision, 0) as cubierto_provision,
       coalesce(s.base_essalud, 0) as base_essalud, coalesce(s.base_pension, 0) as base_pension,
       coalesce(s.quinta_ordinaria, 0) as quinta_ordinaria, coalesce(s.quinta_extraordinaria, 0) as quinta_extraordinaria,
       -- proyección (R-14): remuneración ordinaria mensual y gratificación (con bonificación) por venir
       coalesce(m.sueldo_basico, 0) + m.asig_familiar + fijos_en(m.trabajador_id, m.hasta, false) as quinta_tasa_mensual,
       round((coalesce(m.sueldo_basico, 0) + m.asig_familiar + fijos_en(m.trabajador_id, m.hasta, true)) * rd.grati_factor
             * (1 + case when t.salud = 'eps' then legal('bonificacion_eps', m.hasta) else legal('bonificacion_essalud', m.hasta) end), 2)
         as quinta_grati_proyectada
from v_pl_mes m
join trabajador t on t.id = m.trabajador_id
join regimen_derecho rd on rd.regimen = m.regimen
left join (
  select l.trabajador_id, l.periodo,
         sum(l.monto) filter (where c.tipo = 'ingreso') as ingresos,
         sum(l.monto) filter (where c.tipo = 'descuento') as descuentos_registrados,
         sum(l.monto) filter (where c.cubierto_provision) as cubierto_provision,
         sum(case when c.tipo = 'ingreso' then l.monto else -l.monto end) filter (where c.afecto_essalud) as base_essalud,
         sum(case when c.tipo = 'ingreso' then l.monto else -l.monto end) filter (where c.afecto_pension) as base_pension,
         sum(case when c.tipo = 'ingreso' then l.monto else -l.monto end) filter (where c.afecto_quinta and not c.quinta_extraordinaria) as quinta_ordinaria,
         sum(case when c.tipo = 'ingreso' then l.monto else -l.monto end) filter (where c.afecto_quinta and c.quinta_extraordinaria) as quinta_extraordinaria
  from v_pl_linea l join concepto_planilla c on c.codigo = l.concepto
  group by l.trabajador_id, l.periodo
) s on s.trabajador_id = m.trabajador_id and s.periodo = m.periodo;

-- ---------- Quinta categoría (R-14) ----------
-- Retenido acumulado: de otros empleadores (certificado) + de este, meses 1..k.
create function quinta_calculo(p_mes int, p_proyeccion numeric, p_extra numeric, p_fecha date,
                               p_retenido numeric[], p_previa_ret numeric, p_cese boolean)
returns table (impuesto_anual numeric, retencion numeric)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  with d as (select legal('quinta_deduccion_uit', p_fecha) * legal('uit', p_fecha) as deduccion),
  w as (select k, p_previa_ret + coalesce((select sum(x) from unnest(p_retenido[1:k]) x), 0) as ret from generate_series(0, 12) k),
  i as (select impuesto_quinta(p_proyeccion - d.deduccion, p_fecha) as imp,
               impuesto_quinta(p_proyeccion + p_extra - d.deduccion, p_fecha) as imp_extra from d)
  select case when p_mes = 12 then i.imp_extra else i.imp end,
         case when p_cese then 0                                                   -- R-23: se regulariza en la liquidación
              when p_mes = 12 then round(i.imp_extra - (select ret from w where k = 11), 2)   -- puede ser devolución
              -- ene–mar ÷12; desde abril, lo que falta ÷ meses que faltan (abr ÷9, may ÷8, ago ÷5, set ÷4:
              -- los divisores de SUNAT; el resto del tramo da lo mismo y admite lo retenido antes del sistema)
              else greatest(0, round(case
                     when p_mes <= 3 then i.imp / 12
                     else (i.imp - (select ret from w where k = p_mes - 1)) / (13 - p_mes) end, 2))
                   + greatest(0, i.imp_extra - i.imp)
         end
  from i;
end
$$;

create view v_pl_quinta with (security_invoker = true) as
with recursive b as (
  select p.trabajador_id, p.periodo, p.hasta, extract(month from p.periodo)::int as mes,
         p.quinta_ordinaria, p.quinta_extraordinaria, p.quinta_tasa_mensual, p.quinta_grati_proyectada, p.mes_cese,
         coalesce(q.renta, 0) as previa_renta, coalesce(q.ret, 0) as previa_ret, bo.retencion_quinta as retencion_emitida,
         t.domiciliado,
         row_number() over (partition by p.trabajador_id, extract(year from p.periodo) order by p.periodo) as n
  from v_pl_base p
  join trabajador t on t.id = p.trabajador_id
  left join (select trabajador_id, anio, sum(renta_bruta) as renta, sum(retencion) as ret
             from quinta_previa where anulado_en is null group by 1, 2) q
    on q.trabajador_id = p.trabajador_id and q.anio = extract(year from p.periodo)
  left join boleta bo on bo.trabajador_id = p.trabajador_id and bo.periodo = p.periodo and bo.anulado_en is null
),
r as (
  select b.trabajador_id, b.periodo, b.n, b.mes, b.previa_renta + b.quinta_ordinaria + b.quinta_extraordinaria as acumulado,
         pr.proyeccion, c.impuesto_anual, x.ret as retencion, c.retencion as retencion_calculada,
         (array_fill(0::numeric, array[12]))[1:b.mes - 1] || x.ret || (array_fill(0::numeric, array[12]))[b.mes + 1:12] as retenido
  from b
  cross join lateral (select b.previa_renta + b.quinta_ordinaria + b.quinta_tasa_mensual * (12 - b.mes)
                             + b.quinta_grati_proyectada * ((b.mes < 7)::int + (b.mes < 12)::int) as proyeccion) pr
  cross join lateral quinta_calculo(b.mes, pr.proyeccion, b.quinta_extraordinaria, b.hasta, array_fill(0::numeric, array[12]), b.previa_ret, b.mes_cese) c
  -- lo retenido en una boleta emitida es un hecho; un no domiciliado retiene 30% de lo del mes, sin proyección
  cross join lateral (select coalesce(b.retencion_emitida, case when b.domiciliado then c.retencion
                        else round(legal('quinta_no_domiciliado', b.hasta) * (b.quinta_ordinaria + b.quinta_extraordinaria), 2) end) as ret) x
  where b.n = 1
  union all
  select b.trabajador_id, b.periodo, b.n, b.mes, r.acumulado + b.quinta_ordinaria + b.quinta_extraordinaria,
         pr.proyeccion, c.impuesto_anual, x.ret, c.retencion,
         r.retenido[1:b.mes - 1] || x.ret || r.retenido[b.mes + 1:12]
  from r
  join b on b.trabajador_id = r.trabajador_id and extract(year from b.periodo) = extract(year from r.periodo) and b.n = r.n + 1
  cross join lateral (select r.acumulado + b.quinta_ordinaria + b.quinta_tasa_mensual * (12 - b.mes)
                             + b.quinta_grati_proyectada * ((b.mes < 7)::int + (b.mes < 12)::int) as proyeccion) pr
  cross join lateral quinta_calculo(b.mes, pr.proyeccion, b.quinta_extraordinaria, b.hasta, r.retenido, b.previa_ret, b.mes_cese) c
  cross join lateral (select coalesce(b.retencion_emitida, case when b.domiciliado then c.retencion
                        else round(legal('quinta_no_domiciliado', b.hasta) * (b.quinta_ordinaria + b.quinta_extraordinaria), 2) end) as ret) x
)
select trabajador_id, periodo, proyeccion, impuesto_anual, retencion, retencion_calculada, retenido from r;

-- Tasas AFP que usa un mes: las del mes exacto o, si faltan, las del último mes disponible (R-03).
create function tasa_afp_en(p_afp smallint, p_mes date)
returns tasa_afp
language plpgsql stable as $$
declare r tasa_afp;
begin
  select * into r from tasa_afp where afp_id = p_afp and periodo <= date_trunc('month', p_mes) order by periodo desc limit 1;
  return r;
end
$$;

create view v_tasa_afp_periodo with (security_invoker = true) as
select m::date as periodo, a.id as afp_id, a.codigo, a.nombre, t.periodo as periodo_tasa,
       coalesce(t.periodo = m::date, false) as exacta, t.aporte, t.prima, t.comision_flujo, t.comision_mixta,
       t.comision_saldo, t.remuneracion_maxima, t.fuente, t.sustento
from generate_series((select coalesce(min(inicio_planilla), date_trunc('month', current_date)::date) from empleador),
                     date_trunc('month', current_date + interval '1 month'), interval '1 month') m
cross join afp a
left join lateral tasa_afp_en(a.id, m::date) t on true;

-- ---------- Boleta: ingresos, descuentos y aportes (R-12…R-15) ----------
create view v_boleta_linea with (security_invoker = true) as
select l.trabajador_id, l.periodo, l.concepto, c.nombre, c.tipo, c.plame, l.cantidad, l.monto, c.orden
from (
  select trabajador_id, periodo, concepto, cantidad, monto from v_pl_linea
  union all
  -- R-12: pensión
  select b.trabajador_id, b.periodo, x.concepto, null, x.monto
  from v_pl_base b
  join trabajador t on t.id = b.trabajador_id
  left join lateral tasa_afp_en(t.afp_id, b.periodo) ta on t.sistema_pension = 'afp'
  cross join lateral (values
    ('ONP', case when t.sistema_pension = 'onp' then round(b.base_pension * legal('onp', b.hasta), 2) end),
    ('AFP_APORTE', round(b.base_pension * ta.aporte, 2)),
    ('AFP_PRIMA', case when t.fecha_nacimiento is null or age(b.hasta, t.fecha_nacimiento) < make_interval(years => legal('prima_edad_maxima', b.hasta)::int)
                       then round(least(b.base_pension, ta.remuneracion_maxima) * ta.prima, 2) else 0 end),
    ('AFP_COMISION', round(b.base_pension * case when t.comision_afp = 'flujo' then ta.comision_flujo else ta.comision_mixta end, 2))
  ) as x(concepto, monto)
  union all
  -- R-14: quinta (una retención negativa de diciembre se devuelve)
  select q.trabajador_id, q.periodo, case when q.retencion < 0 then 'DEVOL_QUINTA' else 'QUINTA' end, null, abs(q.retencion)
  from v_pl_quinta q
  union all
  -- R-13: EsSalud, mínimo la RMV del mes (D-06); un mes íntegramente subsidiado no aporta
  select b.trabajador_id, b.periodo, 'ESSALUD', null,
         round(legal('essalud', b.hasta) * greatest(b.base_essalud, b.rmv), 2)
  from v_pl_base b join trabajador t on t.id = b.trabajador_id
  where t.salud in ('essalud', 'eps') and b.dias_vinculo > b.dias_subsidiados
) l
join concepto_planilla c on c.codigo = l.concepto
where l.monto > 0;

-- ---------- Provisiones del mes por devengado (R-19) ----------
-- Devengado de un semestre al cierre de un mes: lo pagado si ya se pagó (o la trunca), si no lo ganado a la fecha.
create function grati_devengado(p_t uuid, p_sem date, p_mes date)
returns table (monto numeric, bonificacion numeric)
language plpgsql stable as $$
#variable_conflict use_column
begin
  return query
  select coalesce(c.monto, 0), coalesce(c.bonificacion, 0)
  from (select 1) uno
  left join lateral (select * from grati_semestre_tipo(p_t, p_sem) where p_mes >= p_sem) g on true
  left join lateral (
    select x.monto, x.bonificacion
    from trabajador t
    cross join lateral grati_calculo(p_t, p_sem,
      case when g.pago_mes <= p_mes then g.hasta else least(fin_mes(p_mes), coalesce(t.fecha_cese, fin_mes(p_mes))) end,
      case when g.pago_mes <= p_mes then g.fecha_rc else fin_mes(p_mes) end,
      case when g.pago_mes <= p_mes then g.ventana else p_mes end) x
    where t.id = p_t and g.tipo is not null and (g.pago_mes <= p_mes or p_mes <= (p_sem + interval '5 months')::date)
  ) c on true;
end
$$;

create function cts_devengado(p_t uuid, p_sem date, p_mes date)
returns numeric
language plpgsql stable as $$
#variable_conflict use_column
begin
  return (
  select coalesce(c.monto, 0)
  from (select 1) uno
  left join lateral (select * from cts_semestre_tipo(p_t, p_sem) where p_mes >= p_sem) s on true
  left join lateral (
    select x.monto
    from trabajador t
    cross join lateral cts_calculo(p_t, p_sem,
      case when s.deposito_mes <= p_mes then s.hasta else least(fin_mes(p_mes), coalesce(t.fecha_cese, fin_mes(p_mes))) end,
      case when s.deposito_mes <= p_mes then s.ventana else p_mes end) x
    where t.id = p_t and s.tipo is not null and (s.deposito_mes <= p_mes or p_mes <= (p_sem + interval '5 months')::date)
  ) c on true
  );
end
$$;

create view v_provision_mes with (security_invoker = true) as
select m.trabajador_id, m.empleador_id, m.periodo,
       round(gc.monto - gc1.monto + gp.monto - gp1.monto, 2) as gratificacion,
       round(gc.bonificacion - gc1.bonificacion + gp.bonificacion - gp1.bonificacion, 2) as bonificacion,
       round(cts_devengado(m.trabajador_id, s.cts_actual, m.periodo) - cts_devengado(m.trabajador_id, s.cts_actual, s.anterior)
             + cts_devengado(m.trabajador_id, s.cts_previo, m.periodo) - cts_devengado(m.trabajador_id, s.cts_previo, s.anterior), 2) as cts,
       round(remuneracion_computable(m.trabajador_id, m.hasta, m.periodo) * vacaciones_dias_en(m.trabajador_id, m.hasta)
             * greatest(0, m.dias_vinculo - m.dias_no_vacaciones) / 10800, 2) as vacaciones
from v_pl_mes m
join regimen_derecho rd on rd.regimen = m.regimen
cross join lateral (
  select (m.periodo - interval '1 month')::date as anterior, semestre_grati(m.periodo) as grati_actual, semestre_cts(m.periodo) as cts_actual
) s0
cross join lateral (select s0.*, (s0.grati_actual - interval '6 months')::date as grati_previo,
                           (s0.cts_actual - interval '6 months')::date as cts_previo) s
cross join lateral grati_devengado(m.trabajador_id, s.grati_actual, m.periodo) gc
cross join lateral grati_devengado(m.trabajador_id, s.grati_actual, s.anterior) gc1
cross join lateral grati_devengado(m.trabajador_id, s.grati_previo, m.periodo) gp
cross join lateral grati_devengado(m.trabajador_id, s.grati_previo, s.anterior) gp1;

-- ---------- Planilla del mes por trabajador (R-15) ----------
create view v_planilla with (security_invoker = true) as
select m.trabajador_id, m.empleador_id, m.periodo, t.apellidos_nombres, t.tipo_documento, t.numero_documento, t.cargo,
       t.fecha_ingreso, t.fecha_cese, m.regimen, t.sistema_pension, a.nombre as afp, t.comision_afp, t.cuspp, t.salud,
       m.sueldo_basico, m.dias_vinculo, m.dias_sueldo, m.dias_no_pagados, m.dias_vacaciones, m.dias_subsidiados,
       coalesce(asi.h25, 0) + coalesce(asi.h35, 0) as horas_extra, coalesce(asi.dias_feriado, 0) as dias_feriado,
       coalesce(s.ingresos, 0) as ingresos, coalesce(s.descuentos, 0) as descuentos,
       coalesce(s.ingresos, 0) - coalesce(s.descuentos, 0) as neto,
       coalesce(s.essalud, 0) as essalud, coalesce(s.quinta, 0) as quinta, coalesce(s.pension, 0) as pension,
       p.gratificacion as provision_gratificacion, p.bonificacion as provision_bonificacion,
       p.cts as provision_cts, p.vacaciones as provision_vacaciones,
       coalesce(s.ingresos, 0) - b.cubierto_provision + coalesce(s.essalud, 0)
         + p.gratificacion + p.bonificacion + p.cts + p.vacaciones as costo_empresa,
       (t.sistema_pension = 'afp' and not coalesce(ta.periodo = m.periodo, false)) as tasas_provisionales,
       (pc.periodo is not null) as cerrada, bo.id as boleta_id, bo.neto as neto_emitido, bo.entregada_en
from v_pl_mes m
join trabajador t on t.id = m.trabajador_id
join v_pl_base b on b.trabajador_id = m.trabajador_id and b.periodo = m.periodo
join v_provision_mes p on p.trabajador_id = m.trabajador_id and p.periodo = m.periodo
left join afp a on a.id = t.afp_id
left join lateral tasa_afp_en(t.afp_id, m.periodo) ta on t.sistema_pension = 'afp'
left join v_pl_asistencia_mes asi on asi.trabajador_id = m.trabajador_id and asi.periodo = m.periodo
left join (
  select trabajador_id, periodo,
         sum(monto) filter (where tipo = 'ingreso') as ingresos,
         sum(monto) filter (where tipo = 'descuento') as descuentos,
         sum(monto) filter (where tipo = 'aporte') as essalud,
         sum(monto) filter (where concepto = 'QUINTA') as quinta,
         sum(monto) filter (where concepto in ('ONP', 'AFP_APORTE', 'AFP_PRIMA', 'AFP_COMISION')) as pension
  from v_boleta_linea group by 1, 2
) s on s.trabajador_id = m.trabajador_id and s.periodo = m.periodo
left join planilla_cierre pc on pc.empleador_id = m.empleador_id and pc.periodo = m.periodo
left join boleta bo on bo.trabajador_id = m.trabajador_id and bo.periodo = m.periodo and bo.anulado_en is null;

-- ---------- Liquidación de beneficios sociales (R-21…R-23) ----------
create view v_liquidacion_linea with (security_invoker = true) as
with ces as (
  select t.id as trabajador_id, t.empleador_id, t.fecha_cese, t.fecha_ingreso, t.motivo_cese, t.fecha_fin_contrato,
         t.periodo_prueba_meses, t.sistema_pension, t.afp_id, t.comision_afp, t.fecha_nacimiento, t.salud, t.jornada_horas, t.domiciliado,
         regimen_en(t.id, t.fecha_cese) as regimen,
         remuneracion_computable(t.id, t.fecha_cese, (date_trunc('month', t.fecha_cese) - interval '1 month')::date) as computable
  from trabajador t join empleador e on e.id = t.empleador_id
  where t.anulado_en is null and t.fecha_cese is not null and t.fecha_cese >= e.inicio_planilla
),
ingresos as (
  select c.trabajador_id, x.concepto, x.cantidad, x.monto
  from ces c
  left join lateral (select * from cts_semestre(c.trabajador_id, semestre_cts(c.fecha_cese)) where tipo = 'trunca') ct on true
  -- cese antes del plazo de depósito (15 de mayo / noviembre): la CTS del semestre anterior se paga aquí
  left join lateral (select * from cts_semestre(c.trabajador_id, (semestre_cts(c.fecha_cese) - interval '6 months')::date)
                     where tipo = 'deposito' and c.fecha_cese < deposito_mes + 14) cp on true
  left join lateral (select * from grati_semestre(c.trabajador_id, semestre_grati(c.fecha_cese)) where tipo = 'trunca') g on true
  join v_vacaciones v on v.trabajador_id = c.trabajador_id
  join regimen_derecho rd on rd.regimen = c.regimen
  join motivo_cese mc on mc.codigo = c.motivo_cese
  cross join lateral (select age(c.fecha_cese + 1, c.fecha_ingreso) as servicio,
                             (extract(year from age(c.fecha_cese + 1, c.fecha_ingreso)) * 12 + extract(month from age(c.fecha_cese + 1, c.fecha_ingreso)))::int as meses_servicio) sv
  cross join lateral (values
    ('CTS_PENDIENTE', cp.dias::numeric, cp.monto),
    ('CTS', ct.dias::numeric, ct.monto),
    ('GRATI_TRUNCA', g.meses::numeric, g.monto),
    ('BONIF_TRUNCA', null, g.bonificacion),
    ('VAC_PENDIENTE', v.dias_pendientes, v.monto_pendientes),
    ('VAC_TRUNCA', greatest(0, v.dias_trunca - v.dias_adelantados), v.monto_truncas),
    ('INDEM_VACACIONAL', v.dias_vencidos, v.monto_indemnizacion),
    -- R-22: solo si el motivo indemniza y pasó el periodo de prueba
    ('INDEM_DESPIDO', null,
     case when not mc.indemniza or c.fecha_cese < (c.fecha_ingreso + make_interval(months => c.periodo_prueba_meses))::date
               or c.jornada_horas < legal('jornada_minima_horas', c.fecha_cese) then 0
          when rd.indem_dias_anio is not null      -- MYPE: días por año, fracción por dozavos, con tope
            then round(c.computable * least(rd.indem_tope_dias, rd.indem_dias_anio * sv.meses_servicio / 12.0) / 30, 2)
          when c.fecha_fin_contrato is not null and c.fecha_fin_contrato > c.fecha_cese   -- plazo fijo: meses que faltaban
            then round(least(rd.indem_tope_sueldos * c.computable,
                   rd.indem_sueldos_anio * c.computable * dias_laborales(c.fecha_cese + 1, c.fecha_fin_contrato) / 30.0), 2)
          else round(least(rd.indem_tope_sueldos * c.computable,
                 rd.indem_sueldos_anio * c.computable * (extract(year from sv.servicio) + extract(month from sv.servicio) / 12.0
                                                         + extract(day from sv.servicio) / 360.0)), 2) end)
  ) as x(concepto, cantidad, monto)
  union all
  select mv.trabajador_id, mv.concepto, null, round(sum(mv.monto), 2)
  from movimiento mv join concepto_planilla cp on cp.codigo = mv.concepto and cp.liquidacion
  join ces c on c.trabajador_id = mv.trabajador_id and mv.periodo >= date_trunc('month', c.fecha_cese)
  where mv.anulado_en is null
  group by 1, 2
),
bases as (
  select i.trabajador_id,
         coalesce(sum(case when cp.tipo = 'ingreso' then i.monto else -i.monto end) filter (where cp.afecto_pension), 0) as base_pension,
         coalesce(sum(case when cp.tipo = 'ingreso' then i.monto else -i.monto end) filter (where cp.afecto_essalud), 0) as base_essalud,
         coalesce(sum(case when cp.tipo = 'ingreso' then i.monto else -i.monto end) filter (where cp.afecto_quinta), 0) as base_quinta
  from ingresos i join concepto_planilla cp on cp.codigo = i.concepto
  group by i.trabajador_id
),
-- R-23: impuesto sobre lo percibido en el año (sin proyección) menos lo retenido antes del cese
quinta as (
  select c.trabajador_id,
         case when not c.domiciliado then legal('quinta_no_domiciliado', c.fecha_cese) * b.base_quinta
              else impuesto_quinta(coalesce(qp.renta, 0) + coalesce(pb.renta, 0) + b.base_quinta
                                   - legal('quinta_deduccion_uit', c.fecha_cese) * legal('uit', c.fecha_cese), c.fecha_cese)
                   - coalesce(qp.ret, 0) - coalesce(pq.ret, 0) end as diferencia
  from ces c
  join bases b on b.trabajador_id = c.trabajador_id
  left join (select trabajador_id, anio, sum(renta_bruta) as renta, sum(retencion) as ret from quinta_previa
             where anulado_en is null group by 1, 2) qp on qp.trabajador_id = c.trabajador_id and qp.anio = extract(year from c.fecha_cese)
  left join lateral (select sum(quinta_ordinaria + quinta_extraordinaria) as renta from v_pl_base
                     where trabajador_id = c.trabajador_id and periodo between date_trunc('year', c.fecha_cese) and c.fecha_cese) pb on true
  left join lateral (select sum(retencion) as ret from v_pl_quinta
                     where trabajador_id = c.trabajador_id and periodo between date_trunc('year', c.fecha_cese) and c.fecha_cese) pq on true
)
select l.trabajador_id, l.concepto, cp.nombre, cp.tipo, cp.plame, l.cantidad, l.monto, cp.orden
from (
  select trabajador_id, concepto, cantidad, monto from ingresos
  union all
  -- pensión sobre lo remunerativo; la prima AFP respeta el tope del mes ya usado por la planilla del cese
  select c.trabajador_id, x.concepto, null, x.monto
  from ces c
  join bases b on b.trabajador_id = c.trabajador_id
  join v_pl_base pm on pm.trabajador_id = c.trabajador_id and pm.periodo = date_trunc('month', c.fecha_cese)
  left join lateral tasa_afp_en(c.afp_id, c.fecha_cese) ta on c.sistema_pension = 'afp'
  cross join lateral (values
    ('ONP', case when c.sistema_pension = 'onp' then round(b.base_pension * legal('onp', c.fecha_cese), 2) end),
    ('AFP_APORTE', round(b.base_pension * ta.aporte, 2)),
    ('AFP_PRIMA', case when c.fecha_nacimiento is null or age(c.fecha_cese, c.fecha_nacimiento) < make_interval(years => legal('prima_edad_maxima', c.fecha_cese)::int)
                       then round(greatest(0, least(pm.base_pension + b.base_pension, ta.remuneracion_maxima) - least(pm.base_pension, ta.remuneracion_maxima)) * ta.prima, 2) end),
    ('AFP_COMISION', round(b.base_pension * case when c.comision_afp = 'flujo' then ta.comision_flujo else ta.comision_mixta end, 2))
  ) as x(concepto, monto)
  union all
  select trabajador_id, case when diferencia < 0 then 'DEVOL_QUINTA' else 'QUINTA' end, null, round(abs(diferencia), 2) from quinta
  union all
  select c.trabajador_id, 'ESSALUD', null, round(legal('essalud', c.fecha_cese) * b.base_essalud, 2)
  from ces c join bases b on b.trabajador_id = c.trabajador_id where c.salud in ('essalud', 'eps')
) l
join concepto_planilla cp on cp.codigo = l.concepto
where l.monto > 0;

create view v_liquidacion with (security_invoker = true) as
select t.id as trabajador_id, t.empleador_id, t.apellidos_nombres, t.tipo_documento, t.numero_documento, t.cargo,
       t.fecha_ingreso, t.fecha_cese, mc.nombre as motivo_cese, regimen_en(t.id, t.fecha_cese) as regimen,
       extract(year from age(t.fecha_cese + 1, t.fecha_ingreso))::int as servicio_anios,
       extract(month from age(t.fecha_cese + 1, t.fecha_ingreso))::int as servicio_meses,
       extract(day from age(t.fecha_cese + 1, t.fecha_ingreso))::int as servicio_dias,
       remuneracion_computable(t.id, t.fecha_cese, (date_trunc('month', t.fecha_cese) - interval '1 month')::date) as computable,
       coalesce(s.ingresos, 0) as ingresos, coalesce(s.descuentos, 0) as descuentos,
       coalesce(s.ingresos, 0) - coalesce(s.descuentos, 0) as neto, coalesce(s.essalud, 0) as essalud,
       t.fecha_cese + 2 as fecha_limite_pago     -- R-21: 48 horas
from trabajador t
join empleador e on e.id = t.empleador_id
join motivo_cese mc on mc.codigo = t.motivo_cese
left join (
  select trabajador_id, sum(monto) filter (where tipo = 'ingreso') as ingresos,
         sum(monto) filter (where tipo = 'descuento') as descuentos, sum(monto) filter (where tipo = 'aporte') as essalud
  from v_liquidacion_linea group by 1
) s on s.trabajador_id = t.id
where t.anulado_en is null and t.fecha_cese is not null and t.fecha_cese >= e.inicio_planilla;

-- ---------- Observaciones (R-03, R-25) ----------
create view v_pl_observacion with (security_invoker = true) as
select o.empleador_id, o.periodo, o.trabajador_id, t.apellidos_nombres, o.codigo, o.mensaje, o.bloquea
from (
  select m.empleador_id, m.periodo, m.trabajador_id, 'TASAS_AFP' as codigo,
         case when ta.periodo is null then 'No hay tasas AFP registradas: cárgalas desde Parámetros.'
              else 'Tasas AFP provisionales: se usan las de ' || to_char(ta.periodo, 'MM/YYYY') || '. Actualiza las de la SBS del mes.' end as mensaje,
         true as bloquea
  from v_pl_mes m join trabajador t on t.id = m.trabajador_id and t.sistema_pension = 'afp'
  left join lateral tasa_afp_en(t.afp_id, m.periodo) ta on true
  where ta.periodo is distinct from m.periodo
  union all
  select m.empleador_id, m.periodo, m.trabajador_id, 'SIN_CUSPP', 'Falta el CUSPP del afiliado AFP.', true
  from v_pl_mes m join trabajador t on t.id = m.trabajador_id
  where t.sistema_pension = 'afp' and coalesce(trim(t.cuspp), '') = ''
  union all
  select m.empleador_id, m.periodo, m.trabajador_id, 'SIN_SUELDO', 'No tiene sueldo básico registrado para el mes.', true
  from v_pl_mes m where m.sueldo_basico is null
  union all
  select m.empleador_id, m.periodo, m.trabajador_id, 'SUELDO_MENOR_RMV',
         'El sueldo básico es menor a la RMV (S/ ' || m.rmv::numeric(10,2) || '): revisa la jornada o el sueldo.', false
  from v_pl_mes m join trabajador t on t.id = m.trabajador_id
  where m.sueldo_basico < m.rmv and t.jornada_horas >= legal('jornada_minima_horas', m.hasta)
  union all
  select p.empleador_id, p.periodo, p.trabajador_id, 'NETO_NEGATIVO', 'El neto a pagar es negativo: revisa descuentos y adelantos.', true
  from v_planilla p where p.neto < 0
  union all
  select p.empleador_id, p.periodo, p.trabajador_id, 'BOLETA_DIFIERE',
         'La boleta emitida (S/ ' || p.neto_emitido::numeric(12,2) || ') ya no coincide con el recálculo (S/ ' || p.neto::numeric(12,2) || ').', false
  from v_planilla p where p.neto_emitido is not null and abs(p.neto_emitido - p.neto) >= 0.01
  union all
  select m.empleador_id, m.periodo, m.trabajador_id, 'DESCANSO_MEDICO',
         'Descanso médico del año supera ' || legal('descanso_medico_dias', m.hasta)::int || ' días: desde el día 21 registra subsidio de EsSalud.', false
  from v_pl_mes m
  cross join lateral (select descanso_medico from ausencias_en(m.trabajador_id, date_trunc('year', m.periodo)::date, m.hasta)) d
  where d.descanso_medico > legal('descanso_medico_dias', m.hasta) and m.dias_descanso_medico > 0
  union all
  select m.empleador_id, m.periodo, m.trabajador_id, 'SIS', 'Afiliado al SIS: el aporte de salud no se calcula; regístralo aparte.', false
  from v_pl_mes m join trabajador t on t.id = m.trabajador_id where t.salud = 'sis'
  union all
  select m.empleador_id, m.periodo, null, 'SIN_REMYPE',
         'El empleador no tiene REMYPE registrado: todos se calculan en régimen general salvo pacto.', false
  from (select distinct empleador_id, periodo from v_pl_mes) m
  where not exists (select 1 from empleador_remype r where r.empleador_id = m.empleador_id)
  union all
  select m.empleador_id, m.periodo, m.trabajador_id, 'SALDO_VACACIONES',
         'Ingresó antes de usar el sistema: registra su saldo inicial de vacaciones (cero si no tiene) (R-20).', true
  from v_pl_mes m join trabajador t on t.id = m.trabajador_id join empleador e on e.id = m.empleador_id
  where t.fecha_ingreso < e.inicio_planilla
    and not exists (select 1 from saldo_vacaciones_inicial s where s.trabajador_id = t.id)
  union all
  -- R-14: sin los ingresos del año anteriores al sistema (o de otro empleador) la quinta sale corta
  select m.empleador_id, m.periodo, m.trabajador_id, 'QUINTA_PREVIA',
         case when t.fecha_ingreso < e.inicio_planilla
              then 'Faltan sus rentas y retenciones de quinta de ' || extract(year from m.periodo) || ' anteriores al sistema (certificado o planillas previas).'
              else 'Ingresó en el año: registra sus rentas y retenciones de otros empleadores (cero si no tuvo).' end,
         t.fecha_ingreso < e.inicio_planilla
  from v_pl_mes m join trabajador t on t.id = m.trabajador_id join empleador e on e.id = m.empleador_id
  where greatest(t.fecha_ingreso, e.inicio_planilla) > date_trunc('year', m.periodo)::date
    and not exists (select 1 from quinta_previa q where q.trabajador_id = t.id and q.anio = extract(year from m.periodo) and q.anulado_en is null)
  union all
  select m.empleador_id, m.periodo, m.trabajador_id, 'VACACIONES_VENCIDAS',
         trim_scale(v.dias_vencidos) || ' días de vacaciones vencidos sin gozar: generan indemnización vacacional.', false
  from v_pl_mes m join v_vacaciones v on v.trabajador_id = m.trabajador_id
  where v.dias_vencidos > 0 and m.periodo = date_trunc('month', least(v.corte, current_date))
) o
left join trabajador t on t.id = o.trabajador_id;

-- Totales por empleador y mes.
create view v_planilla_resumen with (security_invoker = true) as
select p.empleador_id, e.razon_social as empleador, p.periodo, count(*) as trabajadores,
       sum(p.ingresos) as ingresos, sum(p.descuentos) as descuentos, sum(p.neto) as neto, sum(p.essalud) as essalud,
       sum(p.quinta) as quinta, sum(p.pension) as pension,
       sum(p.provision_gratificacion + p.provision_bonificacion) as provision_gratificacion,
       sum(p.provision_cts) as provision_cts, sum(p.provision_vacaciones) as provision_vacaciones,
       sum(p.costo_empresa) as costo_empresa, bool_or(p.tasas_provisionales) as tasas_provisionales,
       bool_or(p.cerrada) as cerrada,
       (select count(*) from v_pl_observacion o where o.empleador_id = p.empleador_id and o.periodo = p.periodo and o.bloquea) as observaciones_bloqueo
from v_planilla p join empleador e on e.id = p.empleador_id
group by p.empleador_id, e.razon_social, p.periodo;

grant select on v_trabajador, v_pl_mes, v_pl_asistencia_mes, v_pl_variable_mes, v_gratificacion, v_cts, v_vacacion_periodo,
  v_vacaciones, v_pl_linea, v_pl_base, v_pl_quinta, v_tasa_afp_periodo, v_boleta_linea, v_provision_mes, v_planilla,
  v_liquidacion_linea, v_liquidacion, v_pl_observacion, v_planilla_resumen to authenticated;
revoke all on v_trabajador, v_pl_mes, v_pl_asistencia_mes, v_pl_variable_mes, v_gratificacion, v_cts, v_vacacion_periodo,
  v_vacaciones, v_pl_linea, v_pl_base, v_pl_quinta, v_tasa_afp_periodo, v_boleta_linea, v_provision_mes, v_planilla,
  v_liquidacion_linea, v_liquidacion, v_pl_observacion, v_planilla_resumen from anon;
