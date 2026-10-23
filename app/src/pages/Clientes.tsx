import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { fecha, mesLargo, usd } from '../lib/formato'
import { Card, Input, Pestanas, Tabla, Titulo } from '../components/ui'

type Orden = 'deuda' | 'ventas' | 'nombre'

export default function Clientes() {
  const [params, setParams] = useSearchParams()
  const vista = params.get('vista') === 'caidos' ? 'caidos' : 'todos'
  const setVista = (v: 'todos' | 'caidos') => setParams(v === 'caidos' ? { vista: v } : {}, { replace: true })
  return (
    <>
      <Titulo>Clientes</Titulo>
      <div className="mb-3"><Pestanas valor={vista} onCambio={setVista} opciones={[{ clave: 'todos', label: 'Todos' }, { clave: 'caidos', label: 'Caídos' }]} /></div>
      {vista === 'todos' ? <Todos /> : <Caidos />}
    </>
  )
}

/** R-53: clientes que dejaron de comprar en los últimos 12 meses. */
function Caidos() {
  const navigate = useNavigate()
  const [tipo, setTipo] = useState<'recurrente' | 'proyecto' | ''>('recurrente')
  const { data } = useQuery({
    queryKey: ['clientes_caidos'],
    queryFn: async () => ok(await supabase.from('v_cliente_caido').select('*').order('ultimo_mes', { ascending: false })),
  })
  const filas = data?.filter((c) => !tipo || c.tipo === tipo)
  return (
    <>
      <p className="mb-3 max-w-3xl text-sm text-t2">Clientes que facturaron en los últimos 12 meses y hoy ya no: sin ingreso este mes ni proyectos en curso, y sin servicios mensuales vigentes
        (un servicio vencido hace más de 30 días sin renovar ya no cuenta). "Ingreso mensual" es su promedio de los últimos 3 meses: lo que se dejó de facturar.</p>
      <div className="mb-3"><Pestanas valor={tipo} onCambio={setTipo} opciones={[
        { clave: 'recurrente', label: `Recurrentes (${data?.filter((c) => c.tipo === 'recurrente').length ?? 0})` },
        { clave: 'proyecto', label: `Proyectos terminados (${data?.filter((c) => c.tipo === 'proyecto').length ?? 0})` },
        { clave: '', label: 'Todos' }]} /></div>
      <Card titulo={`${filas?.length ?? 0} clientes · ${usd(filas?.reduce((s, c) => s + (c.ingreso_mensual_usd ?? 0), 0))} al mes que se dejaron de facturar`}>
        <Tabla filas={filas} clave={(c) => c.cliente_id!} onFila={(c) => navigate(`/clientes/${c.cliente_id}`)} vacio="Ningún cliente caído" columnas={[
          { titulo: 'Cliente', celda: (c) => <><div className="font-medium">{c.cliente}</div><div className="max-w-xs truncate text-xs text-t3">{c.servicios}</div>
            <div className="text-xs text-t2 sm:hidden">desde {mesLargo(c.caido_desde!)} · {usd(c.ingreso_mensual_usd)} al mes</div></> },
          { titulo: 'Caído desde', celda: (c) => <span className="whitespace-nowrap">{mesLargo(c.caido_desde!)}</span> },
          { titulo: 'Meses sin ingreso', derecha: true, celda: (c) => c.meses_sin_ingreso },
          { titulo: 'Ingreso mensual', derecha: true, celda: (c) => usd(c.ingreso_mensual_usd) },
          { titulo: 'Facturó en total', derecha: true, celda: (c) => usd(c.ingreso_total_usd) },
        ]} />
      </Card>
    </>
  )
}

function Todos() {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const [orden, setOrden] = useState<Orden>('deuda')
  const [soloActivos, setSoloActivos] = useState(true)
  const { data } = useQuery({
    queryKey: ['clientes'],
    queryFn: async () => ok(await supabase.from('v_cliente').select('*').order('razon_social')),
  })
  const t = texto.toLowerCase()
  const filas = data?.filter((c) => (!t || `${c.razon_social} ${c.marcas ?? ''} ${c.ruc ?? ''}`.toLowerCase().includes(t))
    && (!soloActivos || (c.servicios_activos ?? 0) > 0 || (c.por_cobrar_usd ?? 0) > 0))
    .sort((a, b) => orden === 'nombre' ? a.razon_social!.localeCompare(b.razon_social!)
      : orden === 'ventas' ? (b.ventas_12m_usd ?? 0) - (a.ventas_12m_usd ?? 0)
      : (b.por_cobrar_usd ?? 0) - (a.por_cobrar_usd ?? 0))

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar cliente, marca o RUC…" value={texto} onChange={(e) => setTexto(e.target.value)} className="min-w-0 flex-1 sm:max-w-xs" />
        <Pestanas valor={orden} onCambio={setOrden} opciones={[
          { clave: 'deuda', label: 'Por deuda' }, { clave: 'ventas', label: 'Por ventas' }, { clave: 'nombre', label: 'A–Z' }]} />
        <label className="flex items-center gap-2 text-sm text-t2">
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
          Solo con servicios activos o deuda
        </label>
      </div>
      <Card titulo={`${filas?.length ?? 0} clientes`}>
        <Tabla filas={filas} clave={(c) => c.id!} onFila={(c) => navigate(`/clientes/${c.id}`)} columnas={[
          { titulo: 'Cliente', celda: (c) => <><div className="font-medium">{c.razon_social}</div><div className="text-xs text-t3">{c.marcas}</div></> },
          { titulo: 'RUC', celda: (c) => <span className="text-t2">{c.ruc ?? '—'}</span> },
          { titulo: 'Servicios activos', derecha: true, celda: (c) => c.servicios_activos },
          { titulo: 'Última venta', celda: (c) => <span className="whitespace-nowrap text-t2">{fecha(c.ultima_venta)}</span> },
          { titulo: 'Ventas 12 meses', derecha: true, celda: (c) => usd(c.ventas_12m_usd) },
          { titulo: 'Por cobrar', derecha: true, celda: (c) => usd(c.por_cobrar_usd) },
          { titulo: 'Vencido', derecha: true, celda: (c) => <span className={(c.vencido_usd ?? 0) > 0 ? 'text-critical' : 'text-t3'}>{usd(c.vencido_usd)}</span> },
        ]} />
      </Card>
    </>
  )
}
