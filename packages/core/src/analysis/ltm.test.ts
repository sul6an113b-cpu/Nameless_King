import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildModel, idOf, type VarSpec } from '../../test/fixtures/sim/build.ts';
import type { CompiledModel, Loop, LtmResult, SimResult } from '../contracts.ts';
import { findLoops } from '../graph/index.ts';
import type { Model, SimSpec } from '../schema/model.ts';
import { compileModel } from '../sim/index.ts';
import { loopsThatMatter } from './index.ts';
import { loopLogScore, relativeScores } from './ltm.ts';

interface Analysed {
  model: Model;
  compiled: CompiledModel;
  result: SimResult;
  loops: Loop[];
  ltm: LtmResult;
}

/** Build, run with saveState, find the loops and score them. */
function analyse(vars: VarSpec[], simSpec: Partial<SimSpec>): Analysed {
  const model = buildModel(vars, { simSpec });
  const c = compileModel(model);
  if (!c.ok) throw new Error(c.errors.map((e) => e.message).join('\n'));
  const result = c.compiled.simulate(undefined, { saveState: true });
  const { loops } = findLoops(model);
  return { model, compiled: c.compiled, result, loops, ltm: loopsThatMatter(model, c.compiled, result, loops) };
}

const loopOfType = (a: Analysed, type: Loop['type']): Loop => {
  const loop = a.loops.find((l) => l.type === type);
  if (!loop) throw new Error(`no ${type} loop`);
  return loop;
};
const loopThrough = (a: Analysed, name: string): Loop => {
  const loop = a.loops.find((l) => l.varIds.includes(idOf(name)));
  if (!loop) throw new Error(`no loop through ${name}`);
  return loop;
};
const linkScoreOf = (a: Analysed, from: string, to: string): Float64Array => {
  const link = a.model.links.find((l) => l.from === idOf(from) && l.to === idOf(to));
  const scores = link && a.ltm.linkScore[link.id];
  if (!scores) throw new Error(`no scored link ${from} → ${to}`);
  return scores;
};

const exponential = (flow: VarSpec): VarSpec[] => [{ name: 'P', kind: 'stock', eq: '100' }, flow];
/** P' = births − deaths, births = r·P, deaths = r·P²/K written as ONE equation of P (RESEARCH §LTM 5.2). */
const logistic = (r: number, K: number, p0: number): VarSpec[] => [
  { name: 'P', kind: 'stock', eq: String(p0) },
  { name: 'Births', to: 'P', eq: 'r * P' },
  { name: 'Deaths', from: 'P', eq: 'r * P * P / K' },
  { name: 'r', kind: 'constant', eq: String(r) },
  { name: 'K', kind: 'constant', eq: String(K) },
];

describe('loopsThatMatter: exponential growth and decay (RESEARCH §LTM 5.1)', () => {
  it.each(['euler', 'rk4'] as const)('a single reinforcing loop scores +1 at every step after the first (%s)', (method) => {
    const a = analyse(exponential({ name: 'Births', to: 'P', eq: 'P * 0.05' }), { start: 0, stop: 20, dt: 0.25, method });
    expect(a.loops).toHaveLength(1);
    const rel = a.ltm.relScore[a.loops[0].key];
    expect(rel).toHaveLength(a.result.time.length);
    expect(rel[0]).toBe(0); // nothing has changed at the first saved time
    for (let k = 1; k < rel.length; k++) expect(rel[k]).toBeCloseTo(1, 12);
    expect(a.ltm.time).toBe(a.result.time);
    expect(a.ltm.partitions).toEqual([[a.loops[0].key]]);
    for (const scores of Object.values(a.ltm.linkScore)) for (let k = 1; k < scores.length; k++) expect(scores[k]).toBeCloseTo(1, 12);
  });

  it('an exponential drain scores −1 (a lone balancing loop)', () => {
    const a = analyse(exponential({ name: 'Deaths', from: 'P', eq: 'P * 0.1' }), { start: 0, stop: 10, dt: 0.5 });
    const rel = a.ltm.relScore[a.loops[0].key];
    expect(a.loops[0].type).toBe('B');
    for (let k = 1; k < rel.length; k++) expect(rel[k]).toBeCloseTo(-1, 12);
  });
});

describe('loopsThatMatter: logistic growth (2023 flow→stock formula, RESEARCH §LTM 5.2)', () => {
  const K = 1000;
  // Measured worst error against the closed form: 1.9e-13 (Euler) and 1.7e-13 (RK4); it comes from differencing the saved
  // flows. 1e-11 leaves 50x headroom (docs/decisions/analysis.md AN-05).
  const TOL = 1e-11;

  it.each(['euler', 'rk4'] as const)('relR = K/(K+Pₖ+Pₖ₋₁) and relB = −(Pₖ+Pₖ₋₁)/(K+Pₖ+Pₖ₋₁) at every step (%s)', (method) => {
    const a = analyse(logistic(1, K, 10), { start: 0, stop: 10, dt: 1 / 64, method });
    expect(a.loops).toHaveLength(2);
    expect(a.ltm.partitions).toHaveLength(1); // both loops share the stock P
    const P = a.result.series[idOf('P')];
    const relR = a.ltm.relScore[loopOfType(a, 'R').key];
    const relB = a.ltm.relScore[loopOfType(a, 'B').key];
    for (let k = 1; k < P.length; k++) {
      const S = P[k] + P[k - 1];
      expect(Math.abs(relR[k] - K / (K + S))).toBeLessThan(TOL);
      expect(Math.abs(relB[k] + S / (K + S))).toBeLessThan(TOL);
    }
  });

  it.each(['euler', 'rk4'] as const)('dominance passes from R to B at P ≈ K/2 (%s)', (method) => {
    const a = analyse(logistic(1, K, 10), { start: 0, stop: 10, dt: 1 / 64, method });
    const P = a.result.series[idOf('P')];
    const relR = a.ltm.relScore[loopOfType(a, 'R').key];
    const relB = a.ltm.relScore[loopOfType(a, 'B').key];
    const flip = relB.findIndex((b, k) => k > 0 && Math.abs(b) > Math.abs(relR[k]));
    expect(flip).toBeGreaterThan(1);
    // the first step with Pₖ + Pₖ₋₁ > K, i.e. right after the net flow peaks
    expect(P[flip] + P[flip - 1]).toBeGreaterThan(K);
    expect(P[flip - 1] + P[flip - 2]).toBeLessThanOrEqual(K);
    expect(Math.abs(P[flip] - K / 2)).toBeLessThan(0.02 * K);
    for (let k = 1; k < flip; k++) expect(relR[k]).toBeGreaterThanOrEqual(0.5); // R dominates before...
    for (let k = flip; k < P.length; k++) expect(-relB[k]).toBeGreaterThan(0.5); // ...and B afterwards
    expect(relR[P.length - 1]).toBeGreaterThan(0); // R keeps its sign; only the share changes
    expect(relB[P.length - 1]).toBeLessThan(0);
  });

  it('holds for any growth rate, capacity and starting size, and each partition sums to 1 (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 100, max: 5000 }), fc.integer({ min: 1, max: 99 }), (r10, cap, pct) => {
        // Stop at 6/r: the run ends before it settles at K. Deep in the equilibrium tail the scores are limited by round-off
        // in the differenced flows (error ≈ ε·P/ΔP, 1e-9 once ΔP ≈ 2e-6 at P = 106): LTM's equilibrium limitation (AN-05).
        const a = analyse(logistic(r10 / 10, cap, (cap * pct) / 200), { start: 0, stop: Math.ceil(60 / r10), dt: 1 / 16 });
        const P = a.result.series[idOf('P')];
        const relR = a.ltm.relScore[loopOfType(a, 'R').key];
        const relB = a.ltm.relScore[loopOfType(a, 'B').key];
        for (let k = 1; k < P.length; k++) {
          const S = P[k] + P[k - 1];
          expect(Math.abs(relR[k] - cap / (cap + S))).toBeLessThan(1e-9);
          expect(Math.abs(relR[k]) + Math.abs(relB[k])).toBeCloseTo(1, 9);
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe('loopsThatMatter: published fixtures', () => {
  it('P2 Table 3: the net-flow form gives LS(in→S) = 5/4 and LS(out→S) = −1/4 (the 2020 formula gives 2 and −1)', () => {
    // S: 100 → 101 → 106, in: 5 → 10, out: 4 → 5 (dt = 1); in and out depend on S so that both link loops exist
    const a = analyse(
      [
        { name: 'S', kind: 'stock', eq: '100' },
        { name: 'in', to: 'S', eq: '5 * (S - 99)' },
        { name: 'out', from: 'S', eq: 'S - 96' },
      ],
      { start: 0, stop: 2, dt: 1 },
    );
    expect(Array.from(a.result.series[idOf('S')])).toEqual([100, 101, 106]);
    expect(Array.from(a.result.series[idOf('in')])).toEqual([5, 10, 35]);
    expect(Array.from(a.result.series[idOf('out')])).toEqual([4, 5, 10]);
    const inflow = linkScoreOf(a, 'in', 'S');
    const outflow = linkScoreOf(a, 'out', 'S');
    expect(inflow[0]).toBe(0);
    expect(outflow[0]).toBe(0);
    expect(inflow[1]).toBeCloseTo(5 / 4, 12);
    expect(outflow[1]).toBeCloseTo(-1 / 4, 12);
    // one interval later the ratio is the same because both flows are linear in S
    expect(inflow[2]).toBeCloseTo(5 / 4, 12);
    expect(outflow[2]).toBeCloseTo(-1 / 4, 12);
    // P1 Eqn 1 on the other two links: each flow has a single changing input, so |Δ_S z/Δz| = 1
    expect(linkScoreOf(a, 'S', 'in')[1]).toBeCloseTo(1, 12);
    expect(linkScoreOf(a, 'S', 'out')[1]).toBeCloseTo(1, 12);
    // loop scores 5/4 and −1/4 → relative 5/6 and −1/6
    expect(a.ltm.relScore[loopThrough(a, 'in').key][1]).toBeCloseTo(5 / 6, 12);
    expect(a.ltm.relScore[loopThrough(a, 'out').key][1]).toBeCloseTo(-1 / 6, 12);
  });

  it('P1 Table 2: z = (w + x)/y gives link scores +5, +10/3 and −6 (signed, and larger than 1)', () => {
    // W: 7 → 10, X: 2 → 4, Y: 3 → 5 and z: 3 → 2.8 over the first step (dt = 1); z feeds each stock so its links are on loops
    const a = analyse(
      [
        { name: 'W', kind: 'stock', eq: '7' },
        { name: 'X', kind: 'stock', eq: '2' },
        { name: 'Y', kind: 'stock', eq: '3' },
        { name: 'z', eq: '(W + X) / Y' },
        { name: 'FW', to: 'W', eq: 'z' },
        { name: 'FX', to: 'X', eq: 'z * 2 / 3' },
        { name: 'FY', to: 'Y', eq: 'z * 2 / 3' },
      ],
      { start: 0, stop: 2, dt: 1 },
    );
    expect(a.loops).toHaveLength(3);
    expect(linkScoreOf(a, 'W', 'z')[1]).toBeCloseTo(5, 12);
    expect(linkScoreOf(a, 'X', 'z')[1]).toBeCloseTo(10 / 3, 12);
    expect(linkScoreOf(a, 'Y', 'z')[1]).toBeCloseTo(-6, 12);
    // z → FW and FW → W score +1, so the loop scores are the three z-links: relative = score / (5 + 10/3 + 6)
    const total = 5 + 10 / 3 + 6;
    expect(a.ltm.relScore[loopThrough(a, 'FW').key][1]).toBeCloseTo(5 / total, 12);
    expect(a.ltm.relScore[loopThrough(a, 'FX').key][1]).toBeCloseTo(10 / 3 / total, 12);
    expect(a.ltm.relScore[loopThrough(a, 'FY').key][1]).toBeCloseTo(-6 / total, 12);
  });
});

describe('loopsThatMatter: normalisation per cycle partition', () => {
  it('loops in different strongly connected components never dilute each other', () => {
    const a = analyse(
      [
        ...logistic(1, 1000, 10),
        { name: 'Q', kind: 'stock', eq: '5' },
        { name: 'Gain', to: 'Q', eq: 'Q * 0.5' },
      ],
      { start: 0, stop: 8, dt: 1 / 16 },
    );
    expect(a.loops).toHaveLength(3);
    expect(a.ltm.partitions.map((p) => p.length).sort()).toEqual([1, 2]);
    const gain = a.ltm.relScore[loopThrough(a, 'Gain').key];
    const births = a.ltm.relScore[loopThrough(a, 'Births').key];
    const deaths = a.ltm.relScore[loopThrough(a, 'Deaths').key];
    for (let k = 1; k < gain.length; k++) {
      expect(gain[k]).toBeCloseTo(1, 12); // alone in its component; a global sum would give it about a third
      expect(Math.abs(births[k]) + Math.abs(deaths[k])).toBeCloseTo(1, 12);
    }
  });

  it('follows the causal graph, not the loops passed in: a truncated loop set keeps its partition', () => {
    const a = analyse(logistic(1, 1000, 10), { start: 0, stop: 4, dt: 0.25 });
    const only = loopsThatMatter(a.model, a.compiled, a.result, [loopOfType(a, 'R')]);
    const rel = only.relScore[loopOfType(a, 'R').key];
    for (let k = 1; k < rel.length; k++) expect(rel[k]).toBeCloseTo(1, 12); // relative to the loops scored: just this one
    expect(only.partitions).toEqual([[loopOfType(a, 'R').key]]);
    expect(Object.keys(only.linkScore)).toHaveLength(2); // only the links of the loops that were passed in
  });

  it('gives no scores, and no partitions, for no loops', () => {
    const a = analyse(logistic(1, 1000, 10), { start: 0, stop: 1, dt: 0.25 });
    expect(loopsThatMatter(a.model, a.compiled, a.result, [])).toEqual({
      time: a.result.time,
      relScore: {},
      linkScore: {},
      partitions: [],
    });
  });
});

describe('loopsThatMatter: log-magnitude products', () => {
  const links = (scores: number[]) => scores.map((s) => Float64Array.of(s));
  const naive = (scores: number[]) => scores.reduce((p, s) => p * s, 1);

  it('multiplies link scores as log-magnitude and sign', () => {
    const one = loopLogScore(links([2, 3, 0.5]), 0);
    expect(one.sign).toBe(1);
    expect(one.log).toBeCloseTo(Math.log(3), 12);
    expect(loopLogScore(links([2, -3]), 0).sign).toBe(-1);
    expect(loopLogScore(links([-2, -3, -0.5, -1]), 0).sign).toBe(1); // an even number of negative links
    expect(loopLogScore(links([2, 0, 3]), 0)).toEqual({ log: -Infinity, sign: 0 }); // an inactive link zeroes the loop
    expect(loopLogScore(links([2, Number.NaN]), 0).sign).toBe(0);
  });

  it('survives products far beyond the double range', () => {
    const huge = Array<number>(400).fill(1e10); // 1e4000
    const tiny = Array<number>(400).fill(1e-10); // 1e-4000
    expect(naive(huge)).toBe(Infinity);
    expect(naive(tiny)).toBe(0);
    expect(loopLogScore(links(huge), 0).log).toBeCloseTo(400 * Math.log(1e10), 9);
    expect(loopLogScore(links(tiny), 0).log).toBeCloseTo(-400 * Math.log(1e10), 9);
  });

  it('normalises loops whose scores over- or underflow as plain numbers (relative 1/4 and −3/4)', () => {
    const out = new Float64Array(2);
    for (const scale of [1e10, 1e-10]) {
      const a = loopLogScore(links(Array<number>(400).fill(scale)), 0);
      const b = loopLogScore(links([...Array<number>(399).fill(scale), -3 * scale]), 0); // −3 × the other loop
      relativeScores([a.log, b.log], [a.sign, b.sign], out);
      expect(out[0]).toBeCloseTo(0.25, 12);
      expect(out[1]).toBeCloseTo(-0.75, 12);
    }
  });

  it('treats inactive loops as 0 and an all-inactive partition as 0', () => {
    const out = new Float64Array(3).fill(9);
    relativeScores([-Infinity, 2, 2], [0, 1, -1], out);
    expect(Array.from(out)).toEqual([0, 0.5, -0.5]);
    relativeScores([-Infinity, -Infinity, -Infinity], [0, 0, 0], out);
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });
});

describe('loopsThatMatter: builtins and inputs', () => {
  it('re-evaluates equations that contain a builtin using the hidden state saved at the previous step', () => {
    // Births = r·P·(1 + 0.01·SMTH1(TIME, 2)): the smoothed value lives in a hidden slot outside the user variables
    const a = analyse(
      [
        { name: 'P', kind: 'stock', eq: '100' },
        { name: 'Births', to: 'P', eq: 'r * P * (1 + SMTH1(TIME, 2) * 0.01)' },
        { name: 'r', kind: 'constant', eq: '0.05' },
      ],
      { start: 0, stop: 5, dt: 0.5 },
    );
    expect(a.compiled.size).toBeGreaterThan(a.compiled.varIds.length);
    const P = a.result.series[idOf('P')];
    const births = a.result.series[idOf('Births')];
    const hidden = (k: number) => (a.result.state ?? [])[k][a.compiled.varIds.length];
    const ls = linkScoreOf(a, 'P', 'Births');
    expect(hidden(4)).toBeGreaterThan(0);
    for (let k = 1; k < P.length; k++) {
      // Δ_P births uses the smoothed value of the PREVIOUS step: r·ΔP·(1 + 0.01·s(k−1)); the change of s itself is not P's
      const expected = Math.abs((0.05 * (P[k] - P[k - 1]) * (1 + 0.01 * hidden(k - 1))) / (births[k] - births[k - 1]));
      expect(ls[k]).toBeCloseTo(expected, 10);
      // The smoothed value starts at TIME(0) = 0 and stays there for one step, so from the second step on part of Δbirths
      // comes from it and the link to P explains less than all of it
      if (k >= 2) expect(ls[k]).toBeLessThan(1);
    }
  });

  it('known limitation: links that pass through a SMOOTH/DELAY builtin score 0, and so do their loops (AN-02)', () => {
    const a = analyse(
      [
        { name: 'P', kind: 'stock', eq: '100' },
        { name: 'Perceived', eq: 'SMTH1(P, 3)' },
        { name: 'Births', to: 'P', eq: 'r * Perceived' },
        { name: 'r', kind: 'constant', eq: '0.05' },
      ],
      { start: 0, stop: 5, dt: 0.5 },
    );
    expect(a.loops).toHaveLength(1);
    const through = linkScoreOf(a, 'P', 'Perceived');
    const direct = linkScoreOf(a, 'Perceived', 'Births');
    for (let k = 1; k < through.length; k++) {
      expect(through[k]).toBe(0); // z reads only the builtin's hidden stock
      if (k >= 2) expect(direct[k]).toBeCloseTo(1, 12); // the smoothed value starts equal to P and first moves at step 2
      expect(a.ltm.relScore[a.loops[0].key][k]).toBe(0);
    }
  });

  it('is deterministic', () => {
    const a = analyse(logistic(1, 1000, 10), { start: 0, stop: 6, dt: 1 / 16 });
    expect(loopsThatMatter(a.model, a.compiled, a.result, a.loops)).toEqual(a.ltm);
  });

  it('rejects a run saved without the state, a stale loop and mismatched vectors', () => {
    const a = analyse(logistic(1, 1000, 10), { start: 0, stop: 2, dt: 0.5 });
    const { state: _state, ...bare } = a.result;
    expect(() => loopsThatMatter(a.model, a.compiled, bare, a.loops)).toThrow(/saveState/);
    expect(() => loopsThatMatter(a.model, a.compiled, a.result, [{ ...a.loops[0], linkIds: ['l_gone', 'l_gone2'] }])).toThrow(
      /link "l_gone".*not in the model/,
    );
    expect(() => loopsThatMatter(a.model, a.compiled, a.result, [{ ...a.loops[0], varIds: ['v_gone'] }])).toThrow(
      /variable that is not in the model/,
    );
    const short = { ...a.result, state: (a.result.state ?? []).map((vec) => vec.slice(1)) };
    expect(() => loopsThatMatter(a.model, a.compiled, short, a.loops)).toThrow(/state vectors must have/);
    const fewer = { ...a.result, state: (a.result.state ?? []).slice(1) };
    expect(() => loopsThatMatter(a.model, a.compiled, fewer, a.loops)).toThrow(/state vectors for/);
  });
});
