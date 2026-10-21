"""Pruebas doradas: la base migrada debe reproducir los números oficiales del sheet.

Uso: python3 etl/tests/doradas.py <sheet.xlsx> <base_de_datos>

Cada prueba compara un reporte del sheet con la vista del sistema que lo reemplaza.
Las diferencias conocidas y explicadas viven en data/excepciones.csv (con motivo);
cualquier diferencia nueva hace fallar la prueba.
"""
import collections
import csv
import datetime as dt
import os
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from migrar import CATEGORIAS, fecha, leer, llave, num, registros, txt  # noqa: E402

TOL = 0.01


def query(db, sql):
    out = subprocess.run(["psql", "-X", "-At", "-F", "\t", "-d", db, "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [l.split("\t") for l in out.splitlines() if l]


def excepciones(sheet):
    """Diferencias conocidas con motivo. Viven junto al sheet (data/), no en el repositorio:
    contienen datos de clientes."""
    path = os.path.join(os.path.dirname(os.path.abspath(sheet)), "excepciones.csv")
    if not os.path.exists(path):
        return set()
    with open(path) as f:
        return {(r["prueba"], llave(r["referencia"])) for r in csv.DictReader(f)}


class Resultado:
    def __init__(self):
        self.fallas = 0

    def check(self, nombre, regla, diferencias, total):
        ok = not diferencias
        self.fallas += 0 if ok else 1
        print(f"{'OK ' if ok else 'FALLA'} [{regla}] {nombre}: {total - len(diferencias)}/{total} coinciden")
        for d in diferencias[:10]:
            print("      ", d)


def ventas_por_mes(hojas, db, R):
    """R-03/R-04: pestaña 'Ventas' (ventas por mes y tipo de servicio)."""
    tabla = hojas["Ventas"]
    meses = [m for m in tabla[0][1:] if m]
    oficial = {}
    for fila in tabla[1:]:
        tipo = fila[0]
        if tipo in CATEGORIAS:
            for i, m in enumerate(meses):
                y, mo, _ = str(m).split("-")
                oficial[(f"{int(y):04d}-{int(mo):02d}", CATEGORIAS[tipo][0])] = num(fila[i + 1]) or 0.0
    sistema = {(p[:7], c): float(v) for p, c, v in
               query(db, "select periodo, categoria, sum(ventas_usd) from v_ventas_mes group by 1, 2")}
    difs = [(k, v, round(sistema.get(k, 0.0), 2)) for k, v in sorted(oficial.items())
            if abs(sistema.get(k, 0.0) - v) > TOL]
    R.check("Ventas por mes y categoría", "R-04", difs, len(oficial))


def cobranza(hojas, db, R, exc):
    """R-33/R-34: líneas 'Por Cobrar' del Plan de facturación = cuotas pendientes con el mismo saldo."""
    plan = registros(hojas, "Plan de facturacion", 27)
    oficial = collections.defaultdict(float)  # D-18/D-19: líneas con la misma llave son una cuota
    for _, r in plan:
        if r[1] and r[20] == "Por Cobrar":
            oficial[llave(r[0])] += num(r[17]) or 0.0
    pagadas = {llave(r[0]) for _, r in plan if r[1] and r[20] == "Factura Pagada"}
    sistema = {llave(k): (float(s), e) for k, s, e in query(db, """
        select c.codigo_legacy, q.saldo_usd, q.estado from v_cuota q join cuota c on c.id = q.id""")}
    difs = []
    for k, saldo in oficial.items():
        s = sistema.get(k)
        if s is None or s[1] == "pagada" or abs(s[0] - saldo) > 0.5:
            difs.append((k, saldo, s))
    R.check("Saldo de cuotas por cobrar", "R-33", difs, len(oficial))
    difs = [(k, v) for k, v in sistema.items()
            if k in pagadas and v[1] != "pagada" and ("cobranza", k) not in exc]
    R.check("Cuotas pagadas en el sheet también pagadas en el sistema", "R-33", difs, len(pagadas))


def cobranza_por_contrato(hojas, db, R, exc):
    """R-10/R-33: pestaña 'Cobranzas pendientes' (contratos 'Por Cobrar' con su saldo, incluido lo
    aún no planificado) = saldo de la venta en el sistema; y ninguna otra venta con saldo."""
    oficial = {llave(r[0]): num(r[22]) or 0.0 for _, r in registros(hojas, "Contratos", 34)
               if txt(r[1]) and r[23] == "Por Cobrar"}
    sistema = {llave(k): float(v) for k, v in query(db, """
        select codigo_legacy, a_usd(saldo, moneda, fecha_contrato) from v_venta""")}
    difs = [(k, round(v, 2), round(sistema.get(k, 0.0), 2)) for k, v in sorted(oficial.items())
            if abs(sistema.get(k, 0.0) - v) > 0.5 and ("contratos", k) not in exc]
    R.check("Saldo por contrato (Cobranzas pendientes)", "R-33", difs, len(oficial))
    difs = [(k, round(v, 2)) for k, v in sorted(sistema.items())
            if k not in oficial and v > 5 and ("contratos", k) not in exc]
    R.check("Ventas con saldo que el sheet no tiene por cobrar", "R-33", difs, len(sistema))


def renovaciones(hojas, db, R, exc):
    """R-50: pestaña 'Estado de renovaciones' = servicios mensuales activos que vencen desde el día
    en que se calculó el sheet (vencimiento − 'Fecha en días'). Un código del sheet compartido por
    varios clientes se migra separado (código · cliente · ...)."""
    filas = [r for r in hojas["Estado de renovaciones"][1:] if r[0] and fecha(r[3])]
    hoy_sheet = collections.Counter(fecha(r[3]) - dt.timedelta(days=int(num(r[6])))
                                    for r in filas if num(r[6]) is not None).most_common(1)[0][0]
    oficial = {(llave(r[0]), str(fecha(r[3]))) for r in filas}
    sistema = {(llave(k.split(" · ")[0]), v) for k, v in query(db, f"""
        select sc.codigo_legacy, r.vence from v_renovacion r
        join servicio_contratado sc on sc.id = r.servicio_contratado_id where r.vence >= '{hoy_sheet}'""")}
    difs = [d for d in sorted(("solo sheet",) + x for x in oficial - sistema) +
            sorted(("solo sistema",) + x for x in sistema - oficial) if ("renovaciones", d[1]) not in exc]
    R.check("Servicios por renovar y su vencimiento", "R-50", difs, len(oficial))


def consumo_pauta(hojas, db, R):
    """R-64: pestaña 'Pauta' (costo de ejecución por mes de contrato) = consumo en el control de pauta."""
    oficial = collections.defaultdict(float)
    for r in hojas["Pauta"][1:]:
        if fecha(r[0]) and num(r[5]):
            oficial[fecha(r[0]).strftime("%Y-%m")] += num(r[5])
    sistema = {p: float(v) for p, v in query(db, """
        select to_char(fecha_contrato, 'YYYY-MM'), sum(consumo_usd) from v_control_pauta group by 1""")}
    difs = [(m, round(v, 2), round(sistema.get(m, 0), 2)) for m, v in sorted(oficial.items())
            if abs(sistema.get(m, 0) - v) > TOL]
    R.check("Consumo de pauta por mes", "R-64", difs, len(oficial))


def costos(hojas, db, R):
    """R-60: planilla, herramientas y comisiones por mes (en su moneda original)."""
    casos = [
        ("Planilla (S/)", "Planilla", 27, 1, 25, "select periodo, sum(costo_total) from planilla group by 1"),
        ("Herramientas (USD)", "Herramientas", 8, 0, 5, "select periodo, sum(monto) from herramienta_gasto group by 1"),
        ("Comisiones de venta (S/)", "Comision de venta", 5, 1, 4,
         "select periodo, sum(monto) from comision_pago group by 1"),
    ]
    for nombre, hoja, ncols, col_mes, col_monto, sql in casos:
        oficial = collections.defaultdict(float)
        for _, r in registros(hojas, hoja, ncols):
            f, v = fecha(r[col_mes]), num(r[col_monto])
            if f and v:
                oficial[f.strftime("%Y-%m")] += v
        sistema = {p[:7]: float(v) for p, v in query(db, sql)}
        difs = [(m, round(v, 2), round(sistema.get(m, 0), 2)) for m, v in sorted(oficial.items())
                if abs(sistema.get(m, 0) - v) > TOL]
        R.check(nombre, "R-60", difs, len(oficial))


def main():
    hojas, db = leer(sys.argv[1]), sys.argv[2]
    exc = excepciones(sys.argv[1])
    R = Resultado()
    ventas_por_mes(hojas, db, R)
    cobranza(hojas, db, R, exc)
    cobranza_por_contrato(hojas, db, R, exc)
    renovaciones(hojas, db, R, exc)
    consumo_pauta(hojas, db, R)
    costos(hojas, db, R)
    sys.exit(1 if R.fallas else 0)


if __name__ == "__main__":
    main()
