import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createEmptyModel } from '../schema/factory.ts';
import { ModelSchema, type Model } from '../schema/model.ts';
import type { Patch, PatchOp } from '../schema/patch.ts';
import { addLink, addVariable } from '../model/ops.ts';
import { aiProposedElements, applyPatch, markConfirmed, previewPatch } from './apply.ts';

function base(): Model {
  let m = createEmptyModel('Rework', { id: 'm_test', now: '2026-09-29T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'Work Remaining' });
  m = addVariable(m, { id: 'v_b', name: 'Rework' });
  m = addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b', polarity: '+' });
  return m;
}

const patch = (ops: PatchOp[]): Patch => ({ id: 'p_1', title: 't', rationale: 'r', ops });

const FULL: PatchOp[] = [
  {
    opId: 'op1',
    op: 'add',
    entity: 'variable',
    value: { id: 'v_c', name: 'Quality', kind: 'variable', equation: '', units: '', doc: '' },
  },
  {
    opId: 'op2',
    op: 'add',
    entity: 'link',
    value: {
      id: 'l_bc',
      from: 'v_b',
      to: 'v_c',
      polarity: '-',
      delay: true,
      note: 'rework hurts quality',
      confidence: 'medium',
    },
  },
  {
    opId: 'op3',
    op: 'add',
    entity: 'link',
    value: { id: 'l_ca', from: 'v_c', to: 'v_a', polarity: '-', delay: false, note: '', confidence: 'low' },
  },
  { opId: 'op4', op: 'update', entity: 'link', id: 'l_ab', changes: { polarity: '-' } },
  {
    opId: 'op5',
    op: 'add',
    entity: 'loopAnnotation',
    value: { key: 'v_a>v_b>v_c', name: 'R1 Rework spiral', note: 'n' },
  },
  {
    opId: 'op6',
    op: 'add',
    entity: 'scenario',
    value: { id: 's_qa', name: 'More QA', note: '', overrides: [{ varId: 'v_c', equation: '1' }] },
  },
  {
    opId: 'op7',
    op: 'add',
    entity: 'intervention',
    value: { id: 'i_qa', name: 'Add QA', description: '', leverage: 12, scenarioId: 's_qa', rationale: '' },
  },
  { opId: 'op8', op: 'add', entity: 'assertion', value: { id: 'a_pos', expr: 'Rework >= 0', note: '' } },
];
const ALL = new Set(FULL.map((o) => o.opId));

describe('applyPatch', () => {
  it('applies every accepted op, tags added/updated elements ai-proposed and keeps the model valid', () => {
    const m = base();
    const r = applyPatch(m, patch(FULL), ALL);
    expect(r.skipped).toEqual([]);
    expect(r.applied).toEqual([...ALL]);
    expect(ModelSchema.safeParse(r.model).success).toBe(true);
    expect(r.model.variables.find((v) => v.id === 'v_c')?.origin).toBe('ai-proposed');
    expect(r.model.links.find((l) => l.id === 'l_ab')).toMatchObject({ polarity: '-', origin: 'ai-proposed' });
    expect(r.model.links.find((l) => l.id === 'l_bc')).toMatchObject({ delay: true, origin: 'ai-proposed' });
    expect(r.model.loopAnnotations[0]).toMatchObject({ key: 'v_a>v_b>v_c', origin: 'ai-proposed' });
    expect(r.model.interventions[0]).toMatchObject({ scenarioId: 's_qa', leverage: 12, origin: 'ai-proposed' });
    expect(r.model.assertions[0]?.expr).toBe('Rework >= 0');
    expect(m.variables).toHaveLength(2); // input untouched
  });

  it('applies only accepted ops; rejected ops are neither applied nor reported as skipped', () => {
    const r = applyPatch(base(), patch(FULL), new Set(['op4', 'op8']));
    expect(r.applied).toEqual(['op4', 'op8']);
    expect(r.skipped).toEqual([]);
    expect(r.model.variables).toHaveLength(2);
    expect(r.model.links.find((l) => l.id === 'l_ab')?.polarity).toBe('-');
  });

  it('skips ops whose dependencies were rejected, transitively, with a reason', () => {
    const accepted = new Set(['op2', 'op3', 'op5', 'op7', 'op8']); // op1 (v_c) and op6 (s_qa) rejected
    const r = applyPatch(base(), patch(FULL), accepted);
    expect(r.applied).toEqual(['op8']);
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.opId, s.reason]));
    expect(reasons.op2).toBe('depends on variable "v_c" (rejected in op1)');
    expect(reasons.op3).toMatch(/v_c/);
    expect(reasons.op5).toMatch(/v_c/);
    expect(reasons.op7).toBe('depends on scenario "s_qa" (rejected in op6)');
  });

  it('skips an op that fails validation but still applies the others', () => {
    const ops: PatchOp[] = [
      { opId: 'x1', op: 'add', entity: 'link', value: { id: 'l_bad', from: 'v_a', to: 'v_missing' } },
      { opId: 'x2', op: 'add', entity: 'variable', value: { id: 'v_dup', name: 'rework' } }, // duplicate canonical name
      { opId: 'x3', op: 'update', entity: 'link', id: 'l_ab', changes: { from: 'v_b' } }, // endpoints are not updatable
      { opId: 'x4', op: 'add', entity: 'intervention', value: { id: 'i_x', name: 'X', leverage: 99 } },
      {
        opId: 'x5',
        op: 'add',
        entity: 'intervention',
        value: { id: 'i_y', name: 'Y', leverage: 3, scenarioId: 's_none' },
      },
      { opId: 'x6', op: 'remove', entity: 'scenario', id: 's_none' },
      {
        opId: 'x7',
        op: 'update',
        entity: 'variable',
        id: 'v_a',
        changes: { units: 'tasks', kind: 'stock', equation: '100' },
      },
    ];
    const r = applyPatch(base(), patch(ops), new Set(ops.map((o) => o.opId)));
    expect(r.applied).toEqual(['x7']);
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.opId, s.reason]));
    expect(reasons.x1).toMatch(/v_missing/);
    expect(reasons.x2).toMatch(/already exists/);
    expect(reasons.x3).toMatch(/cannot change "from"/);
    expect(reasons.x4).toMatch(/leverage/);
    expect(reasons.x5).toMatch(/s_none/);
    expect(reasons.x6).toMatch(/not found/);
    expect(r.model.variables[0]).toMatchObject({
      kind: 'stock',
      units: 'tasks',
      equation: '100',
      origin: 'ai-proposed',
    });
  });

  it('removing a variable cascades its links; a later op on a removed link is skipped', () => {
    const ops: PatchOp[] = [
      { opId: 'r1', op: 'remove', entity: 'variable', id: 'v_b' },
      { opId: 'r2', op: 'update', entity: 'link', id: 'l_ab', changes: { note: 'x' } },
    ];
    const r = applyPatch(base(), patch(ops), new Set(['r1', 'r2']));
    expect(r.applied).toEqual(['r1']);
    expect(r.model.links).toEqual([]);
    expect(r.skipped[0]?.opId).toBe('r2');
  });

  it('adds a flow with connected ends and its implied flow→stock links', () => {
    let m = base();
    m = addVariable(m, { id: 'v_s', name: 'Backlog', kind: 'stock', equation: '10' });
    const r = applyPatch(
      m,
      patch([
        {
          opId: 'f1',
          op: 'add',
          entity: 'variable',
          value: { id: 'v_f', name: 'Completion', kind: 'flow', flow: { from: 'v_s', to: null } },
        },
      ]),
      new Set(['f1']),
    );
    expect(r.skipped).toEqual([]);
    expect(r.model.links.some((l) => l.from === 'v_f' && l.to === 'v_s' && l.polarity === '-')).toBe(true);
  });

  it('property: with no accepted op the model is returned unchanged (same object)', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 12 }), (ops) => {
        const m = base();
        const r = applyPatch(m, patch(ops), new Set());
        return r.model === m && r.applied.length === 0 && r.skipped.length === 0;
      }),
    );
  });

  it('property: any accepted subset yields a schema-valid model, and every op is either applied, skipped or rejected', () => {
    fc.assert(
      fc.property(
        fc.array(opArb, { minLength: 1, maxLength: 12 }),
        fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
        (ops, picks) => {
          const uniq = ops.map((o, i) => ({ ...o, opId: `g${i}` }));
          const accepted = new Set(uniq.filter((_, i) => picks[i]).map((o) => o.opId));
          const r = applyPatch(base(), patch(uniq), accepted);
          const accounted = new Set([...r.applied, ...r.skipped.map((s) => s.opId)]);
          return (
            ModelSchema.safeParse(r.model).success &&
            [...accepted].every((id) => accounted.has(id)) &&
            r.applied.every((id) => accepted.has(id))
          );
        },
      ),
    );
  });
});

const VAR_IDS = ['v_a', 'v_b', 'v_c', 'v_d'];
const idArb = fc.constantFrom(...VAR_IDS);
const opArb: fc.Arbitrary<PatchOp> = fc.oneof(
  fc.record({
    opId: fc.constant('o'),
    op: fc.constant('add' as const),
    entity: fc.constant('variable' as const),
    value: fc.record({ id: idArb, name: fc.constantFrom('Alpha', 'Beta', 'Rework', 'Gamma') }),
  }),
  fc.record({
    opId: fc.constant('o'),
    op: fc.constant('add' as const),
    entity: fc.constant('link' as const),
    value: fc.record({
      id: fc.constantFrom('l_1', 'l_2', 'l_ab'),
      from: idArb,
      to: idArb,
      polarity: fc.constantFrom('+', '-', '?', 'x'),
    }),
  }),
  fc.record({
    opId: fc.constant('o'),
    op: fc.constant('update' as const),
    entity: fc.constantFrom('variable' as const, 'link' as const),
    id: fc.constantFrom('v_a', 'l_ab', 'l_1'),
    changes: fc.constantFrom({ polarity: '-' }, { units: 'tasks' }, { name: 'Beta' }, { kind: 'stock' }, { bogus: 1 }),
  }),
  fc.record({
    opId: fc.constant('o'),
    op: fc.constant('remove' as const),
    entity: fc.constantFrom('variable' as const, 'link' as const, 'scenario' as const),
    id: fc.constantFrom('v_a', 'v_b', 'l_ab', 's_x'),
  }),
);

describe('previewPatch', () => {
  it('reports added, changed and removed ids (incl. cascaded links) and the op targets', () => {
    const ops: PatchOp[] = [
      ...FULL.slice(0, 4),
      { opId: 'op9', op: 'remove', entity: 'variable', id: 'v_a' },
      { opId: 'op10', op: 'add', entity: 'link', value: { id: 'l_zz', from: 'v_missing', to: 'v_b' } },
    ];
    const p = previewPatch(base(), patch(ops));
    expect(p.added.variables).toEqual(['v_c']);
    expect(p.added.links).toEqual(['l_bc']); // l_ca was removed with v_a
    expect(p.removed.sort()).toEqual(['l_ab', 'v_a']);
    expect(p.changed).toEqual([]); // l_ab changed then removed
    expect(p.targets.op2).toEqual({ entity: 'link', id: 'l_bc' });
    expect(p.targets.op9).toEqual({ entity: 'variable', id: 'v_a' });
    expect(p.skipped.map((s) => s.opId)).toEqual(['op10']);
    expect(p.preview.variables.map((v) => v.id)).toEqual(['v_b', 'v_c']);
  });
});

describe('markConfirmed / aiProposedElements', () => {
  it('lists ai-proposed elements and confirms selected ones', () => {
    const applied = applyPatch(base(), patch(FULL), ALL).model;
    const listed = aiProposedElements(applied);
    expect(listed.map((e) => e.id)).toEqual(['v_c', 'l_ab', 'l_bc', 'l_ca', 'v_a>v_b>v_c', 's_qa', 'i_qa']);
    expect(listed.find((e) => e.id === 'l_bc')?.label).toBe('Rework → Quality (-)');

    const one = markConfirmed(applied, new Set(['v_c']));
    expect(one.variables.find((v) => v.id === 'v_c')?.origin).toBe('ai-confirmed');
    expect(aiProposedElements(one)).toHaveLength(6);

    const all = markConfirmed(one);
    expect(aiProposedElements(all)).toEqual([]);
    expect(markConfirmed(all)).toBe(all);
    expect(all.variables.find((v) => v.id === 'v_a')?.origin).toBe('user');
  });
});
