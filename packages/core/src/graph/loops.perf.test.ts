/**
 * Acceptance criterion (BRIEF): "a 150-variable graph finishes in < 2 s or stops at the cap (default 1,000 loops)".
 * Measured on the dev container (2026-09-29): dense graph to the cap ≈ 10–30 ms; SD-like full enumeration ≈ 3 ms.
 */
import { describe, expect, it } from 'vitest';
import type { FindLoopsResult } from '../contracts.ts';
import type { Model } from '../schema/model.ts';
import { randomGraph, sectorGraph } from '../../test/fixtures/graph/generators.ts';
import {
  betweenness,
  boundaryChart,
  findLoops,
  loopParticipation,
  matchArchetypes,
  structuralLeverage,
} from './index.ts';

const BUDGET_MS = 2000;

function timed<T>(f: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = f();
  return { value, ms: performance.now() - start };
}

/** The acceptance rule: complete, or stopped exactly at the cap with the truncation flag. */
function expectCompleteOrCapped(result: FindLoopsResult) {
  if (result.truncated) {
    expect(result.reason).toBe('cap');
    expect(result.loops).toHaveLength(result.cap);
  } else {
    expect(result.reason).toBeUndefined();
  }
}

const graphs: [string, () => Model][] = [
  ['dense random (4 links per variable)', () => randomGraph(150, 4, 1)],
  ['sparse random (2 links per variable)', () => randomGraph(150, 2, 2)],
  ['SD-like sectors with feedback', () => sectorGraph(150, 5, 30, 9)],
];

describe('150-variable loop enumeration performance', () => {
  for (const [name, make] of graphs) {
    it(`${name}: finishes in < 2 s or stops at the default cap`, () => {
      const model = make();
      expect(model.variables).toHaveLength(150);
      const { value, ms } = timed(() => findLoops(model));
      expect(ms).toBeLessThan(BUDGET_MS);
      expect(value.cap).toBe(1000);
      expectCompleteOrCapped(value);
    });
  }

  it('dense graphs hit the cap and report truncation', () => {
    const result = findLoops(randomGraph(150, 4, 1));
    expect(result).toMatchObject({ truncated: true, reason: 'cap', cap: 1000 });
    expect(result.loops).toHaveLength(1000);
  });

  it('SD-like structure is enumerated completely', () => {
    const result = findLoops(sectorGraph(150, 5, 30, 9));
    expect(result.truncated).toBe(false);
    expect(result.loops.length).toBeGreaterThan(50);
  });

  it('a time budget stops an uncapped search with reason "time"', () => {
    const { value, ms } = timed(() => findLoops(randomGraph(150, 4, 1), { cap: Infinity, timeBudgetMs: 50 }));
    expect(value).toMatchObject({ truncated: true, reason: 'time' });
    expect(value.loops.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });

  it('the whole Analyze pipeline on a capped 150-variable graph stays under 2 s', () => {
    const model = randomGraph(150, 4, 1);
    const { ms } = timed(() => {
      const { loops } = findLoops(model);
      loopParticipation(loops);
      betweenness(model);
      boundaryChart(model, loops);
      structuralLeverage(model, loops);
      matchArchetypes(model, loops);
    });
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
