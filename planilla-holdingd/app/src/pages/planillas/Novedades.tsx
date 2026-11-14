import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { fecha, mesLargo } from '../../lib/formato'
import { Boton, Campo, Card, Input, MensajeError, Modal, Nota, Select, Tabla } from '../../components/ui'
import { Icono } from '../../components/iconos'
import { finMesIso, s2, SelectTrabajador, useConceptos, useTiposAusencia } from './comun'

type Anular = { tabla: 'ausencia' | 'asistencia_dia' | 'movimiento'; id: string; titulo: string }

/** Novedades del mes: ausencias, horas extra / feriados / tardanzas, y montos (R-05…R-11). */
export default function Novedades({ empleador, mes }: { empleador: number; mes: string }) {
  const [nueva, setNueva] = useState<'ausencia' | 'asistencia' | 'monto' | null>(null)
  const [anular, setAnular] = useState<Anular | null>(null)
  const filtro = { empleador_id: empleador, periodo: mes }
  const ausencias = useQuery({ queryKey: ['pl_ausencias', filtro],
    queryFn: async () => ok(await supabase.from('v_ausencia').select('*').match(filtro).order('desde')) })
  const asistencia = useQuery({ queryKey: ['pl_asistencia', filtro],
    queryFn: async () => ok(await supabase.from('v_asistencia_dia').select('*').match(filtro).order('fecha')) })
  const montos = useQuery({ queryKey: ['pl_movimientos', filtro],
    queryFn: async () => ok(await supabase.from('v_movimiento').select('*').match(filtro).order('apellidos_nombres')) })
  const quitar = (a: Anular) => <Boton variante="fantasma" aria-label="Anular" onClick={(e) => { e.stopPropagation(); setAnular(a) }}><Icono nombre="cerrar" /></Boton>

  return (
    <div className="grid gap-4">
      <Card titulo={`Ausencias y vacaciones de ${mesLargo(mes)}`} accion={<Boton onClick={() => setNueva('ausencia')}><Icono nombre="mas" />Registrar</Boton>}>
        <Tabla filas={ausencias.data} clave={(a) => a.id!} vacio="Sin ausencias en el mes" columnas={[
          { titulo: 'Trabajador', celda: (a) => a.apellidos_nombres },
          { titulo: 'Tipo', celda: (a) => a.tipo_nombre },
          { titulo: 'Desde', celda: (a) => fecha(a.desde) },
          { titulo: 'Hasta', celda: (a) => fecha(a.hasta) },
          { titulo: 'Días', derecha: true, celda: (a) => a.dias },
          { titulo: 'Detalle', celda: (a) => <span className="text-t2">{a.detalle}</span> },
          { titulo: '', celda: (a) => quitar({ tabla: 'ausencia', id: a.id!, titulo: `Anular ${a.tipo_nombre?.toLowerCase()} de ${a.apellidos_nombres}` }) },
        ]} />
        <Nota>Faltas, licencias y suspensiones no se pagan; vacaciones se pagan como remuneración vacacional; descanso médico y licencias con goce, como sueldo; subsidios de EsSalud, aparte. Cada tipo dice si cuenta para CTS, gratificación y vacaciones (R-05).</Nota>
      </Card>

      <Card titulo="Horas extra, feriados trabajados y tardanzas" accion={<Boton onClick={() => setNueva('asistencia')}><Icono nombre="mas" />Registrar día</Boton>}>
        <Tabla filas={asistencia.data} clave={(a) => a.id!} vacio="Sin incidencias en el mes" columnas={[
          { titulo: 'Trabajador', celda: (a) => a.apellidos_nombres },
          { titulo: 'Fecha', celda: (a) => <>{fecha(a.fecha)}{a.feriado && <span className="ml-1 text-xs text-t3">({a.feriado})</span>}</> },
          { titulo: 'Horas extra', derecha: true, celda: (a) => a.horas_extra ? Number(a.horas_extra) : '—' },
          { titulo: 'Feriado / descanso trabajado', celda: (a) => a.feriado_trabajado ? 'Sí, sin descanso sustitutorio' : '—' },
          { titulo: 'Tardanza (min)', derecha: true, celda: (a) => a.minutos_tardanza || '—' },
          { titulo: '', celda: (a) => quitar({ tabla: 'asistencia_dia', id: a.id!, titulo: `Anular incidencia del ${fecha(a.fecha)}` }) },
        ]} />
        <Nota>Un día por fila. Horas extra del día: las 2 primeras al 25% y las siguientes al 35% (R-08). Feriado o descanso trabajado sin descanso sustitutorio: 2 remuneraciones diarias adicionales (R-09).</Nota>
      </Card>

      <Card titulo="Bonos, comisiones, adelantos y descuentos" accion={<Boton onClick={() => setNueva('monto')}><Icono nombre="mas" />Registrar monto</Boton>}>
        <Tabla filas={montos.data} clave={(a) => a.id!} vacio="Sin montos en el mes" columnas={[
          { titulo: 'Trabajador', celda: (a) => a.apellidos_nombres },
          { titulo: 'Concepto', celda: (a) => <>{a.concepto_nombre}{a.liquidacion && <span className="ml-1 text-xs text-t3">(liquidación)</span>}</> },
          { titulo: 'Tipo', celda: (a) => <span className={a.tipo === 'descuento' ? 'text-critical' : 'text-good'}>{a.tipo === 'descuento' ? 'Descuento' : 'Ingreso'}</span> },
          { titulo: 'Monto (S/)', derecha: true, celda: (a) => s2(a.monto) },
          { titulo: 'Detalle', celda: (a) => <span className="text-t2">{a.detalle}</span> },
          { titulo: '', celda: (a) => quitar({ tabla: 'movimiento', id: a.id!, titulo: `Anular ${a.concepto_nombre?.toLowerCase()} de ${a.apellidos_nombres}` }) },
        ]} />
        <Nota>Cada concepto ya sabe si está afecto a EsSalud, pensión y quinta, y si cuenta para beneficios (Parámetros → Conceptos). Los bonos fijos de cada mes se registran en la ficha del trabajador.</Nota>
      </Card>

      {nueva === 'ausencia' && <AusenciaModal empleador={empleador} mes={mes} onCerrar={() => setNueva(null)} />}
      {nueva === 'asistencia' && <AsistenciaModal empleador={empleador} mes={mes} onCerrar={() => setNueva(null)} />}
      {nueva === 'monto' && <MontoModal empleador={empleador} mes={mes} onCerrar={() => setNueva(null)} />}
      {anular && <AnularPlanilla {...anular} onCerrar={() => setAnular(null)} />}
    </div>
  )
}

function Pie({ onCerrar, guardar }: { onCerrar: () => void; guardar: { isPending: boolean; error: unknown; mutate: () => void } }) {
  return <>
    <div className="mt-3"><MensajeError error={guardar.error} /></div>
    <div className="mt-4 flex justify-end gap-2">
      <Boton onClick={onCerrar}>Cancelar</Boton>
      <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
    </div>
  </>
}

function useGuardar(fn: () => Promise<unknown>, onCerrar: () => void) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => { qc.invalidateQueries(); onCerrar() } })
}

function AusenciaModal({ empleador, mes, onCerrar }: { empleador: number; mes: string; onCerrar: () => void }) {
  const tipos = useTiposAusencia()
  const [f, setF] = useState({ trabajador: '', tipo: '', desde: mes, hasta: mes, detalle: '' })
  const guardar = useGuardar(async () => {
    if (!f.trabajador || !f.tipo) throw new Error('Elige el trabajador y el tipo')
    if (f.desde.slice(0, 7) !== f.hasta.slice(0, 7)) throw new Error('Registra una fila por mes (desde y hasta en el mismo mes)')
    ok(await supabase.from('ausencia').insert({ trabajador_id: f.trabajador, tipo: f.tipo, desde: f.desde, hasta: f.hasta, detalle: f.detalle || null }))
  }, onCerrar)
  return (
    <Modal titulo="Registrar ausencia o vacaciones" onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Trabajador"><SelectTrabajador empleador={empleador} mes={mes} value={f.trabajador} onChange={(v) => setF({ ...f, trabajador: v })} /></Campo></div>
        <div className="sm:col-span-2"><Campo label="Tipo">
          <Select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="">Elige…</option>
            {tipos.data?.map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
          </Select></Campo></div>
        <Campo label="Desde"><Input type="date" value={f.desde} min={mes} max={finMesIso(mes)} onChange={(e) => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo label="Hasta"><Input type="date" value={f.hasta} min={f.desde} max={finMesIso(mes)} onChange={(e) => setF({ ...f, hasta: e.target.value })} /></Campo>
        <div className="sm:col-span-2"><Campo label="Detalle (certificado, solicitud…)"><Input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></Campo></div>
      </div>
      <Pie onCerrar={onCerrar} guardar={guardar} />
    </Modal>
  )
}

function AsistenciaModal({ empleador, mes, onCerrar }: { empleador: number; mes: string; onCerrar: () => void }) {
  const [f, setF] = useState({ trabajador: '', fecha: mes, horas: '', feriado: false, tardanza: '', detalle: '' })
  const guardar = useGuardar(async () => {
    if (!f.trabajador) throw new Error('Elige el trabajador')
    const horas = Number(f.horas || 0), tardanza = Number(f.tardanza || 0)
    if (!horas && !f.feriado && !tardanza) throw new Error('Registra horas extra, feriado trabajado o tardanza')
    ok(await supabase.from('asistencia_dia').insert({ trabajador_id: f.trabajador, fecha: f.fecha, horas_extra: horas,
      feriado_trabajado: f.feriado, minutos_tardanza: tardanza, detalle: f.detalle || null }))
  }, onCerrar)
  return (
    <Modal titulo="Registrar un día" onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Trabajador"><SelectTrabajador empleador={empleador} mes={mes} value={f.trabajador} onChange={(v) => setF({ ...f, trabajador: v })} /></Campo></div>
        <Campo label="Fecha"><Input type="date" value={f.fecha} min={mes} max={finMesIso(mes)} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo label="Horas extra del día"><Input type="number" step="0.25" min="0" value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} /></Campo>
        <Campo label="Minutos de tardanza"><Input type="number" min="0" value={f.tardanza} onChange={(e) => setF({ ...f, tardanza: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={f.feriado} onChange={(e) => setF({ ...f, feriado: e.target.checked })} />
          Trabajó en feriado o descanso, sin descanso sustitutorio
        </label>
        <div className="sm:col-span-2"><Campo label="Detalle"><Input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></Campo></div>
      </div>
      <Pie onCerrar={onCerrar} guardar={guardar} />
    </Modal>
  )
}

function MontoModal({ empleador, mes, onCerrar }: { empleador: number; mes: string; onCerrar: () => void }) {
  const conceptos = useConceptos()
  const [f, setF] = useState({ trabajador: '', concepto: '', monto: '', detalle: '' })
  const manuales = (conceptos.data ?? []).filter((c) => c.manual)
  const guardar = useGuardar(async () => {
    if (!f.trabajador || !f.concepto) throw new Error('Elige el trabajador y el concepto')
    if (!(Number(f.monto) > 0)) throw new Error('El monto debe ser mayor que cero')
    ok(await supabase.from('movimiento').insert({ trabajador_id: f.trabajador, periodo: mes, concepto: f.concepto, monto: Number(f.monto), detalle: f.detalle || null }))
  }, onCerrar)
  return (
    <Modal titulo={`Registrar monto de ${mesLargo(mes)}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Trabajador"><SelectTrabajador empleador={empleador} mes={mes} value={f.trabajador} onChange={(v) => setF({ ...f, trabajador: v })} /></Campo></div>
        <Campo label="Concepto">
          <Select value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })}>
            <option value="">Elige…</option>
            <optgroup label="Ingresos">{manuales.filter((c) => c.tipo === 'ingreso').map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</optgroup>
            <optgroup label="Descuentos">{manuales.filter((c) => c.tipo === 'descuento').map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}{c.liquidacion ? ' (liquidación)' : ''}</option>)}</optgroup>
          </Select>
        </Campo>
        <Campo label="Monto (S/)"><Input type="number" step="0.01" min="0" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></Campo>
        <div className="sm:col-span-2"><Campo label="Detalle"><Input value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} /></Campo></div>
      </div>
      <Pie onCerrar={onCerrar} guardar={guardar} />
    </Modal>
  )
}

/** Anular un registro de planilla con motivo (R-28). */
export function AnularPlanilla({ tabla, id, titulo, onCerrar }: { tabla: string; id: string; titulo: string; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState('')
  const m = useGuardar(async () => ok(await supabase.rpc('anular', { p_tabla: tabla, p_id: id, p_motivo: motivo })), onCerrar)
  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-t2">Deja de contar en la planilla. Queda en la bitácora con su motivo.</p>
      <Campo label="Motivo"><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></Campo>
      <div className="mt-3"><MensajeError error={m.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="peligro" disabled={!motivo.trim() || m.isPending} onClick={() => m.mutate()}>Anular</Boton>
      </div>
    </Modal>
  )
}
