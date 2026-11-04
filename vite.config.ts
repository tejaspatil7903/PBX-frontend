import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['pbx.terrixai.com', '.terrixai.com', 'localhost', '35.244.8.204'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ready': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          (proxy as any).on('error', (err: any) => {
            if (['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED'].includes(err?.code)) {
              return;
            }
            console.warn('[vite ws proxy error]', err);
          });
          (proxy as any).on('proxyReqWsError', (err: any) => {
            if (['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED'].includes(err?.code)) {
              return;
            }
            console.warn('[vite ws proxy socket error]', err);
          });
        },
      },
      '/ws-sip': {
        target: 'ws://127.0.0.1:5066',
        ws: true,
        changeOrigin: true,
        configure: (proxy, _options) => {
          (proxy as any).on('error', (err: any) => {
            if (['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED'].includes(err?.code)) {
              return;
            }
            console.warn('[vite ws-sip proxy error]', err);
          });
        },
      },
    },
  },
})
