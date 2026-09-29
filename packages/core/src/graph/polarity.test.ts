import { describe, expect, it } from 'vitest';
import type { CompiledModel, SimResult, VarEvaluator } from '../contracts.ts';
import type { SimSpec } from '../schema/model.ts';
import {
  humpEvaluator,
  humpModel,
  humpRun,
  populationEvaluator,
  populationModel,
  populationRun,
} from '../../test/fixtures/graph/polarity.fixtures.ts';
import { graphModel } from '../../test/fixtures/graph/build.ts';
import { loopFixtures } from '../../test/fixtures/graph/loops.fixtures.ts';
import { checkPolarity } from './index.ts';

describe('checkPolarity with an injected evaluator', () => {
  it('flags the deliberately wrong drawn polarity and nothing else', () => {
    const items = checkPolarity(
      populationModel({ lifetimeToDeaths: '+' }),
      undefined,
      populationRun(),
      populationEvaluator(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      check: 'polarity',
      severity: 'warning',
      elementIds: ['l_life_deaths', 'life', 'deaths'],
      detail: {
        linkId: 'l_life_deaths',
        drawn: '+',
        implied: '-',
        basis: 'equation',
        states: 12,
        positive: 0,
        negative: 12,
      },
    });
    expect(items[0].message).toBe(
      'Link "Lifetime" → "Deaths" is drawn + but the equation of "Deaths" implies − at 12 sampled state(s).',
    );
  });

  it('does not flag a model whose drawn polarities are all correct', () => {
    expect(checkPolarity(populationModel(), undefined, populationRun(), populationEvaluator())).toEqual([]);
  });

  it('checks flow→stock links against inflow/outflow structure', () => {
    const items = checkPolarity(
      populationModel({ deathsToPopulation: '+' }),
      undefined,
      populationRun(),
      populationEvaluator(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      severity: 'warning',
      elementIds: ['l_deaths_pop', 'deaths', 'pop'],
      detail: { drawn: '+', implied: '-', basis: 'flow' },
    });
    expect(items[0].message).toContain('"Deaths" is an outflow from "Population"');
  });

  it('reports the implied sign of an unknown (?) polarity as info', () => {
    const items = checkPolarity(
      populationModel({ lifetimeToDeaths: '?' }),
      undefined,
      populationRun(),
      populationEvaluator(),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ severity: 'info', detail: { drawn: '?', implied: '-' } });
    expect(items[0].message).toContain('unknown polarity');
  });

  it('reports a sign that changes across states as non-monotonic info', () => {
    const items = checkPolarity(humpModel(), undefined, humpRun(), humpEvaluator);
    expect(items).toHaveLength(1);
    // x = 2, 3, 4 → positive; x = 6, 7, 8 → negative; x = 5 (the maximum) → no effect under a central difference.
    expect(items[0]).toMatchObject({
      severity: 'info',
      elementIds: ['l_x_effect', 'x', 'effect'],
      detail: { implied: 'mixed', positive: 3, negative: 3, states: 7 },
    });
    expect(items[0].message).toContain('non-monotonic');
  });

  it('samples at most 12 states, evenly spaced over the run', () => {
    const times: number[] = [];
    const evaluator: VarEvaluator = (id, v, t) => {
      if (id === 'deaths') times.push(t);
      return populationEvaluator()(id, v, t);
    };
    checkPolarity(populationModel(), undefined, populationRun(), evaluator);
    const perLink = [...new Set(times)];
    expect(perLink).toHaveLength(12);
    expect(perLink[0]).toBe(0);
    expect(perLink[perLink.length - 1]).toBe(24);
  });

  it('without samples, uses a synthetic state from numeric equations', () => {
    const items = checkPolarity(
      populationModel({ lifetimeToDeaths: '+' }),
      undefined,
      undefined,
      populationEvaluator(),
    );
    expect(items).toEqual([expect.objectContaining({ elementIds: ['l_life_deaths', 'life', 'deaths'] })]);
    expect(items[0].detail).toMatchObject({ states: 1 });
  });

  it('gives no verdict when the source has no measurable effect', () => {
    const constantBirths: VarEvaluator = (id, v) => (id === 'births' ? v[0] * 0.08 : v[0] / v[4]);
    const m = populationModel();
    const wrongRate = {
      ...m,
      links: m.links.map((l) => (l.id === 'l_rate_births' ? { ...l, polarity: '-' as const } : l)),
    };
    expect(checkPolarity(wrongRate, undefined, populationRun(), constantBirths)).toEqual([]);
  });

  it('skips qualitative variables and never calls the evaluator for them', () => {
    let calls = 0;
    const counting: VarEvaluator = () => {
      calls++;
      return 0;
    };
    const cld = graphModel(loopFixtures[5].spec); // K3, kind 'variable'
    expect(checkPolarity(cld, undefined, undefined, counting)).toEqual([]);
    expect(calls).toBe(0);
  });

  it('without an evaluator or compiled model, checks only flow→stock links', () => {
    const m = populationModel({ lifetimeToDeaths: '+', deathsToPopulation: '+' });
    expect(checkPolarity(m).map((i) => i.elementIds[0])).toEqual(['l_deaths_pop']);
  });

  it('treats evaluator errors and non-finite results as unusable states', () => {
    const throwing: VarEvaluator = () => {
      throw new Error('boom');
    };
    const nan: VarEvaluator = () => NaN;
    const m = populationModel({ lifetimeToDeaths: '+' });
    expect(checkPolarity(m, undefined, populationRun(), throwing)).toEqual([]);
    expect(checkPolarity(m, undefined, populationRun(), nan)).toEqual([]);
  });

  it('restores the value vector after each perturbation', () => {
    const seen: number[] = [];
    const evaluator: VarEvaluator = (id, v, t) => {
      if (id === 'births') seen.push(v[3]); // rate, the value perturbed for rate → births, never for pop → births
      return populationEvaluator()(id, v, t);
    };
    checkPolarity(populationModel(), undefined, populationRun(), evaluator);
    // pop → births evaluations see the unperturbed rate 0.08; rate → births sees 0.08 ± 8e-6.
    expect(seen.filter((r) => r === 0.08).length).toBe(24);
    expect(seen.filter((r) => r !== 0.08).length).toBe(24);
  });
});

describe('checkPolarity with a compiled model', () => {
  /** A stand-in for sd-engine's CompiledModel: its own vector layout (reversed, plus one hidden slot). */
  function fakeCompiled(opts: { failSimulate?: boolean; evalVar?: VarEvaluator } = {}) {
    const order = ['life', 'rate', 'deaths', 'births', 'pop'];
    const index = Object.fromEntries(order.map((id, i) => [id, i]));
    const simulateCalls: (Partial<SimSpec> | undefined)[] = [];
    const vectorSizes = new Set<number>();
    const evaluate = populationEvaluator(index);
    const compiled: CompiledModel = {
      varIds: ['pop', 'births', 'deaths', 'rate', 'life'],
      index,
      size: order.length + 1,
      simulate(spec) {
        simulateCalls.push(spec);
        if (opts.failSimulate) throw new Error('compile-time only');
        const run = populationRun();
        const series = Object.fromEntries(Object.entries(run.series).map(([id, s]) => [id, s.slice(0, 2)]));
        return { ...run, time: run.time.slice(0, 2), series } satisfies SimResult;
      },
      evalVar:
        opts.evalVar ??
        ((id, v, t) => {
          vectorSizes.add(v.length);
          return evaluate(id, v, t);
        }),
      deps: {},
    };
    return { compiled, simulateCalls, vectorSizes, index };
  }

  it('uses compiled.evalVar and the compiled layout, sampling initial values from a one-step run', () => {
    const { compiled, simulateCalls, vectorSizes } = fakeCompiled();
    const m = populationModel({ lifetimeToDeaths: '+' });
    const items = checkPolarity(m, compiled);
    expect(items.map((i) => i.elementIds[0])).toEqual(['l_life_deaths']);
    expect(items[0].detail).toMatchObject({ states: 2 });
    expect(simulateCalls).toEqual([{ stop: m.simSpec.start + m.simSpec.dt, saveEvery: m.simSpec.dt }]);
    expect([...vectorSizes]).toEqual([6]);
  });

  it('prefers the given samples over running the model', () => {
    const { compiled, simulateCalls } = fakeCompiled();
    const items = checkPolarity(populationModel({ lifetimeToDeaths: '+' }), compiled, populationRun());
    expect(items[0].detail).toMatchObject({ states: 12 });
    expect(simulateCalls).toHaveLength(0);
  });

  it('an injected evaluator overrides compiled.evalVar', () => {
    const { compiled, index } = fakeCompiled({
      evalVar: () => {
        throw new Error('not used');
      },
    });
    const items = checkPolarity(
      populationModel({ lifetimeToDeaths: '+' }),
      compiled,
      undefined,
      populationEvaluator(index),
    );
    expect(items.map((i) => i.elementIds[0])).toEqual(['l_life_deaths']);
  });

  it('falls back to a synthetic state when the run fails', () => {
    const { compiled } = fakeCompiled({ failSimulate: true });
    const items = checkPolarity(populationModel({ lifetimeToDeaths: '+' }), compiled);
    expect(items).toEqual([expect.objectContaining({ elementIds: ['l_life_deaths', 'life', 'deaths'] })]);
  });
});
