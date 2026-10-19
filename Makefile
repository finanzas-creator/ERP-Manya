DB ?= manya
PSQL = psql -v ON_ERROR_STOP=1 -q -X
export PGUSER ?= root
export PGHOST ?= /var/run/postgresql

.PHONY: db migrate-data test test-reglas test-doradas app

db:
	dropdb --if-exists $(DB) && createdb $(DB)
	$(PSQL) -d $(DB) -f db/local/supabase_shim.sql
	for f in db/migrations/*.sql; do $(PSQL) -d $(DB) -f $$f || exit 1; done

migrate-data:
	python3 etl/migrar.py data/sheet.xlsx etl/out
	$(PSQL) -d $(DB) -f etl/out/carga.sql

test: test-reglas test-doradas

test-reglas:
	./db/tests/run.sh

test-doradas:
	python3 etl/tests/doradas.py data/sheet.xlsx $(DB)

app:
	cd app && npm run dev
