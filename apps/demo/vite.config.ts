import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  server: {
    port: 3000,
    proxy: {
      '/convergence-api': {
        target: 'https://convergence2026-token-api.cldev.cloud',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/convergence-api/, ''),
      },
    },
  },
})
