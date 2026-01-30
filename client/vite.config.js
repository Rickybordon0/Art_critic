import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['art-expert-client-ricky.loca.lt', 'artcriticclient-production.up.railway.app', 'fondazionerossi.org']
  },
})
