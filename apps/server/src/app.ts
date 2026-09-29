/**
 * HTTP app (owner: copilot). Host/Origin guards, CORS locked to the app origins, `/api/health`, `/api/copilot`.
 * The Anthropic key never leaves this process; logs carry mode, outcome, tool names and timing only — never headers,
 * bodies or the key.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { CopilotRequestSchema, type CopilotError, type CopilotResponse } from '@looplab/core';
import type { CopilotHandler } from './copilot/handler.ts';

export const MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface AppConfig {
  port: number;
  /** exact browser origins allowed to call /api (dev Vite origin + same-origin) */
  allowedOrigins: string[];
  hasKey: boolean;
  model: string | null;
  /** the copilot tool loop; absent when there is no key or no CLAUDE_MODEL */
  copilot?: CopilotHandler | null;
  /** one line per copilot request (no headers, bodies or secrets) */
  log?: (line: string) => void;
}

const failure = (error: CopilotError): CopilotResponse => ({ ok: false, error, trace: [], usage: [] });

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
  app.use(
    '/api/*',
    cors({ origin: cfg.allowedOrigins, allowMethods: ['GET', 'POST'], allowHeaders: ['Content-Type'] }),
  );

  app.get('/api/health', (c) =>
    c.json({ ok: true, copilot: !cfg.hasKey ? 'no-key' : !cfg.model ? 'no-model' : 'ready', model: cfg.model }),
  );

  app.post(
    '/api/copilot',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(failure({ code: 'bad-request', message: 'The request body exceeds 2 MB.' }), 413),
    }),
    async (c) => {
      const copilot = cfg.copilot;
      if (!copilot) {
        const error: CopilotError = cfg.hasKey
          ? { code: 'no-model', message: 'Copilot disabled: set CLAUDE_MODEL in .env and restart the server.' }
          : { code: 'no-key', message: 'Copilot disabled: add ANTHROPIC_API_KEY to .env and restart the server.' };
        return c.json(failure(error), 503);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json(failure({ code: 'bad-request', message: 'The request body must be JSON.' }), 400);
      }
      const parsed = CopilotRequestSchema.safeParse(body);
      if (!parsed.success)
        return c.json(
          failure({
            code: 'bad-request',
            message: `Invalid copilot request:\n${z.prettifyError(parsed.error).slice(0, 2000)}`,
          }),
          400,
        );

      const t0 = Date.now();
      const res = await copilot(parsed.data, { signal: c.req.raw.signal });
      cfg.log?.(
        `copilot ${parsed.data.mode}: ${res.ok ? res.output.kind : `error ${res.error.code}`} · ${res.usage.length} API call(s) · ` +
          `tools ${res.trace.map((t) => t.name).join(',') || '-'} · ${Date.now() - t0} ms`,
      );
      return c.json(res, 200);
    },
  );

  return app;
}
