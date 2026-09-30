import { describe, expect, it } from 'vitest';
import { ModelSchema, runHealth, simulate, type SimResult } from '@looplab/core';
import { examples } from './examples/index.ts';
import { bibliography } from './sources.ts';
import { loopCounts, simulateScenario, structureIssues } from './testing.ts';

const byId = (id: string) => {
  const e = examples.find((x) => x.id === id);
  if (!e) throw new Error(`missing example ${id}`);
  return e;
};

/** Health checks that must report nothing (errors or warnings) for a bundled example. */
const CLEAN_CHECKS = new Set([
  'parse',
  'undefined',
  'unquantified',
  'units',
  'algebraic-loop',
  'integration-error',
  'polarity',
  'link-equation-mismatch',
  'flow-link',
  'numeric',
]);

const col = (r: SimResult, id: string): Float64Array => {
  const s = r.series[id];
  if (!s) throw new Error(`no series for ${id}`);
  return s;
};

/** First saved time at which `series` reaches `level` (Infinity if never). */
const firstTime = (r: SimResult, series: Float64Array, level: number): number => {
  const i = series.findIndex((x) => x >= level);
  return i < 0 ? Number.POSITIVE_INFINITY : (r.time[i] ?? Number.POSITIVE_INFINITY);
};

/** Max relative error of the tank simulation against the analytic solution. */
function tankError(method: 'euler' | 'rk4', dt: number): number {
  const tank = byId('tank-draining');
  const analytic = tank.analytic;
  if (!analytic) throw new Error('tank-draining must provide analytic(t)');
  const r = simulate(tank.model, { method, dt });
  const h = col(r, 'v_height');
  let worst = 0;
  r.time.forEach((t, i) => {
    const exact = analytic(t);
    worst = Math.max(worst, Math.abs((h[i] ?? Number.NaN) - exact) / exact);
  });
  return worst;
}

describe('example models (static)', () => {
  it('bundles exactly the four SPEC examples', () => {
    expect(examples.map((e) => e.id)).toEqual(['epc-rework', 'epc-handoff', 'qc-ncr-backlog', 'tank-draining']);
  });

  for (const e of examples) {
    describe(e.title, () => {
      it('parses under ModelSchema and passes the structure checks', () => {
        expect(ModelSchema.safeParse(e.model).success).toBe(true);
        expect(structureIssues(e.model)).toEqual([]);
      });

      it('has a frame with KPIs, a reference-mode sketch and boundary exclusions', () => {
        const { frame } = e.model;
        expect(frame.problem.length).toBeGreaterThan(40);
        expect(frame.purpose.length).toBeGreaterThan(40);
        expect(frame.kpis.length).toBeGreaterThan(0);
        for (const k of frame.kpis) expect(e.model.variables.some((v) => v.id === k.varId)).toBe(true);
        expect(frame.referenceModes.length).toBeGreaterThan(0);
        for (const r of frame.referenceModes) {
          const times = r.points.map(([t]) => t);
          expect(times).toEqual([...times].sort((x, y) => x - y));
          expect(r.note.length).toBeGreaterThan(10);
        }
        expect(frame.excluded.length).toBeGreaterThan(0);
        expect(e.description).toMatch(/illustrative/i);
        for (const s of e.sources) expect(bibliography[s.key], s.key).toBeDefined();
      });

      it('interventions carry a Meadows level and point at existing scenarios', () => {
        for (const iv of e.model.interventions) {
          expect(iv.leverage).toBeGreaterThanOrEqual(1);
          expect(iv.leverage).toBeLessThanOrEqual(12);
          if (iv.scenarioId !== null) expect(e.model.scenarios.some((s) => s.id === iv.scenarioId)).toBe(true);
        }
      });
    });
  }

  it('epc-rework: has the hand-verified 10 feedback loops (4 R, 6 B) described in the user guide', () => {
    expect(loopCounts(byId('epc-rework').model)).toEqual({ R: 4, B: 6 });
  });

  it('tank-draining: analytic solution is exact at the ends and matches its reference sketch', () => {
    const tank = byId('tank-draining');
    const h = tank.analytic;
    expect(h).toBeDefined();
    if (!h) return;
    expect(h(0)).toBe(1);
    // √h falls linearly: equal steps in time give equal steps in √h
    const d1 = Math.sqrt(h(0)) - Math.sqrt(h(200));
    const d2 = Math.sqrt(h(200)) - Math.sqrt(h(400));
    expect(Math.abs(d1 - d2)).toBeLessThan(1e-12);
    // the tank is empty after T = 2√h0 / k ≈ 753 s and stays empty
    expect(h(752)).toBeGreaterThan(0);
    expect(h(754)).toBe(0);
    expect(h(2000)).toBe(0);
    for (const [t, v] of tank.model.frame.referenceModes[0]?.points ?? [])
      expect(Math.abs(h(t) - v)).toBeLessThanOrEqual(5e-5);
  });
});

describe('example models (engine)', () => {
  for (const e of examples) {
    it(
      `${e.title}: passes Model Health and simulates with finite values and no assertion violations`,
      () => {
        const health = runHealth(e.model, { runIntegrationTest: true });
        expect(health.items.filter((i) => i.severity === 'error')).toEqual([]);
        expect(health.items.filter((i) => i.severity !== 'info' && CLEAN_CHECKS.has(i.check))).toEqual([]);
        const r = simulate(e.model);
        for (const [id, s] of Object.entries(r.series)) expect(s.every(Number.isFinite), id).toBe(true);
        expect(r.assertions).toEqual([]);
        for (const s of e.model.scenarios) {
          const rs = simulateScenario(e.model, s.id);
          for (const [id, series] of Object.entries(rs.series))
            expect(series.every(Number.isFinite), `${s.id}/${id}`).toBe(true);
        }
      },
    );
  }

  // Tolerances: docs/decisions/methodologist.md#m-3 (measured with an independent reference implementation:
  // RK4 at DT = 1 s gives 3e-11 relative error, Euler at DT = 0.5 s gives 5.2e-3).
  it('tank-draining: RK4 matches the analytic solution within 1e-6 relative error', () => {
    expect(tankError('rk4', 1)).toBeLessThan(1e-6);
  });

  it(
    'tank-draining: Euler at the default DT is within 1 % and converges with order ≈ 1; RK4 with order ≈ 4',
    () => {
      const { dt } = byId('tank-draining').model.simSpec;
      expect(tankError('euler', dt)).toBeLessThan(1e-2);
      const eulerOrder = Math.log2(tankError('euler', 1) / tankError('euler', 0.5));
      expect(eulerOrder).toBeGreaterThan(0.7);
      expect(eulerOrder).toBeLessThan(1.3);
      const rk4Order = Math.log2(tankError('rk4', 4) / tankError('rk4', 2));
      expect(rk4Order).toBeGreaterThan(3.7);
      expect(rk4Order).toBeLessThan(4.3);
    },
  );

  it(
    'epc-rework: conserves tasks, reports progress ahead of truth, and overruns the deadline',
    () => {
      const { model } = byId('epc-rework');
      const r = simulate(model);
      const todo = col(r, 'v_todo');
      const done = col(r, 'v_done');
      const hidden = col(r, 'v_undiscovered');
      const scope = 1000;
      todo.forEach((x, i) =>
        expect(Math.abs(x + (done[i] ?? 0) + (hidden[i] ?? 0) - scope)).toBeLessThan(1e-9 * scope),
      );
      const truth = col(r, 'v_true_progress');
      const reported = col(r, 'v_perceived_progress');
      reported.forEach((x, i) => expect(x).toBeGreaterThanOrEqual((truth[i] ?? 0) - 1e-12));
      const deadline = 52;
      expect(firstTime(r, reported, 0.9)).toBeLessThan(firstTime(r, truth, 0.9));
      expect(firstTime(r, truth, 0.99)).toBeGreaterThan(deadline + 8);
      expect(truth[truth.length - 1]).toBeGreaterThan(0.99);
      const staffed = simulateScenario(model, 's_add_staff');
      expect(firstTime(staffed, col(staffed, 'v_true_progress'), 0.99)).toBeLessThan(firstTime(r, truth, 0.99));
    },
  );

  it(
    'epc-handoff: conserves spools, crews wait early, and procurement lead time is the lever',
    () => {
      const { model } = byId('epc-handoff');
      const r = simulate(model);
      const ids = ['v_to_engineer', 'v_in_procurement', 'v_on_site', 'v_installed'];
      r.time.forEach((_, i) => {
        const total = ids.reduce((sum, id) => sum + (col(r, id)[i] ?? 0), 0);
        expect(Math.abs(total - 2000)).toBeLessThan(1e-6);
      });
      const idle = col(r, 'v_idle');
      expect(Math.min(...idle)).toBeGreaterThanOrEqual(-1e-9);
      const mobilisation = r.time.findIndex((t) => t >= 12);
      expect(idle[mobilisation] ?? 0).toBeGreaterThan(10); // crews on site before enough spools are
      const installed = col(r, 'v_installed_fraction');
      const finish = firstTime(r, installed, 0.99);
      expect(finish).toBeLessThan(80);
      const faster = simulateScenario(model, 's_faster_procurement');
      expect(firstTime(faster, col(faster, 'v_installed_fraction'), 0.99)).toBeLessThan(finish - 5);
      const later = simulateScenario(model, 's_late_mobilisation');
      const idleSum = (x: Float64Array) => x.reduce((a, b) => a + b, 0);
      expect(idleSum(col(later, 'v_idle'))).toBeLessThan(0.6 * idleSum(idle));
      expect(firstTime(later, col(later, 'v_installed_fraction'), 0.99)).toBeLessThanOrEqual(finish + 1);
    },
  );

  it('qc-ncr-backlog: backlog peaks at the end of the construction peak and outlives it', () => {
    const { model } = byId('qc-ncr-backlog');
    const r = simulate(model);
    const backlog = col(r, 'v_awaiting');
    const peak = Math.max(...backlog);
    const peakTime = r.time[backlog.indexOf(peak)] ?? 0;
    expect(peakTime).toBeGreaterThanOrEqual(29);
    expect(peakTime).toBeLessThanOrEqual(31);
    const weekAfterPeak = (t: number) => backlog[r.time.findIndex((x) => x >= t)] ?? 0;
    expect(weekAfterPeak(50)).toBeGreaterThan(0.4 * peak); // still high 20 weeks after the peak ended
    expect(backlog[backlog.length - 1]).toBeLessThan(0.2 * peak); // but drains by the end of the horizon
    const more = simulateScenario(model, 's_more_inspectors');
    expect(Math.max(...col(more, 'v_awaiting'))).toBeLessThan(0.7 * peak);
  });
});
