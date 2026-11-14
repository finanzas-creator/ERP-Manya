DB ?= planilla_holdingd
PSQL = psql -v ON_ERROR_STOP=1 -q -X
POSTGREST ?= postgrest
export PGUSER ?= root
export PGHOST ?= /var/run/postgresql

.PHONY: db test demo api app tipos publicar-base cargar publicar-app

db:
	dropdb --force --if-exists $(DB) && createdb $(DB)
	$(PSQL) -d $(DB) -f db/local/supabase_shim.sql
	for f in db/migrations/*.sql; do $(PSQL) -d $(DB) -f $$f || exit 1; done
	$(PSQL) -d $(DB) -f db/local/usuarios_dev.sql

test:
	./db/tests/run.sh

# Empleador y trabajadores ficticios para ver las pantallas (después de make db).
demo:
	$(PSQL) -d $(DB) -f db/local/demo.sql

api:
	$(POSTGREST) db/local/postgrest.conf

app:
	cd app && npm run dev

tipos:
	cd app && npm run tipos

# Producción: proyecto Supabase y sitio propios del Sistema de Planilla HoldingD.
SUPABASE_REF ?=
PAGES_PROYECTO ?= planilla-holdingd
REF_OBLIGATORIO = @test -n "$(SUPABASE_REF)" || (echo "Indica SUPABASE_REF=<ref del proyecto Supabase del sistema>"; exit 1)

# Base en la nube: aplica las migraciones en orden (una migración nueva se aplica sola: python3 db/supabase.py <ref> archivo.sql)
publicar-base:
	$(REF_OBLIGATORIO)
	python3 db/supabase.py $(SUPABASE_REF) db/migrations/*.sql
	python3 db/supabase.py $(SUPABASE_REF) -c "select (select count(*) from concepto_planilla) conceptos, (select count(*) from tasa_afp) tasas_afp, (select count(*) from empleador) empleadores"

# Carga inicial de un empleador (SQL generado por etl/planilla_excel.py; queda en data/)
cargar:
	$(REF_OBLIGATORIO)
	@test -n "$(SQL)" || (echo "Indica SQL=data/<carga>.sql"; exit 1)
	python3 db/supabase.py $(SUPABASE_REF) $(SQL)
	python3 db/supabase.py $(SUPABASE_REF) -c "select empleador, periodo, trabajadores, neto from v_planilla_resumen order by 1, 2"

publicar-app:
	$(REF_OBLIGATORIO)
	cd app && VITE_DEV_AUTH=0 VITE_SUPABASE_URL=https://$(SUPABASE_REF).supabase.co \
	  VITE_SUPABASE_ANON_KEY=$$(python3 ../db/supabase.py $(SUPABASE_REF) --anon) npm run build
	npx --yes wrangler@3 pages deploy app/dist --project-name $(PAGES_PROYECTO) --branch main --commit-dirty=true
