import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ok, okONulo, supabase } from '../lib/supabase'
import { finDeMes, mesActual, mesLargo, pct, sumarMeses, usd } from '../lib/formato'
import { Boton, Card, Kpi, Tabla, Titulo } from '../components/ui'

export default function Rentabilidad() {
  const [mes, setMes] = useState(sumarMeses(mesActual(), -1))
  const agencia = useQuery({
    queryKey: ['gp_agencia', mes],
    queryFn: async () => okONulo(await supabase.from('v_gp_agencia_mes').select('*').eq('periodo', mes).maybeSingle()),
  })
  const lineas = useQuery({
    queryKey: ['gp_linea', mes],
    queryFn: async () => ok(await supabase.from('v_gp_linea_mes').select('*').eq('periodo', mes).order('ingreso_usd', { ascending: false })),
  })
  const ventas = useQuery({
    queryKey: ['gp_venta', mes],
    queryFn: async () => ok(await supabase.from('v_gp_venta').select('*')
      .gte('fecha_contrato', mes).lte('fecha_contrato', finDeMes(mes)).order('gp_usd')),
  })
  const a = agencia.data
  const margen = (gp?: number | null, ing?: number | null) => (ing ? (gp ?? 0) / ing : null)

  return (
    <>
      <Titulo accion={<div className="flex items-center gap-2">
        <Boton onClick={() => setMes(sumarMeses(mes, -1))} aria-label="Mes anterior">‹</Boton>
        <span className="w-24 text-center text-sm font-medium">{mesLargo(mes)}</span>
        <Boton onClick={() => setMes(sumarMeses(mes, 1))} aria-label="Mes siguiente">›</Boton>
      </div>}>Rentabilidad</Titulo>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ingresos" valor={usd(a?.ingresos_usd)} detalle="por mes de ejecución" />
        <Kpi label="Planilla" valor={usd(a?.planilla_usd)} />
        <Kpi label="Herramientas + comisiones + directos" valor={usd((a?.herramientas_usd ?? 0) + (a?.comisiones_usd ?? 0) + (a?.costos_directos_usd ?? 0))} />
        <Kpi label="Gross profit agencia" valor={usd(a?.gp_usd)} detalle={`margen ${pct(margen(a?.gp_usd, a?.ingresos_usd))}`} tono={(a?.gp_usd ?? 0) < 0 ? 'critical' : 'good'} />
      </div>

      <Card titulo="Por línea de negocio" className="mt-4">
        <Tabla filas={lineas.data} clave={(l) => l.linea!} columnas={[
          { titulo: 'Línea', celda: (l) => <span className={l.linea_id ? 'font-medium' : 'text-t2'}>{l.linea}</span> },
          { titulo: 'Ingreso', derecha: true, celda: (l) => usd(l.ingreso_usd) },
          { titulo: 'Planilla directa', derecha: true, celda: (l) => usd(l.planilla_usd) },
          { titulo: 'Dirección', derecha: true, celda: (l) => usd(l.direccion_usd) },
          { titulo: 'Herram. + comis.', derecha: true, celda: (l) => usd(l.compartidos_usd) },
          { titulo: 'Directos', derecha: true, celda: (l) => usd(l.costos_directos_usd) },
          { titulo: 'GP', derecha: true, celda: (l) => <b className={(l.gp_usd ?? 0) < 0 ? 'text-critical' : ''}>{usd(l.gp_usd)}</b> },
          { titulo: 'Margen', derecha: true, celda: (l) => pct(margen(l.gp_usd, l.ingreso_usd)) },
        ]} />
        <p className="border-t border-line px-4 py-2 text-xs text-t3">Dirección se reparte por pesos; herramientas y comisiones por participación en el ingreso; Overhead (administración, comercial, RR.HH.) queda a nivel agencia. Las líneas + overhead suman el GP de la agencia (R-62).</p>
      </Card>

      <Card titulo={`Ventas de ${mesLargo(mes)} · GP de vida de cada venta`} className="mt-4">
        <Tabla filas={ventas.data} clave={(v) => v.venta_id!} columnas={[
          { titulo: 'Cliente', celda: (v) => <><div className="font-medium">{v.marca ?? v.cliente}</div><div className="text-xs text-t3">{v.servicio}</div></> },
          { titulo: 'Línea', celda: (v) => v.linea },
          { titulo: 'Ingreso', derecha: true, celda: (v) => usd(v.ingreso_usd) },
          { titulo: 'Costo asignado', derecha: true, celda: (v) => usd(v.costo_asignado_usd) },
          { titulo: 'Directos', derecha: true, celda: (v) => usd(v.costos_directos_usd) },
          { titulo: 'GP', derecha: true, celda: (v) => <b className={(v.gp_usd ?? 0) < 0 ? 'text-critical' : ''}>{usd(v.gp_usd)}</b> },
          { titulo: 'Margen', derecha: true, celda: (v) => pct(margen(v.gp_usd, v.ingreso_usd)) },
        ]} />
        <p className="border-t border-line px-4 py-2 text-xs text-t3">Costo asignado = costo indirecto de su línea repartido por participación en el ingreso de cada mes (R-63). GP por equipo llegará cuando se unifiquen los equipos de planilla y contratos.</p>
      </Card>
    </>
  )
}
