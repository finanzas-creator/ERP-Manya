import { useState } from 'react'
import { useSesion } from '../lib/sesion'
import { Boton, Campo, Input, MensajeError } from '../components/ui'

// Primera entrada desde la invitación (o recuperación): la persona elige su contraseña.
export default function CrearClave() {
  const { crearClave } = useSesion()
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<unknown>(null)

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-s1 p-6">
        <h1 className="text-lg font-semibold">Manya ERP</h1>
        <p className="mb-5 text-sm text-t2">Crea tu contraseña para entrar</p>
        <form className="flex flex-col gap-3" onSubmit={(e) => {
          e.preventDefault()
          if (clave !== repetir) return setError(new Error('Las contraseñas no coinciden'))
          crearClave(clave).catch(setError)
        }}>
          <Campo label="Contraseña (mínimo 8 caracteres)">
            <Input type="password" minLength={8} value={clave} onChange={(e) => setClave(e.target.value)} required />
          </Campo>
          <Campo label="Repite la contraseña">
            <Input type="password" minLength={8} value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
          </Campo>
          <Boton variante="primario" type="submit">Guardar y entrar</Boton>
        </form>
        <div className="mt-3"><MensajeError error={error} /></div>
      </div>
    </div>
  )
}
