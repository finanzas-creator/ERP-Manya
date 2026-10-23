import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dinero, fecha, hoyISO, usd } from '../lib/formato'
import { ESTADOS, TRAMOS } from '../lib/estados'
import { Boton, Card, Estado, Input, Kpi, Nota, Pestanas, Tabla, Titulo } from '../components/ui'
import { PagoModal } from '../components/Pago'
import { GestionModal } from '../components/GestionCobranza'
import { AutodetraccionesPendientes } from '../components/Autodetraccion'
import type { Fila } from '../lib/db'

type Linea = Fila<'v_cobranza'>
type Comp = { comprobante_id: string; serie: string; cliente: string; cliente_id: string; empresa_id: number | null; vencimiento: string | null; tramo: string
  dias: number; saldo: number; saldo_usd: number; moneda: string; venta_id: string }

export default function Cobranza() {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const [tramo, setTramo] = useState('')
  const [vista, setVista] = useState<'cliente' | 'comprobante'>('cliente')
  const [pagar, setPagar] = useState<Comp | null>(null)
  const [gestion, setGestion] = useState<{ cliente_id: string; cliente: string } | null>(null)
  const { data } = useQuery({
    queryKey: ['cobranza'],
    queryFn: async () => ok(await supabase.from('v_cobranza').select('*').order('vencimiento')),
  })

  // La cartera se cobra por comprobante: se agrupan sus cuotas (la vista ya trae el saldo de cada una).
  const porComp = new Map<string, Comp>()
  for (const l of (data ?? []) as Linea[]) {
    const c = porComp.get(l.comprobante_id!) ?? { comprobante_id: l.comprobante_id!, serie: l.serie_numero ?? 'Comanda',
      cliente: l.cliente!, cliente_id: l.cliente_id!, empresa_id: l.empresa_id, vencimiento: l.vencimiento, tramo: l.tramo!, dias: l.dias_atraso ?? 0, saldo: 0, saldo_usd: 0,
      moneda: l.moneda!, venta_id: l.venta_id! }
    c.saldo += l.saldo ?? 0
    c.saldo_usd += l.saldo_usd ?? 0
    if ((l.dias_atraso ?? 0) > c.dias) { c.dias = l.dias_atraso ?? 0; c.tramo = l.tramo! }
    porComp.set(l.comprobante_id!, c)
  }
  const todos = [...porComp.values()]
  const t = texto.toLowerCase()
  const filas = todos.filter((c) => (!tramo || c.tramo === tramo) && (!t || `${c.cliente} ${c.serie}`.toLowerCase().includes(t)))
    .sort((a, b) => b.dias - a.dias)
  const porTramo = (k: string) => todos.filter((c) => c.tramo === k).reduce((s, c) => s + c.saldo_usd, 0)

  return (
    <>
      <Titulo>Cobranza</Titulo>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {TRAMOS.map((k) => (
          <button key={k} onClick={() => setTramo(tramo === k ? '' : k)} className={`text-left ${tramo === k ? 'ring-2 ring-accent rounded-xl' : ''}`}>
            <Kpi label={ESTADOS[k].label} valor={usd(porTramo(k))} tono={k === '61-90' || k === '>90' ? 'critical' : undefined} />
          </button>
        ))}
      </div>
      <AutodetraccionesPendientes />
      <ProyeccionCobros />
      <div className="my-3 flex flex-wrap items-center gap-2">
        <Pestanas valor={vista} onCambio={setVista} opciones={[{ clave: 'cliente', label: '¿Quién nos debe?' }, { clave: 'comprobante', label: 'Por comprobante' }]} />
        <Input placeholder="Buscar cliente o comprobante…" value={texto} onChange={(e) => setTexto(e.target.value)} className="w-full sm:max-w-xs" />
      </div>
      {vista === 'cliente' ? <PorCliente texto={t} tramo={tramo} onGestion={(c) => setGestion(c)} /> : <Card titulo={`${filas.length} comprobantes · ${usd(filas.reduce((s, c) => s + c.saldo_usd, 0))}`}>
        <Tabla filas={data ? filas : undefined} clave={(c) => c.comprobante_id} onFila={(c) => navigate(`/ventas/${c.venta_id}`)} vacio="No hay cartera pendiente" columnas={[
          { titulo: 'Comprobante', celda: (c) => <span className="whitespace-nowrap">{c.serie}</span> },
          { titulo: 'Cliente', celda: (c) => c.cliente },
          { titulo: 'Vence', celda: (c) => <span className="whitespace-nowrap">{fecha(c.vencimiento)}</span> },
          { titulo: 'Atraso', derecha: true, celda: (c) => (c.dias ? `${c.dias} d` : '—') },
          { titulo: 'Saldo', derecha: true, celda: (c) => dinero(c.saldo, c.moneda) },
          { titulo: 'Antigüedad', celda: (c) => <Estado valor={c.tramo} /> },
          { titulo: '', celda: (c) => <div className="flex justify-end gap-1">
            {c.dias > 0 && <Boton variante="fantasma" onClick={(e) => { e.stopPropagation(); setGestion(c) }}>Gestión</Boton>}
            <Boton onClick={(e) => { e.stopPropagation(); setPagar(c) }}>Pagar</Boton>
          </div> },
        ]} />
      </Card>}
      {gestion && <GestionModal clienteId={gestion.cliente_id} cliente={gestion.cliente} onCerrar={() => setGestion(null)} />}
      {pagar && <PagoModal onCerrar={() => setPagar(null)} objetivo={{
        tipo: 'comprobante', id: pagar.comprobante_id, saldo: pagar.saldo, moneda: pagar.moneda, empresaId: pagar.empresa_id,
        descripcion: `${pagar.serie} · ${pagar.cliente}` }} />}
    </>
  )
}

/** R-37: cartera por cliente, del que más debe al que menos. */
function PorCliente({ texto, tramo, onGestion }: { texto: string; tramo: string; onGestion: (c: { cliente_id: string; cliente: string }) => void }) {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['cobranza_cliente'],
    queryFn: async () => ok(await supabase.from('v_cobranza_cliente').select('*').order('por_cobrar_usd', { ascending: false })),
  })
  const filas = data?.filter((c) => (!tramo || c.tramo === tramo) && (!texto || c.cliente!.toLowerCase().includes(texto)))
  return (
    <Card titulo={`${filas?.length ?? 0} clientes · ${usd(filas?.reduce((s, c) => s + (c.por_cobrar_usd ?? 0), 0))}`}>
      <Tabla filas={filas} clave={(c) => c.cliente_id!} onFila={(c) => navigate(`/clientes/${c.cliente_id}`)} vacio="Nadie nos debe" columnas={[
        { titulo: 'Cliente', celda: (c) => <><div className="font-medium">{c.cliente}</div>
          <div className="text-xs text-t3">{c.comprobantes} comprobante{c.comprobantes === 1 ? '' : 's'}{(c.dias_atraso ?? 0) > 0 ? ` · ${c.dias_atraso} días de atraso` : c.proximo_vencimiento ? ` · vence ${fecha(c.proximo_vencimiento)}` : ''}</div>
          {c.proximo_paso && <div className="text-xs text-t2">Próximo paso: {c.proximo_paso}{c.proxima_fecha ? ` (${fecha(c.proxima_fecha)})` : ''}</div>}</> },
        { titulo: 'Por cobrar', derecha: true, celda: (c) => usd(c.por_cobrar_usd) },
        { titulo: 'Vencido', derecha: true, celda: (c) => <span className={(c.vencido_usd ?? 0) > 0 ? 'text-critical' : 'text-t3'}>{usd(c.vencido_usd)}</span> },
        { titulo: 'Antigüedad', celda: (c) => <Estado valor={c.tramo} /> },
        { titulo: 'Gestión', celda: (c) => c.estado_gestion ? <Estado valor={c.estado_gestion} /> : <span className="text-t3">—</span> },
        { titulo: '', celda: (c) => (c.vencido_usd ?? 0) > 0 &&
          <Boton variante="fantasma" onClick={(e) => { e.stopPropagation(); onGestion({ cliente_id: c.cliente_id!, cliente: c.cliente! }) }}>Gestión</Boton> },
      ]} />
    </Card>
  )
}

/** Cobros esperados en las próximas 13 semanas, según el vencimiento de cada cuota (R-23). */
function ProyeccionCobros() {
  const { data } = useQuery({
    queryKey: ['proyeccion_cobros'],
    queryFn: async () => ok(await supabase.from('v_proyeccion_cobros').select('*').order('semana')),
  })
  const porSemana = new Map((data ?? []).map((d) => [d.semana!, d]))
  const hoy = new Date(hoyISO() + 'T00:00:00Z')
  const lunes = new Date(hoy.getTime() - ((hoy.getUTCDay() + 6) % 7) * 86400000)
  const semanas = Array.from({ length: 13 }, (_, i) => new Date(lunes.getTime() + i * 7 * 86400000).toISOString().slice(0, 10))
  const filas = semanas.map((s, i) => {
    const d = porSemana.get(s)
    return { semana: i === 0 ? 'Esta semana' : fecha(s).slice(0, 6), Vencido: d?.vencido_usd ?? 0, Facturado: d?.facturado_usd ?? 0, 'Por facturar': d?.por_facturar_usd ?? 0 }
  })
  return (
    <Card titulo="Cobros esperados · próximas 13 semanas" className="mt-4">
      <div className="h-56 p-3">
        <ResponsiveContainer>
          <BarChart data={filas}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="semana" tick={{ fill: 'var(--text-2)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: 'var(--text-2)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip formatter={(v: number) => usd(v)} cursor={{ fill: 'var(--surface-2)' }}
              contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text-1)' }} />
            <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
            <Bar dataKey="Vencido" stackId="c" fill="var(--critical)" />
            <Bar dataKey="Facturado" stackId="c" fill="var(--series-1)" />
            <Bar dataKey="Por facturar" stackId="c" fill="var(--series-3)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Nota>Saldo de cada cuota en la semana en que vence; lo ya vencido se muestra en esta semana. Solo incluye cuotas ya planificadas: las renovaciones que aún no se registran no aparecen.</Nota>
    </Card>
  )
}
