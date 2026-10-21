import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { entero, mesActual, mesLargo, pct, sumarMeses } from '../lib/formato'
import { Card, Nota, SelectorMes, Titulo } from '../components/ui'

/** Estado de resultados mensual (R-05, R-61, R-62): 12 meses lado a lado. Lo leen los tres roles. */
export default function Resultados() {
  const gp = useQuery({ queryKey: ['v_kpi_gp_mes'], queryFn: async () => ok(await supabase.from('v_kpi_gp_mes').select('*')) })
  const kpi = useQuery({ queryKey: ['kpi_mes'], queryFn: async () => ok(await supabase.from('v_kpi_mes').select('*').order('periodo')) })
  const lineas = useQuery({ queryKey: ['v_kpi_linea_mes'], queryFn: async () => ok(await supabase.from('v_kpi_linea_mes').select('*')) })
  const ultimo = kpi.data?.filter((m) => m.periodo! <= mesActual()).at(-1)?.periodo
  const [elegido, setElegido] = useState<string | null>(null)
  const hasta = elegido ?? ultimo ?? mesActual()
  const meses = Array.from({ length: 12 }, (_, i) => sumarMeses(hasta, i - 11))

  const porMes = useMemo(() => new Map((gp.data ?? []).map((g) => [g.periodo!, g])), [gp.data])
  const kpiMes = useMemo(() => new Map((kpi.data ?? []).map((g) => [g.periodo!, g])), [kpi.data])
  const nombresLinea = [...new Set((lineas.data ?? []).filter((l) => l.linea !== 'Overhead').map((l) => l.linea!))].sort()
  const linea = (mes: string, nombre: string) => lineas.data?.find((l) => l.periodo === mes && l.linea === nombre)

  type Fila = { label: ReactNode; valor: (mes: string) => number | null | undefined; tipo?: 'total' | 'parte' | 'resultado' | 'nota'; formato?: (v: number | null | undefined) => string }
  const filas: Fila[] = [
    { label: 'Ingresos', valor: (x) => porMes.get(x)?.ingresos_usd, tipo: 'total' },
    ...nombresLinea.map((n): Fila => ({ label: n, valor: (x) => linea(x, n)?.ingreso_usd, tipo: 'parte' })),
    { label: 'Costos de proveedor', valor: (x) => porMes.get(x)?.costos_directos_usd, tipo: 'parte' },
    { label: 'Planilla', valor: (x) => porMes.get(x)?.planilla_usd, tipo: 'parte' },
    { label: 'Herramientas', valor: (x) => porMes.get(x)?.herramientas_usd, tipo: 'parte' },
    { label: 'Comisiones pagadas', valor: (x) => porMes.get(x)?.comisiones_usd, tipo: 'parte' },
    { label: 'Costos totales', valor: (x) => kpiMes.get(x)?.costos_usd, tipo: 'total' },
    { label: 'Gross profit', valor: (x) => porMes.get(x)?.gp_usd, tipo: 'resultado' },
    { label: 'Margen', valor: (x) => kpiMes.get(x)?.margen, formato: pct },
    { label: 'Ventas (por contrato)', valor: (x) => kpiMes.get(x)?.ventas_usd, tipo: 'nota' },
    { label: 'Facturado', valor: (x) => kpiMes.get(x)?.facturado_usd, tipo: 'nota' },
    { label: 'Cobrado', valor: (x) => kpiMes.get(x)?.cobrado_usd, tipo: 'nota' },
  ]
  const costoIdx = 1 + nombresLinea.length

  return (
    <>
      <Titulo accion={<SelectorMes mes={hasta} onCambio={setElegido} />}>Estado de resultados</Titulo>
      <Card titulo={`${mesLargo(meses[0])} – ${mesLargo(hasta)} · USD`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-t2">
                <th className="sticky left-0 bg-s1 px-4 py-2 text-left font-medium">Concepto</th>
                {meses.map((x) => <th key={x} className="px-2.5 py-2 text-right font-medium whitespace-nowrap">{mesLargo(x)}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const estilo = f.tipo === 'total' ? 'font-semibold' : f.tipo === 'resultado' ? 'font-semibold bg-s2'
                  : f.tipo === 'parte' ? 'text-t2' : f.tipo === 'nota' ? 'text-t3' : ''
                return (
                  <tr key={i} className={`border-b border-line last:border-0 ${estilo} ${i === costoIdx || f.tipo === 'nota' && filas[i - 1].tipo !== 'nota' ? 'border-t-2' : ''}`}>
                    <td className={`sticky left-0 bg-inherit px-4 py-2 whitespace-nowrap ${f.tipo === 'parte' ? 'pl-8' : ''}`}
                      style={{ background: f.tipo === 'resultado' ? 'var(--surface-2)' : 'var(--surface-1)' }}>
                      {f.tipo === 'parte' && i >= costoIdx ? '− ' : ''}{f.label}
                    </td>
                    {meses.map((x) => {
                      const v = f.valor(x)
                      const negativo = f.tipo === 'resultado' && (v ?? 0) < 0
                      return <td key={x} className={`num px-2.5 py-2 text-right whitespace-nowrap ${negativo ? 'text-critical' : ''}`}>
                        {v == null ? '—' : (f.formato ?? entero)(v)}
                      </td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Nota>Ingresos por mes de ejecución, separados por línea de negocio. Costos de proveedor, planilla, herramientas y comisiones pagadas se restan una vez (R-61); en soles se convierten con el tipo de cambio del mes. Ventas, facturado y cobrado son referencias: no entran al resultado.</Nota>
      </Card>
    </>
  )
}
