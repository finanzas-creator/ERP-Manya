import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, usd } from '../lib/formato'
import { Boton, Card, Kpi, MensajeError, Tabla, Titulo } from '../components/ui'
import type { Fila } from '../lib/db'

type Ren = Fila<'v_renovacion'>
const VENTANAS = [{ k: 'vencidas', label: 'Vencidas' }, { k: '30', label: 'Próximos 30 días' }, { k: 'todas', label: 'Todas' }] as const

export default function Renovaciones() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [ventana, setVentana] = useState<(typeof VENTANAS)[number]['k']>('30')
  const { data } = useQuery({
    queryKey: ['renovaciones'],
    queryFn: async () => ok(await supabase.from('v_renovacion').select('*').order('vence', { nullsFirst: true })),
  })
  const renovar = useMutation({
    mutationFn: async (venta: string) => ok(await supabase.rpc('renovar_venta', { p_venta: venta })),
    onSuccess: () => qc.invalidateQueries(),
  })
  const finalizar = useMutation({
    mutationFn: async (sc: string) => ok(await supabase.rpc('finalizar_servicio', { p_servicio_contratado: sc })),
    onSuccess: () => qc.invalidateQueries(),
  })
  const d = (r: Ren) => r.dias_para_vencer
  const filas = data?.filter((r) => ventana === 'todas' || (ventana === 'vencidas' ? (d(r) ?? 0) < 0 : d(r) != null && d(r)! >= 0 && d(r)! <= 30))
  const vencidas = data?.filter((r) => (d(r) ?? 0) < 0) ?? []
  const proximas = data?.filter((r) => d(r) != null && d(r)! >= 0 && d(r)! <= 30) ?? []
  const mrr = (xs: Ren[]) => usd(xs.reduce((s, r) => s + (r.monto_neto_usd ?? 0), 0))

  return (
    <>
      <Titulo>Renovaciones</Titulo>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Servicios mensuales activos" valor={data?.length ?? 0} detalle={`${mrr(data ?? [])} al mes`} />
        <Kpi label="Por vencer (30 días)" valor={proximas.length} detalle={mrr(proximas)} />
        <Kpi label="Vencidas sin renovar" valor={vencidas.length} detalle={mrr(vencidas)} tono={vencidas.length ? 'critical' : undefined} />
      </div>
      <div className="my-3 flex gap-1">
        {VENTANAS.map((v) => <Boton key={v.k} variante={ventana === v.k ? 'primario' : 'normal'} onClick={() => setVentana(v.k)}>{v.label}</Boton>)}
      </div>
      <MensajeError error={renovar.error ?? finalizar.error} />
      <Card>
        <Tabla filas={filas} clave={(r) => r.servicio_contratado_id!} onFila={(r) => navigate(`/ventas/${r.ultima_venta_id}`)} columnas={[
          { titulo: 'Vence', celda: (r) => <span className="whitespace-nowrap">{fecha(r.vence)}</span> },
          { titulo: 'Días', derecha: true, celda: (r) => <span className={(d(r) ?? 0) < 0 ? 'text-critical' : ''}>{d(r) ?? '—'}</span> },
          { titulo: 'Cliente', celda: (r) => <><div className="font-medium">{r.marca ?? r.cliente}</div><div className="text-xs text-t3">{r.cliente}</div></> },
          { titulo: 'Servicio', celda: (r) => <><div>{r.servicio}</div><div className="text-xs text-t3">{r.categoria}</div></> },
          { titulo: 'Monto', derecha: true, celda: (r) => dinero(r.monto_neto, r.moneda) },
          { titulo: '', celda: (r) => (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Boton disabled={!r.vence || renovar.isPending} onClick={() => renovar.mutate(r.ultima_venta_id!)}>Renovar</Boton>
              <Boton variante="fantasma" disabled={finalizar.isPending} onClick={() => finalizar.mutate(r.servicio_contratado_id!)}>No renueva</Boton>
            </div>) },
        ]} />
      </Card>
    </>
  )
}
