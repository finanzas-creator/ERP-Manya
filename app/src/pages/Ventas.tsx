import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, finDeMes, mesActual, usd } from '../lib/formato'
import { Boton, Card, Estado, Input, Select, SelectorMes, Tabla, Titulo } from '../components/ui'
import { Icono } from '../components/iconos'

const COLS = 'id, codigo, fecha_contrato, cliente, marca, servicio, categoria, modalidad, naturaleza, moneda, monto_neto, monto_neto_usd, estado_plan, estado_cobro, saldo'

export default function Ventas() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mes, setMes] = useState(params.get('mes') ?? mesActual())
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('')

  const { data } = useQuery({
    queryKey: ['ventas', mes],
    queryFn: async () => ok(await supabase.from('v_venta').select(COLS)
      .gte('fecha_contrato', mes).lte('fecha_contrato', finDeMes(mes)).order('fecha_contrato', { ascending: false })),
  })
  const t = texto.toLowerCase()
  const filas = data?.filter((v) =>
    (!t || `${v.cliente} ${v.marca} ${v.servicio} ${v.codigo}`.toLowerCase().includes(t)) &&
    (!estado || v.estado_cobro === estado || v.estado_plan === estado))
  const totalPropio = filas?.filter((v) => v.naturaleza === 'propio').reduce((s, v) => s + (v.monto_neto_usd ?? 0), 0) ?? 0

  return (
    <>
      <Titulo accion={<Link to="/ventas/nueva"><Boton variante="primario"><Icono nombre="mas" />Nueva venta</Boton></Link>}>Ventas</Titulo>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SelectorMes mes={mes} onCambio={setMes} />
        <Input placeholder="Buscar cliente, marca, servicio…" value={texto} onChange={(e) => setTexto(e.target.value)} className="min-w-0 flex-1 sm:max-w-xs" />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="vencida">Vencidas</option>
          <option value="por_cobrar">Por cobrar</option>
          <option value="pagada">Pagadas</option>
          <option value="falta_planificar">Falta planificar</option>
          <option value="sin_plan">Sin plan de pagos</option>
        </Select>
      </div>
      <Card titulo={<>{filas?.length ?? 0} ventas · <span className="num">{usd(totalPropio)}</span> <span className="font-normal text-t3">(sin terceros)</span></>}>
        <Tabla filas={filas} clave={(v) => v.id!} onFila={(v) => navigate(`/ventas/${v.id}`)} columnas={[
          { titulo: 'Fecha', celda: (v) => <span className="whitespace-nowrap">{fecha(v.fecha_contrato)}</span> },
          { titulo: 'Cliente', celda: (v) => <><div className="font-medium">{v.marca ?? v.cliente}</div><div className="text-xs text-t3">{v.cliente}</div></> },
          { titulo: 'Servicio', celda: (v) => <><div>{v.servicio}</div><div className="text-xs text-t3">{v.categoria}{v.naturaleza === 'terceros' ? ' · terceros' : ''}</div></> },
          { titulo: 'Monto neto', derecha: true, celda: (v) => dinero(v.monto_neto, v.moneda) },
          { titulo: 'Saldo', derecha: true, celda: (v) => dinero(v.saldo, v.moneda) },
          { titulo: 'Plan', celda: (v) => <Estado valor={v.estado_plan} /> },
          { titulo: 'Cobro', celda: (v) => <Estado valor={v.estado_cobro} /> },
        ]} />
      </Card>
    </>
  )
}
