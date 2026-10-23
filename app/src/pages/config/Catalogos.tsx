import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { ENUMS } from '../../lib/db'
import { Boton, Campo, Card, Input, MensajeError, Modal, Pestanas, Select, Tabla } from '../../components/ui'

/** Listas de valores del sistema (CLAUDE.md: catálogos en tablas). Nada se borra: se desactiva. */
type Tipo = { enum: keyof typeof ENUMS } | { ref: Tabla; etiqueta: string } | 'texto' | 'si_no'
type Tabla = 'servicio' | 'categoria' | 'linea_negocio' | 'cuenta_bancaria' | 'empresa' | 'persona' | 'equipo' | 'sub_area' | 'tipo_gestion'
type Col = { campo: string; label: string; tipo: Tipo; opcional?: boolean }
type Catalogo = { tabla: Tabla; titulo: string; ayuda: string; columnas: Col[]; orden?: string }

const nombre: Col = { campo: 'nombre', label: 'Nombre', tipo: 'texto' }
const activo: Col = { campo: 'activo', label: 'Activo', tipo: 'si_no' }

const CATALOGOS: Catalogo[] = [
  { tabla: 'servicio', titulo: 'Servicios', ayuda: 'Lo que se vende. La modalidad (mensual o proyecto) decide si se renueva; la naturaleza (propio o terceros) si cuenta como venta propia.',
    columnas: [nombre, { campo: 'categoria_id', label: 'Categoría', tipo: { ref: 'categoria', etiqueta: 'nombre' } },
      { campo: 'modalidad', label: 'Modalidad', tipo: { enum: 'modalidad' } }, { campo: 'naturaleza', label: 'Naturaleza', tipo: { enum: 'naturaleza' } }, activo] },
  { tabla: 'categoria', titulo: 'Categorías', ayuda: 'Agrupan servicios dentro de una línea de negocio.',
    columnas: [nombre, { campo: 'linea_id', label: 'Línea de negocio', tipo: { ref: 'linea_negocio', etiqueta: 'nombre' } }] },
  { tabla: 'linea_negocio', titulo: 'Líneas de negocio', ayuda: 'Nivel más alto de la rentabilidad (R-60).', columnas: [nombre] },
  { tabla: 'cuenta_bancaria', titulo: 'Cuentas bancarias', ayuda: 'Cada cuenta pertenece a una empresa (R-39). La de detracciones es la del Banco de la Nación.',
    columnas: [nombre, { campo: 'empresa_id', label: 'Empresa', tipo: { ref: 'empresa', etiqueta: 'nombre' } }, { campo: 'moneda', label: 'Moneda', tipo: { enum: 'moneda' } },
      { campo: 'numero', label: 'N° de cuenta', tipo: 'texto', opcional: true }, { campo: 'cci', label: 'CCI', tipo: 'texto', opcional: true },
      { campo: 'es_detraccion', label: 'Detracciones', tipo: 'si_no' }, activo] },
  { tabla: 'persona', titulo: 'Personas', ayuda: 'Colaboradores (planilla) y partners comerciales.', columnas: [nombre, activo] },
  { tabla: 'equipo', titulo: 'Equipos', ayuda: 'Equipo que atiende cada venta.', columnas: [nombre, activo] },
  { tabla: 'sub_area', titulo: 'Sub-áreas de costo', ayuda: 'Dónde cae cada costo de planilla: directo (de una línea), dirección u overhead. Si es directo debe tener línea.',
    columnas: [nombre, { campo: 'grupo', label: 'Grupo', tipo: { enum: 'grupo_costo' } },
      { campo: 'linea_id', label: 'Línea (solo directo)', tipo: { ref: 'linea_negocio', etiqueta: 'nombre' }, opcional: true }] },
  { tabla: 'tipo_gestion', titulo: 'Tipos de gestión de cobranza', ayuda: 'Llamada, correo, acuerdo de pago… (R-38).', columnas: [nombre, activo] },
]

type Registro = Record<string, unknown> & { id?: number }

export default function Catalogos() {
  const [tabla, setTabla] = useState<Tabla>('servicio')
  const cat = CATALOGOS.find((c) => c.tabla === tabla)!
  return (
    <>
      <div className="mb-3 overflow-x-auto"><Pestanas valor={tabla} onCambio={setTabla} opciones={CATALOGOS.map((c) => ({ clave: c.tabla, label: c.titulo }))} /></div>
      <ListaCatalogo key={tabla} cat={cat} />
    </>
  )
}

/** Opciones de una columna que apunta a otro catálogo. */
function useReferencia(tabla: Tabla | null, etiqueta: string) {
  return useQuery({
    queryKey: ['catalogo', tabla, etiqueta], enabled: !!tabla,
    queryFn: async () => ok(await supabase.from(tabla!).select(`id, ${etiqueta}`).order(etiqueta)) as unknown as Registro[],
  })
}

function ListaCatalogo({ cat }: { cat: Catalogo }) {
  const [editar, setEditar] = useState<Registro | null>(null)
  const [texto, setTexto] = useState('')
  const { data } = useQuery({
    queryKey: ['catalogo', cat.tabla],
    queryFn: async () => ok(await supabase.from(cat.tabla).select('*').order('nombre')) as unknown as Registro[],
  })
  const t = texto.toLowerCase()
  const filas = data?.filter((r) => !t || String(r.nombre).toLowerCase().includes(t))
  return (
    <Card titulo={`${cat.titulo} · ${data?.length ?? 0}`} accion={<Boton variante="primario" onClick={() => setEditar({})}>+ Agregar</Boton>}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <p className="flex-1 text-sm text-t2">{cat.ayuda}</p>
        <Input placeholder="Buscar…" value={texto} onChange={(e) => setTexto(e.target.value)} className="w-full sm:max-w-56" />
      </div>
      <Tabla filas={filas} clave={(r) => String(r.id)} onFila={(r) => setEditar(r)} compacta columnas={cat.columnas.map((c) => ({
        titulo: c.label, celda: (r: Registro) => <Valor col={c} valor={r[c.campo]} />,
      }))} />
      {editar && <Editor cat={cat} registro={editar} onCerrar={() => setEditar(null)} />}
    </Card>
  )
}

function Valor({ col, valor }: { col: Col; valor: unknown }) {
  const ref = typeof col.tipo === 'object' && 'ref' in col.tipo ? col.tipo : null
  const opciones = useReferencia(ref?.ref ?? null, ref?.etiqueta ?? 'nombre')
  if (col.tipo === 'si_no') return <span className={valor === false ? 'text-t3' : ''}>{valor === false ? 'No' : 'Sí'}</span>
  if (ref) return <>{String(opciones.data?.find((o) => o.id === valor)?.[ref.etiqueta] ?? '—')}</>
  return <>{valor == null || valor === '' ? '—' : String(valor)}</>
}

function Editor({ cat, registro, onCerrar }: { cat: Catalogo; registro: Registro; onCerrar: () => void }) {
  const qc = useQueryClient()
  const nuevo = registro.id == null
  const [f, setF] = useState<Registro>(() => Object.fromEntries(cat.columnas.map((c) => [c.campo, registro[c.campo] ?? (c.tipo === 'si_no' ? (c.campo === 'activo') : null)])))
  const guardar = useMutation({
    mutationFn: async () => {
      const faltan = cat.columnas.filter((c) => !c.opcional && c.tipo !== 'si_no' && (f[c.campo] == null || f[c.campo] === ''))
      if (faltan.length) throw new Error(`Completa: ${faltan.map((c) => c.label).join(', ')}`)
      const datos = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))
      const tabla = supabase.from(cat.tabla) as unknown as { insert: (d: Registro) => PromiseLike<{ error: unknown }>; update: (d: Registro) => { eq: (c: string, v: unknown) => PromiseLike<{ error: unknown }> } }
      const r = nuevo ? await tabla.insert(datos) : await tabla.update(datos).eq('id', registro.id)
      ok(r as never)
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`${nuevo ? 'Agregar' : 'Editar'} · ${cat.titulo}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cat.columnas.map((c) => <CampoCatalogo key={c.campo} col={c} valor={f[c.campo]} onCambio={(v) => setF({ ...f, [c.campo]: v })} />)}
      </div>
      {!nuevo && <p className="mt-3 text-xs text-t3">Para dejar de usar un valor, desmárcalo como activo: lo ya registrado lo conserva.</p>}
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
  )
}

function CampoCatalogo({ col, valor, onCambio }: { col: Col; valor: unknown; onCambio: (v: unknown) => void }) {
  const ref = typeof col.tipo === 'object' && 'ref' in col.tipo ? col.tipo : null
  const opciones = useReferencia(ref?.ref ?? null, ref?.etiqueta ?? 'nombre')
  if (col.tipo === 'si_no') return (
    <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={valor !== false} onChange={(e) => onCambio(e.target.checked)} />{col.label}</label>
  )
  if (ref) return (
    <Campo label={col.label}><Select value={valor == null ? '' : String(valor)} onChange={(e) => onCambio(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">{col.opcional ? '— Ninguna —' : 'Seleccionar…'}</option>
      {opciones.data?.map((o) => <option key={String(o.id)} value={String(o.id)}>{String(o[ref.etiqueta])}</option>)}
    </Select></Campo>
  )
  if (typeof col.tipo === 'object' && 'enum' in col.tipo) return (
    <Campo label={col.label}><Select value={valor == null ? '' : String(valor)} onChange={(e) => onCambio(e.target.value || null)}>
      <option value="">Seleccionar…</option>
      {(ENUMS[col.tipo.enum] as readonly string[]).map((v) => <option key={v} value={v}>{v}</option>)}
    </Select></Campo>
  )
  return <Campo label={col.label}><Input value={valor == null ? '' : String(valor)} onChange={(e) => onCambio(e.target.value)} /></Campo>
}
