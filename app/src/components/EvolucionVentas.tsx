import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { mesLargo, usd } from '../lib/formato'
import { Card } from './ui'

/** Venta neta de cada mes (R-04), toda la historia. Clic en una barra = ver ese mes. */
export default function EvolucionVentas({ meses, mes, onMes }:
  { meses: { periodo: string | null; ventas_usd: number | null }[] | undefined; mes: string; onMes: (m: string) => void }) {
  if (!meses?.length) return null
  const filas = meses.map((m) => ({ periodo: m.periodo!, ventas: m.ventas_usd ?? 0 }))
  return (
    <Card titulo="Evolución de ventas · venta neta mensual" className="mb-4">
      <div className="h-44 p-3">
        <ResponsiveContainer>
          <BarChart data={filas} onClick={(e) => e?.activeLabel && onMes(String(e.activeLabel))}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="periodo" tickFormatter={(p: string) => p.slice(0, 4)} interval={11} tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip formatter={(v: number) => [usd(v), 'Venta neta']} labelFormatter={(p: string) => mesLargo(p)} cursor={{ fill: 'var(--surface-2)' }}
              contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text-1)' }} />
            <Bar dataKey="ventas" radius={[3, 3, 0, 0]} className="cursor-pointer">
              {filas.map((f) => <Cell key={f.periodo} fill={f.periodo === mes ? 'var(--series-1)' : 'var(--series-3)'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
