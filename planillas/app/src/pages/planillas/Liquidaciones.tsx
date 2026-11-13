import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { fecha, hoyISO } from '../../lib/formato'
import { ESTADOS } from '../../lib/estados'
import type { Fila } from '../../lib/db'
import { Boton, Card, Estado, Modal, Nota, Tabla } from '../../components/ui'
import { Icono } from '../../components/iconos'
import { VistaImpresion } from './Boleta'
import { s2 } from './comun'

type L = Fila<'v_liquidacion'>
type Linea = Fila<'v_liquidacion_linea'>

/** Liquidaciones de beneficios sociales de los ceses (R-21…R-23). */
export default function Liquidaciones({ empleador }: { empleador: Fila<'empleador'> }) {
  const [ver, setVer] = useState<L | null>(null)
  const { data } = useQuery({ queryKey: ['pl_liquidaciones', empleador.id],
    queryFn: async () => ok(await supabase.from('v_liquidacion').select('*').eq('empleador_id', empleador.id).order('fecha_cese', { ascending: false })) })
  const hoy = hoyISO()
  return (
    <Card titulo="Liquidaciones">
      <Tabla filas={data} clave={(l) => l.trabajador_id!} onFila={setVer} vacio="Sin ceses desde que se usa el sistema. El cese se registra en la ficha del trabajador." columnas={[
        { titulo: 'Trabajador', celda: (l) => <><div className="font-medium">{l.apellidos_nombres}</div><div className="text-xs text-t3">{l.motivo_cese}</div></> },
        { titulo: 'Régimen', celda: (l) => <Estado valor={l.regimen} /> },
        { titulo: 'Cese', celda: (l) => fecha(l.fecha_cese) },
        { titulo: 'Pagar hasta', celda: (l) => <span className={(l.fecha_limite_pago ?? '') < hoy ? 'text-t3' : 'font-medium text-warning'}>{fecha(l.fecha_limite_pago)}</span> },
        { titulo: 'Beneficios', derecha: true, celda: (l) => s2(l.ingresos) },
        { titulo: 'Descuentos', derecha: true, celda: (l) => s2(l.descuentos) },
        { titulo: 'Neto (S/)', derecha: true, celda: (l) => <b>{s2(l.neto)}</b> },
      ]} />
      <Nota>CTS trunca + gratificación trunca y bonificación + vacaciones pendientes y truncas (menos lo adelantado) + indemnización vacacional por vencidas + indemnización por despido si el motivo indemniza y pasó el periodo de prueba; menos pensión sobre vacaciones y la regularización de quinta (sin proyección). Plazo: 48 horas.</Nota>
      {ver && <LiquidacionModal l={ver} empleador={empleador} onCerrar={() => setVer(null)} />}
    </Card>
  )
}

function LiquidacionModal({ l, empleador, onCerrar }: { l: L; empleador: Fila<'empleador'>; onCerrar: () => void }) {
  const [imprimir, setImprimir] = useState(false)
  const { data } = useQuery({ queryKey: ['pl_liq_lineas', l.trabajador_id],
    queryFn: async () => ok(await supabase.from('v_liquidacion_linea').select('*').eq('trabajador_id', l.trabajador_id!).order('orden')) })
  return (
    <Modal titulo={`Liquidación · ${l.apellidos_nombres}`} onCerrar={onCerrar} ancho="amplio">
      {data ? <Documento l={l} empleador={empleador} lineas={data} /> : <div className="text-sm text-t3">Cargando…</div>}
      <div className="mt-3 flex justify-end"><Boton disabled={!data} onClick={() => setImprimir(true)}><Icono nombre="imprimir" />Imprimir</Boton></div>
      {imprimir && data && <VistaImpresion titulo="Liquidación de beneficios sociales" onCerrar={() => setImprimir(false)}>
        <Documento l={l} empleador={empleador} lineas={data} />
      </VistaImpresion>}
    </Modal>
  )
}

function Documento({ l, empleador, lineas }: { l: L; empleador: Fila<'empleador'>; lineas: Linea[] }) {
  const de = (t: string) => lineas.filter((x) => x.tipo === t)
  const tabla = (titulo: string, xs: Linea[]) => (
    <table className="mt-2 w-full border border-black/20 text-xs">
      <thead><tr className="bg-black/5"><th className="px-2 py-1 text-left">{titulo}</th><th className="px-2 py-1 text-right">Base</th><th className="px-2 py-1 text-right">S/</th></tr></thead>
      <tbody>
        {xs.map((x) => <tr key={x.concepto}><td className="px-2 py-0.5">{x.nombre}</td>
          <td className="px-2 py-0.5 text-right text-black/50">{x.cantidad != null ? Number(x.cantidad) : ''}</td>
          <td className="num px-2 py-0.5 text-right">{s2(x.monto)}</td></tr>)}
        {xs.length === 0 && <tr><td className="px-2 py-1 text-black/40" colSpan={3}>—</td></tr>}
      </tbody>
      <tfoot><tr className="border-t border-black/20 font-semibold"><td className="px-2 py-1" colSpan={2}>Total</td>
        <td className="num px-2 py-1 text-right">{s2(xs.reduce((a, x) => a + (x.monto ?? 0), 0))}</td></tr></tfoot>
    </table>
  )
  return (
    <div className="rounded-lg border border-black/20 bg-white p-4 text-[13px] text-black">
      <div className="flex flex-wrap justify-between gap-2 border-b border-black/20 pb-2">
        <div><div className="font-bold">{empleador.razon_social}</div><div className="text-xs">RUC {empleador.ruc ?? '—'}</div></div>
        <div className="text-right font-bold uppercase">Liquidación de beneficios sociales</div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 py-2 text-xs sm:grid-cols-2">
        <div><span className="text-black/50">Trabajador: </span><b>{l.apellidos_nombres}</b></div>
        <div><span className="text-black/50">{l.tipo_documento}: </span>{l.numero_documento}</div>
        <div><span className="text-black/50">Cargo: </span>{l.cargo ?? '—'}</div>
        <div><span className="text-black/50">Régimen: </span>{ESTADOS[l.regimen ?? '']?.label}</div>
        <div><span className="text-black/50">Ingreso: </span>{fecha(l.fecha_ingreso)}</div>
        <div><span className="text-black/50">Cese: </span>{fecha(l.fecha_cese)} · {l.motivo_cese}</div>
        <div><span className="text-black/50">Tiempo de servicio: </span>{l.servicio_anios} años, {l.servicio_meses} meses, {l.servicio_dias} días</div>
        <div><span className="text-black/50">Remuneración computable: </span>S/ {s2(l.computable)}</div>
      </div>
      {tabla('Beneficios', de('ingreso'))}
      {tabla('Descuentos', de('descuento'))}
      {de('aporte').length > 0 && tabla('Aportes del empleador', de('aporte'))}
      <div className="mt-2 flex justify-end"><div className="border border-black/30 px-3 py-1 font-bold">Neto a pagar: S/ {s2(l.neto)}</div></div>
      <p className="mt-2 text-xs">Pago a más tardar el {fecha(l.fecha_limite_pago)}. Se entregan además el certificado de trabajo y la carta de liberación de la CTS.</p>
      <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
        <div className="border-t border-black/40 pt-1">Empleador</div>
        <div className="border-t border-black/40 pt-1">Trabajador</div>
      </div>
    </div>
  )
}
