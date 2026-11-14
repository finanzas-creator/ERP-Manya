// Etiquetas y tonos de los estados que calculan las vistas. Único lugar donde se traducen.
export type Tono = 'good' | 'warning' | 'critical' | 'neutral' | 'info'

export const ESTADOS: Record<string, { label: string; tono: Tono }> = {
  // régimen (R-01)
  general: { label: 'Régimen general', tono: 'info' },
  pequena: { label: 'Pequeña empresa', tono: 'info' },
  micro: { label: 'Microempresa', tono: 'info' },
  // trabajador
  activo: { label: 'Activo', tono: 'good' },
  cesado: { label: 'Cesado', tono: 'neutral' },
  // gratificación y CTS (R-17, R-18)
  regular: { label: 'Regular', tono: 'good' },
  trunca: { label: 'Trunca', tono: 'warning' },
  deposito: { label: 'Depósito', tono: 'good' },
  // planilla del mes (R-03, R-24)
  abierta: { label: 'Abierta', tono: 'warning' },
  cerrada: { label: 'Cerrada', tono: 'good' },
  provisional: { label: 'Tasas provisionales', tono: 'critical' },
}

export const ROLES = {
  admin: 'Administrador',
  rrhh: 'Recursos humanos',
} as const
