// Iconos de línea (24×24, trazo actual). Un solo lugar para todos los iconos de la app.
const P: Record<string, string> = {
  resumen: 'M3 10l9-7 9 7v9a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 21v-9h6v9',
  clientes: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  ventas: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
  cobranza: 'M2 6h20v12H2zM12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5',
  renovaciones: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15',
  pauta: 'M3 11l15-6v14L3 13zM3 11v2M9 13v5a2 2 0 003.5 1.3',
  rentabilidad: 'M3 3v18h18M7 11h3v6H7zM12 7h3v10h-3zM17 13h3v4h-3z',
  resultados: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15l2 2 4-4',
  costos: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  revision: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  validacion: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  configuracion: 'M12 15a3 3 0 100-6 3 3 0 000 6M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  salir: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  cerrar: 'M18 6L6 18M6 6l12 12',
  lupa: 'M11 18a7 7 0 100-14 7 7 0 000 14M21 21l-4-4',
  mas: 'M12 5v14M5 12h14',
  izquierda: 'M15 18l-6-6 6-6',
  derecha: 'M9 18l6-6-6-6',
}

export type NombreIcono = keyof typeof P

export function Icono({ nombre, className = 'size-4' }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"
      strokeLinejoin="round" className={`shrink-0 ${className}`} aria-hidden>
      <path d={P[nombre]} />
    </svg>
  )
}
