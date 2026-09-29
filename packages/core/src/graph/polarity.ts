/**
 * Polarity consistency (SPEC §6.5, Model Health check 'polarity'): the sign each equation implies for a link
 * versus the drawn polarity. Method and tolerances: docs/decisions/graph-analyst.md G-008.
 *
 * - flow → stock links: an inflow implies '+', an outflow '−' (from the flow's `flow.from/to`).
 * - links into an aux or flow: the source value is perturbed (central difference) at up to 12 sampled states and
 *   the target's equation re-evaluated; a consistent sign is the implied polarity, a mixed sign is "non-monotonic".
 */
import type { CompiledModel, HealthItem, SimResult, VarEvaluator } from '../contracts.ts';
import type { Id, Link, Model, Polarity, Variable } from '../schema/model.ts';

/** At most this many saved rows (evenly spaced, first and last included) are used as sample states. */
export const POLARITY_MAX_SAMPLES = 12;
/** Relative size of the perturbation of the source value (absolute 1e-4 when the value is 0). */
const REL_STEP = 1e-4;
/** A change smaller than this fraction of the target's magnitude counts as "no effect" (float noise). */
const ZERO_TOL = 1e-12;

/** Kinds whose value can be perturbed ('variable' is unquantified; a 'lookup' is a function, not a value). */
const PERTURBABLE = new Set<Variable['kind']>(['stock', 'flow', 'aux', 'constant']);

interface Layout {
  index: Record<Id, number>;
  size: number;
}

interface State {
  values: Float64Array;
  time: number;
}

type ImpliedSign = '+' | '-' | 'mixed';

interface Finding {
  implied: ImpliedSign;
  basis: 'flow' | 'equation';
  /** states where the target could be evaluated (equation basis only) */
  states: number;
  positive: number;
  negative: number;
}

/**
 * Equation-implied link signs vs drawn polarity.
 *
 * `evaluator` defaults to `compiled.evalVar`. Sample states come from `samples` (a baseline run), else a one-step
 * run of `compiled` (initial values), else a synthetic state (numeric equations, 1 elsewhere). Without `compiled`,
 * the value vector passed to the evaluator is laid out in `model.variables` order.
 */
export function checkPolarity(
  model: Model,
  compiled?: CompiledModel,
  samples?: SimResult,
  evaluator?: VarEvaluator,
): HealthItem[] {
  const evalVar: VarEvaluator | undefined =
    evaluator ?? (compiled ? (id, values, time) => compiled.evalVar(id, values, time) : undefined);
  const layout: Layout = compiled
    ? { index: compiled.index, size: compiled.size }
    : { index: Object.fromEntries(model.variables.map((v, i) => [v.id, i])), size: model.variables.length };
  const vars = new Map(model.variables.map((v) => [v.id, v]));
  let states: State[] | undefined;

  const items: HealthItem[] = [];
  for (const link of model.links) {
    const from = vars.get(link.from);
    const to = vars.get(link.to);
    if (!from || !to || from === to) continue;

    let finding: Finding | undefined;
    if (to.kind === 'stock') {
      finding = flowFinding(from, to.id);
    } else if (evalVar && (to.kind === 'aux' || to.kind === 'flow') && PERTURBABLE.has(from.kind)) {
      const sourceIndex = layout.index[from.id];
      if (sourceIndex === undefined) continue;
      states ??= sampleStates(model, layout, compiled, samples);
      finding = equationFinding(evalVar, to.id, sourceIndex, states);
    }
    const item = finding && compare(link, from, to, finding);
    if (item) items.push(item);
  }
  return items;
}

function flowFinding(from: Variable, stockId: Id): Finding | undefined {
  if (from.kind !== 'flow' || !from.flow) return undefined;
  const implied = from.flow.to === stockId ? '+' : from.flow.from === stockId ? '-' : undefined;
  // A link into a stock from anything but one of its own flows is a flow-link / link-equation issue, not polarity.
  return implied && { implied, basis: 'flow', states: 0, positive: 0, negative: 0 };
}

function equationFinding(
  evalVar: VarEvaluator,
  targetId: Id,
  sourceIndex: number,
  states: State[],
): Finding | undefined {
  let evaluated = 0;
  let positive = 0;
  let negative = 0;
  for (const { values, time } of states) {
    const x = values[sourceIndex];
    if (!Number.isFinite(x)) continue;
    const h = REL_STEP * (x !== 0 ? Math.abs(x) : 1);
    let up: number;
    let down: number;
    try {
      values[sourceIndex] = x + h;
      up = evalVar(targetId, values, time);
      values[sourceIndex] = x - h;
      down = evalVar(targetId, values, time);
    } catch {
      continue; // e.g. the evaluator cannot evaluate this variable; treat the state as unusable
    } finally {
      values[sourceIndex] = x;
    }
    if (!Number.isFinite(up) || !Number.isFinite(down)) continue;
    evaluated++;
    const change = up - down;
    if (Math.abs(change) <= ZERO_TOL * Math.max(Math.abs(up), Math.abs(down))) continue;
    if (change > 0) positive++;
    else negative++;
  }
  // No measurable effect in any state (flat lookup region, stateful builtin, missing reference): no verdict.
  if (positive + negative === 0) return undefined;
  const implied: ImpliedSign = positive > 0 && negative > 0 ? 'mixed' : positive > 0 ? '+' : '-';
  return { implied, basis: 'equation', states: evaluated, positive, negative };
}

const show = (p: Polarity | ImpliedSign): string => (p === '-' ? '−' : p);

function compare(link: Link, from: Variable, to: Variable, finding: Finding): HealthItem | undefined {
  const drawn = link.polarity;
  const arrow = `"${from.name}" → "${to.name}"`;
  const base = { check: 'polarity' as const, elementIds: [link.id, from.id, to.id] };
  const detail = { linkId: link.id, drawn, ...finding };
  const why =
    finding.basis === 'flow'
      ? `"${from.name}" is ${finding.implied === '+' ? 'an inflow to' : 'an outflow from'} "${to.name}"`
      : `the equation of "${to.name}" implies ${show(finding.implied)} at ${finding.states} sampled state(s)`;

  if (finding.implied === 'mixed')
    return {
      ...base,
      severity: 'info',
      message: `Link ${arrow} is non-monotonic: its effect is positive at ${finding.positive} and negative at ${finding.negative} sampled state(s), so the drawn polarity ${show(drawn)} holds only in some states.`,
      detail,
    };
  if (drawn === finding.implied) return undefined;
  if (drawn === '?')
    return { ...base, severity: 'info', message: `Link ${arrow} has unknown polarity; ${why}.`, detail };
  return {
    ...base,
    severity: 'warning',
    message: `Link ${arrow} is drawn ${show(drawn)} but ${why}.`,
    detail,
  };
}

function sampleStates(model: Model, layout: Layout, compiled?: CompiledModel, samples?: SimResult): State[] {
  const run = samples ?? initialRun(model, compiled);
  if (run && run.time.length > 0) return sampleRows(run.time.length).map((row) => stateFromRun(run, row, layout));
  return [syntheticState(model, layout)];
}

/** Initial values: a single-step run of the compiled model (its first saved row is the initial state). */
function initialRun(model: Model, compiled?: CompiledModel): SimResult | undefined {
  if (!compiled) return undefined;
  const { start, dt } = model.simSpec;
  try {
    return compiled.simulate({ stop: start + dt, saveEvery: dt });
  } catch {
    return undefined;
  }
}

/** Evenly spaced row indices, first and last included, at most POLARITY_MAX_SAMPLES. */
function sampleRows(count: number): number[] {
  if (count <= POLARITY_MAX_SAMPLES) return Array.from({ length: count }, (_, i) => i);
  const rows = new Set<number>();
  for (let i = 0; i < POLARITY_MAX_SAMPLES; i++) rows.add(Math.round((i * (count - 1)) / (POLARITY_MAX_SAMPLES - 1)));
  return [...rows];
}

function stateFromRun(run: SimResult, row: number, layout: Layout): State {
  const values = new Float64Array(layout.size);
  for (const [id, i] of Object.entries(layout.index)) {
    const column = run.series[id];
    if (column && row < column.length) values[i] = column[row];
  }
  return { values, time: run.time[row] };
}

function syntheticState(model: Model, layout: Layout): State {
  const values = new Float64Array(layout.size).fill(1);
  for (const v of model.variables) {
    const i = layout.index[v.id];
    const literal = v.equation.trim() === '' ? NaN : Number(v.equation);
    if (i !== undefined && Number.isFinite(literal)) values[i] = literal;
  }
  return { values, time: model.simSpec.start };
}
