import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCuentas } from '../lib/catalogos'
import { ok, supabase } from '../lib/supabase'
import { dinero, hoyISO } from '../lib/formato'
import { Boton, Campo, Input, MensajeError, Modal, Select } from './ui'

type Objetivo =
  | { tipo: 'cuota'; id: string; saldo: number; moneda: string; descripcion: string; empresaId?: number | null }
  | { tipo: 'comprobante'; id: string; saldo: number; moneda: string; descripcion: string; empresaId?: number | null }

/** Registrar un pago a una cuota (R-30) o a un comprobante completo (R-32). */
export function PagoModal({ objetivo, onCerrar }: { objetivo: Objetivo; onCerrar: () => void }) {
  const qc = useQueryClient()
  const { data: cuentas } = useCuentas()
  const [fecha, setFecha] = useState(hoyISO())
  const [cuentaId, setCuentaId] = useState<number | ''>('')
  const [tc, setTc] = useState(1)
  const [monto, setMonto] = useState('')
  const cuenta = cuentas?.find((c) => c.id === cuentaId)
  // R-39: primero las cuentas de la empresa que emitió el comprobante
  const propia = (c: { empresa_id: number | null }) => !objetivo.empresaId || !c.empresa_id || c.empresa_id === objetivo.empresaId
  const otraEmpresa = !!cuenta && !propia(cuenta)

  // TC del mes (R-06) cuando la cuenta está en otra moneda que la venta
  useEffect(() => {
    if (!cuenta || cuenta.moneda === objetivo.moneda) { setTc(1); return }
    supabase.rpc('tc_de', { fecha }).then((r) => setTc(Number(r.data) || 1))
  }, [cuenta, fecha, objetivo.moneda])

  // Sugerir el saldo expresado en la moneda de la cuenta
  useEffect(() => {
    if (!cuenta) return
    const enCuenta = cuenta.moneda === objetivo.moneda ? objetivo.saldo
      : cuenta.moneda === 'PEN' ? objetivo.saldo * tc : objetivo.saldo / tc
    setMonto(enCuenta.toFixed(2))
  }, [cuenta, tc, objetivo.saldo, objetivo.moneda])

  const guardar = useMutation({
    mutationFn: async () => {
      const m = Number(monto)
      if (!cuenta || !(m > 0)) throw new Error('Completa cuenta y monto')
      const tcPago = cuenta.moneda === 'USD' ? 1 : tc
      if (objetivo.tipo === 'cuota') {
        ok(await supabase.from('pago').insert({ cuota_id: objetivo.id, fecha, cuenta_id: cuenta.id, monto: m, tc: tcPago }))
      } else {
        ok(await supabase.rpc('registrar_pago_comprobante', {
          p_comprobante: objetivo.id, p_fecha: fecha, p_cuenta: cuenta.id, p_monto: m, p_tc: tcPago }))
      }
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })

  return (
    <Modal titulo="Registrar pago" onCerrar={onCerrar}>
      <div className="mb-3 text-sm text-t2">{objetivo.descripcion} · saldo <b className="num text-t1">{dinero(objetivo.saldo, objetivo.moneda)}</b></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Fecha de pago"><Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
        <Campo label="Cuenta" ayuda={otraEmpresa
            ? <span className="text-warning">Es una cuenta de la otra empresa: se registra, pero queda para regularizar entre empresas (R-39).</span>
            : cuenta?.es_detraccion ? 'Cuenta de detracciones (R-31)' : undefined}>
          <Select value={cuentaId} onChange={(e) => setCuentaId(Number(e.target.value))}>
            <option value="">Seleccionar…</option>
            <optgroup label={objetivo.empresaId ? 'Cuentas de la empresa emisora' : 'Cuentas'}>
              {cuentas?.filter(propia).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </optgroup>
            {objetivo.empresaId && <optgroup label="Cuentas de la otra empresa">
              {cuentas?.filter((c) => !propia(c)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </optgroup>}
          </Select>
        </Campo>
        <Campo label={`Monto recibido${cuenta ? ` (${cuenta.moneda})` : ''}`}>
          <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Campo>
        {cuenta?.moneda === 'PEN' && (
          <Campo label="Tipo de cambio"><Input type="number" step="0.001" value={tc} onChange={(e) => setTc(Number(e.target.value))} /></Campo>
        )}
      </div>
      {objetivo.tipo === 'comprobante' && <p className="mt-3 text-xs text-t3">El monto se reparte entre las cuotas del comprobante según su saldo (R-32).</p>}
      <div className="mt-4"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Registrar pago</Boton>
      </div>
    </Modal>
  )
}
