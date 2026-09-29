/**
 * Load `.env` (if present) into process.env without printing anything. Existing environment variables win.
 * Done in code rather than with `--env-file-if-exists`, because `node --watch` crashes when that file is absent.
 */
export function loadDotEnv(path = '.env'): boolean {
  try {
    process.loadEnvFile(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

export interface ServerEnv {
  port: number;
  /** allowed browser origins: APP_ORIGIN (comma-separated) + same-origin */
  allowedOrigins: string[];
  /** the API key; pass it to the Anthropic client only — never log, print or return it */
  apiKey: string | null;
  /** model id from CLAUDE_MODEL; there is deliberately no default slug */
  model: string | null;
}

export function readServerEnv(env: NodeJS.ProcessEnv): ServerEnv {
  const port = Number(env.PORT ?? 8787);
  const dev = (env.APP_ORIGIN ?? 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    port,
    allowedOrigins: [...dev, `http://127.0.0.1:${port}`, `http://localhost:${port}`],
    apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: env.CLAUDE_MODEL?.trim() || null,
  };
}
