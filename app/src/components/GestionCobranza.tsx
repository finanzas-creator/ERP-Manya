import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { fecha, hoyISO, usd } from '../lib/formato'
import { useTiposGestion } from '../lib/catalogos'
import { Boton, Campo, Card, Input, MensajeError, Modal, Select } from './ui'
import { AnularModal } from './Anular'

/** Registrar una acción de cobranza con un cliente (R-38). */
export function GestionModal({ clienteId, cliente, onCerrar }: { clienteId: string; cliente: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const tipos = useTiposGestion()
  const [f, setF] = useState({ fecha: hoyISO(), tipo: '', detalle: '', compromisoFecha: '', compromisoMonto: '', proximoPaso: '', proximaFecha: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const guardar = useMutation({
    mutationFn: async () => {
      if (!f.tipo) throw new Error('Elige qué se hizo')
      if (!f.detalle.trim()) throw new Error('Describe brevemente la gestión')
      ok(await supabase.from('gestion_cobranza').insert({
        cliente_id: clienteId, fecha: f.fecha, tipo_id: Number(f.tipo), detalle: f.detalle.trim(),
        compromiso_fecha: f.compromisoFecha || null, compromiso_monto: f.compromisoMonto ? Number(f.compromisoMonto) : null,
        proximo_paso: f.proximoPaso.trim() || null, proxima_fecha: f.proximaFecha || null }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`Gestión de cobranza · ${cliente}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Fecha"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
        <Campo label="Qué se hizo">
          <Select value={f.tipo} onChange={set('tipo')} autoFocus>
            <option value="">Elige…</option>
            {tipos.data?.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </Select>
        </Campo>
        <div className="sm:col-span-2"><Campo label="Detalle"><Input value={f.detalle} onChange={set('detalle')} placeholder="Con quién se habló y qué dijo" /></Campo></div>
        <Campo label="Prometió pagar el" ayuda="Opcional"><Input type="date" value={f.compromisoFecha} onChange={set('compromisoFecha')} /></Campo>
        <Campo label="Monto prometido (USD)" ayuda="Opcional"><Input type="number" step="0.01" value={f.compromisoMonto} onChange={set('compromisoMonto')} /></Campo>
        <Campo label="Próximo paso"><Input value={f.proximoPaso} onChange={set('proximoPaso')} placeholder="Ej.: volver a llamar" /></Campo>
        <Campo label="Fecha del próximo paso"><Input type="date" value={f.proximaFecha} onChange={set('proximaFecha')} /></Campo>
      </div>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
  )
}

/** Historial de gestiones de cobranza de un cliente. */
export function HistorialGestion({ clienteId, cliente }: { clienteId: string; cliente: string }) {
  const [nueva, setNueva] = useState(false)
  const [anular, setAnular] = useState<string | null>(null)
  const { data } = useQuery({
    queryKey: ['gestion', clienteId],
    queryFn: async () => ok(await supabase.from('v_gestion_cobranza').select('*').eq('cliente_id', clienteId)
      .order('fecha', { ascending: false }).order('registrado_en', { ascending: false })),
  })
  return (
    <Card titulo="Gestión de cobranza" accion={<Boton onClick={() => setNueva(true)}>+ Registrar gestión</Boton>}>
      {data?.length === 0 && <div className="px-4 py-6 text-center text-sm text-t3">Aún no hay gestiones registradas.</div>}
      <ol className="divide-y divide-line">
        {data?.map((g) => (
          <li key={g.id} className="flex gap-3 px-4 py-3 text-sm">
            <div className="w-24 shrink-0 text-t3">{fecha(g.fecha)}</div>
            <div className="min-w-0 flex-1">
              <div><span className="font-medium">{g.tipo}</span> · {g.detalle}</div>
              <div className="mt-0.5 text-xs text-t3">
                {g.compromiso_fecha && <>Prometió pagar {g.compromiso_monto ? usd(g.compromiso_monto) + ' ' : ''}el {fecha(g.compromiso_fecha)} · </>}
                {g.proximo_paso && <>Próximo: {g.proximo_paso}{g.proxima_fecha ? ` (${fecha(g.proxima_fecha)})` : ''} · </>}
                {g.registrado_por}
              </div>
            </div>
            <Boton variante="fantasma" onClick={() => setAnular(g.id!)}>Anular</Boton>
          </li>
        ))}
      </ol>
      {nueva && <GestionModal clienteId={clienteId} cliente={cliente} onCerrar={() => setNueva(false)} />}
      {anular && <AnularModal tabla="gestion_cobranza" id={anular} titulo="Anular gestión" onCerrar={() => setAnular(null)} />}
    </Card>
  )
}
