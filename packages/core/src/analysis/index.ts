/** Behavioural analysis (SPEC §6.6) — owner: analysis (Phase 3). Phase-1 stub: signatures only. */
import type {
  CalibrationResult,
  FitStats,
  KpiSpec,
  LeverageRankRow,
  LtmResult,
  MonteCarloOptions,
  MonteCarloResult,
  ParamRange,
  StructuralLeverageRow,
  TornadoRow,
} from '../contracts.ts';
import type { Id, Model } from '../schema/model.ts';
import { compileModel } from '../sim/index.ts';
import { notImplemented } from '../stub.ts';

/** mulberry32: small, fast, deterministic; returns floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function latinHypercube(_n: number, _dims: number, _rng: () => number): number[][] {
  return notImplemented('analysis.latinHypercube');
}

function kpiValue(values: Float64Array, statistic: KpiSpec['statistic']): number {
  if (values.length === 0) return NaN;
  if (statistic === 'final') return values[values.length - 1] ?? NaN;
  if (statistic === 'mean') {
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  }
  let best = values[0] ?? NaN;
  for (const v of values) best = statistic === 'max' ? Math.max(best, v) : Math.min(best, v);
  return best;
}

/** One-at-a-time sensitivity: each parameter is set to its min and max with all others at base. Sorted by swing. */
export function oatSensitivity(model: Model, params: ParamRange[], kpi: KpiSpec): { rows: TornadoRow[] } {
  const c = compileModel(model);
  if (!c.ok) throw new Error(`Cannot analyse a model that does not compile: ${c.errors[0]?.message ?? 'unknown error'}`);
  const run = (overrides?: Record<Id, number>): number => {
    const res = c.compiled.simulate(undefined, { overrides, saveIds: [kpi.varId] });
    return kpiValue(res.series[kpi.varId] ?? new Float64Array(0), kpi.statistic);
  };
  const base = run();
  const rows = params.map((p) => {
    const kpiAtLow = run({ [p.varId]: p.min });
    const kpiAtHigh = run({ [p.varId]: p.max });
    return { varId: p.varId, low: p.min, high: p.max, kpiAtLow, kpiAtHigh, base, swing: Math.abs(kpiAtHigh - kpiAtLow), cumulativeShare: 0 };
  });
  rows.sort((x, y) => y.swing - x.swing);
  const total = rows.reduce((t, r) => t + (Number.isFinite(r.swing) ? r.swing : 0), 0);
  let acc = 0;
  for (const r of rows) {
    acc += Number.isFinite(r.swing) ? r.swing : 0;
    r.cumulativeShare = total > 0 ? acc / total : 0;
  }
  return { rows };
}

export function monteCarlo(_model: Model, _params: ParamRange[], _opts: MonteCarloOptions): MonteCarloResult {
  return notImplemented('analysis.monteCarlo');
}

export function calibrate(
  _model: Model,
  _params: ParamRange[],
  _targets: { refModeId: Id; varId: Id }[],
): CalibrationResult {
  return notImplemented('analysis.calibrate');
}

export function fitStats(_simulated: number[], _observed: number[]): FitStats {
  return notImplemented('analysis.fitStats');
}

export { loopsThatMatter } from './ltm.ts';

export function rankLeverage(_input: {
  structural: StructuralLeverageRow[];
  sensitivity?: TornadoRow[];
  ltm?: LtmResult;
}): LeverageRankRow[] {
  return notImplemented('analysis.rankLeverage');
}
