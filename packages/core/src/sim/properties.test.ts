/** Engine invariants (fast-check): conservation in closed stock-flow chains; independence of file order. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildModel, type VarSpec } from '../../test/fixtures/sim/build.ts';
import type { Model } from '../schema/model.ts';
import { simulate } from './index.ts';

const METHODS = ['euler', 'rk4'] as const;

/** Ring of n stocks; flow i moves material from stock i to stock i+1. */
const ringArb = fc.record({
  inits: fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { minLength: 2, maxLength: 6 }),
  rates: fc.array(fc.double({ min: 0, max: 0.5, noNaN: true }), { minLength: 6, maxLength: 6 }),
  dt: fc.constantFrom(1, 0.5, 0.25),
});

function ring(inits: number[], flowEq: (i: number) => string, nonNegative: boolean): VarSpec[] {
  const n = inits.length;
  return [
    ...inits.map((x, i): VarSpec => ({ name: `S${i}`, kind: 'stock', eq: String(x), nonNegative })),
    ...inits.map((_, i): VarSpec => ({ name: `f${i}`, from: `S${i}`, to: `S${(i + 1) % n}`, eq: flowEq(i) })),
  ];
}

function totals(model: Model, method: (typeof METHODS)[number]) {
  const r = simulate(model, { method });
  const stocks = model.variables.filter((v) => v.kind === 'stock').map((v) => r.series[v.id]);
  return { r, stocks, total: Array.from(r.time, (_, k) => stocks.reduce((s, col) => s + col[k], 0)) };
}

describe('conservation in a closed stock-flow chain', () => {
  it('property: the sum of stocks never changes (proportional flows, Euler and RK4)', () => {
    fc.assert(
      fc.property(ringArb, fc.constantFrom(...METHODS), ({ inits, rates, dt }, method) => {
        const model = buildModel(ring(inits, (i) => `${rates[i]} * S${i}`, false), { simSpec: { start: 0, stop: 10, dt } });
        const { total } = totals(model, method);
        const t0 = total[0];
        for (const t of total) expect(Math.abs(t - t0)).toBeLessThanOrEqual(1e-9 * Math.max(1, t0));
      }),
      { numRuns: 60 },
    );
  });

  it('property: non-negative stocks with constant drains conserve material and stay ≥ 0 (Euler)', () => {
    fc.assert(
      fc.property(ringArb, fc.array(fc.double({ min: 0, max: 200, noNaN: true }), { minLength: 6, maxLength: 6 }), ({ inits, dt }, drains) => {
        const model = buildModel(ring(inits, (i) => String(drains[i]), true), { simSpec: { start: 0, stop: 10, dt } });
        const { total, stocks } = totals(model, 'euler');
        const t0 = total[0];
        for (const t of total) expect(Math.abs(t - t0)).toBeLessThanOrEqual(1e-9 * Math.max(1, t0));
        for (const col of stocks) for (const x of col) expect(x).toBeGreaterThanOrEqual(-1e-9 * Math.max(1, t0));
      }),
      { numRuns: 60 },
    );
  });
});

// ── random models, shuffled ────────────────────────────────────────────────

const modelArb = fc
  .record({
    stocks: fc.array(fc.double({ min: -100, max: 100, noNaN: true }), { minLength: 1, maxLength: 4 }),
    auxes: fc.array(fc.tuple(fc.double({ min: -1, max: 1, noNaN: true }), fc.nat(), fc.nat()), { maxLength: 6 }),
    flows: fc.array(fc.tuple(fc.nat(), fc.nat(), fc.double({ min: -0.3, max: 0.3, noNaN: true }), fc.nat()), {
      minLength: 1,
      maxLength: 5,
    }),
    smooth: fc.boolean(),
  })
  .map(({ stocks, auxes, flows, smooth }): VarSpec[] => {
    const nS = stocks.length;
    const vars: VarSpec[] = stocks.map((x, i) => ({ name: `S${i}`, kind: 'stock', eq: String(x) }));
    const names = vars.map((v) => v.name);
    auxes.forEach(([c, p, q], j) => {
      const a = names[p % names.length];
      const b = names[q % names.length];
      vars.push({ name: `a${j}`, eq: `${c} * ${a} + ${a} * ${b} / (1 + ABS(${b}))` });
      names.push(`a${j}`);
    });
    if (smooth) {
      vars.push({ name: 'sm', eq: `SMTH1(${names[names.length - 1]}, 2) + DELAY1(S0, 1.5)` });
      names.push('sm');
    }
    flows.forEach(([from, to, c, src], k) => {
      const f = from % (nS + 1);
      const t = to % (nS + 1);
      vars.push({
        name: `f${k}`,
        ...(f < nS ? { from: `S${f}` } : {}),
        ...(t < nS && t !== f ? { to: `S${t}` } : {}),
        ...(f >= nS && (t >= nS || t === f) ? { to: 'S0' } : {}),
        eq: `${c} * ${names[src % names.length]} + MIN(TIME, 3)`,
      });
    });
    return vars;
  });

describe('results are independent of variable order in the file', () => {
  it('property: shuffling variables and links gives bit-identical results', () => {
    fc.assert(
      fc.property(
        modelArb.chain((vars) => fc.tuple(fc.constant(vars), fc.shuffledSubarray(vars, { minLength: vars.length }))),
        fc.constantFrom(...METHODS),
        ([vars, shuffled], method) => {
          const spec = { simSpec: { start: 0, stop: 5, dt: 0.25, method } };
          const a = buildModel(vars, spec);
          const b = buildModel(shuffled, spec);
          const shuffledLinks = { ...b, links: [...b.links].reverse() };
          const ra = simulate(a);
          const rb = simulate(shuffledLinks);
          expect(Object.keys(rb.series).sort()).toEqual(Object.keys(ra.series).sort());
          for (const id of Object.keys(ra.series)) expect(Array.from(rb.series[id])).toEqual(Array.from(ra.series[id]));
        },
      ),
      { numRuns: 100 },
    );
  });
});
