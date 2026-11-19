import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from './supabase'
import type { Fila } from './db'

type Origen = Fila<'v_origen_sheet'>

/**
 * R-71: mientras el sheet administrativo sea la fuente, lo que viene de él no se registra ni se edita
 * en el ERP. La base define qué es (v_origen_sheet) y además lo rechaza; la app solo esconde los botones.
 * Mientras no se sabe, no se ofrece nada.
 */
export function useOrigenSheet() {
  const { data } = useQuery({
    queryKey: ['origen_sheet'],
    staleTime: Infinity,
    queryFn: async () => ok(await supabase.from('v_origen_sheet').select('*')) as unknown as Origen[],
  })
  const fila = (tabla: string) => data?.find((d) => d.tabla === tabla)
  return {
    /** el sheet es la fuente de los datos (hay algo que no se registra aquí) */
    desdeSheet: !data || data.length > 0,
    /** se pueden crear filas de la tabla en el ERP */
    puedeAgregar: (tabla: string) => !!data && (!fila(tabla) || !!fila(tabla)!.alta_en_erp),
    /** se puede cambiar la tabla (o esa columna) en el ERP */
    puedeEditar: (tabla: string, columna?: string) => !!data && (!fila(tabla)
      || (!!columna && ((fila(tabla)!.columnas_erp ?? []) as string[]).includes(columna))),
  }
}
