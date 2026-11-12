import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from '../../lib/supabase'
import { Select } from '../../components/ui'

// Catálogos de planillas: se leen una vez y se comparten entre pestañas (DRY).
const cat = <R extends { data: unknown; error: { message: string } | null }>(clave: string, fn: () => PromiseLike<R>) =>
  () => useQuery({ queryKey: ['catalogo', clave], staleTime: 5 * 60_000, queryFn: async () => ok(await fn()) })

export const useEmpleadores = cat('empleadores', () => supabase.from('empleador').select('*').order('razon_social'))
export const useAfps = cat('afps', () => supabase.from('afp').select('*').order('id'))
export const useConceptos = cat('conceptos_planilla', () => supabase.from('concepto_planilla').select('*').order('orden'))
export const useTiposAusencia = cat('tipos_ausencia', () => supabase.from('tipo_ausencia').select('*').order('orden'))
export const useMotivosCese = cat('motivos_cese', () => supabase.from('motivo_cese').select('*').order('orden'))

/** Trabajadores de un empleador (activos primero). */
export function useTrabajadores(empleador: number | null) {
  return useQuery({
    queryKey: ['trabajadores', empleador], enabled: !!empleador,
    queryFn: async () => ok(await supabase.from('v_trabajador').select('*').eq('empleador_id', empleador!).order('apellidos_nombres')),
  })
}

export function SelectTrabajador({ empleador, value, onChange, mes }:
  { empleador: number; value: string; onChange: (id: string) => void; mes?: string }) {
  const { data } = useTrabajadores(empleador)
  // en un mes, solo quienes tenían vínculo
  const lista = (data ?? []).filter((t) => !mes || ((t.fecha_ingreso ?? '') <= finMesIso(mes) && (!t.fecha_cese || t.fecha_cese >= mes)))
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Elige…</option>
      {lista.map((t) => <option key={t.id} value={t.id!}>{t.apellidos_nombres}</option>)}
    </Select>
  )
}

export function finMesIso(mes: string) {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export const num2 = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Monto en soles sin símbolo (tablas cuya moneda va en el título). */
export const s2 = (v: number | null | undefined) => num2.format(v ?? 0)
export const pct2 = (v: number | null | undefined) => v == null ? '—' : `${num2.format(v * 100)}%`

export const PENSION: Record<string, string> = { onp: 'ONP', afp: 'AFP', sin_sistema: 'Sin sistema' }
export const SALUD: Record<string, string> = { essalud: 'EsSalud', eps: 'EPS', sis: 'SIS' }

/** Descarga filas como CSV (separador ; para Excel en español). */
export function descargarCsv(nombre: string, filas: Record<string, unknown>[]) {
  if (!filas.length) return
  const cols = Object.keys(filas[0])
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = '﻿' + [cols.join(';'), ...filas.map((f) => cols.map((c) => esc(f[c])).join(';'))].join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = nombre
  a.click()
  URL.revokeObjectURL(a.href)
}
