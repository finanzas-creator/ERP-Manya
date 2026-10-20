import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, pct } from '../lib/formato'
import { Boton, Card, Estado, MensajeError, Tabla, Titulo, Select } from '../components/ui'
import { usePlantillas } from '../lib/catalogos'
import { PagoModal } from '../components/Pago'
import { EmitirComprobante } from '../components/EmitirComprobante'
import { AnularModal, type TablaAnulable } from '../components/Anular'
import { CuotaModal } from '../components/CuotaModal'
import type { Fila } from '../lib/db'

type Cuota = Fila<'v_cuota'>
type Anulacion = { tabla: TablaAnulable; id: string; titulo: string; onListo?: () => void }

export default function VentaDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [pagar, setPagar] = useState<Cuota | null>(null)
  const [emitir, setEmitir] = useState(false)
  const [anular, setAnular] = useState<Anulacion | null>(null)
  const [editar, setEditar] = useState<Cuota | 'nueva' | null>(null)

  const venta = useQuery({ queryKey: ['venta', id], queryFn: async () => ok(await supabase.from('v_venta').select('*').eq('id', id!).single()) })
  const cuotas = useQuery({ queryKey: ['cuotas', id], queryFn: async () => ok(await supabase.from('v_cuota').select('*').eq('venta_id', id!).order('orden')) })
  const comprobantes = useQuery({
    queryKey: ['comprobantes-venta', id],
    enabled: !!cuotas.data,
    queryFn: async () => {
      const ids = [...new Set(cuotas.data!.map((c) => c.comprobante_id).filter(Boolean))] as string[]
      return ids.length ? ok(await supabase.from('v_comprobante').select('id, serie_numero, tipo, empresa').in('id', ids)) : []
    },
  })
  const pagos = useQuery({
    queryKey: ['pagos', id],
    queryFn: async () => ok(await supabase.from('v_pago').select('id, cuota_id, fecha, cuenta, monto, moneda_cuenta, tc, monto_usd, es_detraccion').eq('venta_id', id!).order('fecha')),
  })
  const renovar = useMutation({
    mutationFn: async () => ok(await supabase.rpc('renovar_venta', { p_venta: id })) as string,
    onSuccess: (nueva) => { qc.invalidateQueries(); navigate(`/ventas/${nueva}`) },
  })

  const v = venta.data
  if (!v) return <MensajeError error={venta.error} />
  const comp = (cid: string | null) => comprobantes.data?.find((c) => c.id === cid)
  const porFacturar = cuotas.data?.filter((c) => !c.comprobante_id && !c.pagada) ?? []

  return (
    <>
      <div className="mb-1 text-xs text-t3"><Link to="/ventas" className="hover:underline">Ventas</Link> / {v.codigo}</div>
      <Titulo accion={<div className="flex flex-wrap gap-2">
        {v.modalidad === 'mensual' && v.fecha_fin && <Boton onClick={() => renovar.mutate()} disabled={renovar.isPending}>Renovar ciclo</Boton>}
        {porFacturar.length > 0 && <Boton onClick={() => setEmitir(true)}>Emitir comprobante</Boton>}
        <Boton variante="peligro" onClick={() => setAnular({ tabla: 'venta', id: v.id!, titulo: 'Anular venta', onListo: () => navigate('/ventas') })}>Anular</Boton>
      </div>}>
        {v.marca ?? v.cliente} · {v.servicio}
      </Titulo>
      <MensajeError error={renovar.error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Venta">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 p-4 text-sm">
            {([
              ['Cliente', v.cliente], ['Categoría', `${v.categoria} · ${v.linea}`],
              ['Modalidad', v.modalidad], ['Naturaleza', v.naturaleza === 'terceros' ? 'Terceros (no es venta)' : 'Propio'],
              ['Fecha de contrato', fecha(v.fecha_contrato)], [v.modalidad === 'proyecto' ? 'Entrega' : 'Fin de ciclo', fecha(v.fecha_fin)],
              ['Monto neto', dinero(v.monto_neto, v.moneda)], ['IGV', pct(v.pct_igv)],
              ['Total', dinero(v.total, v.moneda)], ['Saldo', dinero(v.saldo, v.moneda)],
              ['Equipo', v.equipo ?? '—'], ['Partner', v.partner ? `${v.partner} · ${pct(v.pct_comision)}` : '—'],
            ] as const).map(([k, val]) => (
              <div key={k}><dt className="text-xs text-t3">{k}</dt><dd className="num">{val}</dd></div>
            ))}
          </dl>
          {v.descripcion && <p className="border-t border-line px-4 py-3 text-sm text-t2">{v.descripcion}</p>}
          <div className="flex gap-2 border-t border-line px-4 py-3"><Estado valor={v.estado_plan} />{(v.cuotas ?? 0) > 0 && <Estado valor={v.estado_cobro} />}</div>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card titulo="Plan de pagos" accion={(v.cuotas ?? 0) === 0
              ? <GenerarPlan ventaId={v.id!} />
              : <div className="flex items-center gap-3">
                  {v.estado_plan !== 'cuadra' && <span className="num text-xs text-warning">
                    {v.estado_plan === 'falta_planificar' ? 'Falta planificar' : 'Excede la venta en'} {dinero(Math.abs(v.falta_planificar ?? 0), v.moneda)}</span>}
                  <Boton onClick={() => setEditar('nueva')}>+ Cuota</Boton>
                </div>}>
            <Tabla<Cuota> filas={cuotas.data} clave={(c) => c.id!} columnas={[
              { titulo: 'Cuota', celda: (c) => <>
                <div>{c.orden}. {c.concepto}</div>
                <div className="text-xs text-t3">{c.comprobante_id ? (comp(c.comprobante_id)?.serie_numero ?? 'Comanda') : 'Sin comprobante'}</div>
              </> },
              { titulo: 'Vence', celda: (c) => <span className="whitespace-nowrap">{fecha(c.vencimiento)}</span> },
              { titulo: 'Total', derecha: true, celda: (c) => dinero(c.total, c.moneda) },
              { titulo: 'Saldo', derecha: true, celda: (c) => dinero(c.saldo, c.moneda) },
              { titulo: 'Estado', celda: (c) => <Estado valor={c.estado} /> },
              { titulo: '', celda: (c) => (
                <div className="flex justify-end gap-1">
                  <Boton variante="fantasma" onClick={() => setEditar(c)}>Editar</Boton>
                  {!c.pagada && <Boton onClick={() => setPagar(c)}>Pagar</Boton>}
                </div>) },
            ]} />
          </Card>
          <Card titulo="Pagos recibidos">
            <Tabla filas={pagos.data} clave={(p) => p.id!} vacio="Aún no hay pagos" columnas={[
              { titulo: 'Fecha', celda: (p) => fecha(p.fecha) },
              { titulo: 'Cuota', celda: (p) => `#${cuotas.data?.find((c) => c.id === p.cuota_id)?.orden ?? ''}` },
              { titulo: 'Cuenta', celda: (p) => <>{p.cuenta}{p.es_detraccion && <span className="ml-1 text-xs text-t3">(detracción)</span>}</> },
              { titulo: 'Monto', derecha: true, celda: (p) => dinero(p.monto, p.moneda_cuenta) },
              { titulo: 'TC', derecha: true, celda: (p) => (p.tc === 1 ? '—' : p.tc) },
              { titulo: 'USD', derecha: true, celda: (p) => dinero(p.monto_usd, 'USD') },
              { titulo: '', celda: (p) => <Boton variante="fantasma" onClick={() => setAnular({ tabla: 'pago', id: p.id!, titulo: 'Anular pago' })}>Anular</Boton> },
            ]} />
          </Card>
        </div>
      </div>

      {pagar && <PagoModal onCerrar={() => setPagar(null)} objetivo={{
        tipo: 'cuota', id: pagar.id!, saldo: pagar.saldo ?? 0, moneda: pagar.moneda ?? 'USD',
        descripcion: `Cuota ${pagar.orden} · ${pagar.concepto}` }} />}
      {emitir && <EmitirComprobante clienteId={v.cliente_id!} preseleccion={porFacturar.map((c) => c.id!)} onCerrar={() => setEmitir(false)} />}
      {editar && <CuotaModal ventaId={v.id!} cuota={editar === 'nueva' ? null : editar} faltaPlanificar={v.falta_planificar ?? 0}
        moneda={v.moneda ?? 'USD'} onCerrar={() => setEditar(null)}
        onAnular={(c) => { setEditar(null); setAnular({ tabla: 'cuota', id: c.id!, titulo: `Anular cuota ${c.orden}` }) }} />}
      {anular && <AnularModal {...anular} onCerrar={() => setAnular(null)} />}
    </>
  )
}

/** Venta sin cuotas: generar su plan desde una plantilla (R-11). */
function GenerarPlan({ ventaId }: { ventaId: string }) {
  const qc = useQueryClient()
  const { data: plantillas } = usePlantillas()
  const m = useMutation({
    mutationFn: async (plantilla: number) => ok(await supabase.rpc('generar_cuotas', { p_venta: ventaId, p_plantilla: plantilla })),
    onSuccess: () => qc.invalidateQueries(),
  })
  return (
    <Select value="" disabled={m.isPending} onChange={(e) => m.mutate(Number(e.target.value))} aria-label="Generar plan de pagos">
      <option value="">Generar plan de pagos…</option>
      {plantillas?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
    </Select>
  )
}
