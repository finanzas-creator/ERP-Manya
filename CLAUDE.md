# Manya ERP — reglas para cualquier agente o desarrollador

Sistema de gestión de la agencia Manya: ventas, plan de pagos, comprobantes, cobranza,
comisiones y rentabilidad. El dueño de producto no es desarrollador: la **spec** es el
contrato con él.

## Fuente de verdad
1. `spec/` es la verdad del negocio. Todo cambio de comportamiento empieza actualizando
   `spec/02-reglas.md` (reglas numeradas R-xx) y luego la prueba y luego el código.
2. La base de datos es la verdad de los datos **y de los cálculos**. Saldos, estados,
   ventas, ingresos, comisiones y GP se calculan en vistas SQL (`db/migrations`).
   La app solo muestra lo que devuelven las vistas.

## Reglas no negociables
- **SSOT:** no se guarda ningún valor que se pueda calcular (totales, saldos, estados,
  "faltan N días"). Excepción única: lo que es un hecho legal o una decisión humana
  (p. ej. % de detracción impreso en el comprobante, periodo de servicio elegido).
- **DRY:** cada regla vive en un solo lugar. Si dos pantallas necesitan el mismo número,
  leen la misma vista. Listas de valores = tablas de catálogo, nunca texto libre ni arrays en el código.
- **Sin parches:** prohibido `if nombre == '...'`, prohibido deducir atributos por nombre
  o prefijo, prohibido corregir datos en producción sin migración versionada. Un bug se
  corrige en la regla y deja una prueba que lo cubre.
- Nada se borra: los registros se **anulan** (`anulado_en`, `anulado_motivo`).
- Cada regla citada en código lleva su ID: `-- R-41`.

## Estructura
- `spec/` especificación (español simple).
- `db/migrations/` SQL versionado, aplicado en orden. Compatible con Supabase.
- `db/tests/` pruebas de reglas (datos sintéticos, corren siempre).
- `etl/` migración desde el sheet + reporte de anomalías.
- `etl/tests/` pruebas doradas: la base migrada reproduce los totales del sheet.
- `app/` interfaz web (React + TypeScript + supabase-js).
- `data/` datos fuente (no se versiona).

## Comandos
- `make db` recrea la base local y aplica migraciones.
- `make migrate-data` carga el sheet (`data/sheet.xlsx`).
- `make test` pruebas de reglas + pruebas doradas.
- `make app` levanta la interfaz local.
