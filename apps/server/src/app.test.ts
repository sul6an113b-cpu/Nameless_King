import { describe, expect, it } from 'vitest';
import { addVariable, createEmptyModel, type CopilotRequest, type CopilotResponse } from '@looplab/core';
import { MAX_BODY_BYTES, createApp } from './app.ts';
import type { CopilotHandler } from './copilot/handler.ts';

const app = createApp({
  port: 8787,
  allowedOrigins: ['http://127.0.0.1:5173'],
  hasKey: false,
  model: null,
});

const HOST = { host: '127.0.0.1:8787' };

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

describe('/api/copilot', () => {
  const model = addVariable(createEmptyModel('M', { id: 'm_1', now: '2026-09-29T00:00:00.000Z' }), { id: 'v_a', name: 'A' });
  const body: CopilotRequest = { mode: 'critique', stage: 'map', model, messages: [{ role: 'user', text: 'secret-body-text' }] };
  const answer: CopilotResponse = {
    ok: true,
    output: { kind: 'answer', markdown: 'fine', findings: [], hypotheses: [] },
    trace: [{ name: 'get_health', input: {}, ok: true, summary: '0 items', ms: 1 }],
    usage: [{ call: 1, inputTokens: 1, outputTokens: 1, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }],
    model: 'claude-test',
  };

  function withCopilot() {
    const calls: CopilotRequest[] = [];
    const logs: string[] = [];
    const copilot: CopilotHandler = (r) => {
      calls.push(r);
      return Promise.resolve(answer);
    };
    const a = createApp({ port: 8787, allowedOrigins: ['http://127.0.0.1:5173'], hasKey: true, model: 'claude-test', copilot, log: (l) => logs.push(l) });
    return { a, calls, logs };
  }
  const post = (a: ReturnType<typeof createApp>, payload: string, headers: Record<string, string> = {}) =>
    a.request('/api/copilot', { method: 'POST', body: payload, headers: { ...HOST, 'content-type': 'application/json', ...headers } });

  it('runs the handler on a validated request and logs no body, header or key', async () => {
    const { a, calls, logs } = withCopilot();
    const res = await post(a, JSON.stringify(body), { origin: 'http://127.0.0.1:5173', 'x-api-key': 'sk-ant-should-not-log' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(answer);
    expect(calls[0]?.model.variables[0]?.name).toBe('A');
    expect(logs).toEqual([expect.stringMatching(/^copilot critique: answer · 1 API call\(s\) · tools get_health · \d+ ms$/)]);
    expect(logs.join('')).not.toMatch(/secret-body-text|sk-ant/);
  });

  it('health reports ready / no-model', async () => {
    const { a } = withCopilot();
    expect(await (await a.request('/api/health', { headers: HOST })).json()).toEqual({ ok: true, copilot: 'ready', model: 'claude-test' });
    const noModel = createApp({ port: 8787, allowedOrigins: [], hasKey: true, model: null });
    expect(await (await noModel.request('/api/health', { headers: HOST })).json()).toMatchObject({ copilot: 'no-model' });
  });

  it('without a key the copilot answers 503 no-key and never echoes the key', async () => {
    const res = await post(app, JSON.stringify(body));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'no-key' }, trace: [], usage: [] });
  });

  it('rejects invalid JSON and schema-invalid requests with 400', async () => {
    const { a, calls } = withCopilot();
    expect((await post(a, '{not json')).status).toBe(400);
    const res = await post(a, JSON.stringify({ ...body, mode: 'jailbreak' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(calls).toHaveLength(0);
  });

  it('enforces the 2 MB body limit', async () => {
    const { a, calls } = withCopilot();
    const big = JSON.stringify({ ...body, pad: 'x'.repeat(MAX_BODY_BYTES) });
    const res = await post(a, big, { 'content-length': String(big.length) });
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('CORS: another origin is rejected before the handler runs (POST and preflight)', async () => {
    const { a, calls } = withCopilot();
    expect((await post(a, JSON.stringify(body), { origin: 'http://evil.example' })).status).toBe(403);
    const preflight = await a.request('/api/copilot', {
      method: 'OPTIONS',
      headers: { ...HOST, origin: 'http://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
