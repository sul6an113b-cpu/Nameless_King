import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CopilotResponse } from '@looplab/core';
import { useModelStore } from '../state/store.ts';
import { useCopilotStore } from './store.ts';
import { patchResponse, sampleModel, samplePatch, stubFetch } from './fixtures.ts';

let restore = () => {};
beforeEach(() => {
  useModelStore.getState().load(sampleModel());
  useCopilotStore.getState().reset();
});
afterEach(() => restore());

describe('useCopilotStore', () => {
  it('pending patch: every op starts pending; decideOp / acceptAll / rejectAll', () => {
    const s = useCopilotStore.getState();
    s.setPendingPatch(samplePatch);
    expect(useCopilotStore.getState().decisions).toEqual({ op1: 'pending', op2: 'pending', op3: 'pending' });
    s.decideOp('op2', 'reject');
    expect(useCopilotStore.getState().decisions.op2).toBe('reject');
    s.acceptAll();
    expect(Object.values(useCopilotStore.getState().decisions)).toEqual(['accept', 'accept', 'accept']);
    s.rejectAll();
    expect(Object.values(useCopilotStore.getState().decisions)).toEqual(['reject', 'reject', 'reject']);
  });

  it('no patch applies without accept: pending or rejected ops never reach the model', () => {
    const before = useModelStore.getState().model;
    const s = useCopilotStore.getState();
    s.setPendingPatch(samplePatch);
    expect(s.applyDecisions()).toBeNull();
    s.rejectAll();
    expect(useCopilotStore.getState().applyDecisions()).toBeNull();
    expect(useModelStore.getState().model).toBe(before);
    expect(useModelStore.getState().past).toHaveLength(0);
  });

  it('applies only accepted ops, as one undo step, tagged ai-proposed', () => {
    const s = useCopilotStore.getState();
    s.setPendingPatch(samplePatch);
    s.decideOp('op1', 'accept');
    s.decideOp('op3', 'accept');
    const r = useCopilotStore.getState().applyDecisions();
    expect(r?.applied).toEqual(['op1', 'op3']);
    const m = useModelStore.getState().model;
    expect(m.variables.find((v) => v.id === 'v_p')?.origin).toBe('ai-proposed');
    expect(m.links.find((l) => l.id === 'l_pb')).toBeUndefined();
    expect(m.links.find((l) => l.id === 'l_ab')?.polarity).toBe('-');
    expect(useCopilotStore.getState().pendingPatch).toBeNull();
    useModelStore.getState().undo();
    expect(useModelStore.getState().model.variables.map((v) => v.id)).toEqual(['v_a', 'v_b']);
  });

  it('send: posts mode, stage, model and chat; a patch answer becomes the pending patch', async () => {
    const f = stubFetch([patchResponse]);
    restore = f.restore;
    useCopilotStore.getState().setMode('critique');
    await useCopilotStore.getState().send('', 'analyze');
    expect(f.bodies[0]).toMatchObject({
      mode: 'critique',
      stage: 'analyze',
      model: { id: 'm_web' },
      messages: [{ role: 'user', text: 'Critique the current model.' }],
    });
    const st = useCopilotStore.getState();
    expect(st.pendingPatch?.id).toBe('p_1');
    expect(st.entries.map((e) => e.role)).toEqual(['user', 'assistant']);
    expect(st.entries[1]?.usage).toHaveLength(2);
    expect(useModelStore.getState().model.variables).toHaveLength(2); // proposing changes nothing
  });

  it('send: an error response or network failure sets error and changes nothing', async () => {
    const f = stubFetch([
      { ok: false, error: { code: 'invalid-output', message: 'bad twice' }, trace: [], usage: [] },
      new Error('down'),
    ]);
    restore = f.restore;
    const before = useModelStore.getState().model;
    await useCopilotStore.getState().send('hi', 'map');
    expect(useCopilotStore.getState().error).toMatchObject({ code: 'invalid-output' });
    await useCopilotStore.getState().send('again', 'map');
    expect(useCopilotStore.getState().error).toMatchObject({ code: 'network' });
    expect(useCopilotStore.getState().pendingPatch).toBeNull();
    expect(useModelStore.getState().model).toBe(before);
  });

  it('send: a malformed patch from the server is refused client-side', async () => {
    const malformed: CopilotResponse = {
      ok: true,
      output: { kind: 'patch', patch: { ...samplePatch, ops: [] }, hypotheses: [] },
      trace: [],
      usage: [],
      model: 'claude-test',
    };
    const f = stubFetch([malformed]);
    restore = f.restore;
    await useCopilotStore.getState().send('go', 'map');
    expect(useCopilotStore.getState().error?.code).toBe('invalid-output');
    expect(useCopilotStore.getState().pendingPatch).toBeNull();
  });
});
