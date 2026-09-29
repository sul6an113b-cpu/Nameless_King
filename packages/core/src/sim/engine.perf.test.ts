/**
 * Performance budget (SPEC §6.3, §11 row 13): a 500-variable SFD runs 10,000 Euler steps in < 1 s.
 * Measured here in the Vitest Node process on the first (cold, un-warmed) run, compile included, saving
 * every variable at every step. qa re-measures inside a worker (tests/perf).
 */
import { describe, expect, it } from 'vitest';
import { largeSfd } from '../../test/fixtures/sim/large.ts';
import { compileModel } from './index.ts';

describe('engine performance', () => {
  it('500-variable SFD, 10,000 Euler steps in < 1 s (cold run, compile included)', () => {
    const model = largeSfd();
    expect(model.variables).toHaveLength(500);

    const t0 = performance.now();
    const c = compileModel(model);
    if (!c.ok) throw new Error(c.errors.map((e) => e.message).join('\n'));
    const t1 = performance.now();
    const r = c.compiled.simulate();
    const t2 = performance.now();

    expect(r.time).toHaveLength(10_001);
    expect(Object.keys(r.series)).toHaveLength(500);
    for (const col of Object.values(r.series)) expect(Number.isFinite(col[10_000])).toBe(true);

    const warm = performance.now();
    c.compiled.simulate();
    const warmMs = performance.now() - warm;
    console.log(
      `perf: compile ${(t1 - t0).toFixed(1)} ms, first run ${(t2 - t1).toFixed(1)} ms, warm run ${warmMs.toFixed(1)} ms (500 vars, 10,000 Euler steps)`,
    );
    expect(t2 - t0).toBeLessThan(1000);
  });
});
