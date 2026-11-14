# Sistema de Planilla HoldingD · versión HTML

Un solo archivo, **`dist/sistema-planilla-holdingd.html`**, que se abre con doble clic en cualquier
navegador (Chrome, Edge, Firefox). No necesita servidor, base de datos ni instalación. Calcula lo mismo
que la versión con base de datos: las pruebas comprueban que los dos motores dan el mismo resultado al
céntimo (21 casos de reglas y 727 montos reales de HoldingD de octubre a diciembre de 2026, 0 diferencias).

## Para usarlo

1. Abre `sistema-planilla-holdingd.html`.
2. **Datos → Cargar Excel**: elige la planilla mensual en Excel (formato HoldingD). Registra el empleador,
   los trabajadores, sueldos, AFP/ONP, CUSPP, asignación familiar, rentas de quinta del año, adelantos y
   las tasas AFP del mes. (Leer Excel necesita internet la primera vez: usa la librería SheetJS de cdnjs.)
3. **Planilla del mes**: revisa los montos y las observaciones; abre cada boleta. Al **cerrar** el mes se
   emiten las boletas (copia fiel que ya no cambia) y las novedades del mes quedan bloqueadas.
4. Cada mes: registra las novedades (faltas, vacaciones, descansos, subsidios, horas extra, feriados,
   tardanzas, bonos, adelantos) y, en **Parámetros**, las tasas AFP que publica la SBS.
5. **Respaldo**: los datos se guardan solo en ese navegador. Exporta un respaldo (JSON) con frecuencia;
   el mismo archivo sirve para pasar los datos a otro equipo (Datos → Restaurar respaldo).

Qué calcula: sueldo (ponderado si cambia a mitad de mes), asignación familiar, vacaciones, horas extra
25 %/35 %, feriados, faltas, tardanzas, dominical; AFP (aporte, prima con tope y edad, comisión) con las
tasas del mes, ONP, EsSalud (mínimo la RMV), quinta categoría (proyección, gratificaciones, diciembre,
no domiciliados); gratificaciones de julio y diciembre con bonificación; CTS de mayo y noviembre;
provisiones mensuales que suman exactamente lo pagado; vacaciones pendientes, vencidas, adelantadas y
truncas; liquidaciones con indemnización por despido según régimen; simulación de liquidaciones;
constancia de depósito de CTS; boletas y liquidaciones imprimibles (o en PDF) con el formato de HoldingD.
Las reglas y su sustento legal están en [`../spec/02-reglas.md`](../spec/02-reglas.md).

## Archivos

| Archivo | Qué es |
|---|---|
| `dist/sistema-planilla-holdingd.html` | Todo junto en un archivo (lo que se usa y se entrega) |
| `datos.js` | Valores legales con vigencia y norma (RMV, UIT, ONP, EsSalud…), tramos de quinta, regímenes, AFP, conceptos de boleta con su código PLAME, tipos de ausencia, motivos de cese, feriados |
| `motor.js` | Motor de cálculo: funciones puras, sin dependencias, funciona en navegador y en Node |
| `importar.js` | Lectura del Excel de planilla de HoldingD (mismo criterio que `etl/planilla_excel.py`) |
| `app.js`, `index.html` | Pantallas |
| `construir.js` | Arma el archivo único: `node html/construir.js` |
| `pruebas/motor.test.js` | Pruebas: `node html/pruebas/motor.test.js` |
| `herramientas/estado_desde_sql.sql` | Exporta la base SQL del sistema al formato de datos de esta versión |

Para actualizar un valor legal (nueva RMV o UIT) no hace falta programar: **Parámetros → Valores legales
→ Agregar nuevo valor** con su fecha de vigencia. Para dejarlo fijo para todos, se agrega la fila en
`datos.js` (nunca se cambia una fila anterior) y se vuelve a construir.

## Para el área de sistemas: integrarlo al ERP

Hay dos formas, de menos a más integrada.

**1. Intercambiar el archivo de datos (JSON).** El ERP genera el mismo JSON que exporta el sistema y el
usuario lo restaura; o el ERP lee el respaldo exportado para tomar las boletas emitidas.

**2. Usar el motor dentro del ERP.** `motor.js` + `datos.js` no dependen de nada: se cargan en el
navegador (`<script>`) o en Node (`require`). El ERP arma el estado con sus propios datos y lee los
resultados; las pantallas del ERP muestran lo que devuelve el motor, sin repetir cálculos.

```js
const { crearMotor } = require('./motor.js')          // en navegador: window.PlanillaMotor
const M = crearMotor(estado, { hoy: '2026-11-14' })    // hoy: corte de vacaciones (por defecto, la fecha del equipo)

M.planilla(empleadorId, '2026-10-01')   // { filas: [...una por trabajador], observaciones, resumen }
M.boletaLineas(trabajadorId, '2026-10-01')   // conceptos de la boleta: { concepto, nombre, tipo, plame, cantidad, monto }
M.boleta(trabajadorId, '2026-10-01')    // boleta completa (la emitida si el mes está cerrado)
M.provisiones(empleadorId, '2026-10-01')     // gratificación, bonificación, CTS y vacaciones del mes
M.gratificaciones(empleadorId, '2026-07-01') // semestre ene–jun ('2026-01-01') o jul–dic ('2026-07-01')
M.cts(empleadorId, '2026-05-01')        // semestre nov–abr ('2025-11-01') o may–oct ('2026-05-01')
M.vacaciones(trabajadorId)              // ganados, gozados, pendientes, vencidos, adelantados, truncos y montos
M.liquidacion(trabajadorId)             // liquidación al cese (requiere fecha_cese y motivo_cese)
M.cerrar(empleadorId, '2026-10-01', usuario)   // devuelve el registro de cierre con las boletas; el ERP lo guarda en estado.cierres
```

Todas las fechas son texto `AAAA-MM-DD`; los meses, el día 1 (`2026-10-01`); los montos, en soles; las
tasas, en fracción (`0.13` = 13 %).

### Formato del estado (los datos de entrada)

Solo hechos y decisiones humanas: nada calculado. Un registro no se borra: se anula con
`anulado: true` y `anulado_motivo`.

```js
{
  empleadores: [{ id, razon_social, ruc, direccion, inicio_planilla: '2026-10-01',   // primer mes que calcula el sistema
                  descuento_dominical: false, dias_laborables_semana: 6,
                  remype: [{ categoria: 'pequena' | 'micro', desde, hasta, constancia }] }],
  trabajadores: [{
    id, empleador_id, codigo_externo,            // codigo_externo = id del trabajador en el ERP de personal
    tipo_documento: 'DNI' | 'CE' | 'PASAPORTE', numero_documento, apellidos_nombres, cargo, fecha_nacimiento,
    fecha_ingreso, fecha_cese, motivo_cese,      // motivo: RENUNCIA, DESPIDO_ARBITRARIO, FIN_CONTRATO… (datos.js → motivosCese)
    fecha_fin_contrato, periodo_prueba_meses: 3, regimen_pactado: null,   // null = según REMYPE e ingreso
    sistema_pension: 'onp' | 'afp' | 'sin_sistema', afp: 'HABITAT' | 'INTEGRA' | 'PRIMA' | 'PROFUTURO',
    comision_afp: 'flujo' | 'mixta', cuspp, asignacion_familiar: false, salud: 'essalud' | 'eps' | 'sis',
    domiciliado: true, jornada_horas: 8, banco, cuenta_sueldo, banco_cts, cuenta_cts, correo,
    remuneraciones: [{ desde, sueldo, motivo }],              // historial de sueldo básico
    fijos: [{ concepto: 'MOVILIDAD', monto, desde: '2026-01-01', hasta: null }],   // montos de todos los meses
    quinta_previa: [{ anio, renta, retencion, detalle }],     // rentas del año fuera del sistema
    saldo_vacaciones: { al, dias, detalle },                  // días pendientes al empezar a usar el sistema
  }],
  ausencias:   [{ id, trabajador_id, tipo: 'FALTA' | 'VACACIONES' | 'DESCANSO_MEDICO' | 'SUBSIDIO_IT' | …, desde, hasta, detalle }],
  asistencia:  [{ id, trabajador_id, fecha, horas_extra, feriado_trabajado, minutos_tardanza }],   // un registro por día
  movimientos: [{ id, trabajador_id, periodo: '2026-10-01', concepto: 'BONO_PRODUCTIVIDAD' | 'ADELANTO' | …, monto, detalle }],
  cierres:     [{ empleador_id, periodo, cerrado_en, cerrado_por, boletas: [...] }],   // lo que devuelve M.cerrar()
  parametros: {
    tasas_afp: [{ periodo, afp, aporte, prima, comision_flujo, comision_mixta, comision_saldo, remuneracion_maxima, fuente, sustento }],
    legales:   [{ parametro: 'rmv', desde: '2027-01-01', valor: 1300, norma: 'D.S. …' }],   // valores nuevos, se suman a datos.js
  },
}
```

Los códigos válidos de `tipo` de ausencia y de `concepto` están en `datos.js` (`tiposAusencia`,
`conceptos` con `manual: true`).

### Reglas que debe respetar el ERP

- No guardar montos calculados: siempre pedirlos al motor (si cambian las tasas o una novedad, el
  resultado cambia solo). Lo único congelado es la boleta del mes cerrado (`cierres`).
- No registrar ni anular novedades de un mes cerrado (R-24): el sistema las bloquea; para corregir, se
  reabre el mes (anulando su cierre con motivo) y se vuelve a cerrar.
- Las tasas AFP del mes se registran cuando la SBS las publica; mientras tanto el motor usa las últimas y
  marca el mes como provisional (no deja cerrar).
