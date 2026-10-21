"""Totales oficiales que reporta el sheet, por mes. Único lugar donde se leen: la carga los
guarda en `referencia_sheet` (para la pantalla Validación) y las pruebas doradas los comparan
contra las vistas del sistema.

Cada función devuelve {(periodo 'YYYY-MM', detalle): valor}; `detalle` distingue partes de un
mismo concepto (la categoría en las ventas) y es '' cuando no aplica.
"""
import collections

from migrar import CATEGORIAS, fecha, num, registros


def ventas_usd(hojas):
    """R-03/R-04: pestaña 'Ventas' (venta neta por mes y tipo de servicio, sin terceros)."""
    tabla = hojas["Ventas"]
    meses = [m for m in tabla[0][1:] if m]
    oficial = {}
    for fila in tabla[1:]:
        tipo = fila[0]
        if tipo in CATEGORIAS:
            for i, m in enumerate(meses):
                y, mo, _ = str(m).split("-")
                oficial[(f"{int(y):04d}-{int(mo):02d}", CATEGORIAS[tipo][0])] = num(fila[i + 1]) or 0.0
    return oficial


def consumo_pauta_usd(hojas):
    """R-64: pestaña 'Pauta' (costo de ejecución por mes de contrato)."""
    oficial = collections.defaultdict(float)
    for r in hojas["Pauta"][1:]:
        if fecha(r[0]) and num(r[5]):
            oficial[(fecha(r[0]).strftime("%Y-%m"), "")] += num(r[5])
    return dict(oficial)


def _por_mes(hojas, hoja, ncols, col_mes, col_monto):
    oficial = collections.defaultdict(float)
    for _, r in registros(hojas, hoja, ncols):
        f, v = fecha(r[col_mes]), num(r[col_monto])
        if f and v:
            oficial[(f.strftime("%Y-%m"), "")] += v
    return dict(oficial)


def planilla_pen(hojas):
    """R-60: pestaña 'Planilla', columna 'Sueldo Bruto Total' (S/)."""
    return _por_mes(hojas, "Planilla", 27, 1, 25)


def herramientas_usd(hojas):
    """R-60: pestaña 'Herramientas' (USD)."""
    return _por_mes(hojas, "Herramientas", 8, 0, 5)


def comisiones_pen(hojas):
    """R-42: pestaña 'Comision de venta' (S/)."""
    return _por_mes(hojas, "Comision de venta", 5, 1, 4)


# Concepto de referencia_sheet -> función que lo lee del sheet.
CONCEPTOS = {
    "ventas_usd": ventas_usd,
    "consumo_pauta_usd": consumo_pauta_usd,
    "planilla_pen": planilla_pen,
    "herramientas_usd": herramientas_usd,
    "comisiones_pen": comisiones_pen,
}


def todas(hojas):
    """Filas (periodo, concepto, detalle, valor) para cargar en referencia_sheet."""
    return [(f"{p}-01", concepto, detalle, round(v, 6))
            for concepto, leer in CONCEPTOS.items() for (p, detalle), v in sorted(leer(hojas).items())]
