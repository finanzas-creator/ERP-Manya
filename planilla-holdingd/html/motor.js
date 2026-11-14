/* Sistema de Planilla HoldingD · Motor de cálculo (R-01…R-25).
 * Funciones puras: reciben el estado (empleadores, trabajadores, novedades, cierres) y devuelven la
 * planilla, boletas, beneficios y liquidaciones. No guarda nada ni depende de ninguna librería: el ERP
 * que lo integre le pasa sus datos con la forma documentada en LEEME.md y lee los resultados.
 * Es la misma lógica que las migraciones SQL del sistema (db/migrations/003_calculo.sql), verificada
 * con las mismas pruebas (pruebas/motor.test.mjs). */
(function (raiz, fabrica) {
  const enNode = typeof module === 'object' && module.exports
  const api = fabrica(enNode ? require('./datos.js') : raiz.PLANILLA_DATOS)
  if (enNode) module.exports = api
  else raiz.PlanillaMotor = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (DATOS) {
  'use strict'

  // ---------------------------------------------------------------- Fechas ('AAAA-MM-DD', sin zonas horarias)
  const DIA = 86400000
  const pad = (n) => String(n).padStart(2, '0')
  const ms = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  const deMs = (x) => { const d = new Date(x); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }
  const sumarDias = (s, n) => deMs(ms(s) + n * DIA)
  const diasEntre = (a, b) => Math.round((ms(b) - ms(a)) / DIA)          // b − a
  const inicioMes = (s) => s.slice(0, 7) + '-01'
  const diasDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
  const finMes = (s) => { const [y, m] = s.split('-').map(Number); return `${y}-${pad(m)}-${pad(diasDelMes(y, m))}` }
  /** Suma meses como Postgres: el 31 de enero + 1 mes = 28/29 de febrero. */
  const sumarMeses = (s, n) => {
    const [y, m, d] = s.split('-').map(Number)
    const t = y * 12 + (m - 1) + n, yy = Math.floor(t / 12), mm = (t % 12 + 12) % 12 + 1
    return `${yy}-${pad(mm)}-${pad(Math.min(d, diasDelMes(yy, mm)))}`
  }
  const sumarAnios = (s, n) => sumarMeses(s, 12 * n)
  const mayor = (a, b) => (a > b ? a : b)
  const menor = (a, b) => (a < b ? a : b)
  const mesDe = (s) => Number(s.slice(5, 7))
  const anioDe = (s) => Number(s.slice(0, 4))
  /** Años, meses y días entre dos fechas, como age() de Postgres (los días se toman del mes de inicio). */
  function edad(fin, ini) {
    const [y1, m1, d1] = fin.split('-').map(Number), [y2, m2, d2] = ini.split('-').map(Number)
    let y = y1 - y2, m = m1 - m2, d = d1 - d2
    if (d < 0) { d += diasDelMes(y2, m2); m-- }
    if (m < 0) { m += 12; y-- }
    return { y, m, d }
  }
  const hoyISO = () => { const d = new Date(); return deMs(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) }

  /** Redondeo a céntimos, mitad hacia arriba, sin errores de coma flotante (igual que numeric en SQL). */
  const r2 = (x) => {
    if (x == null || Number.isNaN(x)) return x
    return Math.sign(x) * Math.round(Number((Math.abs(x) * 100).toPrecision(15))) / 100
  }

  // R-04: días laborales de un tramo dentro de un mes: mes completo = 30; parcial = días calendario (máx. 30)
  function diasTramo(desde, hasta) {
    if (hasta < desde) return 0
    if (desde === inicioMes(desde) && hasta === finMes(desde)) return 30
    return Math.min(30, diasEntre(desde, hasta) + 1)
  }
  function diasLaborales(desde, hasta) {
    if (hasta < desde) return 0
    let total = 0
    for (let m = inicioMes(desde); m <= inicioMes(hasta); m = sumarMeses(m, 1)) total += diasTramo(mayor(desde, m), menor(hasta, finMes(m)))
    return total
  }
  // R-17: meses calendario completos
  function mesesCompletos(desde, hasta) {
    if (hasta < desde) return 0
    let n = 0
    for (let m = inicioMes(desde); m <= inicioMes(hasta); m = sumarMeses(m, 1)) if (m >= desde && finMes(m) <= hasta) n++
    return n
  }
  const semestreGrati = (f) => `${anioDe(f)}-${mesDe(f) >= 7 ? '07' : '01'}-01`
  const semestreCts = (f) => mesDe(f) >= 11 ? `${anioDe(f)}-11-01` : mesDe(f) >= 5 ? `${anioDe(f)}-05-01` : `${anioDe(f) - 1}-11-01`

  const fechas = { sumarDias, sumarMeses, inicioMes, finMes, diasEntre, edad, hoyISO, diasTramo, diasLaborales, mesesCompletos,
    semestreGrati, semestreCts }

  // ---------------------------------------------------------------- Motor sobre un estado
  /**
   * @param estado { empleadores, trabajadores, ausencias, asistencia, movimientos, cierres, parametros }
   * @param opciones { hoy: 'AAAA-MM-DD' } (por defecto, la fecha del equipo)
   */
  function crearMotor(estado, opciones = {}) {
    const hoy = opciones.hoy || hoyISO()
    const vivo = (x) => x && !x.anulado
    const P = estado.parametros || {}
    const legales = DATOS.legales.concat(P.legales || [])
    const tramos = P.tramos_quinta || DATOS.tramosQuinta
    // tasas AFP: las registradas en el estado reemplazan a las incluidas para el mismo mes y AFP
    const tasas = new Map()
    for (const t of DATOS.tasasAfp.concat(P.tasas_afp || [])) tasas.set(t.periodo + '|' + t.afp, t)
    const REG = DATOS.regimenes
    const C = Object.fromEntries((P.conceptos || DATOS.conceptos).map((c) => [c.codigo, c]))
    const TA = Object.fromEntries(DATOS.tiposAusencia.map((t) => [t.codigo, t]))
    const MC = Object.fromEntries(DATOS.motivosCese.map((m) => [m.codigo, m]))
    const E = new Map((estado.empleadores || []).filter(vivo).map((e) => [e.id, e]))
    // valores por defecto de un trabajador (los mismos de la tabla trabajador en SQL)
    const DEF = { tipo_documento: 'DNI', domiciliado: true, sistema_pension: 'onp', asignacion_familiar: false, salud: 'essalud',
      jornada_horas: 8, periodo_prueba_meses: 3 }
    const conDef = (t) => { const x = { ...t }; for (const k in DEF) if (x[k] == null) x[k] = DEF[k]; return x }
    const T = new Map((estado.trabajadores || []).filter(vivo).map((t) => [t.id, conDef(t)]))
    const porTrabajador = (lista) => {
      const m = new Map()
      for (const x of (lista || []).filter(vivo)) { if (!m.has(x.trabajador_id)) m.set(x.trabajador_id, []); m.get(x.trabajador_id).push(x) }
      return m
    }
    const AUS = porTrabajador(estado.ausencias), ASI = porTrabajador(estado.asistencia), MOV = porTrabajador(estado.movimientos)
    const emitidas = new Map()
    const cierresVivos = (estado.cierres || []).filter(vivo)
    for (const ci of cierresVivos) for (const b of ci.boletas || []) emitidas.set(b.trabajador_id + '|' + ci.periodo, { ...b, cierre: ci })
    const cerradas = new Set(cierresVivos.map((ci) => ci.empleador_id + '|' + ci.periodo))
    const rems = (t) => (t.remuneraciones || []).filter(vivo).slice().sort((a, b) => (a.desde < b.desde ? -1 : 1))
    const memo = (fn) => { const m = new Map(); return (...a) => { const k = JSON.stringify(a); if (!m.has(k)) m.set(k, fn(...a)); return m.get(k) } }
    const trab = (id) => { const t = T.get(id); if (!t) throw new Error('Trabajador desconocido: ' + id); return t }

    // R-02, R-03: parámetro vigente e impuesto por tramos
    const legal = memo((p, f) => {
      let mejor = null
      for (const l of legales) if (l.parametro === p && l.desde <= f && (!mejor || l.desde > mejor.desde)) mejor = l
      return mejor ? mejor.valor : null
    })
    function impuestoQuinta(renta, f) {
      const uit = legal('uit', f)
      const vig = tramos.filter((t) => t.desde <= f).reduce((a, t) => mayor(a, t.desde), '')
      const ts = tramos.filter((t) => t.desde === vig).sort((a, b) => a.desde_uit - b.desde_uit)
      const r = Math.max(renta, 0)
      let total = 0
      ts.forEach((t, i) => {
        const desde = t.desde_uit * uit, hasta = ts[i + 1] ? ts[i + 1].desde_uit * uit : r
        total += Math.max(0, Math.min(r, hasta) - desde) * t.tasa
      })
      return r2(total)
    }
    const tasaAfpEn = memo((afp, periodo) => {
      let mejor = null
      for (const t of tasas.values()) if (t.afp === afp && t.periodo <= inicioMes(periodo) && (!mejor || t.periodo > mejor.periodo)) mejor = t
      return mejor
    })

    // R-01: régimen — pactado → REMYPE vigente (cadena continua) si ingresó después → general
    const regimenEn = memo((tid, f) => {
      const t = trab(tid)
      if (t.regimen_pactado) return t.regimen_pactado
      const rs = (E.get(t.empleador_id)?.remype || []).filter(vivo)
      const vig = rs.filter((r) => r.desde <= f && (!r.hasta || r.hasta >= f)).sort((a, b) => (a.desde < b.desde ? 1 : -1))
      if (!vig.length) return 'general'
      const cadena = [...vig]
      for (let cambio = true; cambio;) {
        cambio = false
        for (const r of rs) if (!cadena.includes(r) && r.hasta && cadena.some((c) => r.desde < c.desde && r.hasta >= sumarDias(c.desde, -1))) { cadena.push(r); cambio = true }
      }
      return t.fecha_ingreso >= cadena.reduce((a, c) => menor(a, c.desde), '9999-12-31') ? vig[0].categoria : 'general'
    })
    const sueldoEn = memo((tid, f) => {
      let s = null
      for (const r of rems(trab(tid))) if (r.desde <= f) s = r.sueldo
      return s
    })
    // R-06: sueldo de un tramo del mes ponderado por los días de cada sueldo (base 30)
    const sueldoMes = memo((tid, desde, hasta) => {
      const rs = rems(trab(tid)); let suma = 0, dias = 0
      rs.forEach((r, i) => {
        const sig = rs[i + 1]?.desde
        if (!(r.desde <= hasta && (!sig || sig > desde))) return
        const fin = menor(sig ? sumarDias(sig, -1) : hasta, hasta), ini = mayor(r.desde, desde)
        const d = fin === finMes(desde) ? 30 - Number(ini.slice(8)) + 1 : diasEntre(ini, fin) + 1
        if (d > 0) { suma += r.sueldo * d; dias += d }
      })
      return dias ? suma / dias : null
    })
    const vacacionesDiasEn = memo((tid, f) => trab(tid).jornada_horas >= legal('jornada_minima_horas', f) ? REG[regimenEn(tid, f)].vacaciones_dias : 0)
    const asigFamiliarEn = memo((tid, f) => trab(tid).asignacion_familiar ? r2(legal('asignacion_familiar', f) * legal('rmv', f)) : 0)
    // conceptos fijos del mes: computables (R-16) o afectos a quinta (R-14)
    const fijosEn = memo((tid, f, computables) => {
      const m = inicioMes(f)
      return (trab(tid).fijos || []).filter(vivo)
        .filter((x) => x.desde <= m && (!x.hasta || x.hasta >= m) && (computables ? C[x.concepto].computable : C[x.concepto].afecto_quinta))
        .reduce((a, x) => a + x.monto, 0)
    })
    // R-05: días de ausencia por efecto
    const ausenciasEn = memo((tid, desde, hasta) => {
      const r = { dias: 0, no_sueldo: 0, no_pagados: 0, vacaciones: 0, subsidiados: 0, no_cts: 0, no_grati: 0, no_vacaciones: 0, descanso_medico: 0, reducen_descanso: 0 }
      for (const a of AUS.get(tid) || []) {
        if (!(a.desde <= hasta && a.hasta >= desde)) continue
        const ta = TA[a.tipo], d = diasTramo(mayor(a.desde, desde), menor(a.hasta, hasta))
        r.dias += d
        if (ta.concepto_pago !== 'SUELDO') r.no_sueldo += d
        if (ta.concepto_pago == null) r.no_pagados += d
        if (ta.es_vacaciones) r.vacaciones += d
        if (ta.concepto_pago != null && !C[ta.concepto_pago].afecto_essalud) r.subsidiados += d
        if (!ta.computable_cts) r.no_cts += d
        if (!ta.computable_grati) r.no_grati += d
        if (!ta.computable_vacaciones) r.no_vacaciones += d
        if (ta.es_descanso_medico) r.descanso_medico += d
        if (ta.reduce_descanso_semanal) r.reducen_descanso += d
      }
      return r
    })

    // ---------------- Cada trabajador y mes (R-04…R-10)
    const plMes = memo((tid, periodo) => {
      const t = trab(tid), e = E.get(t.empleador_id)
      if (!e || periodo < mayor(inicioMes(t.fecha_ingreso), e.inicio_planilla)) return null
      if (t.fecha_cese && periodo > inicioMes(t.fecha_cese)) return null
      const desde = mayor(t.fecha_ingreso, periodo), hasta = menor(t.fecha_cese || finMes(periodo), finMes(periodo))
      const dv = diasTramo(desde, hasta), au = ausenciasEn(tid, desde, hasta), lapso = diasEntre(desde, hasta) + 1
      return {
        trabajador_id: tid, empleador_id: t.empleador_id, periodo, desde, hasta, dias_vinculo: dv,
        dias_ausencia: Math.min(dv, au.dias),
        dias_sueldo: au.no_sueldo >= lapso ? 0 : Math.max(0, dv - au.no_sueldo),
        dias_no_pagados: au.no_pagados >= lapso ? dv : Math.min(dv, au.no_pagados),
        dias_vacaciones: Math.min(dv, au.vacaciones), dias_subsidiados: Math.min(dv, au.subsidiados),
        dias_no_cts: Math.min(dv, au.no_cts), dias_no_vacaciones: Math.min(dv, au.no_vacaciones),
        dias_descanso_medico: au.descanso_medico, dias_reducen_descanso: au.reducen_descanso,
        regimen: regimenEn(tid, hasta), sueldo_basico: sueldoEn(tid, hasta), asig_familiar: asigFamiliarEn(tid, hasta),
        rmv: legal('rmv', hasta), mes_cese: !!t.fecha_cese && periodo === inicioMes(t.fecha_cese),
      }
    })
    // R-08, R-09, R-10: horas extra, feriados trabajados y tardanzas del mes
    const asistenciaMes = memo((tid, periodo) => {
      const filas = (ASI.get(tid) || []).filter((a) => inicioMes(a.fecha) === periodo)
      if (!filas.length) return null
      const t = trab(tid), fin = finMes(periodo)
      const h25 = filas.reduce((s, a) => s + Math.min(2, a.horas_extra || 0), 0)
      const h35 = filas.reduce((s, a) => s + Math.max(0, (a.horas_extra || 0) - 2), 0)
      const dias_feriado = filas.filter((a) => a.feriado_trabajado).length
      const minutos_tardanza = filas.reduce((s, a) => s + (a.minutos_tardanza || 0), 0)
      const sueldo = sueldoEn(tid, fin)
      const vd = sueldo == null ? null : (sueldo + asigFamiliarEn(tid, fin)) / 30, j = t.jornada_horas
      const m = (f) => (vd == null ? null : r2(f()))
      return { h25, h35, dias_feriado, minutos_tardanza,
        monto_he25: m(() => vd / j * 1.25 * h25), monto_he35: m(() => vd / j * 1.35 * h35),
        monto_feriado: m(() => vd * 2 * dias_feriado), monto_tardanza: m(() => vd / j * minutos_tardanza / 60) }
    })
    // montos variables computables de un mes (para el promedio de R-16)
    const variableMes = memo((tid, periodo) => {
      const v = {}
      const a = asistenciaMes(tid, periodo)
      if (a) for (const [k, monto] of [['HE25', a.monto_he25], ['HE35', a.monto_he35], ['FERIADO', a.monto_feriado]]) v[k] = (v[k] || 0) + (monto || 0)
      for (const mv of MOV.get(tid) || []) if (mv.periodo === periodo) v[mv.concepto] = (v[mv.concepto] || 0) + mv.monto
      return Object.entries(v).filter(([k, monto]) => C[k] && C[k].computable && C[k].variable && monto > 0)
    })
    // promedio de los variables cobrados en al menos 3 de los 6 meses que terminan en el mes dado
    const promedioVariable = memo((tid, mes) => {
      const fin = inicioMes(mes), por = {}
      for (let m = sumarMeses(fin, -5); m <= fin; m = sumarMeses(m, 1)) {
        for (const [k, monto] of variableMes(tid, m)) { por[k] = por[k] || { s: 0, n: 0 }; por[k].s += monto; por[k].n++ }
      }
      return Object.values(por).filter((x) => x.n >= 3).reduce((a, x) => a + x.s, 0) / 6
    })
    // R-16: remuneración computable
    const rc = memo((tid, fecha, ventana) =>
      r2((sueldoEn(tid, fecha) || 0) + asigFamiliarEn(tid, fecha) + fijosEn(tid, fecha, true) + promedioVariable(tid, ventana)))

    // ---------------- Gratificación (R-17)
    const gratiCalculo = memo((tid, sem, al, fechaRc, ventana) => {
      const t = trab(tid)
      if (al < t.fecha_ingreso) return null
      const desde = mayor(t.fecha_ingreso, sem)
      const desdeCompleto = desde === inicioMes(desde) ? desde : sumarMeses(inicioMes(desde), 1)
      const meses = mesesCompletos(desde, al)
      const nc = ausenciasEn(tid, desdeCompleto, al === finMes(al) ? al : sumarDias(inicioMes(al), -1)).no_grati
      const regimen = regimenEn(tid, al), rd = REG[regimen], comp = rc(tid, fechaRc, ventana)
      const monto = meses >= 1 ? Math.max(0, r2(comp * rd.grati_factor * meses / 6 - comp * rd.grati_factor / 180 * nc)) : 0
      const bonificacion = r2(monto * (t.salud === 'eps' ? legal('bonificacion_eps', al) : legal('bonificacion_essalud', al)))
      return { desde, meses, dias_no_computables: nc, regimen, factor: rd.grati_factor, computable: comp, monto, bonificacion }
    })
    const gratiSemestreTipo = memo((tid, sem) => {
      const t = trab(tid), semFin = sumarDias(sumarMeses(sem, 6), -1)
      if (semFin < t.fecha_ingreso || (t.fecha_cese && t.fecha_cese < sem)) return null
      const derecho = mesDe(sem) === 1 ? sumarMeses(sem, 6) : sumarDias(sumarMeses(sem, 5), 14)   // 1 jul / 15 dic
      if (!t.fecha_cese || t.fecha_cese >= derecho) {
        const pm = inicioMes(derecho)
        return { tipo: 'regular', pago_mes: pm, hasta: semFin, fecha_rc: pm, ventana: sumarMeses(pm, -1) }
      }
      const pm = inicioMes(t.fecha_cese)
      return { tipo: 'trunca', pago_mes: pm, hasta: t.fecha_cese, fecha_rc: t.fecha_cese, ventana: sumarMeses(pm, -1) }
    })
    const gratiSemestre = memo((tid, sem) => {
      const g = gratiSemestreTipo(tid, sem); if (!g) return null
      const c = gratiCalculo(tid, sem, g.hasta, g.fecha_rc, g.ventana); if (!c) return null
      return { trabajador_id: tid, sem_inicio: sem, sem_fin: sumarDias(sumarMeses(sem, 6), -1), ...g, ...c }
    })

    // ---------------- CTS (R-18)
    const ctsCalculo = memo((tid, sem, al, ventana) => {
      const t = trab(tid)
      const desde = t.fecha_ingreso < sem && t.fecha_ingreso > sumarMeses(sem, -1) ? t.fecha_ingreso : mayor(t.fecha_ingreso, sem)
      if (al < desde) return null
      const nc = ausenciasEn(tid, desde, al).no_cts
      const dias = Math.max(0, diasLaborales(desde, al) - nc)
      const elegible = sumarMeses(t.fecha_ingreso, 1) <= sumarDias(al, 1) && t.jornada_horas >= legal('jornada_minima_horas', al)
      const regimen = regimenEn(tid, al), rd = REG[regimen], comp = rc(tid, al, ventana)
      const g = gratiSemestre(tid, sumarMeses(sem, -4))     // nov–abr: la de diciembre; may–oct: la de julio
      const sexto = r2((g && g.tipo === 'regular' && g.pago_mes >= sem && g.pago_mes <= al ? g.monto : 0) / 6)
      let dias_ganados = 0
      if (elegible) {
        dias_ganados = rd.cts_dias_anio * dias / 360
        if (rd.cts_tope_dias != null) dias_ganados = Math.min(dias_ganados, Math.max(0, rd.cts_tope_dias - rd.cts_dias_anio * diasLaborales(t.fecha_ingreso, sumarDias(desde, -1)) / 360))
      }
      return { desde, dias, dias_no_computables: nc, elegible, regimen, computable: comp, sexto, dias_ganados,
        monto: r2((comp + sexto) * dias_ganados / 30) }
    })
    const ctsSemestreTipo = memo((tid, sem) => {
      const t = trab(tid), semFin = sumarDias(sumarMeses(sem, 6), -1)
      if (semFin < t.fecha_ingreso || (t.fecha_cese && t.fecha_cese < sem)) return null
      if (t.fecha_cese && t.fecha_cese >= sem && t.fecha_cese <= semFin) {
        const pm = inicioMes(t.fecha_cese)
        return { tipo: 'trunca', deposito_mes: pm, hasta: t.fecha_cese, ventana: sumarMeses(pm, -1) }
      }
      return { tipo: 'deposito', deposito_mes: sumarMeses(sem, 6), hasta: semFin, ventana: sumarMeses(sem, 5) }
    })
    const ctsSemestre = memo((tid, sem) => {
      const s = ctsSemestreTipo(tid, sem); if (!s) return null
      const c = ctsCalculo(tid, sem, s.hasta, s.ventana); if (!c) return null
      return { trabajador_id: tid, sem_inicio: sem, sem_fin: sumarDias(sumarMeses(sem, 6), -1), ...s, ...c,
        meses: Math.floor(c.dias / 30), dias_resto: c.dias % 30 }
    })

    // ---------------- Vacaciones (R-20)
    const vacacionesConsumidas = memo((tid, corte) => {
      const t = trab(tid), s = t.saldo_vacaciones
      let base = 0
      if (s) {
        const n = edad(sumarDias(s.al, 1), t.fecha_ingreso).y
        for (let k = 1; k <= n; k++) base += vacacionesDiasEn(tid, sumarDias(sumarAnios(t.fecha_ingreso, k), -1))
        base -= s.dias
      }
      let goce = 0
      for (const a of AUS.get(tid) || []) {
        if (!TA[a.tipo].es_vacaciones || a.desde > corte || (s && !(a.desde > s.al))) continue
        goce += diasEntre(a.desde, menor(a.hasta, corte)) + 1
      }
      return base + goce
    })
    const vacacionPeriodos = memo((tid, corte) => {
      const t = trab(tid), consumido = vacacionesConsumidas(tid, corte), n = edad(sumarDias(corte, 1), t.fecha_ingreso).y
      const lista = []; let acumulado = 0
      for (let k = 1; k <= n; k++) {
        const fin = sumarDias(sumarAnios(t.fecha_ingreso, k), -1), ganados = vacacionesDiasEn(tid, fin)
        acumulado += ganados
        const gozados = Math.min(ganados, Math.max(0, consumido - (acumulado - ganados))), pendientes = ganados - gozados
        const vence = sumarDias(sumarAnios(t.fecha_ingreso, k + 1), -1)
        lista.push({ periodo: k, inicio: sumarAnios(t.fecha_ingreso, k - 1), fin, vence, ganados, gozados, pendientes, vencido: pendientes > 0 && vence < corte })
      }
      return lista
    })
    const vacaciones = memo((tid, corteDado) => {
      const t = trab(tid), corte = corteDado || t.fecha_cese || hoy
      const consumido = vacacionesConsumidas(tid, corte), ps = vacacionPeriodos(tid, corte)
      const anios = edad(sumarDias(corte, 1), t.fecha_ingreso).y
      const dias_trunca = sumarMeses(t.fecha_ingreso, 1) <= sumarDias(corte, 1)
        ? r2(vacacionesDiasEn(tid, corte) * diasLaborales(sumarAnios(t.fecha_ingreso, anios), corte) / 360) : 0
      const computable = rc(tid, corte, sumarMeses(inicioMes(corte), -1))
      const ganados = ps.reduce((a, p) => a + p.ganados, 0), pendientes = ps.reduce((a, p) => a + p.pendientes, 0)
      const vencidos = ps.filter((p) => p.vencido).reduce((a, p) => a + p.pendientes, 0)
      const adelantados = Math.max(0, consumido - ganados)
      return { trabajador_id: tid, corte, dias_gozados: consumido, dias_ganados: ganados, dias_pendientes: pendientes,
        dias_vencidos: vencidos, dias_adelantados: adelantados, dias_trunca, computable,
        monto_pendientes: r2(computable * pendientes / 30),
        monto_truncas: r2(computable * Math.max(0, dias_trunca - adelantados) / 30),
        monto_indemnizacion: r2(computable * vencidos / 30), periodos: ps }
    })

    // ---------------- Líneas del mes (R-06…R-11, R-17)
    const lineasMes = memo((tid, periodo) => {
      const m = plMes(tid, periodo); if (!m) return []
      const t = trab(tid), e = E.get(t.empleador_id), L = []
      const add = (concepto, cantidad, monto) => { if (monto != null && monto > 0) L.push({ concepto, cantidad, monto }) }
      const s = sueldoMes(tid, m.desde, m.hasta)
      add('SUELDO', m.dias_sueldo, s == null ? null : r2(s * m.dias_sueldo / 30))
      if (m.dias_vinculo > 0) add('ASIG_FAMILIAR', null, m.asig_familiar)
      const otros = {}
      for (const a of AUS.get(tid) || []) {
        const ta = TA[a.tipo]
        if (!(a.desde <= m.hasta && a.hasta >= m.desde) || !ta.concepto_pago || ta.concepto_pago === 'SUELDO') continue
        const o = otros[ta.concepto_pago] = otros[ta.concepto_pago] || { d: 0, vac: false }
        o.d += diasTramo(mayor(a.desde, m.desde), menor(a.hasta, m.hasta)); o.vac = o.vac || ta.es_vacaciones
      }
      for (const [k, o] of Object.entries(otros)) {
        // vacaciones: básico + variables regulares; subsidios: básico (la asignación familiar ya va completa)
        const b = m.sueldo_basico == null ? null : o.vac ? m.sueldo_basico + promedioVariable(tid, sumarMeses(periodo, -1)) : m.sueldo_basico
        add(k, o.d, b == null ? null : r2(o.d * b / 30))
      }
      const a = asistenciaMes(tid, periodo)
      if (a) {
        add('HE25', a.h25, a.monto_he25); add('HE35', a.h35, a.monto_he35)
        add('FERIADO', a.dias_feriado, a.monto_feriado); add('TARDANZA', a.minutos_tardanza, a.monto_tardanza)
      }
      if (e.descuento_dominical && m.dias_reducen_descanso > 0 && m.sueldo_basico != null) {
        add('DOMINICAL', m.dias_reducen_descanso, r2((m.sueldo_basico + m.asig_familiar) / 30 * m.dias_reducen_descanso / (e.dias_laborables_semana || 6)))
      }
      for (const f of (t.fijos || []).filter(vivo)) {
        if (f.desde <= periodo && (!f.hasta || f.hasta >= periodo)) add(f.concepto, null, r2(f.monto * (m.dias_vinculo - m.dias_no_pagados) / 30))
      }
      const mv = {}
      for (const x of MOV.get(tid) || []) if (x.periodo === periodo && !C[x.concepto].liquidacion) mv[x.concepto] = (mv[x.concepto] || 0) + x.monto
      for (const [k, v] of Object.entries(mv)) add(k, null, r2(v))
      if (mesDe(periodo) === 7 || mesDe(periodo) === 12) {
        const g = gratiSemestre(tid, semestreGrati(sumarMeses(periodo, -1)))
        if (g && g.tipo === 'regular' && g.pago_mes === periodo) { add('GRATI', g.meses, g.monto); add('BONIF_EXTRA', g.meses, g.bonificacion) }
      }
      return L
    })
    const signo = (c, monto) => (C[c].tipo === 'ingreso' ? monto : -monto)
    // R-11, R-14: bases afectas y datos para la quinta
    const baseMes = memo((tid, periodo) => {
      const m = plMes(tid, periodo); if (!m) return null
      const t = trab(tid), b = { ingresos: 0, descuentos_registrados: 0, cubierto_provision: 0, base_essalud: 0, base_pension: 0, quinta_ordinaria: 0, quinta_extraordinaria: 0 }
      for (const l of lineasMes(tid, periodo)) {
        const c = C[l.concepto]
        if (c.tipo === 'ingreso') b.ingresos += l.monto
        if (c.tipo === 'descuento') b.descuentos_registrados += l.monto
        if (c.cubierto_provision) b.cubierto_provision += l.monto
        if (c.afecto_essalud) b.base_essalud += signo(l.concepto, l.monto)
        if (c.afecto_pension) b.base_pension += signo(l.concepto, l.monto)
        if (c.afecto_quinta && !c.quinta_extraordinaria) b.quinta_ordinaria += signo(l.concepto, l.monto)
        if (c.afecto_quinta && c.quinta_extraordinaria) b.quinta_extraordinaria += signo(l.concepto, l.monto)
      }
      for (const k of Object.keys(b)) b[k] = r2(b[k])
      const rd = REG[m.regimen], sb = m.sueldo_basico || 0
      return { ...m, ...b,
        quinta_tasa_mensual: sb + m.asig_familiar + fijosEn(tid, m.hasta, false),
        quinta_grati_proyectada: r2((sb + m.asig_familiar + fijosEn(tid, m.hasta, true)) * rd.grati_factor
          * (1 + (t.salud === 'eps' ? legal('bonificacion_eps', m.hasta) : legal('bonificacion_essalud', m.hasta)))) }
    })

    // ---------------- Quinta categoría (R-14)
    const quintaPrevia = memo((tid, anio) => {
      const qs = (trab(tid).quinta_previa || []).filter(vivo).filter((q) => q.anio === anio)
      return { renta: qs.reduce((a, q) => a + q.renta, 0), ret: qs.reduce((a, q) => a + q.retencion, 0) }
    })
    function quintaCalculo(mes, proyeccion, extra, fecha, retenido, previaRet, cese) {
      const deduccion = legal('quinta_deduccion_uit', fecha) * legal('uit', fecha)
      const w = (k) => previaRet + retenido.slice(0, k).reduce((a, x) => a + x, 0)
      const imp = impuestoQuinta(proyeccion - deduccion, fecha), impExtra = impuestoQuinta(proyeccion + extra - deduccion, fecha)
      let retencion
      if (cese) retencion = 0                                         // R-23: se regulariza en la liquidación
      else if (mes === 12) retencion = r2(impExtra - w(11))           // puede ser devolución
      else retencion = r2(Math.max(0, r2(mes <= 3 ? imp / 12 : (imp - w(mes - 1)) / (13 - mes))) + Math.max(0, impExtra - imp))
      return { impuesto_anual: mes === 12 ? impExtra : imp, retencion }
    }
    const quintaMes = memo((tid, periodo) => {
      const b = baseMes(tid, periodo); if (!b) return null
      const t = trab(tid), anio = anioDe(periodo), mes = mesDe(periodo)
      const ant = mes > 1 ? sumarMeses(periodo, -1) : null
      const previo = ant && baseMes(tid, ant) ? quintaMes(tid, ant) : null
      const qp = quintaPrevia(tid, anio)
      const acumuladoAntes = previo ? previo.acumulado : qp.renta
      const retenidoAntes = previo ? previo.retenido : new Array(12).fill(0)
      const proyeccion = acumuladoAntes + b.quinta_ordinaria + b.quinta_tasa_mensual * (12 - mes)
        + b.quinta_grati_proyectada * ((mes < 7 ? 1 : 0) + (mes < 12 ? 1 : 0))
      const c = quintaCalculo(mes, proyeccion, b.quinta_extraordinaria, b.hasta, retenidoAntes, qp.ret, b.mes_cese)
      const emitida = emitidas.get(tid + '|' + periodo)
      const ret = emitida ? emitida.retencion_quinta
        : t.domiciliado === false ? r2(legal('quinta_no_domiciliado', b.hasta) * (b.quinta_ordinaria + b.quinta_extraordinaria)) : c.retencion
      const retenido = retenidoAntes.slice(); retenido[mes - 1] = ret
      return { proyeccion, impuesto_anual: c.impuesto_anual, retencion: ret, retencion_calculada: c.retencion,
        acumulado: acumuladoAntes + b.quinta_ordinaria + b.quinta_extraordinaria, retenido }
    })

    // ---------------- Boleta del mes (R-12…R-15)
    const conNombre = (l) => ({ ...l, nombre: C[l.concepto].nombre, tipo: C[l.concepto].tipo, plame: C[l.concepto].plame, orden: C[l.concepto].orden })
    const lineasPension = (t, base, fecha, periodo, basePrevia) => {
      const L = []
      if (t.sistema_pension === 'onp') L.push({ concepto: 'ONP', monto: r2(base * legal('onp', fecha)) })
      if (t.sistema_pension === 'afp') {
        const ta = tasaAfpEn(t.afp, periodo)
        if (ta) {
          const sinPrima = t.fecha_nacimiento && edad(fecha, t.fecha_nacimiento).y >= legal('prima_edad_maxima', fecha)
          const prima = basePrevia == null ? Math.min(base, ta.remuneracion_maxima)
            : Math.max(0, Math.min(basePrevia + base, ta.remuneracion_maxima) - Math.min(basePrevia, ta.remuneracion_maxima))
          L.push({ concepto: 'AFP_APORTE', monto: r2(base * ta.aporte) },
            { concepto: 'AFP_PRIMA', monto: sinPrima ? 0 : r2(prima * ta.prima) },
            { concepto: 'AFP_COMISION', monto: r2(base * (t.comision_afp === 'flujo' ? ta.comision_flujo : ta.comision_mixta)) })
        }
      }
      return L
    }
    const boletaLineas = memo((tid, periodo) => {
      const b = baseMes(tid, periodo); if (!b) return []
      const t = trab(tid), L = lineasMes(tid, periodo).slice()
      L.push(...lineasPension(t, b.base_pension, b.hasta, periodo))
      const q = quintaMes(tid, periodo)
      L.push({ concepto: q.retencion < 0 ? 'DEVOL_QUINTA' : 'QUINTA', monto: Math.abs(q.retencion) })
      if ((t.salud === 'essalud' || t.salud === 'eps') && b.dias_vinculo > b.dias_subsidiados) {
        L.push({ concepto: 'ESSALUD', monto: r2(legal('essalud', b.hasta) * Math.max(b.base_essalud, b.rmv)) })   // D-06
      }
      return L.filter((l) => l.monto > 0).map(conNombre).sort((a, b2) => a.orden - b2.orden)
    })

    // ---------------- Provisiones por devengado (R-19)
    const gratiDevengado = memo((tid, sem, mes) => {
      const cero = { monto: 0, bonificacion: 0 }
      if (mes < sem) return cero
      const g = gratiSemestreTipo(tid, sem)
      if (!g || !(g.pago_mes <= mes || mes <= sumarMeses(sem, 5))) return cero
      const t = trab(tid), pagado = g.pago_mes <= mes
      const x = gratiCalculo(tid, sem, pagado ? g.hasta : menor(finMes(mes), t.fecha_cese || finMes(mes)),
        pagado ? g.fecha_rc : finMes(mes), pagado ? g.ventana : mes)
      return x ? { monto: x.monto, bonificacion: x.bonificacion } : cero
    })
    const ctsDevengado = memo((tid, sem, mes) => {
      if (mes < sem) return 0
      const s = ctsSemestreTipo(tid, sem)
      if (!s || !(s.deposito_mes <= mes || mes <= sumarMeses(sem, 5))) return 0
      const t = trab(tid), pagado = s.deposito_mes <= mes
      const x = ctsCalculo(tid, sem, pagado ? s.hasta : menor(finMes(mes), t.fecha_cese || finMes(mes)), pagado ? s.ventana : mes)
      return x ? x.monto : 0
    })
    const provisionMes = memo((tid, periodo) => {
      const m = plMes(tid, periodo); if (!m) return null
      const ant = sumarMeses(periodo, -1), ga = semestreGrati(periodo), gp = sumarMeses(ga, -6), ca = semestreCts(periodo), cp = sumarMeses(ca, -6)
      const gc = gratiDevengado(tid, ga, periodo), gc1 = gratiDevengado(tid, ga, ant), gq = gratiDevengado(tid, gp, periodo), gq1 = gratiDevengado(tid, gp, ant)
      return {
        trabajador_id: tid, periodo,
        gratificacion: r2(gc.monto - gc1.monto + gq.monto - gq1.monto),
        bonificacion: r2(gc.bonificacion - gc1.bonificacion + gq.bonificacion - gq1.bonificacion),
        cts: r2(ctsDevengado(tid, ca, periodo) - ctsDevengado(tid, ca, ant) + ctsDevengado(tid, cp, periodo) - ctsDevengado(tid, cp, ant)),
        vacaciones: r2(rc(tid, m.hasta, periodo) * vacacionesDiasEn(tid, m.hasta) * Math.max(0, m.dias_vinculo - m.dias_no_vacaciones) / 10800),
      }
    })

    // ---------------- Planilla del mes por trabajador (R-15)
    const filaPlanilla = memo((tid, periodo) => {
      const b = baseMes(tid, periodo); if (!b) return null
      const t = trab(tid), L = boletaLineas(tid, periodo), p = provisionMes(tid, periodo), a = asistenciaMes(tid, periodo)
      const suma = (f) => r2(L.filter(f).reduce((s, l) => s + l.monto, 0))
      const ingresos = suma((l) => l.tipo === 'ingreso'), descuentos = suma((l) => l.tipo === 'descuento'), essalud = suma((l) => l.tipo === 'aporte')
      const ta = t.sistema_pension === 'afp' ? tasaAfpEn(t.afp, periodo) : null
      const emitida = emitidas.get(tid + '|' + periodo)
      return {
        trabajador_id: tid, empleador_id: t.empleador_id, periodo, apellidos_nombres: t.apellidos_nombres, tipo_documento: t.tipo_documento,
        numero_documento: t.numero_documento, codigo_externo: t.codigo_externo, cargo: t.cargo, fecha_ingreso: t.fecha_ingreso, fecha_cese: t.fecha_cese,
        regimen: b.regimen, sistema_pension: t.sistema_pension, afp: t.afp ? (DATOS.afps.find((x) => x.codigo === t.afp) || {}).nombre : null,
        comision_afp: t.comision_afp, cuspp: t.cuspp, salud: t.salud, sueldo_basico: b.sueldo_basico,
        dias_vinculo: b.dias_vinculo, dias_sueldo: b.dias_sueldo, dias_no_pagados: b.dias_no_pagados, dias_vacaciones: b.dias_vacaciones,
        dias_subsidiados: b.dias_subsidiados, horas_extra: a ? a.h25 + a.h35 : 0, dias_feriado: a ? a.dias_feriado : 0,
        ingresos, descuentos, neto: r2(ingresos - descuentos), essalud,
        quinta: suma((l) => l.concepto === 'QUINTA'),
        pension: suma((l) => ['ONP', 'AFP_APORTE', 'AFP_PRIMA', 'AFP_COMISION'].includes(l.concepto)),
        provision_gratificacion: p.gratificacion, provision_bonificacion: p.bonificacion, provision_cts: p.cts, provision_vacaciones: p.vacaciones,
        costo_empresa: r2(ingresos - b.cubierto_provision + essalud + p.gratificacion + p.bonificacion + p.cts + p.vacaciones),
        tasas_provisionales: t.sistema_pension === 'afp' && !(ta && ta.periodo === periodo),
        cerrada: cerradas.has(t.empleador_id + '|' + periodo), emitida: !!emitida, neto_emitido: emitida ? emitida.neto : null,
        entregada_en: emitida ? emitida.entregada_en || null : null,
      }
    })

    // ---------------- Liquidación (R-21…R-23)
    const liquidacion = memo((tid) => {
      const t = trab(tid), e = E.get(t.empleador_id)
      if (!t.fecha_cese || !e || t.fecha_cese < e.inicio_planilla) return null
      const cese = t.fecha_cese, regimen = regimenEn(tid, cese), rd = REG[regimen], mc = MC[t.motivo_cese] || { indemniza: false, nombre: t.motivo_cese }
      const computable = rc(tid, cese, sumarMeses(inicioMes(cese), -1))
      const ctT = ctsSemestre(tid, semestreCts(cese)), ct = ctT && ctT.tipo === 'trunca' ? ctT : null
      const cpS = ctsSemestre(tid, sumarMeses(semestreCts(cese), -6))
      const cp = cpS && cpS.tipo === 'deposito' && cese < sumarDias(cpS.deposito_mes, 14) ? cpS : null
      const gS = gratiSemestre(tid, semestreGrati(cese)), g = gS && gS.tipo === 'trunca' ? gS : null
      const v = vacaciones(tid, cese)
      const sv = edad(sumarDias(cese, 1), t.fecha_ingreso), mesesServicio = sv.y * 12 + sv.m
      let indem = 0
      if (mc.indemniza && cese >= sumarMeses(t.fecha_ingreso, t.periodo_prueba_meses ?? 3) && t.jornada_horas >= legal('jornada_minima_horas', cese)) {
        if (rd.indem_dias_anio != null) indem = r2(computable * Math.min(rd.indem_tope_dias, rd.indem_dias_anio * mesesServicio / 12) / 30)
        else if (t.fecha_fin_contrato && t.fecha_fin_contrato > cese)
          indem = r2(Math.min(rd.indem_tope_sueldos * computable, rd.indem_sueldos_anio * computable * diasLaborales(sumarDias(cese, 1), t.fecha_fin_contrato) / 30))
        else indem = r2(Math.min(rd.indem_tope_sueldos * computable, rd.indem_sueldos_anio * computable * (sv.y + sv.m / 12 + sv.d / 360)))
      }
      const ing = [
        ['CTS_PENDIENTE', cp && cp.dias, cp && cp.monto], ['CTS', ct && ct.dias, ct && ct.monto],
        ['GRATI_TRUNCA', g && g.meses, g && g.monto], ['BONIF_TRUNCA', null, g && g.bonificacion],
        ['VAC_PENDIENTE', v.dias_pendientes, v.monto_pendientes],
        ['VAC_TRUNCA', Math.max(0, v.dias_trunca - v.dias_adelantados), v.monto_truncas],
        ['INDEM_VACACIONAL', v.dias_vencidos, v.monto_indemnizacion], ['INDEM_DESPIDO', null, indem],
      ].map(([concepto, cantidad, monto]) => ({ concepto, cantidad, monto }))
      const mv = {}
      for (const x of MOV.get(tid) || []) if (C[x.concepto].liquidacion && x.periodo >= inicioMes(cese)) mv[x.concepto] = (mv[x.concepto] || 0) + x.monto
      for (const [k, m] of Object.entries(mv)) ing.push({ concepto: k, cantidad: null, monto: r2(m) })
      const validas = ing.filter((l) => l.monto != null)
      const base = (flag) => validas.filter((l) => C[l.concepto][flag]).reduce((a, l) => a + signo(l.concepto, l.monto), 0)
      const bp = base('afecto_pension'), be = base('afecto_essalud'), bq = base('afecto_quinta')
      // R-23: quinta sobre lo percibido en el año, sin proyección
      let diferencia
      if (t.domiciliado === false) diferencia = legal('quinta_no_domiciliado', cese) * bq
      else {
        const qp = quintaPrevia(tid, anioDe(cese)); let renta = 0, ret = 0
        for (let m = `${anioDe(cese)}-01-01`; m <= inicioMes(cese); m = sumarMeses(m, 1)) {
          const b = baseMes(tid, m); if (!b) continue
          renta += b.quinta_ordinaria + b.quinta_extraordinaria; ret += quintaMes(tid, m).retencion
        }
        diferencia = impuestoQuinta(qp.renta + renta + bq - legal('quinta_deduccion_uit', cese) * legal('uit', cese), cese) - qp.ret - ret
      }
      const pm = baseMes(tid, inicioMes(cese))
      const L = validas.concat(lineasPension(t, bp, cese, cese, pm ? pm.base_pension : 0))
      L.push({ concepto: diferencia < 0 ? 'DEVOL_QUINTA' : 'QUINTA', monto: r2(Math.abs(diferencia)) })
      if (t.salud === 'essalud' || t.salud === 'eps') L.push({ concepto: 'ESSALUD', monto: r2(legal('essalud', cese) * be) })
      const lineas = L.filter((l) => l.monto > 0).map(conNombre).sort((a, b) => a.orden - b.orden)
      const suma = (tipo) => r2(lineas.filter((l) => l.tipo === tipo).reduce((a, l) => a + l.monto, 0))
      return {
        trabajador_id: tid, empleador_id: t.empleador_id, apellidos_nombres: t.apellidos_nombres, tipo_documento: t.tipo_documento,
        numero_documento: t.numero_documento, cargo: t.cargo, fecha_ingreso: t.fecha_ingreso, fecha_cese: cese, motivo_cese: mc.nombre,
        regimen, servicio_anios: sv.y, servicio_meses: sv.m, servicio_dias: sv.d, computable,
        ingresos: suma('ingreso'), descuentos: suma('descuento'), neto: r2(suma('ingreso') - suma('descuento')), essalud: suma('aporte'),
        fecha_limite_pago: sumarDias(cese, 2), lineas,
      }
    })

    // ---------------- Observaciones (R-03, R-25)
    function observaciones(empleadorId, periodo) {
      const e = E.get(empleadorId), O = []
      if (!e) return O
      const o = (t, codigo, mensaje, bloquea) => O.push({ trabajador_id: t ? t.id : null, apellidos_nombres: t ? t.apellidos_nombres : null, codigo, mensaje, bloquea })
      const ts = trabajadoresDelMes(empleadorId, periodo)
      if (ts.length && !(e.remype || []).filter(vivo).length) o(null, 'SIN_REMYPE', 'El empleador no tiene REMYPE registrado: todos se calculan en régimen general salvo pacto.', false)
      for (const t of ts) {
        const m = plMes(t.id, periodo), f = filaPlanilla(t.id, periodo)
        if (t.sistema_pension === 'afp') {
          const ta = tasaAfpEn(t.afp, periodo)
          if (!ta || ta.periodo !== periodo) o(t, 'TASAS_AFP', ta ? `Tasas AFP provisionales: se usan las de ${ta.periodo.slice(5, 7)}/${ta.periodo.slice(0, 4)}. Registra las de la SBS del mes.` : 'No hay tasas AFP registradas: cárgalas en Parámetros.', true)
          if (!String(t.cuspp || '').trim()) o(t, 'SIN_CUSPP', 'Falta el CUSPP del afiliado AFP.', true)
        }
        if (m.sueldo_basico == null) o(t, 'SIN_SUELDO', 'No tiene sueldo básico registrado para el mes.', true)
        else if (m.sueldo_basico < m.rmv && t.jornada_horas >= legal('jornada_minima_horas', m.hasta)) o(t, 'SUELDO_MENOR_RMV', `El sueldo básico es menor a la RMV (S/ ${m.rmv.toFixed(2)}): revisa la jornada o el sueldo.`, false)
        if (f.neto < 0) o(t, 'NETO_NEGATIVO', 'El neto a pagar es negativo: revisa descuentos y adelantos.', true)
        if (f.neto_emitido != null && Math.abs(f.neto_emitido - f.neto) >= 0.01) o(t, 'BOLETA_DIFIERE', `La boleta emitida (S/ ${f.neto_emitido.toFixed(2)}) ya no coincide con el recálculo (S/ ${f.neto.toFixed(2)}).`, false)
        const dmAnio = ausenciasEn(t.id, `${anioDe(periodo)}-01-01`, m.hasta).descanso_medico
        if (dmAnio > legal('descanso_medico_dias', m.hasta) && m.dias_descanso_medico > 0) o(t, 'DESCANSO_MEDICO', `Descanso médico del año supera ${legal('descanso_medico_dias', m.hasta)} días: desde el día 21 registra subsidio de EsSalud.`, false)
        if (t.salud === 'sis') o(t, 'SIS', 'Afiliado al SIS: el aporte de salud no se calcula; regístralo aparte.', false)
        if (t.fecha_ingreso < e.inicio_planilla && !t.saldo_vacaciones) o(t, 'SALDO_VACACIONES', 'Ingresó antes de usar el sistema: registra su saldo inicial de vacaciones (cero si no tiene).', true)
        if (mayor(t.fecha_ingreso, e.inicio_planilla) > `${anioDe(periodo)}-01-01` && !(t.quinta_previa || []).filter(vivo).some((q) => q.anio === anioDe(periodo))) {
          const antes = t.fecha_ingreso < e.inicio_planilla
          o(t, 'QUINTA_PREVIA', antes ? `Faltan sus rentas y retenciones de quinta de ${anioDe(periodo)} anteriores al sistema (certificado o planillas previas).` : 'Ingresó en el año: registra sus rentas y retenciones de otros empleadores (cero si no tuvo).', antes)
        }
        const v = vacaciones(t.id)
        if (v.dias_vencidos > 0 && periodo === inicioMes(menor(v.corte, hoy))) o(t, 'VACACIONES_VENCIDAS', `${v.dias_vencidos} días de vacaciones vencidos sin gozar: generan indemnización vacacional.`, false)
      }
      return O
    }

    // ---------------- Listados por empleador
    const trabajadoresDe = (empleadorId) => [...T.values()].filter((t) => t.empleador_id === empleadorId)
      .sort((a, b) => a.apellidos_nombres.localeCompare(b.apellidos_nombres, 'es'))
    const trabajadoresDelMes = (empleadorId, periodo) => trabajadoresDe(empleadorId).filter((t) => plMes(t.id, periodo))
    function planilla(empleadorId, periodo) {
      const filas = trabajadoresDelMes(empleadorId, periodo).map((t) => filaPlanilla(t.id, periodo))
      const s = (k) => r2(filas.reduce((a, f) => a + f[k], 0))
      const obs = observaciones(empleadorId, periodo)
      return { filas, observaciones: obs, resumen: {
        trabajadores: filas.length, ingresos: s('ingresos'), descuentos: s('descuentos'), neto: s('neto'), essalud: s('essalud'),
        quinta: s('quinta'), pension: s('pension'), provision_gratificacion: r2(s('provision_gratificacion') + s('provision_bonificacion')),
        provision_cts: s('provision_cts'), provision_vacaciones: s('provision_vacaciones'), costo_empresa: s('costo_empresa'),
        tasas_provisionales: filas.some((f) => f.tasas_provisionales), cerrada: cerradas.has(empleadorId + '|' + periodo),
        observaciones_bloqueo: obs.filter((x) => x.bloquea).length } }
    }
    /** Boleta de un trabajador: la emitida (copia fiel) si el mes está cerrado; si no, el borrador calculado. */
    function boleta(tid, periodo) {
      const emitida = emitidas.get(tid + '|' + periodo)
      if (emitida) return { ...emitida.datos, emitida: true, entregada_en: emitida.entregada_en || null }
      const f = filaPlanilla(tid, periodo); if (!f) return null
      const e = E.get(trab(tid).empleador_id)
      return { empleador: { razon_social: e.razon_social, ruc: e.ruc, direccion: e.direccion }, periodo, cabecera: f,
        lineas: boletaLineas(tid, periodo), emitida: false }
    }
    /** R-24: cierre del mes. Devuelve el registro de cierre con las boletas emitidas (para guardarlo en el estado). */
    function cerrar(empleadorId, periodo, usuario) {
      if (cerradas.has(empleadorId + '|' + periodo)) throw new Error('La planilla de ese mes ya está cerrada')
      const p = planilla(empleadorId, periodo)
      const bloqueos = p.observaciones.filter((x) => x.bloquea)
      if (bloqueos.length) throw new Error('Resuelve antes de cerrar: ' + bloqueos.map((x) => (x.apellidos_nombres ? x.apellidos_nombres + ': ' : '') + x.mensaje).join(' · '))
      if (!p.filas.length) throw new Error('No hay trabajadores en el mes')
      return { empleador_id: empleadorId, periodo, cerrado_en: new Date().toISOString(), cerrado_por: usuario || null,
        boletas: p.filas.map((f) => ({ trabajador_id: f.trabajador_id, neto: f.neto, retencion_quinta: quintaMes(f.trabajador_id, periodo).retencion,
          datos: { ...boleta(f.trabajador_id, periodo), emitida: undefined } })) }
    }
    const gratificaciones = (empleadorId, sem) => trabajadoresDe(empleadorId).map((t) => gratiSemestre(t.id, sem)).filter(Boolean)
    const cts = (empleadorId, sem) => trabajadoresDe(empleadorId).map((t) => ctsSemestre(t.id, sem)).filter(Boolean)
    const provisiones = (empleadorId, periodo) => trabajadoresDelMes(empleadorId, periodo).map((t) => provisionMes(t.id, periodo))
    const vacacionesDe = (empleadorId) => trabajadoresDe(empleadorId).map((t) => vacaciones(t.id))
    const liquidaciones = (empleadorId) => trabajadoresDe(empleadorId).map((t) => liquidacion(t.id)).filter(Boolean)
      .sort((a, b) => (a.fecha_cese < b.fecha_cese ? 1 : -1))
    function tasasDelMes(periodo) {
      return DATOS.afps.map((a) => { const t = tasaAfpEn(a.codigo, periodo); return { ...a, ...(t || {}), exacta: !!t && t.periodo === periodo, periodo_tasa: t ? t.periodo : null } })
    }

    return {
      hoy, legal, impuestoQuinta, regimenEn, sueldoEn, remuneracionComputable: rc, plMes, lineasMes, baseMes, quintaMes,
      boletaLineas, provisionMes, filaPlanilla, planilla, observaciones, boleta, cerrar, gratiSemestre, ctsSemestre, vacaciones,
      liquidacion, gratificaciones, cts, provisiones, vacacionesDe, liquidaciones, trabajadoresDe, trabajadoresDelMes, tasasDelMes,
    }
  }

  return { crearMotor, DATOS, fechas, r2 }
})
