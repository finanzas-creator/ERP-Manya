# Modelo de datos · Planillas

**Regla de oro:** se guardan **hechos** (normas vigentes, tasas publicadas, lo que pasó con cada
trabajador). Todo lo demás se **calcula** en vistas. Si un número se puede calcular, no tiene columna.
Excepción: la boleta emitida al cerrar (documento legal, D-07).

## Qué se guarda

```
PLANILLAS (por empleador; ver R-01…R-29)
  parametro_legal (RMV, UIT, ONP, EsSalud… con vigencia y norma) · tramo_quinta · regimen_derecho
  afp · tasa_afp (periodo de devengue, fuente SBS o manual) · feriado
  concepto_planilla (afectaciones) · tipo_ausencia · motivo_cese
  empleador (razón social, RUC, mes de inicio) ─< empleador_remype (categoría y desde cuándo)
    └─< trabajador (documento, ingreso, cese y motivo, pensión, CUSPP, salud, jornada, régimen pactado)
          ├─< remuneracion (sueldo básico con vigencia) · concepto_fijo (bonos fijos, movilidad)
          ├─< ausencia (tipo, desde, hasta) · asistencia_dia (horas extra, feriado trabajado, tardanza)
          ├─< movimiento (mes, concepto, monto: bonos, comisiones, adelantos, descuentos)
          └── quinta_previa (rentas y retenciones de otros empleadores) · saldo_vacaciones_inicial
  planilla_cierre (empleador, mes) ─< boleta (copia fiel emitida, entrega)

CONTROL
  usuario (rol: admin · rrhh) · auditoria (bitácora)
```

## Qué se calcula (vistas)

| Vista | Responde | Reglas |
|---|---|---|
| `v_trabajador` | Trabajador con régimen del día, sueldo vigente y estado | R-01, R-02 |
| `v_tasa_afp_periodo` | Tasas AFP que usa cada mes (exactas o provisionales) | R-03 |
| `v_pl_mes` | Cada trabajador y mes: vínculo, días por tipo, sueldo, horas extra | R-04–R-10 |
| `v_pl_linea` | Ingresos y descuentos de cada trabajador y mes (con sus afectaciones) | R-06–R-11, R-17 |
| `v_pl_base` → `v_pl_quinta` | Bases afectas y retención de quinta mes a mes | R-11, R-14 |
| `v_boleta_linea` · `v_planilla` · `v_planilla_resumen` | Boleta completa, neto, EsSalud, costo; totales por empleador y mes | R-12–R-15 |
| `v_gratificacion` · `v_cts` | Cada semestre: computable, meses/días, monto, bonificación, pago o trunca | R-16–R-18 |
| `v_provision_mes` | Provisión de grati, bonificación, CTS y vacaciones por devengado | R-19 |
| `v_vacacion_periodo` · `v_vacaciones` | Periodos ganados, gozados, pendientes, vencidos, adelantos y truncas | R-20 |
| `v_liquidacion_linea` · `v_liquidacion` | Liquidación de beneficios de cada cese | R-21–R-23 |
| `v_pl_observacion` | Lo que falta revisar antes de cerrar | R-03, R-25 |
| `v_ausencia` · `v_asistencia_dia` · `v_movimiento` · `v_concepto_fijo` | Novedades con nombres, para las pantallas (sin cálculo) | R-05 |

