import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
import { signRequest } from '@worldcoin/idkit-server'

/**
 * Vite plugin that adds a POST /api/rp-signature endpoint.
 * signRequest runs in the Vite Node.js process (server-side),
 * so the signing key never reaches the browser bundle.
 */
function worldIdSigningPlugin(): Plugin {
  return {
    name: 'world-id-signing',
    configureServer(server) {
      server.middlewares.use('/api/rp-signature', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        const signingKey = process.env.WORLD_ID_SIGNING_KEY
        if (!signingKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'WORLD_ID_SIGNING_KEY not configured on server' }))
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => { body += chunk.toString() })
        req.on('end', () => {
          try {
            const { action } = JSON.parse(body)
            const { sig, nonce, createdAt, expiresAt } = signRequest(action, signingKey)

            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({
              sig,
              nonce,
              created_at: createdAt,
              expires_at: expiresAt,
            }))
          } catch (err) {
            console.error('RP signature error:', err)
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to generate RP signature' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load ALL env vars (empty prefix = include non-VITE_ vars like WORLD_ID_SIGNING_KEY)
  const env = loadEnv(mode, process.cwd(), '')
  // Make them available to server plugins via process.env
  Object.assign(process.env, env)

  return {
    plugins: [react(), tailwindcss(), worldIdSigningPlugin()],
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
  }
})
