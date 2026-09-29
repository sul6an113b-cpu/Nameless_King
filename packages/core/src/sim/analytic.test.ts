/**
 * Acceptance criterion 3 (SPEC §11 row 3): RK4 matches analytic solutions within 1e-6 relative error, and
 * the measured convergence order over DT ∈ {1, 1/2, 1/4} is 1 ± 0.3 for Euler and 4 ± 0.3 for RK4.
 *
 * Parameter choice: growth/decay rates of 0.1–0.2 per time unit keep r·DT ≤ 0.2, inside the asymptotic
 * range where the leading error term dominates (so the measured order is the true order), while the RK4
 * errors at the final time stay between ~1e-6 and ~4e-4 in absolute terms — at least seven orders of
 * magnitude above double-precision round-off for values of 100–1000 — so the error ratios are not noise.
 * The 1e-6 accuracy check uses the default DT = 1/4 (measured worst case 3.3e-8).
 */
import { describe, expect, it } from 'vitest';
import { buildModel, seriesOf, type VarSpec } from '../../test/fixtures/sim/build.ts';
import { simulate } from './index.ts';

interface Case {
  name: string;
  vars: VarSpec[];
  stop: number;
  exact: (t: number) => number;
}

const CASES: Case[] = [
  {
    name: 'exponential growth dS/dt = 0.1·S',
    vars: [
      { name: 'S', kind: 'stock', eq: '100' },
      { name: 'growth', to: 'S', eq: '0.1 * S' },
    ],
    stop: 10,
    exact: (t) => 100 * Math.exp(0.1 * t),
  },
  {
    name: 'first-order goal seeking dS/dt = (100 − S)/5',
    vars: [
      { name: 'S', kind: 'stock', eq: '10' },
      { name: 'goal', kind: 'constant', eq: '100' },
      { name: 'adjustment time', kind: 'constant', eq: '5' },
      { name: 'adjustment', to: 'S', eq: '(goal - S) / adjustment_time' },
    ],
    stop: 10,
    exact: (t) => 100 - 90 * Math.exp(-t / 5),
  },
  {
    name: 'logistic growth dS/dt = 0.1·S·(1 − S/1000)',
    vars: [
      { name: 'S', kind: 'stock', eq: '10' },
      { name: 'r', kind: 'constant', eq: '0.1' },
      { name: 'K', kind: 'constant', eq: '1000' },
      { name: 'net growth', to: 'S', eq: 'r * S * (1 - S / K)' },
    ],
    stop: 60,
    exact: (t) => 1000 / (1 + 99 * Math.exp(-0.1 * t)),
  },
];

function run(c: Case, method: 'euler' | 'rk4', dt: number) {
  const r = simulate(buildModel(c.vars, { simSpec: { start: 0, stop: c.stop, dt, method } }));
  const s = seriesOf(r, 'S');
  let maxRel = 0;
  for (let i = 0; i < s.length; i++) maxRel = Math.max(maxRel, Math.abs(s[i] - c.exact(r.time[i])) / Math.abs(c.exact(r.time[i])));
  return { finalErr: Math.abs(s[s.length - 1] - c.exact(c.stop)), maxRel, rows: s.length };
}

describe('analytic solutions', () => {
  for (const c of CASES) {
    it(`${c.name}: RK4 within 1e-6 relative error at every saved step (DT = 1/4)`, () => {
      const r = run(c, 'rk4', 0.25);
      expect(r.rows).toBe(c.stop / 0.25 + 1);
      expect(r.maxRel).toBeLessThan(1e-6);
    });

    for (const [method, order] of [
      ['euler', 1],
      ['rk4', 4],
    ] as const) {
      it(`${c.name}: ${method} convergence order ${order} ± 0.3 over DT ∈ {1, 1/2, 1/4}`, () => {
        const [e1, e2, e4] = [1, 0.5, 0.25].map((dt) => run(c, method, dt).finalErr);
        const p12 = Math.log2(e1 / e2);
        const p24 = Math.log2(e2 / e4);
        expect(Math.abs(p12 - order)).toBeLessThanOrEqual(0.3);
        expect(Math.abs(p24 - order)).toBeLessThanOrEqual(0.3);
        // errors must be far above round-off for the ratio to mean anything
        expect(e4).toBeGreaterThan(1e-9 * Math.abs(c.exact(c.stop)));
      });
    }
  }
});
