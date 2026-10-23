import { supabase } from './supabase'

// Carpetas privadas de Supabase Storage (las crean las migraciones 023 y 028).
export type Carpeta = 'constancias' | 'comprobantes'

/** Sube un archivo y devuelve su ruta (se guarda en la tabla del documento). */
export async function subirArchivo(carpeta: Carpeta, prefijo: string, archivo: File) {
  const ruta = `${prefijo}/${Date.now()}-${archivo.name.replace(/[^\w.-]+/g, '_')}`
  const { error } = await supabase.storage.from(carpeta).upload(ruta, archivo)
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`)
  return ruta
}

/** Abre un archivo guardado con un enlace temporal (la carpeta es privada). */
export async function verArchivo(carpeta: Carpeta, ruta: string) {
  const { data, error } = await supabase.storage.from(carpeta).createSignedUrl(ruta, 120)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank', 'noopener')
}
