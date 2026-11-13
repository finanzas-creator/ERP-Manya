# Reglas de negocio · Planillas

Sistema independiente para calcular la planilla de cualquier **empleador** (HoldingD y las demás
entidades del mismo régimen). Cada regla tiene un ID: el código y las pruebas lo citan. Montos en soles. Los valores
legales (RMV, UIT, tasas AFP, ONP, EsSalud, tramos de quinta) son **hechos con vigencia**: se
guardan una vez con su norma y el cálculo toma el vigente en cada fecha; nunca están en el código.

### Régimen y parámetros
- **R-01** **Régimen laboral de un trabajador** en una fecha: el pactado, si se registró (decisión
  humana, p. ej. derechos del régimen general por contrato); si no, la categoría REMYPE del
  empleador (*micro* o *pequeña*) vigente en esa fecha, **solo si el trabajador ingresó después de
  la inscripción**; si no, *general*. Quien ingresó antes del REMYPE conserva el régimen general.
  Las renovaciones o cambios de categoría sin interrupción cuentan desde la primera inscripción de la
  cadena. Un reingreso es un registro nuevo del trabajador (otra fecha de ingreso).
- **R-02** Derechos por régimen *(catálogo `regimen_derecho`)*: gratificación (general 1 sueldo,
  pequeña ½, micro 0 por semestre), CTS (general 30 remuneraciones diarias por año, pequeña 15 con
  tope de 90 acumuladas, micro 0), vacaciones (general 30 días, MYPE 15) e indemnización por
  despido arbitrario (general 1.5 sueldos por año con tope 12; pequeña 20 remuneraciones diarias por
  año con tope 120; micro 10 con tope 90).
- **R-03** **Tasas AFP del periodo** (aporte, prima de seguro, comisión sobre flujo, comisión
  mixta y remuneración máxima asegurable) se toman de la SBS para el **mes exacto de devengue**,
  automáticamente al inicio de cada mes (y a pedido desde Parámetros). Si la SBS no responde, el
  administrador las registra a mano con su sustento. Sin tasas del mes exacto, la planilla se
  calcula con las del último mes disponible, se marca **provisional** y no se puede cerrar.

### Planilla del mes
- **R-04** **Días del mes**: un mes completo de vínculo son 30 días; un mes parcial (ingreso o
  cese) cuenta sus días calendario, con tope 30. Una ausencia que cubre todo el vínculo del mes
  cuenta todos sus días, aunque sean varias ausencias seguidas.
- **R-05** **Ausencias** *(catálogo `tipo_ausencia`)*: cada tipo dice con qué concepto se pagan
  sus días (ninguno = no se pagan: falta injustificada, licencia sin goce, suspensión; sueldo:
  licencia con goce, descanso médico a cargo del empleador; remuneración vacacional; subsidio de
  EsSalud) y si cuentan para CTS, gratificación y récord vacacional.
- **R-06** **Sueldo del mes** = sueldo básico / 30 × días pagados como sueldo; si el sueldo cambia a
  mitad de mes, se pondera por los días de cada uno (base 30). La
  **asignación familiar** (10% de la RMV) se paga completa si el trabajador la tiene registrada; en
  MYPE no es obligatoria: se registra solo si corresponde o se pactó. Los conceptos fijos
  (bonos, movilidad) se pagan en proporción a los días no descontados.
- **R-07** **Remuneración vacacional** de los días de vacaciones gozados en el mes = (básico +
  promedio de remuneraciones variables regulares) / 30 × días. Se paga en el mes del goce.
- **R-08** **Horas extra**: se registran por día. Por día, las 2 primeras horas llevan 25% de
  recargo y las siguientes 35%. Valor hora = (básico + asignación familiar) / 30 / horas de la
  jornada diaria.
- **R-09** **Trabajo en feriado o en el día de descanso** sin descanso sustitutorio: se pagan 2
  remuneraciones diarias adicionales (la labor más la sobretasa de 100%). Con descanso sustitutorio
  no se registra.
- **R-10** **Tardanzas**: se descuenta el valor hora por los minutos. **Faltas**: no se paga el
  día; si el empleador lo configura, además se descuenta la parte proporcional del descanso
  semanal (1/5 o 1/6 de la remuneración diaria por falta, según días laborables por semana).
- **R-11** Cada **concepto** *(catálogo `concepto_planilla`)* dice si es ingreso o descuento, si
  está afecto a EsSalud, a pensión (ONP/AFP) y a quinta categoría, si es extraordinario para la
  quinta, si es computable para beneficios y si es variable. Las bases de cálculo son la suma de los
  ingresos afectos menos los descuentos afectos (p. ej. tardanzas). Ningún cálculo pregunta por el
  nombre del concepto.
- **R-12** **Pensión**: ONP 13% de la base. AFP: aporte 10% de la base + prima de seguro sobre la
  base con tope en la remuneración máxima asegurable (no paga prima quien tiene más de 65 años) +
  comisión sobre flujo (afiliados a flujo) o comisión mixta (afiliados a mixta), con las tasas del
  periodo (R-03).
- **R-13** **EsSalud** (cargo del empleador): 9% de la base afecta (sueldo, vacaciones, horas
  extra…), con mínimo la RMV completa del mes (D-06); un mes íntegramente subsidiado no aporta. EPS:
  se muestra el 9% (el crédito EPS se concilia aparte).
- **R-14** **Quinta categoría** (procedimiento SUNAT, art. 40 del reglamento): renta proyectada =
  ingresos afectos de meses anteriores (de este empleador y de otros, o anteriores al sistema,
  según certificado) + ingresos ordinarios del mes + remuneración ordinaria mensual × meses que
  faltan + gratificaciones ordinarias que faltan; menos 7 UIT; impuesto por tramos (8%, 14%, 17%,
  20%, 30% hasta 5, 20, 35, 45 UIT y más). Retención: ene–mar ÷12; desde abril, (impuesto − lo ya
  retenido en el año) ÷ meses que faltan incluido el actual (abr ÷9, may ÷8, ago ÷5, set ÷4 como
  SUNAT; en los demás meses da lo mismo si nada cambia, y admite empezar a mitad de año con lo
  retenido acumulado, D-09); dic = impuesto − retenido ene–nov. Los ingresos extraordinarios del mes (horas extra, bonos no regulares) suman la
  diferencia de impuesto que generan. Lo retenido en meses cerrados es el de su boleta emitida.
  Un trabajador **no domiciliado** retiene 30% de sus ingresos afectos de cada mes, sin deducciones
  ni proyección *(parámetro `quinta_no_domiciliado`)*.
- **R-15** **Neto a pagar** = ingresos − descuentos (pensión, quinta, adelantos, préstamos,
  descuentos autorizados). **Costo empresa** = ingresos (salvo los cubiertos por provisión:
  gratificación, bonificación y remuneración vacacional) + EsSalud + provisiones del mes (R-19).

### Beneficios sociales
- **R-16** **Remuneración computable** a una fecha = básico + asignación familiar + conceptos fijos
  computables + promedio de cada concepto variable computable cobrado en al menos 3 de los 6 meses
  anteriores (suma ÷ 6). Para la CTS se suma 1/6 de la gratificación cobrada en el semestre.
- **R-17** **Gratificación** (julio y diciembre) = remuneración computable × factor del régimen ×
  meses calendario completos del semestre (ene–jun, jul–dic) ÷ 6, menos 1/30 de la fracción mensual
  por cada día no computable. Se paga en la planilla de julio o diciembre a quien está laborando
  al 1 de julio / 15 de diciembre; si cesó antes, es **trunca** y va en la liquidación (mínimo un mes
  completo). **Bonificación extraordinaria** (Ley 30334): 9% de la gratificación (6.75% con EPS).
  Ambas están inafectas a EsSalud y pensión, y afectas a quinta.
- **R-18** **CTS** por semestre (nov–abr se deposita en mayo, may–oct en noviembre) =
  remuneración computable / 30 × días de CTS ganados; días ganados = días por año del régimen ×
  días computables del semestre / 360 (con el tope acumulado de la pequeña empresa). Requiere un
  mes de servicio (los días de quien no lo cumplía pasan al semestre siguiente) y jornada de al menos
  4 horas *(parámetro `jornada_minima_horas`)*. Inafecta a todo.
- **R-19** **Provisiones mensuales**: la provisión de gratificación, bonificación y CTS de un mes
  es lo **devengado** al cierre del mes menos lo devengado al cierre del mes anterior. En el mes de
  pago (o de cese) lo devengado es lo pagado: la suma de las provisiones del semestre **es** el
  beneficio pagado, sin ajuste manual. Vacaciones: remuneración computable / 360 × días por año ×
  días computables del mes.
- **R-20** **Vacaciones**: cada año completo de servicio gana los días del régimen, que deben
  gozarse dentro del año siguiente. El goce consume primero los periodos más antiguos. Si se goza
  más de lo ganado, la diferencia es **adelanto de vacaciones**. Un periodo sin gozar al terminar
  su año siguiente queda **vencido** (indemnización vacacional = una remuneración por esos días).
  **Truncas**: días del régimen × días del año en curso / 360, con al menos un mes de servicio.
  El saldo de vacaciones al empezar a usar el sistema se registra una vez por trabajador (sin él no
  se cierra la planilla). Con jornada menor a la mínima (4 horas) no hay vacaciones de este régimen.

### Cese y liquidación
- **R-21** **Liquidación** de un trabajador cesado = CTS trunca (desde el inicio del semestre) +
  gratificación trunca y su bonificación (si no cobró la del semestre) + vacaciones pendientes +
  vacaciones truncas − días adelantados (el adelanto solo se compensa con las truncas; lo que no
  alcanza no se le descuenta) + indemnización vacacional (vencidas) + indemnización por despido
  (R-22) − pensión sobre las vacaciones − regularización de quinta − descuentos autorizados. La
  remuneración de los días del mes de cese va en la planilla de ese mes. Si el cese ocurre antes del
  plazo de depósito de la CTS del semestre anterior (15 de mayo / 15 de noviembre), esa CTS se paga en
  la liquidación (si ya se depositó, se registra como descuento autorizado). Plazo de pago: 48 horas.
- **R-22** **Indemnización por despido**: solo si el motivo de cese indemniza *(catálogo
  `motivo_cese`)*, pasó el periodo de prueba y la jornada es de al menos 4 horas. Base: remuneración computable sin el sexto de
  gratificación. MYPE: días del régimen por año, con fracción por meses completos (dozavos), con
  tope. General: 1.5 sueldos por año (fracción por meses y días) con tope 12; si el contrato era a
  plazo fijo, 1.5 sueldos por mes que faltaba, con el mismo tope.
- **R-23** **Quinta al cese**: en la liquidación el impuesto se calcula sobre lo realmente
  percibido en el año (sin proyección), menos lo retenido en meses anteriores; si se retuvo de más,
  se devuelve. En la planilla del mes de cese no se retiene quinta.

### Cierre y boletas
- **R-24** **Cerrar la planilla** de un empleador y mes emite las **boletas** (copia fiel de cada
  una: es el documento legal) y bloquea las novedades del mes. No se cierra con observaciones que
  bloquean (tasas provisionales, CUSPP faltante, trabajador sin sueldo, saldo de vacaciones o rentas de
  quinta previas faltantes). Un concepto fijo se puede terminar en un mes abierto. Reabrir (solo
  administrador) anula las boletas con motivo. La entrega de la boleta se registra aparte.
- **R-25** **Observaciones**: la planilla lista lo que falta revisar (tasas, CUSPP, sueldo menor a
  la RMV, descanso médico que supera 20 días en el año, REMYPE no registrado, rentas de quinta
  previas faltantes…). Quien ya trabajaba en el año antes de usar el sistema no se cierra sin sus
  rentas y retenciones previas (sin ellas la quinta sale corta). Una boleta emitida
  que ya no coincide con el recálculo se marca para revisión.
- **R-26** Roles: **administrador** (todo, incluidos parámetros legales, tasas, empleadores y
  reabrir una planilla) y **recursos humanos** (opera la planilla; también es el rol del usuario de
  integración). Un usuario sin rol no ve nada: los sueldos son reservados.
- **R-27** **Integración con el ERP de control de personal**: el ERP de personal envía, por el RUC
  del empleador y el **código externo** de cada trabajador: altas y cambios de trabajadores (solo los
  campos que envía; un sueldo distinto crea una nueva vigencia), asistencia por día (reemplaza el
  día), ausencias de un rango de fechas y montos de un mes (reemplazan lo que la integración envió
  antes; lo registrado a mano se respeta). Un mes con planilla cerrada no acepta cambios. La planilla,
  boletas, beneficios y liquidaciones se leen de las mismas vistas que usa la app.

### Control
- **R-28** Nada se borra: los registros se **anulan** con motivo. Lo anulado no cuenta en ningún cálculo.
- **R-29** Todo cambio queda en la **bitácora**: quién, cuándo, valor anterior y nuevo.
