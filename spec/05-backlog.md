# Backlog

Estado: ✅ hecho · 🔄 en curso · ⬜ pendiente. Cada ítem se acepta cuando su regla tiene
prueba y la vista previa fue validada por el dueño de producto.

## R0 · Fundaciones
- ✅ Rendimiento: permisos evaluados una vez por consulta (la lista de ventas bajó de 13 s a 0.1 s en Supabase)
- ✅ Spec v1 (glosario, reglas, modelo, decisiones)
- ✅ Esquema de datos con catálogos, anulación y cierre mensual
- ✅ Vistas de cálculo únicas (saldos, estados, ventas, ingresos, comisiones, GP)
- ✅ Roles y permisos en la base (Administrador, Tesorería, CEO) + bitácora
- ✅ Migración del sheet con reporte de anomalías
- ✅ Pantalla Validación: cada mes, sistema vs sheet (ventas, planilla, herramientas, comisiones, consumo de pauta)
- ✅ Pruebas de reglas + pruebas doradas contra el sheet (ventas, cobranza por cuota y por contrato, renovaciones, consumo de pauta, costos)
- ✅ Pruebas automáticas en GitHub en cada cambio (reglas + compilación de la app)
- ✅ Repositorio GitHub · ✅ proyecto Supabase con migraciones y datos (igual a local) · 🔄 usuarios en Auth (administrador invitado; faltan Tesorería y CEO) · ✅ hosting Cloudflare Pages (https://manya-erp.pages.dev) · ⬜ respaldos (plan Pro)

## R1 · Ventas y plan de pagos
- ✅ Clientes (alta desde la venta) · ✅ lista y ficha de cliente (deuda, servicios, ventas) · ✅ edición de clientes y marcas · ✅ consulta de RUC en SUNAT · ⬜ cargar el RUC de los 287 clientes (el sheet no lo tiene)
- ✅ Registrar venta (servicio contratado + ciclo) con plantilla de pago → cuotas
- ✅ Editar, agregar y anular cuotas; lo facturado solo lo corrige el administrador (R-13, R-14)
- ✅ Renovaciones: lista por vencer + renovar en un clic (R-51) · ✅ estados vigente / por vencer / vencida / caída, ciclos y aviso de deuda (R-55)
- ✅ Finalizar servicio contratado (R-52)
- ✅ Generar plan de pagos para ventas que no lo tienen
- ✅ Modalidad por venta (R-02, D-21) · ✅ elegirla al registrar la venta

## R2 · Facturación y cobranza
- ✅ Emitir comprobante agrupando cuotas (detracción sugerida por R-22) · ✅ serie y número siguiente por empresa
- ✅ Facturación: todos los comprobantes por empresa, mes y estado; detalle con cuotas, pagos, notas y archivos PDF/XML
- ✅ Notas de crédito total y parcial (R-27, R-28) · ✅ una factura sin efecto se puede volver a facturar
- ✅ Datos fiscales de cada empresa (dirección, ubigeo, series, cuentas) y del cliente (tipo de documento, dirección, correo)
- ✅ Registrar pago de cuota / de comprobante completo (R-32)
- ✅ Cobranza: cartera por antigüedad · ✅ por cliente ("¿Quién nos debe?")
- ✅ Gestión de cobranza: morosos (+60 días) en el dashboard con su plan de acción; registro de llamadas, acuerdos y próximos pasos (R-37, R-38)
- ✅ Autodetracción (R-36): alerta cuando el cliente paga el total sin detracción, hasta subir la constancia · ⬜ revisar las 681 de 2021–2025 que el sheet marca sin detracción ingresada
- ✅ Revisión de datos: lista de ventas con plan descuadrado (426 al migrar)
- ✅ Anular pagos registrados por error · ✅ por operación completa (R-40) · ✅ devoluciones al cliente (R-41) · ✅ N° de operación bancaria
- ✅ Dos empresas (R-39): razón social y RUC; al pagar se proponen las cuentas de la empresa emisora; Revisión lista los 223 pagos que entraron a la cuenta de la otra empresa · ⬜ corregirlos en el sheet o regularizarlos
- ⬜ ¿Estado de resultados y cobranza por empresa? (hoy consolidado, D-06)

## R3 · Rentabilidad
- ✅ GP agencia y por línea (cálculo)
- ✅ Pantallas de GP agencia / línea / venta
- ✅ Planilla y gastos: ver, agregar, editar, anular y copiar del mes anterior (planilla, herramientas, comisiones pagadas)
- ✅ Cierre mensual y tipo de cambio desde Configuración (R-70) · ✅ TC venta SUNAT automático cada día a las 7:00 (D-14) · ✅ pesos de Dirección validados en la base (R-62)
- ✅ Estado de resultados de 12 meses (lo leen los tres roles)
- ✅ Pauta: facturada vs consumida por mes y por contrato (R-64) · ⬜ cargar el consumo real desde mar 2026 (el sheet llega a feb 2026; ya se puede registrar en cada venta)
- ⬜ GP por equipo y cliente (requiere unificar equipos de planilla y contratos)

## R4 · Insights
- ✅ Dashboard: ventas, ingresos, recurrente, facturado, cobrado, GP, margen, cartera en dos miradas, ventas por categoría, top clientes, estructura de costos; cada tarjeta muestra cómo se calcula
- ✅ Cobros esperados 13 semanas (Cobranza), DSO y concentración top 5 (Resumen) · ✅ retención de clientes y clientes caídos (R-53, R-54) · ✅ evolución de ventas desde 2021 · ⬜ proyección que incluya renovaciones aún no registradas

## Después
- ⬜ Integración SUNAT API SIRE (RVIE): importar comprobantes emitidos de ambas empresas
- ⬜ Reclasificación del catálogo a la taxonomía BD_MAD
- ⬜ Control de pauta con consumo real (ManyaPulse)
- ✅ Registrar costos de proveedor (influencers, producción) y consumo de pauta desde la venta, con su GP o control de pauta
- ⬜ Alertas (vencimientos, renovaciones)
- ✅ Catálogos editables en Configuración (servicios, categorías, líneas, cuentas, personas, equipos, sub-áreas, tipos de gestión) · ⬜ plantillas de plan de pagos
- ⬜ Tipo de recibo y forma de pago de la planilla como catálogos (hoy texto con sugerencias)
