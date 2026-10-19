# Especificación de Manya ERP

Esta carpeta es la **fuente de verdad del negocio**. Es lo único que el dueño de producto
necesita leer y aprobar. El código obedece a esta spec, no al revés.

| Archivo | Qué contiene |
|---|---|
| [01-glosario.md](01-glosario.md) | Qué significa cada palabra del sistema |
| [02-reglas.md](02-reglas.md) | Reglas de negocio numeradas (R-xx) |
| [03-modelo.md](03-modelo.md) | Qué se guarda y qué se calcula |
| [04-decisiones.md](04-decisiones.md) | Decisiones tomadas y por qué |
| [05-backlog.md](05-backlog.md) | Qué se construye y en qué orden |

## Metodología (cómo se construye)

**Desarrollo guiado por especificación, verificado con datos reales.**

1. **Spec primero.** Un cambio de comportamiento empieza aquí: se edita la regla,
   luego su prueba, luego el código. Cada regla tiene un ID (R-xx) que aparece en el
   código y en las pruebas que la cubren.
2. **La base de datos calcula.** Todo número del sistema (saldo, estado, venta del
   mes, ingreso, comisión, GP) sale de una vista SQL única. Pantallas, dashboard del
   CEO y exportaciones leen la misma vista. Así un número nunca puede diferir entre
   dos pantallas.
3. **Pruebas de reglas.** Cada regla tiene ejemplos que se verifican solos
   (`db/tests`). Se ejecutan en cada cambio.
4. **Pruebas doradas.** La base migrada debe reproducir los totales históricos del
   sheet administrativo (ventas por mes y tipo de servicio, al centavo). Si un cambio
   rompe un número histórico, la prueba falla antes de llegar a producción.
5. **Cambios pequeños y verificables.** Cada cambio se integra solo si pasa todas las
   pruebas. El dueño de producto valida en una vista previa antes de publicar.
6. **Seguridad financiera desde el día 1.** Permisos por rol en la base de datos,
   bitácora de auditoría, anulación en lugar de borrado, cierre mensual.
