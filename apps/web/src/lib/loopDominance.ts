/**
 * Loop dominance for the Test stage: Loops That Matter over one run of the model, as the chart and its table view need it.
 * Scores are relative within a cycle partition, so each partition is its own group. A chart draws only the strongest few
 * loops of its group; the table lists the strongest ones with their paths. A loop keeps its handle (R1, B2, … in the order the
 * loops were found) and its colour slot (its place among the drawn loops in that order), never its rank, so neither shuffles
 * when the ranking does.
 */
import { compileModel, findLoops, loopsThatMatter, type Loop, type Model } from '@looplab/core';

/** Soft cap on lines per chart (the legend stays readable); weaker loops remain in the table. */
export const MAX_LOOP_LINES = 6;
/** Rows of the table per group: a model can have a thousand loops. */
export const MAX_TABLE_ROWS = 20;

export interface LoopRow {
  key: string;
  type: Loop['type'];
  /** short name for legends: R1, B2, U1 … numbered by type in the order the loops were found */
  handle: string;
  /** the loop's name if it has one, else its variables joined by →. Untrusted text: render it as text only. */
  label: string;
  /** relative loop score at every saved time (0 at the first, where nothing has changed yet) */
  values: Float64Array;
  /** mean and peak of |relative score| over the scored steps */
  mean: number;
  peak: number;
  /** colour slot 0… when the loop is drawn, else null */
  slot: number | null;
}

export interface LoopGroup {
  /** every loop of the partition, strongest (highest mean |score|) first */
  rows: LoopRow[];
}

export interface LoopDominance {
  time: Float64Array;
  groups: LoopGroup[];
  /** the loop search stopped at its cap: scores are relative to the loops found, not to all loops */
  truncated: boolean;
  cap: number;
  reason?: 'cap' | 'time';
  /** nothing changes over the run, so no loop scores anything */
  idle: boolean;
  /** loops that score 0 throughout while others do not (constant links, or links through a SMOOTH/DELAY builtin) */
  silent: number;
}

/** Simulate `model` with its own settings and score its loops; null when it has no feedback loop. Throws if it cannot run. */
export function loopDominance(model: Model): LoopDominance | null {
  const found = findLoops(model);
  if (found.loops.length === 0) return null;
  const compiled = compileModel(model);
  if (!compiled.ok) throw new Error(compiled.errors[0]?.message ?? 'The model does not compile');
  const result = compiled.compiled.simulate(undefined, { saveIds: [], saveState: true });
  const ltm = loopsThatMatter(model, compiled.compiled, result, found.loops);

  const names = new Map(model.variables.map((v) => [v.id, v.name]));
  const annotated = new Map(model.loopAnnotations.map((a) => [a.key, a.name]));
  const order = new Map(found.loops.map((l, i) => [l.key, i]));
  const loopOf = new Map(found.loops.map((l) => [l.key, l]));
  const counts: Record<Loop['type'], number> = { R: 0, B: 0, U: 0 };
  const handles = new Map(found.loops.map((l) => [l.key, `${l.type}${++counts[l.type]}`]));

  const groups = ltm.partitions.map((keys): LoopGroup => {
    const rows = keys.flatMap((key): LoopRow[] => {
      const loop = loopOf.get(key);
      const values = ltm.relScore[key];
      if (!loop || !values) return [];
      let sum = 0;
      let peak = 0;
      for (let k = 1; k < values.length; k++) {
        const a = Math.abs(values[k]);
        sum += a;
        if (a > peak) peak = a;
      }
      const label = annotated.get(key) || loop.varIds.map((id) => names.get(id) ?? id).join(' → ');
      const handle = handles.get(key) ?? loop.type;
      return [{ key, type: loop.type, handle, label, values, mean: values.length > 1 ? sum / (values.length - 1) : 0, peak, slot: null }];
    });
    const position = (r: LoopRow) => order.get(r.key) ?? 0;
    rows.sort((a, b) => b.mean - a.mean || b.peak - a.peak || position(a) - position(b));
    rows
      .slice(0, MAX_LOOP_LINES)
      .sort((a, b) => position(a) - position(b))
      .forEach((r, i) => (r.slot = i));
    return { rows };
  });

  const all = groups.flatMap((g) => g.rows);
  const idle = all.every((r) => r.peak === 0);
  return {
    time: ltm.time,
    groups,
    truncated: found.truncated,
    cap: found.cap,
    ...(found.reason ? { reason: found.reason } : {}),
    idle,
    silent: idle ? 0 : all.filter((r) => r.peak === 0).length,
  };
}
