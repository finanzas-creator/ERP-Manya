DB ?= planillas
PSQL = psql -v ON_ERROR_STOP=1 -q -X
POSTGREST ?= postgrest
export PGUSER ?= root
export PGHOST ?= /var/run/postgresql

.PHONY: db test demo api app tipos publicar-app

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

# Producción: proyecto Supabase y sitio propios de Planillas.
SUPABASE_REF ?=
PAGES_PROYECTO ?= planillas
publicar-app:
	@test -n "$(SUPABASE_REF)" || (echo "Indica SUPABASE_REF=<ref del proyecto Supabase de Planillas>"; exit 1)
	cd app && VITE_DEV_AUTH=0 VITE_SUPABASE_URL=https://$(SUPABASE_REF).supabase.co \
	  VITE_SUPABASE_ANON_KEY=$$(python3 ../db/supabase.py $(SUPABASE_REF) --anon) npm run build
	npx --yes wrangler@3 pages deploy app/dist --project-name $(PAGES_PROYECTO) --branch main --commit-dirty=true
