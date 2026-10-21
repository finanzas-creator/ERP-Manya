import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { ESTADOS, type Tono } from '../lib/estados'
import { mesLargo, sumarMeses } from '../lib/formato'
import { Icono } from './iconos'

const TONOS: Record<Tono, string> = {
  good: 'bg-good-bg text-good',
  warning: 'bg-warning-bg text-warning',
  critical: 'bg-critical-bg text-critical',
  neutral: 'bg-s2 text-t2',
  info: 'bg-info-bg text-accent',
}

export function Estado({ valor }: { valor: string | null | undefined }) {
  const e = ESTADOS[valor ?? ''] ?? { label: valor ?? '—', tono: 'neutral' as Tono }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONOS[e.tono]}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {e.label}
    </span>
  )
}

export function Card({ titulo, accion, children, className = '' }:
  { titulo?: ReactNode; accion?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-s1 ${className}`}>
      {(titulo || accion) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {accion}
        </header>
      )}
      {children}
    </section>
  )
}

export function Kpi({ label, valor, detalle, tono, onClick }:
  { label: string; valor: ReactNode; detalle?: ReactNode; tono?: Tono; onClick?: () => void }) {
  const color = tono === 'critical' ? 'text-critical' : tono === 'good' ? 'text-good' : 'text-t1'
  const contenido = <>
    <div className="flex items-center justify-between gap-2 text-xs font-medium text-t2">
      {label}
      {onClick && <span className="text-t3 opacity-0 transition group-hover:opacity-100"><Icono nombre="lupa" className="size-3.5" /></span>}
    </div>
    <div className={`num mt-1 text-2xl font-semibold tracking-tight ${color}`}>{valor}</div>
    {detalle && <div className="mt-0.5 text-xs text-t3">{detalle}</div>}
  </>
  return onClick
    ? <button onClick={onClick} className="group w-full rounded-xl border border-line bg-s1 px-4 py-3 text-left transition hover:border-accent hover:shadow-sm">{contenido}</button>
    : <div className="rounded-xl border border-line bg-s1 px-4 py-3">{contenido}</div>
}

/** Selector de mes ‹ mes › compartido por las pantallas que filtran por periodo. */
export function SelectorMes({ mes, onCambio }: { mes: string; onCambio: (mes: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Boton onClick={() => onCambio(sumarMeses(mes, -1))} aria-label="Mes anterior"><Icono nombre="izquierda" /></Boton>
      <span className="w-24 text-center text-sm font-medium">{mesLargo(mes)}</span>
      <Boton onClick={() => onCambio(sumarMeses(mes, 1))} aria-label="Mes siguiente"><Icono nombre="derecha" /></Boton>
    </div>
  )
}

/** Pestañas segmentadas. */
export function Pestanas<K extends string>({ opciones, valor, onCambio }:
  { opciones: { clave: K; label: ReactNode }[]; valor: K; onCambio: (k: K) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-s2 p-0.5" role="tablist">
      {opciones.map((o) => (
        <button key={o.clave} role="tab" aria-selected={valor === o.clave} onClick={() => onCambio(o.clave)}
          className={`rounded-md px-3 py-1 text-sm ${valor === o.clave ? 'bg-s1 font-medium text-t1 shadow-sm' : 'text-t2 hover:text-t1'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Panel lateral para ver el detalle de un número sin salir de la pantalla. */
export function Panel({ titulo, subtitulo, onCerrar, children }:
  { titulo: ReactNode; subtitulo?: ReactNode; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onCerrar}>
      <aside className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-s1 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog">
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-s1 px-5 py-4">
          <div>
            {subtitulo && <div className="text-xs font-medium tracking-wide text-t3 uppercase">{subtitulo}</div>}
            <h2 className="mt-0.5 text-lg font-semibold">{titulo}</h2>
          </div>
          <Boton variante="fantasma" onClick={onCerrar} aria-label="Cerrar"><Icono nombre="cerrar" /></Boton>
        </header>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  )
}

/** Renglón de un desglose: etiqueta y monto; `total` lo resalta, `sangria` lo muestra como parte. */
export function Renglon({ label, valor, total, sangria, tono }:
  { label: ReactNode; valor: ReactNode; total?: boolean; sangria?: boolean; tono?: Tono }) {
  const color = tono === 'critical' ? 'text-critical' : tono === 'good' ? 'text-good' : ''
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 text-sm ${total ? 'border-t border-line font-semibold' : ''} ${sangria ? 'pl-4 text-t2' : ''}`}>
      <span>{label}</span><span className={`num whitespace-nowrap ${color}`}>{valor}</span>
    </div>
  )
}

/** Barras horizontales: cada fila con su valor ya calculado por la base. */
export function Barras({ filas, color = 'var(--series-1)', onFila }:
  { filas: { clave: string; label: ReactNode; valor: number; texto: ReactNode }[]; color?: string; onFila?: (clave: string) => void }) {
  const max = Math.max(1, ...filas.map((f) => Math.abs(f.valor)))
  return (
    <div className="flex flex-col gap-2">
      {filas.map((f) => (
        <div key={f.clave} onClick={onFila ? () => onFila(f.clave) : undefined}
          className={`grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm ${onFila ? 'cursor-pointer rounded-md hover:bg-s2' : ''}`}>
          <span className="truncate text-t2">{f.label}</span>
          <span className="h-2 rounded-full bg-s2"><span className="block h-2 rounded-full" style={{ width: `${Math.abs(f.valor) / max * 100}%`, background: color }} /></span>
          <span className="num text-right">{f.texto}</span>
        </div>
      ))}
      {filas.length === 0 && <div className="text-sm text-t3">Sin datos en el periodo.</div>}
    </div>
  )
}

/** Nota al pie de una tarjeta. */
export function Nota({ children }: { children: ReactNode }) {
  return <p className="border-t border-line px-4 py-2 text-xs text-t3">{children}</p>
}

export type Columna<T> = {
  titulo: string
  celda: (fila: T) => ReactNode
  derecha?: boolean
  className?: string
}

export function Tabla<T>({ filas, columnas, clave, onFila, vacio = 'Sin registros', pie, compacta }:
  { filas: T[] | undefined; columnas: Columna<T>[]; clave: (f: T) => string; onFila?: (f: T) => void
    vacio?: string; pie?: ReactNode; compacta?: boolean }) {
  const px = compacta ? 'px-3' : 'px-4'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-t2">
            {columnas.map((c) => (
              <th key={c.titulo} className={`${px} py-2 font-medium whitespace-nowrap ${c.derecha ? 'text-right' : ''}`}>{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas === undefined && (
            <tr><td colSpan={columnas.length} className="px-4 py-6 text-center text-t3">Cargando…</td></tr>
          )}
          {filas?.length === 0 && (
            <tr><td colSpan={columnas.length} className="px-4 py-6 text-center text-t3">{vacio}</td></tr>
          )}
          {filas?.map((f) => (
            <tr key={clave(f)} onClick={onFila ? () => onFila(f) : undefined}
              className={`border-b border-line last:border-0 ${onFila ? 'cursor-pointer hover:bg-s2' : ''}`}>
              {columnas.map((c) => (
                <td key={c.titulo} className={`${px} py-2 align-top ${c.derecha ? 'num text-right whitespace-nowrap' : ''} ${c.className ?? ''}`}>
                  {c.celda(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {pie && <tfoot className="border-t border-line font-medium">{pie}</tfoot>}
      </table>
    </div>
  )
}

export function Boton({ variante = 'normal', className = '', ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'normal' | 'primario' | 'peligro' | 'fantasma' }) {
  const estilos = {
    normal: 'border border-line bg-s1 hover:bg-s2',
    primario: 'bg-accent text-accent-ink hover:opacity-90',
    peligro: 'border border-line bg-s1 text-critical hover:bg-critical-bg',
    fantasma: 'hover:bg-s2 text-t2',
  }[variante]
  return <button {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${estilos} ${className}`} />
}

export function Campo({ label, children, ayuda }: { label: string; children: ReactNode; ayuda?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-t2">{label}</span>
      {children}
      {ayuda && <span className="text-xs text-t3">{ayuda}</span>}
    </label>
  )
}

const inputCls = 'rounded-lg border border-line bg-s1 px-2.5 py-1.5 text-sm outline-none focus:border-accent'
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ''}`} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ''}`} />

export function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-line bg-s1 shadow-xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <Boton variante="fantasma" onClick={onCerrar} aria-label="Cerrar"><Icono nombre="cerrar" /></Boton>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function MensajeError({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="rounded-lg bg-critical-bg px-3 py-2 text-sm text-critical">{(error as Error).message}</div>
}

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold tracking-tight">{children}</h1>
      {accion}
    </div>
  )
}
