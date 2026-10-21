import { useQuery } from '@tanstack/react-query'
import { ok, supabase } from './supabase'

// Catálogos: se leen una vez y se comparten entre pantallas.
const catalogo = <R extends { data: unknown; error: { message: string } | null }>(clave: string, fn: () => PromiseLike<R>) =>
  () => useQuery({ queryKey: ['catalogo', clave], staleTime: 5 * 60_000, queryFn: async () => ok(await fn()) })

export const useClientes = catalogo('clientes', () =>
  supabase.from('cliente').select('id, razon_social, no_domiciliado').order('razon_social'))
export const useMarcas = catalogo('marcas', () =>
  supabase.from('marca').select('id, cliente_id, nombre').order('nombre'))
export const useServicios = catalogo('servicios', () =>
  supabase.from('servicio').select('id, nombre, modalidad, naturaleza, categoria:categoria_id(nombre)')
    .eq('activo', true).order('nombre'))
export const useEquipos = catalogo('equipos', () =>
  supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'))
export const usePersonas = catalogo('personas', () =>
  supabase.from('persona').select('id, nombre').eq('activo', true).order('nombre'))
export const usePlantillas = catalogo('plantillas', () =>
  supabase.from('plantilla_pago').select('id, nombre').order('id'))
export const useCuentas = catalogo('cuentas', () =>
  supabase.from('cuenta_bancaria').select('id, nombre, moneda, es_detraccion').eq('activo', true).order('nombre'))
export const useEmpresas = catalogo('empresas', () =>
  supabase.from('empresa').select('id, nombre').order('id'))
export const useSubAreas = catalogo('sub_areas', () =>
  supabase.from('sub_area').select('id, nombre, grupo').order('nombre'))
export const useConfig = catalogo('config', () => supabase.from('config').select('*').single())
