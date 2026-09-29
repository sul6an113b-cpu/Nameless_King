/**
 * Cross-module contract types (SPEC §6). Owned by the orchestrator: agents implement against these and
 * request changes in their reports rather than editing them. Implementations live in each module folder.
 */
import type {
  ArchetypeId,
  BoundaryItem,
  Id,
  LoopKey,
  Model,
  Scenario,
  SimSpec,
} from './schema/model.ts';

// ── parser (SPEC §6.1) ─────────────────────────────────────────────────────

export interface Span {
  start: number;
  end: number;
}

export type BinOp = '+' | '-' | '*' | '/' | '^' | 'mod' | '<' | '<=' | '>' | '>=' | '=' | '<>' | 'and' | 'or';

export type Ast =
  | { k: 'num'; v: number }
  | { k: 'ref'; name: string /* canonical */; raw: string; span: Span }
  | { k: 'un'; op: '-' | '+' | 'not'; a: Ast }
  | { k: 'bin'; op: BinOp; a: Ast; b: Ast }
  | { k: 'if'; c: Ast; t: Ast; e: Ast }
  | { k: 'call'; fn: string /* upper-case */; args: Ast[]; span: Span };

export type ParseResult = { ok: true; ast: Ast } | { ok: false; error: { message: string; span: Span } };

export interface BuiltinInfo {
  minArgs: number;
  maxArgs: number;
  stateful: boolean;
  /** e.g. 'SMTH1(input, averaging_time[, initial])' */
  signature: string;
  doc: string;
}

// ── units (SPEC §6.2) ──────────────────────────────────────────────────────

/** e.g. tasks/week → { scale: 1/7, dims: { tasks: 1, day: -1 } } */
export interface Dim {
  scale: number;
  dims: Record<string, number>;
}

export type UnitParseResult = { ok: true; dim: Dim } | { ok: false; message: string };

// ── health (SPEC §6.4) ─────────────────────────────────────────────────────

export type HealthCheck =
  | 'unquantified'
  | 'parse'
  | 'undefined'
  | 'unused'
  | 'link-equation-mismatch'
  | 'units'
  | 'algebraic-loop'
  | 'integration-error'
  | 'assertion'
  | 'polarity'
  | 'flow-link'
  | 'numeric';

export interface HealthItem {
  check: HealthCheck;
  severity: 'error' | 'warning' | 'info';
  message: string;
  elementIds: Id[];
  detail?: unknown;
}

export interface HealthReport {
  items: HealthItem[];
  /** true when there is no item of severity 'error' */
  ok: boolean;
}

// ── simulation (SPEC §6.3) ─────────────────────────────────────────────────

export interface SimOptions {
  overrides?: Record<Id, number>;
  /** variables to save (default: all user variables) */
  saveIds?: Id[];
  /** cooperative cancellation, checked between steps */
  signal?: { aborted: boolean };
  /**
   * Also return the full value vector (user variables + hidden builtin stocks/auxes, laid out per
   * `CompiledModel.index`/`size`) at every saved step — needed by Loops That Matter to re-evaluate equations.
   */
  saveState?: boolean;
}

export interface SimResult {
  /** saved times */
  time: Float64Array;
  /** one column per saved variable (transferable to/from workers) */
  series: Record<Id, Float64Array>;
  spec: SimSpec;
  /** first violation per assertion */
  assertions: { assertionId: Id; time: number; message: string }[];
  warnings: string[];
  /** present only with `SimOptions.saveState`: one full value vector (length `CompiledModel.size`) per saved time */
  state?: Float64Array[];
}

export interface CompiledModel {
  /** user variables in evaluation order (stocks first) */
  varIds: Id[];
  /** position of each user variable in the value vector */
  index: Record<Id, number>;
  /** length of the value vector (user variables + hidden internal stocks/auxes) */
  size: number;
  simulate(spec?: Partial<SimSpec>, opts?: SimOptions): SimResult;
  /** Evaluate one non-stock variable's equation given a full value vector (LTM link scores, polarity checks). */
  evalVar(id: Id, values: Float64Array, time: number): number;
  /** Direct dependencies from equations, plus flow→stock edges. */
  deps: Record<Id, Id[]>;
}

export type CompileResult = { ok: true; compiled: CompiledModel } | { ok: false; errors: HealthItem[] };

export interface CompileOptions {
  scenario?: Scenario;
  overrides?: Record<Id, number>;
}

// ── graph (SPEC §6.5) ──────────────────────────────────────────────────────

export type LoopType = 'R' | 'B' | 'U';

export interface Loop {
  key: LoopKey;
  varIds: Id[];
  linkIds: Id[];
  type: LoopType;
  length: number;
  hasDelay: boolean;
}

export interface FindLoopsOptions {
  /** default: model.settings.loopCap */
  cap?: number;
  timeBudgetMs?: number;
}

export interface FindLoopsResult {
  loops: Loop[];
  truncated: boolean;
  cap: number;
  reason?: 'cap' | 'time';
}

export interface BoundaryChart {
  endogenous: Id[];
  exogenous: Id[];
  excluded: BoundaryItem[];
}

export interface StructuralLeverageRow {
  varId: Id;
  score: number;
  components: Record<string, number>;
  /** cumulative share of the total score up to and including this row (Pareto) */
  cumulativeShare: number;
}

export interface ArchetypeCandidate {
  archetypeId: ArchetypeId;
  loopKeys: LoopKey[];
  roles: Record<string, Id>;
  score: number;
  explanation: string;
}

/** Evaluates one variable's equation from a full value vector; same shape as CompiledModel.evalVar. */
export type VarEvaluator = (id: Id, values: Float64Array, time: number) => number;

// ── analysis (SPEC §6.6) ───────────────────────────────────────────────────

export interface ParamRange {
  varId: Id;
  min: number;
  max: number;
  distribution?: 'uniform' | 'triangular';
  mode?: number;
}

export interface KpiSpec {
  varId: Id;
  statistic: 'final' | 'max' | 'min' | 'mean';
}

export interface TornadoRow {
  varId: Id;
  low: number;
  high: number;
  kpiAtLow: number;
  kpiAtHigh: number;
  base: number;
  swing: number;
  cumulativeShare: number;
}

export interface FitStats {
  r2: number;
  mape: number;
  /** Theil inequality statistics; um + us + uc = 1 */
  theil: { um: number; us: number; uc: number };
}

export interface MonteCarloOptions {
  runs: number;
  seed: number;
  saveIds: Id[];
  kpi?: KpiSpec;
  onProgress?(done: number, total: number): void;
  signal?: { aborted: boolean };
}

export interface MonteCarloResult {
  time: Float64Array;
  bands: Record<Id, { p5: Float64Array; p50: Float64Array; p95: Float64Array }>;
  /** Spearman rank correlation of each parameter with the KPI statistic */
  importance: { varId: Id; rho: number }[];
  runs: number;
  cancelled: boolean;
}

export interface CalibrationResult {
  best: Record<Id, number>;
  stats: FitStats;
  iterations: number;
  converged: boolean;
}

export interface LtmResult {
  time: Float64Array;
  /** relative loop score per loop, in [−1, 1], normalised within its cycle partition */
  relScore: Record<LoopKey, Float64Array>;
  linkScore: Record<Id, Float64Array>;
  /** loop keys grouped by cycle partition (strongly connected component) */
  partitions: LoopKey[][];
}

export interface LeverageRankRow {
  varId: Id;
  score: number;
  evidence: string[];
  cumulativeShare: number;
}

// ── report (SPEC §6.8) ─────────────────────────────────────────────────────

export interface ReportInput {
  model: Model;
  loops: Loop[];
  leverage: LeverageRankRow[];
  runs: { name: string; result: SimResult }[];
  health?: HealthReport;
  sensitivity?: TornadoRow[];
  monteCarlo?: MonteCarloResult;
  ltm?: LtmResult;
  /** ISO timestamp printed in the report (explicit for determinism) */
  generatedAt: string;
}

export interface ReportOutput {
  markdown: string;
  html: string;
}

// ── XMILE (SPEC §6.7) ──────────────────────────────────────────────────────

export type XmileImportResult =
  | { ok: true; model: Model; warnings: string[] }
  | { ok: false; errors: { code: string; message: string }[] };

