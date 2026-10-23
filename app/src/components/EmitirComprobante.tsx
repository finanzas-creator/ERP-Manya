import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEmpresas } from '../lib/catalogos'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, hoyISO, pct } from '../lib/formato'
import { Boton, Campo, Input, MensajeError, Modal, Select } from './ui'

/** Emitir un comprobante agrupando cuotas por facturar del mismo cliente (R-20, R-21, R-22). */
export function EmitirComprobante({ clienteId, preseleccion, onCerrar }:
  { clienteId: string; preseleccion: string[]; onCerrar: () => void }) {
  const qc = useQueryClient()
  const { data: empresas } = useEmpresas()
  const [empresa, setEmpresa] = useState<number | ''>('')
  const [tipo, setTipo] = useState('factura')
  const [serie, setSerie] = useState('')
  const [emision, setEmision] = useState(hoyISO())
  const [limite, setLimite] = useState('')
  const [elegidas, setElegidas] = useState<string[]>(preseleccion)
  const [detraccion, setDetraccion] = useState<number | null>(null)

  const cuotas = useQuery({
    queryKey: ['por-facturar', clienteId],
    queryFn: async () => ok(await supabase.from('v_cuota').select('id, orden, concepto, servicio, marca, monto_neto, total, moneda, fecha_contrato')
      .eq('cliente_id', clienteId).is('comprobante_id', null).eq('pagada', false).order('fecha_contrato').order('venta_id').order('orden')),
  })

  // R-39: series de la empresa elegida; se propone el siguiente número de la primera
  const series = useQuery({
    queryKey: ['series', empresa, tipo], enabled: !!empresa && tipo !== 'comanda',
    queryFn: async () => ok(await supabase.from('v_serie_comprobante').select('serie, siguiente')
      .eq('empresa_id', Number(empresa)).eq('tipo', tipo as 'factura').eq('activo', true).order('serie')),
  })
  useEffect(() => { if (series.data?.[0]) setSerie(series.data[0].siguiente!) }, [series.data])

  useEffect(() => {   // detracción sugerida por la regla R-22; editable
    if (!elegidas.length) { setDetraccion(null); return }
    supabase.rpc('detraccion_sugerida', { p_tipo: tipo, p_cuotas: elegidas, p_fecha: emision })
      .then((r) => setDetraccion(Number(r.data ?? 0)))
  }, [elegidas, tipo, emision])

  const sel = cuotas.data?.filter((c) => elegidas.includes(c.id!)) ?? []
  const moneda = sel[0]?.moneda ?? 'USD'
  const total = sel.reduce((s, c) => s + (c.total ?? 0), 0)

  const emitir = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error('Elige la empresa emisora')
      ok(await supabase.rpc('emitir_comprobante', {
        p_empresa: empresa, p_tipo: tipo, p_serie_numero: serie, p_fecha_emision: emision,
        p_cuotas: elegidas, p_fecha_limite: limite || null, p_pct_detraccion: detraccion }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })

  return (
    <Modal titulo="Emitir comprobante" onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Empresa emisora">
          <Select value={empresa} onChange={(e) => setEmpresa(Number(e.target.value))}>
            <option value="">Seleccionar…</option>
            {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </Select>
        </Campo>
        <Campo label="Tipo">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="factura">Factura</option><option value="boleta">Boleta</option>
            <option value="recibo_honorarios">Recibo por honorarios</option><option value="comanda">Comanda (interna)</option>
          </Select>
        </Campo>
        {tipo !== 'comanda' && <Campo label="Serie-número" ayuda={series.data && series.data.length > 1
            ? <>Otras series: {series.data.slice(1).map((x) => <button key={x.serie} type="button" className="mr-2 text-accent hover:underline" onClick={() => setSerie(x.siguiente!)}>{x.siguiente}</button>)}</>
            : series.data?.length ? 'Siguiente número de la serie' : undefined}>
          <Input placeholder="E001-1234" value={serie} onChange={(e) => setSerie(e.target.value)} /></Campo>}
        <Campo label="Fecha de emisión"><Input type="date" value={emision} onChange={(e) => setEmision(e.target.value)} /></Campo>
        <Campo label="Vence (según cliente)"><Input type="date" value={limite} onChange={(e) => setLimite(e.target.value)} /></Campo>
        <Campo label="% detracción" ayuda="Sugerido por la regla R-22">
          <Input type="number" step="0.01" value={detraccion == null ? '' : detraccion * 100}
            onChange={(e) => setDetraccion(Number(e.target.value) / 100)} />
        </Campo>
      </div>
      <div className="mt-4 text-xs font-medium text-t2">Cuotas a incluir</div>
      <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line">
        {cuotas.data?.map((c) => (
          <label key={c.id} className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm last:border-0">
            <input type="checkbox" checked={elegidas.includes(c.id!)}
              onChange={(e) => setElegidas(e.target.checked ? [...elegidas, c.id!] : elegidas.filter((x) => x !== c.id))} />
            <span className="flex-1">{[c.marca, c.servicio, c.concepto].filter(Boolean).join(' · ')} <span className="text-t3">(venta del {fecha(c.fecha_contrato)})</span></span>
            <span className="num">{dinero(c.total, c.moneda)}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-sm">
        <span className="text-t2">Total del comprobante</span>
        <span className="num font-semibold">{dinero(total, moneda)}{detraccion ? <span className="ml-2 font-normal text-t3">detracción {pct(detraccion)} = {dinero(total * detraccion, moneda)}</span> : null}</span>
      </div>
      <div className="mt-3"><MensajeError error={emitir.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!elegidas.length || emitir.isPending} onClick={() => emitir.mutate()}>Emitir</Boton>
      </div>
    </Modal>
  )
}
