import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * Vite config for the demo-display frontend SPA.
 *
 * Build output goes to `../dist-frontend/` (sibling of the server's
 * `dist/`), which the demo-display server serves as static files at
 * `/` on the same port as the SSE stream.
 *
 * For dev workflow, the dev server proxies `/events` and `/healthz`
 * to the demo-display server on port 7777 so the SPA can be edited
 * with HMR while the SSE stream stays live.
 */
const frontendDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: frontendDir,
  plugins: [react()],
  build: {
    outDir: '../dist-frontend',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/events': {
        target: 'http://127.0.0.1:7777',
        changeOrigin: true,
        // SSE: don't buffer; keep the connection open.
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Accept', 'text/event-stream');
          });
        },
      },
      '/healthz': 'http://127.0.0.1:7777',
    },
  },
});
