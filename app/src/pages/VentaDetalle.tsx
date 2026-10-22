import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, hoyISO, pct, usd } from '../lib/formato'
import { Boton, Campo, Card, Estado, Input, MensajeError, Modal, Nota, Renglon, Tabla, Titulo, Select } from '../components/ui'
import { usePlantillas } from '../lib/catalogos'
import { PagoModal } from '../components/Pago'
import { EmitirComprobante } from '../components/EmitirComprobante'
import { AnularModal, type TablaAnulable } from '../components/Anular'
import { CuotaModal } from '../components/CuotaModal'
import { AutodetraccionModal, verConstancia } from '../components/Autodetraccion'
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
  const [nuevoCosto, setNuevoCosto] = useState(false)
  const [autodetraccion, setAutodetraccion] = useState<{ id: string; descripcion: string } | null>(null)

  const venta = useQuery({ queryKey: ['venta', id], queryFn: async () => ok(await supabase.from('v_venta').select('*').eq('id', id!).single()) })
  const cuotas = useQuery({ queryKey: ['cuotas', id], queryFn: async () => ok(await supabase.from('v_cuota').select('*').eq('venta_id', id!).order('orden')) })
  // Los comprobantes del cliente se leen juntos y se muestran los que usan las cuotas de esta venta;
  // así la lista se actualiza al emitir sin depender de que primero se recarguen las cuotas.
  const comprobantesCliente = useQuery({
    queryKey: ['comprobantes-cliente', venta.data?.cliente_id],
    enabled: !!venta.data?.cliente_id,
    queryFn: async () => ok(await supabase.from('v_comprobante')
      .select('id, serie_numero, tipo, empresa, empresa_id, cliente, fecha_emision, moneda, total, pct_detraccion, detraccion, pagado_detraccion, saldo, pagado_100, autodetraccion_fecha')
      .eq('cliente_id', venta.data!.cliente_id!).order('fecha_emision')),
  })
  const idsComprobante = new Set((cuotas.data ?? []).map((c) => c.comprobante_id).filter(Boolean))
  const comprobantes = { data: comprobantesCliente.data?.filter((c) => idsComprobante.has(c.id)) }
  const autodetracciones = useQuery({
    queryKey: ['autodetraccion-cliente', venta.data?.cliente_id],
    enabled: !!venta.data?.cliente_id,
    queryFn: async () => ok(await supabase.from('v_autodetraccion').select('comprobante_id, estado, autodetraccion_constancia')
      .eq('cliente_id', venta.data!.cliente_id!)),
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

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
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
          {(comprobantes.data?.length ?? 0) > 0 && <Card titulo="Comprobantes">
            <Tabla filas={comprobantes.data} clave={(c) => c.id!} columnas={[
              { titulo: 'Comprobante', celda: (c) => <><div>{c.serie_numero ?? 'Comanda'}</div><div className="text-xs text-t3">{c.empresa} · {fecha(c.fecha_emision)}</div></> },
              { titulo: 'Total', derecha: true, celda: (c) => dinero(c.total, c.moneda) },
              { titulo: 'Detracción', derecha: true, celda: (c) => (c.pct_detraccion ?? 0) > 0
                ? <><div>{dinero(c.detraccion, c.moneda)} <span className="text-xs text-t3">({pct(c.pct_detraccion)})</span></div>
                    <div className="text-xs text-t3">{c.autodetraccion_fecha ? `autodetracción ${fecha(c.autodetraccion_fecha)}` : `pagada ${dinero(c.pagado_detraccion, c.moneda)}`}</div></>
                : <span className="text-t3">—</span> },
              { titulo: 'Saldo', derecha: true, celda: (c) => dinero(c.saldo, c.moneda) },
              { titulo: '', celda: (c) => <div className="flex justify-end gap-1">
                {c.pagado_100 && (c.detraccion ?? 0) > (c.pagado_detraccion ?? 0) + 0.01 && !autodetracciones.data?.some((a) => a.comprobante_id === c.id && a.estado === 'conforme') &&
                  <Boton variante="fantasma" onClick={() => setAutodetraccion({ id: c.id!, descripcion: `${c.serie_numero} · ${c.cliente}` })}>Autodetracción</Boton>}
                {autodetracciones.data?.find((a) => a.comprobante_id === c.id)?.autodetraccion_constancia &&
                  <Boton variante="fantasma" onClick={() => verConstancia(autodetracciones.data!.find((a) => a.comprobante_id === c.id)!.autodetraccion_constancia!)}>Constancia</Boton>}
                <Boton variante="fantasma" onClick={() => setAnular({ tabla: 'comprobante', id: c.id!, titulo: `Anular ${c.serie_numero ?? 'comanda'}` })}>Anular</Boton>
              </div> },
            ]} />
          </Card>}
          <CostosVenta ventaId={id!} terceros={v.naturaleza === 'terceros'} onAgregar={() => setNuevoCosto(true)}
            onAnular={(c) => setAnular({ tabla: 'costo_directo', id: c.id!, titulo: 'Anular costo' })} />
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
        tipo: 'cuota', id: pagar.id!, saldo: pagar.saldo ?? 0, moneda: pagar.moneda ?? 'USD', empresaId: comp(pagar.comprobante_id)?.empresa_id,
        descripcion: `Cuota ${pagar.orden} · ${pagar.concepto}` }} />}
      {emitir && <EmitirComprobante clienteId={v.cliente_id!} preseleccion={porFacturar.map((c) => c.id!)} onCerrar={() => setEmitir(false)} />}
      {editar && <CuotaModal ventaId={v.id!} cuota={editar === 'nueva' ? null : editar} faltaPlanificar={v.falta_planificar ?? 0}
        moneda={v.moneda ?? 'USD'} onCerrar={() => setEditar(null)}
        onAnular={(c) => { setEditar(null); setAnular({ tabla: 'cuota', id: c.id!, titulo: `Anular cuota ${c.orden}` }) }} />}
      {autodetraccion && <AutodetraccionModal comprobanteId={autodetraccion.id} descripcion={autodetraccion.descripcion} onCerrar={() => setAutodetraccion(null)} />}
      {nuevoCosto && <CostoModal ventaId={v.id!} terceros={v.naturaleza === 'terceros'} moneda={v.moneda ?? 'USD'} onCerrar={() => setNuevoCosto(false)} />}
      {anular && <AnularModal {...anular} onCerrar={() => setAnular(null)} />}
    </>
  )
}

const TIPO_COSTO = { proveedor: 'Proveedor', consumo_pauta: 'Consumo de pauta' } as const

/** Costos directos de la venta y su efecto: GP de la venta (R-61, R-63) o control de pauta (R-64). */
function CostosVenta({ ventaId, terceros, onAgregar, onAnular }:
  { ventaId: string; terceros: boolean; onAgregar: () => void; onAnular: (c: Fila<'v_costo_directo'>) => void }) {
  const costos = useQuery({
    queryKey: ['costos-venta', ventaId],
    queryFn: async () => ok(await supabase.from('v_costo_directo').select('*').eq('venta_id', ventaId).order('fecha')),
  })
  const gp = useQuery({
    queryKey: ['gp-venta', ventaId], enabled: !terceros,
    queryFn: async () => ok(await supabase.from('v_gp_venta').select('*').eq('venta_id', ventaId).maybeSingle()),
  })
  const pauta = useQuery({
    queryKey: ['pauta-venta', ventaId], enabled: terceros,
    queryFn: async () => ok(await supabase.from('v_control_pauta').select('*').eq('venta_id', ventaId).maybeSingle()),
  })
  const g = gp.data, p = pauta.data
  return (
    <Card titulo={terceros ? 'Consumo de pauta' : 'Costos y rentabilidad de la venta'} accion={<Boton onClick={onAgregar}>+ Costo</Boton>}>
      <div className="grid gap-4 md:grid-cols-5">
        <div className="min-w-0 md:col-span-3">
          <Tabla filas={costos.data} clave={(c) => c.id!} vacio={terceros ? 'Aún no se registra el consumo' : 'Sin costos de proveedor'} columnas={[
            { titulo: 'Fecha', celda: (c) => fecha(c.fecha) },
            { titulo: 'Tipo', celda: (c) => <><div>{TIPO_COSTO[c.tipo!]}</div>{c.descripcion && <div className="text-xs text-t3">{c.descripcion}</div>}</> },
            { titulo: 'Monto', derecha: true, celda: (c) => dinero(c.monto, c.moneda) },
            { titulo: '', celda: (c) => <Boton variante="fantasma" onClick={() => onAnular(c)}>Anular</Boton> },
          ]} />
        </div>
        <div className="px-4 py-3 md:col-span-2 md:border-l md:border-line">
          {terceros ? <>
            <Renglon label="Pauta facturada" valor={usd(p?.pauta_usd)} />
            <Renglon sangria label="Consumida" valor={`− ${usd(p?.consumo_usd)}`} />
            <Renglon total label="Diferencia" valor={usd(p?.diferencia_usd)} tono={(p?.diferencia_usd ?? 0) < 0 ? 'critical' : undefined} />
          </> : <>
            <Renglon label="Ingreso" valor={usd(g?.ingreso_usd)} />
            <Renglon sangria label="Costos de proveedor" valor={`− ${usd(g?.costos_directos_usd)}`} />
            <Renglon sangria label="Costo asignado (línea)" valor={`− ${usd(g?.costo_asignado_usd)}`} />
            <Renglon total label="Gross profit" valor={usd(g?.gp_usd)} tono={(g?.gp_usd ?? 0) < 0 ? 'critical' : 'good'} />
          </>}
        </div>
      </div>
      <Nota>{terceros
        ? 'Lo invertido en medios por esta pauta. La diferencia es un control: no entra al gross profit (R-64).'
        : 'Influencers, producción u otros proveedores: se restan de la venta neta y del gross profit una sola vez (R-01, R-61). El costo asignado es la planilla y gastos de su línea repartidos por ingreso (R-63).'}</Nota>
    </Card>
  )
}

function CostoModal({ ventaId, terceros, moneda, onCerrar }: { ventaId: string; terceros: boolean; moneda: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ tipo: terceros ? 'consumo_pauta' : 'proveedor', fecha: hoyISO(), moneda, monto: '', descripcion: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const guardar = useMutation({
    mutationFn: async () => {
      if (!(Number(f.monto) > 0)) throw new Error('El monto debe ser mayor que cero')
      ok(await supabase.from('costo_directo').insert({ venta_id: ventaId, tipo: f.tipo as 'proveedor' | 'consumo_pauta', fecha: f.fecha,
        moneda: f.moneda as 'USD' | 'PEN', monto: Number(f.monto), descripcion: f.descripcion.trim() || null }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo="Registrar costo de la venta" onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Tipo">
          <Select value={f.tipo} onChange={set('tipo')}>
            <option value="proveedor">Proveedor (influencers, producción…)</option>
            {terceros && <option value="consumo_pauta">Consumo de pauta</option>}
          </Select>
        </Campo>
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Moneda"><Select value={f.moneda} onChange={set('moneda')}><option value="USD">Dólares</option><option value="PEN">Soles</option></Select></Campo>
        <Campo label="Monto"><Input type="number" step="0.01" value={f.monto} onChange={set('monto')} autoFocus /></Campo>
        <div className="sm:col-span-2"><Campo label="Detalle"><Input value={f.descripcion} onChange={set('descripcion')} placeholder="Ej.: influencer @cuenta, Meta Ads" /></Campo></div>
      </div>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
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
