const usdFmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2Fmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const penFmt = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 })
const enteroFmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 })
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

export const usd = (v: number | null | undefined) => usdFmt.format(v ?? 0)
export const usd2 = (v: number | null | undefined) => usd2Fmt.format(v ?? 0)
export const dinero = (v: number | null | undefined, moneda: string | null | undefined) =>
  moneda === 'PEN' ? penFmt.format(v ?? 0) : usd2Fmt.format(v ?? 0)
/** Monto sin símbolo, para tablas cuya moneda va en el título. */
export const entero = (v: number | null | undefined) => enteroFmt.format(v ?? 0)
export const pct = (v: number | null | undefined) => (v == null ? '—' : pctFmt.format(v))

/** 'YYYY-MM-DD' -> '05 mar 2026' (sin pasar por Date para no correr zonas horarias). */
export function fecha(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d} ${MESES[Number(m) - 1]} ${y}`
}

/** '1 persona', '3 personas'. */
export const plural = (n: number | null | undefined, uno: string, varios: string) => `${n ?? 0} ${n === 1 ? uno : varios}`

export function mesLargo(iso: string) {
  const [y, m] = iso.split('-')
  return `${MESES[Number(m) - 1]} ${y}`
}

export function hoyISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function mesActual() {
  return hoyISO().slice(0, 7) + '-01'
}

export function sumarMeses(mesIso: string, n: number) {
  const [y, m] = mesIso.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`
}

export function finDeMes(mesIso: string) {
  const sig = sumarMeses(mesIso, 1)
  const [y, m] = sig.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 0))
  return d.toISOString().slice(0, 10)
}
