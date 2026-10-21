import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Suspense, lazy, useState } from 'react'
import { puedeOperar, useSesion } from './lib/sesion'
import { DEV_AUTH } from './lib/supabase'
import { ROLES } from './lib/estados'
import { Boton } from './components/ui'
import { Icono, type NombreIcono } from './components/iconos'
import Login from './pages/Login'
import CrearClave from './pages/CrearClave'

// Cada pantalla se descarga al abrirla: la primera carga es más liviana.
const Resumen = lazy(() => import('./pages/Resumen'))
const Clientes = lazy(() => import('./pages/Clientes'))
const ClienteDetalle = lazy(() => import('./pages/ClienteDetalle'))
const Ventas = lazy(() => import('./pages/Ventas'))
const VentaDetalle = lazy(() => import('./pages/VentaDetalle'))
const NuevaVenta = lazy(() => import('./pages/NuevaVenta'))
const Cobranza = lazy(() => import('./pages/Cobranza'))
const Renovaciones = lazy(() => import('./pages/Renovaciones'))
const Pauta = lazy(() => import('./pages/Pauta'))
const Rentabilidad = lazy(() => import('./pages/Rentabilidad'))
const Resultados = lazy(() => import('./pages/Resultados'))
const Costos = lazy(() => import('./pages/Costos'))
const Revision = lazy(() => import('./pages/Revision'))
const Configuracion = lazy(() => import('./pages/Configuracion'))

type Acceso = 'todos' | 'opera' | 'admin'
const NAV: { grupo: string; items: { a: string; label: string; icono: NombreIcono; acceso: Acceso }[] }[] = [
  { grupo: 'Operación', items: [
    { a: '/', label: 'Resumen', icono: 'resumen', acceso: 'todos' },
    { a: '/clientes', label: 'Clientes', icono: 'clientes', acceso: 'opera' },
    { a: '/ventas', label: 'Ventas', icono: 'ventas', acceso: 'opera' },
    { a: '/cobranza', label: 'Cobranza', icono: 'cobranza', acceso: 'opera' },
    { a: '/renovaciones', label: 'Renovaciones', icono: 'renovaciones', acceso: 'opera' },
    { a: '/pauta', label: 'Pauta', icono: 'pauta', acceso: 'opera' },
  ] },
  { grupo: 'Análisis', items: [
    { a: '/resultados', label: 'Estado de resultados', icono: 'resultados', acceso: 'todos' },
    { a: '/rentabilidad', label: 'Rentabilidad', icono: 'rentabilidad', acceso: 'opera' },
  ] },
  { grupo: 'Costos', items: [
    { a: '/costos', label: 'Planilla y gastos', icono: 'costos', acceso: 'opera' },
  ] },
  { grupo: 'Sistema', items: [
    { a: '/revision', label: 'Revisión de datos', icono: 'revision', acceso: 'opera' },
    { a: '/configuracion', label: 'Configuración', icono: 'configuracion', acceso: 'admin' },
  ] },
]

export default function App() {
  const { usuario, salir, debeCrearClave } = useSesion()
  const [menu, setMenu] = useState(false)
  if (usuario === undefined) return <div className="p-8 text-t3">Cargando…</div>
  if (usuario === null) return <Login />
  if (debeCrearClave) return <CrearClave />
  const opera = puedeOperar(usuario.rol)
  const admin = usuario.rol === 'admin'
  const permitido = (a: Acceso) => a === 'todos' || (a === 'opera' && opera) || (a === 'admin' && admin)

  return (
    <div className="min-h-screen md:flex">
      <aside className={`${menu ? 'block' : 'hidden'} border-b border-line bg-s1 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0`}>
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="grid size-8 place-items-center rounded-lg bg-accent text-sm font-bold text-accent-ink">M</div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Manya ERP</div>
            <div className="truncate text-xs text-t3">{usuario.nombre ?? usuario.email}</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map((g) => {
            const items = g.items.filter((n) => permitido(n.acceso))
            if (!items.length) return null
            return (
              <div key={g.grupo} className="mb-2">
                <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-t3 uppercase">{g.grupo}</div>
                {items.map((n) => (
                  <NavLink key={n.a} to={n.a} end={n.a === '/'} onClick={() => setMenu(false)}
                    className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-s2 font-medium text-t1' : 'text-t2 hover:bg-s2'}`}>
                    <Icono nombre={n.icono} />{n.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className="border-t border-line px-2 py-3">
          <div className="px-3 pb-2 text-xs text-t3">{ROLES[usuario.rol]}</div>
          <Boton variante="fantasma" className="w-full justify-start" onClick={salir}>
            <Icono nombre="salir" />Salir{DEV_AUTH ? ' (dev)' : ''}
          </Boton>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-line bg-s1 px-4 py-2 md:hidden">
          <Boton variante="fantasma" onClick={() => setMenu(!menu)} aria-label="Menú"><Icono nombre="menu" /></Boton>
          <span className="text-sm font-semibold">Manya ERP</span>
        </div>
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Suspense fallback={<div className="py-8 text-sm text-t3">Cargando…</div>}>
            <Routes>
              <Route path="/" element={<Resumen />} />
              <Route path="/resultados" element={<Resultados />} />
              {opera && <>
                <Route path="/clientes" element={<Clientes />} />
                <Route path="/clientes/:id" element={<ClienteDetalle />} />
                <Route path="/ventas" element={<Ventas />} />
                <Route path="/ventas/nueva" element={<NuevaVenta />} />
                <Route path="/ventas/:id" element={<VentaDetalle />} />
                <Route path="/cobranza" element={<Cobranza />} />
                <Route path="/renovaciones" element={<Renovaciones />} />
                <Route path="/pauta" element={<Pauta />} />
                <Route path="/rentabilidad" element={<Rentabilidad />} />
                <Route path="/costos" element={<Costos />} />
                <Route path="/revision" element={<Revision />} />
              </>}
              {admin && <Route path="/configuracion" element={<Configuracion />} />}
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
