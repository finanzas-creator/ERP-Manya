import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha } from '../lib/formato'
import { ESTADOS } from '../lib/estados'
import { Card, Estado, Input, Kpi, Tabla, Titulo } from '../components/ui'

// Ventas cuyo plan de pagos no cuadra con lo vendido (R-10): la lista de trabajo para limpiar datos.
const PROBLEMAS = ['sin_plan', 'falta_planificar', 'sobre_planificado'] as const

export default function Revision() {
  const navigate = useNavigate()
  const [tipo, setTipo] = useState<string>('')
  const [texto, setTexto] = useState('')
  const { data } = useQuery({
    queryKey: ['revision'],
    queryFn: async () => ok(await supabase.from('v_venta')
      .select('id, codigo, fecha_contrato, cliente, marca, servicio, moneda, monto_neto, planificado, falta_planificar, estado_plan')
      .in('estado_plan', [...PROBLEMAS]).order('fecha_contrato', { ascending: false })),
  })
  const t = texto.toLowerCase()
  const filas = data?.filter((v) => (!tipo || v.estado_plan === tipo) &&
    (!t || `${v.cliente} ${v.marca} ${v.servicio} ${v.codigo}`.toLowerCase().includes(t)))

  return (
    <>
      <Titulo>Revisión de datos</Titulo>
      <p className="-mt-2 mb-4 text-sm text-t2">Ventas cuyo plan de pagos no coincide con el monto vendido. Ábrelas para agregar, editar o anular cuotas.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROBLEMAS.map((k) => (
          <button key={k} onClick={() => setTipo(tipo === k ? '' : k)} className={`text-left ${tipo === k ? 'rounded-xl ring-2 ring-accent' : ''}`}>
            <Kpi label={ESTADOS[k].label} valor={data?.filter((v) => v.estado_plan === k).length ?? '…'} tono={k === 'falta_planificar' ? undefined : 'critical'} />
          </button>
        ))}
      </div>
      <div className="my-3"><Input placeholder="Buscar cliente, marca, servicio…" value={texto} onChange={(e) => setTexto(e.target.value)} className="w-full sm:max-w-xs" /></div>
      <Card titulo={`${filas?.length ?? 0} ventas por revisar`}>
        <Tabla filas={filas} clave={(v) => v.id!} onFila={(v) => navigate(`/ventas/${v.id}`)} vacio="Todo cuadra" columnas={[
          { titulo: 'Fecha', celda: (v) => <span className="whitespace-nowrap">{fecha(v.fecha_contrato)}</span> },
          { titulo: 'Cliente', celda: (v) => <><div className="font-medium">{v.marca ?? v.cliente}</div><div className="text-xs text-t3">{v.servicio}</div></> },
          { titulo: 'Vendido', derecha: true, celda: (v) => dinero(v.monto_neto, v.moneda) },
          { titulo: 'Planificado', derecha: true, celda: (v) => dinero(v.planificado, v.moneda) },
          { titulo: 'Diferencia', derecha: true, celda: (v) => dinero(v.falta_planificar, v.moneda) },
          { titulo: 'Problema', celda: (v) => <Estado valor={v.estado_plan} /> },
        ]} />
      </Card>
    </>
  )
}
