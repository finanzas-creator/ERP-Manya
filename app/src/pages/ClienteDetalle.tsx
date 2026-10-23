import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, usd } from '../lib/formato'
import { Boton, Campo, Card, Estado, Input, Kpi, MensajeError, Modal, Select, Tabla, Titulo } from '../components/ui'
import { Icono } from '../components/iconos'
import { HistorialGestion } from '../components/GestionCobranza'

/** Ficha del cliente: deuda, servicios y ventas, con edición de sus datos y marcas. */
export default function ClienteDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [editar, setEditar] = useState(false)
  const [nuevaMarca, setNuevaMarca] = useState(false)
  const cliente = useQuery({
    queryKey: ['cliente', id],
    queryFn: async () => ok(await supabase.from('v_cliente').select('*').eq('id', id!).single()),
  })
  const cartera = useQuery({
    queryKey: ['cobranza-cliente', id],
    queryFn: async () => ok(await supabase.from('v_cobranza').select('id, venta_id, serie_numero, servicio, marca, vencimiento, dias_atraso, tramo, saldo, moneda')
      .eq('cliente_id', id!).order('vencimiento')),
  })
  const servicios = useQuery({
    queryKey: ['renovacion-cliente', id],
    queryFn: async () => ok(await supabase.from('v_renovacion').select('*').eq('cliente_id', id!).order('vence')),
  })
  const ventas = useQuery({
    queryKey: ['ventas-cliente', id],
    queryFn: async () => ok(await supabase.from('v_venta').select('id, fecha_contrato, marca, servicio, naturaleza, moneda, monto_neto, saldo, estado_cobro')
      .eq('cliente_id', id!).order('fecha_contrato', { ascending: false }).limit(60)),
  })
  const c = cliente.data
  const fiscal = useQuery({
    queryKey: ['cliente-fiscal', id],
    queryFn: async () => ok(await supabase.from('cliente').select('tipo_documento, direccion_fiscal, correo_facturacion').eq('id', id!).single()),
  })

  return (
    <>
      <div className="mb-1"><Link to="/clientes" className="text-sm text-t2 hover:text-t1">← Clientes</Link></div>
      <Titulo accion={<div className="flex gap-2">
        <Boton onClick={() => setEditar(true)}>Editar datos</Boton>
        <Link to={`/ventas/nueva?cliente=${id}`}><Boton variante="primario"><Icono nombre="mas" />Nueva venta</Boton></Link>
      </div>}>{c?.razon_social ?? 'Cliente'}</Titulo>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-t2">
        <span>{fiscal.data?.tipo_documento ?? 'RUC'} {c?.ruc ?? '—'}</span>
        {fiscal.data?.direccion_fiscal && <span className="truncate">{fiscal.data.direccion_fiscal}</span>}
        {fiscal.data?.correo_facturacion && <span>{fiscal.data.correo_facturacion}</span>}
        {c?.no_domiciliado && <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs text-accent">No domiciliado · sin IGV</span>}
        <span>Marcas: {c?.marcas ?? '—'}</span>
        <button onClick={() => setNuevaMarca(true)} className="text-accent hover:underline">+ marca</button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Por cobrar" valor={usd(c?.por_cobrar_usd)} detalle="facturado sin pagar" />
        <Kpi label="Vencido" valor={usd(c?.vencido_usd)} tono={(c?.vencido_usd ?? 0) > 0 ? 'critical' : undefined} />
        <Kpi label="Ventas 12 meses" valor={usd(c?.ventas_12m_usd)} detalle="sin pauta" />
        <Kpi label="Servicios activos" valor={c?.servicios_activos ?? 0} detalle={`última venta ${fecha(c?.ultima_venta)}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card titulo="Comprobantes por cobrar">
          <Tabla filas={cartera.data} clave={(q) => q.id!} onFila={(q) => navigate(`/ventas/${q.venta_id}`)} vacio="No debe nada" columnas={[
            { titulo: 'Comprobante', celda: (q) => <><div className="whitespace-nowrap">{q.serie_numero ?? 'Comanda'}</div><div className="text-xs text-t3">{q.marca} · {q.servicio}</div></> },
            { titulo: 'Vence', celda: (q) => <span className="whitespace-nowrap">{fecha(q.vencimiento)}</span> },
            { titulo: 'Saldo', derecha: true, celda: (q) => dinero(q.saldo, q.moneda) },
            { titulo: '', celda: (q) => <Estado valor={q.tramo} /> },
          ]} />
        </Card>
        <Card titulo="Servicios mensuales activos">
          <Tabla filas={servicios.data} clave={(s) => s.servicio_contratado_id!} onFila={(s) => navigate(`/ventas/${s.ultima_venta_id}`)} vacio="Sin servicios mensuales activos" columnas={[
            { titulo: 'Servicio', celda: (s) => <><div>{s.servicio}</div><div className="text-xs text-t3">{s.marca}</div></> },
            { titulo: 'Monto', derecha: true, celda: (s) => dinero(s.monto_neto, s.moneda) },
            { titulo: 'Vence', celda: (s) => <span className={`whitespace-nowrap ${(s.dias_para_vencer ?? 0) < 0 ? 'text-critical' : ''}`}>{fecha(s.vence)}</span> },
          ]} />
        </Card>
      </div>

      {c && ((c.por_cobrar_usd ?? 0) > 0) && <div className="mt-4"><HistorialGestion clienteId={id!} cliente={c.razon_social ?? ''} /></div>}

      <Card titulo="Ventas" className="mt-4">
        <Tabla filas={ventas.data} clave={(v) => v.id!} onFila={(v) => navigate(`/ventas/${v.id}`)} vacio="Sin ventas" columnas={[
          { titulo: 'Fecha', celda: (v) => <span className="whitespace-nowrap">{fecha(v.fecha_contrato)}</span> },
          { titulo: 'Servicio', celda: (v) => <><div>{v.servicio}</div><div className="text-xs text-t3">{v.marca}{v.naturaleza === 'terceros' ? ' · terceros' : ''}</div></> },
          { titulo: 'Monto neto', derecha: true, celda: (v) => dinero(v.monto_neto, v.moneda) },
          { titulo: 'Saldo', derecha: true, celda: (v) => dinero(v.saldo, v.moneda) },
          { titulo: 'Cobro', celda: (v) => <Estado valor={v.estado_cobro} /> },
        ]} />
      </Card>

      {editar && c && fiscal.data && <EditarCliente id={id!} inicial={{ razon_social: c.razon_social ?? '', ruc: c.ruc ?? '', no_domiciliado: !!c.no_domiciliado,
        tipo_documento: fiscal.data.tipo_documento, direccion_fiscal: fiscal.data.direccion_fiscal ?? '', correo_facturacion: fiscal.data.correo_facturacion ?? '' }} onCerrar={() => setEditar(false)} />}
      {nuevaMarca && <NuevaMarca clienteId={id!} onCerrar={() => setNuevaMarca(false)} />}
    </>
  )
}

function EditarCliente({ id, inicial, onCerrar }:
  { id: string; inicial: { razon_social: string; ruc: string; no_domiciliado: boolean; tipo_documento: string; direccion_fiscal: string; correo_facturacion: string }; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState(inicial)
  const sunat = useMutation({
    mutationFn: async () => ok(await supabase.rpc('consultar_ruc', { p_ruc: f.ruc.trim() })) as unknown as
      { nombre: string; estado: string; condicion: string; direccion: string },
  })
  const guardar = useMutation({
    mutationFn: async () => {
      if (!f.razon_social.trim()) throw new Error('La razón social no puede quedar vacía')
      ok(await supabase.from('cliente').update({ razon_social: f.razon_social.trim(), ruc: f.ruc.trim() || null, no_domiciliado: f.no_domiciliado,
        tipo_documento: f.tipo_documento as 'RUC', direccion_fiscal: f.direccion_fiscal.trim() || null, correo_facturacion: f.correo_facturacion.trim() || null }).eq('id', id))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo="Datos del cliente" onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo label="Razón social"><Input value={f.razon_social} onChange={(e) => setF({ ...f, razon_social: e.target.value })} autoFocus /></Campo>
        <Campo label="Tipo de documento">
          <Select value={f.tipo_documento} onChange={(e) => setF({ ...f, tipo_documento: e.target.value })}>
            <option value="RUC">RUC</option><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option>
            <option value="PASAPORTE">Pasaporte</option><option value="SIN_DOCUMENTO">Sin documento (no domiciliado)</option>
          </Select>
        </Campo>
        <Campo label="N° de documento">
          <div className="flex gap-2">
            <Input className="flex-1" value={f.ruc} onChange={(e) => { setF({ ...f, ruc: e.target.value }); sunat.reset() }} inputMode="numeric" />
            <Boton onClick={() => sunat.mutate()} disabled={sunat.isPending || f.ruc.trim().length !== 11}>{sunat.isPending ? 'Buscando…' : 'Buscar en SUNAT'}</Boton>
          </div>
        </Campo>
        {sunat.data && <div className="rounded-lg bg-s2 px-3 py-2 text-sm">
          <div className="font-medium">{sunat.data.nombre}</div>
          <div className={`text-xs ${sunat.data.estado === 'ACTIVO' && sunat.data.condicion === 'HABIDO' ? 'text-good' : 'text-critical'}`}>{sunat.data.estado} · {sunat.data.condicion}</div>
          {sunat.data.direccion && <div className="text-xs text-t3">{sunat.data.direccion}</div>}
          <button className="mt-1 text-xs text-accent hover:underline"
            onClick={() => setF({ ...f, razon_social: sunat.data!.nombre, direccion_fiscal: sunat.data!.direccion?.trim() || f.direccion_fiscal })}>Usar estos datos</button>
        </div>}
        <MensajeError error={sunat.error} />
        <Campo label="Dirección fiscal"><Input value={f.direccion_fiscal} onChange={(e) => setF({ ...f, direccion_fiscal: e.target.value })} /></Campo>
        <Campo label="Correo para enviar comprobantes"><Input type="email" value={f.correo_facturacion} onChange={(e) => setF({ ...f, correo_facturacion: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.no_domiciliado} onChange={(e) => setF({ ...f, no_domiciliado: e.target.checked })} />
          No domiciliado (exportación: sus ventas nuevas van sin IGV, R-12)
        </label>
      </div>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
  )
}

function NuevaMarca({ clienteId, onCerrar }: { clienteId: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [nombre, setNombre] = useState('')
  const guardar = useMutation({
    mutationFn: async () => {
      if (!nombre.trim()) throw new Error('Escribe el nombre de la marca')
      ok(await supabase.from('marca').insert({ cliente_id: clienteId, nombre: nombre.trim() }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo="Agregar marca" onCerrar={onCerrar}>
      <Campo label="Nombre de la marca"><Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></Campo>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
  )
}
