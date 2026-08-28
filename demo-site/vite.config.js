import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// No proxy and no server block: this build has no backend. Everything it shows
// is a recorded run in src/fixtures, so it deploys as pure static files.
export default defineConfig({
  plugins: [react()],
  base: './',
})
