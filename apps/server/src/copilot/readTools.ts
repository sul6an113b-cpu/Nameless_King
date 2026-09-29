/**
 * Read-only copilot tools (SPEC §7.2): run `@looplab/core` on the model the client sent. Modules that have not
 * landed yet throw `NotImplementedError`; the adapter turns that into a "not available yet" result so the tool list
 * (and therefore the prompt cache) never changes when they do land.
 */
import { z } from 'zod';
import {
  NotImplementedError,
  compileModel,
  findLoops,
  loopParticipation,
  oatSensitivity,
  runHealth,
  structuralLeverage,
  type Id,
  type Model,
  type ParamRange,
  type Scenario,
} from '@looplab/core';

export const READ_TOOL_NAMES = [
  'get_model_summary',
  'list_loops',
  'get_health',
  'simulate_scenario',
  'run_sensitivity',
  'get_leverage',
] as const;
export type ReadToolName = (typeof READ_TOOL_NAMES)[number];

const varId = z.string().min(1).max(64);

export const READ_TOOL_INPUTS = {
  get_model_summary: z.object({}),
  list_loops: z.object({
    containing: z.array(varId).max(20).describe('Only loops through all of these variable ids; [] for all loops.'),
  }),
  get_health: z.object({}),
  simulate_scenario: z.object({
    scenarioId: z.string().max(64).describe('Existing scenario id to start from; "" for the baseline.'),
    overrides: z
      .array(z.object({ varId, equation: z.string().min(1).max(4000).describe('Replacement equation, e.g. "0.8" or "STEP(10, 6)".') }))
      .max(50)
      .describe('Extra equation overrides on top of the scenario; [] for none.'),
    saveIds: z.array(varId).max(12).describe('Variables to report; [] = KPI variables and stocks.'),
    stop: z.number().nullable().describe('Stop time; null = the model horizon.'),
  }),
  run_sensitivity: z.object({
    kpiVarId: varId.describe('Variable whose statistic is measured.'),
    statistic: z.enum(['final', 'max', 'min', 'mean']),
    params: z
      .array(z.object({ varId, min: z.number(), max: z.number() }))
      .max(20)
      .describe('Constants to vary one at a time with their low/high values; [] = constants with an uncertainty range.'),
  }),
  get_leverage: z.object({}),
} satisfies Record<ReadToolName, z.ZodType>;

export const READ_TOOL_DESCRIPTIONS: Record<ReadToolName, string> = {
  get_model_summary:
    'Returns a compact structural summary of the current model: frame (problem, KPIs, horizon), counts by kind and origin, ' +
    'isolated variables, variables without equations, links with unknown polarity or low confidence, and the scenarios, ' +
    'interventions and assertions. Use it first when you need an overview; the full model JSON is already in the request. ' +
    'It does not simulate or find loops.',
  list_loops:
    'Enumerates the feedback loops of the causal graph (Johnson algorithm, capped) and classifies each as R (reinforcing), ' +
    'B (balancing) or U (contains an unknown polarity). Returns each loop key, type, length, delay flag, variable names and any ' +
    'existing name, plus loop participation per variable. Use it before explaining or critiquing loops, and use loop keys ' +
    'exactly as returned. May answer "not available yet" if loop analysis is not built.',
  get_health:
    'Runs the Model Health checks: unquantified variables, equation parse errors, undefined/unused variables, link-equation ' +
    'mismatches, unit consistency, algebraic loops, integration error (DT vs DT/2), extreme-condition assertions and ' +
    'polarity consistency. Returns items with severity and element ids. Use it in Critique and before simulating. ' +
    'May answer "not available yet" if the engine is not built.',
  simulate_scenario:
    'Simulates the quantified model (baseline, an existing scenario, and/or extra equation overrides) and returns ' +
    'downsampled series with final, min and max values for the requested variables, plus assertion violations and warnings. ' +
    'Use it to test an intervention before proposing it and to ground any claim about behaviour over time. ' +
    'Only works when the model is quantified (stocks, flows, equations); otherwise returns the compile errors.',
  run_sensitivity:
    'One-at-a-time sensitivity: varies each constant between its low and high value and reports the swing of a KPI ' +
    'statistic, sorted by impact with a cumulative (Pareto) share. Use it to find the parameters that matter most. ' +
    'May answer "not available yet" if the analysis module is not built.',
  get_leverage:
    'Structural leverage ranking of variables (loop participation, centrality) with cumulative Pareto share, sorted by ' +
    'score. Use it in Intervene and Report to focus on the vital few variables. ' +
    'May answer "not available yet" if the analysis is not built.',
};

/** A tool call that the model made with semantically wrong input (unknown ids, …): returned as an is_error result. */
export class ToolInputError extends Error {}

export interface ToolRunResult {
  /** false when the analysis is not available yet */
  ok: boolean;
  content: unknown;
  summary: string;
}

/** Per-request memory shared by tool calls (e.g. which scenarios were simulated, for Intervene in Phase 3). */
export interface ToolContext {
  simulated: { scenarioId: string; overrides: { varId: string; equation: string }[] }[];
}

export type ReadToolImpls = {
  [N in ReadToolName]: (model: Model, input: z.infer<(typeof READ_TOOL_INPUTS)[N]>, ctx: ToolContext) => ToolRunResult;
};

const isNotImplemented = (e: unknown) =>
  e instanceof NotImplementedError || (e instanceof Error && e.name === 'NotImplementedError');

/** Run a core call; a module that has not landed becomes a "not available yet" result instead of an error. */
export function adapt(what: string, fn: () => ToolRunResult): ToolRunResult {
  try {
    return fn();
  } catch (e) {
    if (isNotImplemented(e))
      return { ok: false, content: { available: false, message: `${what} is not available yet in this LoopLab build.` }, summary: 'not available yet' };
    throw e;
  }
}

const sig = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(6)) : x);
const nameOf = (model: Model) => {
  const names = new Map(model.variables.map((v) => [v.id, v.name]));
  return (id: Id) => names.get(id) ?? id;
};
function requireVars(model: Model, ids: string[], what: string): void {
  const known = new Set(model.variables.map((v) => v.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new ToolInputError(`unknown variable id(s) in ${what}: ${unknown.join(', ')}`);
}

function modelSummary(model: Model): ToolRunResult {
  const linked = new Set(model.links.flatMap((l) => [l.from, l.to]));
  const count = <T extends string>(xs: T[]) => xs.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {});
  const summary = {
    name: model.name,
    problem: model.frame.problem,
    purpose: model.frame.purpose,
    horizon: model.simSpec,
    kpis: model.frame.kpis.map((k) => ({ id: k.id, name: k.name, varId: k.varId, goal: k.goal, target: k.target })),
    referenceModes: model.frame.referenceModes.map((r) => ({ id: r.id, name: r.name, varId: r.varId, label: r.label, points: r.points.length })),
    excluded: model.frame.excluded.map((b) => b.name),
    counts: {
      variables: model.variables.length,
      links: model.links.length,
      byKind: count(model.variables.map((v) => v.kind)),
      byOrigin: count([...model.variables, ...model.links].map((x) => x.origin)),
      loopAnnotations: model.loopAnnotations.length,
    },
    isolatedVariables: model.variables.filter((v) => !linked.has(v.id)).map((v) => v.id),
    missingEquations: model.variables.filter((v) => v.kind !== 'variable' && v.kind !== 'lookup' && v.equation.trim() === '').map((v) => v.id),
    unknownPolarityLinks: model.links.filter((l) => l.polarity === '?').map((l) => l.id),
    lowConfidenceLinks: model.links.filter((l) => l.confidence === 'low').map((l) => l.id),
    delayedLinks: model.links.filter((l) => l.delay).map((l) => l.id),
    scenarios: model.scenarios.map((s) => ({ id: s.id, name: s.name, overrides: s.overrides.length })),
    interventions: model.interventions.map((iv) => ({ id: iv.id, name: iv.name, leverage: iv.leverage, scenarioId: iv.scenarioId, status: iv.status })),
    assertions: model.assertions.map((a) => ({ id: a.id, expr: a.expr, enabled: a.enabled })),
  };
  return { ok: true, content: summary, summary: `${model.variables.length} variables, ${model.links.length} links` };
}

const MAX_LOOPS_SHOWN = 40;
const POINTS = 21;

function downsample(time: Float64Array, ys: Float64Array): [number, number][] {
  const n = time.length;
  if (n === 0) return [];
  const idx = new Set<number>();
  for (let k = 0; k < POINTS; k++) idx.add(Math.round((k * (n - 1)) / (POINTS - 1)));
  return [...idx].sort((a, b) => a - b).map((i) => [sig(time[i] ?? NaN), sig(ys[i] ?? NaN)]);
}

export const coreReadTools: ReadToolImpls = {
  get_model_summary: (model) => modelSummary(model),

  list_loops: (model, input) =>
    adapt('Loop analysis', () => {
      requireVars(model, input.containing, 'containing');
      const name = nameOf(model);
      const found = findLoops(model);
      const loops = found.loops
        .filter((l) => input.containing.every((id) => l.varIds.includes(id)))
        .sort((a, b) => a.length - b.length || a.key.localeCompare(b.key));
      const annotations = new Map(model.loopAnnotations.map((a) => [a.key, a.name]));
      const participation = Object.entries(loopParticipation(found.loops))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, loopsThrough]) => ({ id, name: name(id), loops: loopsThrough }));
      return {
        ok: true,
        content: {
          total: found.loops.length,
          truncated: found.truncated,
          reason: found.reason ?? null,
          matching: loops.length,
          loops: loops.slice(0, MAX_LOOPS_SHOWN).map((l) => ({
            key: l.key,
            type: l.type,
            length: l.length,
            hasDelay: l.hasDelay,
            name: annotations.get(l.key) ?? '',
            variables: l.varIds.map(name),
          })),
          participation,
        },
        summary: `${found.loops.length} loops${found.truncated ? ' (capped)' : ''}`,
      };
    }),

  get_health: (model) =>
    adapt('Model Health', () => {
      const report = runHealth(model, { runIntegrationTest: true });
      const items = report.items.slice(0, 50).map((i) => ({ check: i.check, severity: i.severity, message: i.message, elementIds: i.elementIds }));
      const errors = report.items.filter((i) => i.severity === 'error').length;
      return { ok: true, content: { ok: report.ok, total: report.items.length, items }, summary: `${report.items.length} items, ${errors} errors` };
    }),

  simulate_scenario: (model, input, ctx) =>
    adapt('Simulation', () => {
      const base = input.scenarioId ? model.scenarios.find((s) => s.id === input.scenarioId) : undefined;
      if (input.scenarioId && !base) throw new ToolInputError(`unknown scenario id "${input.scenarioId}"`);
      requireVars(model, input.overrides.map((o) => o.varId), 'overrides');
      requireVars(model, input.saveIds, 'saveIds');
      const scenario: Scenario = {
        id: base?.id ?? 's_copilot',
        name: base?.name ?? 'copilot',
        note: '',
        origin: 'user',
        overrides: [...(base?.overrides ?? []), ...input.overrides],
        ...(base?.simSpec ? { simSpec: base.simSpec } : {}),
      };
      const compiled = compileModel(model, { scenario });
      if (!compiled.ok)
        return {
          ok: true,
          content: { compiled: false, errors: compiled.errors.slice(0, 20).map((e) => ({ message: e.message, elementIds: e.elementIds })) },
          summary: `compile failed (${compiled.errors.length} errors)`,
        };
      const kpiIds = model.frame.kpis.map((k) => k.varId).filter((id): id is Id => id !== null);
      const stocks = model.variables.filter((v) => v.kind === 'stock').map((v) => v.id);
      const saveIds = input.saveIds.length > 0 ? input.saveIds : [...new Set([...kpiIds, ...stocks])].slice(0, 8);
      const spec = { ...(base?.simSpec ?? {}), ...(input.stop !== null ? { stop: input.stop } : {}) };
      const result = compiled.compiled.simulate(spec, { saveIds });
      ctx.simulated.push({ scenarioId: input.scenarioId, overrides: scenario.overrides });
      const name = nameOf(model);
      const series = Object.entries(result.series).map(([id, ys]) => {
        let min = Infinity;
        let max = -Infinity;
        for (const y of ys) {
          if (y < min) min = y;
          if (y > max) max = y;
        }
        return { id, name: name(id), final: sig(ys[ys.length - 1] ?? NaN), min: sig(min), max: sig(max), points: downsample(result.time, ys) };
      });
      return {
        ok: true,
        content: { compiled: true, spec: result.spec, series, assertions: result.assertions, warnings: result.warnings },
        summary: `simulated ${series.length} series to t=${result.spec.stop}`,
      };
    }),

  run_sensitivity: (model, input) =>
    adapt('Sensitivity analysis', () => {
      requireVars(model, [input.kpiVarId, ...input.params.map((p) => p.varId)], 'run_sensitivity');
      const params: ParamRange[] =
        input.params.length > 0
          ? input.params
          : model.variables.flatMap((v) => (v.uncertainty ? [{ varId: v.id, min: v.uncertainty.min, max: v.uncertainty.max }] : []));
      if (params.length === 0) throw new ToolInputError('no parameters: pass params or give constants an uncertainty range');
      const { rows } = oatSensitivity(model, params, { varId: input.kpiVarId, statistic: input.statistic });
      const name = nameOf(model);
      return {
        ok: true,
        content: { rows: rows.slice(0, 15).map((r) => ({ ...r, name: name(r.varId) })) },
        summary: `${rows.length} parameters ranked`,
      };
    }),

  get_leverage: (model) =>
    adapt('Leverage ranking', () => {
      const rows = structuralLeverage(model, findLoops(model).loops);
      const name = nameOf(model);
      return {
        ok: true,
        content: { rows: rows.slice(0, 15).map((r) => ({ varId: r.varId, name: name(r.varId), score: sig(r.score), cumulativeShare: sig(r.cumulativeShare) })) },
        summary: `${rows.length} variables ranked`,
      };
    }),
};
