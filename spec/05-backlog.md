# Backlog

Estado: ✅ hecho · 🔄 en curso · ⬜ pendiente. Cada ítem se acepta cuando su regla tiene
prueba y la vista previa fue validada por el dueño de producto.

## R0 · Fundaciones
- ✅ Spec v1 (glosario, reglas, modelo, decisiones)
- ✅ Esquema de datos con catálogos, anulación y cierre mensual
- ✅ Vistas de cálculo únicas (saldos, estados, ventas, ingresos, comisiones, GP)
- ✅ Roles y permisos en la base (Administrador, Tesorería, CEO) + bitácora
- ✅ Migración del sheet con reporte de anomalías
- ✅ Pruebas de reglas + pruebas doradas contra el sheet (ventas, cobranza por cuota y por contrato, renovaciones, consumo de pauta, costos)
- ✅ Pruebas automáticas en GitHub en cada cambio (reglas + compilación de la app)
- ✅ Repositorio GitHub · ✅ proyecto Supabase con migraciones y datos (igual a local) · 🔄 usuarios en Auth (administrador invitado; faltan Tesorería y CEO) · ✅ hosting Cloudflare Pages (https://manya-erp.pages.dev) · ⬜ respaldos (plan Pro)

## R1 · Ventas y plan de pagos
- ✅ Clientes (alta desde la venta) · ⬜ edición de clientes y marcas
- ✅ Registrar venta (servicio contratado + ciclo) con plantilla de pago → cuotas
- ✅ Editar, agregar y anular cuotas; lo facturado solo lo corrige el administrador (R-13, R-14)
- ✅ Renovaciones: lista por vencer + renovar en un clic (R-51)
- ✅ Finalizar servicio contratado (R-52)
- ✅ Generar plan de pagos para ventas que no lo tienen
- ✅ Modalidad por venta (R-02, D-21) · ⬜ elegirla en la pantalla de registrar venta (hoy toma la del catálogo)

## R2 · Facturación y cobranza
- ✅ Emitir comprobante agrupando cuotas (detracción sugerida por R-22)
- ✅ Registrar pago de cuota / de comprobante completo (R-32)
- ✅ Cobranza: cartera por antigüedad
- ⬜ Autodetracción (R-36)
- ✅ Revisión de datos: lista de ventas con plan descuadrado (426 al migrar)
- ✅ Anular pagos registrados por error

## R3 · Rentabilidad
- ✅ GP agencia y por línea (cálculo)
- ✅ Pantallas de GP agencia / línea / venta
- ⬜ Carga mensual de planilla, herramientas y comisiones pagadas
- ⬜ Cierre mensual desde la interfaz
- ⬜ GP por equipo y cliente (requiere unificar equipos de planilla y contratos)

## R4 · Insights
- ✅ Dashboard CEO: ventas, ingresos, recurrente, cobrado, GP, margen, cartera
- ⬜ Retención de clientes, concentración top 5, DSO, forecast de caja 90 días

## Después
- ⬜ Integración SUNAT API SIRE (RVIE): importar comprobantes emitidos de ambas empresas
- ⬜ Reclasificación del catálogo a la taxonomía BD_MAD
- ⬜ Control de pauta con consumo real (ManyaPulse)
- ⬜ Registrar el costo real de influencers y otros costos directos desde la interfaz (el sheet no lo tiene; se mantienen en el control de pauta)
- ⬜ Alertas (vencimientos, renovaciones)
