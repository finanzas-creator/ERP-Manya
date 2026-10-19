import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DEV_AUTH, guardarTokenDev, hayTokenDev, ok, supabase } from './supabase'
import type { Fila } from './db'

type Usuario = Fila<'usuario'>

type Sesion = {
  usuario: Usuario | null | undefined   // undefined = cargando, null = sin sesión
  entrarDev: (rol: string) => Promise<void>
  entrar: (email: string, clave: string) => Promise<void>
  salir: () => Promise<void>
}

const Ctx = createContext<Sesion | null>(null)

export function SesionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [autenticado, setAutenticado] = useState<boolean>(DEV_AUTH ? hayTokenDev() : false)

  useEffect(() => {
    if (DEV_AUTH) return
    supabase.auth.getSession().then(({ data }) => setAutenticado(!!data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setAutenticado(!!s))
    return () => data.subscription.unsubscribe()
  }, [])

  const { data: usuario, isLoading } = useQuery({
    queryKey: ['yo', autenticado],
    enabled: autenticado,
    queryFn: async () => ok(await supabase.rpc('yo')) as unknown as Usuario | null,
  })

  const valor: Sesion = {
    usuario: !autenticado ? null : isLoading ? undefined : (usuario ?? null),
    entrarDev: async (rol) => {
      const r = await fetch(`/dev/token?rol=${rol}`)
      guardarTokenDev((await r.json()).token)
      qc.clear()
      setAutenticado(true)
    },
    entrar: async (email, clave) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password: clave })
      if (error) throw new Error(error.message)
    },
    salir: async () => {
      if (DEV_AUTH) guardarTokenDev(null)
      else await supabase.auth.signOut()
      qc.clear()
      setAutenticado(false)
    },
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSesion() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useSesion fuera de SesionProvider')
  return s
}

export function useRol() {
  return useSesion().usuario?.rol ?? null
}

export const puedeOperar = (rol: string | null) => rol === 'admin' || rol === 'tesoreria'
