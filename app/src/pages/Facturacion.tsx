import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, finDeMes, hoyISO, mesActual, pct } from '../lib/formato'
import { useEmpresas } from '../lib/catalogos'
import { subirArchivo, verArchivo } from '../lib/archivos'
import { Boton, Campo, Card, Estado, Input, MensajeError, Modal, Nota, Panel, Renglon, Select, SelectorMes, Tabla, Titulo } from '../components/ui'
import { PagoModal } from '../components/Pago'
import { AnularModal } from '../components/Anular'
import type { Fila } from '../lib/db'

type Comprobante = Fila<'v_facturacion'>
const TIPOS: Record<string, string> = { factura: 'Factura', boleta: 'Boleta', recibo_honorarios: 'Recibo por honorarios', comanda: 'Comanda' }

/** Todos los comprobantes de las dos empresas, con su estado y sus documentos (R-20 a R-28, R-39). */
export default function Facturacion() {
  const { data: empresas } = useEmpresas()
  const [mes, setMes] = useState(mesActual())
  const [todos, setTodos] = useState(false)
  const [empresa, setEmpresa] = useState('')
  const [estado, setEstado] = useState('')
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const { data } = useQuery({
    queryKey: ['facturacion', todos ? 'todos' : mes],
    queryFn: async () => {
      let q = supabase.from('v_facturacion').select('*').order('fecha_emision', { ascending: false }).order('serie_numero', { ascending: false })
      q = todos ? q.in('estado', ['por_cobrar', 'vencida']) : q.gte('fecha_emision', mes).lte('fecha_emision', finDeMes(mes))
      return ok(await q)
    },
  })
  const t = texto.toLowerCase()
  const filas = data?.filter((c) => (!empresa || String(c.empresa_id) === empresa) && (!estado || c.estado === estado)
    && (!t || `${c.serie_numero} ${c.cliente} ${c.cliente_ruc}`.toLowerCase().includes(t)))
  const contar = (e: string) => data?.filter((c) => (!empresa || String(c.empresa_id) === empresa) && c.estado === e).length ?? 0

  return (
    <>
      <Titulo accion={<div className="flex items-center gap-2">
        {!todos && <SelectorMes mes={mes} onCambio={setMes} />}
        <Boton variante={todos ? 'primario' : 'normal'} onClick={() => setTodos(!todos)}>{todos ? 'Ver por mes' : 'Pendientes de cobro'}</Boton>
      </div>}>Facturación</Titulo>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={empresa} onChange={(e) => setEmpresa(e.target.value)} aria-label="Empresa">
          <option value="">Las dos empresas</option>
          {empresas?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </Select>
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="">Todos los estados ({filas?.length ?? 0})</option>
          {['por_cobrar', 'vencida', 'pagada', 'sin_efecto', 'anulado'].map((e) => <option key={e} value={e}>{ETIQUETA[e]} ({contar(e)})</option>)}
        </Select>
        <Input placeholder="Buscar serie, cliente o RUC…" value={texto} onChange={(e) => setTexto(e.target.value)} className="min-w-0 flex-1 sm:max-w-xs" />
      </div>

      <Card titulo={`${filas?.length ?? 0} comprobantes`}>
        <Tabla filas={filas} clave={(c) => c.id!} onFila={(c) => setAbierto(c.id!)} vacio="No hay comprobantes con estos filtros" columnas={[
          { titulo: 'Comprobante', celda: (c) => <><div className="whitespace-nowrap font-medium">{c.serie_numero ?? 'Comanda'}</div><div className="text-xs text-t3">{c.empresa} · {TIPOS[c.tipo!]}</div></> },
          { titulo: 'Cliente', celda: (c) => <><div>{c.cliente}</div>{c.cliente_ruc && <div className="text-xs text-t3">RUC {c.cliente_ruc}</div>}</> },
          { titulo: 'Emisión', celda: (c) => <span className="whitespace-nowrap">{fecha(c.fecha_emision)}</span> },
          { titulo: 'Total', derecha: true, celda: (c) => dinero(c.total, c.moneda) },
          { titulo: 'Saldo', derecha: true, celda: (c) => c.saldo == null ? '—' : dinero(c.saldo, c.moneda) },
          { titulo: 'Estado', celda: (c) => <><Estado valor={c.estado} />{(c.notas_credito ?? 0) > 0 && c.estado !== 'sin_efecto' && <div className="mt-0.5 text-xs text-t3">con nota de crédito</div>}</> },
          { titulo: 'Archivos', celda: (c) => <span className="text-xs text-t3">{[c.archivo_pdf && 'PDF', c.archivo_xml && 'XML'].filter(Boolean).join(' · ') || '—'}</span> },
        ]} />
        <Nota>Una factura emitida no se borra: se corrige con una nota de crédito (total o parcial). "Anular" es solo para un registro hecho por error en el sistema.</Nota>
      </Card>
      {abierto && <DetalleComprobante id={abierto} onCerrar={() => setAbierto(null)} />}
    </>
  )
}

const ETIQUETA: Record<string, string> = { por_cobrar: 'Por cobrar', vencida: 'Vencida', pagada: 'Pagada', sin_efecto: 'Sin efecto (nota de crédito)', anulado: 'Anulado' }

function DetalleComprobante({ id, onCerrar }: { id: string; onCerrar: () => void }) {
  const qc = useQueryClient()
  const [accion, setAccion] = useState<'pago' | 'nota' | 'anular' | null>(null)
  const c = useQuery({ queryKey: ['comprobante', id], queryFn: async () => ok(await supabase.from('v_facturacion').select('*').eq('id', id).single()) }).data
  const cuotas = useQuery({ queryKey: ['comprobante-cuotas', id], queryFn: async () => ok(await supabase.from('cuota').select('id, venta_id, orden, concepto, monto_neto').eq('comprobante_id', id).is('anulado_en', null).order('orden')) })
  const ventas = useQuery({
    queryKey: ['comprobante-ventas', id, cuotas.data?.length], enabled: !!cuotas.data?.length,
    queryFn: async () => ok(await supabase.from('v_venta').select('id, codigo, servicio, marca').in('id', [...new Set(cuotas.data!.map((q) => q.venta_id))])),
  })
  const notas = useQuery({ queryKey: ['notas', id], queryFn: async () => ok(await supabase.from('v_nota_credito').select('*').eq('comprobante_id', id).order('fecha_emision')) })
  const pagos = useQuery({
    queryKey: ['comprobante-pagos', id, cuotas.data?.length], enabled: !!cuotas.data?.length,
    queryFn: async () => ok(await supabase.from('v_pago').select('id, fecha, cuenta, monto, moneda_cuenta, es_detraccion').in('cuota_id', cuotas.data!.map((q) => q.id)).order('fecha')),
  })
  const subir = useMutation({
    mutationFn: async ({ tipo, archivo }: { tipo: 'pdf' | 'xml'; archivo: File }) => {
      const ruta = await subirArchivo('comprobantes', `${c!.empresa_ruc ?? c!.empresa_id}/${c!.serie_numero ?? id}`, archivo)
      ok(await supabase.from('comprobante').update(tipo === 'pdf' ? { archivo_pdf: ruta } : { archivo_xml: ruta }).eq('id', id))
    },
    onSuccess: () => qc.invalidateQueries(),
  })
  if (!c) return <Panel titulo="Cargando…" onCerrar={onCerrar}><div /></Panel>
  const vigente = c.estado !== 'anulado' && c.estado !== 'sin_efecto'
  const venta = (vid: string) => ventas.data?.find((v) => v.id === vid)

  return (
    <Panel subtitulo={`${TIPOS[c.tipo!]} · ${c.empresa}`} titulo={c.serie_numero ?? 'Comanda'} onCerrar={onCerrar}>
      <div className="mb-3 flex flex-wrap items-center gap-2"><Estado valor={c.estado} />
        {c.estado === 'sin_efecto' && <span className="text-xs text-t3">por la nota de crédito {c.nota_credito_total}</span>}
        {c.estado === 'anulado' && <span className="text-xs text-t3">{c.anulado_motivo}</span>}
      </div>
      <div className="text-sm">
        <Renglon label="Emisor" valor={<span className="text-right">{c.empresa}<br /><span className="text-xs text-t3">RUC {c.empresa_ruc ?? '—'}</span></span>} />
        <Renglon label="Cliente" valor={<span className="text-right">{c.cliente}<br /><span className="text-xs text-t3">RUC {c.cliente_ruc ?? '—'}</span></span>} />
        <Renglon label="Emisión" valor={fecha(c.fecha_emision)} />
        <Renglon label="Vence" valor={fecha(c.vencimiento ?? c.fecha_limite)} />
        <Renglon label="Neto" valor={dinero(c.neto, c.moneda)} />
        <Renglon label="Total con IGV" valor={dinero(c.total, c.moneda)} total />
        {(c.pct_detraccion ?? 0) > 0 && <Renglon sangria label={`Detracción ${pct(c.pct_detraccion)}`} valor={dinero(c.detraccion, c.moneda)} />}
        {(c.notas_credito_neto ?? 0) > 0 && <Renglon sangria label="Notas de crédito (neto)" valor={`− ${dinero(c.notas_credito_neto, c.moneda)}`} />}
        {c.saldo != null && <Renglon label="Saldo por cobrar" valor={dinero(c.saldo, c.moneda)} total tono={(c.saldo ?? 0) > 0.01 ? 'warning' : 'good'} />}
      </div>
      {vigente && (c.detraccion ?? 0) > 0 && (c.saldo ?? 0) > 0.01 && Math.abs((c.saldo ?? 0) - ((c.detraccion ?? 0) - (c.pagado_detraccion ?? 0))) < 1 &&
        <p className="mt-2 rounded-lg bg-info-bg px-3 py-2 text-xs text-t2">El saldo es la detracción: el cliente debe depositarla en el Banco de la Nación de {c.empresa}.
          Si en cambio pagó todo al banco, la agencia debe autodetraer (R-36).</p>}

      {vigente && <div className="mt-4 flex flex-wrap gap-2">
        {(c.saldo ?? 0) > 0.01 && <Boton variante="primario" onClick={() => setAccion('pago')}>Registrar pago</Boton>}
        <Boton onClick={() => setAccion('nota')}>Nota de crédito</Boton>
        <Boton variante="peligro" onClick={() => setAccion('anular')}>Anular registro</Boton>
      </div>}

      <Seccion titulo="Cuotas y ventas">
        {cuotas.data?.map((q) => (
          <div key={q.id} className="flex items-baseline justify-between gap-3 py-1 text-sm">
            <Link to={`/ventas/${q.venta_id}`} className="text-accent hover:underline">{venta(q.venta_id)?.codigo} · {venta(q.venta_id)?.servicio} · {q.concepto}</Link>
            <span className="num">{dinero(q.monto_neto, c.moneda)}</span>
          </div>
        ))}
      </Seccion>
      <Seccion titulo={`Pagos (${pagos.data?.length ?? 0})`}>
        {pagos.data?.length === 0 && <div className="text-sm text-t3">Sin pagos.</div>}
        {pagos.data?.map((p) => (
          <div key={p.id} className="flex justify-between gap-3 py-1 text-sm"><span>{fecha(p.fecha)} · {p.cuenta}{p.es_detraccion ? ' (detracción)' : ''}</span><span className="num">{dinero(p.monto, p.moneda_cuenta)}</span></div>
        ))}
      </Seccion>
      <Seccion titulo={`Notas de crédito (${notas.data?.length ?? 0})`}>
        {notas.data?.map((n) => (
          <div key={n.id} className="py-1 text-sm">
            <div className="flex justify-between gap-3"><span className="font-medium">{n.serie_numero}</span><span className="num">− {dinero(n.monto_neto, c.moneda)} <span className="text-xs text-t3">neto</span></span></div>
            <div className="text-xs text-t3">{fecha(n.fecha_emision)} · {n.motivo_codigo} {n.motivo}{n.descripcion ? ` · ${n.descripcion}` : ''}</div>
          </div>
        ))}
      </Seccion>
      <Seccion titulo="Archivos del comprobante electrónico">
        {(['pdf', 'xml'] as const).map((tipo) => {
          const ruta = tipo === 'pdf' ? c.archivo_pdf : c.archivo_xml
          return (
            <div key={tipo} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span>{tipo.toUpperCase()}</span>
              <span className="flex gap-2">
                {ruta && <Boton variante="fantasma" onClick={() => verArchivo('comprobantes', ruta)}>Ver</Boton>}
                <label className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:bg-s2">
                  {ruta ? 'Reemplazar' : 'Subir'}
                  <input type="file" className="hidden" accept={tipo === 'pdf' ? 'application/pdf' : '.xml,text/xml,application/xml'}
                    onChange={(e) => e.target.files?.[0] && subir.mutate({ tipo, archivo: e.target.files[0] })} />
                </label>
              </span>
            </div>
          )
        })}
        <MensajeError error={subir.error} />
      </Seccion>

      {accion === 'pago' && <PagoModal onCerrar={() => setAccion(null)} objetivo={{ tipo: 'comprobante', id, saldo: c.saldo ?? 0,
        moneda: c.moneda ?? 'USD', descripcion: `${c.serie_numero} · ${c.cliente}`, empresaId: c.empresa_id }} />}
      {accion === 'nota' && <NotaCreditoModal comprobante={c} onCerrar={() => setAccion(null)} />}
      {accion === 'anular' && <AnularModal tabla="comprobante" id={id} titulo={`Anular el registro de ${c.serie_numero ?? 'la comanda'}`} onCerrar={() => setAccion(null)} />}
    </Panel>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="mt-5 border-t border-line pt-3"><div className="mb-1 text-xs font-semibold tracking-wide text-t3 uppercase">{titulo}</div>{children}</div>
}

/** R-27/R-28: nota de crédito total (anula la operación) o parcial (descuento, devolución de una parte). */
export function NotaCreditoModal({ comprobante, onCerrar }: { comprobante: Comprobante; onCerrar: () => void }) {
  const qc = useQueryClient()
  const motivos = useQuery({ queryKey: ['catalogo', 'motivos_nc'], queryFn: async () => ok(await supabase.from('motivo_nota_credito').select('*').order('codigo')) })
  const [f, setF] = useState({ motivo: '', serie: '', fecha: hoyISO(), monto: '', descripcion: '' })
  const motivo = motivos.data?.find((m) => m.codigo === f.motivo)
  const disponible = (comprobante.neto ?? 0) - (comprobante.notas_credito_neto ?? 0)
  const emitir = useMutation({
    mutationFn: async () => ok(await supabase.rpc('emitir_nota_credito', { p_comprobante: comprobante.id, p_serie_numero: f.serie, p_fecha: f.fecha,
      p_motivo: f.motivo, p_monto_neto: motivo?.anula ? null : Number(f.monto), p_descripcion: f.descripcion || null })),
    onSuccess: () => { qc.invalidateQueries(); onCerrar() },
  })
  return (
    <Modal titulo={`Nota de crédito a ${comprobante.serie_numero}`} onCerrar={onCerrar}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo label="Motivo (catálogo 09 SUNAT)">
            <Select value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })} autoFocus>
              <option value="">Elige…</option>
              {motivos.data?.map((m) => <option key={m.codigo} value={m.codigo}>{m.codigo} · {m.nombre}{m.anula ? ' (total)' : ''}</option>)}
            </Select>
          </Campo>
        </div>
        <Campo label="Serie-número de la nota"><Input value={f.serie} onChange={(e) => setF({ ...f, serie: e.target.value })} placeholder="E001-123" /></Campo>
        <Campo label="Fecha de emisión"><Input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></Campo>
        {motivo && !motivo.anula && <Campo label={`Monto sin IGV (${comprobante.moneda})`} ayuda={`Disponible: ${dinero(disponible, comprobante.moneda)}`}>
          <Input type="number" step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} /></Campo>}
        <div className="sm:col-span-2"><Campo label="Detalle"><Input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></Campo></div>
      </div>
      {motivo?.anula && <p className="mt-3 rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning">
        Nota total por {dinero(disponible, comprobante.moneda)} sin IGV. La factura queda sin efecto y sus cuotas vuelven a "por facturar":
        luego vuelve a facturarlas o, si la venta se cayó, anula la venta.</p>}
      {motivo && !motivo.anula && <p className="mt-3 text-sm text-t2">Baja la deuda del cliente (con IGV) y el ingreso del mes de la nota (R-28).</p>}
      <div className="mt-3"><MensajeError error={emitir.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!f.motivo || emitir.isPending} onClick={() => emitir.mutate()}>Emitir nota de crédito</Boton>
      </div>
    </Modal>
  )
}
