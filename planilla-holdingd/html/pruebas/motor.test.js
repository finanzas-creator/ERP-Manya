// Pruebas del motor JavaScript: los mismos casos y montos de db/tests/10_planilla.sql (calculados a mano).
// Ejecutar: node html/pruebas/motor.test.js
'use strict'
const assert = require('node:assert/strict')
const { crearMotor, DATOS, fechas } = require('../motor.js')

let fallas = 0, total = 0
function caso(nombre, fn) {
  total++
  try { fn(); console.log('  ok  ' + nombre) } catch (e) { fallas++; console.log('  MAL ' + nombre + '\n      ' + e.message.split('\n')[0]) }
}
const igual = (real, esperado, msg) => assert.equal(real, esperado, `${msg}: obtuvo ${real}, esperaba ${esperado}`)

// ---------------- Estado de prueba (igual que el SQL)
const tasasPrueba = []
for (let m = '2026-01-01'; m <= '2026-10-01'; m = fechas.sumarMeses(m, 1))
  for (const t of DATOS.tasasAfp) tasasPrueba.push({ ...t, periodo: m, fuente: 'manual', sustento: 'prueba' })

function estadoBase() {
  const T = (id, emp, doc, nombre, ingreso, cese, motivo, pension, afp, comision, cuspp, af, jornada, sueldo) => ({
    id, empleador_id: emp, numero_documento: doc, apellidos_nombres: nombre, fecha_ingreso: ingreso, fecha_cese: cese,
    motivo_cese: motivo, sistema_pension: pension, afp, comision_afp: comision, cuspp, asignacion_familiar: af, jornada_horas: jornada,
    remuneraciones: [{ desde: ingreso, sueldo }], fijos: [], quinta_previa: [],
    saldo_vacaciones: ingreso < '2026-01-01' ? { al: '2026-01-01', dias: 0 } : null,
  })
  const ts = [
    T('ana', 1, '10000001', 'ANA (AFP flujo)', '2025-03-01', null, null, 'afp', 'INTEGRA', 'flujo', 'CUSPP1', false, 8, 3000),
    T('beto', 1, '10000002', 'BETO (antes del REMYPE)', '2019-06-01', null, null, 'onp', null, null, null, true, 8, 2000),
    T('caro', 1, '10000003', 'CARO (novedades)', '2025-01-01', null, null, 'afp', 'PRIMA', 'mixta', 'CUSPP3', false, 8, 2400),
    T('dani', 1, '10000004', 'DANI (despido)', '2023-02-01', '2026-09-30', 'DESPIDO_ARBITRARIO', 'afp', 'HABITAT', 'flujo', 'CUSPP4', false, 8, 3600),
    T('eli', 1, '10000005', 'ELI (renuncia)', '2023-01-01', '2026-06-30', 'RENUNCIA', 'onp', null, null, null, false, 8, 2000),
    T('fabi', 2, '10000006', 'FABI (micro)', '2025-01-01', null, null, 'onp', null, null, null, false, 8, 1130),
    T('gabo', 1, '10000007', 'GABO (medio tiempo)', '2025-01-01', null, null, 'onp', null, null, null, false, 4, 700),
  ]
  ts.find((t) => t.id === 'dani').saldo_vacaciones = { al: '2026-01-01', dias: 15 }
  ts.find((t) => t.id === 'eli').saldo_vacaciones = { al: '2026-01-01', dias: 30 }
  return {
    empleadores: [
      { id: 1, razon_social: 'EMPLEADOR PEQUEÑA SAC', ruc: '20000000001', inicio_planilla: '2026-01-01', remype: [{ categoria: 'pequena', desde: '2020-01-01' }] },
      { id: 2, razon_social: 'EMPLEADOR MICRO EIRL', ruc: '20000000002', inicio_planilla: '2026-01-01', remype: [{ categoria: 'micro', desde: '2020-01-01' }] },
    ],
    trabajadores: ts,
    ausencias: [
      { trabajador_id: 'caro', tipo: 'FALTA', desde: '2026-03-10', hasta: '2026-03-11' },
      { trabajador_id: 'caro', tipo: 'SUBSIDIO_IT', desde: '2026-04-01', hasta: '2026-04-10' },
      { trabajador_id: 'dani', tipo: 'VACACIONES', desde: '2026-03-02', hasta: '2026-03-16' },
      { trabajador_id: 'dani', tipo: 'VACACIONES', desde: '2026-06-01', hasta: '2026-06-15' },
      { trabajador_id: 'dani', tipo: 'VACACIONES', desde: '2026-08-03', hasta: '2026-08-08' },
    ],
    asistencia: [
      { trabajador_id: 'caro', fecha: '2026-03-05', horas_extra: 3 },
      { trabajador_id: 'caro', fecha: '2026-03-15', feriado_trabajado: true },
      { trabajador_id: 'caro', fecha: '2026-03-20', minutos_tardanza: 30 },
    ],
    movimientos: [
      { trabajador_id: 'caro', periodo: '2026-03-01', concepto: 'BONO_PRODUCTIVIDAD', monto: 300 },
      { trabajador_id: 'caro', periodo: '2026-03-01', concepto: 'ADELANTO', monto: 500 },
    ],
    cierres: [],
    parametros: { tasas_afp: tasasPrueba },
  }
}
const HOY = '2026-11-14'
const linea = (M, tid, periodo, concepto) => M.boletaLineas(tid, periodo).filter((l) => l.concepto === concepto).reduce((a, l) => a + l.monto, 0)
const lineaLiq = (M, tid, concepto) => { const l = M.liquidacion(tid).lineas.find((x) => x.concepto === concepto); return l ? l.monto : undefined }
const suma = (xs) => Math.round(xs.reduce((a, x) => a + x, 0) * 100) / 100
const meses = (desde, hasta) => { const r = []; for (let m = desde; m <= hasta; m = fechas.sumarMeses(m, 1)) r.push(m); return r }

console.log('Motor de planilla · reglas')
const est = estadoBase()
const M = crearMotor(est, { hoy: HOY })

caso('R-01 régimen según REMYPE e ingreso', () => {
  igual(M.regimenEn('ana', '2026-01-31'), 'pequena', 'ana'); igual(M.regimenEn('beto', '2026-01-31'), 'general', 'beto')
  igual(M.regimenEn('fabi', '2026-01-31'), 'micro', 'fabi')
})
caso('R-04 días del mes', () => {
  igual(fechas.diasTramo('2026-02-01', '2026-02-28'), 30, 'feb'); igual(fechas.diasTramo('2026-01-15', '2026-01-31'), 17, 'parcial')
  igual(fechas.diasLaborales('2026-05-01', '2026-09-30'), 150, '5 meses')
})
caso('R-12 AFP flujo, R-13 EsSalud', () => {
  igual(linea(M, 'ana', '2026-01-01', 'AFP_APORTE'), 300, 'aporte'); igual(linea(M, 'ana', '2026-01-01', 'AFP_PRIMA'), 41.10, 'prima')
  igual(linea(M, 'ana', '2026-01-01', 'AFP_COMISION'), 46.50, 'comisión'); igual(linea(M, 'ana', '2026-01-01', 'ESSALUD'), 270, 'essalud')
})
caso('R-06, R-12 ONP y asignación familiar con alza de RMV', () => {
  igual(linea(M, 'beto', '2026-01-01', 'ASIG_FAMILIAR'), 113, 'AF'); igual(linea(M, 'beto', '2026-01-01', 'ONP'), 274.69, 'ONP')
  igual(linea(M, 'beto', '2026-10-01', 'ASIG_FAMILIAR'), 123, 'AF oct')
})
caso('R-14 quinta: retención anual = impuesto anual', () => {
  igual(linea(M, 'ana', '2026-01-01', 'QUINTA'), 5.13, 'enero')
  igual(suma(meses('2026-01-01', '2026-12-01').map((m) => M.quintaMes('ana', m).retencion)), 61.60, 'año')
})
caso('R-17 gratificaciones por régimen', () => {
  igual(linea(M, 'ana', '2026-07-01', 'GRATI'), 1500, 'grati'); igual(linea(M, 'ana', '2026-07-01', 'BONIF_EXTRA'), 135, 'bonif')
  igual(linea(M, 'beto', '2026-07-01', 'GRATI'), 2113, 'general'); igual(linea(M, 'beto', '2026-12-01', 'GRATI'), 2123, 'dic')
  igual(linea(M, 'fabi', '2026-07-01', 'GRATI'), 0, 'micro')
  igual(suma(meses('2026-01-01', '2026-12-01').map((m) => { const p = M.provisionMes('fabi', m); return p.gratificacion + p.cts })), 0, 'micro sin provisiones')
  igual(M.gratiSemestre('caro', '2026-01-01').monto, 1186.67, 'faltas')
})
caso('R-18 CTS', () => {
  igual(M.ctsSemestre('ana', '2025-11-01').monto, 812.50, 'mayo'); igual(M.ctsSemestre('ana', '2026-05-01').monto, 812.50, 'noviembre')
  igual(M.ctsSemestre('beto', '2025-11-01').monto, 1232.59, 'general')
})
caso('R-19 provisiones suman lo pagado', () => {
  igual(suma(meses('2026-01-01', '2026-06-01').map((m) => M.provisionMes('ana', m).gratificacion)), 1500, 'grati ene–jun')
  igual(suma(meses('2026-05-01', '2026-10-01').map((m) => M.provisionMes('ana', m).cts)), 812.50, 'cts may–oct')
  igual(suma(meses('2026-07-01', '2026-12-01').map((m) => M.provisionMes('beto', m).gratificacion)), 2123, 'grati jul–dic')
  igual(M.provisionMes('ana', '2026-01-01').vacaciones, 125, 'vacaciones')
})
caso('R-15 costo empresa de julio', () => {
  igual(M.filaPlanilla('ana', '2026-07-01').costo_empresa, 4635 - 1635 + 270 + 250 + 22.5 + 156.25 + 125, 'costo')
})
caso('R-05…R-11 novedades de CARO', () => {
  igual(linea(M, 'caro', '2026-03-01', 'SUELDO'), 2240, 'sueldo'); igual(linea(M, 'caro', '2026-03-01', 'HE25'), 25, 'he25')
  igual(linea(M, 'caro', '2026-03-01', 'HE35'), 13.50, 'he35'); igual(linea(M, 'caro', '2026-03-01', 'FERIADO'), 160, 'feriado')
  igual(linea(M, 'caro', '2026-03-01', 'TARDANZA'), 5, 'tardanza'); igual(linea(M, 'caro', '2026-03-01', 'AFP_APORTE'), 273.35, 'base')
  igual(linea(M, 'caro', '2026-03-01', 'AFP_COMISION'), 0, 'mixta')
  const f = M.filaPlanilla('caro', '2026-03-01')
  igual(f.ingresos, 2738.50, 'ingresos'); igual(linea(M, 'caro', '2026-03-01', 'ADELANTO'), 500, 'adelanto')
  igual(f.neto, Math.round((f.ingresos - M.boletaLineas('caro', '2026-03-01').filter((l) => l.tipo === 'descuento').reduce((a, l) => a + l.monto, 0)) * 100) / 100, 'neto')
  igual(linea(M, 'caro', '2026-04-01', 'SUBSIDIO_IT'), 800, 'subsidio'); igual(linea(M, 'caro', '2026-04-01', 'ESSALUD'), 144, 'essalud')
  igual(linea(M, 'gabo', '2026-01-01', 'ESSALUD'), 101.70, 'mínimo RMV')
  assert.ok(M.observaciones(1, '2026-01-01').some((o) => o.trabajador_id === 'gabo' && o.codigo === 'SUELDO_MENOR_RMV'), 'R-25 sueldo < RMV')
})
caso('R-20 vacaciones', () => {
  const d = M.vacaciones('dani')
  igual(d.dias_ganados, 45, 'ganados'); igual(d.dias_gozados, 51, 'gozados'); igual(d.dias_adelantados, 6, 'adelantados')
  igual(d.dias_pendientes, 0, 'pendientes'); igual(d.dias_vencidos, 0, 'vencidos'); igual(d.dias_trunca, 10, 'trunca')
  const e = M.vacaciones('eli')
  igual(e.dias_pendientes, 30, 'eli pendientes'); igual(e.dias_vencidos, 15, 'eli vencidos'); igual(e.dias_trunca, 7.5, 'eli trunca')
})
caso('R-21…R-23 liquidación de DANI (despido)', () => {
  igual(lineaLiq(M, 'dani', 'CTS'), 812.50, 'cts'); igual(lineaLiq(M, 'dani', 'GRATI_TRUNCA'), 900, 'grati')
  igual(lineaLiq(M, 'dani', 'BONIF_TRUNCA'), 81, 'bonif'); igual(lineaLiq(M, 'dani', 'VAC_TRUNCA'), 480, 'vac trunca')
  igual(lineaLiq(M, 'dani', 'INDEM_DESPIDO'), 8800, 'indemnización'); igual(lineaLiq(M, 'dani', 'AFP_APORTE'), 48, 'afp')
  igual(suma(meses('2026-01-01', '2026-09-01').map((m) => M.quintaMes('dani', m).retencion)), 459.94, 'retenido')
  igual(lineaLiq(M, 'dani', 'DEVOL_QUINTA'), 459.94, 'devolución'); igual(M.quintaMes('dani', '2026-09-01').retencion, 0, 'mes de cese')
  const l = M.liquidacion('dani'); igual(l.neto, 11471.80, 'neto'); igual(l.fecha_limite_pago, '2026-10-02', '48 horas')
})
caso('R-21 liquidación de ELI (renuncia)', () => {
  igual(lineaLiq(M, 'eli', 'INDEM_DESPIDO'), undefined, 'sin indemnización'); igual(lineaLiq(M, 'eli', 'VAC_PENDIENTE'), 2000, 'pendientes')
  igual(lineaLiq(M, 'eli', 'INDEM_VACACIONAL'), 1000, 'vencidas'); igual(lineaLiq(M, 'eli', 'VAC_TRUNCA'), 500, 'truncas')
  igual(lineaLiq(M, 'eli', 'GRATI_TRUNCA'), 1000, 'grati'); igual(lineaLiq(M, 'eli', 'CTS'), 166.67, 'cts'); igual(lineaLiq(M, 'eli', 'ONP'), 325, 'onp')
  igual(M.boletaLineas('eli', '2026-07-01').length, 0, 'después del cese')
})
caso('R-03 tasas AFP exactas y provisionales', () => {
  assert.ok(!M.observaciones(1, '2026-03-01').some((o) => o.codigo === 'TASAS_AFP'), 'marzo exacto')
  assert.ok(crearMotor({ ...est, parametros: { tasas_afp: tasasPrueba.filter((t) => t.periodo < '2026-11-01') } }, { hoy: HOY })
    .observaciones(1, '2026-12-01').some((o) => o.codigo === 'TASAS_AFP' && o.bloquea), 'diciembre provisional bloquea')
  assert.ok(M.filaPlanilla('ana', '2026-12-01').tasas_provisionales, 'marca provisional')
  igual(linea(M, 'ana', '2026-12-01', 'AFP_APORTE'), 300, 'usa las del último mes')
})
caso('R-24 cierre: boletas fieles; no cierra con bloqueos', () => {
  const ci = M.cerrar(1, '2026-03-01', 'prueba')
  igual(ci.boletas.length, M.planilla(1, '2026-03-01').filas.length, 'boletas')
  const caro = ci.boletas.find((b) => b.trabajador_id === 'caro')
  igual(caro.neto, M.filaPlanilla('caro', '2026-03-01').neto, 'copia fiel'); assert.ok(caro.datos.lineas.length >= 8, 'líneas')
  const M2 = crearMotor({ ...est, cierres: [ci] }, { hoy: HOY })
  assert.ok(M2.filaPlanilla('caro', '2026-03-01').cerrada && M2.boleta('caro', '2026-03-01').emitida, 'emitida')
  assert.ok(!M2.observaciones(1, '2026-03-01').some((o) => o.codigo === 'BOLETA_DIFIERE'), 'coincide')
  assert.throws(() => M2.cerrar(1, '2026-03-01'), /ya está cerrada/)
  const sinCuspp = estadoBase(); sinCuspp.trabajadores.find((t) => t.id === 'ana').cuspp = null
  assert.throws(() => crearMotor(sinCuspp, { hoy: HOY }).cerrar(1, '2026-04-01'), /CUSPP/)
})

// segundo bloque de casos del SQL
const est2 = estadoBase()
est2.trabajadores.push({ id: 'hugo', empleador_id: 1, numero_documento: '10000008', apellidos_nombres: 'HUGO (cese en mayo)', fecha_ingreso: '2025-06-01',
  fecha_cese: '2026-05-10', motivo_cese: 'RENUNCIA', sistema_pension: 'onp', remuneraciones: [{ desde: '2025-06-01', sueldo: 3000 }], saldo_vacaciones: { al: '2026-01-01', dias: 0 } })
est2.trabajadores.find((t) => t.id === 'ana').fijos = [{ concepto: 'MOVILIDAD', monto: 300, desde: '2026-01-01' }]
const M3 = crearMotor(est2, { hoy: HOY })
caso('R-21 CTS no depositada al cesar antes del 15 de mayo; R-14 fijos no afectos', () => {
  igual(lineaLiq(M3, 'hugo', 'CTS_PENDIENTE'), 812.50, 'pendiente'); igual(lineaLiq(M3, 'hugo', 'CTS'), 41.67, 'trunca')
  igual(M3.quintaMes('ana', '2026-01-01').retencion, 5.13, 'movilidad no se proyecta'); igual(linea(M3, 'ana', '2026-01-01', 'MOVILIDAD'), 300, 'fijo pagado')
})
caso('R-25 rentas de quinta previas', () => {
  assert.ok(!M3.observaciones(1, '2026-03-01').some((o) => o.trabajador_id === 'hugo' && o.codigo === 'QUINTA_PREVIA'), 'año completo')
  const e = estadoBase(); e.empleadores[1].inicio_planilla = '2026-03-01'
  assert.ok(crearMotor(e, { hoy: HOY }).observaciones(2, '2026-03-01').some((o) => o.trabajador_id === 'fabi' && o.codigo === 'QUINTA_PREVIA' && o.bloquea), 'bloquea')
  e.trabajadores.find((t) => t.id === 'fabi').quinta_previa = [{ anio: 2026, renta: 2260, retencion: 0 }]
  assert.ok(!crearMotor(e, { hoy: HOY }).observaciones(2, '2026-03-01').some((o) => o.codigo === 'QUINTA_PREVIA'), 'registrada')
})
const est3 = estadoBase()
est3.trabajadores.push(
  { id: 'ivo', empleador_id: 1, numero_documento: '10000011', apellidos_nombres: 'IVO (3 horas, despedido)', fecha_ingreso: '2024-01-01', fecha_cese: '2026-10-31',
    motivo_cese: 'DESPIDO_ARBITRARIO', sistema_pension: 'onp', jornada_horas: 3, remuneraciones: [{ desde: '2024-01-01', sueldo: 1000 }], saldo_vacaciones: { al: '2026-01-01', dias: 0 } },
  { id: 'juan', empleador_id: 1, numero_documento: '10000012', apellidos_nombres: 'JUAN (alza a mitad de mes)', fecha_ingreso: '2025-01-01', sistema_pension: 'onp',
    remuneraciones: [{ desde: '2025-01-01', sueldo: 3000 }, { desde: '2026-03-16', sueldo: 4000 }], saldo_vacaciones: { al: '2026-01-01', dias: 0 } },
  { id: 'kiko', empleador_id: 1, numero_documento: '10000021', apellidos_nombres: 'KIKO (ingresa el 20)', fecha_ingreso: '2026-03-20', sistema_pension: 'onp',
    remuneraciones: [{ desde: '2026-03-20', sueldo: 1500 }] },
  { id: 'luz', empleador_id: 1, tipo_documento: 'CE', numero_documento: '000000022', apellidos_nombres: 'LUZ (no domiciliada)', fecha_ingreso: '2026-01-01',
    sistema_pension: 'onp', domiciliado: false, remuneraciones: [{ desde: '2026-01-01', sueldo: 2000 }] })
est3.ausencias.push({ trabajador_id: 'juan', tipo: 'FALTA', desde: '2026-02-01', hasta: '2026-02-14' },
  { trabajador_id: 'juan', tipo: 'LICENCIA_SG', desde: '2026-02-15', hasta: '2026-02-28' },
  { trabajador_id: 'beto', tipo: 'MATERNIDAD', desde: '2026-05-01', hasta: '2026-05-31' })
const M4 = crearMotor(est3, { hoy: HOY })
caso('Jornada < 4 h: sin vacaciones, CTS ni indemnización', () => {
  assert.ok(!M4.liquidacion('ivo').lineas.some((l) => ['VAC_PENDIENTE', 'VAC_TRUNCA', 'INDEM_VACACIONAL', 'INDEM_DESPIDO', 'CTS'].includes(l.concepto)), 'liquidación')
  igual(suma(meses('2026-01-01', '2026-10-01').map((m) => M4.provisionMes('ivo', m).vacaciones)), 0, 'provisión')
})
caso('R-06 sueldo ponderado; R-04 ausencias que cubren el mes; R-05 subsidio + AF', () => {
  igual(M4.lineasMes('juan', '2026-03-01').find((l) => l.concepto === 'SUELDO').monto, 3500, 'mitad de mes')
  assert.ok(!M4.lineasMes('juan', '2026-02-01').some((l) => l.concepto === 'SUELDO'), 'febrero sin sueldo')
  igual(suma(M4.lineasMes('beto', '2026-05-01').filter((l) => ['ASIG_FAMILIAR', 'SUBSIDIO_MAT'].includes(l.concepto)).map((l) => l.monto)), 2113, 'subsidio + AF')
})
caso('R-01 cadena REMYPE continua', () => {
  const e = estadoBase(); e.empleadores[0].remype = [{ categoria: 'pequena', desde: '2020-01-01', hasta: '2023-12-31' }, { categoria: 'pequena', desde: '2024-01-01' }]
  const Mx = crearMotor(e, { hoy: HOY })
  igual(Mx.regimenEn('beto', '2026-01-31'), 'general', 'beto'); igual(Mx.regimenEn('caro', '2026-01-31'), 'pequena', 'caro')
  igual(Mx.regimenEn('dani', '2026-01-31'), 'pequena', 'dani')
})
caso('D-06 EsSalud mínimo RMV completa; R-14 no domiciliado 30%', () => {
  igual(linea(M4, 'kiko', '2026-03-01', 'SUELDO'), 600, 'parcial'); igual(linea(M4, 'kiko', '2026-03-01', 'ESSALUD'), 101.70, 'mínimo')
  igual(M4.quintaMes('luz', '2026-01-01').retencion, 600, 'no domiciliado')
})

// ---------------- Conciliación con la planilla HoldingD de octubre 2026 (solo si existe el archivo local, no versionado)
const path = require('node:path'), fs = require('node:fs')
const archivo = path.join(__dirname, '../../data/estado_holdingd.json')
if (fs.existsSync(archivo)) {
  console.log('Conciliación HoldingD octubre 2026')
  const H = crearMotor(JSON.parse(fs.readFileSync(archivo, 'utf8')), { hoy: HOY })
  caso('Neto de octubre = Excel (41,938.41 ± 0.01)', () => {
    const neto = H.planilla(1, '2026-10-01').resumen.neto
    assert.ok(Math.abs(neto - 41938.41) <= 0.011, `neto ${neto}`)
  })
}

console.log(`\n${total - fallas}/${total} casos correctos`)
process.exit(fallas ? 1 : 0)
