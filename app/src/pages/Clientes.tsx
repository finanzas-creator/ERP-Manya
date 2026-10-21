import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { fecha, usd } from '../lib/formato'
import { Card, Input, Pestanas, Tabla, Titulo } from '../components/ui'

type Orden = 'deuda' | 'ventas' | 'nombre'

export default function Clientes() {
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
      <Titulo>Clientes</Titulo>
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
