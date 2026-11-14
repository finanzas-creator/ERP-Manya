import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { dinero, fecha, hoyISO, mesLargo, plural } from '../../lib/formato'
import { useRol } from '../../lib/sesion'
import type { Fila } from '../../lib/db'
import { Boton, Campo, Card, Estado, Input, Kpi, MensajeError, Modal, Nota, Tabla } from '../../components/ui'
import { Icono } from '../../components/iconos'
import { Boleta, VistaImpresion, type CabeceraBoleta, type EmpleadorBoleta, type LineaBoleta } from './Boleta'
import { descargarCsv, s2 } from './comun'

type Fp = Fila<'v_planilla'>
type Datos = { empleador: EmpleadorBoleta; cabecera: CabeceraBoleta; lineas: LineaBoleta[] }

/** Planilla del mes de un empleador: totales, observaciones, trabajadores y boletas (R-15, R-24, R-25). */
export default function PlanillaMes({ empleador, mes }: { empleador: Fila<'empleador'>; mes: string }) {
  const qc = useQueryClient()
  const admin = useRol() === 'admin'
  const [boleta, setBoleta] = useState<Fp | null>(null)
  const [imprimir, setImprimir] = useState(false)
  const [reabrir, setReabrir] = useState(false)
  const filtro = { empleador_id: empleador.id, periodo: mes }
  const resumen = useQuery({
    queryKey: ['pl_resumen', filtro],
    queryFn: async () => ok(await supabase.from('v_planilla_resumen').select('*').match(filtro).maybeSingle()),
  })
  const filas = useQuery({
    queryKey: ['pl_mes', filtro],
    queryFn: async () => ok(await supabase.from('v_planilla').select('*').match(filtro).order('apellidos_nombres')),
  })
  const obs = useQuery({
    queryKey: ['pl_obs', filtro],
    queryFn: async () => ok(await supabase.from('v_pl_observacion').select('*').match(filtro).order('bloquea', { ascending: false })),
  })
  const cerrar = useMutation({
    mutationFn: async () => ok(await supabase.rpc('cerrar_planilla', { p_empleador: empleador.id, p_periodo: mes })),
    onSuccess: () => qc.invalidateQueries(),
  })
  const r = resumen.data
  const bloqueos = (obs.data ?? []).filter((o) => o.bloquea)
  const antesDeInicio = mes < empleador.inicio_planilla

  return (
    <>
      {antesDeInicio && <div className="mb-3 rounded-lg bg-info-bg px-3 py-2 text-sm">
        Este empleador se calcula en el sistema desde {mesLargo(empleador.inicio_planilla)}.</div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Trabajadores" valor={r?.trabajadores ?? 0} detalle={r ? (r.cerrada ? <Estado valor="cerrada" /> : r.tasas_provisionales ? <Estado valor="provisional" /> : <Estado valor="abierta" />) : null} />
        <Kpi label="Total ingresos" valor={dinero(r?.ingresos, 'PEN')} detalle={`descuentos ${dinero(r?.descuentos, 'PEN')}`} />
        <Kpi label="Neto a pagar" valor={dinero(r?.neto, 'PEN')} detalle={`AFP/ONP ${dinero(r?.pension, 'PEN')} · quinta ${dinero(r?.quinta, 'PEN')}`} />
        <Kpi label="EsSalud (empleador)" valor={dinero(r?.essalud, 'PEN')} />
        <Kpi label="Costo empresa" valor={dinero(r?.costo_empresa, 'PEN')}
          detalle={`provisiones: grati ${s2(r?.provision_gratificacion)} · CTS ${s2(r?.provision_cts)} · vac. ${s2(r?.provision_vacaciones)}`} />
      </div>

      {(obs.data?.length ?? 0) > 0 && (
        <Card titulo={<>Por revisar <span className="font-normal text-t3">· {plural(obs.data!.length, 'observación', 'observaciones')}{bloqueos.length ? `, ${bloqueos.length} impiden cerrar` : ''}</span></>} className="mt-4">
          <ul className="divide-y divide-line text-sm">
            {obs.data!.map((o, i) => (
              <li key={i} className="flex gap-3 px-4 py-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${o.bloquea ? 'bg-critical' : 'bg-warning'}`} aria-hidden />
                <span><b className="font-medium">{o.apellidos_nombres ?? 'Empleador'}</b> — {o.mensaje}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-4" titulo={<>Planilla de {mesLargo(mes)}</>} accion={<div className="flex flex-wrap gap-2">
        <Boton disabled={!filas.data?.length} onClick={() => descargarCsv(`planilla-${empleador.ruc ?? empleador.id}-${mes.slice(0, 7)}.csv`,
          (filas.data ?? []).map((f) => ({ trabajador: f.apellidos_nombres, documento: f.numero_documento, regimen: f.regimen, dias: f.dias_vinculo,
            ingresos: f.ingresos, descuentos: f.descuentos, neto: f.neto, pension: f.pension, quinta: f.quinta, essalud: f.essalud,
            prov_grati: f.provision_gratificacion, prov_bonif: f.provision_bonificacion, prov_cts: f.provision_cts,
            prov_vacaciones: f.provision_vacaciones, costo_empresa: f.costo_empresa })))}>Exportar</Boton>
        <Boton disabled={!filas.data?.length} onClick={() => setImprimir(true)}><Icono nombre="imprimir" />Boletas</Boton>
        {r?.cerrada
          ? admin && <Boton variante="peligro" onClick={() => setReabrir(true)}>Reabrir</Boton>
          : <Boton variante="primario" disabled={!filas.data?.length || bloqueos.length > 0 || cerrar.isPending}
              title={bloqueos.length ? 'Resuelve las observaciones en rojo' : undefined} onClick={() => cerrar.mutate()}>Cerrar planilla</Boton>}
      </div>}>
        <MensajeError error={cerrar.error} />
        <Tabla filas={filas.data} clave={(f) => f.trabajador_id!} onFila={setBoleta} vacio="Sin trabajadores con vínculo en el mes" columnas={[
          { titulo: 'Trabajador', celda: (f) => <><div className="font-medium">{f.apellidos_nombres}</div><div className="text-xs text-t3">{f.cargo ?? f.numero_documento}</div></> },
          { titulo: 'Régimen', celda: (f) => <Estado valor={f.regimen} /> },
          { titulo: 'Días', derecha: true, celda: (f) => <>{f.dias_sueldo}{f.dias_vinculo !== f.dias_sueldo && <span className="text-t3">/{f.dias_vinculo}</span>}</> },
          { titulo: 'Ingresos', derecha: true, celda: (f) => s2(f.ingresos) },
          { titulo: 'Descuentos', derecha: true, celda: (f) => s2(f.descuentos) },
          { titulo: 'Neto', derecha: true, celda: (f) => <b>{s2(f.neto)}</b> },
          { titulo: 'EsSalud', derecha: true, celda: (f) => s2(f.essalud) },
          { titulo: 'Costo empresa', derecha: true, celda: (f) => s2(f.costo_empresa) },
          { titulo: 'Boleta', celda: (f) => f.boleta_id ? (f.entregada_en ? <span className="text-xs text-good">Entregada {fecha(f.entregada_en)}</span> : <span className="text-xs text-t2">Emitida</span>) : <span className="text-xs text-t3">Borrador</span> },
        ]} pie={filas.data?.length ? <tr>
          <td className="px-4 py-2" colSpan={3}>Total</td>
          <td className="num px-4 py-2 text-right">{s2(r?.ingresos)}</td><td className="num px-4 py-2 text-right">{s2(r?.descuentos)}</td>
          <td className="num px-4 py-2 text-right">{s2(r?.neto)}</td><td className="num px-4 py-2 text-right">{s2(r?.essalud)}</td>
          <td className="num px-4 py-2 text-right">{s2(r?.costo_empresa)}</td><td />
        </tr> : undefined} />
        <Nota>Montos en soles. Todo se calcula con las novedades del mes y los parámetros vigentes (RMV, UIT, tasas SBS del periodo). Al cerrar se emiten las boletas y el mes queda bloqueado. Clic en un trabajador para ver su boleta.</Nota>
      </Card>

      {boleta && <BoletaModal fila={boleta} empleador={empleador} onCerrar={() => setBoleta(null)} />}
      {imprimir && <ImprimirBoletas empleador={empleador} mes={mes} filas={filas.data ?? []} onCerrar={() => setImprimir(false)} />}
      {reabrir && <ReabrirModal empleador={empleador.id} mes={mes} onCerrar={() => setReabrir(false)} />}
    </>
  )
}

const empleadorBoleta = (e: Fila<'empleador'>): EmpleadorBoleta => ({ razon_social: e.razon_social, ruc: e.ruc, direccion: e.direccion })

/** Datos de las boletas de un mes: las emitidas (copia fiel) o el borrador calculado. */
async function datosBoletas(empleador: Fila<'empleador'>, mes: string, filas: Fp[]): Promise<Map<string, Datos>> {
  const mapa = new Map<string, Datos>()
  const emitidas = filas.filter((f) => f.boleta_id)
  if (emitidas.length) {
    const bs = ok(await supabase.from('boleta').select('trabajador_id, datos').eq('empleador_id', empleador.id).eq('periodo', mes).is('anulado_en', null))
    for (const b of bs) mapa.set(b.trabajador_id, b.datos as unknown as Datos)
  }
  const borradores = filas.filter((f) => !mapa.has(f.trabajador_id!))
  if (borradores.length) {
    const ls = ok(await supabase.from('v_boleta_linea').select('*').eq('periodo', mes)
      .in('trabajador_id', borradores.map((f) => f.trabajador_id!)).order('orden'))
    for (const f of borradores) mapa.set(f.trabajador_id!, { empleador: empleadorBoleta(empleador), cabecera: f as CabeceraBoleta,
      lineas: ls.filter((l) => l.trabajador_id === f.trabajador_id) })
  }
  return mapa
}

function BoletaModal({ fila, empleador, onCerrar }: { fila: Fp; empleador: Fila<'empleador'>; onCerrar: () => void }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['boleta', fila.trabajador_id, fila.periodo, fila.boleta_id],
    queryFn: async () => (await datosBoletas(empleador, fila.periodo!, [fila])).get(fila.trabajador_id!)!,
  })
  const [entrega, setEntrega] = useState(hoyISO())
  const entregar = useMutation({
    mutationFn: async () => ok(await supabase.from('boleta').update({ entregada_en: entrega, entrega_detalle: 'Registrada en el sistema' }).eq('id', fila.boleta_id!)),
    onSuccess: () => qc.invalidateQueries(),
  })
  const [imprimir, setImprimir] = useState(false)
  const difiere = fila.neto_emitido != null && Math.abs((fila.neto_emitido ?? 0) - (fila.neto ?? 0)) >= 0.01
  return (
    <Modal titulo={`Boleta · ${fila.apellidos_nombres}`} onCerrar={onCerrar} ancho="amplio">
      {data ? <Boleta empleador={data.empleador} periodo={fila.periodo!} c={data.cabecera} lineas={data.lineas} borrador={!fila.boleta_id} /> : <div className="text-sm text-t3">Cargando…</div>}
      {difiere && <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning">La boleta emitida ya no coincide con el recálculo (S/ {s2(fila.neto)}). Revisa qué cambió.</p>}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        {fila.boleta_id && !fila.entregada_en ? (
          <div className="flex items-end gap-2">
            <Campo label="Entregada el"><Input type="date" value={entrega} onChange={(e) => setEntrega(e.target.value)} /></Campo>
            <Boton disabled={entregar.isPending} onClick={() => entregar.mutate()}>Registrar entrega</Boton>
          </div>
        ) : <span className="text-xs text-t3">{fila.entregada_en ? `Entregada el ${fecha(fila.entregada_en)}` : 'Borrador: se emite al cerrar la planilla.'}</span>}
        <Boton onClick={() => setImprimir(true)} disabled={!data}><Icono nombre="imprimir" />Imprimir</Boton>
      </div>
      <div className="mt-2"><MensajeError error={entregar.error} /></div>
      {imprimir && data && <VistaImpresion titulo="Boleta" onCerrar={() => setImprimir(false)}>
        <Boleta empleador={data.empleador} periodo={fila.periodo!} c={data.cabecera} lineas={data.lineas} borrador={!fila.boleta_id} />
      </VistaImpresion>}
    </Modal>
  )
}

function ImprimirBoletas({ empleador, mes, filas, onCerrar }: { empleador: Fila<'empleador'>; mes: string; filas: Fp[]; onCerrar: () => void }) {
  const { data } = useQuery({ queryKey: ['boletas', empleador.id, mes, filas.map((f) => f.boleta_id).join()], queryFn: () => datosBoletas(empleador, mes, filas) })
  return (
    <VistaImpresion titulo={`Boletas de ${mesLargo(mes)} · ${filas.length}`} onCerrar={onCerrar}>
      {!data && <div className="text-sm text-t3">Preparando…</div>}
      {data && filas.map((f) => {
        const d = data.get(f.trabajador_id!)
        // dos copias por hoja: empleador y trabajador
        return d && <div key={f.trabajador_id} className="salto-pagina flex flex-col gap-6">
          <Boleta empleador={d.empleador} periodo={mes} c={d.cabecera} lineas={d.lineas} borrador={!f.boleta_id} copia="Copia empleador" />
          <div className="border-t border-dashed border-black/40" />
          <Boleta empleador={d.empleador} periodo={mes} c={d.cabecera} lineas={d.lineas} borrador={!f.boleta_id} copia="Copia trabajador" />
        </div>
      })}
    </VistaImpresion>
  )
}

function ReabrirModal({ empleador, mes, onCerrar }: { empleador: number; mes: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const m = useMutation({
    mutationFn: async () => ok(await supabase.rpc('reabrir_planilla', { p_empleador: empleador, p_periodo: mes, p_motivo: motivo })),
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`Reabrir planilla de ${mesLargo(mes)}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-t2">Las boletas emitidas se anulan con este motivo (quedan en la bitácora) y el mes vuelve a aceptar cambios. Al cerrar de nuevo se emiten boletas nuevas.</p>
      <Campo label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
      <div className="mt-3"><MensajeError error={m.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="peligro" disabled={!motivo.trim() || m.isPending} onClick={() => m.mutate()}>Reabrir</Boton>
      </div>
    </Modal>
  )
}
