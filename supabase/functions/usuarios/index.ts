// Invitaciones de usuarios (R-83, D-26). Corre en Supabase (Edge Function "usuarios"): solo aquí está
// la llave de servicio de Auth. Solo un Administrador activo puede llamarla; el rol y el estado se
// guardan con la sesión del propio Administrador, así la bitácora registra quién lo hizo (R-82).
//
// POST { accion: 'invitar', email, nombre?, rol }  → envía la invitación y registra su rol
// POST { accion: 'reenviar', id }                  → invitado: repite la invitación; activo: enlace de contraseña nueva

const BASE = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fallo = (mensaje: string, estado = 400) => responder({ error: mensaje }, estado)

type Llamada = { metodo?: string; cuerpo?: unknown; clave?: string; token?: string; prefer?: string }
async function api(ruta: string, { metodo = 'GET', cuerpo, clave = SERVICIO, token = SERVICIO, prefer }: Llamada = {}) {
  const headers: Record<string, string> = { apikey: clave, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  if (prefer) headers.Prefer = prefer
  const r = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
  const texto = await r.text()
  let datos: Record<string, unknown> | Record<string, unknown>[] | null = null
  try { datos = texto ? JSON.parse(texto) : null } catch { datos = { msg: texto } }
  return { ok: r.ok, estado: r.status, datos }
}
const mensaje = (d: unknown) => {
  const o = (d ?? {}) as Record<string, unknown>
  return String(o.msg ?? o.message ?? o.error_description ?? o.error ?? '')
}

// Los correos del servidor tienen un límite por hora (Auth): se explica en vez de un código.
function errorDeCorreo(estado: number, datos: unknown) {
  if (estado === 429) return fallo('Se alcanzó el límite de correos por hora del servidor. Intenta de nuevo en una hora.', 429)
  return fallo(`No se pudo enviar el correo: ${mensaje(datos) || estado}`, 502)
}

async function invitar(email: string, destino: string) {
  return await api(`/auth/v1/invite?redirect_to=${encodeURIComponent(destino)}`, { metodo: 'POST', cuerpo: { email } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fallo('Método no permitido', 405)

  // Quién llama: su sesión y su fila en usuario (R-80)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const quien = await api('/auth/v1/user', { clave: ANON, token })
  const quienId = String((quien.datos as Record<string, unknown> | null)?.id ?? '')
  if (!quien.ok || !UUID.test(quienId)) return fallo('Tu sesión venció: vuelve a entrar.', 401)
  const yo = await api(`/rest/v1/usuario?id=eq.${quienId}&select=rol,activo`)
  const fila = Array.isArray(yo.datos) ? yo.datos[0] : null
  if (!fila || fila.rol !== 'admin' || fila.activo !== true) return fallo('R-83: solo un Administrador gestiona usuarios.', 403)

  const p = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const destino = req.headers.get('Origin') ?? ''

  if (p.accion === 'invitar') {
    const email = String(p.email ?? '').trim().toLowerCase()
    const nombre = String(p.nombre ?? '').trim()
    const rol = String(p.rol ?? '')
    if (!CORREO.test(email)) return fallo('Escribe un correo válido.')
    // la base valida el rol (enum rol, R-80) antes de enviar el correo
    if (!rol || !(await api(`/rest/v1/usuario?select=id&limit=1&rol=eq.${encodeURIComponent(rol)}`)).ok) return fallo('Elige un rol.')
    const inv = await invitar(email, destino)
    if (inv.estado === 422) return fallo('Ese correo ya tiene una cuenta activa. Si no está en la lista, avisa a soporte.', 409)
    if (!inv.ok) return errorDeCorreo(inv.estado, inv.datos)
    const id = String((inv.datos as Record<string, unknown>).id ?? '')
    const registro = await api('/rest/v1/usuario?on_conflict=id', {
      metodo: 'POST', clave: ANON, token, prefer: 'resolution=merge-duplicates,return=minimal',
      cuerpo: { id, email, rol, activo: true, ...(nombre ? { nombre } : {}) },
    })
    if (!registro.ok) return fallo(`La invitación salió, pero no se pudo guardar el rol: ${mensaje(registro.datos)}`, 500)
    return responder({ enviado: 'invitacion', email })
  }

  if (p.accion === 'reenviar') {
    const id = String(p.id ?? '')
    if (!UUID.test(id)) return fallo('Usuario no válido.')
    const u = await api(`/rest/v1/usuario?id=eq.${id}&select=email,activo`)
    const usuario = Array.isArray(u.datos) ? u.datos[0] : null
    if (!usuario) return fallo('Ese usuario no existe.', 404)
    if (usuario.activo !== true) return fallo('Reactiva al usuario antes de enviarle el acceso.')
    const cuenta = await api(`/auth/v1/admin/users/${id}`)
    if (!cuenta.ok) return fallo('Ese usuario no tiene cuenta de acceso: invítalo de nuevo.', 404)
    const email = String((cuenta.datos as Record<string, unknown>).email ?? usuario.email)
    if (!(cuenta.datos as Record<string, unknown>).email_confirmed_at) {
      const inv = await invitar(email, destino)
      return inv.ok ? responder({ enviado: 'invitacion', email }) : errorDeCorreo(inv.estado, inv.datos)
    }
    const rec = await api(`/auth/v1/recover?redirect_to=${encodeURIComponent(destino)}`, {
      metodo: 'POST', clave: ANON, token: ANON, cuerpo: { email },
    })
    return rec.ok ? responder({ enviado: 'recuperacion', email }) : errorDeCorreo(rec.estado, rec.datos)
  }

  return fallo('Acción desconocida.')
})
