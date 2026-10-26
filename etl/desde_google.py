"""Arma data/sheet.xlsx desde la API de Google Sheets cuando el sheet es muy grande para exportarlo.

Entrada: archivos JSON de spreadsheets.get con includeGridData y los campos
sheets.properties.title, sheets.data.startRow, sheets.data.startColumn,
sheets.data.rowData.values.effectiveValue y sheets.data.rowData.values.effectiveFormat.numberFormat.type
(valores exactos, no los formateados: los formateados vienen redondeados como se ven en pantalla).
Fechas: número de serie con formato DATE/DATE_TIME -> datetime (época 1899-12-30, como Sheets).
Hojas que lee la migración: Contratos, Plan de facturacion, Pagos de facturas, Planilla, BD, Ventas,
Estado de renovaciones, Comision de venta, Herramientas, Pauta.
Uso: desde_google.py <carpeta_json> data/sheet.xlsx"""
import collections, datetime, glob, json, os, sys
import openpyxl

ERRORES = {"REF": "#REF!", "N_A": "#N/A", "DIVIDE_BY_ZERO": "#DIV/0!", "VALUE": "#VALUE!", "NAME": "#NAME?",
           "NUM": "#NUM!", "NULL_VALUE": "#NULL!", "ERROR": "#ERROR!", "LOADING": "#LOADING"}
EPOCA = datetime.datetime(1899, 12, 30)

def valor(c):
    ev = c.get("effectiveValue")
    if not ev:
        return None
    if "numberValue" in ev:
        n = ev["numberValue"]
        tipo = c.get("effectiveFormat", {}).get("numberFormat", {}).get("type")
        if tipo in ("DATE", "DATE_TIME"):
            try:
                d = EPOCA + datetime.timedelta(days=n)
            except OverflowError:   # fecha imposible tecleada en el sheet: queda como número
                return n
            # Excel no tiene fechas antes de 1900: la exportación .xlsx de Google las deja como texto
            return d if d.year >= 1900 else d.strftime("%d/%m/") + f"{d.year:04d}"
        return int(n) if float(n).is_integer() and abs(n) < 1e15 else n
    if "stringValue" in ev:
        return ev["stringValue"]
    if "boolValue" in ev:
        return ev["boolValue"]
    if "errorValue" in ev:
        return ERRORES.get(ev["errorValue"].get("type"), "#ERROR!")
    return None

def main(carpeta, salida):
    hojas = collections.defaultdict(dict)   # titulo -> {fila: [valores]}
    for f in sorted(glob.glob(os.path.join(carpeta, "*.json"))):
        for s in json.load(open(f, encoding="utf-8"))["sheets"]:
            t = s["properties"]["title"]
            for d in s.get("data", []):
                r0, c0 = d.get("startRow", 0), d.get("startColumn", 0)
                for i, fila in enumerate(d.get("rowData", [])):
                    vals = [None] * c0 + [valor(c) for c in fila.get("values", [])]
                    while vals and vals[-1] is None:
                        vals.pop()
                    hojas[t][r0 + i] = vals
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    for t, filas in hojas.items():
        ws = wb.create_sheet(t.replace("/", "")[:31])
        ultima = max((k for k, v in filas.items() if v), default=-1)
        for k in range(ultima + 1):
            ws.append(filas.get(k, []))
        print(f"{t}: {ultima + 1} filas")
    wb.save(salida)

if __name__ == "__main__":
    main(*sys.argv[1:])
