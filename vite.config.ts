import { defineConfig, loadEnv, type Plugin, type ViteDevServer, type PreviewServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * /api/chat and /api/spotify, in development and preview.
 *
 * In production each path is a Vercel function (api/chat.ts, api/spotify.ts). Vite knows
 * nothing about api/, so without this the figure in the field would have no
 * voice on localhost and every answer would be the "lost my voice" fallback.
 * This mounts the same `handleChat` at the same path, translating Node's
 * request and response into the web-standard pair the handler is written
 * against — and streaming the body through chunk by chunk, so the reply types
 * out here exactly as it does deployed.
 *
 * The dev server loads the handler through Vite itself (`ssrLoadModule`), so
 * editing server/persona.ts takes effect on the next question with no restart.
 * The preview server has no module runner, so it imports the file directly —
 * which works because server/ is plain TypeScript and Node 22 runs it.
 *
 * The key comes from `.env` (gitignored): Vite only hands `VITE_`-prefixed
 * variables to the client, and this is the server, so the whole file is
 * loaded into `process.env` for the handler — without overriding anything
 * already set in the shell.
 */
function chatApi(): Plugin {
  type Handler = (req: Request) => Promise<Response>
  const mount = (
    server: ViteDevServer | PreviewServer,
    path: string,
    load: () => Promise<Handler>,
  ) => {
    server.middlewares.use(path, async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const handle = await load()
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v)
          else if (Array.isArray(v)) headers.set(k, v.join(', '))
        }
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const method = req.method ?? 'GET'
        const request = new Request(`http://localhost${req.url ?? '/'}`, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks),
        })
        const response = await handle(request)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        if (!response.body) return res.end()
        const reader = response.body.getReader()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          res.write(value)
        }
        res.end()
      } catch (err) {
        console.error('[api]', path, err)
        if (!res.headersSent) res.statusCode = 500
        res.end()
      }
    })
  }
  return {
    name: 'elliot-chat-api',
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v
    },
    configureServer(server) {
      const dev = (file: string, name: string) => async () =>
        (await server.ssrLoadModule(file))[name] as Handler
      mount(server, '/api/chat', dev('/server/chat.ts', 'handleChat'))
      mount(server, '/api/spotify', dev('/server/spotify.ts', 'handleSpotify'))
    },
    configurePreviewServer(server) {
      mount(server, '/api/chat', async () => (await import('./server/chat')).handleChat)
      mount(server, '/api/spotify', async () => (await import('./server/spotify')).handleSpotify)
    },
  }
}

export default defineConfig({
  plugins: [chatApi()],
  build: {
    target: 'es2022',
    // three is the only heavy dependency; keeping it in its own chunk means
    // the card in index.html is never blocked behind it.
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          return undefined
        },
      },
    },
  },
  server: { host: true },
})
