#!/usr/bin/env python3
"""Actualización del ERP desde el sheet administrativo (R-71).

La lectura del sheet la hace quien corre esto con el conector de Google Sheets (no hay llaves de
Google en el repositorio). Pasos:

  1. python3 etl/sincronizar.py rangos
       Imprime (y guarda en etl/out/grid/plan.json) las llamadas a spreadsheets.get con includeGridData.
       Cada respuesta se guarda tal cual en etl/out/grid/NN.json.
  2. python3 etl/sincronizar.py verificar etl/out/grid
       Revisa que estén todas las pestañas y que ninguna se haya cortado; si falta algo, agrega al plan
       las llamadas que faltan, las imprime y termina con código 1 (leerlas y volver a verificar).
  3. python3 etl/sincronizar.py armar etl/out/grid
       Arma data/sheet.xlsx con los valores exactos y los lotes para el esquema `carga`.
  4. SUPABASE_ACCESS_TOKEN=... python3 etl/sincronizar.py cargar --revision "<modifiedTime del sheet>"
       preparar_carga() → lotes → aplicar_carga() en una sola transacción. Si algo falla, producción
       queda como estaba y el error queda en la bitácora de cargas.

  python3 etl/sincronizar.py ultima    → la revisión del sheet de la última carga buena (para no
                                         recargar si el sheet no cambió).
"""
import glob
import json
import os
import subprocess
import sys
import urllib.request

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, os.path.join(RAIZ, "db"))
sys.path.insert(0, AQUI)
import supabase  # noqa: E402
from desde_google import hojas_de  # noqa: E402

REF = os.environ.get("SUPABASE_REF", "eiygcmpsbopcgfgnxwhr")
SHEET_ID = "1J9uiNYgqa8ptMTD9s3GSgmW1QZe_a4D2g8LQhMfENsY"
CAMPOS = ["sheets.properties.title", "sheets.properties.gridProperties.rowCount", "sheets.data.startRow",
          "sheets.data.startColumn", "sheets.data.rowData.values.effectiveValue",
          "sheets.data.rowData.values.effectiveFormat.numberFormat.type"]
# Pestañas que lee la migración: columnas, filas por llamada (más grandes no pasan por el conector)
# y tamaño aproximado (solo para la primera vez; luego se usa el de la última carga).
GRANDES = {"Contratos": ("AP", 1000, 4500), "Plan de facturacion": ("AM", 1600, 6400),
           "Pagos de facturas": ("F", 4500, 9300), "Planilla": ("AB", 1050, 2100)}
CHICAS = {"BD": ("AB", 14), "Ventas": ("BT", 15), "Estado de renovaciones": ("G", 300),
          "Comision de venta": ("F", 900), "Herramientas": ("I", 1519), "Pauta": ("K", 1600)}
MARGEN = 600
DIR_SALIDA = os.path.join(RAIZ, "etl", "out")


def q(sql):
    return supabase.consulta(REF, sql)


def rango(tab, col, desde, hasta):
    return f"'{tab}'!A{desde}:{col}{hasta}"


def tamanos_previos():
    try:
        r = q("select filas -> 'sheet' as s from carga_sheet where resultado = 'ok' and filas ? 'sheet' order by id desc limit 1")
        return (r[0]["s"] or {}) if r else {}
    except Exception:  # noqa: BLE001 — sin conexión se usan los tamaños por defecto
        return {}


def cmd_rangos(carpeta):
    """Plan de lectura: se guarda en <carpeta>/plan.json para que 'verificar' sepa qué se pidió."""
    previos = tamanos_previos()
    llamadas = []
    for tab, (col, paso, defecto) in GRANDES.items():
        ultima = int(previos.get(tab, defecto))
        inicio = 1
        while inicio <= ultima:
            fin = inicio + paso - 1
            if fin >= ultima:  # la última llamada empieza dentro de los datos y llega más allá
                fin = ultima + MARGEN
            llamadas.append([rango(tab, col, inicio, fin)])
            inicio = fin + 1
    # BD y Ventas tienen tamaño fijo; las demás chicas crecen poco: hasta su último tamaño + margen
    llamadas.append([rango(t, col, 1, n if t in ("BD", "Ventas") else max(n, int(previos.get(t, 0)) + MARGEN))
                     for t, (col, n) in CHICAS.items()])
    for viejo in glob.glob(os.path.join(carpeta, "*.json")):
        os.remove(viejo)
    os.makedirs(carpeta, exist_ok=True)
    plan = {"spreadsheetId": SHEET_ID, "includeGridData": True, "fields": CAMPOS,
            "llamadas": [{"archivo": f"{i:02d}.json", "ranges": r} for i, r in enumerate(llamadas, 1)]}
    json.dump(plan, open(os.path.join(carpeta, "plan.json"), "w"), ensure_ascii=False, indent=1)
    print(json.dumps(plan, ensure_ascii=False, indent=1))


def partes(r):
    """"'Tab'!A10:F99" -> (Tab, 10, 99)"""
    tab, celdas = r.rsplit("!", 1)
    a, b = celdas.split(":")
    num = lambda x: int("".join(ch for ch in x if ch.isdigit()))
    return tab.strip("'"), num(a), num(b)


def leer_grid(carpeta):
    """{pestaña: {"filas": cantidad de filas del grid, "tramos": [(inicio, fin, ultima_con_datos)]}}"""
    hojas = {}
    for f in sorted(glob.glob(os.path.join(carpeta, "*.json"))):
        for s in hojas_de(json.load(open(f, encoding="utf-8"))) or []:
            t = s["properties"]["title"]
            h = hojas.setdefault(t, {"filas": s["properties"].get("gridProperties", {}).get("rowCount"), "tramos": []})
            for d in s.get("data", []):
                r0 = d.get("startRow", 0)
                filas = d.get("rowData", [])
                ultima = max((r0 + i + 1 for i, fr in enumerate(filas)
                              if any(c.get("effectiveValue") for c in fr.get("values", []))), default=0)
                h["tramos"].append((r0 + 1, r0 + len(filas), ultima))
    return hojas


def cmd_verificar(carpeta):
    """Cada pestaña completa: sin huecos entre lo pedido y con los datos terminando antes del final
    de lo pedido (Google omite las filas vacías del final, así que se compara con lo pedido)."""
    plan_f = os.path.join(carpeta, "plan.json")
    plan = json.load(open(plan_f))
    hojas = leer_grid(carpeta)
    pedido = {}
    for ll in plan["llamadas"]:
        if not os.path.exists(os.path.join(carpeta, ll["archivo"])):
            print(f"FALTA  el archivo {ll['archivo']} (leer {ll['ranges']})")
            sys.exit(1)
        for r in ll["ranges"]:
            t, a, b = partes(r)
            pedido.setdefault(t, []).append((a, b))
    nuevas = []
    for tab in list(GRANDES) + list(CHICAS):
        col = (GRANDES.get(tab) or CHICAS.get(tab))[0]
        paso = GRANDES.get(tab, (None, 1000))[1]
        h = hojas.get(tab)
        if not h or tab not in pedido:
            nuevas.append([rango(tab, col, 1, paso)])
            continue
        hasta = 0
        for a, b in sorted(pedido[tab]):
            if a > hasta + 1:
                nuevas.append([rango(tab, col, hasta + 1, a - 1)])
            hasta = max(hasta, b)
        ultima = max((u for _, _, u in h["tramos"]), default=0)
        fija = tab in ("BD", "Ventas")  # pestañas de tamaño fijo (tablas resumen)
        if not fija and ultima >= hasta and (h["filas"] is None or hasta < h["filas"]):
            nuevas.append([rango(tab, col, hasta + 1, hasta + paso)])
    if nuevas:
        n0 = max(int(ll["archivo"].split(".")[0]) for ll in plan["llamadas"])
        for i, r in enumerate(nuevas, n0 + 1):
            plan["llamadas"].append({"archivo": f"{i:02d}.json", "ranges": r})
            print(f"FALTA  leer {r} y guardarlo como {i:02d}.json")
        json.dump(plan, open(plan_f, "w"), ensure_ascii=False, indent=1)
        sys.exit(1)
    for tab in list(GRANDES) + list(CHICAS):
        print(f"OK     {tab}: datos hasta la fila {max(u for _, _, u in hojas[tab]['tramos'])}")


def cmd_armar(carpeta):
    hojas = leer_grid(carpeta)
    tamanos = {t: max(u for _, _, u in hojas[t]["tramos"]) for t in list(GRANDES) + list(CHICAS) if t in hojas}
    os.makedirs(os.path.join(RAIZ, "data"), exist_ok=True)
    xlsx = os.path.join(RAIZ, "data", "sheet.xlsx")
    subprocess.run([sys.executable, os.path.join(AQUI, "desde_google.py"), carpeta, xlsx], check=True)
    subprocess.run([sys.executable, os.path.join(AQUI, "migrar.py"), xlsx, DIR_SALIDA, "--inserts", "--carga"], check=True)
    json.dump(tamanos, open(os.path.join(DIR_SALIDA, "tamanos_sheet.json"), "w"))
    print("armado:", json.dumps(tamanos, ensure_ascii=False))


def cmd_cargar(revision):
    lotes = sorted(glob.glob(os.path.join(DIR_SALIDA, "lotes", "*.sql")))
    if not lotes:
        sys.exit("no hay lotes: corre primero 'armar'")
    tamanos = json.load(open(os.path.join(DIR_SALIDA, "tamanos_sheet.json")))
    rev = revision.replace("'", "")
    try:
        q("select preparar_carga()")
        for f in lotes:
            q(open(f).read())
        r = q(f"select aplicar_carga('{rev}') as r")[0]["r"]
        tam = json.dumps(tamanos).replace("'", "")
        q(f"update carga_sheet set filas = filas || jsonb_build_object('sheet', '{tam}'::jsonb) "
          f"where id = (select max(id) from carga_sheet)")
        q("analyze")
    except SystemExit as e:  # supabase.consulta termina con SystemExit ante un error de SQL
        detalle = str(e).replace("'", "''")
        try:
            q(f"select registrar_carga('{rev}', 'error', '{detalle}')")
        finally:
            sys.exit(f"CARGA NO APLICADA (producción sin cambios): {e}")
    print("CARGA APLICADA:", json.dumps(r, ensure_ascii=False))
    mantener_activo()


def mantener_activo():
    """Una consulta a la API pública cuenta como uso: el plan gratis pausa proyectos sin uso (7 días)."""
    try:
        clave = supabase.clave_anon(REF)
        req = urllib.request.Request(f"https://{REF}.supabase.co/auth/v1/health", headers={"apikey": clave})
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:  # noqa: BLE001 — no es parte de la carga
        print("aviso: no se pudo registrar actividad:", e)


def cmd_ultima():
    r = q("select revision, en::text, resultado, detalle from carga_sheet order by id desc limit 1")
    print(json.dumps(r[0] if r else {}, ensure_ascii=False))


if __name__ == "__main__":
    accion, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    if accion == "rangos":
        cmd_rangos(args[0] if args else os.path.join(DIR_SALIDA, "grid"))
    elif accion == "verificar":
        cmd_verificar(args[0])
    elif accion == "armar":
        cmd_armar(args[0])
    elif accion == "cargar":
        cmd_cargar(args[args.index("--revision") + 1] if "--revision" in args else "")
    elif accion == "ultima":
        cmd_ultima()
    else:
        sys.exit(__doc__)
