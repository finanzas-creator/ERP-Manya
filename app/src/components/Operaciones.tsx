import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, hoyISO } from '../lib/formato'
import { useCuentas } from '../lib/catalogos'
import { Boton, Campo, Input, MensajeError, Modal, Select, Tabla } from './ui'

/** Pagos y devoluciones agrupados por operación bancaria (R-40, R-41). Se anula la operación entera. */
export function Operaciones({ ventaId, cuotaIds, compacta }: { ventaId?: string; cuotaIds?: string[]; compacta?: boolean }) {
  const [anular, setAnular] = useState<string | null>(null)
  const { data } = useQuery({
    queryKey: ['operaciones', ventaId ?? cuotaIds?.join(',')],
    enabled: !!ventaId || !!cuotaIds?.length,
    queryFn: async () => {
      let q = supabase.from('v_operacion_pago').select('*').order('fecha')
      q = ventaId ? q.contains('ventas', [ventaId]) : q.overlaps('cuotas_ids', cuotaIds!)
      return ok(await q)
    },
  })
  return (
    <>
      <Tabla compacta={compacta} filas={data} clave={(o) => o.operacion!} vacio="Aún no hay pagos" columnas={[
        { titulo: 'Fecha', celda: (o) => <span className="whitespace-nowrap">{fecha(o.fecha)}</span> },
        { titulo: 'Cuenta', celda: (o) => <>
          <div>{o.es_devolucion ? <span className="font-medium text-critical">Devolución · </span> : null}{o.cuenta}{o.es_detraccion && <span className="ml-1 text-xs text-t3">(detracción)</span>}</div>
          <div className="text-xs text-t3">{[o.numero_operacion && `Op. ${o.numero_operacion}`, (o.cuotas ?? 0) > 1 && `${o.cuotas} cuotas`, o.detalle].filter(Boolean).join(' · ')}</div>
        </> },
        { titulo: 'Monto', derecha: true, celda: (o) => <span className={o.es_devolucion ? 'text-critical' : ''}>{o.es_devolucion ? '− ' : ''}{dinero(o.monto, o.moneda_cuenta)}</span> },
        ...(compacta ? [] : [{ titulo: 'TC', derecha: true, celda: (o: NonNullable<typeof data>[number]) => (Number(o.tc) === 1 ? '—' : o.tc) }]),
        { titulo: '', celda: (o) => <Boton variante="fantasma" onClick={() => setAnular(o.operacion!)}>Anular</Boton> },
      ]} />
      {anular && <AnularOperacion operacion={anular} onCerrar={() => setAnular(null)} />}
    </>
  )
}

function AnularOperacion({ operacion, onCerrar }: { operacion: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const m = useMutation({
    mutationFn: async () => ok(await supabase.rpc('anular_operacion', { p_operacion: operacion, p_motivo: motivo })),
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo="Anular operación" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-t2">Se anula la operación completa (todas las cuotas a las que se repartió). Úsalo si se registró por error;
        si el dinero sí entró y luego se devolvió al cliente, registra una devolución. Queda en la bitácora con su motivo.</p>
      <Campo label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
      <div className="mt-3"><MensajeError error={m.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="peligro" disabled={!motivo.trim() || m.isPending} onClick={() => m.mutate()}>Anular</Boton>
      </div>
    </Modal>
  )
}

/** R-41: devolver dinero al cliente de una factura (sale de una cuenta de la empresa emisora). */
export function DevolucionModal({ comprobanteId, empresaId, descripcion, onCerrar }:
  { comprobanteId: string; empresaId?: number | null; descripcion: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const { data: cuentas } = useCuentas()
  const [f, setF] = useState({ fecha: hoyISO(), cuenta: '', monto: '', tc: '1', detalle: '', operacion: '' })
  const cuenta = cuentas?.find((c) => String(c.id) === f.cuenta)
  const m = useMutation({
    mutationFn: async () => {
      if (!cuenta || !(Number(f.monto) > 0)) throw new Error('Completa cuenta y monto')
      ok(await supabase.rpc('registrar_devolucion', { p_comprobante: comprobanteId, p_fecha: f.fecha, p_cuenta: cuenta.id, p_monto: Number(f.monto),
        p_tc: cuenta.moneda === 'USD' ? 1 : Number(f.tc), p_detalle: f.detalle, p_numero_operacion: f.operacion || null }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`Devolver dinero · ${descripcion}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-t2">Dinero que la empresa devuelve al cliente (por ejemplo, tras una nota de crédito). Baja lo cobrado y, si corresponde, vuelve a abrir el saldo (R-41).</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo label="Sale de la cuenta">
          <Select value={f.cuenta} onChange={(e) => setF({ ...f, cuenta: e.target.value })}>
            <option value="">Seleccionar…</option>
            {cuentas?.filter((c) => !c.es_detraccion && (!empresaId || c.empresa_id === empresaId)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        </Campo>
        <Campo label={`Monto${cuenta ? ` (${cuenta.moneda})` : ''}`}><Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></Campo>
        {cuenta?.moneda === 'PEN' && <Campo label="Tipo de cambio"><Input type="number" step="0.001" value={f.tc} onChange={(e) => setF({ ...f, tc: e.target.value })} /></Campo>}
        <Campo label="N° de operación"><Input value={f.operacion} onChange={(e) => setF({ ...f, operacion: e.target.value })} /></Campo>
        <div className="sm:col-span-2"><Campo label="Motivo"><Input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} placeholder="Ej.: devolución por nota de crédito E001-12" /></Campo></div>
      </div>
      <div className="mt-3"><MensajeError error={m.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={m.isPending} onClick={() => m.mutate()}>Registrar devolución</Boton>
      </div>
    </Modal>
  )
}
