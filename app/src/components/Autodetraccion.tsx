import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, hoyISO } from '../lib/formato'
import { Boton, Campo, Card, Input, MensajeError, Modal, Nota, Tabla } from './ui'

const CARPETA = 'constancias'

/** Abre la constancia guardada (enlace temporal: la carpeta es privada). */
export async function verConstancia(ruta: string) {
  const { data, error } = await supabase.storage.from(CARPETA).createSignedUrl(ruta, 120)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank', 'noopener')
}

/** R-36: registrar el depósito de la autodetracción con su constancia de pago. */
export function AutodetraccionModal({ comprobanteId, descripcion, onCerrar }:
  { comprobanteId: string; descripcion: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [dia, setDia] = useState(hoyISO())
  const [operacion, setOperacion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const guardar = useMutation({
    mutationFn: async () => {
      if (!archivo) throw new Error('Adjunta la constancia de pago de la detracción')
      const ruta = `autodetraccion/${comprobanteId}/${Date.now()}-${archivo.name.replace(/[^\w.-]+/g, '_')}`
      const { error } = await supabase.storage.from(CARPETA).upload(ruta, archivo)
      if (error) throw new Error(`No se pudo subir la constancia: ${error.message}`)
      ok(await supabase.from('comprobante').update({ autodetraccion_fecha: dia, autodetraccion_operacion: operacion.trim() || null,
        autodetraccion_constancia: ruta }).eq('id', comprobanteId))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`Autodetracción · ${descripcion}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-t2">El cliente pagó la factura completa sin depositar la detracción, así que la agencia debe depositarla.
        Al adjuntar la constancia, la autodetracción queda conforme y sale de las alertas (R-36).</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Fecha del depósito"><Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
        <Campo label="N° de operación / constancia"><Input value={operacion} onChange={(e) => setOperacion(e.target.value)} /></Campo>
        <div className="sm:col-span-2">
          <Campo label="Constancia de pago (PDF o imagen)">
            <Input type="file" accept="application/pdf,image/*" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </Campo>
        </div>
      </div>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>{guardar.isPending ? 'Subiendo…' : 'Guardar'}</Boton>
      </div>
    </Modal>
  )
}

/** Autodetracciones pendientes (alerta hasta subir la constancia). */
export function AutodetraccionesPendientes() {
  const [registrar, setRegistrar] = useState<{ id: string; descripcion: string } | null>(null)
  const { data } = useQuery({
    queryKey: ['autodetracciones'],
    queryFn: async () => ok(await supabase.from('v_autodetraccion').select('*').eq('estado', 'pendiente').order('fecha_pago_completo')),
  })
  if (!data?.length) return null
  return (
    <Card titulo={<span className="text-critical">Autodetracciones pendientes · {data.length}</span>} className="mt-4">
      <div className="max-h-96 overflow-y-auto">
        <Tabla filas={data} clave={(a) => a.comprobante_id!} columnas={[
          { titulo: 'Comprobante', celda: (a) => <><div>{a.serie_numero}</div><div className="text-xs text-t3">{a.empresa} · emitido {fecha(a.fecha_emision)}</div></> },
          { titulo: 'Cliente', celda: (a) => a.cliente },
          { titulo: 'Pagado el', celda: (a) => <span className="whitespace-nowrap">{fecha(a.fecha_pago_completo)}</span> },
          { titulo: 'Total', derecha: true, celda: (a) => dinero(a.total, a.moneda) },
          { titulo: 'Detracción a depositar', derecha: true, celda: (a) => <b>{dinero(a.detraccion_pen, 'PEN')}</b> },
          { titulo: '', celda: (a) => <Boton onClick={() => setRegistrar({ id: a.comprobante_id!, descripcion: `${a.serie_numero} · ${a.cliente}` })}>Registrar</Boton> },
        ]} />
      </div>
      <Nota>Facturas que el cliente pagó completas al banco sin depositar la detracción: la agencia debe depositarla (R-36). Salen de esta lista al adjuntar la constancia. Se revisan las emitidas desde la fecha indicada en Configuración.</Nota>
      {registrar && <AutodetraccionModal comprobanteId={registrar.id} descripcion={registrar.descripcion} onCerrar={() => setRegistrar(null)} />}
    </Card>
  )
}
