import { describe, expect, it } from 'vitest';
import { ModelSchema, SCHEMA_VERSION, integrityIssues, type Model } from './model.ts';
import { canonicalName, isReservedName, BUILTIN_NAMES } from './names.ts';
import { createEmptyModel, newId } from './factory.ts';
import { Patch } from './patch.ts';

const NOW = '2026-09-29T00:00:00.000Z';
const base = () => createEmptyModel('Test', { id: 'm_test', now: NOW });

const withParts = (parts: Partial<Model>): unknown => ({ ...base(), ...parts });
const messages = (json: unknown): string[] => {
  const r = ModelSchema.safeParse(json);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('createEmptyModel', () => {
  it('produces a valid model with every default applied (Zod 4 prefault)', () => {
    const m = base();
    expect(m.format).toBe('looplab-model');
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.simSpec).toEqual({ start: 0, stop: 24, dt: 0.25, method: 'euler', timeUnit: 'month' });
    expect(m.frame).toEqual({ problem: '', purpose: '', kpis: [], referenceModes: [], excluded: [] });
    expect(m.settings).toEqual({ loopCap: 1000, integrationErrorTolerance: 0.01, seed: 1 });
    expect(m.layout).toEqual({ cld: {}, sfd: {} });
    expect(m.decision).toEqual({ recommendation: '', summary: '' });
    expect(ModelSchema.parse(m)).toEqual(m);
  });

  it('round-trips through JSON unchanged', () => {
    const m = base();
    expect(ModelSchema.parse(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it('newId has the prefix and matches the Id pattern', () => {
    const id = newId('v');
    expect(id).toMatch(/^v_[0-9a-z]{10}$/);
    expect(newId('v')).not.toBe(id);
  });
});

describe('variable defaults', () => {
  it('fills kind, equation, units, origin, nonNegative', () => {
    const m = ModelSchema.parse(withParts({ variables: [{ id: 'v_a', name: 'Backlog' }] as Model['variables'] }));
    expect(m.variables[0]).toEqual({
      id: 'v_a',
      name: 'Backlog',
      kind: 'variable',
      equation: '',
      units: '',
      doc: '',
      nonNegative: false,
      origin: 'user',
    });
  });
});

describe('integrity rules I1–I8', () => {
  const v = (id: string, name: string, extra: object = {}) => ({ id, name, ...extra });

  it('I1 duplicate ids', () => {
    expect(messages(withParts({ variables: [v('v_a', 'A'), v('v_a', 'B')] as Model['variables'] }))).toEqual([
      expect.stringContaining('I1'),
    ]);
  });

  it('I2 names collide under case and _/space', () => {
    expect(
      messages(withParts({ variables: [v('v_a', 'Work Remaining'), v('v_b', 'work_remaining')] as Model['variables'] })),
    ).toEqual([expect.stringContaining('I2')]);
  });

  it('I3 dangling endpoints and duplicate pairs; self-links allowed', () => {
    const vars = [v('v_a', 'A'), v('v_b', 'B')] as Model['variables'];
    expect(messages(withParts({ variables: vars, links: [{ id: 'l_1', from: 'v_a', to: 'v_x' }] as Model['links'] }))).toEqual([
      expect.stringContaining('I3'),
    ]);
    expect(
      messages(
        withParts({
          variables: vars,
          links: [
            { id: 'l_1', from: 'v_a', to: 'v_b' },
            { id: 'l_2', from: 'v_a', to: 'v_b' },
          ] as Model['links'],
        }),
      ),
    ).toEqual([expect.stringContaining('I3')]);
    expect(messages(withParts({ variables: vars, links: [{ id: 'l_1', from: 'v_a', to: 'v_a' }] as Model['links'] }))).toEqual(
      [],
    );
  });

  it('I4 flow ends must be stocks; only flows have ends', () => {
    const vars = [
      v('v_s', 'S', { kind: 'stock' }),
      v('v_x', 'X', { kind: 'aux' }),
      v('v_f', 'F', { kind: 'flow', flow: { from: 'v_x', to: 'v_s' } }),
    ] as Model['variables'];
    expect(messages(withParts({ variables: vars }))).toEqual([expect.stringContaining('I4')]);
    const noEnds = [v('v_f', 'F', { kind: 'flow' })] as Model['variables'];
    expect(messages(withParts({ variables: noEnds }))).toEqual([expect.stringContaining('I4')]);
    const auxWithEnds = [v('v_a', 'A', { kind: 'aux', flow: { from: null, to: null } })] as Model['variables'];
    expect(messages(withParts({ variables: auxWithEnds }))).toEqual([expect.stringContaining('I4')]);
  });

  it('I5 lookups need a strictly increasing table', () => {
    expect(messages(withParts({ variables: [v('v_l', 'L', { kind: 'lookup' })] as Model['variables'] }))).toEqual([
      expect.stringContaining('I5'),
    ]);
    const bad = [v('v_l', 'L', { kind: 'lookup', graph: { xs: [0, 0], ys: [1, 2] } })] as Model['variables'];
    expect(messages(withParts({ variables: bad }))).toEqual([expect.stringContaining('I5')]);
  });

  it('I6 references to variables and scenarios must exist', () => {
    const m = withParts({
      interventions: [{ id: 'i_1', name: 'Hire', leverage: 12, scenarioId: 's_missing' }] as Model['interventions'],
    });
    expect(messages(m)).toEqual([expect.stringContaining('I6')]);
  });

  it('I7 stop must exceed start', () => {
    expect(messages(withParts({ simSpec: { start: 5, stop: 5, dt: 1, method: 'euler', timeUnit: 'month' } }))).toEqual([
      expect.stringContaining('I7'),
    ]);
  });

  it('I8 uncertainty bounds', () => {
    const bad = [v('v_c', 'C', { kind: 'constant', uncertainty: { min: 2, max: 1 } })] as Model['variables'];
    expect(messages(withParts({ variables: bad }))).toEqual([expect.stringContaining('I8')]);
  });

  it('integrityIssues is empty for a clean model', () => {
    expect(integrityIssues(base())).toEqual([]);
  });
});

describe('names', () => {
  it('canonicalName follows XMILE equivalence', () => {
    expect(canonicalName('  Work   Remaining ')).toBe('work_remaining');
    expect(canonicalName('Work__remaining')).toBe('work_remaining');
    expect(canonicalName('Work Remaining')).toBe('work_remaining');
  });
  it('reserved words and builtins are rejected as names', () => {
    expect(isReservedName('If')).toBe(true);
    expect(isReservedName('smooth')).toBe(true);
    expect(isReservedName('Backlog')).toBe(false);
    expect(new Set(BUILTIN_NAMES).size).toBe(BUILTIN_NAMES.length);
  });
});

describe('Patch schema', () => {
  it('accepts add/update/remove ops and rejects empty patches', () => {
    const ok = Patch.safeParse({
      id: 'p1',
      title: 'Add rework loop',
      rationale: 'hypothesis',
      ops: [
        { opId: 'o1', op: 'add', entity: 'variable', value: { id: 'v_r', name: 'Rework' } },
        { opId: 'o2', op: 'update', entity: 'link', id: 'l_1', changes: { polarity: '-' } },
        { opId: 'o3', op: 'remove', entity: 'variable', id: 'v_x' },
      ],
    });
    expect(ok.success).toBe(true);
    expect(Patch.safeParse({ id: 'p', title: '', rationale: '', ops: [] }).success).toBe(false);
  });
});
