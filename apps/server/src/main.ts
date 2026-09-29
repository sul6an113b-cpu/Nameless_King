/**
 * Entry point: `node apps/server/src/main.ts` (Node type stripping, no build step). Loads `.env` if present.
 * Binds 127.0.0.1 only. Serves the built web app (apps/web/dist) when present, so `npm start` is one process.
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { loadDotEnv } from './env.ts';

loadDotEnv();

const HOST = '127.0.0.1';
const port = Number(process.env.PORT ?? 8787);
const sameOrigin = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
const devOrigins = (process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173,http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

const app = createApp({
  port,
  allowedOrigins: [...devOrigins, ...sameOrigin],
  hasKey,
  model: process.env.CLAUDE_MODEL ?? null,
});
app.use('/*', serveStatic({ root: 'apps/web/dist' }));

serve({ fetch: app.fetch, port, hostname: HOST }, (info) => {
  console.log(`LoopLab server on http://${HOST}:${info.port} — copilot ${hasKey ? 'ready' : 'disabled (no ANTHROPIC_API_KEY)'}`);
});
