/**
 * One SDK-level check (RESEARCH §Anthropic 5.2): the real @anthropic-ai/sdk client over a fake fetch — no network.
 * Verifies that our request body serialises as intended (top-level cache_control, strict tools, effort) and that
 * API errors map to typed copilot errors.
 */
import { describe, expect, it } from 'vitest';
import { addVariable, createEmptyModel, type CopilotRequest } from '@looplab/core';
import { createAnthropicClient } from './client.ts';
import { createCopilotHandler } from './handler.ts';
import { message, toolUse } from './testing.ts';

const model = addVariable(createEmptyModel('M', { id: 'm_1', now: '2026-09-29T00:00:00.000Z' }), {
  id: 'v_a',
  name: 'A',
});
const request: CopilotRequest = { mode: 'explain', stage: 'map', model, messages: [{ role: 'user', text: 'explain' }] };

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeFetch(respond: () => Response): { fetch: typeof fetch; captured: Captured[] } {
  const captured: Captured[] = [];
  const f = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    captured.push({
      url,
      headers: new Headers(init?.headers),
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    });
    return Promise.resolve(respond());
  };
  return { fetch: f, captured };
}

describe('real SDK client over a fake fetch', () => {
  it('serialises the copilot request and parses the answer', async () => {
    const answer = message({ content: [toolUse('respond', { markdown: 'ok', findings: [], hypotheses: [] })] }, 1);
    const { fetch, captured } = fakeFetch(() => Response.json(answer, { headers: { 'request-id': 'req_test' } }));
    const handle = createCopilotHandler({
      client: createAnthropicClient('sk-test-not-real', { fetch, maxRetries: 0 }),
      model: 'claude-test',
    });
    const res = await handle(request);
    expect(res.ok && res.output.kind).toBe('answer');
    expect(captured).toHaveLength(1);
    const [call] = captured;
    expect(call?.url).toMatch(/\/v1\/messages$/);
    expect(call?.headers.get('x-api-key')).toBe('sk-test-not-real');
    expect(call?.headers.get('authorization')).toBeNull();
    expect(call?.body).toMatchObject({
      model: 'claude-test',
      max_tokens: 16000,
      cache_control: { type: 'ephemeral' },
      output_config: { effort: 'medium' },
      tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    });
    const tools = call?.body.tools as {
      name: string;
      strict: boolean;
      input_schema: { additionalProperties: boolean };
    }[];
    expect(tools.every((t) => t.strict && t.input_schema.additionalProperties === false)).toBe(true);
  });

  it('maps a 529 overloaded response to an api-error with type and request id', async () => {
    const { fetch } = fakeFetch(() =>
      Response.json(
        { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' }, request_id: 'req_529' },
        { status: 529, headers: { 'request-id': 'req_529' } },
      ),
    );
    const handle = createCopilotHandler({
      client: createAnthropicClient('sk-test-not-real', { fetch, maxRetries: 0 }),
      model: 'claude-test',
    });
    const res = await handle(request);
    if (res.ok) throw new Error('expected an error');
    expect(res.error).toMatchObject({
      code: 'api-error',
      detail: { status: 529, type: 'overloaded_error', requestId: 'req_529' },
    });
    expect(res.error.message).toMatch(/529.*overloaded_error.*Overloaded/);
    expect(JSON.stringify(res)).not.toContain('sk-test-not-real');
  });
});
