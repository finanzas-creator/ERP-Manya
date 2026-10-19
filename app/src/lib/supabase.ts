import { createClient } from '@supabase/supabase-js'
import type { Database } from './db'

export const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === '1'

// En local la API es PostgREST detrás del proxy de Vite (/rest/v1); en producción, Supabase.
const url = import.meta.env.VITE_SUPABASE_URL || window.location.origin
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'dev'

const CLAVE_TOKEN_DEV = 'manya.devToken'

export function guardarTokenDev(token: string | null) {
  try {
    if (token) sessionStorage.setItem(CLAVE_TOKEN_DEV, token)
    else sessionStorage.removeItem(CLAVE_TOKEN_DEV)
  } catch { /* almacenamiento no disponible: la sesión dura lo que la pestaña */ }
  tokenDev = token
}

let tokenDev: string | null = (() => {
  try { return sessionStorage.getItem(CLAVE_TOKEN_DEV) } catch { return null }
})()

export const supabase = DEV_AUTH
  ? createClient<Database>(url, anonKey, { accessToken: async () => tokenDev ?? '' })
  : createClient<Database>(url, anonKey)

export function hayTokenDev() {
  return !!tokenDev
}

type Respuesta = { data: unknown; error: { message: string } | null }

/** Lanza el error de Supabase como excepción para que react-query lo muestre. */
export function ok<R extends Respuesta>(r: R): NonNullable<R['data']> {
  if (r.error) throw new Error(r.error.message)
  return r.data as NonNullable<R['data']>
}

/** Igual que ok(), para consultas cuyo resultado puede no existir (maybeSingle). */
export function okONulo<R extends Respuesta>(r: R): R['data'] {
  if (r.error) throw new Error(r.error.message)
  return r.data
}
