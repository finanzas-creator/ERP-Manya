import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { dinero } from '../lib/formato'
import { Boton, Campo, Input, MensajeError, Modal } from './ui'
import type { Fila } from '../lib/db'

type Cuota = Fila<'v_cuota'>

/** Crear o editar una cuota del plan de pagos (R-10, R-13, R-14). */
export function CuotaModal({ ventaId, cuota, faltaPlanificar, moneda, onCerrar, onAnular }:
  { ventaId: string; cuota: Cuota | null; faltaPlanificar: number; moneda: string
    onCerrar: () => void; onAnular: (c: Cuota) => void }) {
  const qc = useQueryClient()
  const [concepto, setConcepto] = useState(cuota?.concepto ?? '')
  const [monto, setMonto] = useState(String(cuota?.monto_neto ?? Math.max(faltaPlanificar, 0).toFixed(2)))
  const [limite, setLimite] = useState(cuota?.fecha_limite_contrato ?? '')
  const facturada = !!cuota?.comprobante_id

  const guardar = useMutation({
    mutationFn: async () => {
      const m = Number(monto)
      if (!(m > 0)) throw new Error('El monto debe ser mayor que cero')
      if (cuota) {
        ok(await supabase.from('cuota').update({ concepto: concepto.trim() || 'Cuota', monto_neto: m, fecha_limite: limite || null })
          .eq('id', cuota.id!))
      } else {
        ok(await supabase.rpc('agregar_cuota', { p_venta: ventaId, p_concepto: concepto, p_fecha_limite: limite || null, p_monto: m }))
      }
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })

  return (
    <Modal titulo={cuota ? `Editar cuota ${cuota.orden}` : 'Agregar cuota'} onCerrar={onCerrar}>
      {facturada && <p className="mb-3 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">Esta cuota ya está facturada: solo el administrador puede cambiar su monto (R-13).</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Concepto"><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="50% inicial" autoFocus /></Campo></div>
        <Campo label={`Monto neto (${moneda})`} ayuda={!cuota && faltaPlanificar > 0 ? `Falta planificar ${dinero(faltaPlanificar, moneda)}` : undefined}>
          <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
        <Campo label="Vence (según contrato)"><Input type="date" value={limite} onChange={(e) => setLimite(e.target.value)} /></Campo>
      </div>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div>{cuota && <Boton variante="peligro" onClick={() => onAnular(cuota)}>Anular cuota</Boton>}</div>
        <div className="flex gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
        </div>
      </div>
    </Modal>
  )
}
