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
- **R-43** Un pago a una factura completa es **una operación bancaria** aunque se reparta entre cuotas: lleva su N° de operación y se anula entera (solo si se registró por error).
- **R-44** Una **devolución** es dinero que la empresa devuelve al cliente (p. ej. tras una nota de crédito): sale de una cuenta de la empresa emisora, no puede superar lo cobrado de la factura, cuenta en negativo en lo cobrado del mes y vuelve a abrir el saldo. Una cuota se puede anular cuando lo cobrado neto es cero.
- **R-33** Saldo de una cuota = total (neto + IGV) − pagos. Se considera pagada si el saldo es ≤ **5 USD** *(config)* y además ≤ **2.5% del total** *(config)*: absorbe diferencias de cambio y redondeo, pero nunca una detracción pendiente (12%).
- **R-34** Estado de una cuota: *por facturar* (sin comprobante) · *por cobrar* · *vencida* (hoy > vencimiento) · *pagada*.
- **R-35** Un comprobante está pagado al 100% cuando todas sus cuotas están pagadas. Su **fecha de pago completo** es la del pago que lo completó.
- **R-39** Manya son dos empresas independientes: **Templates Art SAC** (RUC 20524981042) y **Manya Media EIRL** (RUC 20606381132). Cada comprobante es de una de ellas (las series del sheet con prefijo "MM" son de Manya Media) y su pago debe entrar a una cuenta de esa misma empresa. Un pago que entró a la cuenta de la otra empresa se registra igual, pero queda marcado para regularizar entre empresas.
- **R-36** Si el cliente paga al banco el total de una factura con detracción (sin depositar la detracción), la agencia debe **autodetraerse**: depositar ella la detracción, en soles redondeados al sol. Queda como alerta pendiente hasta registrar el depósito con su **constancia de pago**. No cambia el saldo del cliente (ya pagó todo). Se exige para facturas emitidas desde una fecha *(config)*.
- **R-37** Un cliente es **moroso** si tiene deuda con más de **60 días** *(config)* de atraso. El dashboard muestra los morosos con su última gestión de cobranza. Cobranza muestra también la cartera **por cliente** ("¿quién nos debe?"): total por cobrar, vencido, mayor atraso y estado de la gestión; suma lo mismo que la cartera por comprobante.
- **R-38** Cada acción de cobranza (llamada, correo, acuerdo de pago…) se registra con fecha, detalle y, si lo hay, el compromiso de pago y el próximo paso. Estado de la gestión: *sin gestión* · *compromiso incumplido* (pasó la fecha prometida) · *seguimiento atrasado* (pasó la fecha del próximo paso) · *en gestión*.
- **R-45** **Ingreso cobrado (base caja):** lo cobrado en el mes, de las dos empresas, **sin IGV** y **sin la pauta de clientes** (ventas de naturaleza *terceros*), en soles. Es el "ingreso" del Cash Summary. Lo cobrado total se explica así: ingreso cobrado + IGV de lo propio + pauta de clientes (con su IGV) = todo lo que entró al banco, incluidas las detracciones. Los pagos en soles cuentan por su monto; los pagos en dólares, con el TC del mes (R-60). Cada concepto se muestra también por empresa.
- **R-46** **Cuentas por cobrar** (como en el balance) = por cada contrato firmado hasta hoy, su total con IGV menos lo cobrado; un saldo dentro de la tolerancia (R-33) no cuenta. Incluye lo que aún no se factura y la pauta de clientes. Se separa en: *facturado vencido* · *facturado por vencer* · *por facturar* (firmado, sin comprobante o sin plan de pagos). Es lo mismo que la columna "Pagos pendientes" de la pestaña Contratos del sheet.

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

## Planillas (régimen laboral MYPE y general)
Módulo para calcular la planilla de cualquier **empleador** (HoldingD y las demás entidades). El
empleador es independiente de las empresas emisoras de comprobantes. Montos en soles. Los valores
legales (RMV, UIT, tasas AFP, ONP, EsSalud, tramos de quinta) son **hechos con vigencia**: se
guardan una vez con su norma y el cálculo toma el vigente en cada fecha; nunca están en el código.

### Régimen y parámetros
- **R-100** **Régimen laboral de un trabajador** en una fecha: el pactado, si se registró (decisión
  humana, p. ej. derechos del régimen general por contrato); si no, la categoría REMYPE del
  empleador (*micro* o *pequeña*) vigente en esa fecha, **solo si el trabajador ingresó después de
  la inscripción**; si no, *general*. Quien ingresó antes del REMYPE conserva el régimen general.
- **R-101** Derechos por régimen *(catálogo `regimen_derecho`)*: gratificación (general 1 sueldo,
  pequeña ½, micro 0 por semestre), CTS (general 30 remuneraciones diarias por año, pequeña 15 con
  tope de 90 acumuladas, micro 0), vacaciones (general 30 días, MYPE 15) e indemnización por
  despido arbitrario (general 1.5 sueldos por año con tope 12; pequeña 20 remuneraciones diarias por
  año con tope 120; micro 10 con tope 90).
- **R-102** **Tasas AFP del periodo** (aporte, prima de seguro, comisión sobre flujo, comisión
  mixta y remuneración máxima asegurable) se toman de la SBS para el **mes exacto de devengue**,
  automáticamente al inicio de cada mes (y a pedido desde Parámetros). Si la SBS no responde, el
  administrador las registra a mano con su sustento. Sin tasas del mes exacto, la planilla se
  calcula con las del último mes disponible, se marca **provisional** y no se puede cerrar.

### Planilla del mes
- **R-103** **Días del mes**: un mes completo de vínculo son 30 días; un mes parcial (ingreso o
  cese) cuenta sus días calendario, con tope 30. Una ausencia que cubre todo el vínculo del mes
  cuenta todos sus días.
- **R-104** **Ausencias** *(catálogo `tipo_ausencia`)*: cada tipo dice con qué concepto se pagan
  sus días (ninguno = no se pagan: falta injustificada, licencia sin goce, suspensión; sueldo:
  licencia con goce, descanso médico a cargo del empleador; remuneración vacacional; subsidio de
  EsSalud) y si cuentan para CTS, gratificación y récord vacacional.
- **R-105** **Sueldo del mes** = sueldo básico vigente / 30 × días pagados como sueldo. La
  **asignación familiar** (10% de la RMV) se paga completa si el trabajador la tiene registrada; en
  MYPE no es obligatoria: se registra solo si corresponde o se pactó. Los conceptos fijos
  (bonos, movilidad) se pagan en proporción a los días no descontados.
- **R-106** **Remuneración vacacional** de los días de vacaciones gozados en el mes = (básico +
  promedio de remuneraciones variables regulares) / 30 × días. Se paga en el mes del goce.
- **R-107** **Horas extra**: se registran por día. Por día, las 2 primeras horas llevan 25% de
  recargo y las siguientes 35%. Valor hora = (básico + asignación familiar) / 30 / horas de la
  jornada diaria.
- **R-108** **Trabajo en feriado o en el día de descanso** sin descanso sustitutorio: se pagan 2
  remuneraciones diarias adicionales (la labor más la sobretasa de 100%). Con descanso sustitutorio
  no se registra.
- **R-109** **Tardanzas**: se descuenta el valor hora por los minutos. **Faltas**: no se paga el
  día; si el empleador lo configura, además se descuenta la parte proporcional del descanso
  semanal (1/5 o 1/6 de la remuneración diaria por falta, según días laborables por semana).
- **R-110** Cada **concepto** *(catálogo `concepto_planilla`)* dice si es ingreso o descuento, si
  está afecto a EsSalud, a pensión (ONP/AFP) y a quinta categoría, si es extraordinario para la
  quinta, si es computable para beneficios y si es variable. Las bases de cálculo son la suma de los
  ingresos afectos menos los descuentos afectos (p. ej. tardanzas). Ningún cálculo pregunta por el
  nombre del concepto.
- **R-111** **Pensión**: ONP 13% de la base. AFP: aporte 10% de la base + prima de seguro sobre la
  base con tope en la remuneración máxima asegurable (no paga prima quien tiene más de 65 años) +
  comisión sobre flujo (afiliados a flujo) o comisión mixta (afiliados a mixta), con las tasas del
  periodo (R-102).
- **R-112** **EsSalud** (cargo del empleador): 9% de la base afecta, con mínimo la RMV en
  proporción a los días no subsidiados. EPS: se muestra el 9% (el crédito EPS se concilia aparte).
- **R-113** **Quinta categoría** (procedimiento SUNAT, art. 40 del reglamento): renta proyectada =
  ingresos afectos de meses anteriores (de este empleador y de otros, o anteriores al sistema,
  según certificado) + ingresos ordinarios del mes + remuneración ordinaria mensual × meses que
  faltan + gratificaciones ordinarias que faltan; menos 7 UIT; impuesto por tramos (8%, 14%, 17%,
  20%, 30% hasta 5, 20, 35, 45 UIT y más). Retención: ene–mar ÷12; abr (− retenido ene–mar) ÷9;
  may–jul (− ene–abr) ÷8; ago (− ene–jul) ÷5; set–nov (− ene–ago) ÷4; dic = impuesto − retenido
  ene–nov. Los ingresos extraordinarios del mes (horas extra, bonos no regulares) suman la
  diferencia de impuesto que generan. Lo retenido en meses cerrados es el de su boleta emitida.
- **R-114** **Neto a pagar** = ingresos − descuentos (pensión, quinta, adelantos, préstamos,
  descuentos autorizados). **Costo empresa** = ingresos (salvo los cubiertos por provisión:
  gratificación, bonificación y remuneración vacacional) + EsSalud + provisiones del mes (R-118).

### Beneficios sociales
- **R-115** **Remuneración computable** a una fecha = básico + asignación familiar + conceptos fijos
  computables + promedio de cada concepto variable computable cobrado en al menos 3 de los 6 meses
  anteriores (suma ÷ 6). Para la CTS se suma 1/6 de la gratificación cobrada en el semestre.
- **R-116** **Gratificación** (julio y diciembre) = remuneración computable × factor del régimen ×
  meses calendario completos del semestre (ene–jun, jul–dic) ÷ 6, menos 1/30 de la fracción mensual
  por cada día no computable. Se paga en la planilla de julio o diciembre a quien está laborando
  al 1 de julio / 15 de diciembre; si cesó antes, es **trunca** y va en la liquidación (mínimo un mes
  completo). **Bonificación extraordinaria** (Ley 30334): 9% de la gratificación (6.75% con EPS).
  Ambas están inafectas a EsSalud y pensión, y afectas a quinta.
- **R-117** **CTS** por semestre (nov–abr se deposita en mayo, may–oct en noviembre) =
  remuneración computable / 30 × días de CTS ganados; días ganados = días por año del régimen ×
  días computables del semestre / 360 (con el tope acumulado de la pequeña empresa). Requiere un
  mes de servicio (los días de quien no lo cumplía pasan al semestre siguiente) y jornada de al menos
  4 horas. Inafecta a todo.
- **R-118** **Provisiones mensuales**: la provisión de gratificación, bonificación y CTS de un mes
  es lo **devengado** al cierre del mes menos lo devengado al cierre del mes anterior. En el mes de
  pago (o de cese) lo devengado es lo pagado: la suma de las provisiones del semestre **es** el
  beneficio pagado, sin ajuste manual. Vacaciones: remuneración computable / 360 × días por año ×
  días computables del mes.
- **R-119** **Vacaciones**: cada año completo de servicio gana los días del régimen, que deben
  gozarse dentro del año siguiente. El goce consume primero los periodos más antiguos. Si se goza
  más de lo ganado, la diferencia es **adelanto de vacaciones**. Un periodo sin gozar al terminar
  su año siguiente queda **vencido** (indemnización vacacional = una remuneración por esos días).
  **Truncas**: días del régimen × días del año en curso / 360, con al menos un mes de servicio.
  El saldo de vacaciones al empezar a usar el sistema se registra una vez por trabajador.

### Cese y liquidación
- **R-120** **Liquidación** de un trabajador cesado = CTS trunca (desde el inicio del semestre) +
  gratificación trunca y su bonificación (si no cobró la del semestre) + vacaciones pendientes +
  vacaciones truncas − días adelantados (el adelanto solo se compensa con las truncas; lo que no
  alcanza no se le descuenta) + indemnización vacacional (vencidas) + indemnización por despido
  (R-121) − pensión sobre las vacaciones − regularización de quinta − descuentos autorizados. La
  remuneración de los días del mes de cese va en la planilla de ese mes. Si el cese ocurre antes del
  plazo de depósito de la CTS del semestre anterior (15 de mayo / 15 de noviembre), esa CTS se paga en
  la liquidación (si ya se depositó, se registra como descuento autorizado). Plazo de pago: 48 horas.
- **R-121** **Indemnización por despido**: solo si el motivo de cese indemniza *(catálogo
  `motivo_cese`)* y pasó el periodo de prueba. Base: remuneración computable sin el sexto de
  gratificación. MYPE: días del régimen por año, con fracción por meses completos (dozavos), con
  tope. General: 1.5 sueldos por año (fracción por meses y días) con tope 12; si el contrato era a
  plazo fijo, 1.5 sueldos por mes que faltaba, con el mismo tope.
- **R-122** **Quinta al cese**: en la liquidación el impuesto se calcula sobre lo realmente
  percibido en el año (sin proyección), menos lo retenido en meses anteriores; si se retuvo de más,
  se devuelve. En la planilla del mes de cese no se retiene quinta.

### Cierre y boletas
- **R-123** **Cerrar la planilla** de un empleador y mes emite las **boletas** (copia fiel de cada
  una: es el documento legal) y bloquea las novedades del mes. No se cierra con observaciones que
  bloquean (tasas provisionales, CUSPP faltante, trabajador sin sueldo). Reabrir (solo
  administrador) anula las boletas con motivo. La entrega de la boleta se registra aparte.
- **R-124** **Observaciones**: la planilla lista lo que falta revisar (tasas, CUSPP, sueldo menor a
  la RMV, descanso médico que supera 20 días en el año, REMYPE no registrado, rentas de quinta
  previas faltantes…). Quien ya trabajaba en el año antes de usar el sistema no se cierra sin sus
  rentas y retenciones previas (sin ellas la quinta sale corta). Una boleta emitida
  que ya no coincide con el recálculo se marca para revisión.
- **R-125** Planillas lo ven y operan el administrador y tesorería (sueldos son reservados: el CEO
  no los ve). Los parámetros legales y tasas los edita el administrador.
