#!/usr/bin/env python3
"""Ejecuta archivos SQL en un proyecto Supabase por la Management API (HTTPS), en el orden dado.

Uso: SUPABASE_ACCESS_TOKEN=... python3 db/supabase.py <ref-del-proyecto> archivo.sql [...]
     python3 db/supabase.py <ref> -c "select ..."     (imprime el resultado en JSON)
     python3 db/supabase.py <ref> --anon              (clave pública anon, para compilar la app)

Sirve para aplicar db/migrations/*.sql y los lotes de etl/migrar.py --inserts. No usa
conexión directa a Postgres: cada archivo es una sola petición.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request


def consulta(ref, sql, intentos=4):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=json.dumps({"query": sql}).encode(),
        headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
                 "Content-Type": "application/json", "User-Agent": "manya-erp"},
        method="POST")
    for i in range(intentos):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                return json.loads(r.read() or "null")
        except urllib.error.HTTPError as e:
            cuerpo = e.read().decode(errors="replace")
            if e.code < 500 and e.code != 429:
                raise SystemExit(f"error {e.code}: {cuerpo}")
            if i == intentos - 1:
                raise SystemExit(f"error {e.code}: {cuerpo}")
        except urllib.error.URLError:
            if i == intentos - 1:
                raise
        time.sleep(2 ** (i + 1))


def clave_anon(ref):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{ref}/api-keys",
                                 headers={"Authorization": f"Bearer {os.environ['SUPABASE_ACCESS_TOKEN']}",
                                          "User-Agent": "manya-erp"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return next(k["api_key"] for k in json.loads(r.read()) if k.get("name") == "anon")


def main():
    ref, args = sys.argv[1], sys.argv[2:]
    if args[:1] == ["--anon"]:
        print(clave_anon(ref))
        return
    if args[:1] == ["-c"]:
        print(json.dumps(consulta(ref, args[1]), ensure_ascii=False))
        return
    for f in args:
        with open(f) as fh:
            consulta(ref, fh.read())
        print(f"OK  {f}")


if __name__ == "__main__":
    main()
