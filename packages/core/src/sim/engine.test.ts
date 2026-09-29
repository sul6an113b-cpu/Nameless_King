import { describe, expect, it } from 'vitest';
import { buildModel, idOf, seriesOf, type VarSpec } from '../../test/fixtures/sim/build.ts';
import type { CompiledModel, HealthItem } from '../contracts.ts';
import type { SimSpec } from '../schema/model.ts';
import { compileModel, simulate, SimulationError } from './index.ts';

const compile = (vars: VarSpec[], simSpec: Partial<SimSpec> = {}, assertions?: { expr: string }[]): CompiledModel => {
  const r = compileModel(buildModel(vars, { simSpec: { start: 0, stop: 4, dt: 1, ...simSpec }, assertions }));
  if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('\n'));
  return r.compiled;
};

const errorsOf = (vars: VarSpec[]): HealthItem[] => {
  const r = compileModel(buildModel(vars));
  if (r.ok) throw new Error('expected compile errors');
  return r.errors;
};

describe('compile errors', () => {
  it.each<[string, VarSpec[], HealthItem['check'], RegExp, string[]]>([
    ['unquantified variable', [{ name: 'Morale', kind: 'variable' }], 'unquantified', /"Morale" is not quantified/, ['Morale']],
    ['parse error', [{ name: 'a', eq: '1 +' }], 'parse', /Equation of "a": Unexpected end/, ['a']],
    ['stock without initial value', [{ name: 'S', kind: 'stock' }], 'parse', /needs an initial value/, ['S']],
    ['aux without equation', [{ name: 'a' }], 'parse', /has no equation/, ['a']],
    ['unknown variable', [{ name: 'a', eq: 'b * 2' }], 'undefined', /uses "b", which is not a variable/, ['a']],
    ['lookup used as a value', [{ name: 'fx', kind: 'lookup', graph: { xs: [0, 1], ys: [0, 1] } }, { name: 'a', eq: 'fx * 2' }], 'undefined', /call it as fx\(x\)/, ['a']],
    ['lookup of a non-table', [{ name: 'b', eq: '1' }, { name: 'a', eq: 'b(2)' }], 'undefined', /"b" is not a graphical function/, ['a']],
    ['unknown function', [{ name: 'a', eq: 'RANDOM(1)' }], 'undefined', /unknown function or graphical function "RANDOM"/, ['a']],
    ['non-constant SMTHN order', [{ name: 'n', eq: '3' }, { name: 'a', eq: 'SMTHN(1, 2, n)' }], 'parse', /order n of SMTHN must be a constant/, ['a']],
    ['algebraic loop', [{ name: 'a', eq: 'b + 1' }, { name: 'b', eq: 'a * 2' }], 'algebraic-loop', /Algebraic loop.*(a → b → a|b → a → b)/, ['a', 'b']],
    ['self-reference', [{ name: 'a', eq: 'a + 1' }], 'algebraic-loop', /a → a/, ['a']],
    ['initialisation cycle via a stock', [{ name: 'S', kind: 'stock', eq: 'x' }, { name: 'x', eq: 'S * 2' }], 'algebraic-loop', /Initialisation cycle/, ['S', 'x']],
    ['initialisation cycle via a smooth', [{ name: 'y', eq: 'SMTH1(y * 2, 3)' }], 'algebraic-loop', /Initialisation cycle: .*SMTH1/, ['y']],
  ])('%s', (_what, vars, check, message, names) => {
    const errs = errorsOf(vars);
    const e = errs.find((x) => x.check === check);
    expect(e, JSON.stringify(errs)).toBeDefined();
    if (!e) return;
    expect(e.severity).toBe('error');
    expect(e.message).toMatch(message);
    for (const n of names) expect(e.elementIds).toContain(idOf(n));
  });

  it('reports the span of a parse error', () => {
    const e = errorsOf([{ name: 'a', eq: '1 + #' }])[0];
    expect(e.detail).toMatchObject({ span: { start: 4, end: 5 } });
  });

  it('accepts loops through a stock, PREVIOUS or a delay, and explicit initial values', () => {
    expect(() => compile([{ name: 'S', kind: 'stock', eq: '1' }, { name: 'f', to: 'S', eq: 'S * 0.1' }])).not.toThrow();
    expect(() => compile([{ name: 'a', eq: 'PREVIOUS(a, 0) + 1' }])).not.toThrow();
    expect(() => compile([{ name: 'y', eq: 'SMTH1(y * 2 + 1, 3, 0)' }])).not.toThrow();
    expect(() => compile([{ name: 'y', eq: 'DELAY(y + 1, 2, 0)' }])).not.toThrow();
  });

  it('simulate() throws with every message on compile errors', () => {
    const bad = buildModel([{ name: 'a', eq: 'b' }, { name: 'c', kind: 'variable' }]);
    expect(() => simulate(bad)).toThrow(/uses "b"/);
    expect(() => simulate(bad)).toThrow(/"c" is not quantified/);
  });
});

describe('compiled model', () => {
  const vars: VarSpec[] = [
    { name: 'rate', kind: 'constant', eq: '0.5' },
    { name: 'effect', kind: 'lookup', graph: { xs: [0, 10], ys: [0, 1] } },
    { name: 'outflow', from: 'S', eq: 'S * rate * effect(S)', nonNegative: true },
    { name: 'S', kind: 'stock', eq: '10' },
    { name: 'inflow', to: 'S', eq: '1' },
    { name: 'report', eq: 'outflow * 2' },
  ];

  it('orders stocks first and indexes every quantified variable (lookups excluded)', () => {
    const c = compile(vars);
    expect(c.varIds[0]).toBe(idOf('S'));
    expect(new Set(c.varIds)).toEqual(new Set(['rate', 'outflow', 'S', 'inflow', 'report'].map(idOf)));
    expect(c.varIds.indexOf(idOf('outflow'))).toBeLessThan(c.varIds.indexOf(idOf('report')));
    expect(Object.keys(c.index).sort()).toEqual([...c.varIds].sort());
    expect(c.size).toBe(5);
    expect(new Set(Object.values(c.index)).size).toBe(5);
  });

  it('lists direct dependencies (equation references with a value, and flows for stocks)', () => {
    const c = compile(vars);
    expect(c.deps[idOf('S')].sort()).toEqual([idOf('inflow'), idOf('outflow')].sort());
    expect(c.deps[idOf('outflow')]).toEqual([idOf('S'), idOf('rate')]); // the table `effect` has no value
    expect(Object.keys(c.deps).sort()).toEqual([...c.varIds].sort());
    for (const ds of Object.values(c.deps)) for (const d of ds) expect(c.index[d]).toBeDefined();
    expect(c.deps[idOf('report')]).toEqual([idOf('outflow')]);
    expect(c.deps[idOf('rate')]).toEqual([]);
  });

  it('evalVar evaluates one equation on a given value vector (tables and clamps included)', () => {
    const c = compile(vars);
    const v = new Float64Array(c.size);
    v[c.index[idOf('S')]] = 4;
    v[c.index[idOf('rate')]] = 0.5;
    expect(c.evalVar(idOf('outflow'), v, 0)).toBeCloseTo(4 * 0.5 * 0.4, 12);
    v[c.index[idOf('rate')]] = -1;
    expect(c.evalVar(idOf('outflow'), v, 0)).toBe(0); // non-negative flow
    v[c.index[idOf('outflow')]] = 3;
    expect(c.evalVar(idOf('report'), v, 0)).toBe(6);
    expect(c.evalVar(idOf('S'), v, 0)).toBe(4);
    expect(() => c.evalVar('v_nope', v, 0)).toThrow(/not a quantified variable/);
  });

  it('hoists each stateful call once: hidden slots follow the user slots', () => {
    const c = compile([
      { name: 'x', eq: 'TIME' },
      { name: 'y', eq: 'DELAY1(SMTH1(x, 2), 3) + DELAY(SMTH3(x, 3), 2) + PREVIOUS(x) + INIT(x)' },
    ]);
    // 2 user slots + SMTH1 (1) + DELAY1 (1) + SMTH3 (3) + DELAY (1) + PREVIOUS (1) + INIT (1)
    expect(c.size).toBe(10);
    expect(Math.max(...Object.values(c.index))).toBe(1);
  });

  it('compiles and runs an empty model', () => {
    const r = simulate(buildModel([], { simSpec: { stop: 2, dt: 1 } }));
    expect(Array.from(r.time)).toEqual([0, 1, 2]);
    expect(r.series).toEqual({});
  });

  it('can be run repeatedly with different specs and overrides', () => {
    const c = compile(vars);
    const a = c.simulate();
    const b = c.simulate({ dt: 0.5 });
    const a2 = c.simulate();
    expect(Array.from(a2.series[idOf('S')])).toEqual(Array.from(a.series[idOf('S')]));
    expect(b.time).toHaveLength(9);
    expect(b.spec.dt).toBe(0.5);
  });
});

describe('run options', () => {
  const growth: VarSpec[] = [
    { name: 'S', kind: 'stock', eq: '100' },
    { name: 'r', kind: 'constant', eq: '0.1' },
    { name: 'growth', to: 'S', eq: 'S * r' },
    { name: 'double', eq: 'S * 2' },
  ];

  it('saveEvery keeps every k-th step and always the stop time', () => {
    const c = compile(growth, { dt: 0.25, stop: 4.5 });
    const r = c.simulate({ saveEvery: 1 });
    expect(Array.from(r.time)).toEqual([0, 1, 2, 3, 4, 4.5]);
    const full = c.simulate();
    expect(r.series[idOf('S')][2]).toBe(full.series[idOf('S')][8]);
  });

  it('saveIds limits the saved columns', () => {
    const r = compile(growth).simulate(undefined, { saveIds: [idOf('S')] });
    expect(Object.keys(r.series)).toEqual([idOf('S')]);
    expect(() => compile(growth).simulate(undefined, { saveIds: ['v_nope'] })).toThrow(/unknown variable/);
  });

  it('numeric overrides replace constants, auxes, and stock initial values', () => {
    const c = compile(growth);
    const r = c.simulate(undefined, { overrides: { [idOf('r')]: 0, [idOf('S')]: 50 } });
    expect(Array.from(r.series[idOf('S')])).toEqual([50, 50, 50, 50, 50]);
    const d = c.simulate(undefined, { overrides: { [idOf('double')]: 7 } });
    expect(new Set(d.series[idOf('double')])).toEqual(new Set([7]));
    expect(() => c.simulate(undefined, { overrides: { v_nope: 1 } })).toThrow(/unknown variable/);
  });

  it('compile-time overrides and scenarios (equation overrides + simSpec)', () => {
    const model = buildModel(growth, { simSpec: { stop: 4, dt: 1 } });
    const withR = compileModel(model, { overrides: { [idOf('r')]: 0 } });
    expect(withR.ok && Array.from(withR.compiled.simulate().series[idOf('S')])).toEqual([100, 100, 100, 100, 100]);
    const scenario = { id: 's_1', name: 'fast', note: '', origin: 'user' as const, overrides: [{ varId: idOf('r'), equation: '1' }], simSpec: { stop: 2 } };
    const sc = compileModel(model, { scenario });
    expect(sc.ok && Array.from(sc.compiled.simulate().series[idOf('S')])).toEqual([100, 200, 400]);
  });

  it.each([
    [{ dt: 0.3 }, /whole number of steps/],
    [{ saveEvery: 0.3, dt: 0.25 }, /multiple of DT/],
    [{ dt: 0 }, /DT must be a positive/],
    [{ stop: 0 }, /stop time must be after/],
  ])('rejects the time axis %j', (spec, message) => {
    expect(() => compile(growth).simulate(spec)).toThrow(SimulationError);
    expect(() => compile(growth).simulate(spec)).toThrow(message);
  });

  it('cancellation stops between steps and returns the rows so far', () => {
    let reads = 0;
    const signal = {
      get aborted() {
        return ++reads > 3;
      },
    };
    const r = compile(growth).simulate(undefined, { signal });
    expect(r.time).toHaveLength(3);
    expect(r.series[idOf('S')]).toHaveLength(3);
    expect(r.warnings.join()).toMatch(/cancelled at time 3/);
    expect(compile(growth).simulate(undefined, { signal: { aborted: true } }).time).toHaveLength(0);
  });

  it('warns about values that become NaN or infinite', () => {
    const r = compile([{ name: 'x', eq: 'LN(1 - TIME)' }]).simulate();
    expect(r.warnings.join()).toMatch(/"v_x" becomes -Infinity at time 1/);
  });
});

describe('assertions', () => {
  const model: VarSpec[] = [
    { name: 'Backlog', kind: 'stock', eq: '3' },
    { name: 'work', from: 'Backlog', eq: '1' },
  ];

  it('reports the first violation of each assertion at saved steps', () => {
    const c = compile(model, { stop: 6 }, [{ expr: 'Backlog >= 0' }, { expr: 'Backlog < 100' }, { expr: 'work = 1' }]);
    const r = c.simulate();
    expect(r.assertions).toEqual([{ assertionId: 'a_1', time: 4, message: 'Assertion "Backlog >= 0" failed at time 4' }]);
  });

  it('skips disabled assertions and reports broken ones as warnings without blocking the run', () => {
    const m = buildModel(model, { simSpec: { stop: 6, dt: 1 }, assertions: [{ expr: 'Backlog >= 0' }, { expr: 'Backlog >=' }, { expr: 'nope > 1' }] });
    m.assertions[0].enabled = false;
    const r = compileModel(m);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const res = r.compiled.simulate();
    expect(res.assertions).toEqual([]);
    expect(res.warnings.join('\n')).toMatch(/Assertion "Backlog >=": Unexpected end/);
    expect(res.warnings.join('\n')).toMatch(/uses "nope"/);
  });
});

describe('non-negative flows and stocks (SPEC §5)', () => {
  it('a non-negative flow is clamped at 0', () => {
    const r = simulate(buildModel([{ name: 'S', kind: 'stock', eq: '5' }, { name: 'f', to: 'S', eq: '1 - TIME', nonNegative: true }], { simSpec: { stop: 3, dt: 1 } }));
    expect(Array.from(seriesOf(r, 'f'))).toEqual([1, 0, 0, 0]);
    expect(Array.from(seriesOf(r, 'S'))).toEqual([5, 6, 6, 6]);
  });

  it('a non-negative stock limits its outflows (reported flows are the limited ones) and conserves material', () => {
    const r = simulate(
      buildModel(
        [
          { name: 'S', kind: 'stock', eq: '10', nonNegative: true },
          { name: 'T', kind: 'stock', eq: '0' },
          { name: 'drain', from: 'S', to: 'T', eq: '8' },
        ],
        { simSpec: { stop: 4, dt: 1 } },
      ),
    );
    expect(Array.from(seriesOf(r, 'S'))).toEqual([10, 2, 0, 0, 0]);
    expect(Array.from(seriesOf(r, 'drain'))).toEqual([8, 2, 0, 0, 0]);
    expect(Array.from(seriesOf(r, 'T'))).toEqual([0, 8, 10, 10, 10]);
  });

  it('outflow priority follows the order of flows in the model; same-step inflows count', () => {
    const vars: VarSpec[] = [
      { name: 'S', kind: 'stock', eq: '10', nonNegative: true },
      { name: 'first', from: 'S', eq: '6' },
      { name: 'second', from: 'S', eq: '6' },
      { name: 'refill', to: 'S', eq: '1' },
    ];
    const r = simulate(buildModel(vars, { simSpec: { stop: 2, dt: 1 } }));
    // t=0: 10 + 1 available → first 6, second 5; t≥1: only the refill (1) → first 1, second 0
    expect(Array.from(seriesOf(r, 'first'))).toEqual([6, 1, 1]);
    expect(Array.from(seriesOf(r, 'second'))).toEqual([5, 0, 0]);
    expect(Array.from(seriesOf(r, 'S'))).toEqual([10, 0, 0]);
    const swapped = simulate(buildModel([vars[0], vars[2], vars[1], vars[3]], { simSpec: { stop: 2, dt: 1 } }));
    expect(Array.from(seriesOf(swapped, 'second'))).toEqual([6, 1, 1]);
    expect(Array.from(seriesOf(swapped, 'first'))).toEqual([5, 0, 0]);
  });

  it('does not count an inflow that another non-negative stock limits later in the same step', () => {
    // A → B → C → A with B → C = 0: C cannot pay C → A, so A cannot pay A → B either.
    const r = simulate(
      buildModel(
        [
          { name: 'A', kind: 'stock', eq: '0', nonNegative: true },
          { name: 'B', kind: 'stock', eq: '0', nonNegative: true },
          { name: 'C', kind: 'stock', eq: '0', nonNegative: true },
          { name: 'ab', from: 'A', to: 'B', eq: '1' },
          { name: 'bc', from: 'B', to: 'C', eq: '0' },
          { name: 'ca', from: 'C', to: 'A', eq: '1' },
        ],
        { simSpec: { stop: 2, dt: 1 } },
      ),
    );
    for (const n of ['A', 'B', 'C']) expect(Array.from(seriesOf(r, n))).toEqual([0, 0, 0]);
    expect(Array.from(seriesOf(r, 'ab'))).toEqual([0, 0, 0]);
  });

  it('keeps a stock at or above zero at every DT under Euler (DT = 0.25)', () => {
    const r = simulate(buildModel([{ name: 'S', kind: 'stock', eq: '3', nonNegative: true }, { name: 'out', from: 'S', eq: '2 + TIME' }], { simSpec: { stop: 5, dt: 0.25 } }));
    for (const x of seriesOf(r, 'S')) expect(x).toBeGreaterThanOrEqual(0);
  });
});

describe('RK4 stage times', () => {
  it('a pulse is conserved but split across two steps (stage 4 sees it one step early)', () => {
    const r = simulate(
      buildModel([{ name: 'S', kind: 'stock', eq: '0' }, { name: 'in', to: 'S', eq: 'PULSE(1, 1)' }], { simSpec: { stop: 2, dt: 0.25, method: 'rk4' } }),
    );
    const s = seriesOf(r, 'S');
    expect(s[3]).toBe(0);
    expect(s[4]).toBeCloseTo(1 / 6, 14);
    expect(s[5]).toBeCloseTo(1, 14);
    expect(s[8]).toBeCloseTo(1, 14);
    expect(seriesOf(r, 'in')[4]).toBe(4); // recorded flows are those at (tₙ, Sₙ)
  });
});
