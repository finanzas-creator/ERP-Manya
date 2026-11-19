import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEV_AUTH, ok, supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { ROLES } from '../lib/estados'
import { ENUMS } from '../lib/db'
import { Boton, Campo, Card, Estado, Input, MensajeError, Modal, Nota, Select, Tabla, Titulo } from '../components/ui'
import { Icono } from '../components/iconos'

type Usuario = { id: string; email: string; nombre: string | null; rol: keyof typeof ROLES; activo: boolean
  estado: 'invitado' | 'activo' | 'desactivado'; invitado_en: string | null; ultimo_ingreso: string | null }
type Envio = { enviado: 'invitacion' | 'recuperacion'; email: string }

const QUE_HACE: Record<keyof typeof ROLES, string> = {
  admin: 'Todo el ERP, Configuración y Usuarios',
  tesoreria: 'Operación, análisis, costos y revisión de datos',
  ceo: 'Solo lectura: Resumen y Estado de resultados',
}

const cuando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

/** Invitar y reenviar acceso pasan por la función del servidor (D-26): la llave de Auth no está en el navegador. */
async function funcionUsuarios(cuerpo: Record<string, unknown>): Promise<Envio> {
  if (DEV_AUTH) throw new Error('En el entorno local no se envían correos.')
  const { data, error } = await supabase.functions.invoke('usuarios', { body: cuerpo })
  if (error) {
    const r = (error as { context?: Response }).context
    const j = r && typeof r.json === 'function' ? await r.json().catch(() => null) : null
    throw new Error(j?.error ?? 'No se pudo completar. Revisa tu conexión e intenta de nuevo.')
  }
  return data as Envio
}

const mensajeEnvio = (r: Envio) => r.enviado === 'invitacion'
  ? `Invitación enviada a ${r.email}. Debe abrir el correo dentro de las 24 horas.`
  : `Se envió a ${r.email} un enlace para crear una contraseña nueva (vence en 24 horas).`

/** R-83: quién entra al ERP y con qué rol. Solo el Administrador ve esta pantalla. */
export default function Usuarios() {
  const qc = useQueryClient()
  const { usuario: yo } = useSesion()
  const [invitar, setInvitar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const lista = useQuery({ queryKey: ['usuarios'], queryFn: async () => ok(await supabase.rpc('listar_usuarios')) as unknown as Usuario[] })
  const cambiar = useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: { rol?: Usuario['rol']; activo?: boolean } }) =>
      ok(await supabase.from('usuario').update(cambios).eq('id', id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuarios'] }),
  })
  const reenviar = useMutation({
    mutationFn: async (u: Usuario) => funcionUsuarios({ accion: 'reenviar', id: u.id }),
    onSuccess: (r) => { setAviso(mensajeEnvio(r)); qc.invalidateQueries({ queryKey: ['usuarios'] }) },
  })
  const error = cambiar.error ?? reenviar.error

  return (
    <>
      <Titulo accion={<Boton variante="primario" onClick={() => { setAviso(null); setInvitar(true) }}><Icono nombre="mas" />Invitar usuario</Boton>}>Usuarios</Titulo>
      {aviso && <p className="mb-3 rounded-lg bg-good-bg px-3 py-2 text-sm text-good">{aviso}</p>}
      <div className="mb-3"><MensajeError error={error} /></div>
      <Card titulo={`${lista.data?.filter((u) => u.activo).length ?? 0} con acceso`}>
        <Tabla<Usuario> filas={lista.data} clave={(u) => u.id} vacio="Sin usuarios" columnas={[
          { titulo: 'Persona', celda: (u) => <>
            <div className="font-medium">{u.nombre ?? u.email}{u.id === yo?.id && <span className="ml-1 text-xs font-normal text-t3">(tú)</span>}</div>
            {u.nombre && <div className="text-xs text-t3">{u.email}</div>}
          </> },
          { titulo: 'Rol', celda: (u) => (
            <Select value={u.rol} disabled={!u.activo || cambiar.isPending} aria-label={`Rol de ${u.email}`}
              onChange={(e) => cambiar.mutate({ id: u.id, cambios: { rol: e.target.value as Usuario['rol'] } })}>
              {(ENUMS.rol as readonly Usuario['rol'][]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </Select>) },
          { titulo: 'Estado', celda: (u) => <>
            <Estado valor={u.estado} />
            <div className="mt-0.5 text-xs whitespace-nowrap text-t3">
              {u.estado === 'invitado' && u.invitado_en ? `invitado ${cuando(u.invitado_en)}` : u.estado === 'activo' && u.ultimo_ingreso ? `último ingreso ${cuando(u.ultimo_ingreso)}` : ''}
            </div>
          </> },
          { titulo: '', celda: (u) => (
            <div className="flex justify-end gap-1">
              {u.activo && <Boton variante="fantasma" disabled={reenviar.isPending} onClick={() => { setAviso(null); reenviar.mutate(u) }}>
                {u.estado === 'invitado' ? 'Reenviar invitación' : 'Enviar enlace de contraseña'}</Boton>}
              <Boton variante={u.activo ? 'peligro' : 'normal'} disabled={cambiar.isPending}
                onClick={() => cambiar.mutate({ id: u.id, cambios: { activo: !u.activo } })}>{u.activo ? 'Desactivar' : 'Reactivar'}</Boton>
            </div>) },
        ]} />
        <Nota>
          Roles: {Object.entries(QUE_HACE).map(([r, t]) => `${ROLES[r as Usuario['rol']]} — ${t}`).join(' · ')}.
          Nadie se borra: quien está desactivado no ve ningún dato y se puede reactivar. Siempre debe quedar un Administrador activo (R-83).
          Los enlaces de los correos vencen a las 24 horas; si no llegan, que revisen spam y reenvía.
        </Nota>
      </Card>
      {invitar && <InvitarModal onCerrar={() => setInvitar(false)} onListo={(r) => { setInvitar(false); setAviso(mensajeEnvio(r)) }} />}
    </>
  )
}

function InvitarModal({ onCerrar, onListo }: { onCerrar: () => void; onListo: (r: Envio) => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ email: '', nombre: '', rol: 'tesoreria' })
  const enviar = useMutation({
    mutationFn: async () => funcionUsuarios({ accion: 'invitar', email: f.email, nombre: f.nombre, rol: f.rol }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['usuarios'] }); onListo(r) },
  })
  return (
    <Modal titulo="Invitar usuario" onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <Campo label="Correo de la empresa"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus /></Campo>
        <Campo label="Nombre"><Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Opcional" /></Campo>
        <Campo label="Rol">
          <Select value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
            {(ENUMS.rol as readonly Usuario['rol'][]).map((r) => <option key={r} value={r}>{ROLES[r]} — {QUE_HACE[r]}</option>)}
          </Select>
        </Campo>
        <p className="text-xs text-t3">Le llega un correo para crear su contraseña. El enlace vence a las 24 horas.</p>
      </div>
      <div className="mt-3"><MensajeError error={enviar.error} /></div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!f.email.trim() || enviar.isPending} onClick={() => enviar.mutate()}>{enviar.isPending ? 'Enviando…' : 'Enviar invitación'}</Boton>
      </div>
    </Modal>
  )
}
