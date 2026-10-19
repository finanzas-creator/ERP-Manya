# Manya ERP

Sistema de gestión de la agencia Manya. Cubre ventas, plan de pagos, comprobantes,
cobranza, renovaciones, comisiones y rentabilidad.

- **Qué hace y por qué:** [`spec/`](spec/README.md). Es la fuente de verdad del negocio.
- **Reglas para quien programe (personas o IA):** [`CLAUDE.md`](CLAUDE.md).

## Correr en local

Requisitos: PostgreSQL 16, Python 3 con `openpyxl`, Node 22 y el binario de [PostgREST](https://postgrest.org) 12.

```bash
make db                      # crea la base y aplica migraciones + usuarios de prueba
cp <sheet>.xlsx data/sheet.xlsx
make migrate-data            # migra el sheet (reporte en etl/out/anomalias.md)
make test                    # pruebas de reglas + pruebas doradas contra el sheet
make api                     # API local (PostgREST) en :3001
cd app && npm install && cp .env.example .env.local && npm run dev   # interfaz en :5173
```

En local se entra eligiendo un rol de prueba: Administrador, Tesorería o CEO.

## Publicar (producción)

1. **Supabase:** crear el proyecto y aplicar `db/migrations/*.sql` en orden. No se aplica
   `db/local/` (Supabase ya trae `auth` y los roles). Crear los usuarios en Auth y registrar
   su rol en la tabla `usuario`.
2. **Datos:** ejecutar `etl/out/carga.sql` contra la base de Supabase. Luego correr
   `python3 etl/tests/doradas.py data/sheet.xlsx "<cadena de conexión>"`.
3. **Vercel:** publicar `app/` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`, sin
   `VITE_DEV_AUTH`.
4. **Respaldos:** activar los respaldos diarios de Supabase.

## Cambiar algo

1. Editar la regla en `spec/02-reglas.md`.
2. Escribir o ajustar su prueba en `db/tests/`.
3. Cambiar el código con una migración nueva (`db/migrations/00N_*.sql`). Una migración
   publicada nunca se edita.
4. Regenerar los tipos de la app: `cd app && npm run tipos`.
5. Correr `make test` y revisar en la vista previa.
