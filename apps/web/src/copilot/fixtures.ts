/** Test fixtures for the copilot panel (used only by *.test.ts[x]). */
import { addLink, addVariable, createEmptyModel, type CopilotResponse, type Model, type Patch } from '@looplab/core';

export function sampleModel(): Model {
  let m = createEmptyModel('Rework', { id: 'm_web', now: '2026-09-29T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'Work Remaining' });
  m = addVariable(m, { id: 'v_b', name: 'Rework' });
  m = addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b', polarity: '+' });
  return m;
}

export const samplePatch: Patch = {
  id: 'p_1',
  title: 'Add schedule pressure',
  rationale: 'Hypothesis: pressure drives errors.',
  ops: [
    {
      opId: 'op1',
      op: 'add',
      entity: 'variable',
      value: { id: 'v_p', name: 'Schedule Pressure', kind: 'variable', equation: '', units: '', doc: '' },
    },
    {
      opId: 'op2',
      op: 'add',
      entity: 'link',
      value: { id: 'l_pb', from: 'v_p', to: 'v_b', polarity: '+', delay: true, note: 'haste', confidence: 'medium' },
    },
    { opId: 'op3', op: 'update', entity: 'link', id: 'l_ab', changes: { polarity: '-' } },
  ],
};

export const usage = [
  { call: 1, inputTokens: 1200, outputTokens: 80, cacheCreationInputTokens: 4000, cacheReadInputTokens: 0 },
  { call: 2, inputTokens: 300, outputTokens: 150, cacheCreationInputTokens: 0, cacheReadInputTokens: 5200 },
];

export const patchResponse: CopilotResponse = {
  ok: true,
  output: { kind: 'patch', patch: samplePatch, hypotheses: ['Pressure raises the error rate'] },
  trace: [
    { name: 'get_model_summary', input: {}, ok: true, summary: '2 variables', ms: 3 },
    { name: 'propose_patch', input: {}, ok: true, summary: 'patch with 3 ops', ms: 0 },
  ],
  usage,
  model: 'claude-test',
};

/** Stub global fetch with fixed JSON responses (in order); returns the parsed request bodies. */
export function stubFetch(responses: (CopilotResponse | Error)[]): { bodies: unknown[]; restore: () => void } {
  const original = globalThis.fetch;
  const bodies: unknown[] = [];
  let i = 0;
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string));
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r === undefined || r instanceof Error) return Promise.reject(r ?? new Error('no response'));
    return Promise.resolve(Response.json(r));
  }) as typeof fetch;
  return { bodies, restore: () => (globalThis.fetch = original) };
}
