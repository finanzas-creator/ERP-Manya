-- 037 · Planillas: anulación de novedades (R-81) y listas para las pantallas (sin cálculo nuevo).

-- R-81: también se anulan, con motivo, los registros de planilla.
create or replace function anular(p_tabla text, p_id uuid, p_motivo text) returns void language plpgsql as $$
begin
  if p_tabla not in ('venta', 'cuota', 'comprobante', 'pago', 'costo_directo', 'planilla',
                     'herramienta_gasto', 'comision_pago', 'gestion_cobranza', 'nota_credito',
                     'trabajador', 'remuneracion', 'concepto_fijo', 'ausencia', 'asistencia_dia', 'movimiento',
                     'quinta_previa') then
    raise exception 'R-81: % no admite anulación', p_tabla;
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'R-81: la anulación requiere motivo'; end if;
  execute format('update %I set anulado_en = now(), anulado_motivo = $1 where id = $2 and anulado_en is null', p_tabla)
    using p_motivo, p_id;
end $$;

create view v_ausencia with (security_invoker = true) as
select a.id, a.trabajador_id, t.empleador_id, t.apellidos_nombres, a.tipo, ta.nombre as tipo_nombre,
       date_trunc('month', a.desde)::date as periodo, a.desde, a.hasta, a.hasta - a.desde + 1 as dias, a.detalle
from ausencia a join trabajador t on t.id = a.trabajador_id join tipo_ausencia ta on ta.codigo = a.tipo
where a.anulado_en is null;

create view v_asistencia_dia with (security_invoker = true) as
select a.id, a.trabajador_id, t.empleador_id, t.apellidos_nombres, date_trunc('month', a.fecha)::date as periodo,
       a.fecha, a.horas_extra, a.feriado_trabajado, a.minutos_tardanza, f.nombre as feriado, a.detalle
from asistencia_dia a join trabajador t on t.id = a.trabajador_id left join feriado f on f.fecha = a.fecha
where a.anulado_en is null;

create view v_movimiento with (security_invoker = true) as
select m.id, m.trabajador_id, t.empleador_id, t.apellidos_nombres, m.periodo, m.concepto, c.nombre as concepto_nombre,
       c.tipo, c.liquidacion, m.monto, m.detalle
from movimiento m join trabajador t on t.id = m.trabajador_id join concepto_planilla c on c.codigo = m.concepto
where m.anulado_en is null;

create view v_concepto_fijo with (security_invoker = true) as
select f.id, f.trabajador_id, f.concepto, c.nombre as concepto_nombre, f.monto, f.desde, f.hasta
from concepto_fijo f join concepto_planilla c on c.codigo = f.concepto
where f.anulado_en is null;

grant select on v_ausencia, v_asistencia_dia, v_movimiento, v_concepto_fijo to authenticated;
revoke all on v_ausencia, v_asistencia_dia, v_movimiento, v_concepto_fijo from anon;
