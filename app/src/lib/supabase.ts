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

type Respuesta = { data: unknown; error: { message: string; code?: string; details?: string | null } | null }

// Nombre visible de los campos que no se pueden repetir; se reconocen en el nombre de la restricción.
const CAMPOS: [string, string][] = [
  ['razon_social', 'esa razón social'], ['ruc', 'ese RUC'], ['identidad', 'esa serie y número'],
  ['email', 'ese correo'], ['codigo', 'ese código'], ['nombre', 'ese nombre'],
]

/** Mensaje entendible para el usuario a partir del error de la base. */
function mensaje(e: NonNullable<Respuesta['error']>) {
  if (e.code === '23505') {   // valor repetido en un campo único
    const restriccion = e.message.match(/constraint "(.+)"/)?.[1] ?? ''
    const campo = CAMPOS.find(([clave]) => restriccion.includes(clave))?.[1]
    return campo ? `Ya existe un registro con ${campo}.` : 'Ese registro ya existe.'
  }
  if (e.code === '42501') return 'No tienes permiso para esta acción.'
  return e.message
}

/** Lanza el error de Supabase como excepción para que react-query lo muestre. */
export function ok<R extends Respuesta>(r: R): NonNullable<R['data']> {
  if (r.error) throw new Error(mensaje(r.error))
  return r.data as NonNullable<R['data']>
}

/** Igual que ok(), para consultas cuyo resultado puede no existir (maybeSingle). */
export function okONulo<R extends Respuesta>(r: R): R['data'] {
  if (r.error) throw new Error(mensaje(r.error))
  return r.data
}
