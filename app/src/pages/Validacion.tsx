import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'
import { dinero, mesLargo } from '../lib/formato'
import { Card, Kpi, Nota, Titulo } from '../components/ui'
import type { Fila } from '../lib/db'

type Fila_ = Fila<'v_validacion_mes'>

// Conceptos que se comparan, con su moneda y la pestaña del sheet de donde salen.
const CONCEPTOS = [
  { clave: 'ventas_usd', label: 'Ventas', moneda: 'USD', fuente: 'pestaña "Ventas" (venta neta, sin pauta)' },
  { clave: 'planilla_pen', label: 'Planilla', moneda: 'PEN', fuente: 'pestaña "Planilla", Sueldo Bruto Total' },
  { clave: 'herramientas_usd', label: 'Herramientas', moneda: 'USD', fuente: 'pestaña "Herramientas"' },
  { clave: 'comisiones_pen', label: 'Comisiones', moneda: 'PEN', fuente: 'pestaña "Comision de venta"' },
  { clave: 'consumo_pauta_usd', label: 'Consumo de pauta', moneda: 'USD', fuente: 'pestaña "Pauta", costo de ejecución' },
] as const

/** El dueño puede verificar por sí mismo que cada mes cuadra con su sheet. */
export default function Validacion() {
  const { data } = useQuery({
    queryKey: ['validacion'],
    queryFn: async () => ok(await supabase.from('v_validacion_mes').select('*').order('periodo', { ascending: false })),
  })
  const celda = new Map((data ?? []).map((f) => [`${f.periodo}|${f.concepto}`, f]))
  const meses = [...new Set((data ?? []).map((f) => f.periodo!))]
  const resumen = (c: string) => {
    const filas = (data ?? []).filter((f) => f.concepto === c)
    return { total: filas.length, cuadran: filas.filter((f) => f.cuadra).length }
  }

  return (
    <>
      <Titulo>Validación contra el sheet</Titulo>
      <p className="mb-4 max-w-3xl text-sm text-t2">Cada mes, el número que calcula el sistema junto al que reportaba el Sheet Administrativo al migrar.
        Si un mes cuadra se marca con ✓; si no, se muestra la diferencia. Cambios hechos después en el sistema (una anulación, una venta nueva en un mes antiguo) aparecen aquí como diferencia.</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {CONCEPTOS.map((c) => {
          const r = resumen(c.clave)
          return <Kpi key={c.clave} label={c.label} valor={`${r.cuadran}/${r.total}`} detalle="meses que cuadran"
            tono={r.total && r.cuadran === r.total ? 'good' : r.total ? 'critical' : undefined} />
        })}
      </div>
      <Card titulo="Mes a mes" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-xs text-t2">
              <th className="px-4 py-2 text-left font-medium">Mes</th>
              {CONCEPTOS.map((c) => <th key={c.clave} className="px-4 py-2 text-right font-medium whitespace-nowrap">{c.label} ({c.moneda === 'PEN' ? 'S/' : 'USD'})</th>)}
            </tr></thead>
            <tbody>
              {data === undefined && <tr><td colSpan={6} className="px-4 py-6 text-center text-t3">Cargando…</td></tr>}
              {meses.map((m) => (
                <tr key={m} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{mesLargo(m)}</td>
                  {CONCEPTOS.map((c) => <td key={c.clave} className="px-4 py-2 text-right"><Comparacion f={celda.get(`${m}|${c.clave}`)} moneda={c.moneda} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Nota>Fuentes: {CONCEPTOS.map((c) => `${c.label}: ${c.fuente}`).join(' · ')}. Planilla y comisiones se comparan en soles, como en el sheet.</Nota>
      </Card>
    </>
  )
}

function Comparacion({ f, moneda }: { f?: Fila_; moneda: string }) {
  if (!f) return <span className="text-t3">—</span>
  return (
    <div className="num whitespace-nowrap">
      <div>{dinero(f.sistema, moneda)} {f.cuadra ? <span className="text-good">✓</span> : null}</div>
      {!f.cuadra && <div className="text-xs text-critical">sheet {dinero(f.sheet, moneda)} · dif {dinero(f.diferencia, moneda)}</div>}
    </div>
  )
}
