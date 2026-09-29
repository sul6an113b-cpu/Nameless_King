/** Behavioural analysis (SPEC §6.6) — owner: analysis (Phase 3). Phase-1 stub: signatures only. */
import type {
  CalibrationResult,
  CompiledModel,
  FitStats,
  KpiSpec,
  LeverageRankRow,
  Loop,
  LtmResult,
  MonteCarloOptions,
  MonteCarloResult,
  ParamRange,
  SimResult,
  StructuralLeverageRow,
  TornadoRow,
} from '../contracts.ts';
import type { Id, Model } from '../schema/model.ts';
import { notImplemented } from '../stub.ts';

export function makeRng(_seed: number): () => number {
  return notImplemented('analysis.makeRng');
}

export function latinHypercube(_n: number, _dims: number, _rng: () => number): number[][] {
  return notImplemented('analysis.latinHypercube');
}

export function oatSensitivity(_model: Model, _params: ParamRange[], _kpi: KpiSpec): { rows: TornadoRow[] } {
  return notImplemented('analysis.oatSensitivity');
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

export function loopsThatMatter(_model: Model, _compiled: CompiledModel, _result: SimResult, _loops: Loop[]): LtmResult {
  return notImplemented('analysis.loopsThatMatter');
}

export function rankLeverage(_input: {
  structural: StructuralLeverageRow[];
  sensitivity?: TornadoRow[];
  ltm?: LtmResult;
}): LeverageRankRow[] {
  return notImplemented('analysis.rankLeverage');
}
