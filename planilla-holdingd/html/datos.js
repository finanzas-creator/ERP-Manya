/* Sistema de Planilla HoldingD · Catálogos y parámetros legales (R-02, R-03, R-11).
 * Los valores legales son hechos con vigencia y norma: el cálculo toma el vigente en cada fecha.
 * Para actualizar (nueva RMV, UIT del año, tasas AFP del mes) se agrega una fila con su fecha; nunca se
 * cambia una fila anterior. Las tasas AFP de cada mes se registran desde la pestaña Parámetros. */
(function (raiz, fabrica) {
  const datos = fabrica()
  if (typeof module === 'object' && module.exports) module.exports = datos
  else raiz.PLANILLA_DATOS = datos
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  // Parámetros legales con vigencia (fracciones: 0.13 = 13%)
  const legales = [
    { parametro: 'rmv', desde: '2022-05-01', valor: 1025, norma: 'D.S. 003-2022-TR' },
    { parametro: 'rmv', desde: '2025-01-01', valor: 1130, norma: 'D.S. 006-2024-TR' },
    { parametro: 'rmv', desde: '2026-10-01', valor: 1230, norma: 'D.S. 015-2026-TR' },
    { parametro: 'uit', desde: '2024-01-01', valor: 5150, norma: 'D.S. 309-2023-EF' },
    { parametro: 'uit', desde: '2025-01-01', valor: 5350, norma: 'D.S. 260-2024-EF' },
    { parametro: 'uit', desde: '2026-01-01', valor: 5500, norma: 'D.S. 301-2025-EF' },
    { parametro: 'onp', desde: '2000-01-01', valor: 0.13, norma: 'D.L. 19990 (tasa 13%)' },
    { parametro: 'essalud', desde: '2000-01-01', valor: 0.09, norma: 'Ley 26790 (tasa 9%)' },
    { parametro: 'asignacion_familiar', desde: '2000-01-01', valor: 0.10, norma: 'Ley 25129 (10% de la RMV)' },
    { parametro: 'bonificacion_essalud', desde: '2015-07-01', valor: 0.09, norma: 'Ley 30334' },
    { parametro: 'bonificacion_eps', desde: '2015-07-01', valor: 0.0675, norma: 'Ley 30334' },
    { parametro: 'quinta_deduccion_uit', desde: '2015-01-01', valor: 7, norma: 'TUO Ley del Impuesto a la Renta, art. 46' },
    { parametro: 'prima_edad_maxima', desde: '2000-01-01', valor: 65, norma: 'TUO Ley del SPP: sin prima de seguro desde los 65 años' },
    { parametro: 'descanso_medico_dias', desde: '2000-01-01', valor: 20, norma: 'Ley 26790: primeros 20 días a cargo del empleador' },
    { parametro: 'quinta_no_domiciliado', desde: '2015-01-01', valor: 0.30, norma: 'TUO LIR art. 54 inc. c y art. 76' },
    { parametro: 'jornada_minima_horas', desde: '2000-01-01', valor: 4, norma: 'D.S. 001-97-TR art. 4, D.Leg. 713 art. 12, D.Leg. 728 art. 22' },
  ]

  const nombresParametro = {
    rmv: 'Remuneración mínima vital (S/)', uit: 'UIT (S/)', onp: 'ONP', essalud: 'EsSalud',
    asignacion_familiar: 'Asignación familiar (% de la RMV)', bonificacion_essalud: 'Bonificación extraordinaria (EsSalud)',
    bonificacion_eps: 'Bonificación extraordinaria (EPS)', quinta_deduccion_uit: 'Deducción de quinta (UIT)',
    prima_edad_maxima: 'Edad sin prima AFP (años)', descanso_medico_dias: 'Días de descanso médico a cargo del empleador',
    quinta_no_domiciliado: 'Quinta de no domiciliados', jornada_minima_horas: 'Jornada mínima (horas)',
  }
  const parametrosPorcentaje = ['onp', 'essalud', 'asignacion_familiar', 'bonificacion_essalud', 'bonificacion_eps', 'quinta_no_domiciliado']

  // Tramos del impuesto de quinta (en UIT) — TUO LIR art. 53
  const tramosQuinta = [
    { desde: '2015-01-01', desde_uit: 0, tasa: 0.08 },
    { desde: '2015-01-01', desde_uit: 5, tasa: 0.14 },
    { desde: '2015-01-01', desde_uit: 20, tasa: 0.17 },
    { desde: '2015-01-01', desde_uit: 35, tasa: 0.20 },
    { desde: '2015-01-01', desde_uit: 45, tasa: 0.30 },
  ]

  // Derechos por régimen (R-02)
  const regimenes = {
    general: { nombre: 'Régimen general', grati_factor: 1, cts_dias_anio: 30, cts_tope_dias: null, vacaciones_dias: 30,
      indem_dias_anio: null, indem_tope_dias: null, indem_sueldos_anio: 1.5, indem_tope_sueldos: 12 },
    pequena: { nombre: 'Pequeña empresa', grati_factor: 0.5, cts_dias_anio: 15, cts_tope_dias: 90, vacaciones_dias: 15,
      indem_dias_anio: 20, indem_tope_dias: 120, indem_sueldos_anio: null, indem_tope_sueldos: null },
    micro: { nombre: 'Microempresa', grati_factor: 0, cts_dias_anio: 0, cts_tope_dias: null, vacaciones_dias: 15,
      indem_dias_anio: 10, indem_tope_dias: 90, indem_sueldos_anio: null, indem_tope_sueldos: null },
  }

  const afps = [
    { codigo: 'HABITAT', nombre: 'AFP Habitat' }, { codigo: 'INTEGRA', nombre: 'AFP Integra' },
    { codigo: 'PRIMA', nombre: 'Prima AFP' }, { codigo: 'PROFUTURO', nombre: 'Profuturo AFP' },
  ]

  // Tabla SBS de devengue noviembre 2026 (verificada). Las demás se registran mes a mes (R-03).
  const tasasAfp = [
    ['HABITAT', 0.0147, 0.0125], ['INTEGRA', 0.0155, 0.0078], ['PRIMA', 0.0160, 0.0125], ['PROFUTURO', 0.0169, 0.0068],
  ].map(([afp, flujo, saldo]) => ({
    periodo: '2026-11-01', afp, aporte: 0.10, prima: 0.0137, comision_flujo: flujo, comision_mixta: 0,
    comision_saldo: saldo, remuneracion_maxima: 12732.70, fuente: 'manual',
    sustento: 'Tabla SBS "Comisiones y primas" devengue 2026-11, verificada el 12/11/2026',
  }))

  // Conceptos de la boleta y sus afectaciones (R-11)
  const c = (codigo, nombre, tipo, plame, es, pen, q, extra, comp, vari, prov, manual, liq, orden) =>
    ({ codigo, nombre, tipo, plame, afecto_essalud: es, afecto_pension: pen, afecto_quinta: q, quinta_extraordinaria: extra,
       computable: comp, variable: vari, cubierto_provision: prov, manual, liquidacion: liq, orden })
  const conceptos = [
    c('SUELDO', 'Remuneración básica', 'ingreso', '0121', true, true, true, false, false, false, false, false, false, 10),
    c('ASIG_FAMILIAR', 'Asignación familiar', 'ingreso', '0201', true, true, true, false, false, false, false, false, false, 20),
    c('REM_VACACIONAL', 'Remuneración vacacional', 'ingreso', '0118', true, true, true, false, false, false, true, false, false, 30),
    c('SUBSIDIO_IT', 'Subsidio por incapacidad temporal', 'ingreso', null, false, false, true, false, false, false, false, false, false, 40),
    c('SUBSIDIO_MAT', 'Subsidio por maternidad', 'ingreso', null, false, false, true, false, false, false, false, false, false, 41),
    c('HE25', 'Horas extra 25%', 'ingreso', '0105', true, true, true, true, true, true, false, false, false, 50),
    c('HE35', 'Horas extra 35%', 'ingreso', '0106', true, true, true, true, true, true, false, false, false, 51),
    c('FERIADO', 'Trabajo en feriado o día de descanso', 'ingreso', '0107', true, true, true, true, false, false, false, false, false, 52),
    c('GRATI', 'Gratificación (Ley 27735)', 'ingreso', '0406', false, false, true, false, false, false, true, false, false, 70),
    c('BONIF_EXTRA', 'Bonificación extraordinaria (Ley 30334)', 'ingreso', '0312', false, false, true, false, false, false, true, false, false, 71),
    c('DEVOL_QUINTA', 'Devolución de retención de quinta', 'ingreso', null, false, false, false, false, false, false, false, false, false, 90),
    c('BONO_FIJO', 'Bonificación fija', 'ingreso', null, true, true, true, false, true, false, false, true, false, 60),
    c('COMISION', 'Comisiones', 'ingreso', null, true, true, true, true, true, true, false, true, false, 61),
    c('BONO_PRODUCTIVIDAD', 'Bono por productividad', 'ingreso', null, true, true, true, true, true, true, false, true, false, 62),
    c('BONO_EXTRA', 'Bonificación extraordinaria no regular', 'ingreso', null, true, true, true, true, false, false, false, true, false, 63),
    c('REINTEGRO', 'Reintegro de remuneraciones', 'ingreso', null, true, true, true, true, false, false, false, true, false, 64),
    c('MOVILIDAD', 'Movilidad supeditada a asistencia', 'ingreso', null, false, false, false, false, false, false, false, true, false, 65),
    c('OTRO_NO_REM', 'Otro ingreso no remunerativo', 'ingreso', null, false, false, false, false, false, false, false, true, false, 66),
    c('TARDANZA', 'Descuento por tardanzas', 'descuento', '0704', true, true, true, false, false, false, false, false, false, 110),
    c('DOMINICAL', 'Descuento de descanso semanal por faltas', 'descuento', '0705', true, true, true, false, false, false, false, false, false, 111),
    c('ONP', 'ONP (SNP)', 'descuento', '0607', false, false, false, false, false, false, false, false, false, 120),
    c('AFP_APORTE', 'AFP aporte obligatorio', 'descuento', '0608', false, false, false, false, false, false, false, false, false, 121),
    c('AFP_PRIMA', 'AFP prima de seguro', 'descuento', '0606', false, false, false, false, false, false, false, false, false, 122),
    c('AFP_COMISION', 'AFP comisión', 'descuento', '0601', false, false, false, false, false, false, false, false, false, 123),
    c('QUINTA', 'Renta de quinta categoría', 'descuento', '0605', false, false, false, false, false, false, false, false, false, 124),
    c('ADELANTO', 'Adelanto de remuneración', 'descuento', '0701', false, false, false, false, false, false, false, true, false, 130),
    c('PRESTAMO', 'Cuota de préstamo', 'descuento', '0706', false, false, false, false, false, false, false, true, false, 131),
    c('JUDICIAL', 'Retención judicial', 'descuento', '0703', false, false, false, false, false, false, false, true, false, 132),
    c('DESC_OTRO', 'Otro descuento autorizado', 'descuento', '0706', false, false, false, false, false, false, false, true, false, 133),
    c('ESSALUD', 'EsSalud (aporte del empleador)', 'aporte', '0804', false, false, false, false, false, false, false, false, false, 200),
    c('CTS_PENDIENTE', 'CTS del semestre anterior (no depositada)', 'ingreso', '0904', false, false, false, false, false, false, false, false, true, 299),
    c('CTS', 'CTS trunca', 'ingreso', '0904', false, false, false, false, false, false, false, false, true, 300),
    c('GRATI_TRUNCA', 'Gratificación trunca', 'ingreso', '0407', false, false, true, false, false, false, false, false, true, 301),
    c('BONIF_TRUNCA', 'Bonificación extraordinaria trunca (Ley 30334)', 'ingreso', '0313', false, false, true, false, false, false, false, false, true, 302),
    c('VAC_PENDIENTE', 'Vacaciones ganadas no gozadas', 'ingreso', '0118', true, true, true, false, false, false, false, false, true, 303),
    c('VAC_TRUNCA', 'Vacaciones truncas', 'ingreso', '0114', true, true, true, false, false, false, false, false, true, 304),
    c('INDEM_VACACIONAL', 'Indemnización vacacional (vacaciones vencidas)', 'ingreso', null, false, false, false, false, false, false, false, false, true, 305),
    c('INDEM_DESPIDO', 'Indemnización por despido arbitrario', 'ingreso', null, false, false, false, false, false, false, false, false, true, 306),
    c('DESC_LIQUIDACION', 'Descuento autorizado en la liquidación', 'descuento', '0706', false, false, false, false, false, false, false, true, true, 330),
  ]

  // Tipos de ausencia (R-05): con qué concepto se pagan sus días (null = no se pagan) y qué computan
  const a = (codigo, nombre, concepto_pago, cts, grati, vac, es_vacaciones, es_dm, reduce_desc, orden) =>
    ({ codigo, nombre, concepto_pago, computable_cts: cts, computable_grati: grati, computable_vacaciones: vac,
       es_vacaciones, es_descanso_medico: es_dm, reduce_descanso_semanal: reduce_desc, orden })
  const tiposAusencia = [
    a('FALTA', 'Falta injustificada', null, false, false, false, false, false, true, 10),
    a('LICENCIA_SG', 'Licencia sin goce', null, false, false, false, false, false, false, 20),
    a('SUSPENSION', 'Suspensión disciplinaria', null, false, false, false, false, false, false, 30),
    a('LICENCIA_CG', 'Licencia con goce', 'SUELDO', true, true, true, false, false, false, 40),
    a('DESCANSO_MEDICO', 'Descanso médico (a cargo del empleador)', 'SUELDO', true, true, true, false, true, false, 50),
    a('SUBSIDIO_IT', 'Incapacidad temporal subsidiada por EsSalud', 'SUBSIDIO_IT', true, true, true, false, false, false, 60),
    a('MATERNIDAD', 'Maternidad (subsidio EsSalud)', 'SUBSIDIO_MAT', true, true, true, false, false, false, 70),
    a('PATERNIDAD', 'Licencia por paternidad', 'SUELDO', true, true, true, false, false, false, 80),
    a('VACACIONES', 'Vacaciones', 'REM_VACACIONAL', true, true, true, true, false, false, 90),
  ]

  const motivosCese = [
    { codigo: 'RENUNCIA', nombre: 'Renuncia voluntaria', indemniza: false },
    { codigo: 'FIN_CONTRATO', nombre: 'Vencimiento del contrato', indemniza: false },
    { codigo: 'MUTUO_DISENSO', nombre: 'Mutuo disenso', indemniza: false },
    { codigo: 'DESPIDO_ARBITRARIO', nombre: 'Despido arbitrario', indemniza: true },
    { codigo: 'DESPIDO_JUSTIFICADO', nombre: 'Despido por causa justa (falta grave)', indemniza: false },
    { codigo: 'NO_SUPERA_PRUEBA', nombre: 'No supera el periodo de prueba', indemniza: false },
    { codigo: 'FALLECIMIENTO', nombre: 'Fallecimiento', indemniza: false },
    { codigo: 'JUBILACION', nombre: 'Jubilación', indemniza: false },
  ]

  // Feriados nacionales (avisos; el pago lo decide el registro de asistencia)
  const feriados = []
  for (const anio of [2025, 2026, 2027]) {
    for (const [md, nombre] of [['01-01', 'Año Nuevo'], ['05-01', 'Día del Trabajo'], ['06-07', 'Batalla de Arica y Día de la Bandera'],
      ['06-29', 'San Pedro y San Pablo'], ['07-23', 'Día de la Fuerza Aérea del Perú'], ['07-28', 'Fiestas Patrias'],
      ['07-29', 'Fiestas Patrias'], ['08-06', 'Batalla de Junín'], ['08-30', 'Santa Rosa de Lima'], ['10-08', 'Combate de Angamos'],
      ['11-01', 'Todos los Santos'], ['12-08', 'Inmaculada Concepción'], ['12-09', 'Batalla de Ayacucho'], ['12-25', 'Navidad']]) {
      feriados.push({ fecha: `${anio}-${md}`, nombre })
    }
  }
  feriados.push({ fecha: '2025-04-17', nombre: 'Jueves Santo' }, { fecha: '2025-04-18', nombre: 'Viernes Santo' },
    { fecha: '2026-04-02', nombre: 'Jueves Santo' }, { fecha: '2026-04-03', nombre: 'Viernes Santo' },
    { fecha: '2027-03-25', nombre: 'Jueves Santo' }, { fecha: '2027-03-26', nombre: 'Viernes Santo' })

  return { legales, nombresParametro, parametrosPorcentaje, tramosQuinta, regimenes, afps, tasasAfp, conceptos,
    tiposAusencia, motivosCese, feriados }
})
