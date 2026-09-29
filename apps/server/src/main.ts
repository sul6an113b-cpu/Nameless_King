/**
 * Entry point: `node apps/server/src/main.ts` (Node type stripping, no build step). Loads `.env` if present.
 * Binds 127.0.0.1 only. Serves the built web app (apps/web/dist) when present, so `npm start` is one process.
 */
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { createAnthropicClient } from './copilot/client.ts';
import { createCopilotHandler } from './copilot/handler.ts';
import { loadDotEnv, readServerEnv } from './env.ts';
import { HOST, createServer } from './server.ts';

loadDotEnv();
const env = readServerEnv(process.env);

const copilot =
  env.apiKey && env.model ? createCopilotHandler({ client: createAnthropicClient(env.apiKey), model: env.model }) : null;

const app = createApp({
  port: env.port,
  allowedOrigins: env.allowedOrigins,
  hasKey: env.apiKey !== null,
  model: env.model,
  copilot,
  log: (line) => console.log(line),
});
app.use('/*', serveStatic({ root: 'apps/web/dist' }));

const status = copilot ? `ready (${env.model})` : env.apiKey ? 'disabled (no CLAUDE_MODEL)' : 'disabled (no API key in .env)';
createServer(app, env.port, (info) => {
  console.log(`LoopLab server on http://${HOST}:${info.port} — copilot ${status}`);
});
