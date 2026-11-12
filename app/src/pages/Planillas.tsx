import { useEffect, useState } from 'react'
import { mesActual } from '../lib/formato'
import { Pestanas, Select, SelectorMes, Titulo } from '../components/ui'
import { useEmpleadores } from './planillas/comun'
import PlanillaMes from './planillas/PlanillaMes'
import Novedades from './planillas/Novedades'
import Trabajadores from './planillas/Trabajadores'
import Beneficios from './planillas/Beneficios'
import Liquidaciones from './planillas/Liquidaciones'
import Parametros from './planillas/Parametros'

type Pestana = 'planilla' | 'novedades' | 'trabajadores' | 'beneficios' | 'liquidaciones' | 'parametros'
const CLAVE = 'manya.planillas.empleador'

/** Planillas por empleador (R-100…R-125): cálculo del mes, novedades, trabajadores, beneficios y ceses. */
export default function Planillas() {
  const empleadores = useEmpleadores()
  const [pestana, setPestana] = useState<Pestana>('planilla')
  const [mes, setMes] = useState(mesActual())
  const [empleador, setEmpleador] = useState<number | null>(() => {
    try { return Number(localStorage.getItem(CLAVE)) || null } catch { return null }
  })
  const lista = empleadores.data ?? []
  const elegido = lista.find((e) => e.id === empleador) ?? lista[0]
  useEffect(() => { try { if (elegido) localStorage.setItem(CLAVE, String(elegido.id)) } catch { /* sin almacenamiento */ } }, [elegido])

  return (
    <>
      <Titulo accion={<div className="flex flex-wrap items-center gap-2">
        {lista.length > 0 && (
          <Select value={elegido?.id ?? ''} onChange={(e) => setEmpleador(Number(e.target.value))} aria-label="Empleador">
            {lista.map((e) => <option key={e.id} value={e.id}>{e.razon_social}</option>)}
          </Select>
        )}
        {pestana !== 'trabajadores' && pestana !== 'parametros' && pestana !== 'liquidaciones' && <SelectorMes mes={mes} onCambio={setMes} />}
      </div>}>Planillas</Titulo>
      <div className="mb-4">
        <Pestanas valor={pestana} onCambio={setPestana} opciones={[
          { clave: 'planilla', label: 'Planilla del mes' },
          { clave: 'novedades', label: 'Novedades' },
          { clave: 'trabajadores', label: 'Trabajadores' },
          { clave: 'beneficios', label: 'Beneficios' },
          { clave: 'liquidaciones', label: 'Liquidaciones' },
          { clave: 'parametros', label: 'Parámetros' },
        ]} />
      </div>
      {empleadores.data && !elegido && pestana !== 'parametros' ? (
        <div className="rounded-xl border border-line bg-s1 px-4 py-8 text-center text-sm text-t2">
          Aún no hay empleadores. Regístralo en <button className="text-accent underline" onClick={() => setPestana('parametros')}>Parámetros</button> (razón social, RUC, REMYPE y mes de inicio).
        </div>
      ) : <>
        {pestana === 'planilla' && elegido && <PlanillaMes empleador={elegido} mes={mes} />}
        {pestana === 'novedades' && elegido && <Novedades empleador={elegido.id} mes={mes} />}
        {pestana === 'trabajadores' && elegido && <Trabajadores empleador={elegido.id} />}
        {pestana === 'beneficios' && elegido && <Beneficios empleador={elegido.id} mes={mes} />}
        {pestana === 'liquidaciones' && elegido && <Liquidaciones empleador={elegido} />}
        {pestana === 'parametros' && <Parametros mes={mes} />}
      </>}
    </>
  )
}
