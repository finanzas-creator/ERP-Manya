# Especificación · Planillas

Fuente de verdad del negocio del sistema Planillas. El código obedece a esta spec, no al revés.

| Archivo | Qué contiene |
|---|---|
| [01-glosario.md](01-glosario.md) | Qué significa cada palabra |
| [02-reglas.md](02-reglas.md) | Reglas numeradas (R-01…R-29) |
| [03-modelo.md](03-modelo.md) | Qué se guarda y qué se calcula |
| [04-decisiones.md](04-decisiones.md) | Decisiones tomadas y por qué |
| [05-backlog.md](05-backlog.md) | Qué falta |

Un cambio de comportamiento empieza aquí: se edita la regla, luego su prueba (`db/tests`), luego el
código (una migración nueva en `db/migrations`; una migración publicada nunca se edita).
