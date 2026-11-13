#!/usr/bin/env bash
# Pruebas de reglas: base nueva con migraciones; cada archivo corre en su propia transacción y se revierte.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=planillas_test
PSQL="psql -X -q -v ON_ERROR_STOP=1 -d $DB"
dropdb --force --if-exists $DB 2>/dev/null; createdb $DB
$PSQL -f db/local/supabase_shim.sql >/dev/null 2>&1
for f in db/migrations/*.sql; do $PSQL -f "$f" >/dev/null; done
fallas=0
for t in db/tests/[1-9]*.sql; do
  if out=$( (echo "begin;"; cat "$t"; echo "rollback;") | $PSQL 2>&1 >/dev/null ); then
    echo "OK    $(basename "$t")"
  else
    echo "FALLA $(basename "$t")"; echo "$out" | sed 's/^/      /'; fallas=1
  fi
done
exit $fallas
