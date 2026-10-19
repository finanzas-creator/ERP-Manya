import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ok, supabase } from '../lib/supabase'
import { mesActual, mesLargo, pct, sumarMeses, usd } from '../lib/formato'
import { Card, Kpi, Select, Tabla, Titulo } from '../components/ui'
import type { Fila } from '../lib/db'

type Mes = Fila<'v_kpi_mes'>

export default function Resumen() {
  const hoy = useQuery({ queryKey: ['kpi_hoy'], queryFn: async () => ok(await supabase.from('v_kpi_hoy').select('*').single()) })
  const meses = useQuery({
    queryKey: ['kpi_mes'],
    queryFn: async () => ok(await supabase.from('v_kpi_mes').select('*').order('periodo')),
  })
  const disponibles = useMemo(() => (meses.data ?? []).map((m) => m.periodo!).filter((p) => p <= mesActual()), [meses.data])
  const [elegido, setElegido] = useState<string | null>(null)
  const periodo = elegido ?? disponibles.at(-1) ?? mesActual()
  const m = meses.data?.find((x) => x.periodo === periodo)
  const anterior = meses.data?.find((x) => x.periodo === sumarMeses(periodo, -1))
  const lineas = useQuery({
    queryKey: ['kpi_linea', periodo],
    queryFn: async () => ok(await supabase.from('v_kpi_linea_mes').select('*').eq('periodo', periodo).order('linea')),
  })
  const ultimos12 = (meses.data ?? []).filter((x) => x.periodo! > sumarMeses(periodo, -12) && x.periodo! <= periodo)
  const k = hoy.data

  const variacion = (a?: number | null, b?: number | null) =>
    a != null && b ? `${a >= b ? '▲' : '▼'} ${pct(Math.abs(a / b - 1))} vs mes anterior` : undefined

  return (
    <>
      <Titulo accion={
        <Select value={periodo} onChange={(e) => setElegido(e.target.value)} aria-label="Mes">
          {[...disponibles].reverse().map((p) => <option key={p} value={p}>{mesLargo(p)}</option>)}
        </Select>
      }>Resumen</Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Ventas · ${mesLargo(periodo)}`} valor={usd(m?.ventas_usd)} detalle={variacion(m?.ventas_usd, anterior?.ventas_usd) ?? 'por fecha de contrato'} />
        <Kpi label="Ingresos del mes" valor={usd(m?.ingresos_usd)} detalle={`recurrente ${usd(m?.ingresos_recurrentes_usd)}`} />
        <Kpi label="Gross profit" valor={usd(m?.gp_usd)} detalle={`margen ${pct(m?.margen)}`} tono={(m?.gp_usd ?? 0) < 0 ? 'critical' : undefined} />
        <Kpi label="Cobrado en el mes" valor={usd(m?.cobrado_usd)} detalle={`incluye IGV y pauta · ${m?.clientes_activos ?? 0} clientes activos`} />
      </div>

      <h2 className="mt-6 mb-2 text-sm font-semibold text-t2">Hoy</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Por cobrar (facturado)" valor={usd(k?.por_cobrar_usd)} />
        <Kpi label="Vencido" valor={usd(k?.vencido_usd)} tono="critical" />
        <Kpi label="Por facturar" valor={usd(k?.por_facturar_usd)} detalle={`${usd(k?.falta_planificar_usd)} sin plan de pagos`} />
        <Kpi label="Renovaciones" valor={k?.renovaciones_30d ?? 0} detalle={`próximos 30 días · ${k?.renovaciones_vencidas ?? 0} vencidas`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card titulo="Ingresos vs costos · últimos 12 meses" className="lg:col-span-2">
          <div className="h-72 p-3">
            <ResponsiveContainer>
              <LineChart data={ultimos12.map((x) => ({ mes: mesLargo(x.periodo!), Ingresos: x.ingresos_usd, Costos: x.costos_usd }))}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="mes" tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v: number) => usd(v)} contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text-1)' }} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
                <Line type="monotone" dataKey="Ingresos" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Costos" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card titulo={`Gross profit por línea · ${mesLargo(periodo)}`}>
          <Tabla filas={lineas.data} clave={(l) => l.linea!} columnas={[
            { titulo: 'Línea', celda: (l) => l.linea },
            { titulo: 'Ingreso', derecha: true, celda: (l) => usd(l.ingreso_usd) },
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
          { titulo: 'Cobrado', derecha: true, celda: (x) => usd(x.cobrado_usd) },
          { titulo: 'Costos', derecha: true, celda: (x) => usd(x.costos_usd) },
          { titulo: 'GP', derecha: true, celda: (x) => usd(x.gp_usd) },
          { titulo: 'Margen', derecha: true, celda: (x) => pct(x.margen) },
        ]} />
      </Card>
      <p className="mt-3 text-xs text-t3">Ventas: por fecha de contrato. Ingresos: por mes de ejecución (proyectos repartidos entre inicio y entrega). La pauta y los influencers no son venta; sus comisiones sí.</p>
    </>
  )
}
