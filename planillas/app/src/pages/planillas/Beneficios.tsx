import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { fecha, mesLargo } from '../../lib/formato'
import { Card, Estado, Nota, Pestanas, Tabla } from '../../components/ui'
import { descargarCsv, s2, useTrabajadores } from './comun'
import { Boton } from '../../components/ui'

type Vista = 'provisiones' | 'gratificacion' | 'cts' | 'vacaciones'

/** Semestre de gratificación (ene–jun / jul–dic) y de CTS (nov–abr / may–oct) que contiene un mes. */
function semestres(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  const grati = m >= 7 ? `${y}-07-01` : `${y}-01-01`
  const cts = m >= 11 ? `${y}-11-01` : m >= 5 ? `${y}-05-01` : `${y - 1}-11-01`
  return { grati, cts }
}

/** Beneficios sociales: provisiones del mes, gratificaciones, CTS y vacaciones (R-16…R-20). */
export default function Beneficios({ empleador, mes }: { empleador: number; mes: string }) {
  const [vista, setVista] = useState<Vista>('provisiones')
  const { grati, cts } = semestres(mes)
  const nombres = new Map((useTrabajadores(empleador).data ?? []).map((t) => [t.id, t.apellidos_nombres]))
  const nombre = (id: string | null) => nombres.get(id) ?? '—'

  const prov = useQuery({ enabled: vista === 'provisiones', queryKey: ['pl_prov', empleador, mes],
    queryFn: async () => ok(await supabase.from('v_provision_mes').select('*').eq('empleador_id', empleador).eq('periodo', mes)) })
  const gr = useQuery({ enabled: vista === 'gratificacion', queryKey: ['pl_grati', empleador, grati],
    queryFn: async () => ok(await supabase.from('v_gratificacion').select('*').eq('empleador_id', empleador).eq('sem_inicio', grati)) })
  const ct = useQuery({ enabled: vista === 'cts', queryKey: ['pl_cts', empleador, cts],
    queryFn: async () => ok(await supabase.from('v_cts').select('*').eq('empleador_id', empleador).eq('sem_inicio', cts)) })
  const va = useQuery({ enabled: vista === 'vacaciones', queryKey: ['pl_vacaciones', empleador],
    queryFn: async () => ok(await supabase.from('v_vacaciones').select('*').eq('empleador_id', empleador)) })
  const suma = <F,>(xs: F[] | undefined, f: (x: F) => number | null) => (xs ?? []).reduce((a, x) => a + (f(x) ?? 0), 0)
  const finSem = (ini: string, meses: number) => { const [y, m] = ini.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + meses, 0)); return d.toISOString().slice(0, 10) }

  return (
    <>
      <div className="mb-3"><Pestanas valor={vista} onCambio={setVista} opciones={[
        { clave: 'provisiones', label: 'Provisiones del mes' }, { clave: 'gratificacion', label: 'Gratificación' },
        { clave: 'cts', label: 'CTS' }, { clave: 'vacaciones', label: 'Vacaciones' }]} /></div>

      {vista === 'provisiones' && <Card titulo={`Provisiones de ${mesLargo(mes)}`}>
        <Tabla filas={prov.data} clave={(p) => p.trabajador_id!} vacio="Sin trabajadores en el mes" columnas={[
          { titulo: 'Trabajador', celda: (p) => nombre(p.trabajador_id) },
          { titulo: 'Gratificación', derecha: true, celda: (p) => s2(p.gratificacion) },
          { titulo: 'Bonificación 9%', derecha: true, celda: (p) => s2(p.bonificacion) },
          { titulo: 'CTS', derecha: true, celda: (p) => s2(p.cts) },
          { titulo: 'Vacaciones', derecha: true, celda: (p) => s2(p.vacaciones) },
          { titulo: 'Total', derecha: true, celda: (p) => <b>{s2((p.gratificacion ?? 0) + (p.bonificacion ?? 0) + (p.cts ?? 0) + (p.vacaciones ?? 0))}</b> },
        ]} pie={prov.data?.length ? <tr><td className="px-4 py-2">Total</td>
          {[(p: typeof prov.data[0]) => p.gratificacion, (p: typeof prov.data[0]) => p.bonificacion, (p: typeof prov.data[0]) => p.cts, (p: typeof prov.data[0]) => p.vacaciones,
            (p: typeof prov.data[0]) => (p.gratificacion ?? 0) + (p.bonificacion ?? 0) + (p.cts ?? 0) + (p.vacaciones ?? 0)]
            .map((f, i) => <td key={i} className="num px-4 py-2 text-right">{s2(suma(prov.data, f))}</td>)}</tr> : undefined} />
        <Nota>Provisión = lo devengado al cierre del mes menos lo devengado al cierre del mes anterior. En el mes de pago (julio, diciembre, mayo, noviembre) o de cese, lo devengado es lo pagado: las provisiones del semestre suman exactamente el beneficio, sin ajustes a mano (R-19). Por eso un alza de sueldo se ve como un salto en la provisión de ese mes.</Nota>
      </Card>}

      {vista === 'gratificacion' && <Card titulo={`Gratificación ${fecha(grati)} – ${fecha(finSem(grati, 6))}`} accion={
        <Boton disabled={!gr.data?.length} onClick={() => descargarCsv(`gratificacion-${grati}.csv`, (gr.data ?? []).map((g) => ({ trabajador: nombre(g.trabajador_id), tipo: g.tipo, meses: g.meses, computable: g.computable, gratificacion: g.monto, bonificacion: g.bonificacion })))}>Exportar</Boton>}>
        <Tabla filas={gr.data} clave={(g) => g.trabajador_id!} vacio="Sin gratificaciones en el semestre" columnas={[
          { titulo: 'Trabajador', celda: (g) => nombre(g.trabajador_id) },
          { titulo: 'Tipo', celda: (g) => <Estado valor={g.tipo} /> },
          { titulo: 'Régimen', celda: (g) => <Estado valor={g.regimen} /> },
          { titulo: 'Se paga', celda: (g) => mesLargo(g.pago_mes!) },
          { titulo: 'Meses', derecha: true, celda: (g) => g.meses },
          { titulo: 'Días no comp.', derecha: true, celda: (g) => g.dias_no_computables || '—' },
          { titulo: 'Computable', derecha: true, celda: (g) => s2(g.computable) },
          { titulo: 'Gratificación', derecha: true, celda: (g) => <b>{s2(g.monto)}</b> },
          { titulo: 'Bonificación', derecha: true, celda: (g) => s2(g.bonificacion) },
        ]} pie={gr.data?.length ? <tr><td className="px-4 py-2" colSpan={7}>Total</td>
          <td className="num px-4 py-2 text-right">{s2(suma(gr.data, (g) => g.monto))}</td><td className="num px-4 py-2 text-right">{s2(suma(gr.data, (g) => g.bonificacion))}</td></tr> : undefined} />
        <Nota>Computable × factor del régimen (general 1, pequeña ½, micro 0) × meses completos ÷ 6, menos 1/30 por cada día no computable. La regular se paga en la planilla de julio o diciembre; la trunca, en la liquidación. Bonificación extraordinaria 9% (6.75% con EPS). Un semestre en curso muestra lo que se pagará si nada cambia (R-17).</Nota>
      </Card>}

      {vista === 'cts' && <Card titulo={`CTS ${fecha(cts)} – ${fecha(finSem(cts, 6))}`} accion={
        <Boton disabled={!ct.data?.length} onClick={() => descargarCsv(`cts-${cts}.csv`, (ct.data ?? []).map((c) => ({ trabajador: nombre(c.trabajador_id), tipo: c.tipo, meses: c.meses, dias: c.dias_resto, computable: c.computable, sexto_grati: c.sexto, dias_cts: c.dias_ganados, monto: c.monto })))}>Exportar</Boton>}>
        <Tabla filas={ct.data} clave={(c) => c.trabajador_id!} vacio="Sin CTS en el semestre" columnas={[
          { titulo: 'Trabajador', celda: (c) => nombre(c.trabajador_id) },
          { titulo: 'Tipo', celda: (c) => <Estado valor={c.tipo} /> },
          { titulo: 'Depósito', celda: (c) => c.tipo === 'deposito' ? `hasta 15 ${mesLargo(c.deposito_mes!)}` : 'liquidación' },
          { titulo: 'Tiempo', celda: (c) => c.elegible ? `${c.meses} m ${c.dias_resto} d` : <span className="text-t3">menos de un mes</span> },
          { titulo: 'Computable', derecha: true, celda: (c) => s2(c.computable) },
          { titulo: '1/6 grati', derecha: true, celda: (c) => s2(c.sexto) },
          { titulo: 'Días CTS', derecha: true, celda: (c) => Number(c.dias_ganados ?? 0).toFixed(2) },
          { titulo: 'CTS', derecha: true, celda: (c) => <b>{s2(c.monto)}</b> },
        ]} pie={ct.data?.length ? <tr><td className="px-4 py-2" colSpan={7}>Total</td><td className="num px-4 py-2 text-right">{s2(suma(ct.data, (c) => c.monto))}</td></tr> : undefined} />
        <Nota>(Computable + 1/6 de la gratificación del semestre) ÷ 30 × días de CTS; días de CTS = días del régimen por año (general 30, pequeña 15 con tope de 90 acumulados, micro 0) × días computables ÷ 360. Requiere un mes de servicio y jornada de 4 horas o más (R-18).</Nota>
      </Card>}

      {vista === 'vacaciones' && <Card titulo="Vacaciones por trabajador">
        <Tabla filas={va.data} clave={(v) => v.trabajador_id!} vacio="Sin trabajadores" columnas={[
          { titulo: 'Trabajador', celda: (v) => nombre(v.trabajador_id) },
          { titulo: 'Al', celda: (v) => fecha(v.corte) },
          { titulo: 'Ganadas', derecha: true, celda: (v) => Number(v.dias_ganados) },
          { titulo: 'Gozadas', derecha: true, celda: (v) => Number(v.dias_gozados) },
          { titulo: 'Pendientes', derecha: true, celda: (v) => Number(v.dias_pendientes) },
          { titulo: 'Vencidas', derecha: true, celda: (v) => Number(v.dias_vencidos) ? <span className="text-critical">{Number(v.dias_vencidos)}</span> : '—' },
          { titulo: 'Adelantadas', derecha: true, celda: (v) => Number(v.dias_adelantados) || '—' },
          { titulo: 'Truncas', derecha: true, celda: (v) => Number(v.dias_trunca) },
          { titulo: 'Valor pendientes', derecha: true, celda: (v) => s2(v.monto_pendientes) },
        ]} />
        <Nota>Cada año completo gana los días del régimen (general 30, MYPE 15), que vencen si no se gozan en el año siguiente (indemnización vacacional). Lo gozado consume primero lo más antiguo; gozar más de lo ganado es adelanto, y al cese solo se compensa con las truncas (R-20).</Nota>
      </Card>}
    </>
  )
}
