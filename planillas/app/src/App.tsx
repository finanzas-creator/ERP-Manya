import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { puedeOperar, useSesion } from './lib/sesion'
import { DEV_AUTH } from './lib/supabase'
import { ROLES } from './lib/estados'
import { Boton } from './components/ui'
import { Icono } from './components/iconos'
import Login from './pages/Login'
import CrearClave from './pages/CrearClave'

const Planillas = lazy(() => import('./pages/Planillas'))

/** Sistema Planillas: una sola pantalla con pestañas, para administrador y recursos humanos (R-26). */
export default function App() {
  const { usuario, salir, debeCrearClave } = useSesion()
  if (usuario === undefined) return <div className="p-8 text-t3">Cargando…</div>
  if (usuario === null) return <Login />
  if (debeCrearClave) return <CrearClave />
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-s1 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink"><Icono nombre="planillas" /></div>
          <div className="text-sm font-semibold">Planillas</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden text-right text-xs sm:block">
            <div className="text-t1">{usuario.nombre ?? usuario.email}</div>
            <div className="text-t3">{ROLES[usuario.rol as keyof typeof ROLES] ?? usuario.rol}</div>
          </div>
          <Boton variante="fantasma" onClick={salir}><Icono nombre="salir" />Salir{DEV_AUTH ? ' (dev)' : ''}</Boton>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        {puedeOperar(usuario.rol) ? (
          <Suspense fallback={<div className="py-8 text-sm text-t3">Cargando…</div>}>
            <Routes>
              <Route path="/" element={<Planillas />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        ) : <p className="text-sm text-t2">Tu usuario no tiene acceso a Planillas. Pide al administrador que te asigne un rol.</p>}
      </main>
    </div>
  )
}
