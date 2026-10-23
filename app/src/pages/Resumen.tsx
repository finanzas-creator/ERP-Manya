import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, mesActual, mesLargo, pct, sumarMeses, usd } from '../lib/formato'
import { puedeOperar, useRol } from '../lib/sesion'
import { Barras, Card, Estado, Kpi, Nota, Panel, Renglon, Select, Tabla, Titulo } from '../components/ui'
import type { Fila } from '../lib/db'

type Mes = Fila<'v_kpi_mes'>
type Detalle = 'ventas' | 'ingresos' | 'gp' | 'cobrado' | 'facturado'

const tooltip = { background: 'var(--surface-1)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text-1)' }

/** Lee una vista de KPIs una sola vez para toda la pantalla (las comparten los tres roles). */
function useKpi<T extends 'v_kpi_ventas_categoria_mes' | 'v_kpi_ingresos_mes' | 'v_kpi_ventas_cliente_mes' | 'v_kpi_gp_mes' | 'v_kpi_pauta_mes' | 'v_kpi_linea_mes'>(vista: T, periodo: string) {
  return useQuery({
    queryKey: [vista, periodo],
    queryFn: async () => ok(await supabase.from(vista).select('*').eq('periodo', periodo)) as Fila<T>[],
  })
}

export default function Resumen() {
  const navigate = useNavigate()
  const opera = puedeOperar(useRol())
  const hoy = useQuery({ queryKey: ['kpi_hoy'], queryFn: async () => ok(await supabase.from('v_kpi_hoy').select('*').single()) })
  const meses = useQuery({
    queryKey: ['kpi_mes'],
    queryFn: async () => ok(await supabase.from('v_kpi_mes').select('*').order('periodo')),
  })
  const disponibles = useMemo(() => (meses.data ?? []).map((m) => m.periodo!).filter((p) => p <= mesActual()), [meses.data])
  const [elegido, setElegido] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const periodo = elegido ?? disponibles.at(-1) ?? mesActual()
  const m = meses.data?.find((x) => x.periodo === periodo)
  const anterior = meses.data?.find((x) => x.periodo === sumarMeses(periodo, -1))
  const lineas = useKpi('v_kpi_linea_mes', periodo)
  const categorias = useKpi('v_kpi_ventas_categoria_mes', periodo)
  const clientes = useKpi('v_kpi_ventas_cliente_mes', periodo)
  const gp = useKpi('v_kpi_gp_mes', periodo)
  const pauta = useKpi('v_kpi_pauta_mes', periodo)
  const ultimos12 = (meses.data ?? []).filter((x) => x.periodo! > sumarMeses(periodo, -12) && x.periodo! <= periodo)
  const k = hoy.data
  const g = gp.data?.[0]

  const variacion = (a?: number | null, b?: number | null) =>
    a != null && b ? `${a >= b ? '▲' : '▼'} ${pct(Math.abs(a / b - 1))} vs mes anterior` : undefined

  const ventasCategoria = (categorias.data ?? []).sort((a, b) => (b.ventas_usd ?? 0) - (a.ventas_usd ?? 0))
  const topClientes = (clientes.data ?? []).sort((a, b) => (b.ventas_usd ?? 0) - (a.ventas_usd ?? 0)).slice(0, 8)

  return (
    <>
      <Titulo accion={
        <Select value={periodo} onChange={(e) => setElegido(e.target.value)} aria-label="Mes">
          {[...disponibles].reverse().map((p) => <option key={p} value={p}>{mesLargo(p)}</option>)}
        </Select>
      }>Resumen</Titulo>

      {(k?.autodetracciones_pendientes ?? 0) > 0 && (
        <div onClick={opera ? () => navigate('/cobranza') : undefined}
          className={`mb-4 rounded-xl border border-critical/30 bg-critical-bg px-4 py-3 text-sm text-critical ${opera ? 'cursor-pointer' : ''}`}>
          <b>{k!.autodetracciones_pendientes} autodetracciones pendientes</b> por {dinero(k!.autodetraccion_pendiente_pen, 'PEN')}:
          clientes que pagaron la factura completa sin depositar la detracción. Se cierran al subir la constancia de pago{opera ? ' (en Cobranza)' : ''}.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label={`Ventas · ${mesLargo(periodo)}`} valor={usd(m?.ventas_usd)} onClick={() => setDetalle('ventas')}
          detalle={variacion(m?.ventas_usd, anterior?.ventas_usd) ?? 'por fecha de contrato'} />
        <Kpi label="Ingresos del mes" valor={usd(m?.ingresos_usd)} onClick={() => setDetalle('ingresos')}
          detalle={`recurrente ${usd(m?.ingresos_recurrentes_usd)}`} />
        <Kpi label="Gross profit" valor={usd(m?.gp_usd)} onClick={() => setDetalle('gp')}
          detalle={`margen ${pct(m?.margen)}`} tono={(m?.gp_usd ?? 0) < 0 ? 'critical' : undefined} />
        <Kpi label="Facturado en el mes" valor={usd(m?.facturado_usd)} onClick={() => setDetalle('facturado')}
          detalle={`con IGV · ${m?.comprobantes ?? 0} comprobantes`} />
        <Kpi label="Cobrado en el mes" valor={usd(m?.cobrado_usd)} onClick={() => setDetalle('cobrado')}
          detalle={`incluye IGV y pauta · ${m?.clientes_activos ?? 0} clientes activos`} />
      </div>

      <Card titulo="Cuentas por cobrar · hoy" className="mt-4">
        <div className="grid gap-4 p-4 md:grid-cols-4">
          <Mirada color="var(--series-1)" titulo="Pendiente según contratos" valor={usd(k?.pendiente_contratos_usd)}
            texto="todo lo que falta entrar, incluido lo que aún no se factura" onClick={opera ? () => navigate('/ventas') : undefined} />
          <Mirada color="var(--warning)" titulo="Facturado por cobrar" valor={usd(k?.por_cobrar_usd)}
            texto={<>comprobantes emitidos sin pagar · <span className="text-critical">{usd(k?.vencido_usd)} vencido</span></>}
            onClick={opera ? () => navigate('/cobranza') : undefined} />
          <Mirada color="var(--series-3)" titulo="Cuotas por facturar" valor={usd(k?.por_facturar_usd)}
            texto="venta comprometida que falta facturar para poder cobrar" />
          <Mirada color="var(--text-3)" titulo="Ventas sin plan de pagos" valor={usd(k?.falta_planificar_usd)}
            texto={`${k?.ventas_plan_descuadrado ?? 0} ventas por revisar · neto sin IGV`} onClick={opera ? () => navigate('/revision') : undefined} />
        </div>
        <Nota>Días promedio de cobro (DSO): {k?.dso_dias ?? '—'} · Los 5 mayores clientes son el {pct(k?.concentracion_top5)} de la venta de los últimos 12 meses · Renovaciones: {k?.renovaciones_30d ?? 0} en los próximos 30 días y {k?.renovaciones_vencidas ?? 0} vencidas sin renovar.</Nota>
      </Card>

      <Morosos onCliente={opera ? (id) => navigate(`/clientes/${id}`) : undefined} />
      <Retencion periodo={periodo} onCaidos={opera ? () => navigate('/clientes?vista=caidos') : undefined} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card titulo="Ingresos vs costos · últimos 12 meses" className="lg:col-span-2">
          <div className="h-72 p-3">
            <ResponsiveContainer>
              <LineChart data={ultimos12.map((x) => ({ mes: mesLargo(x.periodo!), Ventas: x.ventas_usd, Ingresos: x.ingresos_usd, Costos: x.costos_usd }))}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v: number) => usd(v)} contentStyle={tooltip} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
                <Line type="monotone" dataKey="Ventas" stroke="var(--series-3)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="Ingresos" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Costos" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card titulo={`Estructura de costos · ${mesLargo(periodo)}`}>
          <div className="p-4">
            <Renglon label="Ingresos" valor={usd(g?.ingresos_usd)} />
            <Renglon sangria label="Costos de proveedor" valor={`− ${usd(g?.costos_directos_usd)}`} />
            <Renglon sangria label="Planilla" valor={`− ${usd(g?.planilla_usd)}`} />
            <Renglon sangria label="Herramientas" valor={`− ${usd(g?.herramientas_usd)}`} />
            <Renglon sangria label="Comisiones pagadas" valor={`− ${usd(g?.comisiones_usd)}`} />
            <Renglon total label="Gross profit" valor={usd(g?.gp_usd)} tono={(g?.gp_usd ?? 0) < 0 ? 'critical' : 'good'} />
            <Renglon label="Margen" valor={pct(m?.margen)} />
          </div>
          <Nota>Planilla y comisiones en soles se convierten con el tipo de cambio del mes (R-60, R-61).</Nota>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card titulo={`Ventas por categoría · ${mesLargo(periodo)}`}>
          <div className="p-4">
            <Barras filas={ventasCategoria.map((c) => ({ clave: `${c.categoria}-${c.modalidad}`, label: c.categoria,
              valor: c.ventas_usd ?? 0, texto: usd(c.ventas_usd) }))} />
            <div className="mt-4 rounded-lg border border-dashed border-line bg-s2 p-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">Pauta gestionada</span><span className="num font-medium">{usd(pauta.data?.[0]?.pauta_usd)}</span>
              </div>
              <div className="mt-1 text-xs text-t3">Se factura y cobra, pero se consume en publicidad: no es venta de Manya (R-03).</div>
            </div>
          </div>
        </Card>
        <Card titulo={`Top clientes · ${mesLargo(periodo)}`}>
          <div className="p-4">
            <Barras filas={topClientes.map((c) => ({ clave: c.cliente_id!, label: c.cliente, valor: c.ventas_usd ?? 0, texto: usd(c.ventas_usd) }))}
              onFila={opera ? (id) => navigate(`/clientes/${id}`) : undefined} />
          </div>
          <Nota>Mayor venta neta del mes (sin pauta).</Nota>
        </Card>
        <Card titulo={`Gross profit por línea · ${mesLargo(periodo)}`}>
          <Tabla compacta filas={lineas.data} clave={(l) => l.linea!} columnas={[
            { titulo: 'Línea', celda: (l) => <><div>{l.linea}</div><div className="text-xs text-t3">ingreso {usd(l.ingreso_usd)}</div></> },
            { titulo: 'GP', derecha: true, celda: (l) => <span className={(l.gp_usd ?? 0) < 0 ? 'text-critical' : ''}>{usd(l.gp_usd)}</span> },
            { titulo: 'Margen', derecha: true, celda: (l) => pct(l.margen) },
          ]} />
        </Card>
      </div>

      <Card titulo="Detalle mensual" className="mt-4">
        <Tabla<Mes> filas={[...ultimos12].reverse()} clave={(x) => x.periodo!} onFila={(x) => setElegido(x.periodo!)} columnas={[
          { titulo: 'Mes', celda: (x) => mesLargo(x.periodo!) },
          { titulo: 'Ventas', derecha: true, celda: (x) => usd(x.ventas_usd) },
          { titulo: 'Ingresos', derecha: true, celda: (x) => usd(x.ingresos_usd) },
          { titulo: 'Recurrente', derecha: true, celda: (x) => usd(x.ingresos_recurrentes_usd) },
          { titulo: 'Facturado', derecha: true, celda: (x) => usd(x.facturado_usd) },
          { titulo: 'Cobrado', derecha: true, celda: (x) => usd(x.cobrado_usd) },
          { titulo: 'Costos', derecha: true, celda: (x) => usd(x.costos_usd) },
          { titulo: 'GP', derecha: true, celda: (x) => usd(x.gp_usd) },
          { titulo: 'Margen', derecha: true, celda: (x) => pct(x.margen) },
        ]} />
      </Card>
      <p className="mt-3 text-xs text-t3">Ventas: por fecha de contrato. Ingresos: por mes de ejecución (proyectos repartidos entre inicio y entrega). La pauta y los influencers no son venta; sus comisiones sí. Clic en una tarjeta para ver cómo se calcula.</p>

      {detalle && <DetalleKpi tipo={detalle} periodo={periodo} m={m} g={g} ventasCategoria={ventasCategoria}
        onCerrar={() => setDetalle(null)} onIr={opera ? (a) => navigate(a) : undefined} />}
    </>
  )
}

/** R-53/R-54: retención de clientes recurrentes y los que se cayeron en los últimos 3 meses. */
function Retencion({ periodo, onCaidos }: { periodo: string; onCaidos?: () => void }) {
  const ret = useQuery({ queryKey: ['kpi_retencion'], queryFn: async () => ok(await supabase.from('v_kpi_retencion_mes').select('*').order('periodo')) })
  const caidos = useQuery({ queryKey: ['kpi_caidos'], queryFn: async () => ok(await supabase.from('v_kpi_cliente_caido').select('*').eq('tipo', 'recurrente').order('ultimo_mes', { ascending: false })) })
  const r = ret.data?.find((x) => x.periodo === periodo)
  const recientes = (caidos.data ?? []).filter((c) => (c.meses_sin_ingreso ?? 99) <= 3)
  const tasa = r && r.activos_mes_anterior ? (r.retenidos ?? 0) / r.activos_mes_anterior : null
  return (
    <Card titulo={`Clientes recurrentes · ${mesLargo(periodo)}`} className="mt-4"
      accion={onCaidos && <button onClick={onCaidos} className="text-xs text-accent hover:underline">Ver todos los caídos</button>}>
      <div className="grid gap-4 p-4 md:grid-cols-5">
        <Mirada color="var(--series-1)" titulo="Activos" valor={r?.activos ?? '—'} texto="con ingreso recurrente en el mes" />
        <Mirada color="var(--series-3)" titulo="Nuevos" valor={r?.nuevos ?? '—'} texto="primer mes con nosotros" />
        <Mirada color="var(--critical)" titulo="Se fueron" valor={r?.perdidos ?? '—'} texto="estaban el mes anterior y este no" />
        <Mirada color="var(--text-2)" titulo="Retención" valor={pct(tasa)} texto={`de ${r?.activos_mes_anterior ?? 0} del mes anterior siguen`} />
        <Mirada color="var(--warning)" titulo="Caídos (3 meses)" valor={recientes.length} texto={`${usd(recientes.reduce((s, c) => s + (c.ingreso_mensual_usd ?? 0), 0))} al mes que ya no se facturan`} />
      </div>
      {recientes.length > 0 && <Nota>Caídos recientes: {recientes.slice(0, 8).map((c) => `${c.cliente} (${usd(c.ingreso_mensual_usd)}/mes)`).join(' · ')}{recientes.length > 8 ? '…' : ''}.
        El mes en curso es provisional: una renovación que aún no se registra aparece como "se fue".</Nota>}
    </Card>
  )
}

/** R-37/R-38: clientes con deuda de más de 60 días y qué se está haciendo para cobrarles. */
function Morosos({ onCliente }: { onCliente?: (id: string) => void }) {
  const { data } = useQuery({
    queryKey: ['kpi_morosidad'],
    queryFn: async () => ok(await supabase.from('v_kpi_morosidad').select('*').eq('moroso', true).order('moroso_usd', { ascending: false })),
  })
  return (
    <Card titulo={`Clientes morosos · más de 60 días${data ? ` · ${data.length}` : ''}`} className="mt-4">
      <Tabla filas={data} clave={(m) => m.cliente_id!} onFila={onCliente ? (m) => onCliente(m.cliente_id!) : undefined}
        vacio="Ningún cliente con deuda de más de 60 días" columnas={[
          { titulo: 'Cliente', celda: (m) => <><div className="font-medium">{m.cliente}</div><div className="text-xs text-t3">{m.comprobantes_vencidos} comprobantes vencidos · {m.dias_atraso} días</div></> },
          { titulo: 'Más de 60 días', derecha: true, celda: (m) => <span className="text-critical">{usd(m.moroso_usd)}</span> },
          { titulo: 'Total vencido', derecha: true, celda: (m) => usd(m.vencido_usd) },
          { titulo: 'Última gestión', celda: (m) => m.ultima_gestion
            ? <><div>{fecha(m.ultima_gestion)} · {m.ultima_tipo}</div><div className="max-w-xs truncate text-xs text-t3">{m.ultima_detalle}</div></>
            : <span className="text-t3">—</span> },
          { titulo: 'Plan de acción', celda: (m) => m.compromiso_fecha || m.proximo_paso
            ? <div className="text-xs">{m.compromiso_fecha && <div>Prometió pagar {m.compromiso_monto ? usd(m.compromiso_monto) + ' ' : ''}el {fecha(m.compromiso_fecha)}</div>}
                {m.proximo_paso && <div className="text-t2">{m.proximo_paso}{m.proxima_fecha ? ` · ${fecha(m.proxima_fecha)}` : ''}</div>}</div>
            : <span className="text-t3">—</span> },
          { titulo: 'Estado', celda: (m) => <Estado valor={m.estado_gestion} /> },
        ]} />
      <Nota>La gestión se registra desde Cobranza (botón Gestión) o desde la ficha del cliente.</Nota>
    </Card>
  )
}

function Mirada({ color, titulo, valor, texto, onClick }:
  { color: string; titulo: string; valor: ReactNode; texto: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`border-l-[3px] pl-3 ${onClick ? 'cursor-pointer rounded-r-lg hover:bg-s2' : ''}`} style={{ borderColor: color }}>
      <div className="text-xs font-medium text-t2">{titulo}</div>
      <div className="num mt-1 text-xl font-semibold" style={{ color }}>{valor}</div>
      <div className="mt-0.5 text-xs text-t3">{texto}</div>
    </div>
  )
}

/** Cómo se arma cada número del resumen, paso a paso, con los datos de las vistas. */
function DetalleKpi({ tipo, periodo, m, g, ventasCategoria, onCerrar, onIr }:
  { tipo: Detalle; periodo: string; m?: Mes; g?: Fila<'v_kpi_gp_mes'>; ventasCategoria: Fila<'v_kpi_ventas_categoria_mes'>[]
    onCerrar: () => void; onIr?: (a: string) => void }) {
  const ingresos = useKpi('v_kpi_ingresos_mes', periodo)
  const lbl = mesLargo(periodo)
  const ir = (a: string, texto: string) => onIr && (
    <button onClick={() => onIr(a)} className="mt-5 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-s2">{texto}</button>)

  if (tipo === 'ventas') return (
    <Panel subtitulo={`Ventas · ${lbl}`} titulo={usd(m?.ventas_usd)} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-t2">Venta neta (precio al cliente menos costo de proveedor) de los contratos firmados en el mes, sin pauta ni influencers (R-04).</p>
      {ventasCategoria.map((c) => <Renglon key={`${c.categoria}-${c.modalidad}`} label={<>{c.categoria} <span className="text-xs text-t3">· {c.ventas} {c.modalidad}</span></>} valor={usd(c.ventas_usd)} />)}
      <Renglon total label="Ventas del mes" valor={usd(m?.ventas_usd)} />
      {ir('/ventas', 'Ver las ventas del mes')}
    </Panel>
  )
  if (tipo === 'ingresos') {
    const filas = (ingresos.data ?? []).sort((a, b) => (b.ingresos_usd ?? 0) - (a.ingresos_usd ?? 0))
    return (
      <Panel subtitulo={`Ingresos · ${lbl}`} titulo={usd(m?.ingresos_usd)} onCerrar={onCerrar}>
        <p className="mb-3 text-sm text-t2">Lo que se ejecuta en el mes: los planes mensuales en su mes y los proyectos repartidos entre inicio y entrega (R-05).</p>
        {filas.map((c) => <Renglon key={`${c.categoria}-${c.modalidad}`} label={<>{c.categoria} <span className="text-xs text-t3">· {c.linea} · {c.modalidad}</span></>} valor={usd(c.ingresos_usd)} />)}
        <Renglon total label="Ingresos del mes" valor={usd(m?.ingresos_usd)} />
        <Renglon label="de los cuales recurrentes (mensuales)" valor={usd(m?.ingresos_recurrentes_usd)} />
      </Panel>
    )
  }
  if (tipo === 'gp') return (
    <Panel subtitulo={`Gross profit · ${lbl}`} titulo={usd(g?.gp_usd)} onCerrar={onCerrar}>
      <Renglon label="Ingresos" valor={usd(g?.ingresos_usd)} />
      <Renglon sangria label="Costos de proveedor" valor={`− ${usd(g?.costos_directos_usd)}`} />
      <Renglon sangria label="Planilla" valor={`− ${usd(g?.planilla_usd)}`} />
      <Renglon sangria label="Herramientas" valor={`− ${usd(g?.herramientas_usd)}`} />
      <Renglon sangria label="Comisiones pagadas" valor={`− ${usd(g?.comisiones_usd)}`} />
      <Renglon total label="Gross profit" valor={usd(g?.gp_usd)} tono={(g?.gp_usd ?? 0) < 0 ? 'critical' : 'good'} />
      <Renglon label="Margen" valor={pct(m?.margen)} />
      <p className="mt-4 text-xs text-t3">El costo de proveedor se resta una sola vez, aquí (R-61). El reparto por línea y por venta está en Rentabilidad.</p>
      {ir('/resultados', 'Ver el estado de resultados')}
    </Panel>
  )
  if (tipo === 'facturado') return (
    <Panel subtitulo={`Facturado · ${lbl}`} titulo={usd(m?.facturado_usd)} onCerrar={onCerrar}>
      <p className="text-sm text-t2">Total con IGV de los {m?.comprobantes ?? 0} comprobantes emitidos en el mes, convertido a USD con el tipo de cambio del mes. Incluye la pauta que se refactura al cliente.</p>
      {ir('/cobranza', 'Ver la cartera por cobrar')}
    </Panel>
  )
  return (
    <Panel subtitulo={`Cobrado · ${lbl}`} titulo={usd(m?.cobrado_usd)} onCerrar={onCerrar}>
      <p className="text-sm text-t2">Pagos cuya fecha cae en el mes: lo que entró a caja, con IGV, detracciones y pauta. Cada pago se convierte con su propio tipo de cambio (R-30).</p>
      {ir('/cobranza', 'Ver la cartera por cobrar')}
    </Panel>
  )
}
