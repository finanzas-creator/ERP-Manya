-- 015 · Registrar venta con su modalidad (R-02, D-21): la del catálogo es la sugerida; si el
-- contrato fija otra, se guarda en la venta. Igual que al migrar, solo se guarda si difiere.
drop function registrar_venta(uuid, int, date, numeric, smallint, uuid, uuid, date, date, text, moneda, numeric,
                              smallint, int, numeric, smallint);

create function registrar_venta(
  p_cliente uuid, p_servicio int, p_fecha_contrato date, p_monto_neto numeric,
  p_plantilla smallint,
  p_marca uuid default null, p_servicio_contratado uuid default null,
  p_fecha_fin date default null, p_periodo_servicio date default null, p_descripcion text default null,
  p_moneda moneda default 'USD', p_pct_igv numeric default null, p_equipo smallint default null,
  p_partner int default null, p_pct_comision numeric default 0, p_empresa smallint default null,
  p_modalidad modalidad default null
) returns uuid language plpgsql as $$
declare sc uuid := p_servicio_contratado; vid uuid;
begin
  if sc is null then
    insert into servicio_contratado (cliente_id, marca_id, servicio_id)
    values (p_cliente, p_marca, p_servicio) returning id into sc;
  end if;
  insert into venta (servicio_contratado_id, empresa_id, fecha_contrato, fecha_fin, periodo_servicio, descripcion,
                     moneda, monto_neto, pct_igv, equipo_id, partner_id, pct_comision, modalidad)
  values (sc, p_empresa, p_fecha_contrato, p_fecha_fin, date_trunc('month', p_periodo_servicio)::date, p_descripcion,
          p_moneda, p_monto_neto, coalesce(p_pct_igv, igv_por_defecto(p_cliente)),
          p_equipo, p_partner, coalesce(p_pct_comision, 0),
          nullif(p_modalidad, (select modalidad from servicio where id = p_servicio)))   -- R-02
  returning id into vid;
  perform generar_cuotas(vid, p_plantilla);
  return vid;
end $$;
revoke execute on function registrar_venta from public, anon;
grant execute on function registrar_venta to authenticated;
