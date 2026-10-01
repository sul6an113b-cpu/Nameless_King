/** KPI comparison across runs (the Decide stage's side-by-side table and the report's results table). */
import type { SimResult } from '../contracts.ts';
import type { Id, Kpi, Model } from '../schema/model.ts';

export interface KpiCell {
  /** final value of the KPI variable in this run; null when the run did not save it */
  value: number | null;
  /** change against the first run as a fraction of |first value|; null for the first run or a zero/missing base */
  delta: number | null;
  /** against the first run, by the KPI's goal; null for the first run, an unset target, or a missing value */
  verdict: 'better' | 'worse' | 'same' | null;
}

export interface KpiRow {
  kpiId: Id;
  name: string;
  varId: Id;
  units: string;
  goal: Kpi['goal'];
  target?: number;
  cells: KpiCell[];
}

export interface KpiComparison {
  runs: string[];
  rows: KpiRow[];
}

/** How far a value is from what the goal wants (lower is better); null when the goal cannot be judged. */
function shortfall(goal: Kpi['goal'], target: number | undefined, v: number): number | null {
  if (goal === 'minimize') return v;
  if (goal === 'maximize') return -v;
  return target === undefined ? null : Math.abs(v - target);
}

const lastOf = (a: Float64Array | undefined): number | null => (a && a.length > 0 ? (a[a.length - 1] ?? null) : null);

/** Final KPI values per run (the first run is the baseline). KPIs without a variable are left out. */
export function kpiComparison(model: Model, runs: { name: string; result: SimResult }[]): KpiComparison {
  const rows: KpiRow[] = [];
  for (const k of model.frame.kpis) {
    if (k.varId === null) continue;
    const varId = k.varId;
    const values = runs.map((r) => lastOf(r.result.series[varId]));
    const base = values[0] ?? null;
    const baseShort = base === null ? null : shortfall(k.goal, k.target, base);
    rows.push({
      kpiId: k.id,
      name: k.name,
      varId,
      units: model.variables.find((v) => v.id === varId)?.units ?? '',
      goal: k.goal,
      ...(k.target !== undefined ? { target: k.target } : {}),
      cells: values.map((value, i): KpiCell => {
        if (i === 0 || value === null || base === null || !Number.isFinite(value) || !Number.isFinite(base))
          return { value, delta: null, verdict: null };
        const delta = base === 0 ? null : (value - base) / Math.abs(base);
        const s = shortfall(k.goal, k.target, value);
        if (s === null || baseShort === null) return { value, delta, verdict: null };
        const tol = 1e-9 * Math.max(1, Math.abs(baseShort));
        return { value, delta, verdict: s < baseShort - tol ? 'better' : s > baseShort + tol ? 'worse' : 'same' };
      }),
    });
  }
  return { runs: runs.map((r) => r.name), rows };
}
