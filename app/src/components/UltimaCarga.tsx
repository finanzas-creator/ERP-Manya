import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from '../lib/supabase'

/** R-71: hora de la última actualización desde el sheet administrativo. */
export default function UltimaCarga() {
  const { data } = useQuery({
    queryKey: ['carga_sheet'],
    queryFn: async () => ok(await supabase.from('carga_sheet').select('en, resultado').eq('resultado', 'ok').order('id', { ascending: false }).limit(1)),
    refetchInterval: 5 * 60 * 1000,
  })
  const u = data?.[0]
  if (!u) return null
  const d = new Date(u.en)
  const hoy = new Date().toDateString() === d.toDateString()
  const hora = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
  const dia = hoy ? 'hoy' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
  return <span className="text-xs text-t3" title="El ERP se actualiza solo desde el sheet administrativo">Datos del sheet: {dia} {hora}</span>
}
