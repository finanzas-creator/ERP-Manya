// Etiquetas y tonos de los estados que calculan las vistas. Único lugar donde se traducen.
export type Tono = 'good' | 'warning' | 'critical' | 'neutral' | 'info'

export const ESTADOS: Record<string, { label: string; tono: Tono }> = {
  // cuota / cobro (R-34)
  pagada: { label: 'Pagada', tono: 'good' },
  por_cobrar: { label: 'Por cobrar', tono: 'warning' },
  vencida: { label: 'Vencida', tono: 'critical' },
  por_facturar: { label: 'Por facturar', tono: 'neutral' },
  sin_plan: { label: 'Sin plan de pagos', tono: 'critical' },
  // plan de pagos (R-10)
  cuadra: { label: 'Plan completo', tono: 'good' },
  falta_planificar: { label: 'Falta planificar', tono: 'warning' },
  sobre_planificado: { label: 'Plan excede venta', tono: 'critical' },
  // servicio contratado (R-52)
  activo: { label: 'Activo', tono: 'good' },
  finalizado: { label: 'Finalizado', tono: 'neutral' },
  // comprobante (R-27, R-81)
  sin_efecto: { label: 'Sin efecto (NC)', tono: 'neutral' },
  anulado: { label: 'Anulado', tono: 'neutral' },
  // gestión de cobranza (R-38)
  sin_gestion: { label: 'Sin gestión', tono: 'critical' },
  compromiso_incumplido: { label: 'Compromiso incumplido', tono: 'critical' },
  seguimiento_atrasado: { label: 'Seguimiento atrasado', tono: 'warning' },
  en_gestion: { label: 'En gestión', tono: 'good' },
  // antigüedad (v_cobranza)
  al_dia: { label: 'Al día', tono: 'good' },
  '1-30': { label: '1–30 días', tono: 'warning' },
  '31-60': { label: '31–60 días', tono: 'warning' },
  '61-90': { label: '61–90 días', tono: 'critical' },
  '>90': { label: 'Más de 90 días', tono: 'critical' },
}

export const TRAMOS = ['al_dia', '1-30', '31-60', '61-90', '>90'] as const

export const ROLES = {
  admin: 'Administrador',
  tesoreria: 'Tesorería',
  ceo: 'CEO',
} as const
