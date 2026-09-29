import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { ModelSchema, integrityIssues, type Model } from '../schema/model.ts';
import { createEmptyModel } from '../schema/factory.ts';
import {
  ModelOpError,
  addLink,
  addVariable,
  connectFlow,
  findVariableByName,
  flipPolarity,
  impliedFlowLinks,
  removeLink,
  removeVariable,
  setKind,
  setLayout,
  setVariableName,
  toggleDelay,
  updateLink,
  updateVariable,
} from './ops.ts';
import { projectCld, projectSfd } from './projections.ts';

const NOW = '2026-09-29T00:00:00.000Z';
const empty = () => createEmptyModel('T', { id: 'm_t', now: NOW });
const valid = (m: Model) => expect(integrityIssues(ModelSchema.parse(m))).toEqual([]);

/** Stock-flow chain: Backlog --completion--> Done, with rate aux. */
function chain(): Model {
  let m = empty();
  m = addVariable(m, { id: 'v_b', name: 'Backlog', kind: 'stock', equation: '100' });
  m = addVariable(m, { id: 'v_d', name: 'Done', kind: 'stock', equation: '0' });
  m = addVariable(m, { id: 'v_c', name: 'Completion', kind: 'flow', equation: 'Backlog / 4' });
  m = connectFlow(m, 'v_c', { from: 'v_b', to: 'v_d' });
  m = addLink(m, { id: 'l_bc', from: 'v_b', to: 'v_c', polarity: '+' });
  return m;
}

describe('variables', () => {
  it('adds with defaults and rejects duplicate/reserved names', () => {
    const m = addVariable(empty(), { id: 'v_a', name: 'Work Remaining' });
    expect(m.variables[0]?.kind).toBe('variable');
    expect(() => addVariable(m, { id: 'v_b', name: 'work_remaining' })).toThrow(ModelOpError);
    expect(() => addVariable(m, { id: 'v_c', name: 'Time' })).toThrow(/reserved/);
    expect(() => addVariable(m, { id: 'v_a', name: 'Other' })).toThrow(/already exists/);
    expect(findVariableByName(m, 'WORK  remaining')?.id).toBe('v_a');
    valid(m);
  });

  it('updates non-structural fields only', () => {
    const m = updateVariable(addVariable(empty(), { id: 'v_a', name: 'A', kind: 'aux' }), 'v_a', {
      equation: '2 * 3',
      units: 'tasks',
    });
    expect(m.variables[0]).toMatchObject({ equation: '2 * 3', units: 'tasks', kind: 'aux', name: 'A' });
    expect(() => setVariableName(addVariable(m, { id: 'v_b', name: 'B' }), 'v_b', 'a')).toThrow(/already exists/);
  });

  it('removal cascades to links, flow ends, layout and bindings', () => {
    let m = chain();
    m = setLayout(m, 'cld', { v_b: { x: 1, y: 2 } });
    m = { ...m, frame: { ...m.frame, kpis: [{ id: 'k_1', name: 'Backlog', varId: 'v_b', goal: 'minimize' }] } };
    m = removeVariable(m, 'v_b');
    expect(m.links.some((l) => l.from === 'v_b' || l.to === 'v_b')).toBe(false);
    expect(m.variables.find((v) => v.id === 'v_c')?.flow).toEqual({ from: null, to: 'v_d' });
    expect(m.layout.cld).toEqual({});
    expect(m.frame.kpis[0]?.varId).toBeNull();
    valid(m);
  });

  it('setKind keeps invariants when leaving stock/flow and entering lookup', () => {
    let m = chain();
    m = setKind(m, 'v_b', 'aux');
    expect(m.variables.find((v) => v.id === 'v_c')?.flow?.from).toBeNull();
    m = setKind(m, 'v_c', 'aux');
    expect(m.variables.find((v) => v.id === 'v_c')?.flow).toBeUndefined();
    m = setKind(m, 'v_c', 'lookup');
    expect(m.variables.find((v) => v.id === 'v_c')?.graph?.xs).toEqual([0, 1]);
    valid(m);
  });
});

describe('links', () => {
  it('adds, flips, toggles delay, updates, removes; allows self-links; rejects duplicates', () => {
    let m = addVariable(addVariable(empty(), { id: 'v_a', name: 'A' }), { id: 'v_b', name: 'B' });
    m = addLink(m, { id: 'l_1', from: 'v_a', to: 'v_b' });
    m = addLink(m, { id: 'l_self', from: 'v_a', to: 'v_a' });
    expect(() => addLink(m, { id: 'l_2', from: 'v_a', to: 'v_b' })).toThrow(/already exists/);
    expect(() => addLink(m, { id: 'l_3', from: 'v_a', to: 'v_zz' })).toThrow(/not found/);
    m = flipPolarity(m, 'l_1');
    expect(m.links[0]?.polarity).toBe('-');
    m = flipPolarity(updateLink(m, 'l_1', { polarity: '?' }), 'l_1');
    expect(m.links[0]?.polarity).toBe('+');
    m = toggleDelay(m, 'l_1');
    expect(m.links[0]?.delay).toBe(true);
    m = removeLink(m, 'l_self');
    expect(m.links).toHaveLength(1);
    valid(m);
  });
});

describe('flows', () => {
  it('connectFlow maintains implied flow→stock links with the right polarity', () => {
    const m = chain();
    const implied = impliedFlowLinks(m);
    expect(implied).toEqual([
      { flowId: 'v_c', stockId: 'v_d', polarity: '+' },
      { flowId: 'v_c', stockId: 'v_b', polarity: '-' },
    ]);
    for (const { flowId, stockId, polarity } of implied)
      expect(m.links.find((l) => l.from === flowId && l.to === stockId)?.polarity).toBe(polarity);
    valid(m);
  });

  it('reconnecting drops the old implied link; clouds are allowed', () => {
    let m = chain();
    m = connectFlow(m, 'v_c', { to: null });
    expect(m.links.some((l) => l.from === 'v_c' && l.to === 'v_d')).toBe(false);
    expect(() => connectFlow(m, 'v_c', { to: 'v_b' })).toThrow(/same stock/);
    expect(() => connectFlow(m, 'v_b', { to: 'v_d' })).toThrow(/not a flow/);
    valid(m);
  });

  it('projections: CLD shows all links; SFD separates pipes from info connectors', () => {
    const m = chain();
    expect(projectCld(m).edges).toHaveLength(3);
    const sfd = projectSfd(m);
    expect(sfd.pipes).toEqual([{ flowId: 'v_c', from: 'v_b', to: 'v_d' }]);
    expect(sfd.connectors.map((l) => l.id)).toEqual(['l_bc']);
    expect(sfd.unquantified).toEqual([]);
  });
});

describe('property: random edit sequences keep the model valid', () => {
  type Edit =
    | { t: 'addVar'; i: number; kind: 'variable' | 'stock' | 'flow' | 'aux' | 'constant' }
    | { t: 'addLink'; a: number; b: number }
    | { t: 'removeVar'; i: number }
    | { t: 'flip'; i: number }
    | { t: 'connect'; f: number; from: number; to: number }
    | { t: 'kind'; i: number; kind: 'variable' | 'stock' | 'flow' | 'aux' | 'lookup' };

  const edit: fc.Arbitrary<Edit> = fc.oneof(
    fc.record({ t: fc.constant('addVar' as const), i: fc.nat(20), kind: fc.constantFrom('variable', 'stock', 'flow', 'aux', 'constant') }),
    fc.record({ t: fc.constant('addLink' as const), a: fc.nat(20), b: fc.nat(20) }),
    fc.record({ t: fc.constant('removeVar' as const), i: fc.nat(20) }),
    fc.record({ t: fc.constant('flip' as const), i: fc.nat(40) }),
    fc.record({ t: fc.constant('connect' as const), f: fc.nat(20), from: fc.integer({ min: -1, max: 20 }), to: fc.integer({ min: -1, max: 20 }) }),
    fc.record({ t: fc.constant('kind' as const), i: fc.nat(20), kind: fc.constantFrom('variable', 'stock', 'flow', 'aux', 'lookup') }),
  );

  const apply = (m: Model, e: Edit): Model => {
    const vid = (i: number) => `v_${i}`;
    try {
      switch (e.t) {
        case 'addVar':
          return addVariable(m, { id: vid(e.i), name: `Var ${e.i}`, kind: e.kind });
        case 'addLink':
          return addLink(m, { id: `l_${e.a}_${e.b}`, from: vid(e.a), to: vid(e.b) });
        case 'removeVar':
          return removeVariable(m, vid(e.i));
        case 'flip': {
          const l = m.links[e.i % Math.max(1, m.links.length)];
          return l ? flipPolarity(m, l.id) : m;
        }
        case 'connect':
          return connectFlow(m, vid(e.f), { from: e.from < 0 ? null : vid(e.from), to: e.to < 0 ? null : vid(e.to) });
        case 'kind':
          return setKind(m, vid(e.i), e.kind);
      }
    } catch (err) {
      if (err instanceof ModelOpError) return m; // rejected edits leave the model untouched
      throw err;
    }
  };

  it('holds I1–I8 after any sequence of accepted or rejected edits', () => {
    fc.assert(
      fc.property(fc.array(edit, { maxLength: 60 }), (edits) => {
        const m = edits.reduce(apply, empty());
        expect(integrityIssues(ModelSchema.parse(m))).toEqual([]);
      }),
      { numRuns: 300, seed: 42 },
    );
  });
});
