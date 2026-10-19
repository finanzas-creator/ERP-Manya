# Registro de decisiones

Cada decisión indica quién la tomó. Las marcadas *(pendiente de confirmar)* las tomó el
líder técnico con menos de 80% de certeza y conviene validarlas.

| # | Decisión | Por qué | Quién |
|---|---|---|---|
| D-01 | Stack: Supabase (Postgres + Auth + RLS) + React/TypeScript + Vercel + GitHub | Estándar 2026, barato, sin dependencia de un proveedor (Postgres es portable) | Líder técnico |
| D-02 | Toda regla de cálculo vive en vistas SQL; la app no calcula | SSOT: un número no puede diferir entre pantallas | Líder técnico |
| D-03 | Dos vistas de ingreso: ventas por fecha de contrato e ingresos por mes de ejecución | Pedido del negocio | Dueño de producto |
| D-04 | Proyectos: ingreso repartido en partes iguales entre inicio y entrega; mensuales: en su periodo de servicio | Confirmado | Dueño de producto |
| D-05 | GP de macro a micro: agencia → línea → venta (equipo y cliente después) | Confirmado | Dueño de producto |
| D-06 | Dos empresas emisoras, rentabilidad consolidada | Confirmado | Dueño de producto |
| D-07 | Detracción 12% sobre facturas con IGV mayores a S/ 700 | Servicios empresariales | Dueño de producto |
| D-08 | Comisión: % de la venta sobre el neto de cada cuota; se gana cuando su comprobante queda pagado al 100%, detracción incluida | Confirmado | Dueño de producto |
| D-09 | Roles: Administrador, Tesorería, CEO (solo KPIs) | Confirmado | Dueño de producto |
| D-10 | Comprobantes de SUNAT: integración con API SIRE (RVIE) en una fase posterior | Confirmado | Dueño de producto |
| D-11 | "Influencers" es de terceros, como la Pauta | Así lo trata el pivote oficial "Ventas": con esta regla las 630 celdas cuadran | Líder técnico (verificado con datos) |
| D-12 | Pagado = saldo ≤ 5 USD y ≤ 2.5% del total | Reproduce exactamente el criterio "Factura Pagada" del sheet (5,250 de 5,250 cuotas) sin ocultar detracciones pendientes | Líder técnico (verificado con datos) |
| D-13 | Los pagos se registran por cuota; pagar una factura completa los reparte | Es como trabaja hoy tesorería y permite saber qué venta está pagada | Líder técnico |
| D-14 | TC mensual inicial = mediana del TC de los pagos en soles de cada mes | Es el dato real disponible; el administrador puede corregirlo antes del cierre | Líder técnico *(pendiente de confirmar: ¿TC SUNAT venta?)* |
| D-15 | Modalidad de cada servicio = la mayoritaria en el historial (105 filas difieren y quedan reportadas) | El catálogo debe ser único por servicio | Líder técnico |
| D-16 | Mapeo planilla → línea: Performance, Inbound y Área de Proyectos son directos; Dirección y Gerencia se reparten 50/40/10; Administración, Comercial, RR.HH. y Licitaciones son overhead | Heredado del prototipo | Líder técnico *(pendiente de confirmar pesos)* |
| D-17 | Catálogo de servicios: se migra la clasificación actual (9 tipos). La nueva clasificación (pestaña BD_MAD) se aplica después reclasificando en el catálogo, sin tocar código | Reclasificar es un cambio de datos, no de sistema | Líder técnico |
