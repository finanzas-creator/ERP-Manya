import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ok, supabase } from '../lib/supabase'
import { dinero, mesActual, mesLargo, plural, sumarMeses, usd, usd2 } from '../lib/formato'
import { usePersonas, useSubAreas } from '../lib/catalogos'
import { useRol } from '../lib/sesion'
import { Boton, Campo, Card, Input, Kpi, MensajeError, Modal, Nota, Pestanas, Select, SelectorMes, Tabla, Titulo } from '../components/ui'
import { AnularModal, type TablaAnulable } from '../components/Anular'
import { Icono } from '../components/iconos'
import type { Fila } from '../lib/db'

type Pestana = 'planilla' | 'herramientas' | 'comisiones'
type Persona = Fila<'v_planilla_usd'>
type Herramienta = Fila<'v_herramienta_usd'>
type Anulando = { tabla: TablaAnulable; id: string; titulo: string }

const tooltip = { background: 'var(--surface-1)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text-1)' }

/** Costos de la agencia por mes: planilla, herramientas y comisiones pagadas (R-60, R-42). */
export default function Costos() {
  const [pestana, setPestana] = useState<Pestana>('planilla')
  const [elegido, setElegido] = useState<string | null>(null)
  const meses = useQuery({
    queryKey: ['costos_mes'],
    queryFn: async () => ok(await supabase.from('v_costos_mes').select('*').order('periodo')),
  })
  const ultimo = meses.data?.filter((m) => m.periodo! <= mesActual()).at(-1)?.periodo
  const mes = elegido ?? ultimo ?? mesActual()
  const m = meses.data?.find((x) => x.periodo === mes)
  const tendencia = (meses.data ?? []).filter((x) => x.periodo! > sumarMeses(mes, -12) && x.periodo! <= mes)

  return (
    <>
      <Titulo accion={<SelectorMes mes={mes} onCambio={setElegido} />}>Planilla y gastos</Titulo>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Planilla" valor={usd(m?.planilla_usd)} detalle="costo empresa, en USD" onClick={() => setPestana('planilla')} />
        <Kpi label="Herramientas" valor={usd(m?.herramientas_usd)} detalle="suscripciones y servidores" onClick={() => setPestana('herramientas')} />
        <Kpi label="Comisiones pagadas" valor={usd(m?.comisiones_usd)} detalle="comisiones de venta" onClick={() => setPestana('comisiones')} />
        <Kpi label="Costos de proveedor" valor={usd(m?.costos_directos_usd)} detalle="directos de las ventas" />
      </div>

      <Card titulo="Evolución de costos · últimos 12 meses" className="mt-4">
        <div className="h-64 p-3">
          <ResponsiveContainer>
            <BarChart data={tendencia.map((x) => ({ mes: mesLargo(x.periodo!), Planilla: x.planilla_usd, Herramientas: x.herramientas_usd, Comisiones: x.comisiones_usd }))}>
              <CartesianGrid stroke="var(--line)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v: number) => usd(v)} contentStyle={tooltip} cursor={{ fill: 'var(--surface-2)' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
              <Bar dataKey="Planilla" stackId="c" fill="var(--series-1)" />
              <Bar dataKey="Herramientas" stackId="c" fill="var(--series-2)" />
              <Bar dataKey="Comisiones" stackId="c" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mt-6 mb-3">
        <Pestanas valor={pestana} onCambio={setPestana} opciones={[
          { clave: 'planilla', label: 'Planilla' },
          { clave: 'herramientas', label: 'Herramientas' },
          { clave: 'comisiones', label: 'Comisiones' },
        ]} />
      </div>
      {pestana === 'planilla' && <Planilla mes={mes} />}
      {pestana === 'herramientas' && <Herramientas mes={mes} />}
      {pestana === 'comisiones' && <Comisiones mes={mes} />}
    </>
  )
}

function CopiarMes({ tabla, mes, que }: { tabla: 'planilla' | 'herramienta_gasto'; mes: string; que: string }) {
  const qc = useQueryClient()
  const origen = sumarMeses(mes, -1)
  const copiar = useMutation({
    mutationFn: async () => ok(await supabase.rpc('copiar_costos_mes', { p_tabla: tabla, p_origen: origen, p_destino: mes })),
    onSuccess: () => qc.invalidateQueries(),
  })
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-t2">
      <div>Aún no hay {que} en {mesLargo(mes)}.</div>
      <Boton variante="primario" disabled={copiar.isPending} onClick={() => copiar.mutate()}>Copiar {que} de {mesLargo(origen)}</Boton>
      <div className="text-xs text-t3">Se copia tal cual; luego ajusta montos, agrega o anula filas.</div>
      <MensajeError error={copiar.error} />
    </div>
  )
}

// ---------------------------------------------------------------- Planilla
function Planilla({ mes }: { mes: string }) {
  const [criterio, setCriterio] = useState<'sub_area' | 'tipo_recibo'>('sub_area')
  const [editar, setEditar] = useState<Persona | 'nueva' | null>(null)
  const [anular, setAnular] = useState<Anulando | null>(null)
  const filas = useQuery({
    queryKey: ['planilla', mes],
    queryFn: async () => ok(await supabase.from('v_planilla_usd').select('*').eq('periodo', mes).order('costo_usd', { ascending: false })),
  })
  const grupos = useQuery({
    queryKey: ['planilla_grupo', mes],
    queryFn: async () => ok(await supabase.from('v_planilla_grupo_mes').select('*').eq('periodo', mes).order('costo_usd', { ascending: false })),
  })
  const deGrupo = (g: string) => (filas.data ?? []).filter((p) => ((criterio === 'sub_area' ? p.sub_area : p.tipo_recibo) ?? 'Sin dato') === g)
  const lista = (grupos.data ?? []).filter((g) => g.criterio === criterio)
  const vacia = filas.data?.length === 0

  return (
    <Card titulo={<>Planilla de {mesLargo(mes)} {filas.data && <span className="font-normal text-t3">· {plural(filas.data.length, 'persona', 'personas')}</span>}</>}
      accion={<div className="flex flex-wrap items-center gap-2">
        <Pestanas valor={criterio} onCambio={setCriterio} opciones={[{ clave: 'sub_area', label: 'Por área' }, { clave: 'tipo_recibo', label: 'Por tipo de recibo' }]} />
        <Boton onClick={() => setEditar('nueva')}><Icono nombre="mas" />Agregar</Boton>
      </div>}>
      {vacia ? <CopiarMes tabla="planilla" mes={mes} que="planilla" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-t2">
              {['Persona', 'Cargo', 'Tipo de recibo', 'Forma de pago', 'Área', 'Costo (S/)', 'Costo (USD)'].map((t, i) =>
                <th key={t} className={`px-4 py-2 font-medium whitespace-nowrap ${i >= 5 ? 'text-right' : ''}`}>{t}</th>)}
            </tr></thead>
            <tbody>
              {filas.data === undefined && <tr><td colSpan={7} className="px-4 py-6 text-center text-t3">Cargando…</td></tr>}
              {lista.map((g) => (
                <GrupoPlanilla key={g.grupo} grupo={g} personas={deGrupo(g.grupo!)} onFila={setEditar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Nota>Costo empresa del mes (sueldo bruto + provisiones y aportes), como la columna "Sueldo Bruto Total" del sheet. Los soles se convierten con el tipo de cambio del mes (R-60). Clic en una fila para editarla o anularla.</Nota>
      {editar && <PlanillaModal mes={mes} fila={editar === 'nueva' ? null : editar} sugerencias={filas.data ?? []}
        onCerrar={() => setEditar(null)}
        onAnular={(p) => { setEditar(null); setAnular({ tabla: 'planilla', id: p.id!, titulo: `Anular planilla de ${p.persona}` }) }} />}
      {anular && <AnularModal {...anular} onCerrar={() => setAnular(null)} />}
    </Card>
  )
}

function GrupoPlanilla({ grupo, personas, onFila }:
  { grupo: Fila<'v_planilla_grupo_mes'>; personas: Persona[]; onFila: (p: Persona) => void }) {
  return (
    <>
      <tr className="border-b border-line bg-s2">
        <td colSpan={5} className="px-4 py-2 font-semibold">{grupo.grupo} <span className="font-normal text-t3">· {plural(grupo.personas, 'persona', 'personas')}</span></td>
        <td className="num px-4 py-2 text-right font-semibold">{dinero(grupo.costo_pen, 'PEN')}</td>
        <td className="num px-4 py-2 text-right font-semibold">{usd(grupo.costo_usd)}</td>
      </tr>
      {personas.map((p) => (
        <tr key={p.id} onClick={() => onFila(p)} className="cursor-pointer border-b border-line last:border-0 hover:bg-s2">
          <td className="px-4 py-2">{p.persona}</td>
          <td className="px-4 py-2 text-t2">{p.cargo}</td>
          <td className="px-4 py-2 text-t2">{p.tipo_recibo}</td>
          <td className="px-4 py-2 text-t2">{p.forma_pago}</td>
          <td className="px-4 py-2 text-t2">{p.sub_area}</td>
          <td className="num px-4 py-2 text-right">{dinero(p.costo_total, p.moneda)}</td>
          <td className="num px-4 py-2 text-right text-t2">{usd(p.costo_usd)}</td>
        </tr>
      ))}
    </>
  )
}

/** Valores ya usados en la planilla del mes, como sugerencias del campo (no es una lista fija). */
function Sugerencias({ id, valores }: { id: string; valores: (string | null)[] }) {
  return <datalist id={id}>{[...new Set(valores.filter(Boolean))].sort().map((v) => <option key={v} value={v!} />)}</datalist>
}

function PlanillaModal({ mes, fila, sugerencias, onCerrar, onAnular }:
  { mes: string; fila: Persona | null; sugerencias: Persona[]; onCerrar: () => void; onAnular: (p: Persona) => void }) {
  const qc = useQueryClient()
  const esAdmin = useRol() === 'admin'
  const personas = usePersonas()
  const subAreas = useSubAreas()
  const [f, setF] = useState({
    persona: fila?.persona_id ? String(fila.persona_id) : '', personaNueva: '',
    cargo: fila?.cargo ?? '', tipoRecibo: fila?.tipo_recibo ?? '', formaPago: fila?.forma_pago ?? '',
    subArea: fila?.sub_area_id ? String(fila.sub_area_id) : '', moneda: fila?.moneda ?? 'PEN', costo: fila?.costo_total != null ? String(fila.costo_total) : '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const guardar = useMutation({
    mutationFn: async () => {
      const costo = Number(f.costo)
      if (!(costo > 0)) throw new Error('El costo debe ser mayor que cero')
      let persona = Number(f.persona)
      if (f.persona === 'nueva') {
        if (!f.personaNueva.trim()) throw new Error('Escribe el nombre de la persona')
        persona = ok(await supabase.from('persona').insert({ nombre: f.personaNueva.trim() }).select('id').single()).id
      }
      if (!persona) throw new Error('Elige la persona')
      const datos = { persona_id: persona, cargo: f.cargo.trim() || null, tipo_recibo: f.tipoRecibo.trim() || null,
        forma_pago: f.formaPago.trim() || null, sub_area_id: f.subArea ? Number(f.subArea) : null,
        moneda: f.moneda as 'PEN' | 'USD', costo_total: costo }
      if (fila) ok(await supabase.from('planilla').update(datos).eq('id', fila.id!))
      else ok(await supabase.from('planilla').insert({ ...datos, periodo: mes }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })

  return (
    <Modal titulo={fila ? `Planilla · ${fila.persona}` : `Agregar a la planilla de ${mesLargo(mes)}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo label="Persona">
            <Select value={f.persona} onChange={set('persona')} disabled={!!fila}>
              <option value="">Elige…</option>
              {esAdmin && <option value="nueva">+ Persona nueva</option>}
              {personas.data?.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Campo>
          {!esAdmin && !fila && <p className="mt-1 text-xs text-t3">¿No está en la lista? El administrador la agrega.</p>}
        </div>
        {f.persona === 'nueva' && <div className="sm:col-span-2"><Campo label="Nombre de la persona"><Input value={f.personaNueva} onChange={set('personaNueva')} autoFocus /></Campo></div>}
        <Campo label="Cargo"><Input value={f.cargo} onChange={set('cargo')} list="cargos" /></Campo>
        <Campo label="Área">
          <Select value={f.subArea} onChange={set('subArea')}>
            <option value="">Sin área</option>
            {subAreas.data?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        </Campo>
        <Campo label="Tipo de recibo"><Input value={f.tipoRecibo} onChange={set('tipoRecibo')} list="recibos" /></Campo>
        <Campo label="Forma de pago"><Input value={f.formaPago} onChange={set('formaPago')} list="formas" /></Campo>
        <Campo label="Moneda">
          <Select value={f.moneda} onChange={set('moneda')}><option value="PEN">Soles</option><option value="USD">Dólares</option></Select>
        </Campo>
        <Campo label="Costo empresa del mes"><Input type="number" step="0.01" value={f.costo} onChange={set('costo')} /></Campo>
      </div>
      <Sugerencias id="cargos" valores={sugerencias.map((p) => p.cargo)} />
      <Sugerencias id="recibos" valores={sugerencias.map((p) => p.tipo_recibo)} />
      <Sugerencias id="formas" valores={sugerencias.map((p) => p.forma_pago)} />
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div>{fila && <Boton variante="peligro" onClick={() => onAnular(fila)}>Anular</Boton>}</div>
        <div className="flex gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Herramientas
function Herramientas({ mes }: { mes: string }) {
  const [editar, setEditar] = useState<Herramienta | 'nueva' | null>(null)
  const [anular, setAnular] = useState<Anulando | null>(null)
  const { data } = useQuery({
    queryKey: ['herramientas', mes],
    queryFn: async () => ok(await supabase.from('v_herramienta_usd').select('*').eq('periodo', mes).order('monto_usd', { ascending: false })),
  })
  return (
    <Card titulo={<>Herramientas de {mesLargo(mes)} {data && <span className="font-normal text-t3">· {data.length}</span>}</>}
      accion={<Boton onClick={() => setEditar('nueva')}><Icono nombre="mas" />Agregar</Boton>}>
      {data?.length === 0 ? <CopiarMes tabla="herramienta_gasto" mes={mes} que="herramientas" /> : (
        <Tabla filas={data} clave={(h) => h.id!} onFila={setEditar} columnas={[
          { titulo: 'Herramienta', celda: (h) => <span className="font-medium">{h.nombre}</span> },
          { titulo: 'Tipo', celda: (h) => <span className="text-t2">{h.tipo}</span> },
          { titulo: 'Plan', celda: (h) => <span className="text-t2">{h.plan}</span> },
          { titulo: 'Tarjeta', celda: (h) => <span className="text-t2">{h.tarjeta}</span> },
          { titulo: 'Monto', derecha: true, celda: (h) => dinero(h.monto, h.moneda) },
          { titulo: 'USD', derecha: true, celda: (h) => usd2(h.monto_usd) },
        ]} />
      )}
      {editar && <HerramientaModal mes={mes} fila={editar === 'nueva' ? null : editar} sugerencias={data ?? []}
        onCerrar={() => setEditar(null)}
        onAnular={(h) => { setEditar(null); setAnular({ tabla: 'herramienta_gasto', id: h.id!, titulo: `Anular ${h.nombre}` }) }} />}
      {anular && <AnularModal {...anular} onCerrar={() => setAnular(null)} />}
    </Card>
  )
}

function HerramientaModal({ mes, fila, sugerencias, onCerrar, onAnular }:
  { mes: string; fila: Herramienta | null; sugerencias: Herramienta[]; onCerrar: () => void; onAnular: (h: Herramienta) => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ nombre: fila?.nombre ?? '', tipo: fila?.tipo ?? '', plan: fila?.plan ?? '', tarjeta: fila?.tarjeta ?? '',
    moneda: fila?.moneda ?? 'USD', monto: fila?.monto != null ? String(fila.monto) : '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const guardar = useMutation({
    mutationFn: async () => {
      const monto = Number(f.monto)
      if (!f.nombre.trim()) throw new Error('Escribe el nombre de la herramienta')
      if (!(monto > 0)) throw new Error('El monto debe ser mayor que cero')
      const datos = { nombre: f.nombre.trim(), tipo: f.tipo.trim() || null, plan: f.plan.trim() || null,
        tarjeta: f.tarjeta.trim() || null, moneda: f.moneda as 'PEN' | 'USD', monto }
      if (fila) ok(await supabase.from('herramienta_gasto').update(datos).eq('id', fila.id!))
      else ok(await supabase.from('herramienta_gasto').insert({ ...datos, periodo: mes }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={fila ? fila.nombre! : `Agregar herramienta en ${mesLargo(mes)}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Campo label="Herramienta"><Input value={f.nombre} onChange={set('nombre')} autoFocus /></Campo></div>
        <Campo label="Tipo"><Input value={f.tipo} onChange={set('tipo')} list="tipos-herr" /></Campo>
        <Campo label="Plan"><Input value={f.plan} onChange={set('plan')} /></Campo>
        <Campo label="Moneda">
          <Select value={f.moneda} onChange={set('moneda')}><option value="USD">Dólares</option><option value="PEN">Soles</option></Select>
        </Campo>
        <Campo label="Monto del mes"><Input type="number" step="0.01" value={f.monto} onChange={set('monto')} /></Campo>
        <div className="sm:col-span-2"><Campo label="Tarjeta"><Input value={f.tarjeta} onChange={set('tarjeta')} list="tarjetas" /></Campo></div>
      </div>
      <Sugerencias id="tipos-herr" valores={sugerencias.map((h) => h.tipo)} />
      <Sugerencias id="tarjetas" valores={sugerencias.map((h) => h.tarjeta)} />
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div>{fila && <Boton variante="peligro" onClick={() => onAnular(fila)}>Anular</Boton>}</div>
        <div className="flex gap-2">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- Comisiones
function Comisiones({ mes }: { mes: string }) {
  const [nueva, setNueva] = useState(false)
  const [anular, setAnular] = useState<Anulando | null>(null)
  const personas = useQuery({
    queryKey: ['comision_persona', mes],
    queryFn: async () => ok(await supabase.from('v_comision_persona_mes').select('*').eq('periodo', mes).order('persona')),
  })
  const pagos = useQuery({
    queryKey: ['comision_pago', mes],
    queryFn: async () => ok(await supabase.from('v_comision_pago_usd').select('*').eq('periodo', mes).order('monto_usd', { ascending: false })),
  })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card titulo="Ganado vs pagado por persona">
        <Tabla filas={personas.data} clave={(p) => String(p.persona_id)} vacio="Sin comisiones este mes" columnas={[
          { titulo: 'Persona', celda: (p) => p.persona },
          { titulo: 'Ganado', derecha: true, celda: (p) => usd(p.ganado_usd) },
          { titulo: 'Pagado', derecha: true, celda: (p) => usd(p.pagado_usd) },
        ]} />
        <Nota>Ganado: comisión de las cuotas cuyo comprobante quedó pagado al 100% este mes (R-41). Pagado: lo registrado abajo (R-42).</Nota>
      </Card>
      <Card titulo="Comisiones pagadas" accion={<Boton onClick={() => setNueva(true)}><Icono nombre="mas" />Registrar</Boton>}>
        <Tabla filas={pagos.data} clave={(p) => p.id!} vacio="Sin pagos registrados este mes"
          onFila={(p) => setAnular({ tabla: 'comision_pago', id: p.id!, titulo: `Anular comisión de ${p.persona}` })} columnas={[
            { titulo: 'Persona', celda: (p) => p.persona },
            { titulo: 'Monto', derecha: true, celda: (p) => dinero(p.monto, p.moneda) },
            { titulo: 'USD', derecha: true, celda: (p) => usd(p.monto_usd) },
          ]} />
        <Nota>Clic en un pago para anularlo.</Nota>
      </Card>
      {nueva && <ComisionModal mes={mes} onCerrar={() => setNueva(false)} />}
      {anular && <AnularModal {...anular} onCerrar={() => setAnular(null)} />}
    </div>
  )
}

function ComisionModal({ mes, onCerrar }: { mes: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const personas = usePersonas()
  const [persona, setPersona] = useState('')
  const [moneda, setMoneda] = useState<'PEN' | 'USD'>('PEN')
  const [monto, setMonto] = useState('')
  const orden = useMemo(() => personas.data ?? [], [personas.data])
  const guardar = useMutation({
    mutationFn: async () => {
      if (!persona) throw new Error('Elige la persona')
      if (!(Number(monto) > 0)) throw new Error('El monto debe ser mayor que cero')
      ok(await supabase.from('comision_pago').insert({ periodo: mes, persona_id: Number(persona), moneda, monto: Number(monto) }))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`Comisión pagada en ${mesLargo(mes)}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo label="Persona">
            <Select value={persona} onChange={(e) => setPersona(e.target.value)} autoFocus>
              <option value="">Elige…</option>
              {orden.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </Campo>
        </div>
        <Campo label="Moneda">
          <Select value={moneda} onChange={(e) => setMoneda(e.target.value as 'PEN' | 'USD')}><option value="PEN">Soles</option><option value="USD">Dólares</option></Select>
        </Campo>
        <Campo label="Monto"><Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
      </div>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
  )
}
