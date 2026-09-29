import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Local-only: bind 127.0.0.1; /api is proxied to the copilot server (which checks Host, so changeOrigin: true).
// LOOPLAB_API_PORT lets a second checkout run side by side (e.g. parallel agent worktrees); default 8787.
const apiPort = process.env.LOOPLAB_API_PORT ?? '8787';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
    },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  worker: { format: 'es' },
  build: { target: 'es2023', sourcemap: true },
});
