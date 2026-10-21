import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import { puedeOperar, useSesion } from './lib/sesion'
import { DEV_AUTH } from './lib/supabase'
import { ROLES } from './lib/estados'
import { Boton } from './components/ui'
import Login from './pages/Login'
import CrearClave from './pages/CrearClave'
import Resumen from './pages/Resumen'
import Ventas from './pages/Ventas'
import VentaDetalle from './pages/VentaDetalle'
import NuevaVenta from './pages/NuevaVenta'
import Cobranza from './pages/Cobranza'
import Renovaciones from './pages/Renovaciones'
import Rentabilidad from './pages/Rentabilidad'
import Revision from './pages/Revision'

const NAV = [
  { a: '/', label: 'Resumen', todos: true },
  { a: '/ventas', label: 'Ventas' },
  { a: '/cobranza', label: 'Cobranza' },
  { a: '/renovaciones', label: 'Renovaciones' },
  { a: '/rentabilidad', label: 'Rentabilidad' },
  { a: '/revision', label: 'Revisión de datos' },
]

export default function App() {
  const { usuario, salir, debeCrearClave } = useSesion()
  const [menu, setMenu] = useState(false)
  if (usuario === undefined) return <div className="p-8 text-t3">Cargando…</div>
  if (usuario === null) return <Login />
  if (debeCrearClave) return <CrearClave />
  const opera = puedeOperar(usuario.rol)

  return (
    <div className="min-h-screen md:flex">
      <aside className={`${menu ? 'block' : 'hidden'} border-b border-line bg-s1 md:block md:min-h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0`}>
        <div className="px-4 py-4">
          <div className="text-sm font-semibold">Manya ERP</div>
          <div className="text-xs text-t3">{usuario.nombre ?? usuario.email} · {ROLES[usuario.rol]}</div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2 pb-4">
          {NAV.filter((n) => n.todos || opera).map((n) => (
            <NavLink key={n.a} to={n.a} end={n.a === '/'} onClick={() => setMenu(false)}
              className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-s2 font-medium text-t1' : 'text-t2 hover:bg-s2'}`}>
              {n.label}
            </NavLink>
          ))}
          <Boton variante="fantasma" className="mt-4 justify-start" onClick={salir}>Salir{DEV_AUTH ? ' (dev)' : ''}</Boton>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 border-b border-line bg-s1 px-4 py-2 md:hidden">
          <Boton variante="fantasma" onClick={() => setMenu(!menu)} aria-label="Menú">☰</Boton>
          <span className="text-sm font-semibold">Manya ERP</span>
        </div>
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Routes>
            <Route path="/" element={<Resumen />} />
            {opera && <>
              <Route path="/ventas" element={<Ventas />} />
              <Route path="/ventas/nueva" element={<NuevaVenta />} />
              <Route path="/ventas/:id" element={<VentaDetalle />} />
              <Route path="/cobranza" element={<Cobranza />} />
              <Route path="/renovaciones" element={<Renovaciones />} />
              <Route path="/rentabilidad" element={<Rentabilidad />} />
              <Route path="/revision" element={<Revision />} />
            </>}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
