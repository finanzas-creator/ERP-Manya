import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ok, supabase } from '../lib/supabase'
import { dinero, fecha, usd } from '../lib/formato'
import { ESTADOS, TRAMOS } from '../lib/estados'
import { Boton, Card, Estado, Input, Kpi, Tabla, Titulo } from '../components/ui'
import { PagoModal } from '../components/Pago'
import type { Fila } from '../lib/db'

type Linea = Fila<'v_cobranza'>
type Comp = { comprobante_id: string; serie: string; cliente: string; vencimiento: string | null; tramo: string
  dias: number; saldo: number; saldo_usd: number; moneda: string; venta_id: string }

export default function Cobranza() {
  const navigate = useNavigate()
  const [texto, setTexto] = useState('')
  const [tramo, setTramo] = useState('')
  const [pagar, setPagar] = useState<Comp | null>(null)
  const { data } = useQuery({
    queryKey: ['cobranza'],
    queryFn: async () => ok(await supabase.from('v_cobranza').select('*').order('vencimiento')),
  })

  // La cartera se cobra por comprobante: se agrupan sus cuotas (la vista ya trae el saldo de cada una).
  const porComp = new Map<string, Comp>()
  for (const l of (data ?? []) as Linea[]) {
    const c = porComp.get(l.comprobante_id!) ?? { comprobante_id: l.comprobante_id!, serie: l.serie_numero ?? 'Comanda',
      cliente: l.cliente!, vencimiento: l.vencimiento, tramo: l.tramo!, dias: l.dias_atraso ?? 0, saldo: 0, saldo_usd: 0,
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
      <div className="my-3 flex gap-2">
        <Input placeholder="Buscar cliente o comprobante…" value={texto} onChange={(e) => setTexto(e.target.value)} className="w-full sm:max-w-xs" />
      </div>
      <Card titulo={`${filas.length} comprobantes · ${usd(filas.reduce((s, c) => s + c.saldo_usd, 0))}`}>
        <Tabla filas={data ? filas : undefined} clave={(c) => c.comprobante_id} onFila={(c) => navigate(`/ventas/${c.venta_id}`)} vacio="No hay cartera pendiente" columnas={[
          { titulo: 'Comprobante', celda: (c) => <span className="whitespace-nowrap">{c.serie}</span> },
          { titulo: 'Cliente', celda: (c) => c.cliente },
          { titulo: 'Vence', celda: (c) => <span className="whitespace-nowrap">{fecha(c.vencimiento)}</span> },
          { titulo: 'Atraso', derecha: true, celda: (c) => (c.dias ? `${c.dias} d` : '—') },
          { titulo: 'Saldo', derecha: true, celda: (c) => dinero(c.saldo, c.moneda) },
          { titulo: 'Antigüedad', celda: (c) => <Estado valor={c.tramo} /> },
          { titulo: '', celda: (c) => <Boton onClick={(e) => { e.stopPropagation(); setPagar(c) }}>Pagar</Boton> },
        ]} />
      </Card>
      {pagar && <PagoModal onCerrar={() => setPagar(null)} objetivo={{
        tipo: 'comprobante', id: pagar.comprobante_id, saldo: pagar.saldo, moneda: pagar.moneda,
        descripcion: `${pagar.serie} · ${pagar.cliente}` }} />}
    </>
  )
}
