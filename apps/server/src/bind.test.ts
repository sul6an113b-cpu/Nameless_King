/** Acceptance criterion 10: the server binds the loopback interface only. */
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { createApp } from './app.ts';
import { HOST, createServer } from './server.ts';

describe('createServer', () => {
  it('listens on 127.0.0.1 only and serves the API there', async () => {
    let app: Hono | undefined;
    const server = createServer({ fetch: (r) => (app ? app.fetch(r) : new Response('starting', { status: 503 })) }, 0);
    try {
      await once(server, 'listening');
      const addr = server.address() as AddressInfo;
      expect(HOST).toBe('127.0.0.1');
      expect(addr.address).toBe('127.0.0.1');
      expect(addr.family).toBe('IPv4');
      app = createApp({ port: addr.port, allowedOrigins: [], hasKey: false, model: null });
      const res = await fetch(`http://127.0.0.1:${addr.port}/api/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, copilot: 'no-key', model: null });
    } finally {
      server.close();
    }
  });
});
