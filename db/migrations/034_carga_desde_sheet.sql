-- 034 · Actualización automática desde el sheet administrativo (R-71, D-25).
-- La carga entra primero al esquema `carga` (por lotes, sin tocar nada) y luego `aplicar_carga()`
-- reemplaza los datos en UNA transacción: si algo falla, producción queda como estaba.
-- Se conserva lo que solo vive en el ERP.

-- Tablas que vienen del sheet, en orden de dependencias (padres primero). Único lugar de la lista.
create function tablas_carga() returns text[] language sql immutable as $$
  select array['empresa', 'linea_negocio', 'categoria', 'servicio', 'equipo', 'persona', 'sub_area',
               'cuenta_bancaria', 'serie_comprobante', 'plantilla_pago', 'plantilla_pago_item',
               'cliente', 'marca', 'servicio_contratado', 'venta', 'comprobante', 'cuota',
               'costo_directo', 'pago', 'planilla', 'herramienta_gasto', 'comision_pago',
               'peso_direccion', 'tipo_cambio_mensual', 'referencia_sheet']
$$;

-- Bitácora de cargas: la app muestra la hora de la última.
create table carga_sheet (
  id         bigint generated always as identity primary key,
  en         timestamptz not null default now(),
  revision   text,
  resultado  text not null check (resultado in ('ok', 'rechazada', 'error')),
  filas      jsonb,
  detalle    text
);
alter table carga_sheet enable row level security;
create policy lectura on carga_sheet for select to authenticated using ((select app_rol()) is not null);
grant select on carga_sheet to authenticated;
revoke all on carga_sheet from anon;

-- Esquema vacío con la forma de las tablas públicas, para recibir los lotes.
create function preparar_carga() returns void language plpgsql as $$
declare t text;
begin
  drop schema if exists carga cascade;
  create schema carga;
  revoke all on schema carga from public;
  foreach t in array tablas_carga() loop
    execute format('create table carga.%I (like public.%I including defaults including identity)', t, t);
  end loop;
end $$;

-- R-71: reemplaza los datos del sheet en una sola transacción y devuelve un resumen.
create function aplicar_carga(p_revision text, p_forzar boolean default false) returns jsonb
language plpgsql as $$
declare
  t text; n_nuevo bigint; n_hoy bigint; filas jsonb := '{}'; sin_cuadrar int;
  todas text[] := tablas_carga() || array['gestion_cobranza', 'nota_credito'];
begin
  if to_regnamespace('carga') is null then raise exception 'R-71: no hay carga preparada'; end if;
  -- 1) una carga que trae bastante menos que lo que hay se rechaza (sheet incompleto o mal leído)
  foreach t in array array['cliente', 'venta', 'comprobante', 'cuota', 'pago'] loop
    execute format('select count(*) from carga.%I', t) into n_nuevo;
    execute format('select count(*) from public.%I', t) into n_hoy;
    filas := filas || jsonb_build_object(t, n_nuevo);
    if not p_forzar and n_nuevo < n_hoy * (1 - (cfg()).carga_caida_max_pct) then
      raise exception 'R-71: la carga trae % filas de % y hoy hay %; no se aplica', n_nuevo, t, n_hoy;
    end if;
  end loop;

  -- 2) lo que solo vive en el ERP
  drop table if exists g_empresa, g_cuenta, g_cliente, g_marca, g_comprobante, g_gestion, g_nota, g_tc;
  create temp table g_empresa on commit drop as select * from public.empresa;
  create temp table g_cuenta on commit drop as select * from public.cuenta_bancaria;
  create temp table g_cliente on commit drop as select * from public.cliente;
  create temp table g_marca on commit drop as select * from public.marca;
  create temp table g_comprobante on commit drop as
    select id, autodetraccion_fecha, autodetraccion_operacion, autodetraccion_constancia, archivo_pdf, archivo_xml
    from public.comprobante
    where num_nonnulls(autodetraccion_fecha, autodetraccion_operacion, autodetraccion_constancia, archivo_pdf, archivo_xml) > 0;
  create temp table g_gestion on commit drop as select * from public.gestion_cobranza;
  create temp table g_nota on commit drop as select * from public.nota_credito;
  create temp table g_tc on commit drop as select * from public.tipo_cambio_mensual;

  -- 3) reemplazo (la bitácora no registra la recarga; el cierre mensual sigue protegiendo, R-70)
  foreach t in array todas loop
    if exists (select 1 from pg_trigger where tgname = t || '_auditoria') then
      execute format('alter table public.%I disable trigger %I', t, t || '_auditoria');
    end if;
  end loop;
  execute 'truncate ' || (select string_agg(format('public.%I', x), ', ') from unnest(todas) x) || ' restart identity';
  foreach t in array tablas_carga() loop
    execute format('insert into public.%I overriding system value select * from carga.%I', t, t);
  end loop;

  -- 4) se devuelve lo del ERP
  update public.empresa e set nombre_comercial = g.nombre_comercial, direccion_fiscal = g.direccion_fiscal,
         ubigeo = g.ubigeo, correo = g.correo, telefono = g.telefono, cuenta_detracciones = g.cuenta_detracciones
  from g_empresa g where g.id = e.id;
  update public.cuenta_bancaria c set numero = g.numero, cci = g.cci, activo = g.activo
  from g_cuenta g where g.nombre = c.nombre;
  update public.cliente c set ruc = coalesce(c.ruc, g.ruc), tipo_documento = g.tipo_documento,
         direccion_fiscal = g.direccion_fiscal, correo_facturacion = g.correo_facturacion
  from g_cliente g where g.id = c.id;
  insert into public.marca
  select g.* from g_marca g
  where exists (select 1 from public.cliente c where c.id = g.cliente_id)
    and not exists (select 1 from public.marca m where m.id = g.id
                    or (m.cliente_id = g.cliente_id and lower(m.nombre) = lower(g.nombre)));
  update public.comprobante c set autodetraccion_fecha = g.autodetraccion_fecha,
         autodetraccion_operacion = g.autodetraccion_operacion, autodetraccion_constancia = g.autodetraccion_constancia,
         archivo_pdf = g.archivo_pdf, archivo_xml = g.archivo_xml
  from g_comprobante g where g.id = c.id;
  insert into public.gestion_cobranza select * from g_gestion g
  where exists (select 1 from public.cliente c where c.id = g.cliente_id);
  insert into public.nota_credito select * from g_nota g
  where exists (select 1 from public.comprobante c where c.id = g.comprobante_id);
  -- el TC de los meses que el sheet no tiene (D-14: los automáticos de SUNAT)
  insert into public.tipo_cambio_mensual select * from g_tc g
  where not exists (select 1 from public.tipo_cambio_mensual x where x.periodo = g.periodo);

  -- 5) secuencias y bitácora otra vez activas
  for t in select c.table_name from information_schema.columns c
           where c.table_schema = 'public' and c.is_identity = 'YES' and c.column_name = 'id'
             and c.table_name = any(tablas_carga()) loop
    execute format('select setval(pg_get_serial_sequence(%L, ''id''), coalesce((select max(id) from public.%I), 0) + 1, false)',
                   'public.' || t, t);
  end loop;
  perform setval('venta_codigo_seq', greatest((select count(*) from public.venta), 1));
  foreach t in array todas loop
    if exists (select 1 from pg_trigger where tgname = t || '_auditoria') then
      execute format('alter table public.%I enable trigger %I', t, t || '_auditoria');
    end if;
  end loop;
  drop schema carga cascade;

  select count(*) filter (where not cuadra) into sin_cuadrar from v_validacion_mes;
  filas := filas || jsonb_build_object('meses_sin_cuadrar', sin_cuadrar,
    'gestiones', (select count(*) from public.gestion_cobranza), 'notas_credito', (select count(*) from public.nota_credito));
  insert into carga_sheet (revision, resultado, filas, detalle)
  values (p_revision, 'ok', filas, case when sin_cuadrar > 0 then sin_cuadrar || ' meses no cuadran con el sheet (ver Validación)' end);
  return filas;
end $$;

-- Una carga que no se pudo aplicar también queda registrada (la transacción de aplicar_carga se revierte entera).
create function registrar_carga(p_revision text, p_resultado text, p_detalle text) returns void language sql as $$
  insert into carga_sheet (revision, resultado, detalle) values (p_revision, p_resultado, left(p_detalle, 2000))
$$;

alter table config add column carga_caida_max_pct porcentaje not null default 0.02;

-- Solo el proceso de carga (dueño de la base) las ejecuta; nunca la app.
revoke execute on function preparar_carga(), aplicar_carga(text, boolean), registrar_carga(text, text, text), tablas_carga()
  from public, anon, authenticated;
