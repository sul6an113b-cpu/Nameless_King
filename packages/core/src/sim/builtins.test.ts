/**
 * Builtin semantics (SPEC §5, RESEARCH §XMILE 2): test inputs on the DT grid, stateful builtins against
 * their explicit stock-flow equivalents and closed-form step responses, math and lookups.
 */
import { describe, expect, it } from 'vitest';
import { buildModel, seriesOf, type VarSpec } from '../../test/fixtures/sim/build.ts';
import type { SimSpec } from '../schema/model.ts';
import { simulate, SimulationError } from './index.ts';

function run(vars: VarSpec[], simSpec: Partial<SimSpec> = {}) {
  const r = simulate(buildModel(vars, { simSpec: { start: 0, stop: 4, dt: 0.25, ...simSpec } }));
  return { time: Array.from(r.time), get: (name: string) => Array.from(seriesOf(r, name)) };
}

/** Value of a single auxiliary equation at every saved step. */
const aux = (eq: string, simSpec: Partial<SimSpec> = {}) => run([{ name: 'y', eq }], simSpec).get('y');

describe('time and test inputs on the DT grid', () => {
  it('TIME is start + n·DT, never accumulated', () => {
    const t = aux('TIME', { start: 0, stop: 1, dt: 0.1 });
    expect(t).toHaveLength(11);
    t.forEach((x, n) => expect(x).toBe(n * 0.1));
    expect(t[10]).toBe(1);
  });

  it('DT, STARTTIME and STOPTIME', () => {
    expect(aux('DT + 10 * STARTTIME + 100 * STOPTIME', { start: 1, stop: 3, dt: 0.5 })[0]).toBe(0.5 + 10 + 300);
  });

  it('STEP(h, t0) switches at the grid time nearest t0 (TIME + DT/2 > t0)', () => {
    const on = (eq: string) => aux(eq).findIndex((x) => x !== 0) * 0.25;
    expect(aux('STEP(5, 2)').slice(6, 10)).toEqual([0, 0, 5, 5]);
    expect(on('STEP(5, 2)')).toBe(2);
    expect(on('STEP(5, 2.1)')).toBe(2); // nearest grid point
    expect(on('STEP(5, 2.2)')).toBe(2.25);
    expect(aux('STEP(5, 0)')[0]).toBe(5);
    expect(on('STEP(1, 1)')).toBe(1);
  });

  it('PULSE(volume, first) is volume/DT for one DT; a stock fed by it gains exactly the volume', () => {
    const r = run([
      { name: 'p', eq: 'PULSE(10, 1)' },
      { name: 'S', kind: 'stock', eq: '0' },
      { name: 'in', to: 'S', eq: 'p' },
    ]);
    const p = r.get('p');
    expect(p.filter((x) => x !== 0)).toEqual([40]);
    expect(p[4]).toBe(40); // t = 1
    expect(r.get('S')[16]).toBe(10);
    expect(aux('PULSE(10, 1, 0)')).toEqual(p);
  });

  it('PULSE(volume, first, interval) repeats every interval', () => {
    const p = aux('PULSE(10, 1, 2)', { stop: 6 });
    const times = p.flatMap((x, n) => (x !== 0 ? [n * 0.25] : []));
    expect(times).toEqual([1, 3, 5]);
  });

  it('PULSE fires on the right step despite binary fractions (DT = 0.1)', () => {
    const p = aux('PULSE(1, 0.3, 0.3)', { stop: 1.2, dt: 0.1 });
    const times = p.flatMap((x, n) => (x !== 0 ? [n] : []));
    expect(times).toEqual([3, 6, 9, 12]);
  });

  it('PULSE with an off-grid first time fires at the next grid time', () => {
    const p = aux('PULSE(1, 1.1)');
    expect(p.findIndex((x) => x !== 0) * 0.25).toBe(1.25);
  });

  it('RAMP(slope, start[, end])', () => {
    expect(aux('RAMP(2, 1)').filter((_, n) => n % 4 === 0)).toEqual([0, 0, 2, 4, 6]);
    expect(aux('RAMP(2, 1, 3)').filter((_, n) => n % 4 === 0)).toEqual([0, 0, 2, 4, 4]);
  });
});

describe('math, logic and operators', () => {
  it.each([
    ['-2^2', -4],
    ['2^3^2', 512],
    ['4 - 5 + 6', 5],
    ['INT(-9.9)', -10], // XMILE INT = floor
    ['-10 MOD 3', 2], // floored modulus: sign of the divisor
    ['10 MOD -3', -2],
    ['7.5 MOD 2', 1.5],
    ['3/4 = 0.75', 1],
    ['1 <> 1', 0],
    ['(2 < 3) + (3 <= 3) + (4 > 5) + (5 >= 5)', 3],
    ['1 AND 0', 0],
    ['1 OR 0', 1],
    ['NOT 0', 1],
    ['NOT 2', 0],
    ['IF 0 THEN 1 ELSE 2', 2],
    ['if_then_else(1, 5, 6)', 5],
    ['MIN(3, -1) + MAX(3, -1)', 2],
    ['ABS(-2) + SQRT(16)', 6],
    ['EXP(0) + LN(1) + LOG10(1000)', 4],
    ['SIN(PI/2) + COS(0) + TAN(0)', 2],
    ['ARCTAN(1) * 4 - PI', 0],
    ['ARCSIN(1) - ARCCOS(0)', 0],
    ['SAFEDIV(6, 3)', 2],
    ['SAFEDIV(1, 0)', 0],
    ['SAFEDIV(1, 0, 5)', 5],
    ['1 / 0', Infinity],
    ['INF', Infinity],
  ])('%s = %s', (eq, expected) => {
    expect(aux(eq)[0]).toBeCloseTo(expected, 12);
  });

  it('evaluates time-varying logic every step', () => {
    expect(aux('IF TIME >= 1 AND TIME < 2 THEN 1 ELSE 0').reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe('graphical functions', () => {
  const table = { xs: [0, 1, 2], ys: [0, 10, 5] };
  const lookup = (mode: 'continuous' | 'extrapolate' | 'discrete', x: string) =>
    run([
      { name: 'effect', kind: 'lookup', graph: { ...table, mode } },
      { name: 'y', eq: `effect(${x})` },
      { name: 'z', eq: `LOOKUP(effect, ${x})` },
    ]);

  it.each([
    ['continuous', '-1', 0],
    ['continuous', '0.5', 5],
    ['continuous', '1.5', 7.5],
    ['continuous', '3', 5],
    ['extrapolate', '-1', -10],
    ['extrapolate', '3', 0],
    ['discrete', '0.5', 0],
    ['discrete', '1', 10],
    ['discrete', '1.99', 10],
    ['discrete', '2', 5],
    ['discrete', '9', 5],
  ] as const)('%s at x = %s → %s', (mode, x, expected) => {
    const r = lookup(mode, x);
    expect(r.get('y')[0]).toBeCloseTo(expected, 12);
    expect(r.get('z')[0]).toBeCloseTo(expected, 12);
  });

  it('applies an embedded table to the equation result (aux with graph)', () => {
    const r = run([{ name: 'y', eq: 'TIME / 2', graph: table }]);
    expect(r.get('y').filter((_, n) => n % 4 === 0)).toEqual([0, 5, 10, 7.5, 5]);
  });
});

// ── stateful builtins ──────────────────────────────────────────────────────

const INPUT: VarSpec = { name: 'input', eq: '10 + STEP(5, 1) + RAMP(2, 2)' };

/** Builtin output vs the same structure written with explicit stocks and flows (Euler and RK4). */
describe('stateful builtins equal their stock-flow equivalents', () => {
  const cases: { name: string; builtin: string; explicit: VarSpec[]; out: string }[] = [
    {
      name: 'SMTH1(input, 3)',
      builtin: 'SMTH1(input, 3)',
      explicit: [
        { name: 'S', kind: 'stock', eq: 'input' },
        { name: 'change', to: 'S', eq: '(input - S) / 3' },
      ],
      out: 'S',
    },
    {
      name: 'SMOOTH(input, 3, 7)',
      builtin: 'SMOOTH(input, 3, 7)',
      explicit: [
        { name: 'S', kind: 'stock', eq: '7' },
        { name: 'change', to: 'S', eq: '(input - S) / 3' },
      ],
      out: 'S',
    },
    {
      name: 'SMTH3(input, 3)',
      builtin: 'SMTH3(input, 3)',
      explicit: [
        { name: 'S1', kind: 'stock', eq: 'input' },
        { name: 'S2', kind: 'stock', eq: 'input' },
        { name: 'S3', kind: 'stock', eq: 'input' },
        { name: 'c1', to: 'S1', eq: '(input - S1) / 1' },
        { name: 'c2', to: 'S2', eq: '(S1 - S2) / 1' },
        { name: 'c3', to: 'S3', eq: '(S2 - S3) / 1' },
      ],
      out: 'S3',
    },
    {
      name: 'DELAY1(input, 3)',
      builtin: 'DELAY1(input, 3)',
      explicit: [
        { name: 'S', kind: 'stock', eq: 'input * 3' },
        { name: 'inflow', to: 'S', eq: 'input' },
        { name: 'outflow', from: 'S', eq: 'S / 3' },
      ],
      out: 'outflow',
    },
    {
      name: 'DELAY1(input, 3, 2)',
      builtin: 'DELAY1(input, 3, 2)',
      explicit: [
        { name: 'S', kind: 'stock', eq: '2 * 3' },
        { name: 'inflow', to: 'S', eq: 'input' },
        { name: 'outflow', from: 'S', eq: 'S / 3' },
      ],
      out: 'outflow',
    },
    {
      name: 'DELAY3(input, 3)',
      builtin: 'DELAY3(input, 3)',
      explicit: [
        { name: 'S1', kind: 'stock', eq: 'input * 1' },
        { name: 'S2', kind: 'stock', eq: 'input * 1' },
        { name: 'S3', kind: 'stock', eq: 'input * 1' },
        { name: 'in', to: 'S1', eq: 'input' },
        { name: 'f1', from: 'S1', to: 'S2', eq: 'S1 / 1' },
        { name: 'f2', from: 'S2', to: 'S3', eq: 'S2 / 1' },
        { name: 'out', from: 'S3', eq: 'S3 / 1' },
      ],
      out: 'out',
    },
  ];

  for (const c of cases)
    for (const method of ['euler', 'rk4'] as const)
      it(`${c.name} (${method})`, () => {
        const spec = { stop: 12, dt: 0.25, method };
        const b = run([INPUT, { name: 'y', eq: c.builtin }], spec).get('y');
        const e = run([INPUT, ...c.explicit], spec).get(c.out);
        expect(b).toHaveLength(49);
        b.forEach((x, i) => expect(x).toBeCloseTo(e[i], 12));
      });
});

// DT = 1/32 keeps RK4 truncation (stage rate·DT ≤ 0.08 for the 5-stage cases) well below the 1e-6 tolerance.
describe('stateful builtins: closed-form step responses (RK4, DT = 1/32)', () => {
  const tau = 2;
  const erlangCdf = (n: number, t: number) => {
    const x = (n * t) / tau;
    let sum = 0;
    let term = 1;
    for (let k = 0; k < n; k++) {
      sum += term;
      term *= x / (k + 1);
    }
    return 1 - Math.exp(-x) * sum;
  };
  it.each([
    ['SMTH1(1, 2, 0)', 1],
    ['DELAY1(1, 2, 0)', 1],
    ['SMTH3(1, 2, 0)', 3],
    ['DELAY3(1, 2, 0)', 3],
    ['SMTHN(1, 2, 5, 0)', 5],
    ['DELAYN(1, 2, 5, 0)', 5],
  ])('%s follows the Erlang-%i step response', (eq, n) => {
    const r = run([{ name: 'y', eq }], { stop: 10, dt: 1 / 32, method: 'rk4' });
    const y = r.get('y');
    y.forEach((v, i) => expect(Math.abs(v - erlangCdf(n, r.time[i]))).toBeLessThan(1e-6));
  });
});

describe('other stateful builtins', () => {
  it('DELAY(input, τ) is the input τ ago, or the initial value before that', () => {
    const r = run([{ name: 'y', eq: 'DELAY(TIME * 10, 1)' }, { name: 'z', eq: 'DELAY(TIME * 10, 1, 7)' }], { dt: 0.5 });
    expect(r.get('y')).toEqual([0, 0, 0, 5, 10, 15, 20, 25, 30]);
    expect(r.get('z')).toEqual([7, 7, 0, 5, 10, 15, 20, 25, 30]);
  });

  it('DELAY with a delay time that is not a multiple of DT is an error', () => {
    expect(() => aux('DELAY(TIME, 0.3)')).toThrow(SimulationError);
    expect(() => aux('DELAY(TIME, 0.3)')).toThrow(/multiple of DT/);
  });

  it('PREVIOUS(x, init) is x one DT ago and breaks algebraic loops', () => {
    const r = run([
      { name: 'p', eq: 'PREVIOUS(TIME, -1)' },
      { name: 'count', eq: 'PREVIOUS(count, 0) + 1' },
    ]);
    expect(r.get('p').slice(0, 4)).toEqual([-1, 0, 0.25, 0.5]);
    expect(r.get('count').slice(0, 4)).toEqual([1, 2, 3, 4]);
  });

  it('INIT(x) freezes the value of x at the start', () => {
    const r = run([
      { name: 'x', eq: '5 + TIME' },
      { name: 'y', eq: 'INIT(x) * 2' },
    ]);
    expect(new Set(r.get('y'))).toEqual(new Set([10]));
  });

  it('stateful builtins inside IF branches update every step, whichever branch is taken', () => {
    const r = run(
      [
        INPUT,
        { name: 'guarded', eq: 'IF TIME < 3 THEN 0 ELSE SMTH1(input, 1)' },
        { name: 'always', eq: 'SMTH1(input, 1)' },
      ],
      { stop: 6 },
    );
    const g = r.get('guarded');
    const a = r.get('always');
    r.time.forEach((t, i) => expect(g[i]).toBe(t < 3 ? 0 : a[i]));
  });

  it('nested stateful builtins', () => {
    const r = run(
      [INPUT, { name: 'y', eq: 'SMTH1(SMTH1(input, 2), 2)' }, { name: 'z', eq: 'SMTH3(input, 6) * 0 + SMTH1(DELAY1(input, 1), 1)' }],
      { stop: 8 },
    );
    expect(r.get('y')[0]).toBe(10);
    expect(r.get('y').at(-1)).toBeGreaterThan(10);
    expect(r.get('z')[0]).toBe(10);
  });

  it('a missing initial value uses the input at STARTTIME', () => {
    const r = run([{ name: 'x', eq: '3 + TIME' }, { name: 'y', eq: 'SMTH1(x, 1)' }, { name: 'd', eq: 'DELAY3(x, 1)' }], {
      start: 2,
      stop: 3,
    });
    expect(r.get('y')[0]).toBe(5);
    expect(r.get('d')[0]).toBe(5);
  });
});
