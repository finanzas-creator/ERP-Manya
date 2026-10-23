# Reglas de negocio

Cada regla tiene un ID. El código y las pruebas citan el ID. Los valores marcados
como *(config)* se cambian en Configuración, no en el código.

## Ventas e ingresos
- **R-01** Una venta es un ciclo mensual o un proyecto de un servicio contratado. Su monto es el **precio al cliente**, **neto** (sin IGV), en su moneda (USD o PEN): es lo que se planifica, factura y cobra. Si parte del trabajo lo hace un proveedor, su costo se registra aparte como **costo de proveedor** de la venta.
- **R-02** La modalidad (mensual / proyecto) y la naturaleza (propio / terceros) son atributos del **servicio en el catálogo**. Nunca se deducen del nombre. La modalidad del catálogo es la sugerida: cada venta puede fijar otra (decisión del contrato; p. ej. un sitio web por suscripción mensual), y al renovar se conserva.
- **R-03** Servicios de **terceros** (Pauta, Influencers) se planifican, facturan y cobran, pero **no son venta ni ingreso**. Las comisiones sobre ellos sí lo son.
- **R-04** **Ventas del mes** = suma de la **venta neta** en USD (monto − costos de proveedor) de las ventas no anuladas y de naturaleza propia cuya **fecha de contrato** cae en ese mes.
- **R-05** **Ingresos del mes** (devengado), ventas no anuladas y propias:
  - mensual → todo en su **periodo de servicio** (por defecto, el mes de la fecha de contrato; editable);
  - proyecto → el monto se reparte en partes iguales entre los meses desde la fecha de inicio hasta la fecha de entrega (ambos incluidos). Sin fecha de entrega, todo cae en el mes de inicio.
- **R-06** Conversión a USD: ventas en PEN se dividen entre el **tipo de cambio del mes** (tabla de TC mensual).
- **R-07** La categoría y la línea de negocio de una venta vienen del catálogo (servicio → categoría → línea).

## Plan de pagos (cuotas)
- **R-10** Cada venta tiene una o más cuotas. La suma del neto de sus cuotas debe igualar el neto de la venta; la diferencia se muestra como **falta planificar**. Una diferencia dentro de la tolerancia de redondeo de R-33 cuenta como plan completo (y no se cobra); una venta de monto 0 no necesita cuotas.
- **R-11** Al crear una venta se elige una **plantilla de pago** (100% al inicio, 50/50, 60/40, 100% al finalizar…) que genera las cuotas. Después se pueden editar.
- **R-12** IGV de una cuota = neto × % IGV de la venta (18% por defecto *(config)*; 0% para clientes no domiciliados/exportación).
- **R-13** Lo facturado es un documento legal: el monto de una cuota con comprobante, y el % IGV o la moneda de una venta con cuotas facturadas, solo los puede corregir el **administrador**.
- **R-14** Una cuota con pagos registrados no se anula; primero se anulan sus pagos. Agregar una cuota sin monto la crea por lo que falta planificar.

## Comprobantes
- **R-20** Un comprobante pertenece a una empresa emisora. Su identidad es empresa + tipo + serie-número y no se repite.
- **R-21** Un comprobante agrupa una o más cuotas (pueden ser de varias ventas del mismo cliente). Su total es la suma de sus cuotas (neto + IGV): **nunca se digita**.
- **R-27** Un comprobante emitido no se borra ni se edita: se corrige con una **nota de crédito** (catálogo 09 SUNAT). Una nota **total** (anulación de la operación, error en el RUC, devolución total) deja la factura **sin efecto** y sus cuotas vuelven a *por facturar*: se vuelven a facturar o, si la venta se cayó, se anula la venta. "Anular" un comprobante (R-81) queda solo para registros hechos por error en el sistema.
- **R-28** Una nota **parcial** (descuento, devolución de una parte, ajuste) no puede superar lo que queda de la factura; se reparte entre sus cuotas en proporción a su neto, baja la deuda del cliente (con IGV) y baja el **ingreso** del mes en que se emite. Si luego la factura queda sin efecto, las parciales dejan de aplicar.
- **R-22** Detracción: aplica a facturas con IGV cuyo total supera **S/ 700** *(config)*; el porcentaje es **12%** *(config)* por servicios empresariales. El % se fija en el comprobante al emitirlo (es un dato legal impreso).
- **R-23** Vencimiento de una cuota: la fecha límite del comprobante (según cliente); si no tiene comprobante, la fecha límite de la cuota (según contrato).

## Pagos y cobranza
- **R-30** Un pago se registra contra una **cuota**, en una **cuenta bancaria**, con el monto recibido en la moneda de la cuenta y su tipo de cambio (1 si es USD). Monto USD = monto / TC.
- **R-31** Si la cuenta es de detracciones (Banco de la Nación), el pago cuenta como detracción. Es un atributo de la cuenta, no del nombre del banco.
- **R-32** Pagar un comprobante completo reparte el monto entre sus cuotas con saldo, en proporción a su saldo (se guardan pagos por cuota).
- **R-40** Un pago a una factura completa es **una operación bancaria** aunque se reparta entre cuotas: lleva su N° de operación y se anula entera (solo si se registró por error).
- **R-41** Una **devolución** es dinero que la empresa devuelve al cliente (p. ej. tras una nota de crédito): sale de una cuenta de la empresa emisora, no puede superar lo cobrado de la factura, cuenta en negativo en lo cobrado del mes y vuelve a abrir el saldo. Una cuota se puede anular cuando lo cobrado neto es cero.
- **R-33** Saldo de una cuota = total (neto + IGV) − pagos. Se considera pagada si el saldo es ≤ **5 USD** *(config)* y además ≤ **2.5% del total** *(config)*: absorbe diferencias de cambio y redondeo, pero nunca una detracción pendiente (12%).
- **R-34** Estado de una cuota: *por facturar* (sin comprobante) · *por cobrar* · *vencida* (hoy > vencimiento) · *pagada*.
- **R-35** Un comprobante está pagado al 100% cuando todas sus cuotas están pagadas. Su **fecha de pago completo** es la del pago que lo completó.
- **R-39** Manya son dos empresas independientes: **Templates Art SAC** (RUC 20524981042) y **Manya Media EIRL** (RUC 20606381132). Cada comprobante es de una de ellas (las series del sheet con prefijo "MM" son de Manya Media) y su pago debe entrar a una cuenta de esa misma empresa. Un pago que entró a la cuenta de la otra empresa se registra igual, pero queda marcado para regularizar entre empresas.
- **R-36** Si el cliente paga al banco el total de una factura con detracción (sin depositar la detracción), la agencia debe **autodetraerse**: depositar ella la detracción, en soles redondeados al sol. Queda como alerta pendiente hasta registrar el depósito con su **constancia de pago**. No cambia el saldo del cliente (ya pagó todo). Se exige para facturas emitidas desde una fecha *(config)*.
- **R-37** Un cliente es **moroso** si tiene deuda con más de **60 días** *(config)* de atraso. El dashboard muestra los morosos con su última gestión de cobranza. Cobranza muestra también la cartera **por cliente** ("¿quién nos debe?"): total por cobrar, vencido, mayor atraso y estado de la gestión; suma lo mismo que la cartera por comprobante.
- **R-38** Cada acción de cobranza (llamada, correo, acuerdo de pago…) se registra con fecha, detalle y, si lo hay, el compromiso de pago y el próximo paso. Estado de la gestión: *sin gestión* · *compromiso incumplido* (pasó la fecha prometida) · *seguimiento atrasado* (pasó la fecha del próximo paso) · *en gestión*.

## Comisiones
- **R-40** El % de comisión del partner se guarda en la venta (por defecto, el del servicio contratado).
- **R-41** Comisión de una cuota = neto USD de la cuota × %. Se **gana** en el mes en que su comprobante queda pagado al 100%, incluida la detracción.
- **R-42** Las comisiones pagadas se registran por persona y mes. Pendiente = ganado − pagado.

## Renovaciones
- **R-50** Un servicio contratado mensual activo vence en la **fecha fin** de su último ciclo (antes "Siguiente ciclo"). Los días para renovar se calculan contra hoy.
- **R-51** Renovar crea la siguiente venta copiando la anterior, con inicio = fin del ciclo anterior.
- **R-52** Un servicio contratado se marca *finalizado* cuando no se renueva.
- **R-55** **Estado de una renovación** (servicio mensual activo), según los días para vencer:
  *vigente* (faltan más de `renovacion_aviso_dias`, 30), *por vencer* (faltan 0 a 30),
  *vencida* (venció hace hasta `renovacion_gracia_dias`, 30, sin renovar: hay que decidir) y
  *caída* (venció hace más de 30 sin renovar: el cliente cuenta como caído, R-53). Se muestra cuántos
  ciclos lleva el servicio (ventas del servicio) y la deuda vencida del cliente, porque renovar a un
  cliente con deuda vencida es un riesgo. Las dos ventanas de días son configuración, no números en el código.

- **R-53** **Cliente caído:** tuvo ingreso en los últimos 12 meses y hoy no tiene ingreso este mes ni en adelante (proyectos en curso) ni servicios mensuales vigentes; un servicio vencido hace más de 30 días sin renovar ya no cuenta. Se muestra desde cuándo (el mes siguiente a su último ingreso), si era **recurrente** o de **proyecto**, y su ingreso mensual promedio de los últimos 3 meses (lo que se dejó de facturar).
- **R-54** **Retención mensual** (clientes recurrentes): de los clientes con ingreso recurrente el mes anterior, cuántos siguen este mes. Retenidos + perdidos = activos del mes anterior.

## Costos y rentabilidad (de macro a micro)
- **R-60** Los costos en PEN (planilla, comisiones, herramientas en soles) se convierten con el TC del mes.
- **R-61** **GP agencia** = ingresos − costos directos de ventas (costos de proveedor) − planilla − herramientas − comisiones pagadas. El costo de proveedor se resta una sola vez: aquí, no en los ingresos.
- **R-62** **GP por línea**: ingresos por línea; costos directos a la línea de su venta; planilla por sub-área → línea; Dirección se reparte por pesos *(config)*; herramientas por participación en el ingreso; el overhead (Administración, Comercial, RR.HH.) queda a nivel agencia.
- **R-63** **GP por equipo, cliente y venta**: el costo de planilla de cada equipo se reparte entre las ventas del equipo según su participación en el ingreso del mes. Ventas sin equipo quedan en "Sin equipo".
- **R-64** Diferencia de pauta = pauta facturada − consumo real. Es un control, no entra al GP.

## Cierre, seguridad y trazabilidad
- **R-70** El cierre mensual bloquea la creación y modificación de registros de ese mes y fija su TC.
- **R-80** Roles: **Administrador** (todo, incluida configuración), **Tesorería** (clientes, ventas, cuotas, comprobantes, pagos y costos), **CEO** (solo lectura de KPIs).
- **R-81** Nada se borra: se anula con motivo. Lo anulado no suma en ningún cálculo.
- **R-82** Todo cambio queda en la bitácora: quién, cuándo, valor anterior y nuevo.
