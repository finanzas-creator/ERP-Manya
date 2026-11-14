/* Sistema de Planilla HoldingD · Carga inicial desde la planilla mensual en Excel (formato HoldingD, oct-2026).
 * Misma lógica que etl/planilla_excel.py. Recibe el libro ya leído (SheetJS: { SheetNames, Sheets }) y devuelve
 * los registros a agregar al estado: empleador (pequeña empresa REMYPE, planilla desde el mes del Excel),
 * trabajadores con sueldo, pensión, CUSPP, asignación familiar, código del ERP de personal, rentas de quinta del
 * año anteriores al sistema (R-14), saldo de vacaciones (R-20), adelantos del mes y tasas AFP del mes (R-03).
 * No calcula nada: la planilla la calcula el motor. */
(function (raiz, fabrica) {
  const api = fabrica()
  if (typeof module === 'object' && module.exports) module.exports = api
  else raiz.PlanillaImportar = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  const AFP = { 'AFP INTEGRA': 'INTEGRA', 'AFP PRIMA': 'PRIMA', 'AFP HABITAT': 'HABITAT', 'AFP PROFUTURO': 'PROFUTURO' }
  const pad = (n) => String(n).padStart(2, '0')
  const letra = (c) => { let s = ''; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s }
  const esFecha = (v) => v instanceof Date
  // SheetJS entrega fechas a medianoche local (con posibles segundos de desfase): se toma el día más cercano
  const iso = (v) => { const d = new Date(v.getTime() + 12 * 3600000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
  const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
  const mayus = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase()   // conserva tildes y ñ
  const num = (v) => (typeof v === 'number' ? v : 0)
  const r2 = (x) => Math.round(x * 100) / 100

  function hoja(ws) {
    const v = (r, c) => { const x = ws[letra(c) + r]; return x ? x.v : undefined }
    const ref = ws['!ref'] || 'A1:A1', m = ref.split(':')[1].match(/^([A-Z]+)(\d+)$/)
    let maxCol = 0
    for (const ch of m[1]) maxCol = maxCol * 26 + ch.charCodeAt(0) - 64
    return { v, a: (dir) => { const x = ws[dir]; return x ? x.v : undefined }, maxFila: Number(m[2]), maxCol }
  }

  /**
   * @param libro { SheetNames, Sheets } leído con SheetJS (opción cellDates: true)
   * @param opciones { ingresoMinimo: 'AAAA-MM-DD' (dato de prueba), nuevoId: () => string }
   */
  function importarLibro(libro, opciones = {}) {
    const nuevoId = opciones.nuevoId || (() => Math.random().toString(36).slice(2) + Date.now().toString(36))
    const nombreMes = libro.SheetNames.find((n) => /\d{4}$/.test(n.trim()) && String(hoja(libro.Sheets[n]).a('A2') ?? '').includes('RUC'))
    if (!nombreMes) throw new Error('No se encontró la hoja del mes (título terminado en el año y RUC en la celda A2).')
    const H = hoja(libro.Sheets[nombreMes])
    const razon = String(H.a('A1')).trim()
    const ruc = (String(H.a('A2')).match(/\d{11}/) || [])[0]
    if (!ruc) throw new Error('No se encontró el RUC en la celda A2.')
    if (!esFecha(H.a('E5'))) throw new Error('La celda E5 debe tener la fecha del periodo.')
    const periodo = iso(H.a('E5')).slice(0, 7) + '-01'
    const anio = Number(periodo.slice(0, 4))
    const minimo = opciones.ingresoMinimo || null

    let direccion = null
    if (libro.Sheets.Boleta) direccion = String(hoja(libro.Sheets.Boleta).a('D6') ?? '').replace('Domicilio:', '').replace(/\s+/g, ' ').trim() || null

    // código del ERP de personal (hoja Asistencia): por apellidos
    const codigos = {}
    if (libro.Sheets.Asistencia) {
      const A = hoja(libro.Sheets.Asistencia)
      for (let r = 4; r <= A.maxFila; r++) if (A.v(r, 1) && A.v(r, 3)) codigos[norm(A.v(r, 3))] = String(A.v(r, 1)).trim()
    }
    // rentas previas del año y domicilio (hoja Renta 5ta), por documento
    const renta = {}
    if (libro.Sheets['Renta 5ta']) {
      const R = hoja(libro.Sheets['Renta 5ta'])
      const pares = []
      for (let c = 1; c <= R.maxCol; c++) if (R.v(8, c) != null) pares.push([R.v(8, c), c])   // hay encabezados de fecha repetidos
      const cab = {}
      for (const [v, c] of pares) if (!esFecha(v)) cab[v] = c
      const total = (pares.find(([v]) => typeof v === 'string' && v.trim().startsWith('Total Remuneración')) || [])[1]
      if (total) {
        const meses = pares.filter(([v, c]) => esFecha(v) && c < total).map(([, c]) => c)
        const reten = pares.filter(([v, c]) => esFecha(v) && c > total).map(([, c]) => c)
        const grati = pares.filter(([v]) => typeof v === 'string' && v.toUpperCase().startsWith('GRATIF')).map(([, c]) => c)
        const mesDe = (c) => { const h = R.v(8, c); return esFecha(h) ? iso(h).slice(0, 7) + '-01' : `${anio}-${String(h).toUpperCase().includes('DIC') ? '12' : '07'}-01` }
        const cOtro = cab['Ingreso planilla otro empleador'], cDom = cab['CONDICIÓN DE DOMICILIO']
        for (let r = 9; r <= R.maxFila; r++) {
          const doc = R.v(r, 2)
          if (!doc) continue
          const suma = (cols) => cols.reduce((a, c) => a + num(R.v(r, c)), 0)
          renta[String(doc).trim()] = {
            renta: suma(meses.concat(grati).filter((c) => mesDe(c) < periodo)),
            retencion: suma(reten.filter((c) => mesDe(c) < periodo)),
            otro: cOtro ? num(R.v(r, cOtro)) : 0,
            domiciliado: String((cDom && R.v(r, cDom)) || 'DOMICILIADO').trim().toUpperCase() !== 'NO DOMICILIADO',
          }
        }
      }
    }

    // tasas AFP del mes (bloque "Aportes, Comisiones y Prima de Seguros"), en fracciones
    const tasas = []
    for (let r = 1; r <= H.maxFila; r++) {
      if (String(H.v(r, 3) ?? '').trim() !== 'Aporte Obligatorio') continue
      const filas = {}
      for (let i = 0; i < 4; i++) filas[String(H.v(r + i, 3)).trim()] = r + i
      for (let c = 5; c <= 8; c++) {
        const n = String(H.v(r - 1, c) ?? '').toUpperCase()
        const afp = Object.values(AFP).find((x) => n.includes(x))
        if (!afp) continue
        const t = (k, def) => (filas[k] ? num(H.v(filas[k], c)) : def)
        tasas.push({ periodo, afp, aporte: t('Aporte Obligatorio', 0.10), prima: t('Prima de Seguros', 0), comision_flujo: t('Comisión Flujo', 0),
          comision_mixta: t('Comisión Variable (Mixta)', 0), comision_saldo: null, remuneracion_maxima: 12732.70, fuente: 'manual',
          sustento: `Hoja de tasas de la planilla ${razon} devengue ${periodo.slice(0, 7)}` })
      }
    }

    const empleadorId = opciones.empleadorId ?? nuevoId()
    const empleador = { id: empleadorId, razon_social: razon, ruc, direccion, inicio_planilla: periodo, descuento_dominical: false,
      dias_laborables_semana: 6, remype: [{ categoria: 'pequena', desde: minimo || '2020-01-01', hasta: null, constancia: 'Por registrar la constancia' }] }
    const trabajadores = [], movimientos = []
    const mesAnterior = new Date(Date.UTC(anio, Number(periodo.slice(5, 7)) - 1, 0)).toLocaleDateString('es-PE', { month: 'short', timeZone: 'UTC' })
    for (let r = 10; r <= H.maxFila; r++) {
      const v = (col) => H.a(col + r)
      const docV = v('B'), sueldo = v('K')
      if (!docV || typeof sueldo !== 'number') continue
      const doc = String(docV).trim()
      const D = v('D') == null || v('D') === 0 ? '' : v('D')
      const nombres = `${mayus(v('C'))} ${mayus(D)}`.trim() + ', ' + mayus(v('E'))
      let ingreso = esFecha(v('F')) ? iso(v('F')) : null
      if (!ingreso) throw new Error(`Fila ${r}: falta la fecha de ingreso de ${nombres}.`)
      if (minimo && ingreso <= minimo.slice(0, 8) + '28' && ingreso.slice(0, 7) === minimo.slice(0, 7)) ingreso = minimo
      const cese = esFecha(v('G')) ? iso(v('G')) : null
      const afp = AFP[String(v('AF') ?? '').trim().toUpperCase()] || null
      const info = renta[doc] || {}
      const id = nuevoId()
      const quinta_previa = []
      if (info.renta || info.retencion) quinta_previa.push({ anio, renta: r2(info.renta), retencion: r2(info.retencion), detalle: `Planilla ${razon} ene–${mesAnterior} ${anio}` })
      if (info.otro) quinta_previa.push({ anio, renta: r2(info.otro), retencion: 0, detalle: 'Otro empleador (según hoja Renta 5ta)' })
      trabajadores.push({
        id, empleador_id: empleadorId, codigo_externo: codigos[norm(`${v('C') ?? ''} ${D}`)] || null,
        tipo_documento: /^\d{8}$/.test(doc) ? 'DNI' : 'CE', numero_documento: doc, apellidos_nombres: nombres,
        cargo: v('H') != null ? String(v('H')) : null, fecha_ingreso: ingreso, fecha_cese: cese, motivo_cese: cese ? 'RENUNCIA' : null,
        domiciliado: info.domiciliado !== false, sistema_pension: afp ? 'afp' : 'onp', afp,
        comision_afp: afp ? String(v('AG')).trim().toLowerCase() : null, cuspp: afp && v('I') != null ? String(v('I')) : null,
        asignacion_familiar: String(v('J') ?? '').trim().toUpperCase() === 'SI', salud: 'essalud', jornada_horas: 8, periodo_prueba_meses: 3,
        remuneraciones: [{ desde: ingreso, sueldo, motivo: 'Carga inicial' }], fijos: [], quinta_previa,
        // R-20: sin vacaciones gozadas (dato de prueba): saldo cero al ingreso, todo lo ganado queda pendiente
        saldo_vacaciones: { al: ingreso, dias: 0, detalle: 'Carga inicial: sin vacaciones gozadas' },
      })
      if (typeof v('AM') === 'number' && v('AM') > 0) movimientos.push({ id: nuevoId(), trabajador_id: id, periodo, concepto: 'ADELANTO', monto: v('AM'), detalle: 'Carga inicial' })
    }
    if (!trabajadores.length) throw new Error('La hoja del mes no tiene trabajadores (desde la fila 10: documento en B y sueldo en K).')
    return { empleador, trabajadores, movimientos, tasas_afp: tasas.length === 4 ? tasas : [],
      resumen: { razon_social: razon, ruc, periodo, trabajadores: trabajadores.length, tasas: tasas.length === 4, hoja: nombreMes } }
  }

  /** Agrega lo importado a un estado (sin modificar el original). Si el RUC ya existe, no hace nada. */
  function agregarAlEstado(estado, imp) {
    if ((estado.empleadores || []).some((e) => !e.anulado && e.ruc === imp.empleador.ruc)) throw new Error(`El empleador ${imp.empleador.ruc} ya existe: no se vuelve a cargar.`)
    const p = estado.parametros || {}
    const ya = new Set((p.tasas_afp || []).map((t) => t.periodo + '|' + t.afp))
    return { ...estado,
      empleadores: (estado.empleadores || []).concat(imp.empleador),
      trabajadores: (estado.trabajadores || []).concat(imp.trabajadores),
      movimientos: (estado.movimientos || []).concat(imp.movimientos),
      parametros: { ...p, tasas_afp: (p.tasas_afp || []).concat(imp.tasas_afp.filter((t) => !ya.has(t.periodo + '|' + t.afp))) } }
  }

  return { importarLibro, agregarAlEstado }
})
