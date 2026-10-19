-- 007 · Operaciones del negocio como funciones transaccionales.
-- security invoker: respetan los permisos de quien las llama (R-80).

-- IGV por defecto de una venta (R-12).
create function igv_por_defecto(p_cliente uuid) returns numeric language sql stable as $$
  select case when c.no_domiciliado then 0 else (cfg()).igv_pct end from cliente c where c.id = p_cliente
$$;

-- Cuotas de una venta a partir de una plantilla (R-11). La última cuota absorbe el redondeo.
create function generar_cuotas(p_venta uuid, p_plantilla smallint) returns void language plpgsql as $$
declare
  v venta; it record; n int; asignado numeric := 0; monto numeric;
begin
  select * into v from venta where id = p_venta;
  select count(*) into n from plantilla_pago_item where plantilla_id = p_plantilla;
  if n = 0 then raise exception 'R-11: la plantilla de pago no existe o no tiene cuotas'; end if;
  for it in select * from plantilla_pago_item where plantilla_id = p_plantilla order by orden loop
    monto := case when it.orden = n then v.monto_neto - asignado else round(v.monto_neto * it.porcentaje, 2) end;
    asignado := asignado + monto;
    insert into cuota (venta_id, orden, concepto, monto_neto, fecha_limite)
    values (p_venta, it.orden, it.concepto, monto,
            case it.momento when 'inicio' then v.fecha_contrato else coalesce(v.fecha_fin, v.fecha_contrato) end);
  end loop;
end $$;

-- Registrar una venta nueva (y su servicio contratado si no existe) con su plan de pagos.
create function registrar_venta(
  p_cliente uuid, p_servicio int, p_fecha_contrato date, p_monto_neto numeric,
  p_plantilla smallint,
  p_marca uuid default null, p_servicio_contratado uuid default null,
  p_fecha_fin date default null, p_periodo_servicio date default null, p_descripcion text default null,
  p_moneda moneda default 'USD', p_pct_igv numeric default null, p_equipo smallint default null,
  p_partner int default null, p_pct_comision numeric default 0, p_empresa smallint default null
) returns uuid language plpgsql as $$
declare sc uuid := p_servicio_contratado; vid uuid;
begin
  if sc is null then
    insert into servicio_contratado (cliente_id, marca_id, servicio_id)
    values (p_cliente, p_marca, p_servicio) returning id into sc;
  end if;
  insert into venta (servicio_contratado_id, empresa_id, fecha_contrato, fecha_fin, periodo_servicio, descripcion,
                     moneda, monto_neto, pct_igv, equipo_id, partner_id, pct_comision)
  values (sc, p_empresa, p_fecha_contrato, p_fecha_fin, date_trunc('month', p_periodo_servicio)::date, p_descripcion,
          p_moneda, p_monto_neto, coalesce(p_pct_igv, igv_por_defecto(p_cliente)),
          p_equipo, p_partner, coalesce(p_pct_comision, 0))
  returning id into vid;
  perform generar_cuotas(vid, p_plantilla);
  return vid;
end $$;

-- Renovar: siguiente ciclo copiando el anterior, inicio = fin del ciclo anterior (R-51).
create function renovar_venta(p_venta uuid) returns uuid language plpgsql as $$
declare v venta; meses int; nueva uuid; desfase int;
begin
  select * into v from venta where id = p_venta and anulado_en is null;
  if v.id is null then raise exception 'R-51: la venta no existe o está anulada'; end if;
  if v.fecha_fin is null then raise exception 'R-51: la venta no tiene fecha fin de ciclo'; end if;
  meses := greatest(1, round(extract(epoch from age(v.fecha_fin, v.fecha_contrato)) / (30.4375 * 86400))::int);
  desfase := v.fecha_fin - v.fecha_contrato;
  insert into venta (servicio_contratado_id, empresa_id, fecha_contrato, fecha_fin, descripcion, moneda, monto_neto,
                     pct_igv, equipo_id, partner_id, pct_comision)
  values (v.servicio_contratado_id, v.empresa_id, v.fecha_fin, (v.fecha_fin + make_interval(months => meses))::date,
          v.descripcion, v.moneda, v.monto_neto, v.pct_igv, v.equipo_id, v.partner_id, v.pct_comision)
  returning id into nueva;
  insert into cuota (venta_id, orden, concepto, monto_neto, fecha_limite)
  select nueva, orden, concepto, monto_neto, fecha_limite + desfase
  from cuota where venta_id = p_venta and anulado_en is null;
  return nueva;
end $$;

create function finalizar_servicio(p_servicio_contratado uuid) returns void language sql as $$
  update servicio_contratado set estado = 'finalizado' where id = p_servicio_contratado   -- R-52
$$;

-- % de detracción sugerido para un conjunto de cuotas (R-22).
create function detraccion_sugerida(p_tipo tipo_comprobante, p_cuotas uuid[], p_fecha date) returns numeric
language sql stable as $$
  select case when p_tipo = 'factura' and sum(q.igv) > 0
               and sum(case when q.moneda = 'PEN' then q.total else q.total * tc_de(p_fecha) end)
                   > (cfg()).detraccion_umbral_pen
              then (cfg()).detraccion_pct else 0 end
  from v_cuota q where q.id = any(p_cuotas)
$$;

-- Emitir comprobante agrupando cuotas por facturar (R-20, R-21, R-22).
create function emitir_comprobante(
  p_empresa smallint, p_tipo tipo_comprobante, p_serie_numero text, p_fecha_emision date,
  p_cuotas uuid[], p_fecha_limite date default null, p_pct_detraccion numeric default null
) returns uuid language plpgsql as $$
declare cid uuid;
begin
  if exists (select 1 from cuota where id = any(p_cuotas) and comprobante_id is not null) then
    raise exception 'R-21: alguna cuota ya tiene comprobante';
  end if;
  insert into comprobante (empresa_id, tipo, serie_numero, fecha_emision, fecha_limite, pct_detraccion)
  values (p_empresa, p_tipo, nullif(trim(p_serie_numero), ''), p_fecha_emision, p_fecha_limite,
          coalesce(p_pct_detraccion, detraccion_sugerida(p_tipo, p_cuotas, p_fecha_emision)))
  returning id into cid;
  update cuota set comprobante_id = cid where id = any(p_cuotas);
  return cid;
end $$;

-- Pagar un comprobante completo: reparte el monto entre sus cuotas con saldo,
-- en proporción a su saldo (R-32). La última cuota absorbe el redondeo.
create function registrar_pago_comprobante(
  p_comprobante uuid, p_fecha date, p_cuenta smallint, p_monto numeric, p_tc numeric default 1
) returns int language plpgsql as $$
declare q record; total_saldo numeric; n int; i int := 0; asignado numeric := 0; parte numeric;
begin
  select sum(saldo), count(*) into total_saldo, n from v_cuota
  where comprobante_id = p_comprobante and saldo > 0;
  if coalesce(n, 0) = 0 then raise exception 'R-32: el comprobante no tiene saldo pendiente'; end if;
  for q in select id, saldo from v_cuota where comprobante_id = p_comprobante and saldo > 0 order by orden, id loop
    i := i + 1;
    parte := case when i = n then p_monto - asignado else round(p_monto * q.saldo / total_saldo, 2) end;
    asignado := asignado + parte;
    if parte > 0 then
      insert into pago (cuota_id, fecha, cuenta_id, monto, tc) values (q.id, p_fecha, p_cuenta, parte, p_tc);
    end if;
  end loop;
  return n;
end $$;

-- Anular cualquier registro operativo con motivo (R-81).
create function anular(p_tabla text, p_id uuid, p_motivo text) returns void language plpgsql as $$
begin
  if p_tabla not in ('venta', 'cuota', 'comprobante', 'pago', 'costo_directo', 'planilla',
                     'herramienta_gasto', 'comision_pago') then
    raise exception 'R-81: % no admite anulación', p_tabla;
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'R-81: la anulación requiere motivo'; end if;
  execute format('update %I set anulado_en = now(), anulado_motivo = $1 where id = $2 and anulado_en is null', p_tabla)
    using p_motivo, p_id;
end $$;

grant execute on function registrar_venta, renovar_venta, finalizar_servicio, emitir_comprobante,
  registrar_pago_comprobante, anular, detraccion_sugerida, generar_cuotas, igv_por_defecto to authenticated;

-- Usuario de la sesión actual (para que la app sepa su rol).
create function yo() returns usuario language sql stable security definer set search_path = public as $$
  select * from usuario where id = auth.uid() and activo
$$;
grant execute on function yo() to authenticated;
