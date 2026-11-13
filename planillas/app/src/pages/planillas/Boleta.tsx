import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fecha, mesLargo } from '../../lib/formato'
import { ESTADOS } from '../../lib/estados'
import { Boton } from '../../components/ui'
import { Icono } from '../../components/iconos'
import { PENSION, s2 } from './comun'

export type LineaBoleta = { concepto: string | null; nombre: string | null; tipo: string | null; plame?: string | null; cantidad: number | null; monto: number | null }
export type CabeceraBoleta = {
  apellidos_nombres: string | null; tipo_documento: string | null; numero_documento: string | null; cargo: string | null
  fecha_ingreso: string | null; fecha_cese: string | null; regimen: string | null; sistema_pension: string | null
  afp: string | null; cuspp: string | null; sueldo_basico: number | null; dias_vinculo: number | null; dias_sueldo: number | null
  dias_no_pagados: number | null; dias_vacaciones: number | null; dias_subsidiados: number | null; horas_extra: number | null
  ingresos: number | null; descuentos: number | null; neto: number | null; essalud: number | null
}
export type EmpleadorBoleta = { razon_social: string | null; ruc: string | null; direccion: string | null }

const celda = 'border border-black/30 px-1.5 py-0.5'

/** Boleta de pago (D.S. 001-98-TR) con el formato de HoldingD: datos del trabajador, días y una tabla
 *  de conceptos con su código PLAME en columnas de ingresos, descuentos y aportes del empleador. */
export function Boleta({ empleador, periodo, c, lineas, borrador, titulo = 'Boleta de pago', copia }:
  { empleador: EmpleadorBoleta | null | undefined; periodo: string; c: CabeceraBoleta; lineas: LineaBoleta[]; borrador?: boolean; titulo?: string; copia?: string }) {
  const suma = (t: string) => lineas.filter((l) => l.tipo === t).reduce((a, l) => a + (l.monto ?? 0), 0)
  const he = lineas.filter((l) => l.concepto === 'HE25' || l.concepto === 'HE35')
  const horas = (cod: string) => Number(lineas.find((l) => l.concepto === cod)?.cantidad ?? 0)
  const pension = c.sistema_pension === 'afp' ? (c.afp ?? 'AFP').toUpperCase() : PENSION[c.sistema_pension ?? ''] ?? '—'
  const dato = (k: string, v: ReactNode) => <td className={celda}><div className="text-[10px] font-semibold uppercase text-black/60">{k}</div><div>{v ?? '—'}</div></td>
  return (
    <div className="bg-white p-3 text-[12px] text-black">
      {borrador && <div className="mb-2 rounded border border-red-600/40 bg-red-50 py-0.5 text-center text-[11px] font-bold tracking-wider text-red-700">BORRADOR · se emite al cerrar la planilla</div>}
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] leading-snug">
          <div><b>Empresa:</b> {empleador?.razon_social}</div>
          {empleador?.direccion && <div><b>Domicilio:</b> {empleador.direccion}</div>}
          <div><b>RUC:</b> {empleador?.ruc ?? '—'}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold uppercase">{titulo}</div>
          <div className="text-[11px]">Periodo: {mesLargo(periodo)}</div>
          {copia && <div className="text-[10px] text-black/60">{copia}</div>}
        </div>
      </div>
      <table className="mt-2 w-full border-collapse text-[11px]">
        <tbody>
          <tr>{dato(c.tipo_documento ?? 'DNI', c.numero_documento)}<td className={celda} colSpan={3}><div className="text-[10px] font-semibold uppercase text-black/60">Apellidos y nombres</div><b>{c.apellidos_nombres}</b></td>{dato('Sueldo básico', s2(c.sueldo_basico))}</tr>
          <tr>{dato('Cargo', c.cargo)}{dato('Régimen pensionario', pension)}{dato('CUSPP', c.sistema_pension === 'afp' ? c.cuspp : '—')}{dato('Fecha ingreso', fecha(c.fecha_ingreso))}{dato('Fecha cese', c.fecha_cese ? fecha(c.fecha_cese) : '—')}</tr>
          <tr>{dato('Días trabajados', c.dias_sueldo)}{dato('H. ordinarias', (c.dias_sueldo ?? 0) * 8)}{dato('Días subsidiados', c.dias_subsidiados ?? 0)}{dato('Faltas', c.dias_no_pagados ?? 0)}{dato('Categoría', ESTADOS[c.regimen ?? '']?.label ?? c.regimen)}</tr>
          <tr>{dato('Días vacaciones', c.dias_vacaciones ?? 0)}{dato('H.E. al 25%', horas('HE25'))}{dato('H.E. al 35%', horas('HE35'))}{dato('Feriados lab.', horas('FERIADO'))}<td className={celda} /></tr>
        </tbody>
      </table>
      <table className="mt-2 w-full border-collapse text-[11px]">
        <thead><tr className="bg-black/5 text-[10px] uppercase">
          <th className={`${celda} w-12 text-left`}>Cód.</th><th className={`${celda} text-left`}>Conceptos</th>
          <th className={`${celda} w-24 text-right`}>Ingresos</th><th className={`${celda} w-24 text-right`}>Descuentos</th><th className={`${celda} w-24 text-right`}>Aportes empleador</th>
        </tr></thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.concepto}>
              <td className={`${celda} text-black/60`}>{l.plame ?? ''}</td>
              <td className={celda}>{l.nombre}{l.cantidad != null && Number(l.cantidad) > 0 && !he.includes(l) && <span className="text-black/50"> ({Number(l.cantidad)})</span>}</td>
              <td className={`${celda} num text-right`}>{l.tipo === 'ingreso' ? s2(l.monto) : ''}</td>
              <td className={`${celda} num text-right`}>{l.tipo === 'descuento' ? s2(l.monto) : ''}</td>
              <td className={`${celda} num text-right`}>{l.tipo === 'aporte' ? s2(l.monto) : ''}</td>
            </tr>
          ))}
          <tr className="font-semibold"><td className={celda} /><td className={celda}>Importe total</td>
            <td className={`${celda} num text-right`}>{s2(suma('ingreso'))}</td><td className={`${celda} num text-right`}>{s2(suma('descuento'))}</td><td className={`${celda} num text-right`}>{s2(suma('aporte'))}</td></tr>
          <tr className="font-bold"><td className={celda} /><td className={celda}>Neto a pagar en S/</td><td className={celda} />
            <td className={`${celda} num text-right`}>{s2(suma('ingreso') - suma('descuento'))}</td><td className={celda} /></tr>
        </tbody>
      </table>
      <div className="mt-8 grid grid-cols-2 gap-10 text-center text-[11px]">
        <div className="border-t border-black/50 pt-1">LA EMPRESA</div>
        <div className="border-t border-black/50 pt-1">{c.apellidos_nombres}</div>
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
