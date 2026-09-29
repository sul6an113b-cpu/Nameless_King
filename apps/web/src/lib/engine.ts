/**
 * Thin adapters over core modules that other agents are still building (parser, units, sim, graph, report,
 * protocol). Each call returns a result union instead of throwing, so the UI can show a calm
 * "available after integration" state while a module is a stub, and lights up automatically after the merge.
 */
import {
  BUILTINS,
  BUILTIN_NAMES,
  NotImplementedError,
  boundaryChart,
  findLoops,
  inferUnits,
  parseEquation,
  parseUnit,
  previewPatch,
  renameVariable,
  runHealth,
  setVariableName,
  toCsv,
  type BoundaryChart,
  type FindLoopsResult,
  type HealthItem,
  type HealthReport,
  type Id,
  type Model,
  type ParseResult,
  type Patch,
  type PatchPreview,
  type SimResult,
  type UnitParseResult,
} from '@looplab/core';

export type Attempt<T> =
  { status: 'ok'; value: T } | { status: 'unavailable'; what: string } | { status: 'error'; message: string };

/** Run a core call; a NotImplementedError becomes `unavailable`, any other error becomes `error`. */
export function attempt<T>(what: string, fn: () => T): Attempt<T> {
  try {
    return { status: 'ok', value: fn() };
  } catch (e) {
    if (e instanceof NotImplementedError) return { status: 'unavailable', what };
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export const checkEquation = (src: string): Attempt<ParseResult> =>
  attempt('Equation checking', () => parseEquation(src));

export const checkUnit = (units: string, model: Model): Attempt<UnitParseResult> =>
  attempt('Unit checking', () => parseUnit(units, model.units));

/** Unit issues that concern one variable. */
export const unitIssuesFor = (model: Model, id: Id): Attempt<HealthItem[]> =>
  attempt('Unit checking', () => inferUnits(model).issues.filter((i) => i.elementIds.includes(id)));

export const health = (model: Model, runIntegrationTest = false): Attempt<HealthReport> =>
  attempt('Model Health', () => runHealth(model, { runIntegrationTest }));

export const loops = (model: Model): Attempt<FindLoopsResult> => attempt('Loop analysis', () => findLoops(model));

export const boundary = (model: Model): Attempt<BoundaryChart> =>
  attempt('Boundary chart', () => boundaryChart(model, findLoops(model).loops));

export const patchPreview = (model: Model, patch: Patch): Attempt<PatchPreview> =>
  attempt('Patch preview', () => previewPatch(model, patch));

export const resultsCsv = (result: SimResult, names: Record<Id, string>): Attempt<string> =>
  attempt('CSV export', () => toCsv(result, names));

/**
 * Rename a variable. Uses the parser's `renameVariable` (rewrites equations); until the parser is merged it
 * falls back to changing the display name only. Errors (duplicate/reserved name) propagate to the caller.
 */
export function renameVar(model: Model, id: Id, name: string): Model {
  try {
    return renameVariable(model, id, name);
  } catch (e) {
    if (e instanceof NotImplementedError) return setVariableName(model, id, name);
    throw e;
  }
}

export interface BuiltinSuggestion {
  name: string;
  signature: string;
  doc: string;
}

/** Builtins for autocomplete: the parser's table once merged, else the reserved builtin names. */
export function builtinSuggestions(): BuiltinSuggestion[] {
  const entries = Object.entries(BUILTINS);
  if (entries.length > 0)
    return entries.map(([name, b]) => ({ name: name.toUpperCase(), signature: b.signature, doc: b.doc }));
  const constants = new Set(['pi', 'inf', 'time', 'dt', 'starttime', 'stoptime']);
  return BUILTIN_NAMES.map((n) => {
    const name = n.toUpperCase();
    return { name, signature: constants.has(n) ? name : `${name}(…)`, doc: '' };
  });
}
