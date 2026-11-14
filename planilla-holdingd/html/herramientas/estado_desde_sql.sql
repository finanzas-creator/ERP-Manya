-- Exporta la base SQL del sistema al "estado" JSON que recibe el motor JavaScript (ver html/LEEME.md).
-- Sirve para pasar datos de la versión con base de datos a la versión HTML y para comparar ambos motores.
-- Uso: psql -At -d planilla_holdingd -f html/herramientas/estado_desde_sql.sql > estado.json
select jsonb_build_object(
  'empleadores', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'razon_social', e.razon_social, 'ruc', e.ruc, 'nombre_comercial', e.nombre_comercial, 'direccion', e.direccion,
      'inicio_planilla', e.inicio_planilla, 'descuento_dominical', e.descuento_dominical, 'dias_laborables_semana', e.dias_laborables_semana,
      'remype', (select coalesce(jsonb_agg(jsonb_build_object('categoria', r.categoria, 'desde', r.desde, 'hasta', r.hasta, 'constancia', r.constancia)
                   order by r.desde), '[]') from empleador_remype r where r.empleador_id = e.id)) order by e.id), '[]')
    from empleador e),
  'trabajadores', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', t.id, 'empleador_id', t.empleador_id, 'codigo_externo', t.codigo_externo, 'tipo_documento', t.tipo_documento,
      'numero_documento', t.numero_documento, 'apellidos_nombres', t.apellidos_nombres, 'fecha_nacimiento', t.fecha_nacimiento,
      'cargo', t.cargo, 'domiciliado', t.domiciliado, 'fecha_ingreso', t.fecha_ingreso, 'fecha_cese', t.fecha_cese,
      'motivo_cese', t.motivo_cese, 'fecha_fin_contrato', t.fecha_fin_contrato, 'periodo_prueba_meses', t.periodo_prueba_meses,
      'regimen_pactado', t.regimen_pactado, 'sistema_pension', t.sistema_pension, 'afp', a.codigo, 'comision_afp', t.comision_afp,
      'cuspp', t.cuspp, 'asignacion_familiar', t.asignacion_familiar, 'salud', t.salud, 'jornada_horas', t.jornada_horas,
      'banco', t.banco, 'cuenta_sueldo', t.cuenta_sueldo, 'banco_cts', t.banco_cts, 'cuenta_cts', t.cuenta_cts, 'correo', t.correo,
      'remuneraciones', (select coalesce(jsonb_agg(jsonb_build_object('desde', r.vigente_desde, 'sueldo', r.sueldo_basico, 'motivo', r.motivo)
                          order by r.vigente_desde), '[]') from remuneracion r where r.trabajador_id = t.id and r.anulado_en is null),
      'fijos', (select coalesce(jsonb_agg(jsonb_build_object('concepto', f.concepto, 'monto', f.monto, 'desde', f.desde, 'hasta', f.hasta)), '[]')
                from concepto_fijo f where f.trabajador_id = t.id and f.anulado_en is null),
      'quinta_previa', (select coalesce(jsonb_agg(jsonb_build_object('anio', q.anio, 'renta', q.renta_bruta, 'retencion', q.retencion, 'detalle', q.detalle)), '[]')
                        from quinta_previa q where q.trabajador_id = t.id and q.anulado_en is null),
      'saldo_vacaciones', (select jsonb_build_object('al', s.al, 'dias', s.dias_pendientes, 'detalle', s.detalle)
                           from saldo_vacaciones_inicial s where s.trabajador_id = t.id))) order by t.apellidos_nombres), '[]')
    from trabajador t left join afp a on a.id = t.afp_id where t.anulado_en is null),
  'ausencias', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'trabajador_id', x.trabajador_id, 'tipo', x.tipo, 'desde', x.desde,
      'hasta', x.hasta, 'detalle', x.detalle)), '[]') from ausencia x where x.anulado_en is null),
  'asistencia', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'trabajador_id', x.trabajador_id, 'fecha', x.fecha,
      'horas_extra', x.horas_extra, 'feriado_trabajado', x.feriado_trabajado, 'minutos_tardanza', x.minutos_tardanza)), '[]')
    from asistencia_dia x where x.anulado_en is null),
  'movimientos', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'trabajador_id', x.trabajador_id, 'periodo', x.periodo,
      'concepto', x.concepto, 'monto', x.monto, 'detalle', x.detalle)), '[]') from movimiento x where x.anulado_en is null),
  'cierres', '[]'::jsonb,
  'parametros', jsonb_build_object('tasas_afp', (select coalesce(jsonb_agg(jsonb_build_object('periodo', t.periodo, 'afp', a.codigo,
      'aporte', t.aporte, 'prima', t.prima, 'comision_flujo', t.comision_flujo, 'comision_mixta', t.comision_mixta,
      'comision_saldo', t.comision_saldo, 'remuneracion_maxima', t.remuneracion_maxima, 'fuente', t.fuente, 'sustento', t.sustento)), '[]')
    from tasa_afp t join afp a on a.id = t.afp_id))
);
