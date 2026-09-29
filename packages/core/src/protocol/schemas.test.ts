import { describe, expect, it } from 'vitest';
import { createEmptyModel } from '../schema/factory.ts';
import { Patch } from '../schema/patch.ts';
import { addVariable } from '../model/ops.ts';
import {
  AskQuestionInput,
  COPILOT_MODES,
  CopilotRequestSchema,
  MODE_OUTPUTS,
  OUTPUT_TOOL_NAMES,
  ProposePatchInput,
  RespondInput,
  modelElementIds,
  toCorePatch,
} from './schemas.ts';

const model = addVariable(createEmptyModel('M', { id: 'm_1', now: '2026-09-29T00:00:00.000Z' }), { id: 'v_a', name: 'A' });

describe('CopilotRequestSchema', () => {
  it('accepts a valid request and applies model defaults', () => {
    const r = CopilotRequestSchema.safeParse({ mode: 'critique', stage: 'map', model, messages: [{ role: 'user', text: 'hi' }] });
    expect(r.success).toBe(true);
  });

  it('rejects unknown modes, invalid models and oversized chats', () => {
    expect(CopilotRequestSchema.safeParse({ mode: 'hack', stage: 'map', model, messages: [] }).success).toBe(false);
    const broken = { ...model, links: [{ id: 'l_x', from: 'v_a', to: 'v_missing' }] };
    expect(CopilotRequestSchema.safeParse({ mode: 'explain', stage: 'map', model: broken, messages: [] }).success).toBe(false);
    const many = Array.from({ length: 41 }, () => ({ role: 'user', text: 'x' }));
    expect(CopilotRequestSchema.safeParse({ mode: 'explain', stage: 'map', model, messages: many }).success).toBe(false);
  });
});

describe('mode outputs', () => {
  it('every mode answers through at least one known output tool', () => {
    for (const mode of COPILOT_MODES) {
      expect(MODE_OUTPUTS[mode].length).toBeGreaterThan(0);
      for (const t of MODE_OUTPUTS[mode]) expect(OUTPUT_TOOL_NAMES).toContain(t);
    }
    expect(MODE_OUTPUTS.explain).toEqual(['respond']);
    expect(MODE_OUTPUTS.interview).toContain('ask_question');
  });

  it('validates ask_question and respond shapes', () => {
    expect(AskQuestionInput.safeParse({ question: 'What drives rework?', options: [], why: 'boundary' }).success).toBe(true);
    expect(AskQuestionInput.safeParse({ question: '', options: [], why: '' }).success).toBe(false);
    expect(AskQuestionInput.safeParse({ question: 'q', options: ['1', '2', '3', '4', '5', '6', '7'], why: '' }).success).toBe(false);
    expect(RespondInput.safeParse({ markdown: '# Loops', findings: [], hypotheses: [] }).success).toBe(true);
    expect(
      RespondInput.safeParse({ markdown: 'x', findings: [{ elementIds: ['v_a'], severity: 'fatal', rule: 'r', message: 'm' }], hypotheses: [] })
        .success,
    ).toBe(false);
  });
});

describe('toCorePatch', () => {
  const input = ProposePatchInput.parse({
    title: 'Rework loop',
    rationale: 'Hypothesis: rework feeds back into work remaining.',
    hypotheses: ['Rework raises work remaining'],
    ops: [
      { op: 'add_variable', id: 'v_r', name: 'Rework', kind: 'variable', equation: '', units: '', doc: '' },
      { op: 'add_link', id: 'l_ar', from: 'v_a', to: 'v_r', polarity: '+', delay: false, confidence: 'medium', note: 'errors' },
      { op: 'annotate_loop', loopKey: 'v_a>v_r', name: 'R1', note: 'n' },
      { op: 'add_scenario', id: 's_1', name: 'S', note: '', overrides: [{ varId: 'v_a', equation: '2' }] },
      { op: 'add_intervention', id: 'i_1', name: 'I', description: '', leverage: 6, scenarioId: '', rationale: '' },
      { op: 'add_assertion', id: 'a_1', expr: 'A >= 0', note: '' },
      { op: 'update', entity: 'link', id: 'l_ar', field: 'delay', value: 'TRUE' },
      { op: 'update', entity: 'intervention', id: 'i_1', field: 'leverage', value: '5' },
      { op: 'update', entity: 'intervention', id: 'i_1', field: 'scenarioId', value: '' },
      { op: 'remove', entity: 'variable', id: 'v_a' },
    ],
  });

  it('maps tool ops to core ops with sequential opIds and coerced values', () => {
    const r = toCorePatch(input, model, 'p_1');
    if (!r.ok) throw new Error(r.errors.join('; '));
    expect(Patch.safeParse(r.patch).success).toBe(true);
    expect(r.patch.ops.map((o) => o.opId)).toEqual(['op1', 'op2', 'op3', 'op4', 'op5', 'op6', 'op7', 'op8', 'op9', 'op10']);
    expect(r.patch.ops[0]).toEqual({
      opId: 'op1',
      op: 'add',
      entity: 'variable',
      value: { id: 'v_r', name: 'Rework', kind: 'variable', equation: '', units: '', doc: '' },
    });
    expect(r.patch.ops[2]).toMatchObject({ op: 'add', entity: 'loopAnnotation', value: { key: 'v_a>v_r' } });
    expect(r.patch.ops[4]).toMatchObject({ value: { scenarioId: null, leverage: 6 } });
    expect(r.patch.ops[6]).toMatchObject({ op: 'update', changes: { delay: true } });
    expect(r.patch.ops[7]).toMatchObject({ changes: { leverage: 5 } });
    expect(r.patch.ops[8]).toMatchObject({ changes: { scenarioId: null } });
    expect(r.patch.ops[9]).toEqual({ opId: 'op10', op: 'remove', entity: 'variable', id: 'v_a' });
  });

  it('annotating an already-annotated loop becomes an update', () => {
    const annotated = { ...model, loopAnnotations: [{ key: 'v_a>v_r', name: 'old', note: '', origin: 'user' as const }] };
    const r = toCorePatch(input, annotated, 'p_1');
    expect(r.ok && r.patch.ops[2]).toMatchObject({ op: 'update', entity: 'loopAnnotation', id: 'v_a>v_r', changes: { name: 'R1' } });
  });

  it('rejects fields that the entity cannot update and uncoercible values', () => {
    const bad = ProposePatchInput.parse({
      title: 't',
      rationale: 'r',
      hypotheses: [],
      ops: [
        { op: 'update', entity: 'link', id: 'l_1', field: 'equation', value: 'x' },
        { op: 'update', entity: 'link', id: 'l_1', field: 'delay', value: 'maybe' },
        { op: 'update', entity: 'intervention', id: 'i_1', field: 'leverage', value: '13' },
      ],
    });
    const r = toCorePatch(bad, model, 'p_1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(3);
  });
});

describe('modelElementIds', () => {
  it('collects ids across collections', () => {
    expect([...modelElementIds(model)]).toEqual(['v_a']);
  });
});
