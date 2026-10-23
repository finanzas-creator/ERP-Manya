import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, usd } from '../lib/formato'
import { Boton, Card, Estado, Kpi, MensajeError, Pestanas, Tabla, Titulo } from '../components/ui'
import type { Fila } from '../lib/db'

type Ren = Fila<'v_renovacion'>
type Vista = 'por_vencer' | 'vencida' | 'caida' | 'vigente' | 'todas'

/** Días en palabras: "faltan 5 días", "venció hace 12 días", "vence hoy". */
function dias(d: number | null | undefined) {
  if (d == null) return 'sin fecha fin'
  if (d === 0) return 'vence hoy'
  return d > 0 ? `faltan ${d} día${d === 1 ? '' : 's'}` : `venció hace ${-d} día${d === -1 ? '' : 's'}`
}

export default function Renovaciones() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [vista, setVista] = useState<Vista>('por_vencer')
  const [confirmar, setConfirmar] = useState<Ren | null>(null)
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
    onSuccess: () => { setConfirmar(null); qc.invalidateQueries() },
  })
  const de = (e: Vista) => data?.filter((r) => e === 'todas' || r.estado === e) ?? []
  const mrr = (xs: Ren[]) => usd(xs.reduce((s, r) => s + (r.monto_neto_usd ?? 0), 0))
  const filas = data && de(vista)
  const kpi = (e: Vista, label: string, tono?: 'critical' | 'warning') => (
    <Kpi label={label} valor={de(e).length} detalle={`${mrr(de(e))} al mes`} tono={de(e).length && tono === 'critical' ? 'critical' : undefined} onClick={() => setVista(e)} />
  )

  return (
    <>
      <Titulo>Renovaciones</Titulo>
      <details className="mb-3 max-w-3xl rounded-lg border border-line bg-s1 px-4 py-3 text-sm text-t2">
        <summary className="cursor-pointer font-medium text-t1">¿Cómo funcionan las renovaciones?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Aquí están los <b>servicios mensuales activos</b> (fee, community, pauta…). Cada ciclo es una venta con fecha de inicio y fin.</li>
          <li><b>Por vencer:</b> el ciclo termina en los próximos 30 días. Conversa con el cliente.</li>
          <li><b>Renovar</b> crea la venta del siguiente ciclo copiando la anterior (mismo monto y plan de pagos), empezando cuando termina el actual.</li>
          <li><b>No renueva</b> finaliza el servicio: sale de esta lista y deja de contarse como ingreso recurrente.</li>
          <li><b>Vencida:</b> terminó hace menos de 30 días y nadie decidió. Hay que renovar o finalizar.</li>
          <li><b>Caída:</b> venció hace más de 30 días sin renovar; el cliente ya aparece en <i>Clientes → Caídos</i>.</li>
          <li>Si el cliente tiene <span className="text-critical">deuda vencida</span>, se avisa antes de renovar.</li>
        </ul>
      </details>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpi('por_vencer', 'Por vencer (30 días)', 'warning')}
        {kpi('vencida', 'Vencidas sin decidir', 'critical')}
        {kpi('caida', 'Caídas (más de 30 días)')}
        {kpi('vigente', 'Vigentes')}
      </div>
      <div className="my-3 overflow-x-auto">
        <Pestanas valor={vista} onCambio={setVista} opciones={[
          { clave: 'por_vencer', label: 'Por vencer' }, { clave: 'vencida', label: 'Vencidas' }, { clave: 'caida', label: 'Caídas' },
          { clave: 'vigente', label: 'Vigentes' }, { clave: 'todas', label: `Todas (${data?.length ?? 0})` }]} />
      </div>
      <MensajeError error={renovar.error ?? finalizar.error} />
      {confirmar && (
        <Card className="mb-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span>¿Finalizar <b>{confirmar.servicio}</b> de <b>{confirmar.marca ?? confirmar.cliente}</b>? Ya no aparecerá en renovaciones.</span>
            <div className="flex gap-2">
              <Boton onClick={() => setConfirmar(null)}>Cancelar</Boton>
              <Boton variante="peligro" disabled={finalizar.isPending} onClick={() => finalizar.mutate(confirmar.servicio_contratado_id!)}>Sí, no renueva</Boton>
            </div>
          </div>
        </Card>
      )}
      <Card>
        <Tabla filas={filas} clave={(r) => r.servicio_contratado_id!} onFila={(r) => navigate(`/ventas/${r.ultima_venta_id}`)}
          vacio="No hay servicios en este estado" columnas={[
          { titulo: 'Cliente y servicio', celda: (r) => <>
            <div className="font-medium">{r.marca ?? r.cliente}</div>
            <div className="text-xs text-t2">{r.servicio} · {r.categoria}</div>
            <div className="text-xs text-t3 sm:hidden">{fecha(r.vence)} · {dias(r.dias_para_vencer)} · {dinero(r.monto_neto, r.moneda)}</div>
            {(r.deuda_vencida_usd ?? 0) > 0.5 && <div className="text-xs text-critical">Deuda vencida {usd(r.deuda_vencida_usd)}</div>}
          </> },
          { titulo: 'Estado', celda: (r) => <Estado valor={r.estado} /> },
          { titulo: 'Vence', celda: (r) => <><div className="whitespace-nowrap">{fecha(r.vence)}</div><div className="text-xs whitespace-nowrap text-t3">{dias(r.dias_para_vencer)}</div></> },
          { titulo: 'Ciclo', derecha: true, celda: (r) => <span title="Ventas de este servicio, contando la actual">{r.ciclos}°</span> },
          { titulo: 'Monto mensual', derecha: true, celda: (r) => dinero(r.monto_neto, r.moneda) },
          { titulo: '', celda: (r) => (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Boton disabled={!r.vence || renovar.isPending} onClick={() => renovar.mutate(r.ultima_venta_id!)}
                title={(r.deuda_vencida_usd ?? 0) > 0.5 ? 'Ojo: el cliente tiene deuda vencida' : undefined}>Renovar</Boton>
              <Boton variante="fantasma" onClick={() => setConfirmar(r)}>No renueva</Boton>
            </div>) },
        ]} />
      </Card>
    </>
  )
}
