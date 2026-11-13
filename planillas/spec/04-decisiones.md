# Registro de decisiones · Planillas

Cada decisión indica quién la tomó.

| # | Decisión | Por qué | Quién |
|---|---|---|---|
| D-01 | Planillas es un **sistema independiente** (base, usuarios, app y despliegue propios), por **empleador** (HoldingD y las demás entidades) | Pedido del dueño de producto (13/11/2026): no comparte nada con el ERP de Manya. Una entidad nueva del mismo régimen es un registro, no una copia del sistema. El ERP de control de personal se integra por API con el código externo del trabajador | Dueño de producto |
| D-02 | Se reemplaza el motor en JavaScript del paquete de revisión (payroll-v2) por vistas SQL con las mismas reglas legales | La regla de oro del proyecto: un número no puede diferir entre pantallas. Se conservaron los límites del revisor: no extrapolar tasas SBS, no asumir REMYPE por etiqueta, no inferir vacaciones gozadas, indemnización solo por causal | Líder técnico |
| D-03 | Provisiones por diferencia de devengado (R-19) | Así la suma de provisiones del semestre es exactamente la gratificación o CTS pagada, sin asiento de ajuste a mano | Líder técnico |
| D-04 | Horas extra y bonos variables son ingreso extraordinario para la quinta | Criterio de los ejemplos de SUNAT (inciso e) | Dueño de producto (confirmado nov 2026) |
| D-05 | Subsidios de EsSalud: inafectos a EsSalud y pensión, afectos a quinta | Es un atributo del concepto, se cambia sin tocar código | Dueño de producto (confirmado nov 2026) |
| D-06 | EsSalud = 9% de la base afecta (sueldo, vacaciones, horas extra…), con mínimo la RMV completa del mes; solo un mes íntegramente subsidiado no aporta | Así lo calcula la planilla de HoldingD (oct 2026) y lo confirmó el dueño de producto | Dueño de producto |
| D-07 | La boleta emitida al cerrar se guarda como copia fiel (excepción SSOT: documento legal) | Es lo que se entregó y pagó; la retención de quinta de un mes cerrado sale de ahí | Líder técnico |
| D-08 | Tasas AFP: se siembra la tabla SBS de noviembre 2026 verificada por la revisión anterior; los demás meses se cargan desde la SBS o a mano | No se inventan tasas de meses no verificados | Líder técnico |
| D-09 | Quinta desde abril: (impuesto anual − lo retenido en el año) ÷ meses que faltan | Coincide con los divisores de SUNAT al inicio de cada tramo y con la planilla de HoldingD (oct 2026: ÷3); permite empezar a usar el sistema a mitad de año con lo retenido acumulado | Líder técnico (verificado con la planilla de HoldingD) |
