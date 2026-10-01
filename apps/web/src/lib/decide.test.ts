import { describe, expect, it } from 'vitest';
import { examples } from '@looplab/content';
import type { Model } from '@looplab/core';
import { computeDecideData, reportOf } from './decide.ts';

const epc = (): Model => {
  const ex = examples.find((e) => e.id === 'epc-rework');
  if (!ex) throw new Error('epc-rework example missing');
  return ex.model;
};
const NOW = '2026-10-01T09:00:00Z';

describe('computeDecideData', () => {
  const model = epc();
  const data = computeDecideData(model, NOW);

  it('runs the baseline first, then one run per scenario, without the heavy state vectors', () => {
    expect(data.runs.map((r) => r.name)).toEqual(['Baseline', ...model.scenarios.map((s) => s.name)]);
    expect(data.runs.map((r) => r.scenarioId)).toEqual([null, ...model.scenarios.map((s) => s.id)]);
    expect(data.runs.every((r) => r.result.state === undefined)).toBe(true);
    expect(data.problems).toEqual([]);
  });

  it('finds loops, ranks leverage, and scores loop dominance and health', () => {
    expect(data.loops.length).toBeGreaterThan(0);
    expect(data.leverage.length).toBeGreaterThan(0);
    expect(data.leverage[0]?.cumulativeShare).toBeGreaterThan(0);
    expect(data.ltm?.time.length).toBe(data.runs[0]?.result.time.length);
    expect(data.health).toBeDefined();
    expect(data.generatedAt).toBe(NOW);
  });

  it('a scenario that does not compile is reported and left out; the rest still run', () => {
    const bad: Model = {
      ...model,
      scenarios: [
        ...model.scenarios,
        { id: 's_bad', name: 'Broken', note: '', overrides: [{ varId: model.variables[0]?.id ?? '', equation: '1 +' }], origin: 'user' },
      ],
    };
    const d = computeDecideData(bad, NOW);
    expect(d.runs.map((r) => r.name)).not.toContain('Broken');
    expect(d.runs).toHaveLength(1 + model.scenarios.length);
    expect(d.problems.some((p) => p.includes('Broken'))).toBe(true);
  });

  it('a model that cannot run has no runs and says why, but still gives structure', () => {
    const broken: Model = {
      ...model,
      variables: model.variables.map((v, i) => (i === 0 ? { ...v, equation: '1 +' } : v)),
    };
    const d = computeDecideData(broken, NOW);
    expect(d.runs).toEqual([]);
    expect(d.problems[0]).toMatch(/^Baseline run:/);
    expect(d.loops.length).toBeGreaterThan(0);
  });
});

describe('reportOf', () => {
  it('builds the brief for the model as it stands, with the scenario runs compared', () => {
    const model: Model = { ...epc(), decision: { recommendation: 'Hold earlier design reviews.', summary: '' } };
    const { markdown, html } = reportOf(model, computeDecideData(model, NOW));
    expect(markdown).toContain('Hold earlier design reviews.');
    for (const s of model.scenarios) expect(markdown).toContain(s.name);
    for (const h of ['Recommendation', 'Key loops', 'Leverage ranking', 'Evidence', 'Simulation results', 'Appendix'])
      expect(html).toContain(`<h2>${h}</h2>`);
    expect(html).toContain('<svg ');
  });
});
