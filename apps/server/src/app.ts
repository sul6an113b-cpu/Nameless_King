/**
 * HTTP app (owner: copilot from Phase 2). Phase-1 scaffold: host/origin guards, CORS, health, copilot placeholder.
 * The Anthropic key never leaves this process and is never logged.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';

export interface AppConfig {
  port: number;
  /** exact browser origins allowed to call /api (dev Vite origin + same-origin) */
  allowedOrigins: string[];
  hasKey: boolean;
  model: string | null;
}

export function createApp(cfg: AppConfig): Hono {
  const app = new Hono();
  const okHosts = new Set([`127.0.0.1:${cfg.port}`, `localhost:${cfg.port}`]);

  // Reject foreign Host (DNS rebinding) and foreign Origin (CSRF) before CORS; CORS alone only limits reads.
  app.use('/api/*', async (c, next) => {
    const host = c.req.header('host');
    if (host !== undefined && !okHosts.has(host)) return c.json({ ok: false, error: 'forbidden host' }, 403);
    const origin = c.req.header('origin');
    if (origin !== undefined && !cfg.allowedOrigins.includes(origin))
      return c.json({ ok: false, error: 'forbidden origin' }, 403);
    await next();
  });
  app.use('/api/*', cors({ origin: cfg.allowedOrigins, allowMethods: ['GET', 'POST'], allowHeaders: ['Content-Type'] }));

  app.get('/api/health', (c) => c.json({ ok: true, copilot: cfg.hasKey ? 'ready' : 'no-key', model: cfg.model }));

  app.post('/api/copilot', bodyLimit({ maxSize: 2 * 1024 * 1024 }), (c) =>
    c.json(
      {
        ok: false,
        error: { code: 'not-implemented', message: 'The copilot arrives in Phase 2.' },
        trace: [],
        usage: [],
      },
      501,
    ),
  );

  return app;
}
