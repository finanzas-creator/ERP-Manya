import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useClientes, useConfig, useEquipos, useMarcas, usePersonas, usePlantillas, useServicios } from '../lib/catalogos'
import { ok, supabase } from '../lib/supabase'
import { hoyISO } from '../lib/formato'
import { Boton, Campo, Card, Input, MensajeError, Select, Titulo } from '../components/ui'

export default function NuevaVenta() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: clientes } = useClientes()
  const { data: marcas } = useMarcas()
  const { data: servicios } = useServicios()
  const { data: equipos } = useEquipos()
  const { data: personas } = usePersonas()
  const { data: plantillas } = usePlantillas()
  const { data: config } = useConfig()
  const [params] = useSearchParams()

  const [f, setF] = useState({
    cliente: params.get('cliente') ?? '', modalidad: '', clienteNuevo: '', marca: '', servicio: '', fecha: hoyISO(), fin: '', descripcion: '',
    moneda: 'USD', monto: '', igv: '', equipo: '', partner: '', comision: '', plantilla: '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const servicio = servicios?.find((s) => String(s.id) === f.servicio)
  // R-02: la modalidad del catálogo es la sugerida; el contrato puede fijar otra
  const modalidad = f.modalidad || servicio?.modalidad
  const cliente = clientes?.find((c) => c.id === f.cliente)
  const marcasCliente = useMemo(() => marcas?.filter((m) => m.cliente_id === f.cliente) ?? [], [marcas, f.cliente])
  // R-12: IGV por defecto según el cliente; se muestra y puede cambiarse
  const igvDefecto = cliente?.no_domiciliado ? 0 : (config?.igv_pct ?? 0.18)

  const guardar = useMutation({
    mutationFn: async () => {
      let clienteId = f.cliente
      if (clienteId === '__nuevo') {
        if (!f.clienteNuevo.trim()) throw new Error('Escribe la razón social del cliente nuevo')
        clienteId = (ok(await supabase.from('cliente').insert({ razon_social: f.clienteNuevo.trim() }).select('id').single())).id
      }
      if (!clienteId || !f.servicio || !(Number(f.monto) >= 0) || !f.plantilla) throw new Error('Completa cliente, servicio, monto y forma de pago')
      return ok(await supabase.rpc('registrar_venta', {
        p_cliente: clienteId, p_servicio: Number(f.servicio), p_fecha_contrato: f.fecha, p_monto_neto: Number(f.monto),
        p_plantilla: Number(f.plantilla), p_marca: f.marca || null, p_fecha_fin: f.fin || null,
        p_descripcion: f.descripcion || null, p_moneda: f.moneda,
        p_pct_igv: f.igv === '' ? null : Number(f.igv) / 100, p_equipo: f.equipo ? Number(f.equipo) : null,
        p_partner: f.partner ? Number(f.partner) : null, p_pct_comision: f.comision ? Number(f.comision) / 100 : 0,
        p_modalidad: modalidad ?? null,
      })) as string
    },
    onSuccess: (id) => { qc.invalidateQueries(); navigate(`/ventas/${id}`) },
  })

  return (
    <>
      <Titulo>Nueva venta</Titulo>
      <Card>
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Cliente">
            <Select value={f.cliente} onChange={set('cliente')}>
              <option value="">Seleccionar…</option>
              <option value="__nuevo">+ Cliente nuevo</option>
              {clientes?.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
            </Select>
          </Campo>
          {f.cliente === '__nuevo'
            ? <Campo label="Razón social"><Input value={f.clienteNuevo} onChange={set('clienteNuevo')} /></Campo>
            : <Campo label="Marca">
                <Select value={f.marca} onChange={set('marca')} disabled={!marcasCliente.length}>
                  <option value="">—</option>
                  {marcasCliente.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                </Select>
              </Campo>}
          <Campo label="Servicio" ayuda={servicio?.naturaleza === 'terceros' ? 'De terceros: se factura pero no es venta (R-03)' : undefined}>
            <Select value={f.servicio} onChange={(e) => setF({ ...f, servicio: e.target.value, modalidad: '' })}>
              <option value="">Seleccionar…</option>
              {servicios?.map((s) => <option key={s.id} value={s.id}>{s.nombre} — {(s.categoria as unknown as { nombre: string })?.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Modalidad" ayuda={servicio ? `Sugerida por el catálogo: ${servicio.modalidad}` : 'Elige primero el servicio'}>
            <Select value={modalidad ?? ''} onChange={set('modalidad')} disabled={!servicio}>
              <option value="mensual">Mensual (se renueva cada ciclo)</option>
              <option value="proyecto">Proyecto (ingreso repartido hasta la entrega)</option>
            </Select>
          </Campo>
          <Campo label="Fecha de contrato / inicio"><Input type="date" value={f.fecha} onChange={set('fecha')} /></Campo>
          <Campo label={modalidad === 'proyecto' ? 'Fecha de entrega' : 'Fin del ciclo (siguiente renovación)'}>
            <Input type="date" value={f.fin} onChange={set('fin')} />
          </Campo>
          <Campo label="Moneda">
            <Select value={f.moneda} onChange={set('moneda')}><option>USD</option><option>PEN</option></Select>
          </Campo>
          <Campo label="Monto neto (sin IGV)"><Input type="number" step="0.01" value={f.monto} onChange={set('monto')} /></Campo>
          <Campo label="% IGV" ayuda={`Por defecto ${(igvDefecto * 100).toFixed(0)}%`}>
            <Input type="number" step="1" placeholder={String(igvDefecto * 100)} value={f.igv} onChange={set('igv')} />
          </Campo>
          <Campo label="Forma de pago" ayuda="Genera las cuotas (R-11)">
            <Select value={f.plantilla} onChange={set('plantilla')}>
              <option value="">Seleccionar…</option>
              {plantillas?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Equipo">
            <Select value={f.equipo} onChange={set('equipo')}>
              <option value="">—</option>
              {equipos?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="Partner comercial">
            <Select value={f.partner} onChange={set('partner')}>
              <option value="">—</option>
              {personas?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Campo>
          <Campo label="% comisión"><Input type="number" step="0.5" value={f.comision} onChange={set('comision')} /></Campo>
          <div className="sm:col-span-2 lg:col-span-3">
            <Campo label="Detalle del servicio"><Input value={f.descripcion} onChange={set('descripcion')} /></Campo>
          </div>
        </div>
        <div className="border-t border-line p-4">
          <MensajeError error={guardar.error} />
          <div className="mt-2 flex justify-end gap-2">
            <Boton onClick={() => navigate(-1)}>Cancelar</Boton>
            <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Registrar venta</Boton>
          </div>
        </div>
      </Card>
    </>
  )
}
