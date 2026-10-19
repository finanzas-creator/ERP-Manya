# Modelo de datos

**Regla de oro:** se guardan **hechos** (lo que pasó o lo que alguien decidió). Todo lo
demás se **calcula** en vistas. Si un número se puede calcular, no tiene columna.

## Qué se guarda

```
CATÁLOGOS (los edita el administrador)
  empresa                Templates · Manya Media
  linea_negocio          Performance · Proyectos · Inbound
  categoria  → línea     Performance, Gestión de medios, UX/UI, Soporte…
  servicio   → categoría  + modalidad (mensual/proyecto) + naturaleza (propio/terceros)
  equipo · persona · cuenta_bancaria (+ es_detraccion) · plantilla_pago
  tipo_cambio_mensual · sub_area (+ grupo de costo) · peso_direccion · config

OPERACIÓN (registra tesorería)
  cliente ─< marca
  servicio_contratado (cliente, marca, servicio, estado)
    └─< venta (fecha_contrato, fecha_fin, periodo_servicio, moneda, monto_neto, %IGV,
               equipo, partner, %comisión)
          ├─< costo_directo (proveedor | consumo de pauta)
          └─< cuota (concepto, monto_neto, fecha_límite) ──> comprobante (empresa, tipo,
                │                                              serie-número, emisión,
                │                                              vencimiento, %detracción)
                └─< pago (fecha, cuenta, monto, TC)

COSTOS
  planilla (persona, sub-área, equipo, costo) · herramienta_gasto · comision_pago

CONTROL
  usuario (rol) · auditoria · cierre_mensual
```

## Qué se calcula (vistas)

| Vista | Responde | Reglas |
|---|---|---|
| `v_venta_base` | Venta con catálogo y monto en USD | R-02, R-06, R-07 |
| `v_cuota` | Total, pagado (banco/detracción), saldo, vencimiento, estado | R-12, R-23, R-30–R-34 |
| `v_comprobante` | Totales, detracción, pagado al 100% y cuándo | R-21, R-22, R-35 |
| `v_venta` | Planificado, falta planificar, facturado, cobrado, estados | R-10 |
| `v_cobranza` | Cartera pendiente con antigüedad | R-34 |
| `v_renovacion` | Servicios mensuales activos y días para vencer | R-50 |
| `v_ventas_mes` | Ventas por fecha de contrato | R-03, R-04 |
| `v_ingreso_venta_mes` / `v_ingresos_mes` | Ingresos por mes de ejecución | R-05 |
| `v_comision_cuota` / `v_comision_persona_mes` | Comisión ganada vs pagada | R-41, R-42 |
| `v_costos_mes` | Planilla, herramientas, comisiones y directos en USD | R-60 |
| `v_gp_agencia_mes` → `v_gp_linea_mes` → `v_gp_venta` | GP de macro a micro (cuadran entre sí) | R-61–R-63 |
| `v_control_pauta` | Pauta facturada vs consumida | R-64 |
| `v_kpi_mes`, `v_kpi_hoy`, `v_kpi_linea_mes` | Indicadores para el CEO | R-80 |

## Equivalencias con el sheet

| Sheet | Sistema |
|---|---|
| Contratos (fila) | `venta` |
| ID del servicio contratado | `servicio_contratado` |
| Tipo de servicio / Servicio contratado | `categoria` / `servicio` |
| Plan de facturación (fila) | `cuota` |
| N° de recibo | `comprobante` (una factura agrupa varias cuotas) |
| Pagos de facturas | `pago` |
| Siguiente ciclo | `venta.fecha_fin` |
| Estado de renovación, Pagos hechos, Falta planificar, ¿Factura cancelada?… | calculados en vistas |
| Ventas / Ventas por mes | `v_ventas_mes` |
| Cobranzas pendientes / según factura | `v_cobranza` |
| Ganancia y pérdida | `v_gp_*` |
| Pauta / Comisión sobre la pauta | `v_control_pauta`, servicios de terceros |
