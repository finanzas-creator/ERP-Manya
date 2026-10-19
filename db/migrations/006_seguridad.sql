-- 006 · Roles, permisos, bitácora, cierre mensual y KPIs para el CEO.

-- Rol del usuario autenticado (R-80). auth.uid() lo provee Supabase.
create function app_rol() returns rol language sql stable security definer set search_path = public as $$
  select rol from usuario where id = auth.uid() and activo
$$;

-- ---------- Bitácora (R-82) ----------
create table auditoria (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  registro_id  text not null,
  accion       text not null,
  antes        jsonb,
  despues      jsonb,
  usuario_id   uuid,
  en           timestamptz not null default now()
);

create function registrar_auditoria() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into auditoria (tabla, registro_id, accion, antes, despues, usuario_id)
  values (tg_table_name,
          coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'), ''),
          tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

-- ---------- Cierre mensual (R-70) ----------
create table cierre_mensual (
  periodo      mes primary key,
  cerrado_en   timestamptz not null default now(),
  cerrado_por  uuid default auth.uid()
);

-- Bloquea cambios cuya fecha (columna indicada en el trigger) cae en un mes cerrado.
create function bloquear_mes_cerrado() returns trigger language plpgsql as $$
declare
  col text := tg_argv[0];
  f_new date; f_old date;
begin
  if tg_op <> 'DELETE' then f_new := (to_jsonb(new) ->> col)::date; end if;
  if tg_op <> 'INSERT' then f_old := (to_jsonb(old) ->> col)::date; end if;
  if exists (select 1 from cierre_mensual c
             where c.periodo in (date_trunc('month', f_new)::date, date_trunc('month', f_old)::date)) then
    raise exception 'R-70: el mes está cerrado; no se puede modificar';
  end if;
  return coalesce(new, old);
end $$;

-- Al cerrar un mes, su TC queda registrado (R-70).
create function chk_cierre_tc() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from tipo_cambio_mensual where periodo = new.periodo) then
    raise exception 'R-70: registra el tipo de cambio de % antes de cerrar el mes', new.periodo;
  end if;
  return new;
end $$;
create trigger cierre_requiere_tc before insert on cierre_mensual
  for each row execute function chk_cierre_tc();

-- El cuota/comprobante heredan el mes de su venta/emisión; pagos y costos el suyo.
do $$
declare t record;
begin
  for t in select * from (values
      ('venta', 'fecha_contrato'), ('pago', 'fecha'), ('comprobante', 'fecha_emision'),
      ('costo_directo', 'fecha'), ('planilla', 'periodo'), ('herramienta_gasto', 'periodo'),
      ('comision_pago', 'periodo')) as x(tabla, col)
  loop
    execute format('create trigger %I before insert or update or delete on %I
                    for each row execute function bloquear_mes_cerrado(%L)',
                   t.tabla || '_cierre', t.tabla, t.col);
  end loop;
end $$;

-- Tipo de cambio de un mes cerrado no cambia.
create trigger tipo_cambio_cierre before update or delete on tipo_cambio_mensual
  for each row execute function bloquear_mes_cerrado('periodo');

-- ---------- Auditoría y RLS en todas las tablas de negocio ----------
do $$
declare
  t text;
  operativas text[] := array['cliente','marca','servicio_contratado','venta','costo_directo',
                             'comprobante','cuota','pago','planilla','herramienta_gasto','comision_pago'];
  catalogos text[]  := array['config','empresa','linea_negocio','categoria','servicio','equipo','persona',
                             'cuenta_bancaria','plantilla_pago','plantilla_pago_item','tipo_cambio_mensual',
                             'sub_area','peso_direccion','cierre_mensual','usuario'];
begin
  foreach t in array operativas || catalogos loop
    execute format('alter table %I enable row level security', t);
    execute format('create trigger %I after insert or update or delete on %I
                    for each row execute function registrar_auditoria()', t || '_auditoria', t);
  end loop;

  -- Operativas: administrador y tesorería leen, crean y editan. Nadie borra (R-81).
  foreach t in array operativas loop
    execute format('create policy lectura on %I for select to authenticated
                    using (app_rol() in (''admin'',''tesoreria''))', t);
    execute format('create policy alta on %I for insert to authenticated
                    with check (app_rol() in (''admin'',''tesoreria''))', t);
    execute format('create policy edicion on %I for update to authenticated
                    using (app_rol() in (''admin'',''tesoreria''))
                    with check (app_rol() in (''admin'',''tesoreria''))', t);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;

  -- Catálogos: todos los usuarios activos leen; solo el administrador edita.
  foreach t in array catalogos loop
    execute format('create policy lectura on %I for select to authenticated
                    using (app_rol() is not null)', t);
    execute format('create policy admin on %I for all to authenticated
                    using (app_rol() = ''admin'') with check (app_rol() = ''admin'')', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

alter table auditoria enable row level security;
create policy lectura on auditoria for select to authenticated using (app_rol() = 'admin');
grant select on auditoria to authenticated;

grant usage on all sequences in schema public to authenticated;
grant select on all tables in schema public to authenticated;   -- vistas; las tablas filtran por RLS
revoke all on all tables in schema public from anon;

-- ---------- KPIs (lectura para los tres roles, incluido CEO) ----------
-- El CEO no lee tablas operativas. Las funciones security definer calculan con
-- permisos del dueño y solo responden a usuarios activos; las vistas las exponen.
create view v_kpi_mes_calc with (security_invoker = true) as
with ventas as (select periodo, sum(ventas_usd) as ventas_usd from v_ventas_mes group by 1),
ingresos as (
  select periodo, sum(ingreso_usd) filter (where modalidad = 'mensual') as recurrente_usd,
         count(distinct cliente_id) as clientes_activos
  from v_ingreso_venta_mes group by 1
),
cobrado as (select date_trunc('month', fecha)::date as periodo, sum(monto_usd) as cobrado_usd from v_pago group by 1)
select a.periodo,
       coalesce(v.ventas_usd, 0) as ventas_usd,
       a.ingresos_usd,
       coalesce(i.recurrente_usd, 0) as ingresos_recurrentes_usd,
       coalesce(i.clientes_activos, 0) as clientes_activos,
       coalesce(c.cobrado_usd, 0) as cobrado_usd,
       a.costos_directos_usd + a.planilla_usd + a.herramientas_usd + a.comisiones_usd as costos_usd,
       a.gp_usd,
       a.gp_usd / nullif(a.ingresos_usd, 0) as margen
from v_gp_agencia_mes a
left join ventas v on v.periodo = a.periodo
left join ingresos i on i.periodo = a.periodo
left join cobrado c on c.periodo = a.periodo;

create view v_kpi_hoy_calc with (security_invoker = true) as
select
  (select coalesce(sum(saldo_usd), 0) from v_cuota where not pagada and comprobante_id is not null) as por_cobrar_usd,
  (select coalesce(sum(saldo_usd), 0) from v_cuota where estado = 'vencida') as vencido_usd,
  (select coalesce(sum(saldo_usd), 0) from v_cuota where estado = 'por_facturar') as por_facturar_usd,
  (select coalesce(sum(a_usd(falta_planificar, moneda, fecha_contrato)), 0) from v_venta
     where estado_plan = 'falta_planificar') as falta_planificar_usd,
  (select count(*) from v_venta where estado_plan in ('sin_plan', 'falta_planificar', 'sobre_planificado'))
     as ventas_plan_descuadrado,
  (select count(*) from v_renovacion where dias_para_vencer between 0 and 30) as renovaciones_30d,
  (select count(*) from v_renovacion where dias_para_vencer < 0) as renovaciones_vencidas;

create function kpi_mes() returns setof v_kpi_mes_calc language sql stable security definer
set search_path = public as $$ select * from v_kpi_mes_calc where app_rol() is not null $$;

create function kpi_hoy() returns setof v_kpi_hoy_calc language sql stable security definer
set search_path = public as $$ select * from v_kpi_hoy_calc where app_rol() is not null $$;

create function kpi_linea_mes() returns table (periodo date, linea text, ingreso_usd numeric,
  costo_usd numeric, gp_usd numeric, margen numeric)
language sql stable security definer set search_path = public as $$
  select periodo, linea, ingreso_usd, costo_usd, gp_usd, gp_usd / nullif(ingreso_usd, 0)
  from v_gp_linea_mes where app_rol() is not null
$$;

create view v_kpi_mes as select * from kpi_mes();
create view v_kpi_hoy as select * from kpi_hoy();
create view v_kpi_linea_mes as select * from kpi_linea_mes();

revoke execute on function kpi_mes(), kpi_hoy(), kpi_linea_mes() from public, anon;
grant execute on function kpi_mes(), kpi_hoy(), kpi_linea_mes() to authenticated;
grant select on v_kpi_mes, v_kpi_hoy, v_kpi_linea_mes to authenticated;
