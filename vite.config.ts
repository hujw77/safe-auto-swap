import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH || '/'
  const apiBaseUrl = env.VITE_API_BASE_URL

  return {
    base,
    plugins: [react(), basicSsl()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https: {},
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
      },
      proxy: apiBaseUrl
        ? undefined
        : {
            '/api': {
              target: 'http://localhost:8787',
              changeOrigin: true
            }
          }
    },
    preview: {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
      }
    }
  }
})
