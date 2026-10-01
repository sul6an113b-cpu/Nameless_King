import { describe, expect, it } from 'vitest';
import { buildModel, idOf, type VarSpec } from '../../test/fixtures/sim/build.ts';
import type { CompiledModel } from '../contracts.ts';
import type { SimSpec } from '../schema/model.ts';
import { compileModel } from './index.ts';

const compile = (vars: VarSpec[], simSpec: Partial<SimSpec> = {}): CompiledModel => {
  const r = compileModel(buildModel(vars, { simSpec: { start: 0, stop: 6, dt: 1, ...simSpec } }));
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('\n'));
  return r.compiled;
};

/** Plain stock–flow model: no builtins, so the value vector holds user variables only. */
const growth: VarSpec[] = [
  { name: 'Pop', kind: 'stock', eq: '10' },
  { name: 'Births', to: 'Pop', eq: 'Pop * rate' },
  { name: 'rate', kind: 'constant', eq: '0.1' },
  { name: 'Doubled', eq: 'Births * 2' },
];

/** Every stateful builtin family: hidden stocks (SMTH1, DELAY3) and discrete states (PREVIOUS, DELAY). */
const withBuiltins: VarSpec[] = [
  { name: 'Demand', eq: 'STEP(10, 1) + TIME' },
  { name: 'Perceived', eq: 'SMTH1(Demand, 2)' },
  { name: 'Shipped', eq: 'DELAY3(Demand, 3)' },
  { name: 'Before', eq: 'PREVIOUS(Demand, 0)' },
  { name: 'Lagged', eq: 'DELAY(Demand, 2, 0)' },
  { name: 'Mix', eq: 'Perceived + Shipped * 0.5' },
];

describe('SimOptions.saveState', () => {
  it('is off by default: the result carries no state', () => {
    expect(compile(growth).simulate().state).toBeUndefined();
    expect(compile(growth).simulate(undefined, { saveState: false }).state).toBeUndefined();
  });

  it.each(['euler', 'rk4'] as const)(
    'returns one full value vector per saved step that matches every saved series (%s)',
    (method) => {
      const c = compile(growth, { method });
      const r = c.simulate(undefined, { saveState: true });
      const state = r.state ?? [];
      expect(state).toHaveLength(r.time.length);
      expect(r.time).toHaveLength(7);
      expect(c.size).toBe(c.varIds.length); // no builtins → no hidden slots
      for (const vec of state) expect(vec).toHaveLength(c.size);
      for (const id of c.varIds) state.forEach((vec, k) => expect(vec[c.index[id]]).toBe(r.series[id][k]));
    },
  );

  it('includes the hidden builtin slots, so evalVar rebuilds every saved value from the vector alone', () => {
    const c = compile(withBuiltins, { dt: 0.5, stop: 5 });
    expect(c.size).toBeGreaterThan(c.varIds.length);
    const r = c.simulate(undefined, { saveState: true });
    const state = r.state ?? [];
    expect(state).toHaveLength(r.time.length);
    for (const vec of state) expect(vec).toHaveLength(c.size);
    for (const name of ['Demand', 'Perceived', 'Shipped', 'Before', 'Lagged', 'Mix']) {
      const id = idOf(name);
      state.forEach((vec, k) => expect(c.evalVar(id, vec, r.time[k])).toBe(r.series[id][k]));
    }
    // ...and the hidden slots are what makes that possible: with them zeroed the smoothed value is lost.
    const hidden = state.map((vec) => Float64Array.from(vec, (x, i) => (i < c.varIds.length ? x : 0)));
    const lost = hidden.some((vec, k) => c.evalVar(idOf('Perceived'), vec, r.time[k]) !== r.series[idOf('Perceived')][k]);
    expect(lost).toBe(true);
  });

  it('is independent of saveIds and follows saveEvery', () => {
    const c = compile(growth, { dt: 0.5, stop: 6, saveEvery: 2 });
    const r = c.simulate(undefined, { saveIds: [idOf('Pop')], saveState: true });
    const state = r.state ?? [];
    expect(Object.keys(r.series)).toEqual([idOf('Pop')]);
    expect(r.time).toHaveLength(4); // t = 0, 2, 4, 6
    expect(state).toHaveLength(4);
    for (const vec of state) expect(vec).toHaveLength(c.size);
    // a variable that was not saved is still in the vector: Births(6) = Pop(6) · rate
    expect(state[3][c.index[idOf('Births')]]).toBeCloseTo(state[3][c.index[idOf('Pop')]] * 0.1, 12);
  });

  it('gives every step its own buffer (later steps never overwrite earlier ones)', () => {
    const c = compile(growth);
    const state = c.simulate(undefined, { saveState: true }).state ?? [];
    expect(new Set(state.map((vec) => vec.buffer)).size).toBe(state.length);
    expect(state[0][c.index[idOf('Pop')]]).toBe(10);
    expect(state[6][c.index[idOf('Pop')]]).toBeGreaterThan(10);
  });

  it('stays aligned with the saved rows when the run is cancelled', () => {
    let reads = 0;
    const signal = {
      get aborted() {
        return ++reads > 3;
      },
    };
    const r = compile(growth).simulate(undefined, { signal, saveState: true });
    expect(r.time).toHaveLength(3);
    expect(r.state).toHaveLength(3);
  });
});
