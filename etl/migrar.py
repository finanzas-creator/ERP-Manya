"""Migración única del "Sheet Administrativo" al modelo normalizado.

Uso: python3 etl/migrar.py <sheet.xlsx> <carpeta_salida>

Produce:
  <salida>/carga.sql        datos listos para psql (catálogos + hechos)
  <salida>/anomalias.md     resumen de inconsistencias encontradas
  <salida>/anomalias.csv    detalle fila por fila para revisión

Las reglas de limpieza viven en este archivo y se aplican UNA vez. Los atributos que el
sheet solo expresa por nombre (p. ej. "MM" = Manya Media, "BN" = detracción, "Pauta" =
terceros) se convierten aquí en campos explícitos; el sistema nunca vuelve a deducirlos.
"""
import collections
import csv
import datetime as dt
import os
import re
import sys
import unicodedata
import uuid
import warnings

import openpyxl

warnings.filterwarnings("ignore")
NS = uuid.UUID("6f1c6c1e-9a40-4d0b-9a57-6d616e796131")  # IDs deterministas: re-ejecutar da lo mismo
HOY = dt.date.today()


# ---------------------------------------------------------------- utilidades
def uid(*parts):
    return str(uuid.uuid5(NS, "|".join(str(p) for p in parts)))


def txt(v):
    if v is None:
        return None
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s or None


def clave(v):
    """Clave de comparación: sin tildes, minúsculas, espacios simples."""
    s = txt(v) or ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.lower()


def llave(v):
    """Código del sheet tal como lo enlaza Google Sheets (BUSCARV, SUMAR.SI): sin distinguir
    mayúsculas ni espacios repetidos (D-19)."""
    return (txt(v) or "").casefold()


def num(v):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except ValueError:
        return None


def fecha(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    return None


def mes(d):
    return d.replace(day=1) if d else None


def canonico(variantes):
    """Entre variantes de escritura, la más frecuente (desempate: la más larga)."""
    return max(variantes.items(), key=lambda kv: (kv[1], len(kv[0])))[0]


class Anomalias:
    def __init__(self):
        self.filas = []

    def add(self, tipo, hoja, ref, detalle, accion):
        self.filas.append((tipo, hoja, ref, detalle, accion))

    def escribir(self, carpeta):
        with open(os.path.join(carpeta, "anomalias.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["tipo", "hoja", "referencia", "detalle", "accion"])
            w.writerows(self.filas)
        por_tipo = collections.defaultdict(list)
        for fila in self.filas:
            por_tipo[(fila[0], fila[4])].append(fila)
        with open(os.path.join(carpeta, "anomalias.md"), "w") as f:
            f.write("# Anomalías de la migración\n\n| Tipo | Casos | Acción tomada | Ejemplos |\n|---|---|---|---|\n")
            for (tipo, accion), filas in sorted(por_tipo.items(), key=lambda kv: -len(kv[1])):
                ej = "; ".join(f"{r[2]}: {r[3]}" for r in filas[:3]).replace("|", "/")
                f.write(f"| {tipo} | {len(filas)} | {accion} | {ej[:300]} |\n")


A = Anomalias()


# ---------------------------------------------------------------- lectura
def leer(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    hojas = {}
    for ws in wb.worksheets:
        filas = [list(r) for r in ws.iter_rows(values_only=True)]
        filas = [r for r in filas if any(v not in (None, "") for v in r)]
        hojas[ws.title] = filas
    return hojas


def registros(hojas, nombre, n_cols):
    """Filas de una hoja como (n_fila_excel, lista de n_cols valores)."""
    filas = hojas[nombre]
    return [(i + 2, (r + [None] * n_cols)[:n_cols]) for i, r in enumerate(filas[1:])]


# ---------------------------------------------------------------- catálogos
LINEAS = ["Performance", "Proyectos", "Inbound"]

# tipo_servicio del sheet -> (categoría limpia, línea de negocio)  (R-07)
CATEGORIAS = {
    "Proformace": ("Performance", "Performance"),
    "Gestion_de_media": ("Gestión de medios", "Performance"),
    "Produccion audiovisual": ("Producción audiovisual", "Performance"),
    "Equipo_exclusivo": ("Equipo exclusivo", "Performance"),
    "Inbound": ("Inbound", "Inbound"),
    "Soporte": ("Soporte", "Proyectos"),
    "UX_UI": ("UX/UI", "Proyectos"),
    "Branding": ("Branding", "Proyectos"),
    "Hosting_y_dominio": ("Hosting y dominio", "Proyectos"),
}

SERVICIOS_TERCEROS = {"pauta", "influencers"}  # R-03: dinero que pasa a un tercero

SUB_AREAS = {  # R-62
    "Performance": ("directo", "Performance"),
    "Inbound": ("directo", "Inbound"),
    "Area de Proyectos": ("directo", "Proyectos"),
    "Dirección": ("direccion", None),
    "Gerencia": ("direccion", None),
    "Administracion": ("overhead", None),
    "Comercial": ("overhead", None),
    "Recurso Humanos": ("overhead", None),
    "Licitaciones": ("overhead", None),
}
PESOS_DIRECCION = {"Performance": 0.5, "Proyectos": 0.4, "Inbound": 0.1}

PLANTILLAS = {
    "100% al inicio": [("100% al inicio", 1, "inicio")],
    "100% al finalizar": [("100% al finalizar", 1, "fin")],
    "50% / 50%": [("50% inicial", 0.5, "inicio"), ("50% final", 0.5, "fin")],
    "60% / 40%": [("60% inicial", 0.6, "inicio"), ("40% final", 0.4, "fin")],
    "70% / 30%": [("70% inicial", 0.7, "inicio"), ("30% final", 0.3, "fin")],
}

# Las dos entidades de Manya (D-06): nombre corto que usa el sheet -> razón social y RUC.
EMPRESAS = {"Templates": ("Templates Art SAC", "20524981042"), "Manya Media": ("Manya Media EIRL", "20606381132")}


def empresa_de_serie(serie):
    """El sheet marca Manya Media con el prefijo 'MM'. Solo se usa aquí, una vez."""
    return "Manya Media" if serie.upper().startswith("MM") else "Templates"


def norm_equipo(v):
    s = txt(v)
    if not s or s == "-":
        return None
    return " ".join(w.capitalize() if w.isupper() or w.islower() else w for w in s.split())


# ---------------------------------------------------------------- SQL
def sql_val(v):
    if v is None:
        return "\\N"
    if isinstance(v, bool):
        return "t" if v else "f"
    s = str(v)
    return s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def sql_insert(tabla, cols, filas, identidad=False):
    over = " overriding system value" if identidad else ""
    valores = ",\n".join(
        "(" + ",".join("null" if v is None else ("true" if v is True else "false" if v is False else
                       "'" + str(v).replace("'", "''") + "'") for v in f) + ")" for f in filas)
    return f"insert into {tabla} ({','.join(cols)}){over} values\n{valores};\n"


def sql_copy(tabla, cols, filas):
    cuerpo = "\n".join("\t".join(sql_val(v) for v in f) for f in filas)
    return f"copy {tabla} ({','.join(cols)}) from stdin;\n{cuerpo}\n\\.\n"


class Salida:
    """La carga como lista de sentencias. Los bloques masivos se guardan como datos y se escriben
    como COPY (`sql`, para psql) o como INSERT por lotes (`lotes`, para la API HTTPS de Supabase,
    que no acepta COPY ... FROM stdin)."""
    FILAS_POR_INSERT = 500

    def __init__(self):
        self.partes = []  # texto SQL, o (tabla, cols, filas) para un bloque masivo

    def insert(self, tabla, cols, filas, identidad=False):
        if filas:
            self.partes.append(sql_insert(tabla, cols, filas, identidad))

    def copy(self, tabla, cols, filas):
        if filas:
            self.partes.append((tabla, cols, filas))

    def raw(self, s):
        self.partes.append(s + "\n")

    def sql(self):
        return "".join(p if isinstance(p, str) else sql_copy(*p) for p in self.partes)

    def lotes(self, max_bytes):
        """Sentencias INSERT agrupadas en lotes de ~max_bytes; cada lote es una transacción.
        El primer lote deshabilita la auditoría y el último la rehabilita y ajusta secuencias."""
        sentencias = []
        for p in self.partes:
            if isinstance(p, str):
                if p not in ("begin;\n", "commit;\n"):
                    sentencias.append(p)
                continue
            tabla, cols, filas = p
            for i in range(0, len(filas), self.FILAS_POR_INSERT):
                sentencias.append(sql_insert(tabla, cols, filas[i:i + self.FILAS_POR_INSERT]))
        lotes, actual, tam = [], [], 0
        for st in sentencias:
            if actual and tam + len(st) > max_bytes:
                lotes.append(actual)
                actual, tam = [], 0
            actual.append(st)
            tam += len(st)
        if actual:
            lotes.append(actual)
        return ["begin;\n" + "".join(l) + "commit;\n" for l in lotes]


# ---------------------------------------------------------------- migración
def modalidad_fila(r):
    """Modalidad de una fila de Contratos según el sheet (columna 'Siguiente Ciclo?')."""
    return "proyecto" if r[9] == "Es un proyecto" else "mensual"


def migrar(hojas):
    S = Salida()
    S.raw("begin;")
    auditadas = ["cliente", "marca", "servicio_contratado", "venta", "costo_directo", "comprobante",
                 "cuota", "pago", "planilla", "herramienta_gasto", "comision_pago", "empresa",
                 "linea_negocio", "categoria", "servicio", "equipo", "persona", "cuenta_bancaria",
                 "plantilla_pago", "plantilla_pago_item", "tipo_cambio_mensual", "sub_area", "peso_direccion"]
    for t in auditadas:  # la carga inicial no llena la bitácora
        S.raw(f"alter table {t} disable trigger {t}_auditoria;")

    contratos = registros(hojas, "Contratos", 34)
    plan = registros(hojas, "Plan de facturacion", 27)
    pagos = registros(hojas, "Pagos de facturas", 6)
    planilla = registros(hojas, "Planilla", 27)
    herramientas = registros(hojas, "Herramientas", 8)
    comisiones = registros(hojas, "Comision de venta", 5)

    # --- empresas, líneas, categorías
    emp_id = {n: i + 1 for i, n in enumerate(EMPRESAS)}
    S.insert("empresa", ["id", "nombre", "ruc"], [(i, *EMPRESAS[n]) for n, i in emp_id.items()], identidad=True)
    lin_id = {n: i + 1 for i, n in enumerate(LINEAS)}
    S.insert("linea_negocio", ["id", "nombre"], [(i, n) for n, i in lin_id.items()], identidad=True)
    cat_id = {}
    for i, (tipo, (nombre, linea)) in enumerate(CATEGORIAS.items()):
        cat_id[tipo] = i + 1
    S.insert("categoria", ["id", "nombre", "linea_id"],
             [(cat_id[t], n, lin_id[l]) for t, (n, l) in CATEGORIAS.items()], identidad=True)

    # --- servicios: (tipo, clave servicio) -> nombre canónico, modalidad por mayoría
    variantes = collections.defaultdict(collections.Counter)
    proyecto = collections.defaultdict(collections.Counter)
    for n, r in contratos:
        tipo, sv = txt(r[5]), txt(r[6])
        if tipo not in CATEGORIAS or not sv:
            A.add("contrato sin tipo/servicio válido", "Contratos", n, f"{r[5]} / {r[6]}", "fila omitida")
            continue
        k = (tipo, clave(sv))
        variantes[k][sv] += 1
        proyecto[k][modalidad_fila(r) == "proyecto"] += 1
    srv_id, srv_modalidad, srv_naturaleza, filas_srv = {}, {}, {}, []
    for i, (k, var) in enumerate(sorted(variantes.items())):
        sid = i + 1
        mod = "proyecto" if proyecto[k][True] > proyecto[k][False] else "mensual"
        nat = "terceros" if k[1] in SERVICIOS_TERCEROS else "propio"
        srv_id[k], srv_modalidad[k], srv_naturaleza[k] = sid, mod, nat
        filas_srv.append((sid, cat_id[k[0]], canonico(var), mod, nat))
        if len(var) > 1:
            A.add("servicio escrito de varias formas", "Contratos", canonico(var), " | ".join(var), "unificado")
    S.insert("servicio", ["id", "categoria_id", "nombre", "modalidad", "naturaleza"], filas_srv, identidad=True)

    # --- personas (partners, planilla, comisiones) con resolución de alias cortos
    completos = collections.Counter()
    for _, r in comisiones:
        if txt(r[2]):
            completos[txt(r[2])] += 1
    for _, r in planilla:
        if txt(r[2]):
            completos[txt(r[2])] += 1
    per_canon = {}  # clave -> nombre
    for nombre in completos:
        per_canon.setdefault(clave(nombre), nombre)
    pagados_comision = {clave(txt(r[2])): txt(r[2]) for _, r in comisiones if txt(r[2])}

    def persona(nombre_corto, hoja, ref):
        s = txt(nombre_corto)
        if not s:
            return None
        k = clave(s)
        if k in per_canon:
            return per_canon[k]
        # alias corto ("Ana") -> único receptor de comisiones cuyo nombre empieza igual
        cands = [v for kk, v in pagados_comision.items() if kk.split(" ")[0] == k]
        if len(cands) == 1:
            per_canon[k] = cands[0]
            A.add("partner con nombre corto", hoja, s, f"asociado a {cands[0]}", "unificado")
            return cands[0]
        per_canon[k] = s
        if "/" in s:
            A.add("partner compartido", hoja, ref, s, "se registra como persona propia; revisar")
        return s

    # --- equipos
    eq_nombres = set()

    def equipo(v, hoja, ref):
        e = norm_equipo(v)
        if e and not e.lower().startswith("team"):
            if hoja == "Contratos":
                A.add("equipo no reconocido en contrato", hoja, ref, e, "venta sin equipo")
                return None
        if e:
            eq_nombres.add(e)
        return e

    # --- cuentas bancarias
    def cuenta_attrs(nombre):
        empresa = "Manya Media" if nombre.upper().startswith("MM ") else (
            None if nombre.upper().startswith("ROY") else "Templates")
        moneda = "USD" if "USD" in nombre.upper() else "PEN"
        detr = nombre.upper() in ("BN", "MM BN")
        return empresa, moneda, detr

    cuentas = {}
    for _, r in pagos:
        b = txt(r[5])
        if b:
            cuentas.setdefault(clave(b), b)
    for r in hojas["BD"][1:]:
        b = txt(r[11]) if len(r) > 11 else None
        if b:
            cuentas.setdefault(clave(b), b)
    cta_id = {}
    filas_cta = []
    for i, (k, nombre) in enumerate(sorted(cuentas.items())):
        empresa, moneda, detr = cuenta_attrs(nombre)
        cta_id[k] = i + 1
        filas_cta.append((i + 1, nombre, emp_id.get(empresa), moneda, detr))
    S.insert("cuenta_bancaria", ["id", "nombre", "empresa_id", "moneda", "es_detraccion"], filas_cta, identidad=True)

    # --- plantillas de pago
    for i, (nombre, items) in enumerate(PLANTILLAS.items()):
        S.insert("plantilla_pago", ["id", "nombre"], [(i + 1, nombre)], identidad=True)
        S.insert("plantilla_pago_item", ["plantilla_id", "orden", "concepto", "porcentaje", "momento"],
                 [(i + 1, j + 1, c, p, m) for j, (c, p, m) in enumerate(items)])

    # --- sub-áreas y pesos de Dirección
    sa_id = {}
    for i, (nombre, (grupo, linea)) in enumerate(SUB_AREAS.items()):
        sa_id[clave(nombre)] = i + 1
        S.insert("sub_area", ["id", "nombre", "grupo", "linea_id"],
                 [(i + 1, nombre, grupo, lin_id[linea] if linea else None)], identidad=True)
    S.insert("peso_direccion", ["linea_id", "peso"], [(lin_id[l], p) for l, p in PESOS_DIRECCION.items()])

    # --- tipo de cambio mensual: mediana del TC de los pagos en soles del mes
    tcs = collections.defaultdict(list)
    for _, r in pagos:
        f, tc, b = fecha(r[1]), num(r[3]), txt(r[5])
        if f and tc and tc > 2 and b and cuenta_attrs(b)[1] == "PEN":
            tcs[mes(f)].append(tc)
    filas_tc = []
    for m, lst in sorted(tcs.items()):
        lst.sort()
        filas_tc.append((m.isoformat(), round(lst[len(lst) // 2], 6)))
    S.insert("tipo_cambio_mensual", ["periodo", "tc"], filas_tc)

    # --- clientes y marcas
    cli_var = collections.defaultdict(collections.Counter)
    for _, r in contratos:
        if txt(r[3]):
            cli_var[clave(r[3])][txt(r[3])] += 1
    cli_id, filas_cli = {}, []
    for k, var in sorted(cli_var.items()):
        nombre = canonico(var)
        cli_id[k] = uid("cliente", k)
        filas_cli.append((cli_id[k], nombre, False))
        if len(var) > 1:
            A.add("cliente escrito de varias formas", "Contratos", nombre, " | ".join(var), "unificado")
    # IGV 0% recurrente = cliente no domiciliado (R-12)
    igv0 = collections.Counter(clave(r[3]) for _, r in contratos if num(r[16]) == 0)
    total_cli = collections.Counter(clave(r[3]) for _, r in contratos)
    filas_cli = [(i, n, igv0[clave(n)] > total_cli[clave(n)] / 2) for i, n, _ in filas_cli]
    S.copy("cliente", ["id", "razon_social", "no_domiciliado"], filas_cli)

    marca_var = collections.defaultdict(collections.Counter)
    for _, r in contratos:
        if txt(r[3]) and txt(r[4]):
            marca_var[(clave(r[3]), clave(r[4]))][txt(r[4])] += 1
    marca_id, filas_marca = {}, []
    for (kc, km), var in sorted(marca_var.items()):
        marca_id[(kc, km)] = uid("marca", kc, km)
        filas_marca.append((marca_id[(kc, km)], cli_id[kc], canonico(var)))
    S.copy("marca", ["id", "cliente_id", "nombre"], filas_marca)

    # --- servicios contratados y ventas
    validos = [(n, r) for n, r in contratos
               if txt(r[5]) in CATEGORIAS and txt(r[6]) and txt(r[3]) and fecha(r[2]) and txt(r[0])]
    n_validos = {n for n, _ in validos}
    for n, r in contratos:
        if n not in n_validos and txt(r[5]) in CATEGORIAS and txt(r[6]):
            A.add("contrato incompleto", "Contratos", n, f"{r[0]} / {r[2]} / {r[3]}", "fila omitida")
    grupos = collections.defaultdict(list)
    for n, r in validos:
        k = (llave(r[1]) or llave(r[0]), clave(r[3]), txt(r[5]), clave(r[6]))  # D-19
        grupos[k].append((n, r))
    multi = collections.Counter(k[0] for k in grupos)
    for k, cnt in multi.items():
        if cnt > 1:
            A.add("servicio contratado con varios clientes o servicios", "Contratos", k, f"{cnt} variantes",
                  "separado en servicios contratados distintos")

    # % IGV implícito en las cuotas del plan (para contratos sin % IGV)
    igv_lineas = collections.defaultdict(list)
    for _, r in plan:
        if txt(r[1]) and num(r[3]):
            igv_lineas[llave(r[1])].append((num(r[4]) or 0) / num(r[3]))
    igv_de_cuotas = {k: (0.0 if all(abs(x) < 1e-6 for x in v) else 0.18) for k, v in igv_lineas.items()}

    # D-22: servicios mensuales que el sheet aún lista por renovar, con su vencimiento.
    por_renovar = {llave(r[0]): fecha(r[3]) for r in hojas["Estado de renovaciones"][1:] if r[0] and fecha(r[3])}
    r_codigo = lambda r: txt(r[1]) or txt(r[0])  # noqa: E731

    filas_sc, filas_venta, filas_cd = [], [], []
    venta_de_legacy, venta_info = {}, {}
    personas, equipos_usados = set(), set()
    for k, filas in grupos.items():
        filas.sort(key=lambda x: (fecha(x[1][2]), x[0]))
        sck = (k[1], k[2], k[3])
        scid = uid("sc", *k)
        ultima = filas[-1][1]
        mod_catalogo = srv_modalidad[(k[2], k[3])]
        if modalidad_fila(ultima) == "mensual":
            # D-22: sigue activo solo si el sheet lo lista en 'Estado de renovaciones' con este mismo
            # vencimiento; si no, se cerró ("No se renueva", renovado sin contrato nuevo o variante antigua).
            fin = fecha(ultima[9])
            estado = "activo" if fin is not None and por_renovar.get(llave(r_codigo(ultima))) == fin else "finalizado"
            if estado == "finalizado" and fin is not None and fin >= HOY - dt.timedelta(days=60):
                A.add("servicio mensual cerrado en el sheet", "Contratos", filas[-1][0],
                      f"{txt(ultima[1])}: {ultima[10]} hasta {fin}", "migrado como finalizado (D-22)")
        else:
            fin = fecha(ultima[12])
            estado = "activo" if (fin is None or fin >= HOY) and fecha(ultima[2]) >= HOY - dt.timedelta(days=180) \
                else "finalizado"
        nombre_sc = txt(ultima[1]) or txt(ultima[0])
        legacy_sc = nombre_sc if multi[k[0]] == 1 else \
            f"{nombre_sc} · {txt(ultima[3])} · {CATEGORIAS[k[2]][0]} · {txt(ultima[6])}"
        filas_sc.append((scid, cli_id[k[1]], marca_id.get((k[1], clave(ultima[4]))),
                         srv_id[(k[2], k[3])], estado, legacy_sc))
        for n, r in filas:
            vid = uid("venta", r[0])
            f0 = fecha(r[2])
            mod = modalidad_fila(r)  # R-02/D-21: la del contrato; se guarda solo si difiere del catálogo
            if mod == "proyecto":
                ffin = fecha(r[12])
            else:
                ffin = fecha(r[9])
            if ffin and ffin < f0:
                A.add("fecha fin anterior a fecha de contrato", "Contratos", n, f"{f0} -> {ffin}", "fecha fin vacía")
                ffin = None
            prov = num(r[14]) or 0.0
            monto = num(r[13])  # R-01/D-20: precio al cliente ("Costo neto"); la venta neta se calcula
            if monto is None:
                monto = (num(r[15]) or 0.0) + prov
                A.add("costo neto vacío", "Contratos", n, r[0], "monto neto de venta + costo de proveedor")
            elif num(r[15]) is not None and abs(monto - prov - num(r[15])) > 0.01:
                A.add("costo neto − proveedor distinto de monto neto de venta", "Contratos", n,
                      f"{monto} - {prov} vs {r[15]}", "se usa costo neto como precio")
            if monto < 0:
                A.add("monto neto negativo", "Contratos", n, monto, "fila omitida")
                continue
            pigv = num(r[16])
            if pigv is None:
                pigv = igv_de_cuotas.get(llave(r[0]), 0.18)
                A.add("% IGV vacío", "Contratos", n, r[0], f"se infiere de sus cuotas: {pigv:.0%}")
            elif pigv not in (0.0, 0.18):
                A.add("% IGV inusual", "Contratos", n, f"{r[0]}: {pigv}", "se conserva; revisar")
            p = persona(r[24], "Contratos", n)
            e = equipo(r[27], "Contratos", n)
            if p:
                personas.add(p)
            if e:
                equipos_usados.add(e)
            pct = num(r[25]) or 0.0
            if llave(r[0]) in venta_de_legacy:
                A.add("ID de contrato duplicado", "Contratos", n, r[0], "fila omitida")
                continue
            venta_de_legacy[llave(r[0])] = vid
            venta_info[vid] = {"pct_igv": pigv, "cliente": k[1], "fecha": f0, "naturaleza": srv_naturaleza[(k[2], k[3])]}
            filas_venta.append([vid, scid, f0.isoformat(), ffin.isoformat() if ffin else None, txt(r[7]), "USD",
                                monto, pigv, e, p, pct, r[0], mod if mod != mod_catalogo else None])
            if prov > 0:
                filas_cd.append((uid("cd", r[0], "prov"), vid, "proveedor", f0.isoformat(), "USD", prov,
                                 "Costo de proveedores (sheet)"))
            consumo = num(r[28])
            if consumo and consumo > 0:
                filas_cd.append((uid("cd", r[0], "consumo"), vid, "consumo_pauta", f0.isoformat(), "USD", consumo,
                                 "Consumo de pauta (sheet)"))

    # --- personas y equipos (de todas las hojas)
    for _, r in planilla:
        if txt(r[2]):
            personas.add(persona(r[2], "Planilla", None))
        equipo(r[11], "Planilla", None)
    for _, r in comisiones:
        if txt(r[2]):
            personas.add(persona(r[2], "Comision de venta", None))
    per_id = {p: i + 1 for i, p in enumerate(sorted(personas))}
    S.insert("persona", ["id", "nombre"], [(i, p) for p, i in per_id.items()], identidad=True)
    eq_id = {e: i + 1 for i, e in enumerate(sorted(eq_nombres))}
    S.insert("equipo", ["id", "nombre"], [(i, e) for e, i in eq_id.items()], identidad=True)

    S.copy("servicio_contratado", ["id", "cliente_id", "marca_id", "servicio_id", "estado", "codigo_legacy"], filas_sc)
    for f in filas_venta:
        f[8] = eq_id.get(f[8])
        f[9] = per_id.get(f[9])
    S.copy("venta", ["id", "servicio_contratado_id", "fecha_contrato", "fecha_fin", "descripcion", "moneda",
                     "monto_neto", "pct_igv", "equipo_id", "partner_id", "pct_comision", "codigo_legacy", "modalidad"],
           filas_venta)
    S.copy("costo_directo", ["id", "venta_id", "tipo", "fecha", "moneda", "monto", "descripcion"], filas_cd)

    # --- comprobantes y cuotas
    TIPOS = {"factura": "factura", "boleta": "boleta", "recibo": "recibo_honorarios", "rxh": "recibo_honorarios",
             "comanda": "comanda"}

    def serie_limpia(s):
        s = txt(s) or ""
        s = re.sub(r"^(MM|MS|RXH|Rxh|Recibo|FT)\s+", "", s, flags=re.I)
        s = re.sub(r"\s*-\s*", "-", s).replace(" ", "").upper()
        return s

    lineas_por_comp = collections.defaultdict(list)
    cuotas_validas = []
    for n, r in plan:
        if not txt(r[1]):
            continue
        vid = venta_de_legacy.get(llave(r[1]))
        if not vid:
            A.add("línea de facturación sin contrato", "Plan de facturacion", n, r[0], "línea omitida")
            continue
        cuotas_validas.append((n, r, vid))
        nro = txt(r[8])
        tipo = TIPOS.get(clave(r[7]))
        if not tipo:
            A.add("tipo de comprobante desconocido", "Plan de facturacion", n, r[7], "sin comprobante")
            continue
        if not nro or "EMITIR" in nro.upper():
            continue  # cuota aún por facturar
        serie = serie_limpia(nro)
        if tipo != "comanda" and not re.search(r"\d", serie):
            A.add("comprobante sin número", "Plan de facturacion", n, f"{r[0]} ({nro})", "registrado como comanda")
            tipo = "comanda"
        empresa = empresa_de_serie(nro)
        if nro.upper().startswith("MS"):
            A.add("serie con prefijo desconocido", "Plan de facturacion", n, nro, "asignado a Templates; revisar")
        if tipo == "comanda":
            key = ("comanda", llave(r[0]))
        else:
            key = (empresa, tipo, serie)
        lineas_por_comp[key].append((n, r, vid, empresa, tipo, serie))

    filas_comp, comp_de_linea = [], {}
    for key, lineas in lineas_por_comp.items():
        por_cliente = collections.defaultdict(list)
        for l in lineas:
            por_cliente[venta_info[l[2]]["cliente"]].append(l)
        grupos_cli = sorted(por_cliente.values(), key=len, reverse=True)
        for gi, ls in enumerate(grupos_cli):
            n, r, vid, empresa, tipo, serie = ls[0]
            sufijo = "" if gi == 0 else f" [revisar {gi}]"
            if gi > 0:
                A.add("comprobante con cuotas de varios clientes", "Plan de facturacion", ls[0][0],
                      f"{serie}: {len(grupos_cli)} clientes", "separado con sufijo [revisar]")
            cid = uid("comp", *key, gi)
            emisiones = [fecha(l[1][6]) for l in ls if fecha(l[1][6])]
            limites = [fecha(l[1][10]) for l in ls if fecha(l[1][10])]
            if not emisiones:
                A.add("comprobante sin fecha de emisión", "Plan de facturacion", n, serie or r[0],
                      "se usa la fecha de contrato")
                emisiones = [venta_info[vid]["fecha"]]
            pdet = max((num(l[1][11]) or 0) for l in ls)
            autod = None
            if any(txt(l[1][18]) == "Autodetraccion" for l in ls):
                ultimos = [fecha(l[1][26]) for l in ls if fecha(l[1][26])]
                autod = (max(ultimos) if ultimos else min(emisiones)).isoformat()
            filas_comp.append((cid, emp_id[empresa], tipo, (serie + sufijo) if tipo != "comanda" else None,
                               min(emisiones).isoformat(), min(limites).isoformat() if limites else None,
                               pdet, autod))
            for l in ls:
                comp_de_linea[llave(l[1][0])] = cid
    S.copy("comprobante", ["id", "empresa_id", "tipo", "serie_numero", "fecha_emision", "fecha_limite",
                           "pct_detraccion", "autodetraccion_fecha"], filas_comp)

    filas_cuota, cuota_de_linea = [], collections.defaultdict(list)
    orden = collections.Counter()
    cuotas_validas.sort(key=lambda x: (x[2], fecha(x[1][6]) or dt.date.max, x[0]))
    for n, r, vid in cuotas_validas:
        orden[vid] += 1
        # D-18: líneas con el mismo código son cuotas distintas (p. ej. pauta y creadores de contenido
        # en una factura); la segunda y siguientes llevan su número de ocurrencia en el id.
        previas = cuota_de_linea[llave(r[0])]
        qid = uid("cuota", r[0], *([len(previas) + 1] if previas else []))
        if previas:
            A.add("línea con código repetido", "Plan de facturacion", n, r[0],
                  "cuota separada; sus pagos se reparten en proporción (R-32)")
        monto = num(r[3])
        if monto is None:
            A.add("monto de cuota no numérico", "Plan de facturacion", n, r[0], "monto 0")
            monto = 0.0
        if monto < 0:
            A.add("cuota negativa (nota de crédito)", "Plan de facturacion", n, f"{r[0]}: {monto}", "cuota omitida")
            continue
        igv_sheet = num(r[4])
        if igv_sheet is not None and abs(monto * venta_info[vid]["pct_igv"] - igv_sheet) > 0.05:
            A.add("IGV de la cuota no coincide con % de la venta", "Plan de facturacion", n,
                  f"{r[0]}: {igv_sheet}", "se usa % de la venta")
        previas.append((qid, monto))
        filas_cuota.append((qid, vid, orden[vid], txt(r[2]) or "Cuota", monto,
                            fecha(r[9]).isoformat() if fecha(r[9]) else None, comp_de_linea.get(llave(r[0])), r[0]))
    S.copy("cuota", ["id", "venta_id", "orden", "concepto", "monto_neto", "fecha_limite", "comprobante_id",
                     "codigo_legacy"], filas_cuota)

    # --- pagos
    filas_pago = []
    for n, r in pagos:
        cuotas = cuota_de_linea.get(llave(r[0]))
        if not cuotas:
            A.add("pago sin línea de facturación", "Pagos de facturas", n, r[0], "pago omitido")
            continue
        f, monto, tc, musd, b = fecha(r[1]), num(r[2]), num(r[3]), num(r[4]), txt(r[5])
        if not (f and monto and b):
            A.add("pago incompleto", "Pagos de facturas", n, f"{r[0]} / {r[1]} / {r[2]}", "pago omitido")
            continue
        moneda_cta = cuenta_attrs(b)[1]
        tc = tc or 1.0
        if moneda_cta == "USD" and abs(tc - 1) > 1e-9:
            A.add("pago en cuenta USD con TC distinto de 1", "Pagos de facturas", n, f"{monto} / {tc}",
                  "se registra el monto USD del sheet con TC 1")
            monto, tc = (musd if musd else monto / tc), 1.0
        if moneda_cta == "PEN" and tc <= 2:
            A.add("pago en cuenta en soles con TC inválido", "Pagos de facturas", n, f"{monto} / {tc}",
                  "se usa el TC del mes")
            tc = None
        neto = sum(m for _, m in cuotas)
        for i, (qid, m) in enumerate(cuotas):  # R-32: un pago del código se reparte entre sus cuotas
            parte = monto * m / neto if neto else monto / len(cuotas)
            filas_pago.append((uid("pago", n, *([i] if i else [])), qid, f.isoformat(), cta_id[clave(b)],
                               parte, tc))
    S.copy("pago", ["id", "cuota_id", "fecha", "cuenta_id", "monto", "tc"],
           [p for p in filas_pago if p[5] is not None])
    sin_tc = [p for p in filas_pago if p[5] is None]
    for p in sin_tc:
        S.raw(f"insert into pago (id, cuota_id, fecha, cuenta_id, monto, tc) values "
              f"('{p[0]}','{p[1]}','{p[2]}',{p[3]},{p[4]}, tc_de('{p[2]}'));")

    # --- planilla
    filas_pl = []
    for n, r in planilla:
        m = mes(fecha(r[1]))
        costo = num(r[25])
        if not m or not txt(r[2]):
            continue
        if costo is None:
            A.add("planilla sin costo total", "Planilla", n, txt(r[2]), "fila omitida")
            continue
        sa = sa_id.get(clave(r[10]))
        if r[10] and not sa:
            A.add("sub-área no mapeada", "Planilla", n, r[10], "queda como overhead")
        emp = {"templates": "Templates", "manya media": "Manya Media"}.get(clave(r[12]))
        filas_pl.append((uid("pla", n), m.isoformat(), per_id[persona(r[2], "Planilla", n)], txt(r[4]), txt(r[3]),
                         txt(r[6]), txt(r[8]), sa, eq_id.get(norm_equipo(r[11])), emp_id.get(emp), "PEN", costo))
    S.copy("planilla", ["id", "periodo", "persona_id", "cargo", "tipo_cargo", "forma_pago", "tipo_recibo",
                        "sub_area_id", "equipo_id", "empresa_id", "moneda", "costo_total"], filas_pl)

    # --- herramientas
    filas_h = []
    for n, r in herramientas:
        m, monto = mes(fecha(r[0])), num(r[5])
        if not m or monto is None:
            if monto:
                A.add("herramienta sin periodo", "Herramientas", n, f"{r[1]}: {monto}", "fila omitida")
            continue
        filas_h.append((uid("her", n), m.isoformat(), txt(r[1]) or "(sin nombre)", txt(r[3]), txt(r[4]), "USD",
                        monto, txt(r[7])))
    S.copy("herramienta_gasto", ["id", "periodo", "nombre", "tipo", "plan", "moneda", "monto", "tarjeta"], filas_h)

    # --- comisiones pagadas
    filas_c = []
    for n, r in comisiones:
        m, monto = mes(fecha(r[1])), num(r[4])
        if not m or not txt(r[2]) or not monto:
            continue
        filas_c.append((uid("com", n), m.isoformat(), per_id[persona(r[2], "Comision de venta", n)], "PEN", monto))
    S.copy("comision_pago", ["id", "periodo", "persona_id", "moneda", "monto"], filas_c)

    # --- totales oficiales del sheet, para la pantalla Validación (etl/referencias.py)
    from referencias import todas
    S.insert("referencia_sheet", ["periodo", "concepto", "detalle", "valor"], todas(hojas))

    for t in auditadas:
        S.raw(f"alter table {t} enable trigger {t}_auditoria;")
    for t in ["empresa", "linea_negocio", "categoria", "servicio", "equipo", "persona", "cuenta_bancaria",
              "plantilla_pago", "sub_area"]:
        S.raw(f"select setval(pg_get_serial_sequence('{t}','id'), (select max(id) from {t}));")
    S.raw("select setval('venta_codigo_seq', (select count(*) from venta));")
    S.raw("commit;")
    # Estadísticas al día: sin ellas el planificador elige mal justo después de la carga (8 s vs 0.1 s).
    S.raw("analyze;")
    return S


LOTE_BYTES = 1_000_000


def main():
    # Uso: migrar.py <sheet.xlsx> <carpeta> [--inserts]
    # --inserts: además escribe <carpeta>/lotes/NNN.sql (INSERT por lotes, sin COPY) para cargar
    # por la API de consultas de Supabase; se aplican en orden.
    origen, carpeta = sys.argv[1], sys.argv[2]
    os.makedirs(carpeta, exist_ok=True)
    hojas = leer(origen)
    S = migrar(hojas)
    with open(os.path.join(carpeta, "carga.sql"), "w") as f:
        f.write(S.sql())
    if "--inserts" in sys.argv[3:]:
        dir_lotes = os.path.join(carpeta, "lotes")
        os.makedirs(dir_lotes, exist_ok=True)
        for viejo in os.listdir(dir_lotes):
            os.remove(os.path.join(dir_lotes, viejo))
        lotes = S.lotes(LOTE_BYTES)
        for i, lote in enumerate(lotes, 1):
            with open(os.path.join(dir_lotes, f"{i:03d}.sql"), "w") as f:
                f.write(lote)
        print(f"{len(lotes)} lotes INSERT escritos en {dir_lotes}")
    A.escribir(carpeta)
    print(f"carga.sql escrito; {len(A.filas)} anomalías registradas en {carpeta}/anomalias.md")


if __name__ == "__main__":
    main()
