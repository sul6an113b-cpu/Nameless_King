import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local-only: bind 127.0.0.1; /api is proxied to the copilot server (which checks Host, so changeOrigin: true).
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2023', sourcemap: true },
});
