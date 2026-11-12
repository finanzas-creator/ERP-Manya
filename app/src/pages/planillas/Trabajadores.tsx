import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, okONulo, supabase } from '../../lib/supabase'
import { fecha, hoyISO, mesActual, mesLargo } from '../../lib/formato'
import { ENUMS, type Fila } from '../../lib/db'
import { ESTADOS } from '../../lib/estados'
import { Boton, Campo, Card, Estado, Input, MensajeError, Modal, Nota, Panel, Renglon, Select, Tabla } from '../../components/ui'
import { Icono } from '../../components/iconos'
import { PENSION, SALUD, s2, useAfps, useConceptos, useMotivosCese, useTrabajadores } from './comun'
import { AnularPlanilla } from './Novedades'

type T = Fila<'v_trabajador'>

/** Trabajadores del empleador: datos, sueldo con vigencia, fijos, vacaciones, quinta previa y cese. */
export default function Trabajadores({ empleador }: { empleador: number }) {
  const { data } = useTrabajadores(empleador)
  const [ver, setVer] = useState<string | null>(null)
  const [editar, setEditar] = useState<T | 'nuevo' | null>(null)
  const [filtro, setFiltro] = useState<'activo' | 'todos'>('activo')
  const filas = (data ?? []).filter((t) => filtro === 'todos' || t.estado === 'activo')
  const elegido = data?.find((t) => t.id === ver)
  return (
    <Card titulo={<>Trabajadores <span className="font-normal text-t3">· {filas.length}</span></>} accion={<div className="flex gap-2">
      <Select value={filtro} onChange={(e) => setFiltro(e.target.value as 'activo')} aria-label="Filtro">
        <option value="activo">Activos</option><option value="todos">Todos (con cesados)</option>
      </Select>
      <Boton onClick={() => setEditar('nuevo')}><Icono nombre="mas" />Agregar</Boton>
    </div>}>
      <Tabla filas={filas} clave={(t) => t.id!} onFila={(t) => setVer(t.id!)} vacio="Sin trabajadores" columnas={[
        { titulo: 'Trabajador', celda: (t) => <><div className="font-medium">{t.apellidos_nombres}</div><div className="text-xs text-t3">{t.tipo_documento} {t.numero_documento}</div></> },
        { titulo: 'Cargo', celda: (t) => <span className="text-t2">{t.cargo}</span> },
        { titulo: 'Ingreso', celda: (t) => fecha(t.fecha_ingreso) },
        { titulo: 'Régimen', celda: (t) => <Estado valor={t.regimen} /> },
        { titulo: 'Pensión', celda: (t) => t.sistema_pension === 'afp' ? `${t.afp} (${t.comision_afp})` : PENSION[t.sistema_pension ?? ''] },
        { titulo: 'Sueldo (S/)', derecha: true, celda: (t) => s2(t.sueldo_basico) },
        { titulo: 'Estado', celda: (t) => t.estado === 'cesado' ? <Estado valor="cesado" /> : t.fecha_cese ? <span className="text-xs text-warning">Cesa {fecha(t.fecha_cese)}</span> : <Estado valor="activo" /> },
      ]} />
      <Nota>El régimen se calcula: el pactado o, si no hay, el del REMYPE del empleador cuando el trabajador ingresó después de la inscripción; si no, general (R-100). Cuando se integre el ERP de control de personal, sus datos llegan aquí por el código externo.</Nota>
      {elegido && <Ficha t={elegido} onCerrar={() => setVer(null)} onEditar={() => setEditar(elegido)} />}
      {editar && <TrabajadorModal empleador={empleador} t={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
    </Card>
  )
}

function Ficha({ t, onCerrar, onEditar }: { t: T; onCerrar: () => void; onEditar: () => void }) {
  const id = t.id!
  const [modal, setModal] = useState<'sueldo' | 'fijo' | 'cese' | 'saldo' | 'quinta' | null>(null)
  const [anular, setAnular] = useState<{ tabla: string; id: string; titulo: string } | null>(null)
  const sueldos = useQuery({ queryKey: ['pl_sueldos', id], queryFn: async () => ok(await supabase.from('remuneracion').select('*').eq('trabajador_id', id).is('anulado_en', null).order('vigente_desde', { ascending: false })) })
  const fijos = useQuery({ queryKey: ['pl_fijos', id], queryFn: async () => ok(await supabase.from('v_concepto_fijo').select('*').eq('trabajador_id', id).order('desde')) })
  const vac = useQuery({ queryKey: ['pl_vac', id], queryFn: async () => okONulo(await supabase.from('v_vacaciones').select('*').eq('trabajador_id', id).maybeSingle()) })
  const periodos = useQuery({ queryKey: ['pl_vac_periodos', id], queryFn: async () => ok(await supabase.from('v_vacacion_periodo').select('*').eq('trabajador_id', id).order('periodo')) })
  const saldo = useQuery({ queryKey: ['pl_saldo_vac', id], queryFn: async () => okONulo(await supabase.from('saldo_vacaciones_inicial').select('*').eq('trabajador_id', id).maybeSingle()) })
  const quinta = useQuery({ queryKey: ['pl_quinta_previa', id], queryFn: async () => ok(await supabase.from('quinta_previa').select('*').eq('trabajador_id', id).is('anulado_en', null).order('anio')) })
  const v = vac.data
  return (
    <Panel titulo={t.apellidos_nombres} subtitulo={`${t.tipo_documento} ${t.numero_documento}`} onCerrar={onCerrar}>
      <div className="flex flex-wrap gap-2"><Estado valor={t.regimen} /><Estado valor={t.estado} /></div>
      <div className="mt-3">
        <Renglon label="Cargo" valor={t.cargo ?? '—'} />
        <Renglon label="Ingreso" valor={fecha(t.fecha_ingreso)} />
        {t.fecha_cese && <Renglon label="Cese" valor={`${fecha(t.fecha_cese)} · ${t.motivo_cese_nombre}`} />}
        <Renglon label="Pensión" valor={t.sistema_pension === 'afp' ? `${t.afp} · ${t.comision_afp} · CUSPP ${t.cuspp ?? '—'}` : PENSION[t.sistema_pension ?? '']} />
        <Renglon label="Salud" valor={SALUD[t.salud ?? '']} />
        <Renglon label="Asignación familiar" valor={t.asignacion_familiar ? 'Sí' : 'No'} />
        <Renglon label="Jornada diaria" valor={`${Number(t.jornada_horas)} h`} />
        {t.regimen_pactado && <Renglon label="Régimen pactado" valor={ESTADOS[t.regimen_pactado]?.label} />}
        {t.fecha_fin_contrato && <Renglon label="Fin de contrato" valor={fecha(t.fecha_fin_contrato)} />}
        <Renglon label="Cuenta sueldo" valor={[t.banco, t.cuenta_sueldo].filter(Boolean).join(' ') || '—'} />
        <Renglon label="Cuenta CTS" valor={[t.banco_cts, t.cuenta_cts].filter(Boolean).join(' ') || '—'} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Boton onClick={onEditar}>Editar datos</Boton>
        {!t.fecha_cese && <Boton variante="peligro" onClick={() => setModal('cese')}>Registrar cese</Boton>}
      </div>

      <Seccion titulo="Sueldo básico" accion={<Boton onClick={() => setModal('sueldo')}><Icono nombre="mas" />Nuevo sueldo</Boton>}>
        {sueldos.data?.map((s) => <Renglon key={s.id} label={`Desde ${fecha(s.vigente_desde)}${s.motivo ? ` · ${s.motivo}` : ''}`} valor={`S/ ${s2(s.sueldo_basico)}`} />)}
        {sueldos.data?.length === 0 && <p className="text-sm text-critical">Sin sueldo registrado: la planilla no se puede cerrar.</p>}
      </Seccion>

      <Seccion titulo="Conceptos fijos mensuales" accion={<Boton onClick={() => setModal('fijo')}><Icono nombre="mas" />Agregar</Boton>}>
        {fijos.data?.map((f) => (
          <div key={f.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span>{f.concepto_nombre} <span className="text-xs text-t3">{mesLargo(f.desde!)}{f.hasta ? ` – ${mesLargo(f.hasta)}` : ' en adelante'}</span></span>
            <span className="flex items-center gap-1"><span className="num">S/ {s2(f.monto)}</span>
              <Boton variante="fantasma" aria-label="Anular" onClick={() => setAnular({ tabla: 'concepto_fijo', id: f.id!, titulo: `Anular ${f.concepto_nombre}` })}><Icono nombre="cerrar" /></Boton></span>
          </div>
        ))}
        {fijos.data?.length === 0 && <p className="text-sm text-t3">Ninguno.</p>}
      </Seccion>

      <Seccion titulo={`Vacaciones${v ? ` al ${fecha(v.corte)}` : ''}`} accion={<Boton onClick={() => setModal('saldo')}>{saldo.data ? 'Saldo inicial' : 'Registrar saldo inicial'}</Boton>}>
        {v && <>
          <Renglon label="Ganadas (años completos)" valor={`${Number(v.dias_ganados)} días`} />
          <Renglon label="Gozadas" valor={`${Number(v.dias_gozados)} días`} />
          <Renglon label="Pendientes" valor={`${Number(v.dias_pendientes)} días`} tono={Number(v.dias_pendientes) > 0 ? 'warning' : undefined} />
          {Number(v.dias_vencidos) > 0 && <Renglon label="Vencidas (indemnizables)" valor={`${Number(v.dias_vencidos)} días`} tono="critical" />}
          {Number(v.dias_adelantados) > 0 && <Renglon label="Adelantadas" valor={`${Number(v.dias_adelantados)} días`} />}
          <Renglon label="Truncas (año en curso)" valor={`${Number(v.dias_trunca)} días`} />
        </>}
        {periodos.data && periodos.data.length > 0 && (
          <details className="mt-2 text-sm"><summary className="cursor-pointer text-t2">Por periodo</summary>
            {periodos.data.map((p) => <Renglon key={p.periodo} sangria label={`${fecha(p.inicio)} – ${fecha(p.fin)} · vence ${fecha(p.vence)}`}
              valor={`${Number(p.gozados)}/${Number(p.ganados)}${p.vencido ? ' · vencido' : ''}`} tono={p.vencido ? 'critical' : undefined} />)}
          </details>
        )}
        <p className="mt-1 text-xs text-t3">{saldo.data ? `Saldo inicial: ${Number(saldo.data.dias_pendientes)} días al ${fecha(saldo.data.al)}.` : 'Si ingresó antes de usar el sistema, registra cuántos días tenía pendientes (R-119).'} Las vacaciones gozadas se registran en Novedades.</p>
      </Seccion>

      <Seccion titulo="Quinta: rentas de otros empleadores" accion={<Boton onClick={() => setModal('quinta')}><Icono nombre="mas" />Agregar</Boton>}>
        {quinta.data?.map((q) => (
          <div key={q.id} className="flex items-center justify-between gap-2 py-1 text-sm">
            <span>{q.anio}{q.detalle ? ` · ${q.detalle}` : ''}</span>
            <span className="flex items-center gap-1 num">renta {s2(q.renta_bruta)} · ret. {s2(q.retencion)}
              <Boton variante="fantasma" aria-label="Anular" onClick={() => setAnular({ tabla: 'quinta_previa', id: q.id, titulo: 'Anular renta previa' })}><Icono nombre="cerrar" /></Boton></span>
          </div>
        ))}
        {quinta.data?.length === 0 && <p className="text-sm text-t3">Ninguna (certificado de rentas y retenciones del año).</p>}
      </Seccion>

      {modal === 'sueldo' && <SueldoModal t={t} onCerrar={() => setModal(null)} />}
      {modal === 'fijo' && <FijoModal t={t} onCerrar={() => setModal(null)} />}
      {modal === 'cese' && <CeseModal t={t} onCerrar={() => setModal(null)} />}
      {modal === 'saldo' && <SaldoVacacionesModal t={t} actual={saldo.data} onCerrar={() => setModal(null)} />}
      {modal === 'quinta' && <QuintaPreviaModal t={t} onCerrar={() => setModal(null)} />}
      {anular && <AnularPlanilla {...anular} onCerrar={() => setAnular(null)} />}
    </Panel>
  )
}

function Seccion({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-line pt-3">
      <div className="mb-1 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{titulo}</h3>{accion}</div>
      {children}
    </section>
  )
}

function useGuardar(fn: () => Promise<unknown>, onCerrar: () => void) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries(); onCerrar() } })
}

function Botones({ onCerrar, m }: { onCerrar: () => void; m: { isPending: boolean; error: unknown; mutate: () => void } }) {
  return <>
    <div className="mt-3"><MensajeError error={m.error} /></div>
    <div className="mt-4 flex justify-end gap-2">
      <Boton onClick={onCerrar}>Cancelar</Boton>
      <Boton variante="primario" disabled={m.isPending} onClick={() => m.mutate()}>Guardar</Boton>
    </div>
  </>
}

function TrabajadorModal({ empleador, t, onCerrar }: { empleador: number; t: T | null; onCerrar: () => void }) {
  const afps = useAfps()
  const [f, setF] = useState({
    tipo_documento: t?.tipo_documento ?? 'DNI', numero_documento: t?.numero_documento ?? '', apellidos_nombres: t?.apellidos_nombres ?? '',
    fecha_nacimiento: t?.fecha_nacimiento ?? '', cargo: t?.cargo ?? '', fecha_ingreso: t?.fecha_ingreso ?? hoyISO(),
    fecha_fin_contrato: t?.fecha_fin_contrato ?? '', sistema_pension: t?.sistema_pension ?? 'onp', afp_id: t?.afp_id ? String(t.afp_id) : '',
    comision_afp: t?.comision_afp ?? 'mixta', cuspp: t?.cuspp ?? '', asignacion_familiar: t?.asignacion_familiar ?? false,
    salud: t?.salud ?? 'essalud', jornada_horas: t?.jornada_horas != null ? String(t.jornada_horas) : '8',
    regimen_pactado: t?.regimen_pactado ?? '', banco: t?.banco ?? '', cuenta_sueldo: t?.cuenta_sueldo ?? '',
    banco_cts: t?.banco_cts ?? '', cuenta_cts: t?.cuenta_cts ?? '', correo: t?.correo ?? '', codigo_externo: t?.codigo_externo ?? '',
    sueldo: '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const m = useGuardar(async () => {
    if (!f.apellidos_nombres.trim() || !f.numero_documento.trim()) throw new Error('Completa nombres y documento')
    const afp = f.sistema_pension === 'afp'
    if (afp && !f.afp_id) throw new Error('Elige la AFP')
    const datos = {
      empleador_id: empleador, tipo_documento: f.tipo_documento as T['tipo_documento'] & string, numero_documento: f.numero_documento.trim(),
      apellidos_nombres: f.apellidos_nombres.trim().toUpperCase(), fecha_nacimiento: f.fecha_nacimiento || null, cargo: f.cargo.trim() || null,
      fecha_ingreso: f.fecha_ingreso, fecha_fin_contrato: f.fecha_fin_contrato || null,
      sistema_pension: f.sistema_pension as 'onp', afp_id: afp ? Number(f.afp_id) : null, comision_afp: afp ? f.comision_afp as 'mixta' : null,
      cuspp: afp ? f.cuspp.trim() || null : null, asignacion_familiar: f.asignacion_familiar, salud: f.salud as 'essalud',
      jornada_horas: Number(f.jornada_horas), regimen_pactado: (f.regimen_pactado || null) as 'general' | null,
      banco: f.banco || null, cuenta_sueldo: f.cuenta_sueldo || null, banco_cts: f.banco_cts || null, cuenta_cts: f.cuenta_cts || null,
      correo: f.correo || null, codigo_externo: f.codigo_externo || null,
    }
    if (t) { ok(await supabase.from('trabajador').update(datos).eq('id', t.id!)); return }
    if (!(Number(f.sueldo) > 0)) throw new Error('Indica el sueldo básico')
    const nuevo = ok(await supabase.from('trabajador').insert(datos).select('id').single())
    ok(await supabase.from('remuneracion').insert({ trabajador_id: nuevo.id, vigente_desde: f.fecha_ingreso, sueldo_basico: Number(f.sueldo), motivo: 'Ingreso' }))
  }, onCerrar)
  return (
    <Modal titulo={t ? `Editar · ${t.apellidos_nombres}` : 'Agregar trabajador'} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Apellidos y nombres"><Input value={f.apellidos_nombres} onChange={set('apellidos_nombres')} autoFocus /></Campo></div>
        <Campo label="Tipo de documento"><Select value={f.tipo_documento} onChange={set('tipo_documento')}>{ENUMS.tipo_documento.filter((d) => d !== 'RUC' && d !== 'SIN_DOCUMENTO').map((d) => <option key={d}>{d}</option>)}</Select></Campo>
        <Campo label="Número"><Input value={f.numero_documento} onChange={set('numero_documento')} /></Campo>
        <Campo label="Cargo"><Input value={f.cargo} onChange={set('cargo')} /></Campo>
        <Campo label="Fecha de nacimiento" ayuda="Sin prima AFP desde los 65"><Input type="date" value={f.fecha_nacimiento} onChange={set('fecha_nacimiento')} /></Campo>
        <Campo label="Fecha de ingreso"><Input type="date" value={f.fecha_ingreso} onChange={set('fecha_ingreso')} /></Campo>
        <Campo label="Fin de contrato" ayuda="Vacío = plazo indeterminado"><Input type="date" value={f.fecha_fin_contrato} onChange={set('fecha_fin_contrato')} /></Campo>
        {!t && <Campo label="Sueldo básico (S/)"><Input type="number" step="0.01" value={f.sueldo} onChange={set('sueldo')} /></Campo>}
        <Campo label="Jornada diaria (horas)"><Input type="number" step="0.5" min="1" max="8" value={f.jornada_horas} onChange={set('jornada_horas')} /></Campo>
        <Campo label="Sistema de pensión"><Select value={f.sistema_pension} onChange={set('sistema_pension')}>{ENUMS.sistema_pension.map((p) => <option key={p} value={p}>{PENSION[p]}</option>)}</Select></Campo>
        {f.sistema_pension === 'afp' && <>
          <Campo label="AFP"><Select value={f.afp_id} onChange={set('afp_id')}><option value="">Elige…</option>{afps.data?.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</Select></Campo>
          <Campo label="Comisión"><Select value={f.comision_afp} onChange={set('comision_afp')}><option value="mixta">Mixta</option><option value="flujo">Flujo</option></Select></Campo>
          <Campo label="CUSPP"><Input value={f.cuspp} onChange={set('cuspp')} /></Campo>
        </>}
        <Campo label="Salud"><Select value={f.salud} onChange={set('salud')}>{ENUMS.sistema_salud.map((s) => <option key={s} value={s}>{SALUD[s]}</option>)}</Select></Campo>
        <Campo label="Régimen pactado" ayuda="Vacío = según REMYPE"><Select value={f.regimen_pactado} onChange={set('regimen_pactado')}>
          <option value="">Según REMYPE e ingreso</option>{ENUMS.regimen_laboral.map((r) => <option key={r} value={r}>{ESTADOS[r]?.label}</option>)}</Select></Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={f.asignacion_familiar} onChange={(e) => setF({ ...f, asignacion_familiar: e.target.checked })} />
          Recibe asignación familiar (10% de la RMV) — en MYPE solo si corresponde o se pactó
        </label>
        <Campo label="Banco (sueldo)"><Input value={f.banco} onChange={set('banco')} /></Campo>
        <Campo label="Cuenta sueldo"><Input value={f.cuenta_sueldo} onChange={set('cuenta_sueldo')} /></Campo>
        <Campo label="Banco (CTS)"><Input value={f.banco_cts} onChange={set('banco_cts')} /></Campo>
        <Campo label="Cuenta CTS"><Input value={f.cuenta_cts} onChange={set('cuenta_cts')} /></Campo>
        <Campo label="Correo (boletas)"><Input type="email" value={f.correo} onChange={set('correo')} /></Campo>
        <Campo label="Código en el ERP de personal"><Input value={f.codigo_externo} onChange={set('codigo_externo')} /></Campo>
      </div>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

function SueldoModal({ t, onCerrar }: { t: T; onCerrar: () => void }) {
  const [f, setF] = useState({ desde: mesActual(), monto: '', motivo: '' })
  const m = useGuardar(async () => {
    if (!(Number(f.monto) > 0)) throw new Error('Indica el nuevo sueldo')
    ok(await supabase.from('remuneracion').insert({ trabajador_id: t.id!, vigente_desde: f.desde, sueldo_basico: Number(f.monto), motivo: f.motivo || null }))
  }, onCerrar)
  return (
    <Modal titulo={`Nuevo sueldo · ${t.apellidos_nombres}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Vigente desde"><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo label="Sueldo básico (S/)"><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} autoFocus /></Campo>
        <div className="sm:col-span-2"><Campo label="Motivo"><Input value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} /></Campo></div>
      </div>
      <p className="mt-2 text-xs text-t3">El sueldo de cada mes es el vigente al final del mes; los beneficios usan el vigente a su fecha de cálculo.</p>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

function FijoModal({ t, onCerrar }: { t: T; onCerrar: () => void }) {
  const conceptos = useConceptos()
  const [f, setF] = useState({ concepto: '', monto: '', desde: mesActual(), hasta: '' })
  const m = useGuardar(async () => {
    if (!f.concepto || !(Number(f.monto) > 0)) throw new Error('Elige el concepto y el monto')
    ok(await supabase.from('concepto_fijo').insert({ trabajador_id: t.id!, concepto: f.concepto, monto: Number(f.monto),
      desde: f.desde.slice(0, 7) + '-01', hasta: f.hasta ? f.hasta.slice(0, 7) + '-01' : null }))
  }, onCerrar)
  return (
    <Modal titulo={`Concepto fijo · ${t.apellidos_nombres}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Concepto"><Select value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })}>
          <option value="">Elige…</option>{conceptos.data?.filter((c) => c.manual && c.tipo === 'ingreso').map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</Select></Campo></div>
        <Campo label="Monto mensual (S/)"><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></Campo>
        <div />
        <Campo label="Desde (mes)"><Input type="month" value={f.desde.slice(0, 7)} onChange={(e) => setF({ ...f, desde: e.target.value + '-01' })} /></Campo>
        <Campo label="Hasta (mes, opcional)"><Input type="month" value={f.hasta.slice(0, 7)} onChange={(e) => setF({ ...f, hasta: e.target.value ? e.target.value + '-01' : '' })} /></Campo>
      </div>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

function CeseModal({ t, onCerrar }: { t: T; onCerrar: () => void }) {
  const motivos = useMotivosCese()
  const [f, setF] = useState({ fecha: hoyISO(), motivo: '' })
  const m = useGuardar(async () => {
    if (!f.motivo) throw new Error('Elige el motivo de cese')
    ok(await supabase.from('trabajador').update({ fecha_cese: f.fecha, motivo_cese: f.motivo }).eq('id', t.id!))
  }, onCerrar)
  return (
    <Modal titulo={`Cese · ${t.apellidos_nombres}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Último día laborado"><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo label="Motivo"><Select value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })}>
          <option value="">Elige…</option>{motivos.data?.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre}{x.indemniza ? ' (indemniza)' : ''}</option>)}</Select></Campo>
      </div>
      <p className="mt-2 text-xs text-t3">La liquidación (CTS, gratificación y vacaciones truncas, indemnizaciones) se calcula sola en Liquidaciones. Plazo de pago: 48 horas. La remuneración de los días del mes va en la planilla de ese mes.</p>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

function SaldoVacacionesModal({ t, actual, onCerrar }: { t: T; actual: Fila<'saldo_vacaciones_inicial'> | null | undefined; onCerrar: () => void }) {
  const [f, setF] = useState({ al: actual?.al ?? hoyISO(), dias: actual ? String(actual.dias_pendientes) : '', detalle: actual?.detalle ?? '' })
  const m = useGuardar(async () => {
    if (f.dias === '' || Number.isNaN(Number(f.dias))) throw new Error('Indica los días pendientes (negativo si tenía días adelantados)')
    ok(await supabase.from('saldo_vacaciones_inicial').upsert({ trabajador_id: t.id!, al: f.al, dias_pendientes: Number(f.dias), detalle: f.detalle || null }))
  }, onCerrar)
  return (
    <Modal titulo={`Saldo inicial de vacaciones · ${t.apellidos_nombres}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="A la fecha"><Input type="date" value={f.al} onChange={(e) => setF({ ...f, al: e.target.value })} /></Campo>
        <Campo label="Días ganados y no gozados"><Input type="number" step="0.5" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} /></Campo>
        <div className="sm:col-span-2"><Campo label="Sustento"><Input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></Campo></div>
      </div>
      <p className="mt-2 text-xs text-t3">Lo ganado antes de esa fecha, más allá del saldo, se considera gozado. Las vacaciones posteriores se registran en Novedades.</p>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

function QuintaPreviaModal({ t, onCerrar }: { t: T; onCerrar: () => void }) {
  const [f, setF] = useState({ anio: String(new Date().getFullYear()), renta: '', ret: '', detalle: '' })
  const m = useGuardar(async () => {
    ok(await supabase.from('quinta_previa').insert({ trabajador_id: t.id!, anio: Number(f.anio), renta_bruta: Number(f.renta || 0), retencion: Number(f.ret || 0), detalle: f.detalle || null }))
  }, onCerrar)
  return (
    <Modal titulo={`Rentas de quinta previas · ${t.apellidos_nombres}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Campo label="Año"><Input type="number" value={f.anio} onChange={(e) => setF({ ...f, anio: e.target.value })} /></Campo>
        <Campo label="Renta bruta (S/)"><Input type="number" step="0.01" value={f.renta} onChange={(e) => setF({ ...f, renta: e.target.value })} /></Campo>
        <Campo label="Retenido (S/)"><Input type="number" step="0.01" value={f.ret} onChange={(e) => setF({ ...f, ret: e.target.value })} /></Campo>
        <div className="sm:col-span-3"><Campo label="Empleador / sustento"><Input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></Campo></div>
      </div>
      <p className="mt-2 text-xs text-t3">Del certificado de rentas y retenciones de otros empleadores del año, o de meses de este empleador anteriores al sistema (R-113).</p>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}
