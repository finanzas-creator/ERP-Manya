import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { fecha, mesActual, mesLargo, sumarMeses } from '../lib/formato'
import { ROLES } from '../lib/estados'
import { Boton, Campo, Card, Input, MensajeError, Modal, Nota, Tabla, Titulo } from '../components/ui'

/** Parámetros que alimentan los cálculos. Solo el administrador los cambia (R-80). */
export default function Configuracion() {
  return (
    <>
      <Titulo>Configuración</Titulo>
      <div className="grid gap-4 lg:grid-cols-2">
        <TipoCambio />
        <div className="flex flex-col gap-4">
          <Parametros />
          <PesosDireccion />
          <Usuarios />
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- Tipo de cambio y cierre (R-06, R-70)
function TipoCambio() {
  const qc = useQueryClient()
  const [editar, setEditar] = useState<string | null>(null)
  const [cerrar, setCerrar] = useState<string | null>(null)
  const tc = useQuery({ queryKey: ['tc'], queryFn: async () => ok(await supabase.from('tipo_cambio_mensual').select('*').order('periodo', { ascending: false }).limit(24)) })
  const cierres = useQuery({ queryKey: ['cierres'], queryFn: async () => ok(await supabase.from('cierre_mensual').select('*')) })
  const cerrado = (p: string) => cierres.data?.some((c) => c.periodo === p)
  const siguiente = sumarMeses(tc.data?.[0]?.periodo ?? mesActual(), 1)
  const sunat = useQuery({ queryKey: ['tc_sunat'], queryFn: async () => ok(await supabase.from('tipo_cambio_sunat').select('*').order('fecha', { ascending: false }).limit(7)) })
  const actualizar = useMutation({
    mutationFn: async () => ok(await supabase.rpc('actualizar_tc_sunat')) as unknown as string,
    onSuccess: () => qc.invalidateQueries(),
  })
  const cierre = useMutation({
    mutationFn: async (periodo: string) => ok(await supabase.from('cierre_mensual').insert({ periodo })),
    onSuccess: () => { qc.invalidateQueries(); setCerrar(null) },
  })

  return (
    <Card titulo="Tipo de cambio mensual (S/ por USD)" accion={<div className="flex gap-2">
      <Boton onClick={() => actualizar.mutate()} disabled={actualizar.isPending}>Actualizar desde SUNAT</Boton>
      {siguiente <= mesActual() && <Boton onClick={() => setEditar(siguiente)}>+ {mesLargo(siguiente)}</Boton>}
    </div>}>
      {(actualizar.data || actualizar.error) && <div className="border-b border-line px-4 py-2 text-sm">
        {actualizar.data ? <span className="text-good">{actualizar.data}</span> : <MensajeError error={actualizar.error} />}</div>}
      {(sunat.data?.length ?? 0) > 0 && <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-2 text-xs text-t2">
        <span className="font-medium">SUNAT venta:</span>
        {sunat.data!.map((d) => <span key={d.fecha} className="num">{fecha(d.fecha).slice(0, 6)} {Number(d.venta).toFixed(3)}</span>)}
      </div>}
      <Tabla filas={tc.data} clave={(t) => t.periodo} columnas={[
        { titulo: 'Mes', celda: (t) => mesLargo(t.periodo) },
        { titulo: 'TC', derecha: true, celda: (t) => Number(t.tc).toFixed(4) },
        { titulo: 'Fuente', celda: (t) => <span className="text-xs text-t3">{t.fuente === 'sunat' ? 'SUNAT (venta)' : t.fuente === 'manual' ? 'Manual' : 'Sheet'}</span> },
        { titulo: 'Estado', celda: (t) => cerrado(t.periodo)
          ? <span className="text-xs text-t3">Cerrado</span>
          : <span className="flex gap-2">
              <button className="text-xs text-accent hover:underline" onClick={() => setEditar(t.periodo)}>Editar</button>
              {t.periodo < mesActual() && <button className="text-xs text-accent hover:underline" onClick={() => setCerrar(t.periodo)}>Cerrar mes</button>}
            </span> },
      ]} />
      <Nota>Con este TC se convierten a USD las ventas y los costos en soles del mes (R-06, R-60). Desde noviembre 2026 se toma solo cada día el TC de venta SUNAT (7:00 de Lima, con un reintento a las 10:00); hasta octubre se conserva el del sheet, ya conciliado. Si lo corriges a mano, queda como manual y no se sobrescribe. Cerrar un mes bloquea sus registros y fija su TC (R-70).</Nota>
      {editar && <EditarTc periodo={editar} actual={tc.data?.find((t) => t.periodo === editar)?.tc} onCerrar={() => setEditar(null)} />}
      {cerrar && (
        <Modal titulo={`Cerrar ${mesLargo(cerrar)}`} onCerrar={() => setCerrar(null)}>
          <p className="text-sm text-t2">Después de cerrar, nadie podrá crear, editar ni anular ventas, cuotas, comprobantes, pagos ni costos de {mesLargo(cerrar)}, y su tipo de cambio queda fijo. No se puede deshacer desde la app.</p>
          <div className="mt-3"><MensajeError error={cierre.error} /></div>
          <div className="mt-4 flex justify-end gap-2">
            <Boton onClick={() => setCerrar(null)}>Cancelar</Boton>
            <Boton variante="primario" disabled={cierre.isPending} onClick={() => cierre.mutate(cerrar)}>Cerrar el mes</Boton>
          </div>
        </Modal>
      )}
    </Card>
  )
}

function EditarTc({ periodo, actual, onCerrar }: { periodo: string; actual?: number; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [tc, setTc] = useState(actual != null ? String(actual) : '')
  const guardar = useMutation({
    mutationFn: async () => {
      if (!(Number(tc) > 0)) throw new Error('El tipo de cambio debe ser mayor que cero')
      ok(await supabase.from('tipo_cambio_mensual').upsert({ periodo, tc: Number(tc), fuente: 'manual' }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`Tipo de cambio de ${mesLargo(periodo)}`} onCerrar={onCerrar}>
      <Campo label="Soles por dólar" ayuda="Al guardarlo se recalculan todos los montos en USD de ese mes.">
        <Input type="number" step="0.0001" value={tc} onChange={(e) => setTc(e.target.value)} autoFocus />
      </Campo>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Parámetros (config)
const PARAMETROS = [
  { clave: 'igv_pct', label: 'IGV', unidad: '%', regla: 'R-12' },
  { clave: 'detraccion_pct', label: 'Detracción', unidad: '%', regla: 'R-22' },
  { clave: 'detraccion_umbral_pen', label: 'Detracción desde (S/)', unidad: 'S/', regla: 'R-22' },
  { clave: 'tolerancia_usd', label: 'Tolerancia de pago (USD)', unidad: 'USD', regla: 'R-33' },
  { clave: 'tolerancia_pct', label: 'Tolerancia de pago (% del total)', unidad: '%', regla: 'R-33' },
  { clave: 'morosidad_dias', label: 'Moroso desde (días de atraso)', unidad: 'días', regla: 'R-37' },
  { clave: 'autodetraccion_desde', label: 'Autodetracción: revisar facturas desde', unidad: 'fecha', regla: 'R-36' },
] as const

function Parametros() {
  const qc = useQueryClient()
  const cfg = useQuery({ queryKey: ['catalogo', 'config'], queryFn: async () => ok(await supabase.from('config').select('*').single()) })
  const [f, setF] = useState<Record<string, string> | null>(null)
  const valores = f ?? Object.fromEntries(PARAMETROS.map((p) => {
    const v = cfg.data?.[p.clave]
    return [p.clave, v == null ? '' : String(p.unidad === '%' ? +(Number(v) * 100).toFixed(4) : v)]
  }))
  const guardar = useMutation({
    mutationFn: async () => {
      const datos = Object.fromEntries(PARAMETROS.map((p) => [p.clave,
        p.unidad === 'fecha' ? valores[p.clave] : Number(valores[p.clave]) / (p.unidad === '%' ? 100 : 1)]))
      ok(await supabase.from('config').update(datos).eq('id', true))
    },
    onSuccess: () => { qc.invalidateQueries(); setF(null) },
  })
  return (
    <Card titulo="Parámetros del negocio">
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {PARAMETROS.map((p) => (
          <Campo key={p.clave} label={`${p.label} · ${p.regla}`}>
            <Input type={p.unidad === 'fecha' ? 'date' : 'number'} step="0.01" value={valores[p.clave]} onChange={(e) => setF({ ...valores, [p.clave]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <MensajeError error={guardar.error} />
        <Boton variante="primario" className="ml-auto" disabled={!f || guardar.isPending} onClick={() => guardar.mutate()}>Guardar parámetros</Boton>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- Pesos de Dirección (R-62, D-16)
function PesosDireccion() {
  const qc = useQueryClient()
  const pesos = useQuery({ queryKey: ['pesos'], queryFn: async () => ok(await supabase.from('peso_direccion').select('linea_id, peso, linea:linea_id(nombre)').order('linea_id')) })
  const [f, setF] = useState<Record<string, string> | null>(null)
  const valores = f ?? Object.fromEntries((pesos.data ?? []).map((p) => [String(p.linea_id), String(+(p.peso * 100).toFixed(2))]))
  const guardar = useMutation({
    mutationFn: async () => ok(await supabase.rpc('guardar_pesos_direccion', {
      p_pesos: Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, Number(v) / 100])) })),
    onSuccess: () => { qc.invalidateQueries(); setF(null) },
  })
  return (
    <Card titulo="Reparto del costo de Dirección">
      <div className="grid grid-cols-3 gap-3 p-4">
        {(pesos.data ?? []).map((p) => (
          <Campo key={p.linea_id} label={`${(p.linea as unknown as { nombre: string })?.nombre} (%)`}>
            <Input type="number" step="1" value={valores[String(p.linea_id)] ?? ''} onChange={(e) => setF({ ...valores, [String(p.linea_id)]: e.target.value })} />
          </Campo>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <MensajeError error={guardar.error} />
        <Boton variante="primario" className="ml-auto" disabled={!f || guardar.isPending} onClick={() => guardar.mutate()}>Guardar reparto</Boton>
      </div>
      <Nota>La planilla de Dirección y Gerencia se reparte entre las líneas con estos pesos; deben sumar 100% (R-62). Pendiente de confirmar (D-16).</Nota>
    </Card>
  )
}

// ---------------------------------------------------------------- Usuarios (R-80)
function Usuarios() {
  const { data } = useQuery({ queryKey: ['usuarios'], queryFn: async () => ok(await supabase.from('usuario').select('*').order('email')) })
  return (
    <Card titulo="Usuarios">
      <Tabla filas={data} clave={(u) => u.id} columnas={[
        { titulo: 'Correo', celda: (u) => u.email },
        { titulo: 'Rol', celda: (u) => ROLES[u.rol] },
        { titulo: 'Estado', celda: (u) => u.activo ? 'Activo' : <span className="text-t3">Inactivo</span> },
      ]} />
      <Nota>Para invitar a alguien nuevo, envía su correo y rol (Administrador, Tesorería o CEO): le llega un correo para crear su contraseña.</Nota>
    </Card>
  )
}
