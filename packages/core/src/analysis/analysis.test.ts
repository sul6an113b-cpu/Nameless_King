import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addVariable } from '../model/index.ts';
import { createEmptyModel } from '../schema/factory.ts';
import { makeRng, oatSensitivity } from './index.ts';

function linearModel() {
  let m = createEmptyModel('T', { id: 'm_t', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'A', kind: 'constant', equation: '1', units: '' });
  m = addVariable(m, { id: 'v_b', name: 'B', kind: 'constant', equation: '1', units: '' });
  m = addVariable(m, { id: 'v_c', name: 'C', kind: 'constant', equation: '1', units: '' });
  m = addVariable(m, { id: 'v_y', name: 'Y', kind: 'aux', equation: '10 * A + 2 * B', units: '' });
  return m;
}

describe('makeRng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const a = makeRng(seed);
        const b = makeRng(seed);
        for (let i = 0; i < 20; i++) {
          const x = a();
          expect(x).toBe(b());
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
    );
  });
  it('differs across seeds and is roughly uniform', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
    const r = makeRng(42);
    let sum = 0;
    for (let i = 0; i < 10000; i++) sum += r();
    expect(sum / 10000).toBeCloseTo(0.5, 1);
  });
});

describe('oatSensitivity', () => {
  it('matches analytic swings, sorts descending, and accumulates to 1', () => {
    const { rows } = oatSensitivity(
      linearModel(),
      [
        { varId: 'v_b', min: 0, max: 5 },
        { varId: 'v_a', min: 0, max: 2 },
        { varId: 'v_c', min: 0, max: 9 },
      ],
      { varId: 'v_y', statistic: 'final' },
    );
    expect(rows.map((r) => r.varId)).toEqual(['v_a', 'v_b', 'v_c']);
    expect(rows[0]).toMatchObject({ base: 12, kpiAtLow: 2, kpiAtHigh: 22, swing: 20 });
    expect(rows[1]?.swing).toBeCloseTo(10);
    expect(rows[2]?.swing).toBe(0);
    expect(rows[0]?.cumulativeShare).toBeCloseTo(20 / 30);
    expect(rows[2]?.cumulativeShare).toBeCloseTo(1);
  });
  it('is deterministic and has non-decreasing cumulative share', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 10, noNaN: true }), fc.double({ min: 0, max: 10, noNaN: true }), (x, z) => {
        const ps = [
          { varId: 'v_a', min: 0, max: x },
          { varId: 'v_b', min: 0, max: z },
        ];
        const kpi = { varId: 'v_y', statistic: 'max' as const };
        const r1 = oatSensitivity(linearModel(), ps, kpi).rows;
        expect(oatSensitivity(linearModel(), ps, kpi).rows).toEqual(r1);
        for (let i = 1; i < r1.length; i++) {
          expect(r1[i].swing).toBeLessThanOrEqual(r1[i - 1].swing);
          expect(r1[i].cumulativeShare).toBeGreaterThanOrEqual(r1[i - 1].cumulativeShare);
        }
      }),
      { numRuns: 30 },
    );
  });
  it('throws on a model that does not compile', () => {
    let m = createEmptyModel('T', { id: 'm_t', now: '2026-01-01T00:00:00.000Z' });
    m = addVariable(m, { id: 'v_y', name: 'Y', kind: 'aux', equation: 'Nope + 1', units: '' });
    expect(() => oatSensitivity(m, [], { varId: 'v_y', statistic: 'final' })).toThrow();
  });
});
