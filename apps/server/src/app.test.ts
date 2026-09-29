import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

const app = createApp({
  port: 8787,
  allowedOrigins: ['http://127.0.0.1:5173'],
  hasKey: false,
  model: null,
});

describe('server scaffold', () => {
  it('reports health without exposing secrets', async () => {
    const res = await app.request('/api/health', { headers: { host: '127.0.0.1:8787' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, copilot: 'no-key', model: null });
  });

  it('rejects foreign hosts (DNS rebinding) and foreign origins', async () => {
    expect((await app.request('/api/health', { headers: { host: 'evil.example:8787' } })).status).toBe(403);
    const res = await app.request('/api/health', {
      headers: { host: '127.0.0.1:8787', origin: 'http://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('allows the app origin via CORS', async () => {
    const res = await app.request('/api/health', {
      headers: { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:5173' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
  });
});
