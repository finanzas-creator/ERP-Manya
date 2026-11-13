# Planillas

Sistema independiente para calcular la planilla de **HoldingD** y de las demás entidades del mismo
régimen laboral (MYPE pequeña/micro y régimen general), en soles:

- Planilla del mes: sueldo, asignación familiar, vacaciones, horas extra 25%/35%, feriados trabajados,
  faltas, tardanzas, bonos, adelantos y descuentos.
- AFP (aporte, prima, comisión) con las tasas SBS del mes, ONP, EsSalud y quinta categoría.
- Gratificaciones (julio, diciembre) y bonificación, CTS (mayo, noviembre), provisiones mensuales que
  suman exactamente lo pagado, vacaciones (pendientes, vencidas, adelantadas, truncas).
- Liquidaciones al cese con indemnización según régimen y causal.
- Cierre del mes con boletas emitidas (formato HoldingD, imprimibles o en PDF).
- API para que el ERP de control de personal envíe trabajadores, asistencia, ausencias y montos.

No comparte base, usuarios ni código con ningún otro sistema.

- **Qué hace y por qué:** [`spec/`](spec/README.md) (reglas R-01…R-29).
- **Reglas para quien programe:** [`CLAUDE.md`](CLAUDE.md).
- **Integración con el ERP de personal:** [`docs/integracion.md`](docs/integracion.md).

## Estructura

| Carpeta | Contenido |
|---|---|
| `spec/` | Especificación en español simple |
| `db/migrations/` | Base de datos: tablas, cálculo en vistas SQL, cierre, API (Postgres / Supabase) |
| `db/tests/` | Pruebas de cada regla con casos calculados a mano |
| `db/local/` | Lo mínimo para correr en local (roles de Supabase, usuarios y datos de demostración) |
| `app/` | Pantallas (React + TypeScript + supabase-js) |
| `etl/` | Carga inicial desde la planilla en Excel |
| `data/` | Excel y SQL con datos de trabajadores (**no se versiona**) |

## Correr en local

Requisitos: PostgreSQL 16, Python 3 con `openpyxl`, Node 22 y PostgREST 12.

```bash
make db              # crea la base "planillas" y aplica migraciones + usuarios de prueba
make test            # pruebas de reglas
make demo            # opcional: empleador y trabajadores ficticios
make api             # API local (PostgREST) en :3002
cd app && npm install && cp .env.example .env.local && npm run dev   # pantallas en :5174
```

Carga inicial de un empleador desde su planilla en Excel (los datos quedan en `data/`):

```bash
python3 etl/planilla_excel.py data/planilla.xlsx data/carga.sql --ingreso-minimo 2025-02-01
psql -d planillas -f data/carga.sql
```

## Publicar

Necesita un **proyecto Supabase propio** y un **sitio estático** (p. ej. Cloudflare Pages), ambos solo
para Planillas.

1. **Base:** `SUPABASE_ACCESS_TOKEN=... python3 db/supabase.py <ref> db/migrations/*.sql` (en orden;
   no se aplica `db/local/`). Una migración nueva se aplica sola.
2. **Usuarios:** invitarlos en Supabase Auth y registrar su fila en `usuario` con el mismo id y su rol
   (`admin` o `rrhh`). El usuario de integración del ERP de personal es `rrhh`.
3. **App:** `make publicar-app SUPABASE_REF=<ref> PAGES_PROYECTO=<nombre>` (usa
   `SUPABASE_ACCESS_TOKEN`, `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`).
4. **Tasas AFP:** la SBS bloquea la lectura automatizada; cada mes el administrador registra las 4 filas
   en Parámetros → Tasas AFP (el intento automático diario queda programado por si se habilita).
