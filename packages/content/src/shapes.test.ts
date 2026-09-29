import { describe, expect, it } from 'vitest';
import { SHAPES, SHAPE_IDS, classifyShape, explainShape, matchesShape } from './shapes.ts';
import type { ShapeId } from './types.ts';

/** Sample f on [0, horizon] with n + 1 equally spaced points. */
const sample = (f: (t: number) => number, horizon = 60, n = 240): number[] =>
  Array.from({ length: n + 1 }, (_, i) => f((i * horizon) / n));

const logistic = (t: number, k = 1000, r = 0.15, n0 = 10) => k / (1 + ((k - n0) / n0) * Math.exp(-r * t));

/** Synthetic series with the shape each one must (and some must not) match. */
const cases: { name: string; series: number[]; is: ShapeId[]; isNot: ShapeId[] }[] = [
  {
    name: 'exponential growth e^(0.05t)',
    series: sample((t) => Math.exp(0.05 * t)),
    is: ['exponential-growth', 'escalation'],
    isNot: [
      'goal-seeking',
      's-shaped',
      'overshoot-and-collapse',
      'oscillation',
      'growth-then-stagnation',
      'goal-erosion',
      'better-before-worse',
    ],
  },
  {
    name: 'goal seeking upward 100(1 − e^(−t/10))',
    series: sample((t) => 100 * (1 - Math.exp(-t / 10))),
    is: ['goal-seeking', 'growth-then-stagnation'],
    isNot: ['exponential-growth', 's-shaped', 'escalation', 'oscillation', 'divergence', 'overshoot-and-collapse'],
  },
  {
    name: 'goal seeking downward 20 + 80e^(−t/10)',
    series: sample((t) => 20 + 80 * Math.exp(-t / 10)),
    is: ['goal-seeking'],
    isNot: ['goal-erosion', 'exponential-growth', 's-shaped', 'oscillation'],
  },
  {
    name: 'logistic (S-shaped) growth',
    series: sample((t) => logistic(t)),
    is: ['s-shaped'],
    isNot: [
      'exponential-growth',
      'goal-seeking',
      'overshoot-and-collapse',
      'oscillation',
      'escalation',
      'goal-erosion',
    ],
  },
  {
    name: 'overshoot and collapse t·e^(−t/15)',
    series: sample((t) => t * Math.exp(-t / 15)),
    is: ['overshoot-and-collapse'],
    isNot: ['oscillation', 's-shaped', 'goal-seeking', 'exponential-growth', 'growth-then-stagnation'],
  },
  {
    name: 'sustained oscillation sin(2πt/20)',
    series: sample((t) => Math.sin((2 * Math.PI * t) / 20)),
    is: ['oscillation'],
    isNot: ['overshoot-and-collapse', 'goal-seeking', 's-shaped', 'exponential-growth'],
  },
  {
    name: 'damped oscillation',
    series: sample((t) => 50 + 30 * Math.exp(-t / 40) * Math.cos((2 * Math.PI * t) / 15)),
    is: ['oscillation'],
    isNot: ['goal-seeking', 'overshoot-and-collapse'],
  },
  {
    name: 'better before worse (dip, then rise above the start)',
    series: sample((t) => 100 - 50 * (1 - Math.exp(-t / 3)) + 2 * t),
    is: ['better-before-worse'],
    isNot: ['goal-seeking', 'exponential-growth', 'oscillation'],
  },
  {
    name: 'worse before better is the same geometric pattern',
    series: sample((t) => -(100 - 50 * (1 - Math.exp(-t / 3)) + 2 * t)),
    is: ['better-before-worse'],
    isNot: ['goal-seeking'],
  },
  {
    name: 'linear escalation 10 + t',
    series: sample((t) => 10 + t),
    is: ['escalation'],
    isNot: ['exponential-growth', 'goal-seeking', 's-shaped'],
  },
  {
    name: 'divergence from a near-balanced share (clamped at 1)',
    series: sample((t) => Math.min(1, 0.5 + 0.01 * Math.exp(t / 10))),
    is: ['divergence'],
    isNot: ['goal-seeking', 'oscillation', 'goal-erosion'],
  },
  {
    name: 'divergence downward',
    series: sample((t) => Math.max(0, 0.5 - 0.01 * Math.exp(t / 10))),
    is: ['divergence'],
    isNot: ['goal-seeking', 'escalation'],
  },
  {
    name: 'growth, then a plateau with a slight decline',
    series: sample((t) => (t < 30 ? 100 + 3 * t : 190 - 0.2 * (t - 30))),
    is: ['growth-then-stagnation'],
    isNot: ['exponential-growth', 'escalation', 'overshoot-and-collapse', 'goal-erosion'],
  },
  {
    name: 'goal erosion: steady linear decline after an onset',
    series: sample((t) => (t < 6 ? 0.95 : 0.95 - 0.003 * (t - 6))),
    is: ['goal-erosion'],
    isNot: ['goal-seeking', 's-shaped', 'exponential-growth', 'better-before-worse'],
  },
];

describe('shape classifiers on synthetic series', () => {
  for (const c of cases) {
    it(c.name, () => {
      for (const s of c.is) expect(explainShape(s, c.series), `${s} should match`).toMatchObject({ match: true });
      for (const s of c.isNot) expect(explainShape(s, c.series).match, `${s} should not match`).toBe(false);
    });
  }

  it('every shape id has metadata and at least one positive case above', () => {
    expect(SHAPE_IDS.sort()).toEqual(Object.keys(SHAPES).sort());
    const covered = new Set(cases.flatMap((c) => c.is));
    for (const id of SHAPE_IDS) expect(covered.has(id), id).toBe(true);
    for (const id of SHAPE_IDS) expect(SHAPES[id].description.length).toBeGreaterThan(20);
  });

  it('a flat, too short or non-finite series has no shape', () => {
    expect(classifyShape(sample(() => 42))).toEqual([]);
    expect(classifyShape(sample((t) => 42 + 1e-9 * t))).toEqual([]);
    expect(classifyShape([1, 2, 3])).toEqual([]);
    expect(classifyShape([1, 2, Number.NaN, 4, 5, 6])).toEqual([]);
    expect(explainShape('goal-seeking', [1, 2, Number.POSITIVE_INFINITY, 4, 5]).reason).toMatch(/NaN or infinite/);
  });

  it('ignores a leading flat segment (behaviour judged from its onset)', () => {
    const series = sample((t) => (t < 12 ? 100 : 20 + 80 * Math.exp(-(t - 12) / 8)));
    expect(matchesShape('goal-seeking', series)).toBe(true);
  });

  it('accepts typed arrays (engine output) and classifyShape agrees with matchesShape', () => {
    const series = Float64Array.from(sample((t) => logistic(t)));
    const all = classifyShape(series);
    for (const id of SHAPE_IDS) expect(all.includes(id)).toBe(matchesShape(id, series));
  });
});
