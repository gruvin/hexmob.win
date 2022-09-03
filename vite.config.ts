import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    process.env.MODE !== 'production'
    ? react({
        jsxRuntime: 'classic',
      })
    : react()
  ]
})
