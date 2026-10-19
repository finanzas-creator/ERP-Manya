DB ?= manya
PSQL = psql -v ON_ERROR_STOP=1 -q -X
POSTGREST ?= postgrest
export PGUSER ?= root
export PGHOST ?= /var/run/postgresql

.PHONY: db migrate-data test test-reglas test-doradas app api dev-users

db:
	dropdb --force --if-exists $(DB) && createdb $(DB)
	$(PSQL) -d $(DB) -f db/local/supabase_shim.sql
	for f in db/migrations/*.sql; do $(PSQL) -d $(DB) -f $$f || exit 1; done
	$(PSQL) -d $(DB) -f db/local/usuarios_dev.sql

migrate-data:
	python3 etl/migrar.py data/sheet.xlsx etl/out
	$(PSQL) -d $(DB) -f etl/out/carga.sql

test: test-reglas test-doradas

test-reglas:
	./db/tests/run.sh

test-doradas:
	python3 etl/tests/doradas.py data/sheet.xlsx $(DB)

dev-users:
	$(PSQL) -d $(DB) -f db/local/usuarios_dev.sql

api:
	$(POSTGREST) db/local/postgrest.conf

app:
	cd app && npm run dev
