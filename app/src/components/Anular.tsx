import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { Boton, Campo, Input, MensajeError, Modal } from './ui'

export type TablaAnulable = 'venta' | 'cuota' | 'comprobante' | 'pago'

const EFECTO: Record<TablaAnulable, string> = {
  venta: 'La venta deja de contar en todos los cálculos.',
  cuota: 'La cuota sale del plan de pagos.',
  comprobante: 'Sus cuotas vuelven a quedar por facturar.',
  pago: 'El monto vuelve al saldo pendiente.',
}

/** Anular cualquier registro con motivo; queda en la bitácora (R-81). */
export function AnularModal({ tabla, id, titulo, onCerrar, onListo }:
  { tabla: TablaAnulable; id: string; titulo: string; onCerrar: () => void; onListo?: () => void }) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const m = useMutation({
    mutationFn: async () => ok(await supabase.rpc('anular', { p_tabla: tabla, p_id: id, p_motivo: motivo })),
    onSuccess: () => { qc.invalidateQueries(); onCerrar(); onListo?.() },
  })
  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-t2">{EFECTO[tabla]} Queda registrado en la bitácora con su motivo.</p>
      <Campo label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
      <div className="mt-3"><MensajeError error={m.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="peligro" disabled={!motivo.trim() || m.isPending} onClick={() => m.mutate()}>Anular</Boton>
      </div>
    </Modal>
  )
}
