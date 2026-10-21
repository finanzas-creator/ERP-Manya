-- 010 · Modalidad por venta: la del catálogo es la sugerida; la venta puede fijar otra (R-02, D-21).

alter table venta add column modalidad modalidad;  -- null = la del servicio en el catálogo
comment on column venta.modalidad is 'R-02: modalidad fijada en el contrato; null = la del catálogo';

create or replace view v_venta_base with (security_invoker = true) as
select v.id, v.codigo, v.codigo_legacy, v.servicio_contratado_id, v.empresa_id,
       v.fecha_contrato, v.fecha_fin, v.descripcion, v.moneda, v.monto_neto, v.pct_igv,
       v.equipo_id, v.partner_id, v.pct_comision,
       coalesce(v.periodo_servicio, date_trunc('month', v.fecha_contrato)::date) as periodo_servicio,  -- R-05
       a_usd(v.monto_neto, v.moneda, v.fecha_contrato) as monto_neto_usd,                             -- R-06
       sc.cliente_id, sc.marca_id, sc.servicio_id, sc.estado as estado_servicio,
       s.nombre as servicio, coalesce(v.modalidad, s.modalidad) as modalidad, s.naturaleza,  -- R-02
       s.categoria_id, cat.nombre as categoria, cat.linea_id, l.nombre as linea,
       cl.razon_social as cliente, m.nombre as marca,
       e.nombre as equipo, p.nombre as partner
from venta v
join servicio_contratado sc on sc.id = v.servicio_contratado_id
join servicio s on s.id = sc.servicio_id
join categoria cat on cat.id = s.categoria_id
join linea_negocio l on l.id = cat.linea_id
join cliente cl on cl.id = sc.cliente_id
left join marca m on m.id = sc.marca_id
left join equipo e on e.id = v.equipo_id
left join persona p on p.id = v.partner_id
where v.anulado_en is null;

-- R-51: renovar copia la venta anterior, incluida su modalidad.
create or replace function renovar_venta(p_venta uuid) returns uuid language plpgsql as $$
declare v venta; meses int; nueva uuid; desfase int;
begin
  select * into v from venta where id = p_venta and anulado_en is null;
  if v.id is null then raise exception 'R-51: la venta no existe o está anulada'; end if;
  if v.fecha_fin is null then raise exception 'R-51: la venta no tiene fecha fin de ciclo'; end if;
  meses := greatest(1, round(extract(epoch from age(v.fecha_fin, v.fecha_contrato)) / (30.4375 * 86400))::int);
  desfase := v.fecha_fin - v.fecha_contrato;
  insert into venta (servicio_contratado_id, empresa_id, fecha_contrato, fecha_fin, descripcion, moneda, monto_neto,
                     pct_igv, equipo_id, partner_id, pct_comision, modalidad)
  values (v.servicio_contratado_id, v.empresa_id, v.fecha_fin, (v.fecha_fin + make_interval(months => meses))::date,
          v.descripcion, v.moneda, v.monto_neto, v.pct_igv, v.equipo_id, v.partner_id, v.pct_comision, v.modalidad)
  returning id into nueva;
  insert into cuota (venta_id, orden, concepto, monto_neto, fecha_limite)
  select nueva, orden, concepto, monto_neto, fecha_limite + desfase
  from cuota where venta_id = p_venta and anulado_en is null;
  return nueva;
end $$;
