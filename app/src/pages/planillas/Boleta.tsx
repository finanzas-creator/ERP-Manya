import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fecha, mesLargo } from '../../lib/formato'
import { ESTADOS } from '../../lib/estados'
import { Boton } from '../../components/ui'
import { Icono } from '../../components/iconos'
import { PENSION, s2 } from './comun'

export type LineaBoleta = { concepto: string | null; nombre: string | null; tipo: string | null; cantidad: number | null; monto: number | null }
export type CabeceraBoleta = {
  apellidos_nombres: string | null; tipo_documento: string | null; numero_documento: string | null; cargo: string | null
  fecha_ingreso: string | null; fecha_cese: string | null; regimen: string | null; sistema_pension: string | null
  afp: string | null; cuspp: string | null; sueldo_basico: number | null; dias_vinculo: number | null; dias_sueldo: number | null
  dias_no_pagados: number | null; dias_vacaciones: number | null; dias_subsidiados: number | null; horas_extra: number | null
  ingresos: number | null; descuentos: number | null; neto: number | null; essalud: number | null
}
export type EmpleadorBoleta = { razon_social: string | null; ruc: string | null; direccion: string | null }

function Columna({ titulo, lineas, total }: { titulo: string; lineas: LineaBoleta[]; total: number }) {
  return (
    <div className="min-w-0 flex-1 border border-black/20">
      <div className="border-b border-black/20 bg-black/5 px-2 py-1 text-xs font-semibold uppercase">{titulo}</div>
      <table className="w-full text-xs">
        <tbody>
          {lineas.map((l) => (
            <tr key={l.concepto}>
              <td className="px-2 py-0.5">{l.nombre}{l.cantidad != null && l.cantidad > 0 && <span className="text-black/50"> ({Number(l.cantidad)})</span>}</td>
              <td className="num px-2 py-0.5 text-right">{s2(l.monto)}</td>
            </tr>
          ))}
          {lineas.length === 0 && <tr><td className="px-2 py-1 text-black/40">—</td></tr>}
        </tbody>
        <tfoot><tr className="border-t border-black/20 font-semibold"><td className="px-2 py-1">Total</td><td className="num px-2 py-1 text-right">{s2(total)}</td></tr></tfoot>
      </table>
    </div>
  )
}

/** Boleta de pago (DS 001-98-TR): empleador, trabajador, ingresos, descuentos, aportes y neto. */
export function Boleta({ empleador, periodo, c, lineas, borrador, titulo = 'Boleta de pago' }:
  { empleador: EmpleadorBoleta | null | undefined; periodo: string; c: CabeceraBoleta; lineas: LineaBoleta[]; borrador?: boolean; titulo?: string }) {
  const de = (t: string) => lineas.filter((l) => l.tipo === t)
  const suma = (t: string) => de(t).reduce((a, l) => a + (l.monto ?? 0), 0)
  const dato = (k: string, v: ReactNode) => <div><span className="text-black/50">{k}: </span>{v ?? '—'}</div>
  return (
    <div className="relative rounded-lg border border-black/20 bg-white p-4 text-[13px] text-black">
      {borrador && <div className="-mx-4 -mt-4 mb-3 rounded-t-lg border-b border-red-600/40 bg-red-50 px-4 py-1 text-center text-xs font-bold tracking-wider text-red-700">BORRADOR · se emite al cerrar la planilla</div>}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-black/20 pb-2">
        <div>
          <div className="font-bold">{empleador?.razon_social}</div>
          <div className="text-xs">RUC {empleador?.ruc ?? '—'}{empleador?.direccion ? ` · ${empleador.direccion}` : ''}</div>
        </div>
        <div className="text-right">
          <div className="font-bold uppercase">{titulo}</div>
          <div className="text-xs">Periodo: {mesLargo(periodo)}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-0.5 py-2 text-xs sm:grid-cols-3">
        {dato('Trabajador', <b>{c.apellidos_nombres}</b>)}
        {dato(c.tipo_documento ?? 'Documento', c.numero_documento)}
        {dato('Cargo', c.cargo)}
        {dato('Ingreso', fecha(c.fecha_ingreso))}
        {c.fecha_cese && dato('Cese', fecha(c.fecha_cese))}
        {dato('Régimen', ESTADOS[c.regimen ?? '']?.label ?? c.regimen)}
        {dato('Pensión', c.sistema_pension === 'afp' ? `${c.afp ?? 'AFP'} · CUSPP ${c.cuspp ?? '—'}` : PENSION[c.sistema_pension ?? ''])}
        {dato('Sueldo básico', s2(c.sueldo_basico))}
        {dato('Días del mes', c.dias_vinculo)}
        {dato('Días laborados', c.dias_sueldo)}
        {!!c.dias_no_pagados && dato('Días no laborados', c.dias_no_pagados)}
        {!!c.dias_vacaciones && dato('Días de vacaciones', c.dias_vacaciones)}
        {!!c.dias_subsidiados && dato('Días subsidiados', c.dias_subsidiados)}
        {!!c.horas_extra && dato('Horas extra', c.horas_extra)}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Columna titulo="Ingresos" lineas={de('ingreso')} total={suma('ingreso')} />
        <Columna titulo="Descuentos" lineas={de('descuento')} total={suma('descuento')} />
        <Columna titulo="Aportes del empleador" lineas={de('aporte')} total={suma('aporte')} />
      </div>
      <div className="mt-2 flex justify-end">
        <div className="border border-black/30 px-3 py-1 font-bold">Neto a pagar: S/ {s2(suma('ingreso') - suma('descuento'))}</div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
        <div className="border-t border-black/40 pt-1">Empleador</div>
        <div className="border-t border-black/40 pt-1">Trabajador</div>
      </div>
    </div>
  )
}

/** Vista de impresión a pantalla completa: lo de adentro es lo único que sale en papel. */
export function VistaImpresion({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return createPortal(
    <div className="zona-impresion fixed inset-0 z-[60] overflow-y-auto bg-s0 print:static">
      <div className="no-imprimir sticky top-0 flex items-center justify-between gap-2 border-b border-line bg-s1 px-4 py-2">
        <span className="text-sm font-semibold">{titulo}</span>
        <div className="flex gap-2">
          <Boton variante="primario" onClick={() => window.print()}><Icono nombre="imprimir" />Imprimir o guardar PDF</Boton>
          <Boton onClick={onCerrar}><Icono nombre="cerrar" />Cerrar</Boton>
        </div>
      </div>
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 print:block print:max-w-none print:p-0">{children}</div>
    </div>,
    document.body,
  )
}
