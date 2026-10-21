import { useState } from 'react'
import { useSesion } from '../lib/sesion'
import { DEV_AUTH } from '../lib/supabase'
import { ROLES } from '../lib/estados'
import { Boton, Campo, Input, MensajeError } from '../components/ui'

export default function Login() {
  const { entrar, entrarDev, recuperarClave } = useSesion()
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [enviado, setEnviado] = useState(false)

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-s1 p-6">
        <h1 className="text-lg font-semibold">Manya ERP</h1>
        <p className="mb-5 text-sm text-t2">Ingresa con tu cuenta</p>
        {DEV_AUTH ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-t3">Entorno local: elige un rol de prueba.</p>
            {Object.entries(ROLES).map(([rol, label]) => (
              <Boton key={rol} onClick={() => entrarDev(rol).catch(setError)}>{label}</Boton>
            ))}
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); entrar(email, clave).catch(setError) }}>
            <Campo label="Correo"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Campo>
            <Campo label="Contraseña"><Input type="password" value={clave} onChange={(e) => setClave(e.target.value)} required /></Campo>
            <Boton variante="primario" type="submit">Entrar</Boton>
            <Boton variante="fantasma" type="button" disabled={!email}
              onClick={() => recuperarClave(email).then(() => setEnviado(true)).catch(setError)}>
              Olvidé mi contraseña
            </Boton>
            {enviado && <p className="text-xs text-t2">Te enviamos un correo para crear una nueva contraseña.</p>}
          </form>
        )}
        <div className="mt-3"><MensajeError error={error} /></div>
      </div>
    </div>
  )
}
