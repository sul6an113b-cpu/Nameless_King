import { describe, expect, it } from 'vitest';
import { readServerEnv } from './env.ts';

describe('readServerEnv', () => {
  it('defaults: port 8787, dev + same-origin origins, no key, no model (never a guessed slug)', () => {
    expect(readServerEnv({})).toEqual({
      port: 8787,
      allowedOrigins: [
        'http://127.0.0.1:5173',
        'http://localhost:5173',
        'http://127.0.0.1:8787',
        'http://localhost:8787',
      ],
      apiKey: null,
      model: null,
    });
  });

  it('reads PORT, APP_ORIGIN (comma-separated), CLAUDE_MODEL; blank values count as absent', () => {
    const env = readServerEnv({
      PORT: '9000',
      APP_ORIGIN: ' http://a:1 , ,http://b:2',
      CLAUDE_MODEL: ' m-1 ',
      ANTHROPIC_API_KEY: '   ',
    });
    expect(env).toEqual({
      port: 9000,
      allowedOrigins: ['http://a:1', 'http://b:2', 'http://127.0.0.1:9000', 'http://localhost:9000'],
      apiKey: null,
      model: 'm-1',
    });
  });
});
