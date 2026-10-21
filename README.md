# Manya ERP

Sistema de gestión de la agencia Manya. Cubre ventas, plan de pagos, comprobantes,
cobranza, renovaciones, comisiones, costos (planilla, herramientas, proveedores, pauta) y
rentabilidad. En producción: https://manya-erp.pages.dev

Pantallas: Resumen · Clientes · Ventas · Cobranza (con cobros esperados) · Renovaciones · Pauta ·
Estado de resultados · Rentabilidad · Planilla y gastos · Revisión de datos · Validación contra el
sheet · Configuración (tipo de cambio, cierre mensual, parámetros, pesos de Dirección). El CEO ve
Resumen y Estado de resultados.

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

Producción: proyecto Supabase `manya-erp` (São Paulo, plan Free). No hay conexión directa a
Postgres: todo se envía por la Management API con `db/supabase.py` y la variable
`SUPABASE_ACCESS_TOKEN`.

1. **Base:** `python3 db/supabase.py <ref> db/migrations/*.sql` (en orden). No se aplica
   `db/local/` (Supabase ya trae `auth` y los roles). Una migración nueva se aplica igual,
   solo ese archivo.
2. **Datos:** `python3 etl/migrar.py data/sheet.xlsx etl/out --inserts` escribe, además de
   `carga.sql`, los lotes `etl/out/lotes/NNN.sql` (INSERT, sin COPY, cada uno en su
   transacción). Se envían en orden: `python3 db/supabase.py <ref> etl/out/lotes/*.sql`.
   Antes, `make test` en local debe pasar; luego se comparan conteos y totales de
   `v_ventas_mes`, `v_kpi_hoy_calc` y `v_gp_agencia_mes` entre local y Supabase.
3. **Usuarios:** invitarlos en Auth y registrar su fila en `usuario` con el mismo id y su rol.
   En Auth, la *Site URL* debe ser la dirección de la app: el correo de invitación lleva a la
   app, donde la persona crea su contraseña. "Olvidé mi contraseña" usa el mismo flujo.
   Para recargar desde cero, primero vaciar la carga: `truncate` de las tablas que llenan los
   lotes (nunca `config`, `usuario`, `auditoria` ni `cierre_mensual`) con `restart identity`.
4. **App:** https://manya-erp.pages.dev — proyecto Cloudflare Pages `manya-erp` (subida
   directa, sin Git). Compilar `app/` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (la
   clave anon de Supabase), sin `VITE_DEV_AUTH`, y publicar: `make publicar-app` hace ambas
   cosas (usa `SUPABASE_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`). En Supabase Auth, *Site URL* y la
   lista de redirecciones apuntan a esa dirección.
5. **Respaldos:** el plan Free no tiene respaldos diarios; pasar a Pro al usarlo a diario.

## Cambiar algo

1. Editar la regla en `spec/02-reglas.md`.
2. Escribir o ajustar su prueba en `db/tests/`.
3. Cambiar el código con una migración nueva (`db/migrations/00N_*.sql`). Una migración
   publicada nunca se edita.
4. Regenerar los tipos de la app: `cd app && npm run tipos`.
5. Correr `make test` y revisar en la vista previa.
