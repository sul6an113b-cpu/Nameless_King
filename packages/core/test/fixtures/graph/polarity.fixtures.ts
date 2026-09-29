/**
 * Polarity-check fixtures: a population stock-and-flow model whose equations are evaluated by hand-written
 * evaluators (same shape as CompiledModel.evalVar), plus a baseline run to sample states from.
 */
import type { SimResult, VarEvaluator } from '../../../src/contracts.ts';
import type { Model, Polarity } from '../../../src/schema/model.ts';
import { graphModel } from './build.ts';

export interface PopulationPolarities {
  /** Lifetime → Deaths; the equation Deaths = Population / Lifetime implies '−'. */
  lifetimeToDeaths?: Polarity;
  /** Deaths → Population; Deaths is an outflow of Population, which implies '−'. */
  deathsToPopulation?: Polarity;
}

/** Variable order = value-vector layout when no compiled model is given: pop 0, births 1, deaths 2, rate 3, life 4. */
export function populationModel(p: PopulationPolarities = {}): Model {
  return graphModel(
    {
      vars: [
        { id: 'pop', name: 'Population', kind: 'stock', equation: '100' },
        { id: 'births', name: 'Births', kind: 'flow', equation: 'Population * Birth_rate', flow: { from: null, to: 'pop' } },
        { id: 'deaths', name: 'Deaths', kind: 'flow', equation: 'Population / Lifetime', flow: { from: 'pop', to: null } },
        { id: 'rate', name: 'Birth rate', kind: 'constant', equation: '0.08' },
        { id: 'life', name: 'Lifetime', kind: 'constant', equation: '20' },
      ],
      links: [
        ['pop', 'births', '+'],
        ['rate', 'births', '+'],
        ['births', 'pop', '+'],
        ['pop', 'deaths', '+'],
        ['life', 'deaths', p.lifetimeToDeaths ?? '-'],
        ['deaths', 'pop', p.deathsToPopulation ?? '-'],
      ],
    },
    'population',
  );
}

/** Hand-written equations of the population model for a given value-vector layout. */
export function populationEvaluator(index: Record<string, number> = { pop: 0, births: 1, deaths: 2, rate: 3, life: 4 }): VarEvaluator {
  return (id, v) => {
    if (id === 'births') return v[index.pop] * v[index.rate];
    if (id === 'deaths') return v[index.pop] / v[index.life];
    throw new Error(`population fixture cannot evaluate "${id}"`);
  };
}

/** Baseline run: P(t) = 100·e^{0.03 t}, t = 0…24, birth rate 0.08, lifetime 20. */
export function populationRun(): SimResult {
  const time = Float64Array.from({ length: 25 }, (_, t) => t);
  const pop = time.map((t) => 100 * Math.exp(0.03 * t));
  return {
    time,
    series: {
      pop,
      births: pop.map((p) => p * 0.08),
      deaths: pop.map((p) => p / 20),
      rate: time.map(() => 0.08),
      life: time.map(() => 20),
    },
    spec: { start: 0, stop: 24, dt: 1, method: 'euler', timeUnit: 'year' },
    assertions: [],
    warnings: [],
  };
}

/** Effect = x·(10 − x): increasing below x = 5, decreasing above — a non-monotonic link x → effect. */
export function humpModel(): Model {
  return graphModel({
    vars: [
      { id: 'x', name: 'Workload', kind: 'stock', equation: '2' },
      { id: 'effect', name: 'Productivity effect', kind: 'aux', equation: 'Workload * (10 - Workload)' },
    ],
    links: [['x', 'effect', '+']],
  });
}

export const humpEvaluator: VarEvaluator = (id, v) => {
  if (id === 'effect') return v[0] * (10 - v[0]);
  throw new Error(`hump fixture cannot evaluate "${id}"`);
};

/** x sampled at 2, 3, …, 8 (both sides of the maximum at 5). */
export function humpRun(): SimResult {
  const time = Float64Array.from({ length: 7 }, (_, t) => t);
  const x = time.map((t) => 2 + t);
  return {
    time,
    series: { x, effect: x.map((w) => w * (10 - w)) },
    spec: { start: 0, stop: 6, dt: 1, method: 'euler', timeUnit: 'month' },
    assertions: [],
    warnings: [],
  };
}
