import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { fecha, finDeMes, mesLargo, usd } from '../lib/formato'
import { Card, Kpi, Nota, Tabla, Titulo } from '../components/ui'

/** Pauta gestionada: lo facturado al cliente vs lo consumido en medios (R-64). No es venta (R-03). */
export default function Pauta() {
  const navigate = useNavigate()
  const meses = useQuery({
    queryKey: ['pauta_mes'],
    queryFn: async () => ok(await supabase.from('v_control_pauta_mes').select('*').order('periodo', { ascending: false })),
  })
  const [elegido, setElegido] = useState<string | null>(null)
  const mes = elegido ?? meses.data?.[0]?.periodo ?? null
  const actual = meses.data?.find((m) => m.periodo === mes)
  const detalle = useQuery({
    queryKey: ['pauta_detalle', mes],
    enabled: !!mes,
    queryFn: async () => ok(await supabase.from('v_control_pauta').select('*')
      .gte('fecha_contrato', mes!).lte('fecha_contrato', finDeMes(mes!)).order('pauta_usd', { ascending: false })),
  })
  const sinConsumo = actual && !actual.consumo_usd

  return (
    <>
      <Titulo>Pauta</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={mes ? `Pauta facturada · ${mesLargo(mes)}` : 'Pauta facturada'} valor={usd(actual?.pauta_usd)} detalle={`${actual?.contratos ?? 0} contratos`} />
        <Kpi label="Consumo real" valor={usd(actual?.consumo_usd)} detalle={sinConsumo ? 'aún no registrado' : 'invertido en medios'} />
        <Kpi label="Diferencia" valor={usd(actual?.diferencia_usd)} detalle="facturado − consumido" tono={(actual?.diferencia_usd ?? 0) < 0 ? 'critical' : undefined} />
        <Kpi label="Qué es" valor="Terceros" detalle="se factura y cobra, pero no es venta de Manya" />
      </div>
      {sinConsumo && <p className="mt-3 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
        El consumo real de este mes aún no está registrado: en el sheet llega hasta febrero 2026. Se cargará desde el control de pauta (ManyaPulse).</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card titulo="Por mes" className="lg:col-span-2">
          <div className="max-h-[32rem] overflow-y-auto">
            <Tabla filas={meses.data} clave={(m) => m.periodo!} onFila={(m) => setElegido(m.periodo!)} columnas={[
              { titulo: 'Mes', celda: (m) => <span className={m.periodo === mes ? 'font-semibold text-accent' : ''}>{mesLargo(m.periodo!)}</span> },
              { titulo: 'Facturada', derecha: true, celda: (m) => usd(m.pauta_usd) },
              { titulo: 'Consumida', derecha: true, celda: (m) => usd(m.consumo_usd) },
              { titulo: 'Diferencia', derecha: true, celda: (m) => <span className={(m.diferencia_usd ?? 0) < 0 ? 'text-critical' : ''}>{usd(m.diferencia_usd)}</span> },
            ]} />
          </div>
        </Card>
        <Card titulo={mes ? `Contratos de ${mesLargo(mes)}` : 'Contratos'} className="lg:col-span-3">
          <Tabla filas={detalle.data} clave={(p) => p.venta_id!} onFila={(p) => navigate(`/ventas/${p.venta_id}`)} vacio="Sin pauta en el mes" columnas={[
            { titulo: 'Cliente', celda: (p) => <><div className="font-medium">{p.marca ?? p.cliente}</div><div className="text-xs text-t3">{fecha(p.fecha_contrato)}</div></> },
            { titulo: 'Facturada', derecha: true, celda: (p) => usd(p.pauta_usd) },
            { titulo: 'Consumida', derecha: true, celda: (p) => usd(p.consumo_usd) },
            { titulo: 'Diferencia', derecha: true, celda: (p) => <span className={(p.diferencia_usd ?? 0) < 0 ? 'text-critical' : ''}>{usd(p.diferencia_usd)}</span> },
          ]} />
          <Nota>La diferencia es un control: no entra al gross profit. La comisión sobre la pauta sí es venta (R-03, R-64).</Nota>
        </Card>
      </div>
    </>
  )
}
