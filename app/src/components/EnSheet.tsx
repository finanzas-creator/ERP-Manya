import { useOrigenSheet } from '../lib/origen'

/** R-71: aviso de que lo de esta pantalla se registra en el sheet (solo mientras el sheet sea la fuente). */
export function EnSheet({ que, plural = false }: { que: string; plural?: boolean }) {
  const { desdeSheet } = useOrigenSheet()
  if (!desdeSheet) return null
  return (
    <p className="mb-4 rounded-lg border border-line bg-s2 px-3 py-2 text-sm text-t2">
      {que} {plural ? 'se registran' : 'se registra'} en el <span className="font-medium">sheet administrativo</span>. El ERP {plural ? 'los' : 'lo'} trae solo cada 3 horas
      (8:07, 11:07, 14:07, 17:07 y 20:07, de lunes a sábado); aquí se consulta.
    </p>
  )
}
