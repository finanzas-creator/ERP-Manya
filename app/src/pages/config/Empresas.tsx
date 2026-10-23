import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { Boton, Campo, Card, Input, MensajeError, Modal, Select, Tabla } from '../../components/ui'
import type { Fila } from '../../lib/db'

type Empresa = Fila<'empresa'>
type Cuenta = Fila<'cuenta_bancaria'>
const TIPOS = { factura: 'Factura', boleta: 'Boleta', recibo_honorarios: 'Recibo por honorarios', comanda: 'Comanda' } as const

/** R-39: cada empresa emisora con sus datos fiscales, series y cuentas (para la facturación electrónica). */
export default function Empresas() {
  const { data } = useQuery({ queryKey: ['empresas-fiscal'], queryFn: async () => ok(await supabase.from('empresa').select('*').order('id')) })
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-t2">Templates Art SAC y Manya Media EIRL son empresas independientes. Estos datos salen en cada comprobante electrónico de su empresa.
        Una cuenta o serie inactiva deja de ofrecerse, pero conserva su historial.</p>
      {data?.map((e) => <EmpresaFiscal key={e.id} empresa={e} />)}
    </div>
  )
}

function EmpresaFiscal({ empresa }: { empresa: Empresa }) {
  const qc = useQueryClient()
  const [f, setF] = useState<Record<string, string> | null>(null)
  const campos = [
    ['nombre', 'Razón social'], ['ruc', 'RUC'], ['nombre_comercial', 'Nombre comercial'], ['direccion_fiscal', 'Dirección fiscal'],
    ['ubigeo', 'Ubigeo (6 dígitos)'], ['correo', 'Correo'], ['telefono', 'Teléfono'], ['cuenta_detracciones', 'Cuenta de detracciones (Banco de la Nación)'],
  ] as const
  const valores = f ?? Object.fromEntries(campos.map(([k]) => [k, String(empresa[k] ?? '')]))
  const guardar = useMutation({
    mutationFn: async () => ok(await supabase.from('empresa').update(Object.fromEntries(campos.map(([k]) => [k, valores[k].trim() || null]))).eq('id', empresa.id)),
    onSuccess: () => { qc.invalidateQueries(); setF(null) },
  })
  const faltan = campos.filter(([k]) => !valores[k]).length
  return (
    <Card titulo={<>{empresa.nombre} <span className="font-normal text-t3">· RUC {empresa.ruc ?? '—'}</span></>}
      accion={faltan ? <span className="text-xs text-warning">Faltan {faltan} datos</span> : <span className="text-xs text-good">Datos completos</span>}>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        {campos.map(([k, label]) => (
          <div key={k} className={k === 'direccion_fiscal' || k === 'cuenta_detracciones' ? 'sm:col-span-2' : ''}>
            <Campo label={label}><Input value={valores[k]} onChange={(e) => setF({ ...valores, [k]: e.target.value })} /></Campo>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <MensajeError error={guardar.error} />
        <Boton variante="primario" className="ml-auto" disabled={!f || guardar.isPending} onClick={() => guardar.mutate()}>Guardar datos</Boton>
      </div>
      <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
        <Series empresaId={empresa.id} />
        <Cuentas empresaId={empresa.id} />
      </div>
    </Card>
  )
}

function Series({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient()
  const [nueva, setNueva] = useState({ tipo: 'factura', serie: '' })
  const { data } = useQuery({ queryKey: ['series-empresa', empresaId], queryFn: async () => ok(await supabase.from('v_serie_comprobante').select('*').eq('empresa_id', empresaId).order('tipo').order('serie')) })
  const agregar = useMutation({
    mutationFn: async () => ok(await supabase.from('serie_comprobante').insert({ empresa_id: empresaId, tipo: nueva.tipo as 'factura', serie: nueva.serie.trim().toUpperCase() })),
    onSuccess: () => { qc.invalidateQueries(); setNueva({ ...nueva, serie: '' }) },
  })
  const activar = useMutation({
    mutationFn: async (s: { id: number; activo: boolean }) => ok(await supabase.from('serie_comprobante').update({ activo: s.activo }).eq('id', s.id)),
    onSuccess: () => qc.invalidateQueries(),
  })
  return (
    <div className="min-w-0">
      <div className="mb-2 text-xs font-semibold tracking-wide text-t3 uppercase">Series autorizadas</div>
      <div className="rounded-lg border border-line">
        <Tabla compacta filas={data} clave={(s) => String(s.id)} vacio="Sin series" columnas={[
          { titulo: 'Tipo', celda: (s) => TIPOS[s.tipo!] },
          { titulo: 'Serie', celda: (s) => <span className={s.activo ? '' : 'text-t3 line-through'}>{s.serie}</span> },
          { titulo: 'Siguiente', celda: (s) => <span className="num text-t2">{s.siguiente}</span> },
          { titulo: '', celda: (s) => <button className="text-xs text-accent hover:underline" onClick={() => activar.mutate({ id: s.id!, activo: !s.activo })}>{s.activo ? 'Desactivar' : 'Activar'}</button> },
        ]} />
      </div>
      <div className="mt-2 flex gap-2">
        <Select value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value })} aria-label="Tipo de comprobante">
          {Object.entries(TIPOS).filter(([k]) => k !== 'comanda').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input className="w-24" placeholder="F001" maxLength={4} value={nueva.serie} onChange={(e) => setNueva({ ...nueva, serie: e.target.value })} aria-label="Serie" />
        <Boton disabled={nueva.serie.trim().length !== 4 || agregar.isPending} onClick={() => agregar.mutate()}>Agregar</Boton>
      </div>
      <MensajeError error={agregar.error} />
    </div>
  )
}

function Cuentas({ empresaId }: { empresaId: number }) {
  const [editar, setEditar] = useState<Cuenta | 'nueva' | null>(null)
  const { data } = useQuery({ queryKey: ['cuentas-empresa', empresaId], queryFn: async () => ok(await supabase.from('cuenta_bancaria').select('*').eq('empresa_id', empresaId).order('nombre')) })
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-t3 uppercase">Cuentas bancarias</span>
        <button className="text-xs text-accent hover:underline" onClick={() => setEditar('nueva')}>+ Cuenta</button>
      </div>
      <div className="rounded-lg border border-line">
        <Tabla compacta filas={data} clave={(c) => String(c.id)} onFila={setEditar} vacio="Sin cuentas" columnas={[
          { titulo: 'Cuenta', celda: (c) => <span className={c.activo ? '' : 'text-t3 line-through'}>{c.nombre}{c.es_detraccion && <span className="ml-1 text-xs text-t3">(detracciones)</span>}</span> },
          { titulo: 'Moneda', celda: (c) => c.moneda },
          { titulo: 'Número', celda: (c) => <span className="text-t2">{c.numero ?? '—'}</span> },
        ]} />
      </div>
      {editar && <CuentaModal empresaId={empresaId} cuenta={editar === 'nueva' ? null : editar} onCerrar={() => setEditar(null)} />}
    </div>
  )
}

function CuentaModal({ empresaId, cuenta, onCerrar }: { empresaId: number; cuenta: Cuenta | null; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ nombre: cuenta?.nombre ?? '', moneda: cuenta?.moneda ?? 'PEN', numero: cuenta?.numero ?? '', cci: cuenta?.cci ?? '',
    es_detraccion: cuenta?.es_detraccion ?? false, activo: cuenta?.activo ?? true })
  const guardar = useMutation({
    mutationFn: async () => {
      if (!f.nombre.trim()) throw new Error('Ponle un nombre a la cuenta')
      const datos = { nombre: f.nombre.trim(), moneda: f.moneda as 'PEN' | 'USD', numero: f.numero.trim() || null, cci: f.cci.trim() || null,
        es_detraccion: f.es_detraccion, activo: f.activo, empresa_id: empresaId }
      if (cuenta) ok(await supabase.from('cuenta_bancaria').update(datos).eq('id', cuenta.id))
      else ok(await supabase.from('cuenta_bancaria').insert(datos))
    },
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={cuenta ? cuenta.nombre : 'Nueva cuenta bancaria'} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Nombre (como se ve en la app)"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus /></Campo>
        <Campo label="Moneda"><Select value={f.moneda} onChange={(e) => setF({ ...f, moneda: e.target.value as 'PEN' })}><option value="PEN">Soles</option><option value="USD">Dólares</option></Select></Campo>
        <Campo label="Número de cuenta"><Input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} /></Campo>
        <Campo label="CCI"><Input value={f.cci} onChange={(e) => setF({ ...f, cci: e.target.value })} /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.es_detraccion} onChange={(e) => setF({ ...f, es_detraccion: e.target.checked })} /> Es la cuenta de detracciones (R-31)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} /> Activa</label>
      </div>
      <div className="mt-3"><MensajeError error={guardar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={guardar.isPending} onClick={() => guardar.mutate()}>Guardar</Boton>
      </div>
    </Modal>
  )
}
