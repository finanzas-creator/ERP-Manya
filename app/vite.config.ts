import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { SignJWT } from 'jose'

// Solo en desarrollo local: emite tokens de prueba por rol, firmados con el mismo
// secreto que PostgREST (db/local/postgrest.conf). No existe en el build de producción.
const USUARIOS_DEV: Record<string, string> = {
  admin: '00000000-0000-0000-0000-00000000d001',
  tesoreria: '00000000-0000-0000-0000-00000000d002',
  ceo: '00000000-0000-0000-0000-00000000d003',
}

function tokensDev(secreto: string): Plugin {
  return {
    name: 'tokens-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/dev/token', async (req, res) => {
        const rol = new URL(req.url ?? '', 'http://x').searchParams.get('rol') ?? ''
        const sub = USUARIOS_DEV[rol]
        if (!sub) { res.statusCode = 400; res.end('rol inválido'); return }
        const token = await new SignJWT({ role: 'authenticated', sub })
          .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('12h')
          .sign(new TextEncoder().encode(secreto))
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ token }))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), tokensDev(env.DEV_JWT_SECRET ?? '')],
    server: {
      host: true,
      port: 5173,
      proxy: { '/rest/v1': { target: 'http://127.0.0.1:3001', rewrite: (p) => p.replace(/^\/rest\/v1/, '') } },
    },
  }
})
