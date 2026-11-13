#!/usr/bin/env python3
"""Carga inicial de un empleador desde su planilla mensual en Excel (formato HoldingD, oct-2026).

Uso: python3 etl/planilla_excel.py data/planilla.xlsx data/planilla.sql [--ingreso-minimo 2025-02-01]

Lee la hoja del mes (cabecera con razón social, RUC y periodo; una fila por trabajador), la hoja
"Renta 5ta" (rentas y retenciones del año anteriores al mes, condición de domicilio), "Asistencia"
(código del ERP de personal y adelantos) y el bloque de tasas AFP del mes. Escribe un SQL que:
  - registra el empleador (pequeña empresa REMYPE) con la planilla desde el mes del Excel;
  - registra a cada trabajador con su sueldo, pensión, CUSPP, asignación familiar y código externo;
  - registra las rentas de quinta del año anteriores al sistema (R-113) y el saldo de vacaciones (R-119);
  - registra las tasas AFP del mes como registro manual con su sustento (R-102) y los adelantos.
No calcula nada: la planilla la calcula la base. Si el RUC ya existe, no hace nada.
Los datos de trabajadores no se versionan: el Excel y el SQL van en data/.
"""
import argparse
import datetime as dt
import re
import sys
import unicodedata

import openpyxl

AFP = {'AFP INTEGRA': 'INTEGRA', 'AFP PRIMA': 'PRIMA', 'AFP HABITAT': 'HABITAT', 'AFP PROFUTURO': 'PROFUTURO'}


def lit(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(round(v, 2))
    if isinstance(v, (dt.date, dt.datetime)):
        return f"'{v:%Y-%m-%d}'"
    return "'" + str(v).replace("'", "''") + "'"


def norm(s):
    s = unicodedata.normalize('NFKD', str(s or '')).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'\s+', ' ', s).strip()


def fecha(v):
    return v.date() if isinstance(v, dt.datetime) else v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('excel')
    ap.add_argument('salida')
    ap.add_argument('--ingreso-minimo', help='ingresos anteriores o en el mismo mes se registran en esta fecha (dato de prueba)')
    a = ap.parse_args()
    wb = openpyxl.load_workbook(a.excel, data_only=True)
    hoja = next(ws for ws in wb.worksheets if re.search(r'\d{4}$', ws.title.strip()) and ws['A2'].value and 'RUC' in str(ws['A2'].value))
    razon = str(hoja['A1'].value).strip()
    ruc = re.search(r'\d{11}', str(hoja['A2'].value)).group(0)
    periodo = fecha(hoja['E5'].value).replace(day=1)
    minimo = dt.date.fromisoformat(a.ingreso_minimo) if a.ingreso_minimo else None

    direccion = None
    if 'Boleta' in wb.sheetnames:
        d = str(wb['Boleta']['D6'].value or '')
        direccion = re.sub(r'\s+', ' ', d.replace('Domicilio:', '')).strip() or None

    # código del ERP de personal (hoja Asistencia): por apellidos
    codigos, adelantos = {}, {}
    if 'Asistencia' in wb.sheetnames:
        for r in wb['Asistencia'].iter_rows(min_row=4, values_only=True):
            if r[0] and r[2]:
                codigos[norm(r[2])] = str(r[0]).strip()
    # rentas previas del año y domicilio (hoja Renta 5ta), por documento
    renta = {}
    if 'Renta 5ta' in wb.sheetnames:
        rs = wb['Renta 5ta']
        pares = [(c.value, c.column) for c in rs[8] if c.value is not None]   # hay encabezados de fecha repetidos
        cab = {v: c for v, c in pares if not isinstance(v, dt.datetime)}
        total = next(c for v, c in pares if isinstance(v, str) and v.strip().startswith('Total Remuneración'))
        meses = [c for v, c in pares if isinstance(v, dt.datetime) and c < total]
        reten = [c for v, c in pares if isinstance(v, dt.datetime) and c > total]
        grati = [c for v, c in pares if isinstance(v, str) and v.upper().startswith('GRATIF')]
        for r in range(9, rs.max_row + 1):
            doc = rs.cell(r, 2).value
            if not doc:
                continue
            mes_de = lambda c: rs.cell(8, c).value if isinstance(rs.cell(8, c).value, dt.datetime) else dt.datetime(  # noqa: E731
                periodo.year, 12 if 'DIC' in str(rs.cell(8, c).value).upper() else 7, 1)
            previos = [c for c in meses + grati if mes_de(c) < dt.datetime(periodo.year, periodo.month, 1)]
            rcol = [c for c in reten if rs.cell(8, c).value < dt.datetime(periodo.year, periodo.month, 1)]
            renta[str(doc).strip()] = {
                'renta': sum(float(rs.cell(r, c).value or 0) for c in previos if not isinstance(rs.cell(r, c).value, str)),
                'retencion': sum(float(rs.cell(r, c).value or 0) for c in rcol if not isinstance(rs.cell(r, c).value, str)),
                'otro': float(rs.cell(r, cab.get('Ingreso planilla otro empleador', 0)).value or 0) if cab.get('Ingreso planilla otro empleador') else 0,
                'domiciliado': str(rs.cell(r, cab.get('CONDICIÓN DE DOMICILIO', 0)).value or 'DOMICILIADO').strip().upper() != 'NO DOMICILIADO',
            }

    # tasas AFP del mes (bloque "Aportes, Comisiones y Prima de Seguros")
    tasas = {}
    for r in range(1, hoja.max_row + 1):
        if str(hoja.cell(r, 3).value or '').strip() == 'Aporte Obligatorio':
            nombres = {c: str(hoja.cell(r - 1, c).value or '').upper() for c in range(5, 9)}
            filas = {str(hoja.cell(r + i, 3).value).strip(): r + i for i in range(0, 4)}
            for c, n in nombres.items():
                cod = next((v for k, v in AFP.items() if v in n), None)
                if cod:
                    tasas[cod] = {k: float(hoja.cell(f, c).value or 0) * 100 for k, f in filas.items()}

    sql = [f"-- Carga inicial de {razon} ({ruc}) desde la planilla de {periodo:%m/%Y}. Datos personales: no versionar.",
           'begin;',
           f"do $$ begin if exists (select 1 from empleador where ruc = {lit(ruc)}) then raise exception 'El empleador {ruc} ya existe: no se vuelve a cargar'; end if; end $$;",
           f"insert into empleador (razon_social, ruc, direccion, inicio_planilla) values ({lit(razon)}, {lit(ruc)}, {lit(direccion)}, {lit(periodo)});",
           f"insert into empleador_remype (empleador_id, categoria, desde, constancia) select id, 'pequena', {lit(minimo or dt.date(2020, 1, 1))}, 'Por registrar la constancia' from empleador where ruc = {lit(ruc)};"]
    if len(tasas) == 4:
        js = ', '.join("jsonb_build_object('codigo', %s, 'aporte', %s, 'prima', %s, 'comision_flujo', %s, 'comision_mixta', %s, 'remuneracion_maxima', 12732.70)" % (
            lit(k), v.get('Aporte Obligatorio', 10), v.get('Prima de Seguros', 0), v.get('Comisión Flujo', 0), v.get('Comisión Variable (Mixta)', 0)) for k, v in tasas.items())
        sql.append(f"do $$ begin if not exists (select 1 from tasa_afp where periodo = {lit(periodo)}) then "
                   f"perform registrar_tasas_afp({lit(periodo)}, jsonb_build_array({js}), 'manual', "
                   f"{lit(f'Hoja de tasas de la planilla {razon} devengue {periodo:%Y-%m}; remuneración máxima SBS oct–dic 2026')}); end if; end $$;")

    n = 0
    for r in range(10, hoja.max_row + 1):
        v = lambda col: hoja[f'{col}{r}'].value  # noqa: E731
        doc, sueldo = v('B'), v('K')
        if not doc or not isinstance(sueldo, (int, float)):
            continue
        doc = str(doc).strip()
        mayus = lambda x: re.sub(r'\s+', ' ', str(x or '')).strip().upper()  # noqa: E731  (conserva tildes y ñ)
        nombres = f"{mayus(v('C'))} {mayus(v('D')) if v('D') not in (None, 0) else ''}".strip() + ', ' + mayus(v('E'))
        ingreso = fecha(v('F'))
        if minimo and ingreso <= minimo.replace(day=28) and ingreso.strftime('%Y-%m') == minimo.strftime('%Y-%m'):
            ingreso = minimo
        cese = fecha(v('G')) if isinstance(v('G'), (dt.date, dt.datetime)) else None
        pension = str(v('AF') or '').strip().upper()
        afp = AFP.get(pension)
        codigo = codigos.get(norm(f"{v('C')} {v('D') if v('D') not in (None, 0) else ''}"))
        info = renta.get(doc, {})
        t = (f"(select id from trabajador where empleador_id = (select id from empleador where ruc = {lit(ruc)}) "
             f"and numero_documento = {lit(doc)})")
        sql.append(
            "insert into trabajador (empleador_id, codigo_externo, tipo_documento, numero_documento, apellidos_nombres, cargo, "
            "fecha_ingreso, fecha_cese, motivo_cese, sistema_pension, afp_id, comision_afp, cuspp, asignacion_familiar, domiciliado) "
            f"values ((select id from empleador where ruc = {lit(ruc)}), {lit(codigo)}, {lit('DNI' if re.fullmatch(r'\d{8}', doc) else 'CE')}, "
            f"{lit(doc)}, {lit(nombres)}, {lit(v('H'))}, {lit(ingreso)}, {lit(cese)}, {lit('RENUNCIA' if cese else None)}, "
            f"{lit('afp' if afp else 'onp')}, {f'(select id from afp where codigo = {lit(afp)})' if afp else 'null'}, "
            f"{lit(str(v('AG')).strip().lower()) if afp else 'null'}, {lit(v('I') if afp else None)}, "
            f"{lit(str(v('J')).strip().upper() == 'SI')}, {lit(info.get('domiciliado', True))});")
        sql.append(f"insert into remuneracion (trabajador_id, vigente_desde, sueldo_basico, motivo) values ({t}, {lit(ingreso)}, {lit(float(sueldo))}, 'Carga inicial');")
        # R-119: no tomaron vacaciones (dato de prueba): saldo cero al ingreso, todo lo ganado queda pendiente
        sql.append(f"insert into saldo_vacaciones_inicial (trabajador_id, al, dias_pendientes, detalle) values ({t}, {lit(ingreso)}, 0, 'Carga inicial: sin vacaciones gozadas');")
        if info.get('renta') or info.get('retencion'):
            sql.append(f"insert into quinta_previa (trabajador_id, anio, renta_bruta, retencion, detalle) values ({t}, {periodo.year}, "
                       f"{lit(info['renta'])}, {lit(info['retencion'])}, 'Planilla {razon} ene–{(periodo.replace(day=1) - dt.timedelta(days=1)):%b} {periodo.year}');")
        if info.get('otro'):
            sql.append(f"insert into quinta_previa (trabajador_id, anio, renta_bruta, retencion, detalle) values ({t}, {periodo.year}, "
                       f"{lit(info['otro'])}, 0, 'Otro empleador (según hoja Renta 5ta)');")
        if isinstance(v('AM'), (int, float)) and v('AM') > 0:
            sql.append(f"insert into movimiento (trabajador_id, periodo, concepto, monto, detalle) values ({t}, {lit(periodo)}, 'ADELANTO', {lit(float(v('AM')))}, 'Carga inicial');")
        n += 1
    sql.append('commit;')
    with open(a.salida, 'w') as f:
        f.write('\n'.join(sql) + '\n')
    print(f'{razon} {ruc}: {n} trabajadores, periodo {periodo:%Y-%m}, tasas AFP {"sí" if len(tasas) == 4 else "no"} → {a.salida}', file=sys.stderr)


if __name__ == '__main__':
    main()
