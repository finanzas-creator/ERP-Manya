-- 006 · Planillas: API de integración con el ERP de control de personal (R-27). El ERP de personal
-- envía trabajadores, asistencia, ausencias y montos por el código externo de cada trabajador; la
-- planilla se sigue calculando aquí.

-- Empleador por RUC, con permiso (R-27).
create function integracion_empleador(p_ruc text) returns smallint language plpgsql stable as $$
declare e smallint;
begin
  if not opera_planilla() then raise exception 'R-26: sin permiso para planillas'; end if;
  select id into e from empleador where ruc = p_ruc and activo;
  if e is null then raise exception 'R-27: no hay un empleador activo con RUC %', p_ruc; end if;
  return e;
end $$;

create function integracion_trabajador(p_empleador smallint, p_codigo text) returns uuid language plpgsql stable as $$
declare t uuid;
begin
  select id into t from trabajador where empleador_id = p_empleador and codigo_externo = p_codigo and anulado_en is null
  order by fecha_ingreso desc limit 1;
  if t is null then raise exception 'R-27: no hay trabajador con código externo % en este empleador', p_codigo; end if;
  return t;
end $$;

-- R-27: alta o actualización de trabajadores por código externo. Solo cambia los campos que llegan.
-- Un sueldo distinto del vigente crea una nueva vigencia (sueldo_desde; por defecto el 1 del mes en curso).
create function integrar_trabajadores(p_ruc text, p_trabajadores jsonb) returns jsonb language plpgsql as $$
declare
  e smallint := integracion_empleador(p_ruc);
  r jsonb; t trabajador; nuevo boolean; creados int := 0; actualizados int := 0; sueldos int := 0;
  afp_ smallint; desde date; sueldo numeric;
begin
  for r in select * from jsonb_array_elements(p_trabajadores) loop
    if coalesce(r ->> 'codigo_externo', '') = '' then raise exception 'R-27: cada trabajador necesita codigo_externo'; end if;
    select * into t from trabajador where empleador_id = e and codigo_externo = r ->> 'codigo_externo' and anulado_en is null
    order by fecha_ingreso desc limit 1;
    nuevo := t.id is null;
    if r ? 'afp' and r ->> 'afp' is not null then
      select id into afp_ from afp where codigo = upper(r ->> 'afp');
      if afp_ is null then raise exception 'R-27: AFP desconocida % (use HABITAT, INTEGRA, PRIMA o PROFUTURO)', r ->> 'afp'; end if;
    else afp_ := t.afp_id; end if;
    if nuevo then
      if r ->> 'numero_documento' is null or r ->> 'apellidos_nombres' is null or r ->> 'fecha_ingreso' is null or r ->> 'sueldo_basico' is null then
        raise exception 'R-27: % es nuevo: envíe numero_documento, apellidos_nombres, fecha_ingreso y sueldo_basico', r ->> 'codigo_externo';
      end if;
      insert into trabajador (empleador_id, codigo_externo, tipo_documento, numero_documento, apellidos_nombres, fecha_nacimiento, cargo,
        fecha_ingreso, fecha_cese, motivo_cese, fecha_fin_contrato, regimen_pactado, sistema_pension, afp_id, comision_afp, cuspp,
        asignacion_familiar, salud, jornada_horas, domiciliado, banco, cuenta_sueldo, banco_cts, cuenta_cts, correo)
      values (e, r ->> 'codigo_externo', coalesce((r ->> 'tipo_documento')::tipo_documento, 'DNI'), r ->> 'numero_documento',
        upper(r ->> 'apellidos_nombres'), (r ->> 'fecha_nacimiento')::date, r ->> 'cargo', (r ->> 'fecha_ingreso')::date,
        (r ->> 'fecha_cese')::date, r ->> 'motivo_cese', (r ->> 'fecha_fin_contrato')::date, (r ->> 'regimen_pactado')::regimen_laboral,
        coalesce((r ->> 'sistema_pension')::sistema_pension, 'onp'), afp_, (r ->> 'comision_afp')::comision_afp, r ->> 'cuspp',
        coalesce((r ->> 'asignacion_familiar')::boolean, false), coalesce((r ->> 'salud')::sistema_salud, 'essalud'),
        coalesce((r ->> 'jornada_horas')::numeric, 8), coalesce((r ->> 'domiciliado')::boolean, true),
        r ->> 'banco', r ->> 'cuenta_sueldo', r ->> 'banco_cts', r ->> 'cuenta_cts', r ->> 'correo')
      returning * into t;
      creados := creados + 1;
    else
      update trabajador set
        tipo_documento = case when r ? 'tipo_documento' then (r ->> 'tipo_documento')::tipo_documento else tipo_documento end,
        numero_documento = case when r ? 'numero_documento' then r ->> 'numero_documento' else numero_documento end,
        apellidos_nombres = case when r ? 'apellidos_nombres' then upper(r ->> 'apellidos_nombres') else apellidos_nombres end,
        fecha_nacimiento = case when r ? 'fecha_nacimiento' then (r ->> 'fecha_nacimiento')::date else fecha_nacimiento end,
        cargo = case when r ? 'cargo' then r ->> 'cargo' else cargo end,
        fecha_ingreso = case when r ? 'fecha_ingreso' then (r ->> 'fecha_ingreso')::date else fecha_ingreso end,
        fecha_cese = case when r ? 'fecha_cese' then (r ->> 'fecha_cese')::date else fecha_cese end,
        motivo_cese = case when r ? 'motivo_cese' then r ->> 'motivo_cese' else motivo_cese end,
        fecha_fin_contrato = case when r ? 'fecha_fin_contrato' then (r ->> 'fecha_fin_contrato')::date else fecha_fin_contrato end,
        regimen_pactado = case when r ? 'regimen_pactado' then (r ->> 'regimen_pactado')::regimen_laboral else regimen_pactado end,
        sistema_pension = case when r ? 'sistema_pension' then (r ->> 'sistema_pension')::sistema_pension else sistema_pension end,
        afp_id = case when coalesce(r ->> 'sistema_pension', sistema_pension::text) = 'afp' then afp_ else null end,
        comision_afp = case when coalesce(r ->> 'sistema_pension', sistema_pension::text) <> 'afp' then null
                            when r ? 'comision_afp' then (r ->> 'comision_afp')::comision_afp else comision_afp end,
        cuspp = case when r ? 'cuspp' then r ->> 'cuspp' else cuspp end,
        asignacion_familiar = case when r ? 'asignacion_familiar' then (r ->> 'asignacion_familiar')::boolean else asignacion_familiar end,
        salud = case when r ? 'salud' then (r ->> 'salud')::sistema_salud else salud end,
        jornada_horas = case when r ? 'jornada_horas' then (r ->> 'jornada_horas')::numeric else jornada_horas end,
        domiciliado = case when r ? 'domiciliado' then (r ->> 'domiciliado')::boolean else domiciliado end,
        banco = case when r ? 'banco' then r ->> 'banco' else banco end,
        cuenta_sueldo = case when r ? 'cuenta_sueldo' then r ->> 'cuenta_sueldo' else cuenta_sueldo end,
        banco_cts = case when r ? 'banco_cts' then r ->> 'banco_cts' else banco_cts end,
        cuenta_cts = case when r ? 'cuenta_cts' then r ->> 'cuenta_cts' else cuenta_cts end,
        correo = case when r ? 'correo' then r ->> 'correo' else correo end
      where id = t.id returning * into t;
      actualizados := actualizados + 1;
    end if;
    if r ? 'sueldo_basico' then
      sueldo := (r ->> 'sueldo_basico')::numeric;
      desde := coalesce((r ->> 'sueldo_desde')::date, case when nuevo then t.fecha_ingreso else date_trunc('month', current_date)::date end);
      if sueldo_en(t.id, desde) is distinct from sueldo then
        update remuneracion set sueldo_basico = sueldo, motivo = 'Integración'
        where trabajador_id = t.id and vigente_desde = desde and anulado_en is null;
        if not found then
          insert into remuneracion (trabajador_id, vigente_desde, sueldo_basico, motivo) values (t.id, desde, sueldo, 'Integración');
        end if;
        sueldos := sueldos + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('creados', creados, 'actualizados', actualizados, 'sueldos', sueldos);
end $$;

-- R-27: un día por trabajador (horas extra, feriado trabajado, tardanza). Reemplaza lo que haya ese día;
-- un día sin incidencias anula la fila.
create function integrar_asistencia(p_ruc text, p_dias jsonb) returns jsonb language plpgsql as $$
declare e smallint := integracion_empleador(p_ruc); r jsonb; t uuid; n int := 0; vacios int := 0;
begin
  for r in select * from jsonb_array_elements(p_dias) loop
    t := integracion_trabajador(e, r ->> 'codigo_externo');
    update asistencia_dia set anulado_en = now(), anulado_motivo = 'Reemplazado por la integración'
    where trabajador_id = t and fecha = (r ->> 'fecha')::date and anulado_en is null;
    if coalesce((r ->> 'horas_extra')::numeric, 0) > 0 or coalesce((r ->> 'feriado_trabajado')::boolean, false)
       or coalesce((r ->> 'minutos_tardanza')::int, 0) > 0 then
      insert into asistencia_dia (trabajador_id, fecha, horas_extra, feriado_trabajado, minutos_tardanza, detalle, origen)
      values (t, (r ->> 'fecha')::date, coalesce((r ->> 'horas_extra')::numeric, 0), coalesce((r ->> 'feriado_trabajado')::boolean, false),
              coalesce((r ->> 'minutos_tardanza')::int, 0), r ->> 'detalle', 'integracion');
      n := n + 1;
    else vacios := vacios + 1; end if;
  end loop;
  return jsonb_build_object('dias', n, 'sin_incidencias', vacios);
end $$;

-- R-27: ausencias de un rango de fechas. Reemplaza las enviadas antes por la integración en ese rango
-- (las registradas a mano se respetan); una ausencia que cruza meses se guarda por mes.
create function integrar_ausencias(p_ruc text, p_desde date, p_hasta date, p_ausencias jsonb) returns jsonb language plpgsql as $$
declare e smallint := integracion_empleador(p_ruc); r jsonb; t uuid; m date; n int := 0; anuladas int;
begin
  update ausencia a set anulado_en = now(), anulado_motivo = 'Reemplazada por la integración'
  from trabajador w where w.id = a.trabajador_id and w.empleador_id = e and a.origen = 'integracion'
    and a.anulado_en is null and a.desde <= p_hasta and a.hasta >= p_desde;
  get diagnostics anuladas = row_count;
  for r in select * from jsonb_array_elements(p_ausencias) loop
    t := integracion_trabajador(e, r ->> 'codigo_externo');
    if not exists (select 1 from tipo_ausencia where codigo = r ->> 'tipo') then
      raise exception 'R-27: tipo de ausencia desconocido % (ver catálogo tipo_ausencia)', r ->> 'tipo';
    end if;
    for m in select generate_series(date_trunc('month', (r ->> 'desde')::date), (r ->> 'hasta')::date, interval '1 month')::date loop
      insert into ausencia (trabajador_id, tipo, desde, hasta, detalle, origen)
      values (t, r ->> 'tipo', greatest((r ->> 'desde')::date, m), least((r ->> 'hasta')::date, fin_mes(m)), r ->> 'detalle', 'integracion');
      n := n + 1;
    end loop;
  end loop;
  return jsonb_build_object('registradas', n, 'reemplazadas', anuladas);
end $$;

-- R-27: montos de un mes (bonos, comisiones, adelantos, descuentos). Reemplaza los enviados antes por la
-- integración en ese mes; los registrados a mano se respetan.
create function integrar_movimientos(p_ruc text, p_periodo date, p_movimientos jsonb) returns jsonb language plpgsql as $$
declare e smallint := integracion_empleador(p_ruc); r jsonb; n int := 0; anulados int;
begin
  p_periodo := date_trunc('month', p_periodo)::date;
  update movimiento mv set anulado_en = now(), anulado_motivo = 'Reemplazado por la integración'
  from trabajador w where w.id = mv.trabajador_id and w.empleador_id = e and mv.origen = 'integracion'
    and mv.anulado_en is null and mv.periodo = p_periodo;
  get diagnostics anulados = row_count;
  for r in select * from jsonb_array_elements(p_movimientos) loop
    insert into movimiento (trabajador_id, periodo, concepto, monto, detalle, origen)
    values (integracion_trabajador(e, r ->> 'codigo_externo'), p_periodo, r ->> 'concepto', (r ->> 'monto')::numeric, r ->> 'detalle', 'integracion');
    n := n + 1;
  end loop;
  return jsonb_build_object('registrados', n, 'reemplazados', anulados);
end $$;

revoke execute on function integracion_empleador(text), integracion_trabajador(smallint, text), integrar_trabajadores(text, jsonb),
  integrar_asistencia(text, jsonb), integrar_ausencias(text, date, date, jsonb), integrar_movimientos(text, date, jsonb) from public, anon;
grant execute on function integracion_empleador(text), integracion_trabajador(smallint, text), integrar_trabajadores(text, jsonb),
  integrar_asistencia(text, jsonb), integrar_ausencias(text, date, date, jsonb), integrar_movimientos(text, date, jsonb) to authenticated;
