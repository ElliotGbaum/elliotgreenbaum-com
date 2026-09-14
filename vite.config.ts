import { defineConfig } from 'vite'
import { agentLayer } from './tools/agent-layer'

export default defineConfig({
  // the film in words, in the served HTML and at /llms.txt — see tools/agent-layer.ts
  plugins: [agentLayer()],
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
