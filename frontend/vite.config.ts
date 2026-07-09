import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Dev-only: the Vite dev server proxies /api to the separately-running FastAPI
// backend, so frontend code always calls same-origin /api/* — the same shape as
// production, where a single container serves the SPA and API together. This
// block never ships to clients; the built app uses relative /api paths.
// Override the backend target with VITE_API_PROXY when it isn't on localhost:8000.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.VITE_API_PROXY ?? "http://localhost:8000",
    },
  },
})
