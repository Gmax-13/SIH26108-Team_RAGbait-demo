import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const here = path.dirname(fileURLToPath(import.meta.url))

// The demo IS the dashboard: it builds ../frontend/src as-is and swaps only the
// module that needs a backend — `api.js`, answered from recorded fixtures in
// public/fixtures.
// No proxy and no server: this deploys as pure static files.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: [
      // `./api` from App.jsx, `../api` from the components.
      { find: /^\.{1,2}\/api(\.js)?$/, replacement: path.resolve(here, 'src/api.demo.js') },
      { find: '@dashboard', replacement: path.resolve(here, '../frontend/src') },
    ],
    // Resolve these from demo-site/node_modules even when imported by files in
    // ../frontend, whose node_modules is not installed on a demo-only deploy.
    dedupe: ['react', 'react-dom', 'react-force-graph-2d'],
  },
  server: { fs: { allow: [path.resolve(here, '..')] } },
})
