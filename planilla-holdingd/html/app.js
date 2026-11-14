/* Sistema de Planilla HoldingD · Interfaz (HTML + JavaScript, sin servidor).
 * Guarda los datos en este navegador (localStorage) y calcula todo con motor.js. Los datos se respaldan y se
 * mueven entre equipos con Exportar/Importar respaldo (JSON). Ningún monto se guarda: se recalcula siempre;
 * lo único que se congela es la boleta emitida al cerrar el mes (R-24). */
(function () {
  'use strict'
  const D = window.PLANILLA_DATOS, { crearMotor, fechas: F } = window.PlanillaMotor, IMP = window.PlanillaImportar
  const CLAVE = 'planilla-holdingd.estado.v1', CLAVE_UI = 'planilla-holdingd.ui.v1'
  const SBS = 'https://www.sbs.gob.pe/app/spp/empleadores/comisiones_spp/Paginas/comision_prima.aspx'
  const XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
  const $ = (s) => document.querySelector(s)

  // ---------------------------------------------------------------- Estado y persistencia
  const vacio = () => ({ sistema: 'Sistema de Planilla HoldingD', version: 1, empleadores: [], trabajadores: [], ausencias: [], asistencia: [],
    movimientos: [], cierres: [], parametros: { tasas_afp: [], legales: [] }, auditoria: [] })
  const completar = (e) => { const v = vacio(); for (const k in v) if (e[k] == null) e[k] = v[k]; e.parametros.tasas_afp ||= []; e.parametros.legales ||= []; return e }
  let estado = vacio(), ui = { tab: 'planilla', empleador: null, periodo: null, sub: 'grati', modal: null }, M, avisoGuardado = null
  try { const s = localStorage.getItem(CLAVE); if (s) estado = completar(JSON.parse(s)) } catch { avisoGuardado = 'Este navegador no permite guardar: exporta un respaldo antes de cerrar.' }
  // Versión entregada con datos (construir.js --datos): si este navegador aún no tiene empleadores, parte de esos datos
  if (!estado.empleadores.length && window.PLANILLA_ESTADO_INICIAL) estado = completar(JSON.parse(JSON.stringify(window.PLANILLA_ESTADO_INICIAL)))
  try { const u = JSON.parse(localStorage.getItem(CLAVE_UI) || '{}'); ui = { ...ui, ...u, modal: null } } catch { /* sin preferencias */ }
  const nuevoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2))
  function guardar(accion) {
    estado.auditoria.push({ en: new Date().toISOString(), accion })
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); avisoGuardado = null } catch { avisoGuardado = 'No se pudo guardar en este navegador: exporta un respaldo ahora.' }
    render()
  }
  const guardarUi = () => { try { localStorage.setItem(CLAVE_UI, JSON.stringify({ tab: ui.tab, empleador: ui.empleador, periodo: ui.periodo, sub: ui.sub })) } catch { /* opcional */ } }

  // ---------------------------------------------------------------- Formato
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const s2 = (n) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  const fecha = (f) => (f ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—')
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
  const mesLargo = (p) => (p ? `${MESES[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : '—')
  const pct = (x) => (x == null ? '' : String(Math.round(x * 1e6) / 1e4))
  const nombreRegimen = (r) => D.regimenes[r]?.nombre || r || '—'
  const nombrePension = (t) => (t.sistema_pension === 'afp' ? D.afps.find((a) => a.codigo === t.afp)?.nombre || 'AFP' : t.sistema_pension === 'onp' ? 'ONP' : 'Sin sistema')
  const TIPO = { regular: 'Regular', trunca: 'Trunca', deposito: 'Depósito' }
  const nombreConcepto = (c) => D.conceptos.find((x) => x.codigo === c)?.nombre || c
  const hoyISO = F.hoyISO()
  const opciones = (lista, actual, vacioTxt) => (vacioTxt != null ? `<option value="">${esc(vacioTxt)}</option>` : '')
    + lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(actual ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('')

  // ---------------------------------------------------------------- Contexto
  const vivo = (x) => x && !x.anulado
  const mx = (a, b) => (a > b ? a : b), mn = (a, b) => (a < b ? a : b)
  const empleadores = () => estado.empleadores.filter(vivo)
  const emp = () => empleadores().find((e) => String(e.id) === String(ui.empleador)) || empleadores()[0] || null
  const trabajadoresEmp = () => { const e = emp(); return e ? M.trabajadoresDe(e.id) : [] }
  const trab = (id) => estado.trabajadores.find((t) => t.id === id)
  const cierreDe = (empId, periodo) => estado.cierres.find((c) => vivo(c) && String(c.empleador_id) === String(empId) && c.periodo === periodo)
  // R-24: lo que cae en un mes cerrado no se registra ni se anula
  function exigirAbierto(empId, desde, hasta = desde) {
    for (let m = F.inicioMes(desde); m <= F.inicioMes(hasta); m = F.sumarMeses(m, 1)) {
      if (cierreDe(empId, m)) throw new Error(`R-24: la planilla de ${mesLargo(m)} está cerrada. Reábrela (administrador) para cambiarla.`)
    }
  }
  const empDeTrab = (tid) => trab(tid)?.empleador_id

  // ---------------------------------------------------------------- Mensajes
  function avisar(msg, tipo = 'ok') {
    const n = document.createElement('div'); n.className = 'toast ' + tipo; n.textContent = msg
    const z = $('#toasts'); z.appendChild(n); while (z.children.length > 3) z.firstChild.remove()
    setTimeout(() => n.remove(), tipo === 'error' ? 9000 : 3500)
  }

  // ---------------------------------------------------------------- Render principal
  const TABS = [['planilla', 'Planilla del mes'], ['novedades', 'Novedades'], ['trabajadores', 'Trabajadores'], ['beneficios', 'Beneficios'],
    ['liquidaciones', 'Liquidaciones'], ['parametros', 'Parámetros'], ['datos', 'Datos']]
  function render() {
    M = crearMotor(estado)
    const e = emp()
    if (e && String(ui.empleador) !== String(e.id)) ui.empleador = e.id
    if (!ui.periodo || (e && ui.periodo < e.inicio_planilla)) ui.periodo = e ? mx(F.inicioMes(hoyISO), e.inicio_planilla) : F.inicioMes(hoyISO)
    guardarUi()
    $('#selEmpleador').innerHTML = empleadores().length ? opciones(empleadores().map((x) => [x.id, `${x.razon_social} · ${x.ruc || 's/RUC'}`]), ui.empleador) : '<option>Sin empleador</option>'
    $('#selPeriodo').value = ui.periodo.slice(0, 7)
    $('#tabs').innerHTML = TABS.map(([k, t]) => `<button class="tab ${ui.tab === k ? 'activo' : ''}" data-accion="tab" data-tab="${k}">${t}</button>`).join('')
    $('#avisoGuardado').innerHTML = avisoGuardado ? `<div class="alerta mal">${esc(avisoGuardado)}</div>` : ''
    let html
    try { html = !e && !['datos', 'parametros'].includes(ui.tab) ? vistaInicio() : VISTAS[ui.tab]() }
    catch (err) { console.error(err); html = `<div class="alerta mal">Error al calcular: ${esc(err.message)}</div>` }
    $('#vista').innerHTML = html
    renderModal()
  }

  // ---------------------------------------------------------------- Vistas
  function vistaInicio() {
    return `<section class="tarjeta inicio"><h2>Bienvenido al Sistema de Planilla HoldingD</h2>
      <p>Para empezar, carga la planilla mensual en Excel (formato HoldingD) o un respaldo de datos. También puedes registrar un empleador a mano en <b>Parámetros</b>.</p>
      <div class="fila-botones"><button class="primario" data-accion="tab" data-tab="datos">Cargar Excel o respaldo</button>
      <button data-accion="nuevoEmpleador">Registrar empleador a mano</button></div></section>`
  }

  const tarjetaDato = (t, v, sub) => `<div class="dato"><div class="dato-t">${t}</div><div class="dato-v num">${v}</div>${sub ? `<div class="dato-s">${sub}</div>` : ''}</div>`
  function vistaPlanilla() {
    const e = emp(), p = M.planilla(e.id, ui.periodo), r = p.resumen, ci = cierreDe(e.id, ui.periodo)
    const obs = p.observaciones
    return `
    <section class="cabecera-vista"><h2>Planilla de ${mesLargo(ui.periodo)}</h2>
      <div class="fila-botones">
        ${ci ? `<span class="chip ok">Cerrada el ${fecha(ci.cerrado_en.slice(0, 10))} · boletas emitidas</span><button data-accion="reabrir">Reabrir</button>`
             : `<span class="chip">Abierta · borrador</span><button class="primario" data-accion="cerrar" ${r.observaciones_bloqueo ? 'disabled title="Resuelve las observaciones que bloquean"' : ''}>Cerrar planilla y emitir boletas</button>`}
        <button data-accion="imprimirBoletas" ${p.filas.length ? '' : 'disabled'}>Imprimir boletas</button>
        <button data-accion="csvPlanilla" ${p.filas.length ? '' : 'disabled'}>Exportar a Excel (CSV)</button>
      </div></section>
    <section class="datos">
      ${tarjetaDato('Trabajadores', r.trabajadores)}${tarjetaDato('Ingresos', s2(r.ingresos))}${tarjetaDato('Descuentos', s2(r.descuentos))}
      ${tarjetaDato('Neto a pagar', s2(r.neto))}${tarjetaDato('EsSalud', s2(r.essalud))}${tarjetaDato('Quinta categoría', s2(r.quinta))}
      ${tarjetaDato('ONP / AFP', s2(r.pension))}${tarjetaDato('Provisión gratificación', s2(r.provision_gratificacion), 'incluye bonificación 9%')}
      ${tarjetaDato('Provisión CTS', s2(r.provision_cts))}${tarjetaDato('Provisión vacaciones', s2(r.provision_vacaciones))}
      ${tarjetaDato('Costo empresa', s2(r.costo_empresa), 'ingresos no provisionados + EsSalud + provisiones')}
    </section>
    ${obs.length ? `<section class="tarjeta"><h3>Observaciones (${obs.length})</h3><ul class="obs">${obs.map((o) => `<li class="${o.bloquea ? 'bloquea' : ''}">
      ${o.bloquea ? '<b>Bloquea el cierre</b> · ' : ''}${o.apellidos_nombres ? `<b>${esc(o.apellidos_nombres)}</b>: ` : ''}${esc(o.mensaje)}
      ${o.codigo === 'TASAS_AFP' ? ' <button class="enlace" data-accion="tab" data-tab="parametros">Registrar tasas</button>' : ''}</li>`).join('')}</ul></section>` : ''}
    <section class="tarjeta tabla-env"><table class="tabla">
      <thead><tr><th>Trabajador</th><th>Régimen</th><th>Pensión</th><th class="n">Días</th><th class="n">Básico</th><th class="n">Ingresos</th>
        <th class="n">Descuentos</th><th class="n">Neto</th><th class="n">EsSalud</th><th class="n">Costo empresa</th><th></th></tr></thead>
      <tbody>${p.filas.map((f) => `<tr>
        <td><b>${esc(f.apellidos_nombres)}</b><div class="sub">${esc(f.tipo_documento)} ${esc(f.numero_documento)}${f.cargo ? ' · ' + esc(f.cargo) : ''}</div></td>
        <td>${nombreRegimen(f.regimen)}</td><td>${esc(f.afp || (f.sistema_pension === 'onp' ? 'ONP' : '—'))}${f.tasas_provisionales ? ' <span class="chip aviso">tasas prov.</span>' : ''}</td>
        <td class="n">${f.dias_sueldo}${f.dias_no_pagados ? `<div class="sub">${f.dias_no_pagados} sin pago</div>` : ''}</td><td class="n">${s2(f.sueldo_basico)}</td>
        <td class="n">${s2(f.ingresos)}</td><td class="n">${s2(f.descuentos)}</td><td class="n"><b>${s2(f.neto)}</b></td><td class="n">${s2(f.essalud)}</td>
        <td class="n">${s2(f.costo_empresa)}</td><td><button class="enlace" data-accion="verBoleta" data-id="${esc(f.trabajador_id)}">Boleta</button></td></tr>`).join('')
        || '<tr><td colspan="11" class="vacio">No hay trabajadores con vínculo en el mes.</td></tr>'}</tbody>
      ${p.filas.length ? `<tfoot><tr><td colspan="5">Total</td><td class="n">${s2(r.ingresos)}</td><td class="n">${s2(r.descuentos)}</td><td class="n">${s2(r.neto)}</td>
        <td class="n">${s2(r.essalud)}</td><td class="n">${s2(r.costo_empresa)}</td><td></td></tr></tfoot>` : ''}</table></section>`
  }

  function selTrabajador(nombre = 'trabajador_id', actual) {
    const ts = M.trabajadoresDelMes(emp().id, ui.periodo)
    return `<select name="${nombre}" required>${opciones(ts.map((t) => [t.id, t.apellidos_nombres]), actual, 'Elige al trabajador')}</select>`
  }
  function vistaNovedades() {
    const e = emp(), ini = ui.periodo, fin = F.finMes(ini), ci = cierreDe(e.id, ini)
    const ids = new Set(trabajadoresEmp().map((t) => t.id)), nom = (id) => esc(trab(id)?.apellidos_nombres)
    const aus = estado.ausencias.filter((a) => vivo(a) && ids.has(a.trabajador_id) && a.desde <= fin && a.hasta >= ini).sort((a, b) => (a.desde < b.desde ? -1 : 1))
    const asi = estado.asistencia.filter((a) => vivo(a) && ids.has(a.trabajador_id) && F.inicioMes(a.fecha) === ini).sort((a, b) => (a.fecha < b.fecha ? -1 : 1))
    const mov = estado.movimientos.filter((m) => vivo(m) && ids.has(m.trabajador_id) && m.periodo === ini)
    const fer = D.feriados.filter((f) => F.inicioMes(f.fecha) === ini)
    const anular = (col, id) => (ci ? '' : `<button class="enlace mal" data-accion="anular" data-col="${col}" data-id="${esc(id)}">Anular</button>`)
    const dis = ci ? 'disabled' : ''
    return `<section class="cabecera-vista"><h2>Novedades de ${mesLargo(ini)}</h2>
      ${ci ? '<span class="chip ok">Mes cerrado: las novedades no se pueden cambiar (R-24)</span>' : '<span class="sub">Lo que registres aquí se refleja al instante en la planilla y en las boletas.</span>'}</section>
    <div class="rejilla2">
    <section class="tarjeta"><h3>Ausencias, vacaciones, descansos y subsidios</h3>
      <form data-form="ausencia" class="form"><fieldset ${dis}>
        <label>Trabajador ${selTrabajador()}</label>
        <label>Tipo <select name="tipo" required>${opciones(D.tiposAusencia.map((t) => [t.codigo, t.nombre]), '', 'Elige el tipo')}</select></label>
        <label>Desde <input type="date" name="desde" required min="${ini}"></label><label>Hasta <input type="date" name="hasta" required></label>
        <label class="ancho">Detalle <input name="detalle" placeholder="Opcional: certificado, papeleta, etc."></label>
        <button class="primario">Registrar</button></fieldset></form>
      <p class="sub">Vacaciones: si el trabajador aún no completa su año, los días se registran como <b>adelanto</b> y se descuentan solo de las vacaciones truncas al cese.</p>
      <table class="tabla"><thead><tr><th>Trabajador</th><th>Tipo</th><th>Desde</th><th>Hasta</th><th class="n">Días</th><th></th></tr></thead><tbody>
      ${aus.map((a) => `<tr><td>${nom(a.trabajador_id)}</td><td>${esc(D.tiposAusencia.find((t) => t.codigo === a.tipo)?.nombre)}${a.detalle ? `<div class="sub">${esc(a.detalle)}</div>` : ''}</td>
        <td>${fecha(a.desde)}</td><td>${fecha(a.hasta)}</td><td class="n">${F.diasEntre(a.desde, a.hasta) + 1}</td><td>${anular('ausencias', a.id)}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin ausencias en el mes.</td></tr>'}
      </tbody></table></section>
    <section class="tarjeta"><h3>Horas extra, feriados trabajados y tardanzas</h3>
      <form data-form="asistencia" class="form"><fieldset ${dis}>
        <label>Trabajador ${selTrabajador()}</label><label>Fecha <input type="date" name="fecha" required min="${ini}" max="${fin}"></label>
        <label>Horas extra <input type="number" name="horas_extra" min="0" max="12" step="0.25" value="0"></label>
        <label>Minutos de tardanza <input type="number" name="minutos_tardanza" min="0" step="1" value="0"></label>
        <label class="check"><input type="checkbox" name="feriado_trabajado"> Trabajó en feriado o descanso sin descanso sustitutorio</label>
        <button class="primario">Registrar</button></fieldset></form>
      <p class="sub">Primeras 2 horas del día al 25%, las siguientes al 35% (R-08). Feriado trabajado: pago adicional de 2 remuneraciones diarias (R-09).
        ${fer.length ? `Feriados del mes: ${fer.map((f) => `${fecha(f.fecha).slice(0, 5)} ${esc(f.nombre)}`).join(' · ')}.` : ''}</p>
      <table class="tabla"><thead><tr><th>Trabajador</th><th>Fecha</th><th class="n">H. extra</th><th>Feriado</th><th class="n">Tardanza</th><th></th></tr></thead><tbody>
      ${asi.map((a) => `<tr><td>${nom(a.trabajador_id)}</td><td>${fecha(a.fecha)}</td><td class="n">${a.horas_extra || 0}</td><td>${a.feriado_trabajado ? 'Sí' : ''}</td>
        <td class="n">${a.minutos_tardanza ? a.minutos_tardanza + ' min' : ''}</td><td>${anular('asistencia', a.id)}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin registros en el mes.</td></tr>'}
      </tbody></table></section>
    <section class="tarjeta"><h3>Bonos, comisiones, adelantos y otros descuentos del mes</h3>
      <form data-form="movimiento" class="form"><fieldset ${dis}>
        <label>Trabajador ${selTrabajador()}</label>
        <label>Concepto <select name="concepto" required>${opciones(D.conceptos.filter((c) => c.manual && !c.liquidacion).map((c) => [c.codigo, `${c.nombre} (${c.tipo})`]), '', 'Elige el concepto')}</select></label>
        <label>Monto S/ <input type="number" name="monto" min="0.01" step="0.01" required></label>
        <label class="ancho">Detalle <input name="detalle" placeholder="Opcional"></label>
        <button class="primario">Registrar</button></fieldset></form>
      <p class="sub">Los montos fijos de todos los meses (movilidad, bono fijo) se registran en la ficha del trabajador como <b>conceptos fijos</b>.</p>
      <table class="tabla"><thead><tr><th>Trabajador</th><th>Concepto</th><th class="n">Monto</th><th></th></tr></thead><tbody>
      ${mov.map((m) => `<tr><td>${nom(m.trabajador_id)}</td><td>${esc(nombreConcepto(m.concepto))}${m.detalle ? `<div class="sub">${esc(m.detalle)}</div>` : ''}</td>
        <td class="n">${s2(m.monto)}</td><td>${anular('movimientos', m.id)}</td></tr>`).join('') || '<tr><td colspan="4" class="vacio">Sin movimientos en el mes.</td></tr>'}
      </tbody></table></section></div>`
  }

  function vistaTrabajadores() {
    const ts = trabajadoresEmp(), fin = F.finMes(ui.periodo)
    return `<section class="cabecera-vista"><h2>Trabajadores</h2><div class="fila-botones"><button class="primario" data-accion="nuevoTrabajador">Nuevo trabajador</button></div></section>
    <section class="tarjeta tabla-env"><table class="tabla"><thead><tr><th>Trabajador</th><th>Cargo</th><th>Ingreso</th><th>Cese</th><th>Régimen</th><th>Pensión</th>
      <th class="n">Sueldo al ${fecha(fin)}</th><th>Cód. ERP</th><th></th></tr></thead><tbody>
      ${ts.map((t) => `<tr class="${t.fecha_cese && t.fecha_cese < ui.periodo ? 'apagado' : ''}"><td><b>${esc(t.apellidos_nombres)}</b><div class="sub">${esc(t.tipo_documento)} ${esc(t.numero_documento)}</div></td>
        <td>${esc(t.cargo || '—')}</td><td>${fecha(t.fecha_ingreso)}</td><td>${t.fecha_cese ? fecha(t.fecha_cese) : '—'}</td><td>${nombreRegimen(M.regimenEn(t.id, mn(fin, t.fecha_cese || fin)))}</td>
        <td>${esc(nombrePension(t))}${t.sistema_pension === 'afp' ? `<div class="sub">${esc(t.comision_afp)} · ${esc(t.cuspp || 'sin CUSPP')}</div>` : ''}</td>
        <td class="n">${s2(M.sueldoEn(t.id, mn(fin, t.fecha_cese || fin)))}</td><td>${esc(t.codigo_externo || '—')}</td>
        <td><button class="enlace" data-accion="ficha" data-id="${esc(t.id)}">Ficha</button></td></tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin trabajadores.</td></tr>'}
    </tbody></table></section>`
  }

  function navSemestre(tipo, sem) {
    return `<div class="fila-botones"><button data-accion="semestre" data-tipo="${tipo}" data-paso="-6">◀ Anterior</button>
      <b>${mesLargo(sem)} – ${mesLargo(F.sumarMeses(sem, 5))} · ${tipo === 'cts' ? 'depósito en ' + mesLargo(F.sumarMeses(sem, 6)) : 'pago en ' + mesLargo(F.sumarMeses(sem, sem.slice(5, 7) === '01' ? 6 : 5))}</b>
      <button data-accion="semestre" data-tipo="${tipo}" data-paso="6">Siguiente ▶</button></div>`
  }
  function vistaBeneficios() {
    const e = emp(), sub = ui.sub || 'grati', nom = (id) => esc(trab(id)?.apellidos_nombres)
    const subs = [['grati', 'Gratificaciones'], ['cts', 'CTS'], ['provisiones', 'Provisiones del mes'], ['vacaciones', 'Vacaciones']]
    let cuerpo = ''
    if (sub === 'grati') {
      const sem = ui.semGrati || F.semestreGrati(F.sumarMeses(ui.periodo, -1)), gs = M.gratificaciones(e.id, sem)
      ui.semGrati = sem
      cuerpo = `${navSemestre('grati', sem)}<p class="sub">Pequeña empresa: ½ remuneración computable; general: 1; micro: no corresponde. Se paga en julio y diciembre con la planilla del mes;
        si el trabajador cesa antes, se paga trunca en la liquidación (R-17). Bonificación extraordinaria 9% (6.75% con EPS).</p>
        <table class="tabla"><thead><tr><th>Trabajador</th><th>Tipo</th><th>Régimen</th><th class="n">Meses</th><th class="n">Días no comp.</th><th class="n">Computable</th>
        <th class="n">Gratificación</th><th class="n">Bonificación</th><th>Se paga en</th></tr></thead><tbody>
        ${gs.map((g) => `<tr><td>${nom(g.trabajador_id)}</td><td>${TIPO[g.tipo]}</td><td>${nombreRegimen(g.regimen)}</td><td class="n">${g.meses}</td><td class="n">${g.dias_no_computables}</td>
          <td class="n">${s2(g.computable)}</td><td class="n">${s2(g.monto)}</td><td class="n">${s2(g.bonificacion)}</td><td>${g.tipo === 'trunca' ? 'Liquidación' : mesLargo(g.pago_mes)}</td></tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin trabajadores en el semestre.</td></tr>'}
        </tbody>${gs.length ? `<tfoot><tr><td colspan="6">Total</td><td class="n">${s2(gs.reduce((a, g) => a + g.monto, 0))}</td><td class="n">${s2(gs.reduce((a, g) => a + g.bonificacion, 0))}</td><td></td></tr></tfoot>` : ''}</table>`
    } else if (sub === 'cts') {
      const sem = ui.semCts || F.semestreCts(F.sumarMeses(ui.periodo, -1)), cs = M.cts(e.id, sem)
      ui.semCts = sem
      cuerpo = `${navSemestre('cts', sem)}<p class="sub">Pequeña empresa: 15 días de remuneración por año (tope 90 días); general: 30 días; micro: no corresponde.
        Computable = remuneración + 1/6 de la gratificación del semestre. Depósito hasta el 15 de mayo y de noviembre (R-18).</p>
        <table class="tabla"><thead><tr><th>Trabajador</th><th>Tipo</th><th>Periodo</th><th class="n">Meses y días</th><th class="n">Computable</th><th class="n">1/6 grati</th>
        <th class="n">Días ganados</th><th class="n">CTS</th><th></th></tr></thead><tbody>
        ${cs.map((c) => `<tr><td>${nom(c.trabajador_id)}</td><td>${TIPO[c.tipo]}</td><td>${fecha(c.desde)} – ${fecha(c.hasta)}</td><td class="n">${c.meses} m ${c.dias_resto} d</td>
          <td class="n">${s2(c.computable)}</td><td class="n">${s2(c.sexto)}</td><td class="n">${Math.round(c.dias_ganados * 100) / 100}</td><td class="n">${s2(c.monto)}</td>
          <td>${c.monto > 0 && c.tipo === 'deposito' ? `<button class="enlace" data-accion="hojaCts" data-id="${esc(c.trabajador_id)}" data-sem="${sem}">Constancia</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin trabajadores en el semestre.</td></tr>'}
        </tbody>${cs.length ? `<tfoot><tr><td colspan="7">Total</td><td class="n">${s2(cs.reduce((a, c) => a + c.monto, 0))}</td><td></td></tr></tfoot>` : ''}</table>`
    } else if (sub === 'provisiones') {
      const ps = M.provisiones(e.id, ui.periodo), t = (k) => s2(ps.reduce((a, p) => a + p[k], 0))
      cuerpo = `<p class="sub">Provisión del mes = lo devengado al cierre del mes menos lo devengado al cierre del mes anterior (R-19). Así la suma de las provisiones del semestre es exactamente
        lo que se paga en julio, diciembre, mayo y noviembre, sin ajustes manuales.</p>
        <table class="tabla"><thead><tr><th>Trabajador</th><th class="n">Gratificación</th><th class="n">Bonificación</th><th class="n">CTS</th><th class="n">Vacaciones</th><th class="n">Total</th></tr></thead><tbody>
        ${ps.map((p) => `<tr><td>${nom(p.trabajador_id)}</td><td class="n">${s2(p.gratificacion)}</td><td class="n">${s2(p.bonificacion)}</td><td class="n">${s2(p.cts)}</td>
          <td class="n">${s2(p.vacaciones)}</td><td class="n">${s2(p.gratificacion + p.bonificacion + p.cts + p.vacaciones)}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin trabajadores.</td></tr>'}
        </tbody>${ps.length ? `<tfoot><tr><td>Total ${mesLargo(ui.periodo)}</td><td class="n">${t('gratificacion')}</td><td class="n">${t('bonificacion')}</td><td class="n">${t('cts')}</td><td class="n">${t('vacaciones')}</td>
          <td class="n">${s2(ps.reduce((a, p) => a + p.gratificacion + p.bonificacion + p.cts + p.vacaciones, 0))}</td></tr></tfoot>` : ''}</table>`
    } else {
      const vs = M.vacacionesDe(e.id)
      cuerpo = `<p class="sub">Pequeña y micro: 15 días por año; general: 30 (R-20). Los días gozados se descuentan del periodo más antiguo. Las vacaciones no gozadas dentro del año siguiente
        vencen y generan indemnización vacacional. Corte: fecha de cese o hoy.</p>
        <table class="tabla"><thead><tr><th>Trabajador</th><th>Corte</th><th class="n">Ganados</th><th class="n">Gozados</th><th class="n">Pendientes</th><th class="n">Vencidos</th>
        <th class="n">Adelantados</th><th class="n">Truncos</th><th class="n">Monto pendientes</th><th></th></tr></thead><tbody>
        ${vs.map((v) => `<tr><td>${nom(v.trabajador_id)}</td><td>${fecha(v.corte)}</td><td class="n">${v.dias_ganados}</td><td class="n">${v.dias_gozados}</td><td class="n">${v.dias_pendientes}</td>
          <td class="n">${v.dias_vencidos ? `<b class="mal">${v.dias_vencidos}</b>` : 0}</td><td class="n">${v.dias_adelantados}</td><td class="n">${v.dias_trunca}</td><td class="n">${s2(v.monto_pendientes)}</td>
          <td><button class="enlace" data-accion="verVacaciones" data-id="${esc(v.trabajador_id)}">Periodos</button></td></tr>`).join('') || '<tr><td colspan="10" class="vacio">Sin trabajadores.</td></tr>'}
        </tbody></table>`
    }
    return `<section class="cabecera-vista"><h2>Beneficios sociales</h2><div class="subtabs">${subs.map(([k, t]) => `<button class="${sub === k ? 'activo' : ''}" data-accion="sub" data-sub="${k}">${t}</button>`).join('')}</div></section>
      <section class="tarjeta tabla-env">${cuerpo}</section>`
  }

  function vistaLiquidaciones() {
    const ls = M.liquidaciones(emp().id)
    return `<section class="cabecera-vista"><h2>Liquidaciones de beneficios sociales</h2>
      <div class="fila-botones"><button class="primario" data-accion="simular">Simular una liquidación o indemnización</button></div></section>
      <p class="sub">Para liquidar a un trabajador, registra su cese en su ficha (Trabajadores → Ficha → Cese). La liquidación se paga dentro de las 48 horas del cese (R-21):
        CTS y gratificación truncas, vacaciones pendientes, vencidas (indemnización) y truncas, indemnización por despido arbitrario (R-22), con la quinta regularizada sobre lo percibido en el año (R-23).</p>
      <section class="tarjeta tabla-env"><table class="tabla"><thead><tr><th>Trabajador</th><th>Cese</th><th>Motivo</th><th>Servicio</th><th class="n">Ingresos</th><th class="n">Descuentos</th>
        <th class="n">Neto</th><th>Pagar hasta</th><th></th></tr></thead><tbody>
      ${ls.map((l) => `<tr><td><b>${esc(l.apellidos_nombres)}</b></td><td>${fecha(l.fecha_cese)}</td><td>${esc(l.motivo_cese)}</td><td>${l.servicio_anios} a ${l.servicio_meses} m ${l.servicio_dias} d</td>
        <td class="n">${s2(l.ingresos)}</td><td class="n">${s2(l.descuentos)}</td><td class="n"><b>${s2(l.neto)}</b></td><td>${fecha(l.fecha_limite_pago)}</td>
        <td><button class="enlace" data-accion="verLiquidacion" data-id="${esc(l.trabajador_id)}">Ver e imprimir</button></td></tr>`).join('') || '<tr><td colspan="9" class="vacio">No hay ceses registrados.</td></tr>'}
      </tbody></table></section>`
  }

  function vistaParametros() {
    const e = emp(), per = ui.periodo, ts = M.tasasDelMes(per), cerrado = e && cierreDe(e.id, per)
    const legales = D.legales.concat(estado.parametros.legales).filter((l) => l.parametro in D.nombresParametro)
    const vigentes = Object.keys(D.nombresParametro).map((k) => ({ k, v: M.legal(k, F.finMes(per)), fila: legales.filter((l) => l.parametro === k && l.desde <= F.finMes(per)).sort((a, b) => (a.desde < b.desde ? 1 : -1))[0] }))
    const mostrar = (k, v) => (v == null ? '—' : D.parametrosPorcentaje.includes(k) ? pct(v) + ' %' : k === 'rmv' || k === 'uit' ? 'S/ ' + s2(v) : v)
    return `<section class="cabecera-vista"><h2>Parámetros</h2></section>
    <div class="rejilla2">
    <section class="tarjeta"><h3>Tasas AFP de ${mesLargo(per)} (R-03)</h3>
      <p class="sub">Cada mes la SBS publica las comisiones, prima de seguros y remuneración máxima asegurable. Cópialas de la
        <a href="${SBS}" target="_blank" rel="noopener">tabla de la SBS</a> (devengue ${per.slice(0, 7)}). Si no se registran, el mes usa las últimas registradas y queda <b>provisional</b> (bloquea el cierre).</p>
      <form data-form="tasas" class="form-tasas"><fieldset ${cerrado ? 'disabled' : ''}><div class="tabla-env"><table class="tabla"><thead><tr><th>AFP</th><th>Aporte %</th><th>Prima %</th><th>Com. flujo %</th><th>Com. mixta %</th><th>Com. saldo %</th><th>Rem. máx.</th></tr></thead><tbody>
      ${ts.map((t) => `<tr><td>${esc(t.nombre)}<div class="sub">${t.exacta ? '<span class="ok">registrada</span>' : t.periodo_tasa ? `<span class="aviso">usa ${t.periodo_tasa.slice(0, 7)}</span>` : '<span class="mal">sin tasas</span>'}</div></td>
        ${['aporte', 'prima', 'comision_flujo', 'comision_mixta', 'comision_saldo'].map((k) => `<td><input class="corto" name="${t.codigo}.${k}" type="number" step="0.0001" min="0" max="100" value="${pct(t[k])}" ${k === 'comision_saldo' ? '' : 'required'}></td>`).join('')}
        <td><input class="corto" name="${t.codigo}.remuneracion_maxima" type="number" step="0.01" min="0" value="${t.remuneracion_maxima ?? ''}" required></td></tr>`).join('')}
      </tbody></table></div>
      <label class="ancho">Sustento <input name="sustento" required placeholder="Ej.: Tabla SBS devengue ${per.slice(0, 7)}, consultada el ${fecha(hoyISO)}"></label>
      <button class="primario">Registrar tasas de ${mesLargo(per)}</button></fieldset></form>
      ${cerrado ? '<p class="sub">El mes está cerrado: sus tasas ya no se cambian.</p>' : ''}</section>
    <section class="tarjeta"><h3>Valores legales vigentes al ${fecha(F.finMes(per))}</h3>
      <table class="tabla"><thead><tr><th>Parámetro</th><th class="n">Valor</th><th>Desde</th><th>Norma</th></tr></thead><tbody>
      ${vigentes.map(({ k, v, fila }) => `<tr><td>${esc(D.nombresParametro[k])}</td><td class="n">${mostrar(k, v)}</td><td>${fila ? fecha(fila.desde) : '—'}</td><td class="sub">${esc(fila?.norma || '')}</td></tr>`).join('')}
      </tbody></table>
      <form data-form="legal" class="form"><label>Parámetro <select name="parametro" required>${opciones(Object.entries(D.nombresParametro), '', 'Elige')}</select></label>
        <label>Vigente desde <input type="date" name="desde" required></label><label>Valor (en % si es tasa) <input type="number" name="valor" step="0.0001" required></label>
        <label class="ancho">Norma <input name="norma" required placeholder="Ej.: D.S. 0xx-2027-TR"></label><button>Agregar nuevo valor</button></form>
      <p class="sub">Una nueva RMV o UIT se agrega con su fecha de vigencia; los meses anteriores siguen usando el valor de su fecha.</p></section>
    ${e ? `<section class="tarjeta"><h3>Empleador</h3>
      <form data-form="empleador" class="form" data-id="${esc(e.id)}">${camposEmpleador(e)}<button class="primario">Guardar empleador</button></form>
      <h4>Inscripción REMYPE (R-01)</h4>
      <table class="tabla"><thead><tr><th>Categoría</th><th>Desde</th><th>Hasta</th><th>Constancia</th><th></th></tr></thead><tbody>
      ${(e.remype || []).map((r, i) => `<tr class="${r.anulado ? 'apagado' : ''}"><td>${nombreRegimen(r.categoria)}</td><td>${fecha(r.desde)}</td><td>${r.hasta ? fecha(r.hasta) : 'vigente'}</td><td>${esc(r.constancia || '')}</td>
        <td>${r.anulado ? 'anulada' : `<button class="enlace mal" data-accion="anularRemype" data-i="${i}">Anular</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin REMYPE: régimen general.</td></tr>'}</tbody></table>
      <form data-form="remype" class="form"><label>Categoría <select name="categoria">${opciones([['pequena', 'Pequeña empresa'], ['micro', 'Microempresa']], 'pequena')}</select></label>
        <label>Desde <input type="date" name="desde" required></label><label>Hasta <input type="date" name="hasta"></label>
        <label class="ancho">Constancia <input name="constancia" placeholder="N.° de constancia REMYPE"></label><button>Agregar inscripción</button></form>
      <p class="sub">Quien ingresó antes de la inscripción conserva el régimen general. Renovar o cambiar de categoría sin interrupción no cambia el régimen de nadie.</p></section>` : ''}
    <section class="tarjeta"><h3>Empleadores</h3><p class="sub">El sistema sirve para HoldingD y para las demás entidades del mismo régimen: cada una con sus trabajadores y su planilla.</p>
      <ul class="lista">${empleadores().map((x) => `<li>${esc(x.razon_social)} · RUC ${esc(x.ruc || '—')} · planilla desde ${mesLargo(x.inicio_planilla)}</li>`).join('') || '<li class="vacio">Ninguno.</li>'}</ul>
      <button data-accion="nuevoEmpleador">Nuevo empleador</button></section></div>`
  }
  const camposEmpleador = (e = {}) => `
    <label class="ancho">Razón social <input name="razon_social" required value="${esc(e.razon_social)}"></label>
    <label>RUC <input name="ruc" required pattern="\\d{11}" value="${esc(e.ruc)}"></label>
    <label>Planilla desde (mes) <input type="month" name="inicio_planilla" required value="${esc((e.inicio_planilla || '').slice(0, 7))}"></label>
    <label class="ancho">Dirección <input name="direccion" value="${esc(e.direccion)}"></label>
    <label>Días laborables por semana <select name="dias_laborables_semana">${opciones([[6, '6'], [5, '5']], e.dias_laborables_semana || 6)}</select></label>
    <label class="check"><input type="checkbox" name="descuento_dominical" ${e.descuento_dominical ? 'checked' : ''}> Descontar el dominical por faltas (R-10)</label>`

  function vistaDatos() {
    const n = (k) => estado[k].filter(vivo).length
    return `<section class="cabecera-vista"><h2>Datos</h2></section>
    <div class="rejilla2">
    <section class="tarjeta"><h3>Cargar la planilla en Excel</h3>
      <p class="sub">Formato de la planilla mensual de HoldingD: hoja del mes (RUC en A2, periodo en E5, trabajadores desde la fila 10), hojas <i>Renta 5ta</i>, <i>Asistencia</i> y <i>Boleta</i>.
        Registra el empleador, sus trabajadores, sueldos, pensión, rentas de quinta previas, adelantos y tasas AFP del mes. Si el RUC ya existe, no se vuelve a cargar.</p>
      <form data-form="excel" class="form"><label class="ancho">Archivo Excel <input type="file" name="archivo" accept=".xlsx,.xls" required></label>
        <label>Ingreso mínimo (dato de prueba) <input type="date" name="ingreso_minimo" value="2025-02-01"></label>
        <p class="sub ancho">Quien ingresó en el mismo mes que esta fecha queda registrado en esta fecha y sin vacaciones gozadas (supuesto de prueba). Déjalo vacío para usar las fechas del Excel.</p>
        <button class="primario">Cargar Excel</button></form>
      <p class="sub">Leer Excel necesita internet la primera vez (librería SheetJS desde cdnjs). El cálculo no necesita internet.</p></section>
    <section class="tarjeta"><h3>Respaldo</h3>
      <p>Los datos viven <b>solo en este navegador</b>. Exporta un respaldo con frecuencia y guárdalo en una carpeta segura (contiene datos personales y sueldos).</p>
      <ul class="lista"><li>${n('empleadores')} empleadores · ${n('trabajadores')} trabajadores</li><li>${n('ausencias')} ausencias · ${n('asistencia')} registros de asistencia · ${n('movimientos')} movimientos</li>
        <li>${n('cierres')} planillas cerradas · ${estado.parametros.tasas_afp.length} tasas AFP registradas</li></ul>
      <div class="fila-botones"><button class="primario" data-accion="exportarJson">Exportar respaldo (JSON)</button></div>
      <form data-form="json" class="form"><label class="ancho">Restaurar desde un respaldo <input type="file" name="archivo" accept=".json,application/json" required></label>
        <button>Restaurar respaldo</button></form>
      <p class="sub">Restaurar reemplaza los datos de este navegador por los del respaldo (antes se descarga un respaldo de lo actual, por seguridad).</p></section>
    <section class="tarjeta"><h3>Integración con el ERP</h3>
      <p class="sub">El ERP de personal puede generar este mismo archivo JSON (formato en <i>LEEME.md</i>) para cargar trabajadores y novedades, o usar directamente el motor
        <code>motor.js</code>: <code>PlanillaMotor.crearMotor(estado).planilla(empleadorId, '2026-10-01')</code> devuelve la planilla, y <code>.boleta()</code>, <code>.liquidacion()</code>,
        <code>.gratificaciones()</code>, <code>.cts()</code> y <code>.provisiones()</code> el resto.</p></section>
    <section class="tarjeta"><h3>Últimos cambios</h3><ul class="lista auditoria">${estado.auditoria.slice(-15).reverse().map((a) => `<li><span class="sub">${esc(a.en.slice(0, 16).replace('T', ' '))}</span> ${esc(a.accion)}</li>`).join('') || '<li class="vacio">Sin cambios.</li>'}</ul></section>
    </div>`
  }
  const VISTAS = { planilla: vistaPlanilla, novedades: vistaNovedades, trabajadores: vistaTrabajadores, beneficios: vistaBeneficios,
    liquidaciones: vistaLiquidaciones, parametros: vistaParametros, datos: vistaDatos }

  // ---------------------------------------------------------------- Documentos imprimibles
  function htmlBoleta(b, copia) {
    const c = b.cabecera, L = b.lineas, suma = (t) => L.filter((l) => l.tipo === t).reduce((a, l) => a + l.monto, 0)
    const cant = (cod) => Number(L.find((l) => l.concepto === cod)?.cantidad || 0)
    const dato = (k, v) => `<td><div class="k">${esc(k)}</div><div>${esc(v ?? '—')}</div></td>`
    return `<div class="boleta">${!b.emitida ? '<div class="borrador">BORRADOR · se emite al cerrar la planilla</div>' : ''}
      <div class="b-cab"><div><div><b>Empresa:</b> ${esc(b.empleador.razon_social)}</div>${b.empleador.direccion ? `<div><b>Domicilio:</b> ${esc(b.empleador.direccion)}</div>` : ''}
        <div><b>RUC:</b> ${esc(b.empleador.ruc || '—')}</div></div>
        <div class="der"><div class="b-tit">BOLETA DE PAGO</div><div>Periodo: ${mesLargo(b.periodo)}</div>${copia ? `<div class="k">${copia}</div>` : ''}<div class="k">D.S. 001-98-TR</div></div></div>
      <table class="b-tab"><tbody>
        <tr>${dato(c.tipo_documento || 'DNI', c.numero_documento)}<td colspan="3"><div class="k">Apellidos y nombres</div><b>${esc(c.apellidos_nombres)}</b></td>${dato('Sueldo básico', s2(c.sueldo_basico))}</tr>
        <tr>${dato('Cargo', c.cargo)}${dato('Régimen pensionario', c.sistema_pension === 'afp' ? String(c.afp || 'AFP').toUpperCase() : c.sistema_pension === 'onp' ? 'ONP' : '—')}
          ${dato('CUSPP', c.sistema_pension === 'afp' ? c.cuspp : '—')}${dato('Fecha ingreso', fecha(c.fecha_ingreso))}${dato('Fecha cese', c.fecha_cese ? fecha(c.fecha_cese) : '—')}</tr>
        <tr>${dato('Días trabajados', c.dias_sueldo)}${dato('H. ordinarias', (c.dias_sueldo || 0) * 8)}${dato('Días subsidiados', c.dias_subsidiados || 0)}${dato('Faltas', c.dias_no_pagados || 0)}${dato('Categoría', nombreRegimen(c.regimen))}</tr>
        <tr>${dato('Días vacaciones', c.dias_vacaciones || 0)}${dato('H.E. al 25%', cant('HE25'))}${dato('H.E. al 35%', cant('HE35'))}${dato('Feriados lab.', cant('FERIADO'))}<td></td></tr>
      </tbody></table>
      <table class="b-tab"><thead><tr><th class="cod">Cód.</th><th>Conceptos</th><th class="n">Ingresos</th><th class="n">Descuentos</th><th class="n">Aportes empleador</th></tr></thead><tbody>
        ${L.map((l) => `<tr><td class="k">${esc(l.plame || '')}</td><td>${esc(l.nombre)}${l.cantidad > 0 && !['HE25', 'HE35'].includes(l.concepto) ? ` <span class="k">(${l.cantidad})</span>` : ''}</td>
          <td class="n">${l.tipo === 'ingreso' ? s2(l.monto) : ''}</td><td class="n">${l.tipo === 'descuento' ? s2(l.monto) : ''}</td><td class="n">${l.tipo === 'aporte' ? s2(l.monto) : ''}</td></tr>`).join('')}
        <tr class="tot"><td></td><td>Importe total</td><td class="n">${s2(suma('ingreso'))}</td><td class="n">${s2(suma('descuento'))}</td><td class="n">${s2(suma('aporte'))}</td></tr>
        <tr class="tot neto"><td></td><td>Neto a pagar en S/</td><td></td><td class="n">${s2(suma('ingreso') - suma('descuento'))}</td><td></td></tr></tbody></table>
      <div class="firmas"><div>LA EMPRESA</div><div>${esc(c.apellidos_nombres)}</div></div></div>`
  }
  const boletasImpresion = (bs) => bs.map((b) => `<div class="hoja">${htmlBoleta(b, 'Copia empleador')}<div class="corte"></div>${htmlBoleta(b, 'Copia trabajador')}</div>`).join('')

  function htmlLiquidacion(l, e, simulada) {
    const L = l.lineas, suma = (t) => L.filter((x) => x.tipo === t).reduce((a, x) => a + x.monto, 0)
    return `<div class="boleta liq">${simulada ? '<div class="borrador">SIMULACIÓN · no registra el cese</div>' : ''}
      <div class="b-cab"><div><div><b>Empresa:</b> ${esc(e.razon_social)}</div>${e.direccion ? `<div><b>Domicilio:</b> ${esc(e.direccion)}</div>` : ''}<div><b>RUC:</b> ${esc(e.ruc || '—')}</div></div>
        <div class="der"><div class="b-tit">LIQUIDACIÓN DE BENEFICIOS SOCIALES</div><div>Pagar hasta: ${fecha(l.fecha_limite_pago)}</div></div></div>
      <table class="b-tab"><tbody>
        <tr><td><div class="k">${esc(l.tipo_documento || 'DNI')}</div>${esc(l.numero_documento)}</td><td colspan="2"><div class="k">Apellidos y nombres</div><b>${esc(l.apellidos_nombres)}</b></td><td><div class="k">Cargo</div>${esc(l.cargo || '—')}</td></tr>
        <tr><td><div class="k">Fecha ingreso</div>${fecha(l.fecha_ingreso)}</td><td><div class="k">Fecha cese</div>${fecha(l.fecha_cese)}</td><td><div class="k">Motivo</div>${esc(l.motivo_cese)}</td>
          <td><div class="k">Tiempo de servicio</div>${l.servicio_anios} años, ${l.servicio_meses} meses, ${l.servicio_dias} días</td></tr>
        <tr><td><div class="k">Régimen</div>${nombreRegimen(l.regimen)}</td><td colspan="3"><div class="k">Remuneración computable</div>S/ ${s2(l.computable)}</td></tr></tbody></table>
      <table class="b-tab"><thead><tr><th class="cod">Cód.</th><th>Concepto</th><th class="n">Cantidad</th><th class="n">Ingresos</th><th class="n">Descuentos</th><th class="n">Aportes empleador</th></tr></thead><tbody>
        ${L.map((x) => `<tr><td class="k">${esc(x.plame || '')}</td><td>${esc(x.nombre)}</td><td class="n">${x.cantidad != null ? Math.round(x.cantidad * 100) / 100 : ''}</td>
          <td class="n">${x.tipo === 'ingreso' ? s2(x.monto) : ''}</td><td class="n">${x.tipo === 'descuento' ? s2(x.monto) : ''}</td><td class="n">${x.tipo === 'aporte' ? s2(x.monto) : ''}</td></tr>`).join('')}
        <tr class="tot"><td></td><td colspan="2">Totales</td><td class="n">${s2(suma('ingreso'))}</td><td class="n">${s2(suma('descuento'))}</td><td class="n">${s2(suma('aporte'))}</td></tr>
        <tr class="tot neto"><td></td><td colspan="2">Neto a pagar en S/</td><td></td><td class="n">${s2(l.neto)}</td><td></td></tr></tbody></table>
      <p class="k">Cantidad: días (CTS, vacaciones) o meses (gratificación). Indemnización por despido arbitrario según el régimen (R-22); quinta categoría regularizada sobre lo percibido en el año (R-23).
        La remuneración del último mes se paga en la planilla del mes.</p>
      <div class="firmas"><div>LA EMPRESA</div><div>${esc(l.apellidos_nombres)}<br>Recibí conforme</div></div></div>`
  }
  function htmlConstanciaCts(c, t, e) {
    return `<div class="boleta"><div class="b-cab"><div><div><b>Empresa:</b> ${esc(e.razon_social)}</div><div><b>RUC:</b> ${esc(e.ruc || '—')}</div></div>
      <div class="der"><div class="b-tit">LIQUIDACIÓN DE DEPÓSITO DE CTS</div><div>Depósito: ${mesLargo(c.deposito_mes)}</div><div class="k">D.S. 001-97-TR, art. 24</div></div></div>
      <table class="b-tab"><tbody><tr><td colspan="2"><div class="k">Trabajador</div><b>${esc(t.apellidos_nombres)}</b> · ${esc(t.tipo_documento || 'DNI')} ${esc(t.numero_documento)}</td>
        <td><div class="k">Entidad / cuenta CTS</div>${esc(t.banco_cts || '—')} ${esc(t.cuenta_cts || '')}</td></tr>
      <tr><td><div class="k">Periodo</div>${fecha(c.desde)} – ${fecha(c.hasta)}</td><td><div class="k">Tiempo computable</div>${c.meses} meses, ${c.dias_resto} días</td><td><div class="k">Régimen</div>${nombreRegimen(c.regimen)}</td></tr>
      <tr><td><div class="k">Remuneración computable</div>S/ ${s2(c.computable)}</td><td><div class="k">1/6 de gratificación</div>S/ ${s2(c.sexto)}</td><td><div class="k">Días de remuneración ganados</div>${Math.round(c.dias_ganados * 100) / 100}</td></tr>
      <tr class="tot neto"><td colspan="2">Monto a depositar</td><td class="n">S/ ${s2(c.monto)}</td></tr></tbody></table>
      <div class="firmas"><div>LA EMPRESA</div><div>${esc(t.apellidos_nombres)}</div></div></div>`
  }
  function imprimir(html) { $('#impresion').innerHTML = html; window.print() }

  // ---------------------------------------------------------------- Modales
  function renderModal() {
    const d = $('#modal'), m = ui.modal
    if (!m) { if (d.open) d.close(); return }
    let titulo = '', cuerpo = '', pie = ''
    try {
      if (m.tipo === 'boleta') {
        const b = M.boleta(m.id, m.periodo); titulo = `Boleta · ${trab(m.id)?.apellidos_nombres}`
        cuerpo = b ? htmlBoleta(b) : 'Sin boleta en el mes.'; pie = `<button class="primario" data-accion="imprimirBoleta">Imprimir (2 copias)</button>`
      } else if (m.tipo === 'liquidacion') {
        const l = M.liquidacion(m.id); titulo = `Liquidación · ${l.apellidos_nombres}`; cuerpo = htmlLiquidacion(l, emp())
        pie = `<button class="primario" data-accion="imprimirModal">Imprimir</button>`
      } else if (m.tipo === 'simular') { titulo = 'Simular liquidación'; cuerpo = vistaSimular(m) }
      else if (m.tipo === 'ficha') { const t = trab(m.id); titulo = t ? `Ficha · ${t.apellidos_nombres}` : 'Nuevo trabajador'; cuerpo = vistaFicha(t) }
      else if (m.tipo === 'empleador') { titulo = 'Nuevo empleador'; cuerpo = `<form data-form="nuevoEmpleador" class="form">${camposEmpleador()}<label>Inscripción REMYPE desde <input type="date" name="remype_desde"></label>
          <label>Categoría <select name="remype_categoria">${opciones([['pequena', 'Pequeña empresa'], ['micro', 'Microempresa'], ['', 'Sin REMYPE (general)']], 'pequena')}</select></label><button class="primario">Registrar empleador</button></form>` }
      else if (m.tipo === 'vacaciones') {
        const v = M.vacaciones(m.id); titulo = `Vacaciones · ${trab(m.id)?.apellidos_nombres}`
        cuerpo = `<table class="tabla"><thead><tr><th>Año</th><th>Periodo</th><th>Vence</th><th class="n">Ganados</th><th class="n">Gozados</th><th class="n">Pendientes</th></tr></thead><tbody>
          ${v.periodos.map((p) => `<tr><td>${p.periodo}</td><td>${fecha(p.inicio)} – ${fecha(p.fin)}</td><td>${fecha(p.vence)}${p.vencido ? ' <b class="mal">vencido</b>' : ''}</td><td class="n">${p.ganados}</td><td class="n">${p.gozados}</td><td class="n">${p.pendientes}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Aún no cumple su primer año.</td></tr>'}
          </tbody></table><p>Truncos al ${fecha(v.corte)}: <b>${v.dias_trunca}</b> días · adelantados: <b>${v.dias_adelantados}</b> · computable S/ ${s2(v.computable)}</p>`
      }
    } catch (err) { cuerpo = `<div class="alerta mal">${esc(err.message)}</div>` }
    d.innerHTML = `<div class="modal-cab"><h3>${esc(titulo)}</h3><button class="enlace" data-accion="cerrarModal" aria-label="Cerrar">✕</button></div>
      <div class="modal-cuerpo">${cuerpo}</div>${pie ? `<div class="modal-pie">${pie}</div>` : ''}`
    if (!d.open) d.showModal()
  }

  function vistaSimular(m) {
    const ts = trabajadoresEmp().filter((t) => !t.fecha_cese)
    let res = ''
    if (m.tid && m.cese && m.motivo) {
      const est2 = { ...estado, trabajadores: estado.trabajadores.map((t) => (t.id === m.tid ? { ...t, fecha_cese: m.cese, motivo_cese: m.motivo } : t)) }
      const l = crearMotor(est2).liquidacion(m.tid)
      res = l ? htmlLiquidacion(l, emp(), true) + '<div class="fila-botones"><button class="primario" data-accion="imprimirModal">Imprimir simulación</button></div>' : '<p>Sin liquidación para esa fecha.</p>'
    }
    return `<form data-form="simular" class="form"><label>Trabajador <select name="tid" required>${opciones(ts.map((t) => [t.id, t.apellidos_nombres]), m.tid, 'Elige')}</select></label>
      <label>Fecha de cese <input type="date" name="cese" required value="${esc(m.cese || '')}"></label>
      <label>Motivo <select name="motivo" required>${opciones(D.motivosCese.map((x) => [x.codigo, x.nombre]), m.motivo, 'Elige')}</select></label>
      <button class="primario">Calcular</button></form><div id="resultado">${res}</div>`
  }

  function vistaFicha(t) {
    const e = emp(), x = t || { tipo_documento: 'DNI', sistema_pension: 'onp', salud: 'essalud', jornada_horas: 8, periodo_prueba_meses: 3, domiciliado: true }
    const campos = `
      <label class="ancho">Apellidos y nombres <input name="apellidos_nombres" required value="${esc(x.apellidos_nombres)}" placeholder="APELLIDO PATERNO MATERNO, NOMBRES"></label>
      <label>Tipo de documento <select name="tipo_documento">${opciones([['DNI', 'DNI'], ['CE', 'Carné de extranjería'], ['PASAPORTE', 'Pasaporte']], x.tipo_documento)}</select></label>
      <label>N.° de documento <input name="numero_documento" required value="${esc(x.numero_documento)}"></label>
      <label>Código en el ERP de personal <input name="codigo_externo" value="${esc(x.codigo_externo)}"></label>
      <label>Cargo <input name="cargo" value="${esc(x.cargo)}"></label>
      <label>Fecha de nacimiento <input type="date" name="fecha_nacimiento" value="${esc(x.fecha_nacimiento)}"></label>
      <label>Fecha de ingreso <input type="date" name="fecha_ingreso" required value="${esc(x.fecha_ingreso)}" ${t ? 'readonly title="Un reingreso es otro registro"' : ''}></label>
      ${t ? '' : '<label>Sueldo básico S/ <input type="number" name="sueldo" step="0.01" min="0" required></label>'}
      <label>Fin de contrato (plazo fijo) <input type="date" name="fecha_fin_contrato" value="${esc(x.fecha_fin_contrato)}"></label>
      <label>Periodo de prueba (meses) <input type="number" name="periodo_prueba_meses" min="0" max="12" value="${x.periodo_prueba_meses ?? 3}"></label>
      <label>Régimen <select name="regimen_pactado">${opciones([['general', 'General (pactado)'], ['pequena', 'Pequeña empresa (pactado)'], ['micro', 'Microempresa (pactado)']], x.regimen_pactado, 'Según REMYPE e ingreso')}</select></label>
      <label>Sistema de pensiones <select name="sistema_pension">${opciones([['onp', 'ONP'], ['afp', 'AFP'], ['sin_sistema', 'Sin sistema']], x.sistema_pension)}</select></label>
      <label>AFP <select name="afp">${opciones(D.afps.map((a) => [a.codigo, a.nombre]), x.afp, '—')}</select></label>
      <label>Comisión AFP <select name="comision_afp">${opciones([['flujo', 'Flujo'], ['mixta', 'Mixta (saldo)']], x.comision_afp, '—')}</select></label>
      <label>CUSPP <input name="cuspp" value="${esc(x.cuspp)}"></label>
      <label>Salud <select name="salud">${opciones([['essalud', 'EsSalud'], ['eps', 'EPS'], ['sis', 'SIS']], x.salud)}</select></label>
      <label>Jornada diaria (horas) <input type="number" name="jornada_horas" min="0.5" max="8" step="0.5" value="${x.jornada_horas ?? 8}"></label>
      <label class="check"><input type="checkbox" name="asignacion_familiar" ${x.asignacion_familiar ? 'checked' : ''}> Asignación familiar (hijos menores o estudiando)</label>
      <label class="check"><input type="checkbox" name="domiciliado" ${x.domiciliado !== false ? 'checked' : ''}> Domiciliado en el Perú (quinta)</label>
      <label>Banco sueldo <input name="banco" value="${esc(x.banco)}"></label><label>Cuenta sueldo <input name="cuenta_sueldo" value="${esc(x.cuenta_sueldo)}"></label>
      <label>Banco CTS <input name="banco_cts" value="${esc(x.banco_cts)}"></label><label>Cuenta CTS <input name="cuenta_cts" value="${esc(x.cuenta_cts)}"></label>
      <label class="ancho">Correo <input type="email" name="correo" value="${esc(x.correo)}"></label>`
    if (!t) return `<form data-form="trabajador" class="form">${campos}<button class="primario">Registrar trabajador</button></form>
      <p class="sub">Si ingresó antes de ${mesLargo(e.inicio_planilla)} (inicio de la planilla en el sistema), registra luego en su ficha su saldo inicial de vacaciones y sus rentas de quinta del año.</p>`
    const viv = (l) => (l || []).map((y, i) => [y, i]).filter(([y]) => vivo(y))
    return `<div class="secciones"><details open><summary>Datos del trabajador</summary><form data-form="trabajador" data-id="${esc(t.id)}" class="form">${campos}<button class="primario">Guardar cambios</button></form></details>
    <details open><summary>Sueldo (historial)</summary><table class="tabla"><thead><tr><th>Vigente desde</th><th class="n">Sueldo básico</th><th>Motivo</th></tr></thead><tbody>
      ${viv(t.remuneraciones).map(([r]) => `<tr><td>${fecha(r.desde)}</td><td class="n">${s2(r.sueldo)}</td><td>${esc(r.motivo || '')}</td></tr>`).join('')}</tbody></table>
      <form data-form="sueldo" data-id="${esc(t.id)}" class="form"><label>Nuevo sueldo S/ <input type="number" name="sueldo" step="0.01" min="0" required></label>
        <label>Vigente desde <input type="date" name="desde" required></label><label class="ancho">Motivo <input name="motivo" placeholder="Aumento, ascenso, nueva RMV…"></label><button>Registrar cambio de sueldo</button></form>
      <p class="sub">Si cambia a mitad de mes, el sueldo del mes se pondera por días (R-06).</p></details>
    <details><summary>Conceptos fijos mensuales (${viv(t.fijos).length})</summary><table class="tabla"><thead><tr><th>Concepto</th><th class="n">Monto</th><th>Desde</th><th>Hasta</th><th></th></tr></thead><tbody>
      ${viv(t.fijos).map(([f, i]) => `<tr><td>${esc(nombreConcepto(f.concepto))}</td><td class="n">${s2(f.monto)}</td><td>${mesLargo(f.desde)}</td><td>${f.hasta ? mesLargo(f.hasta) : 'indefinido'}</td>
        <td>${f.hasta ? '' : `<button class="enlace" data-accion="terminarFijo" data-id="${esc(t.id)}" data-i="${i}">Terminar</button>`} <button class="enlace mal" data-accion="anularFijo" data-id="${esc(t.id)}" data-i="${i}">Anular</button></td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin conceptos fijos.</td></tr>'}</tbody></table>
      <form data-form="fijo" data-id="${esc(t.id)}" class="form"><label>Concepto <select name="concepto" required>${opciones(D.conceptos.filter((c) => c.manual && c.tipo === 'ingreso').map((c) => [c.codigo, c.nombre]), '', 'Elige')}</select></label>
        <label>Monto mensual S/ <input type="number" name="monto" step="0.01" min="0.01" required></label><label>Desde (mes) <input type="month" name="desde" required></label><button>Agregar</button></form></details>
    <details><summary>Rentas de quinta del año fuera del sistema (${viv(t.quinta_previa).length})</summary><table class="tabla"><thead><tr><th>Año</th><th class="n">Renta bruta</th><th class="n">Retención</th><th>Detalle</th><th></th></tr></thead><tbody>
      ${viv(t.quinta_previa).map(([q, i]) => `<tr><td>${q.anio}</td><td class="n">${s2(q.renta)}</td><td class="n">${s2(q.retencion)}</td><td>${esc(q.detalle || '')}</td><td><button class="enlace mal" data-accion="anularQuinta" data-id="${esc(t.id)}" data-i="${i}">Anular</button></td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin registros.</td></tr>'}</tbody></table>
      <form data-form="quinta" data-id="${esc(t.id)}" class="form"><label>Año <input type="number" name="anio" required value="${ui.periodo.slice(0, 4)}"></label><label>Renta bruta S/ <input type="number" name="renta" step="0.01" min="0" required></label>
        <label>Retención S/ <input type="number" name="retencion" step="0.01" min="0" required value="0"></label><label class="ancho">Detalle <input name="detalle" placeholder="Certificado de otro empleador, planillas previas…"></label><button>Agregar</button></form>
      <p class="sub">Para quien ingresó en el año o tenía meses fuera del sistema: lo percibido y retenido en el año (certificado de rentas). Cero si no tuvo (R-14, R-25).</p></details>
    <details><summary>Saldo inicial de vacaciones</summary><form data-form="saldoVac" data-id="${esc(t.id)}" class="form"><label>Al <input type="date" name="al" required value="${esc(t.saldo_vacaciones?.al || e.inicio_planilla)}"></label>
      <label>Días pendientes <input type="number" name="dias" step="0.5" min="0" required value="${t.saldo_vacaciones?.dias ?? 0}"></label><label class="ancho">Detalle <input name="detalle" value="${esc(t.saldo_vacaciones?.detalle || '')}"></label><button>Guardar saldo</button></form>
      <p class="sub">Días de vacaciones pendientes a esa fecha (de los años ya cumplidos), para quien ingresó antes de usar el sistema (R-20).</p></details>
    <details ${t.fecha_cese ? 'open' : ''}><summary>Cese</summary><form data-form="cese" data-id="${esc(t.id)}" class="form"><label>Fecha de cese <input type="date" name="fecha_cese" value="${esc(t.fecha_cese)}"></label>
      <label>Motivo <select name="motivo_cese">${opciones(D.motivosCese.map((m) => [m.codigo, m.nombre]), t.motivo_cese, '—')}</select></label>
      <button class="primario">${t.fecha_cese ? 'Actualizar cese' : 'Registrar cese'}</button>${t.fecha_cese ? ' <button type="button" data-accion="verLiquidacion" data-id="' + esc(t.id) + '">Ver liquidación</button>' : ''}</form>
      <p class="sub">Con el cese se calcula la liquidación (Liquidaciones). Para anular el cese, deja la fecha vacía y guarda.</p></details>
    <details><summary>Anular trabajador</summary><p class="sub">Solo para un registro hecho por error (no para un cese). Queda en el historial con su motivo.</p>
      <button class="mal" data-accion="anularTrabajador" data-id="${esc(t.id)}">Anular este registro</button></details></div>`
  }

  // ---------------------------------------------------------------- Acciones
  const pedirMotivo = (q) => { const m = prompt(q); if (m == null) return null; if (!m.trim()) { avisar('El motivo es obligatorio.', 'error'); return null } return m.trim() }
  const anularRegistro = (x, motivo) => { x.anulado = true; x.anulado_en = new Date().toISOString(); x.anulado_motivo = motivo }
  function descargar(nombre, contenido, tipo) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type: tipo })); a.download = nombre
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
  }
  const exportarJson = (sufijo = '') => descargar(`planilla-holdingd-respaldo-${new Date().toISOString().slice(0, 10)}${sufijo}.json`, JSON.stringify(estado, null, 1), 'application/json')
  function cargarXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX)
    return new Promise((ok, mal) => { const s = document.createElement('script'); s.src = XLSX_CDN; s.onload = () => ok(window.XLSX)
      s.onerror = () => mal(new Error('No se pudo cargar la librería para leer Excel (sin internet).')); document.head.appendChild(s) })
  }

  const ACCIONES = {
    tab: (d) => { ui.tab = d.tab; render() },
    sub: (d) => { ui.sub = d.sub; render() },
    semestre: (d) => { const k = d.tipo === 'cts' ? 'semCts' : 'semGrati'; ui[k] = F.sumarMeses(ui[k], Number(d.paso)); render() },
    cerrarModal: () => { ui.modal = null; renderModal() },
    verBoleta: (d) => { ui.modal = { tipo: 'boleta', id: d.id, periodo: ui.periodo }; renderModal() },
    verLiquidacion: (d) => { ui.modal = { tipo: 'liquidacion', id: d.id }; renderModal() },
    verVacaciones: (d) => { ui.modal = { tipo: 'vacaciones', id: d.id }; renderModal() },
    ficha: (d) => { ui.modal = { tipo: 'ficha', id: d.id }; renderModal() },
    nuevoTrabajador: () => { ui.modal = { tipo: 'ficha', id: null }; renderModal() },
    nuevoEmpleador: () => { ui.modal = { tipo: 'empleador' }; renderModal() },
    simular: () => { ui.modal = { tipo: 'simular' }; renderModal() },
    imprimirBoleta: () => imprimir(boletasImpresion([M.boleta(ui.modal.id, ui.modal.periodo)])),
    imprimirModal: () => imprimir($('#modal .modal-cuerpo .boleta').outerHTML),
    imprimirBoletas: () => imprimir(boletasImpresion(M.planilla(emp().id, ui.periodo).filas.map((f) => M.boleta(f.trabajador_id, ui.periodo)))),
    hojaCts: (d) => imprimir(htmlConstanciaCts(M.ctsSemestre(d.id, d.sem), trab(d.id), emp())),
    csvPlanilla: () => {
      const p = M.planilla(emp().id, ui.periodo), cols = ['apellidos_nombres', 'tipo_documento', 'numero_documento', 'codigo_externo', 'cargo', 'regimen', 'sistema_pension', 'afp',
        'cuspp', 'sueldo_basico', 'dias_sueldo', 'dias_no_pagados', 'dias_vacaciones', 'dias_subsidiados', 'ingresos', 'descuentos', 'neto', 'essalud', 'quinta', 'pension',
        'provision_gratificacion', 'provision_bonificacion', 'provision_cts', 'provision_vacaciones', 'costo_empresa']
      const conceptos = [...new Set(p.filas.flatMap((f) => M.boletaLineas(f.trabajador_id, ui.periodo).map((l) => l.concepto)))]
      const q = (v) => (v == null ? '' : typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`)
      const filas = [cols.concat(conceptos.map(nombreConcepto)).map(q).join(';')].concat(p.filas.map((f) => {
        const L = M.boletaLineas(f.trabajador_id, ui.periodo)
        return cols.map((c) => q(f[c])).concat(conceptos.map((c) => q(L.filter((l) => l.concepto === c).reduce((a, l) => a + l.monto, 0) || null))).join(';')
      }))
      descargar(`planilla-${emp().ruc}-${ui.periodo.slice(0, 7)}.csv`, '﻿' + filas.join('\r\n'), 'text/csv')
    },
    cerrar: () => {
      const e = emp()
      if (!confirm(`¿Cerrar la planilla de ${mesLargo(ui.periodo)}? Se emiten las boletas y las novedades del mes quedan bloqueadas.`)) return
      estado.cierres.push(M.cerrar(e.id, ui.periodo, 'usuario'))
      guardar(`Cerró la planilla de ${mesLargo(ui.periodo)} (${e.razon_social})`); avisar('Planilla cerrada: boletas emitidas.')
    },
    reabrir: () => {
      const ci = cierreDe(emp().id, ui.periodo), motivo = pedirMotivo(`Reabrir ${mesLargo(ui.periodo)} anula sus boletas emitidas. ¿Motivo?`)
      if (!motivo) return
      anularRegistro(ci, motivo); guardar(`Reabrió la planilla de ${mesLargo(ui.periodo)}: ${motivo}`)
    },
    anular: (d) => {
      const x = estado[d.col].find((y) => y.id === d.id), tid = x.trabajador_id
      exigirAbierto(empDeTrab(tid), x.desde || x.fecha || x.periodo, x.hasta || x.fecha || x.periodo)
      const motivo = pedirMotivo('Motivo de la anulación:'); if (!motivo) return
      anularRegistro(x, motivo); guardar(`Anuló ${d.col} de ${trab(tid)?.apellidos_nombres}: ${motivo}`)
    },
    anularRemype: (d) => { const motivo = pedirMotivo('Motivo de la anulación de la inscripción:'); if (!motivo) return; anularRegistro(emp().remype[Number(d.i)], motivo); guardar('Anuló una inscripción REMYPE: ' + motivo) },
    terminarFijo: (d) => {
      const t = trab(d.id), f = t.fijos[Number(d.i)], h = prompt('Último mes en que se paga (AAAA-MM):', ui.periodo.slice(0, 7))
      if (!h) return
      if (!/^\d{4}-\d{2}$/.test(h) || h + '-01' < f.desde) throw new Error('Mes inválido (AAAA-MM, no antes del inicio).')
      exigirAbierto(t.empleador_id, h + '-01'); f.hasta = h + '-01'; guardar(`Terminó ${f.concepto} de ${t.apellidos_nombres} en ${h}`)
    },
    anularFijo: (d) => { const t = trab(d.id), f = t.fijos[Number(d.i)]; exigirAbierto(t.empleador_id, f.desde, f.hasta || f.desde); const m = pedirMotivo('Motivo:'); if (!m) return; anularRegistro(f, m); guardar(`Anuló ${f.concepto} de ${t.apellidos_nombres}`) },
    anularQuinta: (d) => { const t = trab(d.id), m = pedirMotivo('Motivo:'); if (!m) return; anularRegistro(t.quinta_previa[Number(d.i)], m); guardar(`Anuló renta de quinta previa de ${t.apellidos_nombres}`) },
    anularTrabajador: (d) => {
      const t = trab(d.id)
      if (estado.cierres.some((c) => vivo(c) && c.boletas.some((b) => b.trabajador_id === t.id))) throw new Error('Tiene boletas emitidas: no se puede anular. Registra su cese.')
      const m = pedirMotivo(`¿Anular el registro de ${t.apellidos_nombres}? Motivo:`); if (!m) return
      anularRegistro(t, m); ui.modal = null; guardar(`Anuló el registro de ${t.apellidos_nombres}: ${m}`)
    },
    exportarJson: () => exportarJson(),
  }

  const num = (v) => (v === '' || v == null ? null : Number(v))
  const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim())
  const FORMS = {
    ausencia: (v) => {
      if (v.hasta < v.desde) throw new Error('"Hasta" no puede ser antes de "Desde".')
      const t = trab(v.trabajador_id)
      if (v.desde < t.fecha_ingreso || (t.fecha_cese && v.hasta > t.fecha_cese)) throw new Error('Las fechas deben estar dentro del vínculo laboral.')
      exigirAbierto(t.empleador_id, v.desde, v.hasta)
      const choque = estado.ausencias.find((a) => vivo(a) && a.trabajador_id === t.id && a.desde <= v.hasta && a.hasta >= v.desde)
      if (choque) throw new Error(`Se cruza con otra ausencia (${fecha(choque.desde)} – ${fecha(choque.hasta)}).`)
      estado.ausencias.push({ id: nuevoId(), trabajador_id: t.id, tipo: v.tipo, desde: v.desde, hasta: v.hasta, detalle: txt(v.detalle), origen: 'manual' })
      return `Registró ${v.tipo} de ${t.apellidos_nombres} (${fecha(v.desde)} – ${fecha(v.hasta)})`
    },
    asistencia: (v) => {
      const t = trab(v.trabajador_id); exigirAbierto(t.empleador_id, v.fecha)
      if (!(num(v.horas_extra) > 0 || v.feriado_trabajado || num(v.minutos_tardanza) > 0)) throw new Error('Indica horas extra, feriado trabajado o tardanza.')
      if (estado.asistencia.some((a) => vivo(a) && a.trabajador_id === t.id && a.fecha === v.fecha)) throw new Error('Ya hay un registro de ese día: anúlalo y vuelve a registrarlo.')
      estado.asistencia.push({ id: nuevoId(), trabajador_id: t.id, fecha: v.fecha, horas_extra: num(v.horas_extra) || 0, feriado_trabajado: !!v.feriado_trabajado,
        minutos_tardanza: num(v.minutos_tardanza) || 0, origen: 'manual' })
      return `Registró asistencia de ${t.apellidos_nombres} del ${fecha(v.fecha)}`
    },
    movimiento: (v) => {
      const t = trab(v.trabajador_id); exigirAbierto(t.empleador_id, ui.periodo)
      estado.movimientos.push({ id: nuevoId(), trabajador_id: t.id, periodo: ui.periodo, concepto: v.concepto, monto: num(v.monto), detalle: txt(v.detalle), origen: 'manual' })
      return `Registró ${v.concepto} S/ ${s2(num(v.monto))} de ${t.apellidos_nombres} en ${mesLargo(ui.periodo)}`
    },
    trabajador: (v, ds) => {
      const datos = { apellidos_nombres: txt(v.apellidos_nombres)?.toUpperCase(), tipo_documento: v.tipo_documento, numero_documento: txt(v.numero_documento),
        codigo_externo: txt(v.codigo_externo), cargo: txt(v.cargo), fecha_nacimiento: txt(v.fecha_nacimiento), fecha_fin_contrato: txt(v.fecha_fin_contrato),
        periodo_prueba_meses: num(v.periodo_prueba_meses) ?? 3, regimen_pactado: txt(v.regimen_pactado), sistema_pension: v.sistema_pension,
        afp: v.sistema_pension === 'afp' ? txt(v.afp) : null, comision_afp: v.sistema_pension === 'afp' ? txt(v.comision_afp) : null, cuspp: v.sistema_pension === 'afp' ? txt(v.cuspp) : null,
        salud: v.salud, jornada_horas: num(v.jornada_horas) || 8, asignacion_familiar: !!v.asignacion_familiar, domiciliado: !!v.domiciliado,
        banco: txt(v.banco), cuenta_sueldo: txt(v.cuenta_sueldo), banco_cts: txt(v.banco_cts), cuenta_cts: txt(v.cuenta_cts), correo: txt(v.correo) }
      if (datos.sistema_pension === 'afp' && (!datos.afp || !datos.comision_afp)) throw new Error('Para AFP indica la AFP y el tipo de comisión.')
      const e = emp()
      const dup = estado.trabajadores.find((t) => vivo(t) && t.id !== ds.id && String(t.empleador_id) === String(e.id) && t.tipo_documento === datos.tipo_documento
        && t.numero_documento === datos.numero_documento && (!t.fecha_cese || t.fecha_cese >= (ds.id ? trab(ds.id).fecha_ingreso : v.fecha_ingreso)))
      if (dup) throw new Error(`Ya existe un vínculo vigente con ese documento (${dup.apellidos_nombres}).`)
      if (datos.codigo_externo && estado.trabajadores.some((t) => vivo(t) && t.id !== ds.id && String(t.empleador_id) === String(e.id) && t.codigo_externo === datos.codigo_externo))
        throw new Error('Ese código del ERP ya está asignado a otro trabajador.')
      if (ds.id) { Object.assign(trab(ds.id), datos); return `Actualizó la ficha de ${datos.apellidos_nombres}` }
      if (v.fecha_ingreso < e.inicio_planilla) { /* necesita saldo de vacaciones y quinta previa: lo avisa la planilla (R-25) */ }
      exigirAbierto(e.id, v.fecha_ingreso)
      const t = { id: nuevoId(), empleador_id: e.id, ...datos, fecha_ingreso: v.fecha_ingreso, fecha_cese: null, motivo_cese: null,
        remuneraciones: [{ desde: v.fecha_ingreso, sueldo: num(v.sueldo), motivo: 'Ingreso' }], fijos: [], quinta_previa: [], saldo_vacaciones: null }
      estado.trabajadores.push(t); ui.modal = { tipo: 'ficha', id: t.id }
      return `Registró a ${t.apellidos_nombres}`
    },
    sueldo: (v, ds) => {
      const t = trab(ds.id)
      if (v.desde < t.fecha_ingreso) throw new Error('El cambio no puede ser antes del ingreso.')
      exigirAbierto(t.empleador_id, v.desde)
      if (t.remuneraciones.some((r) => vivo(r) && r.desde === v.desde)) throw new Error('Ya hay un sueldo con esa fecha.')
      t.remuneraciones.push({ desde: v.desde, sueldo: num(v.sueldo), motivo: txt(v.motivo) })
      return `Cambio de sueldo de ${t.apellidos_nombres}: S/ ${s2(num(v.sueldo))} desde ${fecha(v.desde)}`
    },
    fijo: (v, ds) => {
      const t = trab(ds.id), desde = v.desde + '-01'; exigirAbierto(t.empleador_id, desde)
      t.fijos.push({ concepto: v.concepto, monto: num(v.monto), desde, hasta: null }); return `Agregó ${v.concepto} fijo a ${t.apellidos_nombres}`
    },
    quinta: (v, ds) => { const t = trab(ds.id); t.quinta_previa.push({ anio: Number(v.anio), renta: num(v.renta), retencion: num(v.retencion), detalle: txt(v.detalle) }); return `Registró renta de quinta previa de ${t.apellidos_nombres}` },
    saldoVac: (v, ds) => { const t = trab(ds.id); t.saldo_vacaciones = { al: v.al, dias: num(v.dias), detalle: txt(v.detalle) }; return `Registró saldo de vacaciones de ${t.apellidos_nombres}: ${v.dias} días` },
    cese: (v, ds) => {
      const t = trab(ds.id), f = txt(v.fecha_cese)
      if (f && !v.motivo_cese) throw new Error('Indica el motivo del cese.')
      if (f && f < t.fecha_ingreso) throw new Error('El cese no puede ser antes del ingreso.')
      if (t.fecha_cese) exigirAbierto(t.empleador_id, t.fecha_cese)
      if (f) exigirAbierto(t.empleador_id, f)
      t.fecha_cese = f; t.motivo_cese = f ? v.motivo_cese : null
      return f ? `Registró el cese de ${t.apellidos_nombres} al ${fecha(f)}` : `Anuló el cese de ${t.apellidos_nombres}`
    },
    tasas: (v) => {
      const per = ui.periodo; if (cierreDe(emp()?.id, per)) throw new Error('El mes está cerrado.')
      const nuevas = D.afps.map((a) => {
        const g = (k) => num(v[`${a.codigo}.${k}`])
        return { periodo: per, afp: a.codigo, aporte: g('aporte') / 100, prima: g('prima') / 100, comision_flujo: g('comision_flujo') / 100, comision_mixta: g('comision_mixta') / 100,
          comision_saldo: g('comision_saldo') == null ? null : g('comision_saldo') / 100, remuneracion_maxima: g('remuneracion_maxima'), fuente: 'manual', sustento: txt(v.sustento),
          registrado_en: new Date().toISOString() }
      })
      if (nuevas.some((t) => !(t.aporte > 0) || !(t.remuneracion_maxima > 0))) throw new Error('Revisa las tasas: aporte y remuneración máxima son obligatorios.')
      if (nuevas.some((t) => t.aporte > 0.2 || t.prima > 0.05 || t.comision_flujo > 0.05)) throw new Error('Las tasas parecen fuera de rango: se ingresan en % (ej.: 10, 1.37, 1.55).')
      estado.parametros.tasas_afp = estado.parametros.tasas_afp.filter((t) => t.periodo !== per).concat(nuevas)
      return `Registró las tasas AFP de ${mesLargo(per)} (${txt(v.sustento)})`
    },
    legal: (v) => {
      const valor = D.parametrosPorcentaje.includes(v.parametro) ? num(v.valor) / 100 : num(v.valor)
      if (estado.parametros.legales.some((l) => l.parametro === v.parametro && l.desde === v.desde)) throw new Error('Ya hay un valor con esa fecha.')
      estado.parametros.legales.push({ parametro: v.parametro, desde: v.desde, valor, norma: txt(v.norma) })
      return `Agregó ${D.nombresParametro[v.parametro]} = ${v.valor} desde ${fecha(v.desde)}`
    },
    empleador: (v, ds) => {
      const e = estado.empleadores.find((x) => String(x.id) === String(ds.id)), ini = v.inicio_planilla + '-01'
      if (estado.empleadores.some((x) => vivo(x) && x !== e && x.ruc === v.ruc)) throw new Error('Ya hay otro empleador con ese RUC.')
      if (ini !== e.inicio_planilla && estado.cierres.some((c) => vivo(c) && String(c.empleador_id) === String(e.id))) throw new Error('Ya hay planillas cerradas: el inicio no se cambia.')
      Object.assign(e, { razon_social: txt(v.razon_social), ruc: v.ruc, direccion: txt(v.direccion), inicio_planilla: ini, dias_laborables_semana: Number(v.dias_laborables_semana),
        descuento_dominical: !!v.descuento_dominical })
      return `Actualizó el empleador ${e.razon_social}`
    },
    remype: (v) => { const e = emp(); (e.remype ||= []).push({ categoria: v.categoria, desde: v.desde, hasta: txt(v.hasta), constancia: txt(v.constancia) }); return `Agregó inscripción REMYPE de ${e.razon_social}` },
    nuevoEmpleador: (v) => {
      if (estado.empleadores.some((x) => vivo(x) && x.ruc === v.ruc)) throw new Error('Ya hay un empleador con ese RUC.')
      const e = { id: nuevoId(), razon_social: txt(v.razon_social), ruc: v.ruc, direccion: txt(v.direccion), inicio_planilla: v.inicio_planilla + '-01',
        dias_laborables_semana: Number(v.dias_laborables_semana), descuento_dominical: !!v.descuento_dominical,
        remype: v.remype_categoria && v.remype_desde ? [{ categoria: v.remype_categoria, desde: v.remype_desde, hasta: null, constancia: null }] : [] }
      estado.empleadores.push(e); ui.empleador = e.id; ui.periodo = null; ui.modal = null
      return `Registró el empleador ${e.razon_social}`
    },
    simular: (v) => { ui.modal = { tipo: 'simular', tid: v.tid, cese: v.cese, motivo: v.motivo }; renderModal(); return null },
    excel: async (v) => {
      const XLSX = await cargarXlsx()
      const libro = XLSX.read(await v.archivo.arrayBuffer(), { cellDates: true })
      const imp = IMP.importarLibro(libro, { ingresoMinimo: txt(v.ingreso_minimo), nuevoId })
      estado = completar(IMP.agregarAlEstado(estado, imp))
      ui.empleador = imp.empleador.id; ui.periodo = imp.resumen.periodo; ui.tab = 'planilla'
      avisar(`${imp.resumen.razon_social}: ${imp.resumen.trabajadores} trabajadores cargados de ${mesLargo(imp.resumen.periodo)}${imp.resumen.tasas ? ', con tasas AFP del mes' : ''}.`)
      return `Cargó el Excel de ${imp.resumen.razon_social} (${imp.resumen.hoja})`
    },
    json: async (v) => {
      const nuevo = JSON.parse(await v.archivo.text())
      if (!Array.isArray(nuevo.trabajadores) || !Array.isArray(nuevo.empleadores)) throw new Error('El archivo no es un respaldo del Sistema de Planilla.')
      if (estado.empleadores.length && !confirm('Se reemplazarán los datos de este navegador por los del respaldo. Antes se descargará un respaldo de lo actual. ¿Continuar?')) return null
      if (estado.empleadores.length) exportarJson('-antes-de-restaurar')
      estado = completar(nuevo); ui.empleador = null; ui.periodo = null
      return 'Restauró un respaldo'
    },
  }

  // ---------------------------------------------------------------- Eventos
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-accion]'); if (!b) return
    ev.preventDefault()
    try { ACCIONES[b.dataset.accion](b.dataset) } catch (err) { avisar(err.message, 'error') }
  })
  document.addEventListener('submit', async (ev) => {
    const f = ev.target.closest('form[data-form]'); if (!f) return
    ev.preventDefault()
    const fd = new FormData(f), v = {}
    for (const [k, x] of fd.entries()) v[k] = x
    try {
      const accion = await FORMS[f.dataset.form](v, f.dataset)
      if (accion) { guardar(accion); if (!['excel', 'json', 'simular'].includes(f.dataset.form)) avisar('Guardado.') }
    } catch (err) { console.error(err); avisar(err.message, 'error') }
  })
  $('#selEmpleador').addEventListener('change', (ev) => { ui.empleador = ev.target.value; ui.periodo = null; render() })
  $('#selPeriodo').addEventListener('change', (ev) => { if (ev.target.value) { ui.periodo = ev.target.value + '-01'; ui.semGrati = null; ui.semCts = null; render() } })
  $('#mesAnt').addEventListener('click', () => { ui.periodo = F.sumarMeses(ui.periodo, -1); ui.semGrati = ui.semCts = null; render() })
  $('#mesSig').addEventListener('click', () => { ui.periodo = F.sumarMeses(ui.periodo, 1); ui.semGrati = ui.semCts = null; render() })
  $('#modal').addEventListener('close', () => { ui.modal = null })
  window.addEventListener('afterprint', () => { $('#impresion').innerHTML = '' })
  render()
})()
