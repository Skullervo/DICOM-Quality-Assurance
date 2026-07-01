import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      '/Laadunhallinta/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
})
