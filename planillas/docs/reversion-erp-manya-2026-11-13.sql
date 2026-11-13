-- Reversión en la base del ERP de Manya (ejecutada el 13/11/2026) de lo que se aplicó por error ese día:
-- migraciones de planillas 035–041 y la carga de prueba de HoldingD. Planillas es un sistema
-- independiente: nada suyo vive en la base de Manya. Deja la base como la definen las migraciones de main.
-- Queda solo el valor 'rrhh' del tipo rol de Manya (Postgres no borra valores de un enum; no se usa).
begin;
-- cron de tasas SBS
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobname) from cron.job where jobname = 'tasas-afp-sbs';
  end if;
end $$;
-- bitácora: filas que dejaron las tablas de planillas (datos de HoldingD)
delete from auditoria where tabla in ('afp', 'asistencia_dia', 'ausencia', 'boleta', 'concepto_fijo', 'concepto_planilla', 'empleador', 'empleador_remype', 'feriado', 'motivo_cese', 'movimiento', 'parametro_legal', 'planilla_cierre', 'quinta_previa', 'regimen_derecho', 'remuneracion', 'saldo_vacaciones_inicial', 'tasa_afp', 'tipo_ausencia', 'trabajador', 'tramo_quinta');
-- vistas, tablas, funciones y tipos de planillas
drop view if exists v_asistencia_dia, v_ausencia, v_boleta_linea, v_concepto_fijo, v_cts, v_gratificacion, v_liquidacion, v_liquidacion_linea, v_movimiento, v_pl_asistencia_mes, v_pl_base, v_pl_linea, v_pl_mes, v_pl_observacion, v_pl_quinta, v_pl_variable_mes, v_planilla, v_planilla_resumen, v_provision_mes, v_tasa_afp_periodo, v_trabajador, v_vacacion_periodo, v_vacaciones cascade;
drop table if exists afp, asistencia_dia, ausencia, boleta, concepto_fijo, concepto_planilla, empleador, empleador_remype, feriado, motivo_cese, movimiento, parametro_legal, planilla_cierre, quinta_previa, regimen_derecho, remuneracion, saldo_vacaciones_inicial, tasa_afp, tipo_ausencia, trabajador, tramo_quinta cascade;
drop function if exists actualizar_tasas_afp() cascade;
drop function if exists asig_familiar_en(uuid,date) cascade;
drop function if exists ausencias_en(uuid,date,date) cascade;
drop function if exists bloquear_fijo_cerrado() cascade;
drop function if exists bloquear_planilla_cerrada() cascade;
drop function if exists cerrar_planilla(smallint,date) cascade;
drop function if exists chk_ausencia_cruce() cascade;
drop function if exists chk_concepto_manual() cascade;
drop function if exists cts_calculo(uuid,date,date,date) cascade;
drop function if exists cts_devengado(uuid,date,date) cascade;
drop function if exists cts_semestre(uuid,date) cascade;
drop function if exists cts_semestre_tipo(uuid,date) cascade;
drop function if exists dias_laborales(date,date) cascade;
drop function if exists dias_tramo(date,date) cascade;
drop function if exists fijos_en(uuid,date,boolean) cascade;
drop function if exists fin_mes(date) cascade;
drop function if exists grati_calculo(uuid,date,date,date,date) cascade;
drop function if exists grati_devengado(uuid,date,date) cascade;
drop function if exists grati_semestre(uuid,date) cascade;
drop function if exists grati_semestre_tipo(uuid,date) cascade;
drop function if exists impuesto_quinta(numeric,date) cascade;
drop function if exists integracion_empleador(text) cascade;
drop function if exists integracion_trabajador(smallint,text) cascade;
drop function if exists integrar_asistencia(text,jsonb) cascade;
drop function if exists integrar_ausencias(text,date,date,jsonb) cascade;
drop function if exists integrar_movimientos(text,date,jsonb) cascade;
drop function if exists integrar_trabajadores(text,jsonb) cascade;
drop function if exists legal(parametro_legal_tipo,date) cascade;
drop function if exists meses_completos(date,date) cascade;
drop function if exists opera_planilla() cascade;
drop function if exists parsear_tasas_sbs(text) cascade;
drop function if exists promedio_variable(uuid,date) cascade;
drop function if exists quinta_calculo(integer,numeric,numeric,date,numeric[],numeric,boolean) cascade;
drop function if exists reabrir_planilla(smallint,date,text) cascade;
drop function if exists regimen_en(uuid,date) cascade;
drop function if exists registrar_tasas_afp(date,jsonb,text,text) cascade;
drop function if exists remuneracion_computable(uuid,date,date) cascade;
drop function if exists sbs_numero(text) cascade;
drop function if exists semestre_cts(date) cascade;
drop function if exists semestre_grati(date) cascade;
drop function if exists sueldo_en(uuid,date) cascade;
drop function if exists sueldo_mes(uuid,date,date) cascade;
drop function if exists tasa_afp_en(smallint,date) cascade;
drop function if exists vacaciones_consumidas(uuid,date) cascade;
drop function if exists vacaciones_dias_en(uuid,date) cascade;
drop type if exists comision_afp, parametro_legal_tipo, regimen_laboral, sistema_pension, sistema_salud, tipo_concepto cascade;
-- anular() vuelve a su versión de la migración 028
CREATE OR REPLACE FUNCTION public.anular(p_tabla text, p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
begin
  if p_tabla not in ('venta', 'cuota', 'comprobante', 'pago', 'costo_directo', 'planilla',
                     'herramienta_gasto', 'comision_pago', 'gestion_cobranza', 'nota_credito') then
    raise exception 'R-81: % no admite anulación', p_tabla;
  end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'R-81: la anulación requiere motivo'; end if;
  execute format('update %I set anulado_en = now(), anulado_motivo = $1 where id = $2 and anulado_en is null', p_tabla)
    using p_motivo, p_id;
end $function$;
commit;
