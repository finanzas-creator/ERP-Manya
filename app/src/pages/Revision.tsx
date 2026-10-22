import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha } from '../lib/formato'
import { ESTADOS } from '../lib/estados'
import { Card, Estado, Input, Kpi, Nota, Pestanas, Tabla, Titulo } from '../components/ui'

// Ventas cuyo plan de pagos no cuadra con lo vendido (R-10): la lista de trabajo para limpiar datos.
const PROBLEMAS = ['sin_plan', 'falta_planificar', 'sobre_planificado'] as const

export default function Revision() {
  const [vista, setVista] = useState<'plan' | 'empresa'>('plan')
  return (
    <>
      <Titulo>Revisión de datos</Titulo>
      <div className="mb-4"><Pestanas valor={vista} onCambio={setVista} opciones={[
        { clave: 'plan', label: 'Plan de pagos' }, { clave: 'empresa', label: 'Pagos en cuenta de la otra empresa' }]} /></div>
      {vista === 'plan' ? <PlanDescuadrado /> : <PagosOtraEmpresa />}
    </>
  )
}

function PlanDescuadrado() {
  const navigate = useNavigate()
  const [tipo, setTipo] = useState<string>('')
  const [texto, setTexto] = useState('')
  const { data } = useQuery({
    queryKey: ['revision'],
    queryFn: async () => ok(await supabase.from('v_venta')
      .select('id, codigo, fecha_contrato, cliente, marca, servicio, moneda, monto_neto, planificado, falta_planificar, estado_plan')
      .in('estado_plan', [...PROBLEMAS]).order('fecha_contrato', { ascending: false })),
  })
  const t = texto.toLowerCase()
  const filas = data?.filter((v) => (!tipo || v.estado_plan === tipo) &&
    (!t || `${v.cliente} ${v.marca} ${v.servicio} ${v.codigo}`.toLowerCase().includes(t)))

  return (
    <>
      <p className="mb-4 text-sm text-t2">Ventas cuyo plan de pagos no coincide con el monto vendido. Ábrelas para agregar, editar o anular cuotas.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PROBLEMAS.map((k) => (
          <button key={k} onClick={() => setTipo(tipo === k ? '' : k)} className={`text-left ${tipo === k ? 'rounded-xl ring-2 ring-accent' : ''}`}>
            <Kpi label={ESTADOS[k].label} valor={data?.filter((v) => v.estado_plan === k).length ?? '…'} tono={k === 'falta_planificar' ? undefined : 'critical'} />
          </button>
        ))}
      </div>
      <div className="my-3"><Input placeholder="Buscar cliente, marca, servicio…" value={texto} onChange={(e) => setTexto(e.target.value)} className="w-full sm:max-w-xs" /></div>
      <Card titulo={`${filas?.length ?? 0} ventas por revisar`}>
        <Tabla filas={filas} clave={(v) => v.id!} onFila={(v) => navigate(`/ventas/${v.id}`)} vacio="Todo cuadra" columnas={[
          { titulo: 'Fecha', celda: (v) => <span className="whitespace-nowrap">{fecha(v.fecha_contrato)}</span> },
          { titulo: 'Cliente', celda: (v) => <><div className="font-medium">{v.marca ?? v.cliente}</div><div className="text-xs text-t3">{v.servicio}</div></> },
          { titulo: 'Vendido', derecha: true, celda: (v) => dinero(v.monto_neto, v.moneda) },
          { titulo: 'Planificado', derecha: true, celda: (v) => dinero(v.planificado, v.moneda) },
          { titulo: 'Diferencia', derecha: true, celda: (v) => dinero(v.falta_planificar, v.moneda) },
          { titulo: 'Problema', celda: (v) => <Estado valor={v.estado_plan} /> },
        ]} />
      </Card>
    </>
  )
}

/** R-39: pagos que entraron a una cuenta de la otra empresa; se regularizan entre empresas. */
function PagosOtraEmpresa() {
  const navigate = useNavigate()
  const [soloDetraccion, setSoloDetraccion] = useState(false)
  const { data } = useQuery({
    queryKey: ['pago_otra_empresa'],
    queryFn: async () => ok(await supabase.from('v_pago_otra_empresa').select('*').order('fecha', { ascending: false })),
  })
  const filas = data?.filter((p) => !soloDetraccion || p.es_detraccion)
  return (
    <>
      <p className="mb-4 text-sm text-t2">Templates Art SAC y Manya Media EIRL son empresas distintas: el pago de una factura debe entrar a una cuenta de la empresa que la emitió.
        Estos pagos entraron a la cuenta de la otra. Las <b>detracciones</b> en el Banco de la Nación de la otra empresa casi siempre son un error de registro
        (la detracción se deposita al RUC del emisor): revisa si la factura era MM o si la cuenta está mal anotada.</p>
      <label className="mb-3 flex items-center gap-2 text-sm text-t2">
        <input type="checkbox" checked={soloDetraccion} onChange={(e) => setSoloDetraccion(e.target.checked)} /> Solo detracciones
      </label>
      <Card titulo={`${filas?.length ?? 0} pagos por regularizar o corregir`}>
        <Tabla filas={filas} clave={(p) => p.pago_id!} onFila={(p) => navigate(`/ventas/${p.venta_id}`)} vacio="Ningún pago en cuenta de la otra empresa" columnas={[
          { titulo: 'Fecha', celda: (p) => <span className="whitespace-nowrap">{fecha(p.fecha)}</span> },
          { titulo: 'Comprobante', celda: (p) => <><div>{p.serie_numero}</div><div className="text-xs text-t3">{p.empresa_comprobante} · {p.cliente}</div></> },
          { titulo: 'Entró a', celda: (p) => <><div>{p.cuenta}{p.es_detraccion && <span className="ml-1 text-xs text-warning">(detracción)</span>}</div><div className="text-xs text-t3">{p.empresa_cuenta}</div></> },
          { titulo: 'Monto', derecha: true, celda: (p) => dinero(p.monto, p.moneda_cuenta) },
        ]} />
        <Nota>Clic en un pago para abrir su venta. Si la cuenta está mal anotada, anula el pago y regístralo en la cuenta correcta.</Nota>
      </Card>
    </>
  )
}
