import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
    // three is the only heavy dependency; keeping it in its own chunk means
    // the plain résumé path in index.html is never blocked behind it.
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
