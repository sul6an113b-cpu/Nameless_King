/**
 * Everything the Decide stage shows and the report is built from, computed from the current model: a baseline run and one
 * run per scenario, the loops, a leverage ranking, Model Health, OAT sensitivity of the first KPI and Loops That Matter.
 * Each part that fails (a scenario whose override does not compile, a stub that has not landed) is left out and noted in
 * `problems` instead of failing the whole stage.
 */
import {
  NotImplementedError,
  buildReport,
  compileModel,
  findLoops,
  loopsThatMatter,
  oatSensitivity,
  rankLeverage,
  runHealth,
  structuralLeverage,
  type HealthReport,
  type LeverageRankRow,
  type Loop,
  type LtmResult,
  type Model,
  type ReportOutput,
  type SimResult,
  type TornadoRow,
} from '@looplab/core';

/** Most scenarios compared side by side (each is one more run and one more table column). */
export const MAX_SCENARIOS = 8;

export interface DecideRun {
  /** 'Baseline' or the scenario's name */
  name: string;
  /** null for the baseline */
  scenarioId: string | null;
  result: SimResult;
}

export interface DecideData {
  runs: DecideRun[];
  loops: Loop[];
  leverage: LeverageRankRow[];
  health?: HealthReport;
  sensitivity?: TornadoRow[];
  ltm?: LtmResult;
  problems: string[];
  /** ISO timestamp printed in the report */
  generatedAt: string;
}

/** A result without the (large) full state vectors that Loops That Matter needed. */
const lean = (r: SimResult): SimResult => ({
  time: r.time,
  series: r.series,
  spec: r.spec,
  assertions: r.assertions,
  warnings: r.warnings,
});

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Run `fn`; null (and a note in `problems`) on failure. A stub that has not landed is skipped quietly. */
function tryStep<T>(problems: string[], what: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    if (!(e instanceof NotImplementedError)) problems.push(`${what}: ${message(e)}`);
    return undefined;
  }
}

/** Seconds precision: the brief is regenerated on every change, and milliseconds are noise on a page. */
const nowIso = (): string => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export function computeDecideData(model: Model, generatedAt = nowIso()): DecideData {
  const problems: string[] = [];
  const runs: DecideRun[] = [];
  let ltm: LtmResult | undefined;
  const loops = tryStep(problems, 'Loop analysis', () => findLoops(model).loops) ?? [];

  const base = compileModel(model);
  if (base.ok) {
    const result = tryStep(problems, 'Baseline run', () => base.compiled.simulate(undefined, { saveState: true }));
    if (result) {
      runs.push({ name: 'Baseline', scenarioId: null, result: lean(result) });
      if (loops.length > 0) ltm = tryStep(problems, 'Loop dominance', () => loopsThatMatter(model, base.compiled, result, loops));
    }
  } else problems.push(`Baseline run: ${base.errors[0]?.message ?? 'the model does not compile'}`);

  if (runs.length > 0)
    for (const scenario of model.scenarios.slice(0, MAX_SCENARIOS)) {
      const c = compileModel(model, { scenario });
      if (!c.ok) problems.push(`Scenario “${scenario.name}”: ${c.errors[0]?.message ?? 'does not compile'}`);
      else {
        const result = tryStep(problems, `Scenario “${scenario.name}”`, () => c.compiled.simulate());
        if (result) runs.push({ name: scenario.name, scenarioId: scenario.id, result: lean(result) });
      }
    }
  if (model.scenarios.length > MAX_SCENARIOS)
    problems.push(`Only the first ${MAX_SCENARIOS} of ${model.scenarios.length} scenarios are compared.`);

  const health = tryStep(problems, 'Model Health', () => runHealth(model));

  let sensitivity: TornadoRow[] | undefined;
  const kpiVar = model.frame.kpis.find((k) => k.varId !== null)?.varId ?? null;
  const params = model.variables.flatMap((v) =>
    v.kind === 'constant' && v.uncertainty ? [{ varId: v.id, min: v.uncertainty.min, max: v.uncertainty.max }] : [],
  );
  if (kpiVar !== null && params.length > 0 && base.ok)
    sensitivity = tryStep(problems, 'Sensitivity', () => oatSensitivity(model, params, { varId: kpiVar, statistic: 'final' }).rows);

  const structural = tryStep(problems, 'Leverage', () => structuralLeverage(model, loops)) ?? [];
  let leverage: LeverageRankRow[] | undefined;
  try {
    leverage = rankLeverage({ structural, ...(sensitivity ? { sensitivity } : {}), ...(ltm ? { ltm } : {}) });
  } catch (e) {
    if (!(e instanceof NotImplementedError)) problems.push(`Leverage ranking: ${message(e)}`);
  }
  // Until the combined ranking lands, rank by structure alone.
  leverage ??= structural.map((r) => ({
    varId: r.varId,
    score: r.score,
    cumulativeShare: r.cumulativeShare,
    evidence: Object.entries(r.components).map(([k, v]) => `${k} ${Math.round(v * 100) / 100}`),
  }));

  return {
    runs,
    loops,
    leverage,
    ...(health ? { health } : {}),
    ...(sensitivity ? { sensitivity } : {}),
    ...(ltm ? { ltm } : {}),
    problems,
    generatedAt,
  };
}

/** The decision brief for the model as it is now, from the computed evidence. */
export function reportOf(model: Model, data: DecideData): ReportOutput {
  return buildReport({
    model,
    loops: data.loops,
    leverage: data.leverage,
    runs: data.runs,
    ...(data.health ? { health: data.health } : {}),
    ...(data.sensitivity ? { sensitivity: data.sensitivity } : {}),
    ...(data.ltm ? { ltm: data.ltm } : {}),
    generatedAt: data.generatedAt,
  });
}
