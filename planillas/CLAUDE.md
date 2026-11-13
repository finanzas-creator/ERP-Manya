# Planillas — reglas para cualquier agente o desarrollador

Sistema independiente de planillas (HoldingD y entidades del mismo régimen). No comparte nada con
otros sistemas: base, usuarios, despliegue y código son propios.

## Fuente de verdad
1. `spec/` es la verdad del negocio. Todo cambio de comportamiento empieza actualizando
   `spec/02-reglas.md` (R-xx), luego la prueba (`db/tests`) y luego el código.
2. La base de datos calcula: días, montos, bases, quinta, beneficios, provisiones y liquidaciones salen
   de vistas y funciones SQL. La app y la integración solo muestran lo que devuelven.

## Reglas no negociables
- **SSOT:** no se guarda nada que se pueda calcular. Excepción: hechos legales o decisiones humanas
  (normas con vigencia, tasas publicadas, boleta emitida).
- **DRY:** cada regla vive en un solo lugar. Valores legales y listas = tablas con vigencia o catálogos,
  nunca números ni textos en el código.
- **Sin parches:** prohibido deducir atributos por nombre; prohibido corregir datos en producción sin
  migración versionada. Un bug se corrige en la regla y deja una prueba.
- Nada se borra: se **anula** con motivo. Una migración publicada nunca se edita.
- Cada regla citada en código lleva su ID: `-- R-14`.
- Los datos de trabajadores (Excel, cargas) van en `data/` y no se versionan.

## Comandos
- `make db` · `make test` · `make demo` · `make api` · `make app`
