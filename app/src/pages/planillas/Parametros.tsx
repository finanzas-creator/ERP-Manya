import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { fecha, mesLargo, sumarMeses } from '../../lib/formato'
import { useRol } from '../../lib/sesion'
import { ENUMS, type Fila } from '../../lib/db'
import { ESTADOS } from '../../lib/estados'
import { Boton, Campo, Card, Estado, Input, MensajeError, Modal, Nota, Pestanas, Select, Tabla } from '../../components/ui'
import { Icono } from '../../components/iconos'
import { pct2, s2, useAfps, useConceptos, useEmpleadores } from './comun'

type Vista = 'tasas' | 'legales' | 'empleadores' | 'conceptos'

/** Parámetros de planilla: tasas AFP por periodo, parámetros legales, empleadores/REMYPE y conceptos. */
export default function Parametros({ mes }: { mes: string }) {
  const [vista, setVista] = useState<Vista>('tasas')
  return (
    <>
      <div className="mb-3"><Pestanas valor={vista} onCambio={setVista} opciones={[
        { clave: 'tasas', label: 'Tasas AFP (SBS)' }, { clave: 'legales', label: 'RMV, UIT y aportes' },
        { clave: 'empleadores', label: 'Empleadores y REMYPE' }, { clave: 'conceptos', label: 'Conceptos' }]} /></div>
      {vista === 'tasas' && <TasasAfp mes={mes} />}
      {vista === 'legales' && <Legales />}
      {vista === 'empleadores' && <Empleadores />}
      {vista === 'conceptos' && <Conceptos />}
    </>
  )
}

function useGuardar(fn: () => Promise<unknown>, onListo?: () => void) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries(); onListo?.() } })
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

// ---------------------------------------------------------------- Tasas AFP (R-102)
function TasasAfp({ mes }: { mes: string }) {
  const admin = useRol() === 'admin'
  const [registrar, setRegistrar] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const desde = sumarMeses(mes, -2), hasta = sumarMeses(mes, 1)
  const { data } = useQuery({ queryKey: ['pl_tasas', desde, hasta],
    queryFn: async () => ok(await supabase.from('v_tasa_afp_periodo').select('*').gte('periodo', desde).lte('periodo', hasta).order('periodo', { ascending: false }).order('afp_id')) })
  const sbs = useGuardar(async () => setMensaje(ok(await supabase.rpc('actualizar_tasas_afp')) as unknown as string))
  const meses = [...new Set((data ?? []).map((t) => t.periodo!))]
  return (
    <Card titulo="Tasas AFP por mes de devengue" accion={admin && <Boton variante="primario" disabled={sbs.isPending} onClick={() => sbs.mutate()}>
      <Icono nombre="renovaciones" />Actualizar desde la SBS</Boton>}>
      {(mensaje || sbs.error) && <div className="px-4 pt-3">{mensaje && <div className="rounded-lg bg-info-bg px-3 py-2 text-sm">{mensaje}</div>}<MensajeError error={sbs.error} /></div>}
      {meses.map((m) => {
        const filas = (data ?? []).filter((t) => t.periodo === m)
        const exacta = filas.every((t) => t.exacta)
        return (
          <div key={m} className="border-b border-line last:border-0">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-s2 px-4 py-2 text-sm">
              <span className="font-semibold">{mesLargo(m)} {exacta ? <span className="ml-2 font-normal text-t3">· {filas[0]?.fuente === 'sbs' ? 'SBS automático' : 'registro manual'}</span>
                : <span className="ml-2"><Estado valor="provisional" /></span>}
                {!exacta && filas[0]?.periodo_tasa && <span className="ml-2 text-xs font-normal text-t3">usa las de {mesLargo(filas[0].periodo_tasa)}</span>}</span>
              {admin && <Boton onClick={() => setRegistrar(m)}>{exacta ? 'Corregir' : 'Registrar tasas'}</Boton>}
            </div>
            <Tabla compacta filas={filas} clave={(t) => `${m}-${t.afp_id}`} columnas={[
              { titulo: 'AFP', celda: (t) => t.nombre },
              { titulo: 'Aporte', derecha: true, celda: (t) => pct2(t.aporte) },
              { titulo: 'Prima de seguro', derecha: true, celda: (t) => pct2(t.prima) },
              { titulo: 'Comisión flujo', derecha: true, celda: (t) => pct2(t.comision_flujo) },
              { titulo: 'Comisión mixta', derecha: true, celda: (t) => pct2(t.comision_mixta) },
              { titulo: 'Anual sobre saldo', derecha: true, celda: (t) => pct2(t.comision_saldo) },
              { titulo: 'Rem. máx. asegurable', derecha: true, celda: (t) => s2(t.remuneracion_maxima) },
            ]} />
          </div>
        )
      })}
      <Nota>Cada día a las 8:20 se lee la tabla "Comisiones y primas" de la SBS y se guarda la del mes de devengue publicado. Si la SBS no responde o bloquea la consulta, el administrador las registra a mano con su sustento. Un mes sin tasas propias usa las del último mes y queda provisional: no se puede cerrar (R-102).</Nota>
      {registrar && <RegistrarTasas mes={registrar} base={(data ?? []).filter((t) => t.periodo === registrar)} onCerrar={() => setRegistrar(null)} />}
    </Card>
  )
}

function RegistrarTasas({ mes, base, onCerrar }: { mes: string; base: Fila<'v_tasa_afp_periodo'>[]; onCerrar: () => void }) {
  const afps = useAfps()
  const p = (v: number | null | undefined) => v == null ? '' : String(+(v * 100).toFixed(4))
  const [filas, setFilas] = useState(() => (afps.data ?? []).map((a) => {
    const b = base.find((x) => x.afp_id === a.id)
    return { codigo: a.codigo, nombre: a.nombre, aporte: p(b?.aporte) || '10', prima: p(b?.prima), comision_flujo: p(b?.comision_flujo),
      comision_mixta: p(b?.comision_mixta) || '0', comision_saldo: p(b?.comision_saldo), remuneracion_maxima: b?.remuneracion_maxima != null ? String(b.remuneracion_maxima) : '' }
  }))
  const [sustento, setSustento] = useState(`Tabla SBS "Comisiones y primas", devengue ${mes.slice(0, 7)}`)
  const m = useGuardar(async () => ok(await supabase.rpc('registrar_tasas_afp', { p_periodo: mes, p_fuente: 'manual', p_sustento: sustento,
    p_tasas: filas.map((f) => ({ codigo: f.codigo, aporte: Number(f.aporte), prima: Number(f.prima), comision_flujo: Number(f.comision_flujo),
      comision_mixta: Number(f.comision_mixta || 0), comision_saldo: f.comision_saldo === '' ? null : Number(f.comision_saldo), remuneracion_maxima: Number(f.remuneracion_maxima) })) })), onCerrar)
  const set = (i: number, k: keyof (typeof filas)[0]) => (e: { target: { value: string } }) => setFilas(filas.map((f, j) => j === i ? { ...f, [k]: e.target.value } : f))
  return (
    <Modal titulo={`Tasas AFP de ${mesLargo(mes)} (en %)`} onCerrar={onCerrar}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-t2">{['AFP', 'Aporte', 'Prima', 'Flujo', 'Mixta', 'Saldo', 'Rem. máx.'].map((t) => <th key={t} className="px-1 py-1 font-medium">{t}</th>)}</tr></thead>
          <tbody>{filas.map((f, i) => (
            <tr key={f.codigo}><td className="px-1 py-1 whitespace-nowrap">{f.nombre}</td>
              {(['aporte', 'prima', 'comision_flujo', 'comision_mixta', 'comision_saldo', 'remuneracion_maxima'] as const).map((k) =>
                <td key={k} className="px-1 py-1"><Input className="w-20" type="number" step="0.01" value={f[k]} onChange={set(i, k)} aria-label={`${k} ${f.nombre}`} /></td>)}
            </tr>))}</tbody>
        </table>
      </div>
      <div className="mt-3"><Campo label="Sustento"><Input value={sustento} onChange={(e) => setSustento(e.target.value)} /></Campo></div>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

// ---------------------------------------------------------------- Parámetros legales
const PARAMETROS: Record<string, { label: string; pct?: boolean }> = {
  rmv: { label: 'Remuneración mínima vital (S/)' }, uit: { label: 'UIT (S/)' }, onp: { label: 'ONP', pct: true },
  essalud: { label: 'EsSalud', pct: true }, asignacion_familiar: { label: 'Asignación familiar (% de la RMV)', pct: true },
  bonificacion_essalud: { label: 'Bonificación extraordinaria (EsSalud)', pct: true }, bonificacion_eps: { label: 'Bonificación extraordinaria (EPS)', pct: true },
  quinta_deduccion_uit: { label: 'Deducción de quinta (UIT)' }, prima_edad_maxima: { label: 'Edad sin prima AFP (años)' },
  descanso_medico_dias: { label: 'Días de descanso médico a cargo del empleador' },
}

function Legales() {
  const admin = useRol() === 'admin'
  const [nuevo, setNuevo] = useState(false)
  const { data } = useQuery({ queryKey: ['pl_legales'], queryFn: async () => ok(await supabase.from('parametro_legal').select('*').order('parametro').order('vigente_desde', { ascending: false })) })
  const tramos = useQuery({ queryKey: ['pl_tramos'], queryFn: async () => ok(await supabase.from('tramo_quinta').select('*').order('vigente_desde').order('desde_uit')) })
  const valor = (p: string, v: number) => PARAMETROS[p]?.pct ? pct2(v) : s2(v)
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card titulo="Parámetros legales con vigencia" accion={admin && <Boton onClick={() => setNuevo(true)}><Icono nombre="mas" />Nueva vigencia</Boton>}>
        <Tabla filas={data} clave={(p) => `${p.parametro}-${p.vigente_desde}`} columnas={[
          { titulo: 'Parámetro', celda: (p) => PARAMETROS[p.parametro]?.label ?? p.parametro },
          { titulo: 'Desde', celda: (p) => fecha(p.vigente_desde) },
          { titulo: 'Valor', derecha: true, celda: (p) => valor(p.parametro, p.valor) },
          { titulo: 'Norma', celda: (p) => p.fuente_url ? <a className="text-accent underline" href={p.fuente_url} target="_blank" rel="noreferrer">{p.norma}</a> : p.norma },
        ]} />
        <Nota>Cada cálculo toma el valor vigente en su fecha: un cambio de RMV o UIT se registra como una nueva vigencia con su norma, nunca se edita el código ni el valor anterior.</Nota>
      </Card>
      <Card titulo="Tramos de quinta categoría">
        <Tabla compacta filas={tramos.data} clave={(t) => `${t.vigente_desde}-${t.desde_uit}`} columnas={[
          { titulo: 'Desde (UIT)', derecha: true, celda: (t) => Number(t.desde_uit) },
          { titulo: 'Tasa', derecha: true, celda: (t) => pct2(t.tasa) },
        ]} />
        <Nota>Renta neta anual = renta bruta − 7 UIT (R-113).</Nota>
      </Card>
      {nuevo && <NuevoParametro onCerrar={() => setNuevo(false)} />}
    </div>
  )
}

function NuevoParametro({ onCerrar }: { onCerrar: () => void }) {
  const [f, setF] = useState({ parametro: 'rmv', desde: '', valor: '', norma: '', url: '' })
  const pct = PARAMETROS[f.parametro]?.pct
  const m = useGuardar(async () => {
    if (!f.desde || f.valor === '' || !f.norma.trim()) throw new Error('Completa fecha, valor y norma')
    ok(await supabase.from('parametro_legal').insert({ parametro: f.parametro as 'rmv', vigente_desde: f.desde,
      valor: pct ? Number(f.valor) / 100 : Number(f.valor), norma: f.norma.trim(), fuente_url: f.url || null }))
  }, onCerrar)
  return (
    <Modal titulo="Nueva vigencia de un parámetro legal" onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Parámetro"><Select value={f.parametro} onChange={(e) => setF({ ...f, parametro: e.target.value })}>
          {ENUMS.parametro_legal_tipo.map((p) => <option key={p} value={p}>{PARAMETROS[p]?.label ?? p}</option>)}</Select></Campo></div>
        <Campo label="Vigente desde"><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo label={pct ? 'Valor (%)' : 'Valor'}><Input type="number" step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
        <Campo label="Norma"><Input value={f.norma} onChange={(e) => setF({ ...f, norma: e.target.value })} placeholder="D.S. 000-2027-TR" /></Campo>
        <Campo label="Enlace oficial"><Input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Campo>
      </div>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

// ---------------------------------------------------------------- Empleadores y REMYPE (R-100)
function Empleadores() {
  const admin = useRol() === 'admin'
  const empleadores = useEmpleadores()
  const remype = useQuery({ queryKey: ['pl_remype'], queryFn: async () => ok(await supabase.from('empleador_remype').select('*').order('desde')) })
  const [editar, setEditar] = useState<Fila<'empleador'> | 'nuevo' | null>(null)
  const [nuevoRemype, setNuevoRemype] = useState<number | null>(null)
  return (
    <Card titulo="Empleadores" accion={admin && <Boton onClick={() => setEditar('nuevo')}><Icono nombre="mas" />Agregar empleador</Boton>}>
      <Tabla filas={empleadores.data} clave={(e) => String(e.id)} onFila={admin ? setEditar : undefined} vacio="Sin empleadores" columnas={[
        { titulo: 'Razón social', celda: (e) => <><div className="font-medium">{e.razon_social}</div><div className="text-xs text-t3">RUC {e.ruc ?? '—'}</div></> },
        { titulo: 'Planilla desde', celda: (e) => mesLargo(e.inicio_planilla) },
        { titulo: 'REMYPE', celda: (e) => {
          const rs = (remype.data ?? []).filter((r) => r.empleador_id === e.id)
          return <div className="flex flex-wrap items-center gap-2">
            {rs.map((r) => <span key={r.id} className="text-xs"><Estado valor={r.categoria} /> desde {fecha(r.desde)}{r.hasta ? ` hasta ${fecha(r.hasta)}` : ''}</span>)}
            {rs.length === 0 && <span className="text-xs text-warning">Sin registro: régimen general</span>}
            {admin && <Boton variante="fantasma" onClick={(ev) => { ev.stopPropagation(); setNuevoRemype(e.id) }}><Icono nombre="mas" />REMYPE</Boton>}
          </div>
        } },
        { titulo: 'Faltas', celda: (e) => e.descuento_dominical ? `descuentan descanso (1/${e.dias_laborables_semana})` : 'solo el día' },
      ]} />
      <Nota>Cada entidad con el mismo régimen se agrega aquí: su planilla usa las mismas reglas. El REMYPE (categoría y fecha de inscripción, con su constancia) define el régimen de quienes ingresaron después; quienes ingresaron antes conservan el régimen general (R-100).</Nota>
      {editar && <EmpleadorModal e={editar === 'nuevo' ? null : editar} onCerrar={() => setEditar(null)} />}
      {nuevoRemype && <RemypeModal empleador={nuevoRemype} onCerrar={() => setNuevoRemype(null)} />}
    </Card>
  )
}

function EmpleadorModal({ e, onCerrar }: { e: Fila<'empleador'> | null; onCerrar: () => void }) {
  const [f, setF] = useState({ razon_social: e?.razon_social ?? '', ruc: e?.ruc ?? '', nombre_comercial: e?.nombre_comercial ?? '',
    direccion: e?.direccion ?? '', inicio: (e?.inicio_planilla ?? '').slice(0, 7), dominical: e?.descuento_dominical ?? false,
    dias: String(e?.dias_laborables_semana ?? 6) })
  const set = (k: keyof typeof f) => (ev: { target: { value: string } }) => setF({ ...f, [k]: ev.target.value })
  const m = useGuardar(async () => {
    if (!f.razon_social.trim() || !f.inicio) throw new Error('Completa razón social y mes de inicio')
    const datos = { razon_social: f.razon_social.trim(), ruc: f.ruc.trim() || null, nombre_comercial: f.nombre_comercial || null,
      direccion: f.direccion || null, inicio_planilla: f.inicio + '-01', descuento_dominical: f.dominical,
      dias_laborables_semana: Number(f.dias) }
    if (e) ok(await supabase.from('empleador').update(datos).eq('id', e.id))
    else ok(await supabase.from('empleador').insert(datos))
  }, onCerrar)
  return (
    <Modal titulo={e ? e.razon_social : 'Agregar empleador'} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Razón social"><Input value={f.razon_social} onChange={set('razon_social')} autoFocus /></Campo></div>
        <Campo label="RUC"><Input value={f.ruc} onChange={set('ruc')} maxLength={11} /></Campo>
        <Campo label="Nombre comercial"><Input value={f.nombre_comercial} onChange={set('nombre_comercial')} /></Campo>
        <div className="sm:col-span-2"><Campo label="Dirección"><Input value={f.direccion} onChange={set('direccion')} /></Campo></div>
        <Campo label="Primer mes en el sistema"><Input type="month" value={f.inicio} onChange={set('inicio')} /></Campo>
        <Campo label="Días laborables por semana"><Select value={f.dias} onChange={set('dias')}><option value="6">6</option><option value="5">5</option></Select></Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={f.dominical} onChange={(ev) => setF({ ...f, dominical: ev.target.checked })} />
          Las faltas descuentan el descanso semanal proporcional
        </label>
      </div>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

function RemypeModal({ empleador, onCerrar }: { empleador: number; onCerrar: () => void }) {
  const [f, setF] = useState({ categoria: 'pequena', desde: '', hasta: '', constancia: '' })
  const m = useGuardar(async () => {
    if (!f.desde) throw new Error('Indica la fecha de inscripción')
    ok(await supabase.from('empleador_remype').insert({ empleador_id: empleador, categoria: f.categoria as 'pequena', desde: f.desde,
      hasta: f.hasta || null, constancia: f.constancia || null }))
  }, onCerrar)
  return (
    <Modal titulo="Inscripción REMYPE" onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Categoría"><Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
          {ENUMS.regimen_laboral.filter((r) => r !== 'general').map((r) => <option key={r} value={r}>{ESTADOS[r]?.label}</option>)}</Select></Campo>
        <Campo label="Constancia N°"><Input value={f.constancia} onChange={(e) => setF({ ...f, constancia: e.target.value })} /></Campo>
        <Campo label="Inscrita desde"><Input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo label="Hasta (si perdió la categoría)"><Input type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
      </div>
      <Botones onCerrar={onCerrar} m={m} />
    </Modal>
  )
}

// ---------------------------------------------------------------- Conceptos (R-110)
function Conceptos() {
  const admin = useRol() === 'admin'
  const { data } = useConceptos()
  const qc = useQueryClient()
  const cambiar = useMutation({
    mutationFn: async ({ codigo, campo, valor }: { codigo: string; campo: string; valor: boolean }) =>
      ok(await supabase.from('concepto_planilla').update({ [campo]: valor }).eq('codigo', codigo)),
    onSuccess: () => qc.invalidateQueries(),
  })
  const marca = (c: Fila<'concepto_planilla'>, campo: keyof Fila<'concepto_planilla'>) => (
    <input type="checkbox" checked={!!c[campo]} disabled={!admin || cambiar.isPending} aria-label={`${String(campo)} ${c.nombre}`}
      onChange={(e) => cambiar.mutate({ codigo: c.codigo, campo: String(campo), valor: e.target.checked })} />
  )
  return (
    <Card titulo="Conceptos de la boleta y sus afectaciones">
      <MensajeError error={cambiar.error} />
      <Tabla compacta filas={data} clave={(c) => c.codigo} columnas={[
        { titulo: 'Concepto', celda: (c) => <><div>{c.nombre}</div><div className="text-xs text-t3">{c.codigo}{c.plame ? ` · PLAME ${c.plame}` : ''}</div></> },
        { titulo: 'Tipo', celda: (c) => c.tipo },
        { titulo: 'EsSalud', celda: (c) => marca(c, 'afecto_essalud') },
        { titulo: 'Pensión', celda: (c) => marca(c, 'afecto_pension') },
        { titulo: 'Quinta', celda: (c) => marca(c, 'afecto_quinta') },
        { titulo: 'Extraord. 5ta', celda: (c) => marca(c, 'quinta_extraordinaria') },
        { titulo: 'Computable', celda: (c) => marca(c, 'computable') },
        { titulo: 'Variable', celda: (c) => marca(c, 'variable') },
        { titulo: 'Se registra', celda: (c) => c.manual ? 'Sí' : 'Sistema' },
      ]} />
      <Nota>Cada cálculo lee estas marcas (R-110): cambiar una afectación (p. ej. subsidios u horas extra, D-29/D-30) cambia el cálculo sin tocar código. Queda en la bitácora.</Nota>
    </Card>
  )
}
