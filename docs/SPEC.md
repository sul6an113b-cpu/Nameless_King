# LoopLab — Technical Specification (SPEC)

Status: **DRAFT for Phase 0 approval** · Source of truth for scope: `docs/BRIEF.md` · Research: `docs/RESEARCH.md`
This SPEC is the contract every agent codes against. The Zod schema in §3 is owned by the orchestrator; agents request changes, never make them.

---

## 1. Principles
1. **One model, two lenses.** A single `Model` (variables + causal links + quantification) is persisted. CLD and SFD views are pure projections (`projectCld(model)`, `projectSfd(model)`); nothing view-specific except layout positions is stored.
2. **KISS / Pareto.** Defaults run without configuration (Euler, DT = 1/4 time unit, auto-layout, loop cap 1,000). Advanced options are collapsed. Every analysis view sorts by impact and shows a cumulative (Pareto) line so the vital few are on top.
3. **Pure core.** `packages/core` is pure TypeScript (no DOM, no Node-only APIs, no `eval`/`new Function`). It runs identically in the browser main thread, Web Workers, the Node server, and Vitest.
4. **AI proposes, engineer disposes.** The copilot never mutates the model; it returns a `Patch`. Only an explicit per-op accept applies it.
5. **Verified depth.** A feature is done when its tests pass. Numerical claims are tested against analytic solutions or published reference outputs.

## 2. Architecture

```
┌──────────────────────────── apps/web (Vite + React) ────────────────────────────┐
│ Workflow rail: Frame · Map · Analyze · Quantify · Test · Decide                  │
│ Zustand store (model + undo/redo) ─ IndexedDB autosave                            │
│ React Flow canvases (CLD / SFD projections) · uPlot charts · SVG bar charts       │
│ Web Workers: sim.worker (Euler/RK4) · analysis.worker pool (sensitivity, MC, LTM, │
│              calibration)                                                         │
│ src/copilot: side panel, patch diff list, API client ──────── fetch /api/copilot ─┼──┐
└──────────────────────────────────────┬───────────────────────────────────────────┘  │
                                       │ imports (TS source)                          │
┌──────────────── packages/core (pure TS) ────────────────┐   ┌─ packages/content ──┐ │
│ schema (Zod) · model ops · parser · units · sim · health │◄──│ archetypes, Meadows │ │
│ graph (loops, metrics, archetypes, polarity) · analysis  │   │ levers, examples    │ │
│ xmile · report · protocol (copilot API + patch apply)    │   └─────────────────────┘ │
└──────────────────────────────┬──────────────────────────┘                           │
                               │ imports                                              │
┌─────────── apps/server (Node, 127.0.0.1 only) ───────────┐◄──────────────────────────┘
│ POST /api/copilot: tool loop (≤8 read-only calls) using    │
│ core on the client-sent model → Anthropic SDK → output tool│
│ GET /api/health · reads .env (key never leaves the server) │
└────────────────────────────────────────────────────────────┘
```

**Runtime topology.** `npm run dev` runs Vite on `http://127.0.0.1:5173` and the server on `http://127.0.0.1:8787`; Vite proxies `/api` to the server. `npm start` (after `npm run build`) runs the bundled server, which also serves `apps/web/dist` from the same origin. Both bind to `127.0.0.1` only.

**Package strategy.** Internal workspace packages export TypeScript source (`"exports": { ".": "./src/index.ts" }`); Vite, Vitest and `tsx` consume source directly. `npm run build` = `tsc -b` (typecheck all projects) + `vite build` (web) + `esbuild` bundle of the server. No package is published.

**Workspaces.** `packages/core` (`@looplab/core`), `packages/content` (`@looplab/content`), `apps/web` (`@looplab/web`), `apps/server` (`@looplab/server`). Dependency direction: `content → core`; `web → core, content`; `server → core, content`. `core` depends on nothing internal.

## 3. Model schema (contract) — `packages/core/src/schema/model.ts`

Written for Zod 4 (`import { z } from 'zod'`). Phase 1 copies this verbatim into the repo; changes after that go through the orchestrator and, if they break saved files, need a migration + user approval (hard stop).

```ts
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;

/** Stable element id. Convention: v_ variable, l_ link, k_ KPI, r_ reference mode, b_ boundary item,
 *  a_ assertion, s_ scenario, i_ intervention, f_ archetype finding, m_ model. */
export const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
export type Id = z.infer<typeof Id>;

export const Origin = z.enum(['user', 'ai-proposed', 'ai-confirmed']);
export const Polarity = z.enum(['+', '-', '?']); // '?' = unknown (imports, AI uncertainty); loops through it are type 'U'
export const Confidence = z.enum(['low', 'medium', 'high']);
/** 'variable' = qualitative CLD variable not yet quantified. 'constant' exports to XMILE as <aux> with a numeric eqn. */
export const VarKind = z.enum(['variable', 'stock', 'flow', 'aux', 'constant', 'lookup']);
export const XY = z.object({ x: z.number(), y: z.number() });

export const GraphicalFunction = z.object({
  xs: z.array(z.number()).min(2),
  ys: z.array(z.number()).min(2),
  /** XMILE gf types: continuous (clamp at ends), extrapolate, discrete (step) */
  mode: z.enum(['continuous', 'extrapolate', 'discrete']).default('continuous'),
});

export const Uncertainty = z.object({
  min: z.number(),
  max: z.number(),
  distribution: z.enum(['uniform', 'triangular']).default('uniform'),
  mode: z.number().optional(), // triangular only
});

export const Variable = z.object({
  id: Id,
  name: z.string().trim().min(1).max(80),
  kind: VarKind.default('variable'),
  /** stock: initial-value expression; flow/aux: expression; constant: numeric literal; lookup: '' */
  equation: z.string().max(4000).default(''),
  units: z.string().max(120).default(''),
  doc: z.string().max(4000).default(''),
  /** flows only: source/target stock ids (null = cloud) */
  flow: z.object({ from: Id.nullable(), to: Id.nullable() }).optional(),
  nonNegative: z.boolean().default(false), // stocks and flows (XMILE non_negative)
  /** aux/flow: applied to the equation result (XMILE embedded gf); lookup: the table, called as LOOKUP(name, x) or name(x) */
  graph: GraphicalFunction.optional(),
  uncertainty: Uncertainty.optional(), // constants: default range for sensitivity / Monte Carlo
  origin: Origin.default('user'),
});

export const Link = z.object({
  id: Id,
  from: Id,
  to: Id, // from === to allowed (self-loop)
  polarity: Polarity.default('+'),
  delay: z.boolean().default(false),
  note: z.string().max(2000).default(''), // mechanism
  confidence: Confidence.default('medium'),
  origin: Origin.default('user'),
});

export const SimSpec = z.object({
  start: z.number().default(0),
  stop: z.number().default(24),
  dt: z.number().positive().default(0.25),
  method: z.enum(['euler', 'rk4']).default('euler'),
  timeUnit: z.string().min(1).default('month'),
  saveEvery: z.number().positive().optional(), // default = dt
});

export const Kpi = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  varId: Id.nullable().default(null),
  goal: z.enum(['minimize', 'maximize', 'target']).default('minimize'),
  target: z.number().optional(),
});

export const ReferenceMode = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  varId: Id.nullable().default(null),
  source: z.enum(['sketch', 'data']), // hand-sketched vs CSV-imported
  label: z.enum(['historical', 'expected', 'feared', 'hoped']).default('historical'),
  points: z.array(z.tuple([z.number(), z.number()])).max(100_000), // [time, value], time ascending
  units: z.string().max(120).default(''),
  note: z.string().max(2000).default(''),
});

export const BoundaryItem = z.object({ id: Id, name: z.string().min(1).max(120), reason: z.string().max(1000).default('') });

export const Frame = z.object({
  problem: z.string().max(8000).default(''),
  purpose: z.string().max(4000).default(''),
  kpis: z.array(Kpi).default([]),
  referenceModes: z.array(ReferenceMode).default([]),
  /** Boundary chart: endogenous/exogenous are derived from the graph; excluded items are listed by the user. */
  excluded: z.array(BoundaryItem).default([]),
});

export const UnitDef = z.object({
  name: z.string().min(1).max(40), // e.g. 'tasks', 'people', 'USD'
  aliases: z.array(z.string().min(1).max(40)).default([]),
  definition: z.string().max(120).default(''), // '' = new base dimension; else e.g. '1000 USD'
});

export const Assertion = z.object({
  id: Id,
  expr: z.string().min(1).max(500), // e.g. 'Backlog >= 0'; evaluated every saved step
  note: z.string().max(1000).default(''),
  enabled: z.boolean().default(true),
});

export const Scenario = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  note: z.string().max(2000).default(''),
  overrides: z.array(z.object({ varId: Id, equation: z.string().max(4000) })).default([]),
  simSpec: SimSpec.partial().optional(),
  origin: Origin.default('user'),
});

export const Intervention = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  description: z.string().max(4000).default(''),
  leverage: z.number().int().min(1).max(12), // Meadows level; 12 = weakest (parameters) … 1 = strongest
  scenarioId: Id.nullable().default(null),
  status: z.enum(['idea', 'tested', 'recommended', 'rejected']).default('idea'),
  rationale: z.string().max(4000).default(''),
  origin: Origin.default('user'),
});

export const ArchetypeId = z.enum([
  'fixes-that-fail', 'shifting-the-burden', 'limits-to-growth', 'eroding-goals',
  'escalation', 'success-to-the-successful', 'tragedy-of-the-commons', 'growth-and-underinvestment',
]);

/** Loop key = variable ids of the cycle, rotated so the lexicographically smallest id is first, joined by '>'. */
export const LoopKey = z.string().min(1).max(4000);

export const LoopAnnotation = z.object({
  key: LoopKey,
  name: z.string().max(120).default(''),
  note: z.string().max(4000).default(''), // e.g. copilot Explain narrative
  origin: Origin.default('user'),
});

export const ArchetypeFinding = z.object({
  id: Id,
  archetypeId: ArchetypeId,
  loopKeys: z.array(LoopKey).min(1),
  roles: z.record(z.string(), Id).default({}), // archetype role name → variable id
  status: z.enum(['candidate', 'confirmed', 'rejected']).default('candidate'),
  note: z.string().max(2000).default(''),
});

export const Settings = z.object({
  loopCap: z.number().int().positive().default(1000),
  integrationErrorTolerance: z.number().positive().default(0.01), // DT vs DT/2 relative stock difference
  seed: z.number().int().default(1), // Monte Carlo / LHS reproducibility
});

export const Decision = z.object({
  recommendation: z.string().max(8000).default(''),
  summary: z.string().max(8000).default(''),
});

export const ModelObject = z.object({
  format: z.literal('looplab-model'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  name: z.string().min(1).max(120),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(),
  frame: Frame.default({}),
  variables: z.array(Variable).default([]),
  links: z.array(Link).default([]),
  simSpec: SimSpec.default({}),
  units: z.array(UnitDef).default([]),
  assertions: z.array(Assertion).default([]),
  scenarios: z.array(Scenario).default([]),
  interventions: z.array(Intervention).default([]),
  loopAnnotations: z.array(LoopAnnotation).default([]),
  archetypeFindings: z.array(ArchetypeFinding).default([]),
  layout: z.object({
    cld: z.record(z.string(), XY).default({}),
    sfd: z.record(z.string(), XY).default({}),
  }).default({ cld: {}, sfd: {} }),
  settings: Settings.default({}),
  decision: Decision.default({}),
});

/** Hard structural integrity. Soft issues (flow-link sync, polarity, units, …) are Model Health items, not parse errors. */
export const ModelSchema = ModelObject.superRefine((m, ctx) => { /* rules I1–I8 below */ });
export type Model = z.infer<typeof ModelSchema>;
export type Variable = z.infer<typeof Variable>;
export type Link = z.infer<typeof Link>;
// …export a type for every schema above.
```

**Hard integrity rules (parse errors, `ModelSchema.superRefine`):**
- I1 ids unique within each collection; I2 variable names unique under `canonicalName(name) = name.trim().toLowerCase().replace(/[\s_]+/g, '_')` (XMILE convention: case-insensitive, space ≡ underscore);
- I3 link endpoints exist; at most one link per ordered `(from, to)` pair (so a loop is identified by its variable sequence);
- I4 `flow` is present iff `kind === 'flow'`; `flow.from/to` are null or ids of `kind === 'stock'` variables; `from !== to` unless both null;
- I5 `kind === 'lookup'` requires `graph`; `graph` only on aux/flow/lookup; `xs.length === ys.length`, `xs` strictly increasing;
- I6 scenario overrides, KPI/reference-mode `varId`, intervention `scenarioId` reference existing ids;
- I7 `simSpec.stop > start`, `(stop − start) / dt ≤ 1,000,000`;
- I8 `uncertainty.min ≤ max` (and `min ≤ mode ≤ max`).

**Soft rules (Model Health, §6.4):** every flow with `to = S` has a link `flow→S` (polarity `+`) and with `from = S` a link `flow→S` (polarity `−`); equation references ⇔ incoming links; stale `layout` keys / loop annotations are ignored.

**Other schema files (orchestrator-owned, Phase 1):**
- `schema/patch.ts` — the patch contract (§7.3).
- `schema/migrate.ts` — `migrateModel(json: unknown): { model: Model; fromVersion: number; warnings: string[] }`. Registry `migrations: Record<number, (json) => json>` applied in order up to `SCHEMA_VERSION`, then `ModelSchema.parse`. A file with `schemaVersion > SCHEMA_VERSION` is rejected with a clear message. Legacy/unknown JSON → typed error, never a crash.
- `schema/factory.ts` — `createEmptyModel(name, opts?: { now?: string; id?: string }): Model`, `newId(prefix): Id` (crypto.getRandomValues, base36).

## 4. Core model operations — `packages/core/src/model/` (orchestrator, Phase 1)
Pure, immutable (`(model, …args) => Model`), each covered by unit tests. The web store, patch-apply and content authoring all use these, so every path shares one set of invariants.
`addVariable`, `updateVariable`, `removeVariable` (cascades links, flow endpoints, layout, KPI/ref-mode `varId → null`), `addLink`, `updateLink`, `removeLink`, `flipPolarity`, `toggleDelay`, `setKind` (clears/initialises `flow`, `graph`), `connectFlow(model, flowId, {from?, to?})` (maintains the implied flow→stock links), `setLayout(model, lens, positions)`, `canonicalName`, `findVariableByName`, `projectCld(model): CldProjection` (all variables + all links), `projectSfd(model): SfdProjection` (quantified variables; flows as pipes between stocks/clouds; links not implied by flows as info connectors; unquantified variables flagged).
`renameVariable` lives in `parser/` (needs equation rewriting; sd-engine).

## 5. Equation language (XMILE-compatible scalar subset)
- Literals `1`, `2.5`, `1e-3`; identifiers are variable names with spaces written as `_` (case-insensitive) or double-quoted (`"Work Remaining"`).
- Operators by precedence: `^` (right-assoc) · unary `+ - NOT` · `* / MOD` · `+ -` · `< <= > >=` · `= <>` · `AND` · `OR`; `IF c THEN a ELSE b`; parentheses. Booleans are numbers (0 = false).
- Builtins (case-insensitive): `STEP(height, start)`, `PULSE(volume, first[, interval])`, `RAMP(slope, start[, end])`, `SMTH1(input, averaging_time[, initial])` (alias `SMOOTH`), `SMTH3(…)` (alias `SMOOTH3`), `DELAY1(input, delay[, initial])`, `DELAY3(input, delay[, initial])`, `MIN(a, b)`, `MAX(a, b)`, `ABS`, `EXP`, `LN`, `LOG10`, `SQRT`, `SIN`, `COS`, `TAN`, `ARCTAN`, `INT`, `SAFEDIV(a, b[, x])`, `LOOKUP(gf, x)` / `gf(x)`, `INIT(x)`, `TIME`, `DT`, `STARTTIME`, `STOPTIME`, `PI`. Exact semantics follow XMILE 1.0 as recorded in RESEARCH.md §XMILE (PULSE takes a *volume*; SMTH/DELAY initial values). Stateful builtins are expanded at compile time into hidden internal stocks so Euler/RK4 integrate them like user stocks.
- Units: strings like `tasks/week`, `USD/(person*month)`, `1/month`, `dmnl`; custom base units from `model.units`; time units `second minute hour day week month quarter year` with fixed conversion factors (convention recorded in DECISIONS.md by sd-engine).
- **Never** `eval` / `new Function` on user text: parse → AST → compiled closures over a `Float64Array` state.

## 6. Module interfaces (packages/core)

### 6.1 Parser — `src/parser/` (sd-engine)
```ts
type Ast =
  | { k: 'num'; v: number }
  | { k: 'ref'; name: string /* canonical */ ; raw: string; span: Span }
  | { k: 'un'; op: '-' | '+' | 'not'; a: Ast }
  | { k: 'bin'; op: '+'|'-'|'*'|'/'|'^'|'mod'|'<'|'<='|'>'|'>='|'='|'<>'|'and'|'or'; a: Ast; b: Ast }
  | { k: 'if'; c: Ast; t: Ast; e: Ast }
  | { k: 'call'; fn: string /* upper-case */; args: Ast[]; span: Span };
type Span = { start: number; end: number };
parseEquation(src: string): { ok: true; ast: Ast } | { ok: false; error: { message: string; span: Span } };
referencedNames(ast: Ast): string[];            // canonical names, deduped
renameVariable(model: Model, id: Id, newName: string): Model; // rewrites every equation/assertion/override
BUILTINS: Record<string, { minArgs: number; maxArgs: number; stateful: boolean; doc: string; signature: string }>; // drives autocomplete
```

### 6.2 Units — `src/units/` (sd-engine)
```ts
type Dim = { scale: number; dims: Record<string, number> }; // e.g. tasks/week → { scale: 1/7, dims: { tasks: 1, day: -1 } }
parseUnit(s: string, defs: UnitDef[]): { ok: true; dim: Dim } | { ok: false; message: string };
inferUnits(model: Model): { byVar: Record<Id, Dim | null>; issues: HealthItem[] }; // equation-level unit checking
```

### 6.3 Simulation — `src/sim/` (sd-engine)
```ts
compileModel(model: Model, opts?: { scenario?: Scenario; overrides?: Record<Id, number> }):
  { ok: true; compiled: CompiledModel } | { ok: false; errors: HealthItem[] };
interface CompiledModel {
  varIds: Id[];                    // user variables in evaluation order (stocks first)
  index: Record<Id, number>;       // position in the state/value vector
  simulate(spec?: Partial<SimSpec>, opts?: { overrides?: Record<Id, number>; saveIds?: Id[]; signal?: { aborted: boolean } }): SimResult;
  /** Evaluate one non-stock variable's equation given a full value vector (for LTM link scores and polarity checks). */
  evalVar(id: Id, values: Float64Array, time: number): number;
  /** Direct dependencies from equations (incl. flow→stock), used by health and LTM. */
  deps: Record<Id, Id[]>;
}
interface SimResult {
  time: Float64Array;                       // saved times
  series: Record<Id, Float64Array>;         // one column per saved variable (transferable)
  spec: SimSpec;
  assertions: { assertionId: Id; time: number; message: string }[]; // first violation per assertion
  warnings: string[];
}
simulate(model: Model, spec?: Partial<SimSpec>): SimResult; // convenience: compile + run, throws on compile error
```
Performance budget: a 500-variable SFD, 10,000 Euler steps < 1 s in a Web Worker.

### 6.4 Model Health — `src/sim/health.ts` (sd-engine; polarity check imported from graph)
```ts
type HealthCheck = 'unquantified'|'parse'|'undefined'|'unused'|'link-equation-mismatch'|'units'
  |'algebraic-loop'|'integration-error'|'assertion'|'polarity'|'flow-link';
interface HealthItem { check: HealthCheck; severity: 'error'|'warning'|'info'; message: string; elementIds: Id[]; detail?: unknown }
runHealth(model: Model, opts?: { runIntegrationTest?: boolean }): { items: HealthItem[]; ok: boolean };
```
Integration-error test: simulate at DT and DT/2 (same method); flag stocks whose max |Δ| / max(|x|, ε) exceeds `settings.integrationErrorTolerance`.

### 6.5 Graph analysis — `src/graph/` (graph-analyst)
```ts
interface Loop { key: LoopKey; varIds: Id[]; linkIds: Id[]; type: 'R' | 'B' | 'U'; length: number; hasDelay: boolean }
findLoops(model: Model, opts?: { cap?: number; timeBudgetMs?: number }):
  { loops: Loop[]; truncated: boolean; cap: number; reason?: 'cap' | 'time' };   // Johnson's algorithm; self-loops included
loopType(model: Model, linkIds: Id[]): 'R' | 'B' | 'U';  // even # of '-' → R; any '?' → U
loopParticipation(loops: Loop[]): Record<Id, number>;
betweenness(model: Model): Record<Id, number>;            // Brandes, directed, normalised to [0,1]
boundaryChart(model: Model, loops: Loop[]): { endogenous: Id[]; exogenous: Id[]; excluded: BoundaryItem[] }; // endogenous iff on a loop or reachable from a loop variable
structuralLeverage(model: Model, loops: Loop[]): { varId: Id; score: number; components: Record<string, number>; cumulativeShare: number }[];
matchArchetypes(model: Model, loops: Loop[]): { archetypeId: ArchetypeId; loopKeys: LoopKey[]; roles: Record<string, Id>; score: number; explanation: string }[];
checkPolarity(model: Model, compiled?: CompiledModel, samples?: SimResult): HealthItem[]; // equation-implied sign vs drawn polarity
```
Polarity check method: numerically perturb the source value at N sampled states (baseline run, else initial values) and evaluate the target's equation with `compiled.evalVar`; consistent sign → implied polarity; mixed sign → "non-monotonic" info; flow→stock links use +/− from inflow/outflow. Budget: 150-variable graph < 2 s or stops at cap with `truncated: true`.

### 6.6 Analysis — `src/analysis/` (analysis, Phase 3)
```ts
makeRng(seed: number): () => number;                     // deterministic PRNG
latinHypercube(n: number, dims: number, rng): number[][]; // in [0,1)
oatSensitivity(model, params: ParamRange[], kpi: KpiSpec): { rows: TornadoRow[] };  // sorted by swing, with cumulativeShare
monteCarlo(model, params: ParamRange[], opts: { runs: number; seed: number; saveIds: Id[]; onProgress?(done: number): void; signal? }):
  { bands: Record<Id, { p5: Float64Array; p50: Float64Array; p95: Float64Array }>; importance: { varId: Id; rho: number }[] }; // Spearman rank correlation
calibrate(model, params: ParamRange[], targets: { refModeId: Id; varId: Id }[], opts?): { best: Record<Id, number>; stats: FitStats; iterations: number }; // Nelder–Mead
fitStats(simulated: number[], observed: number[]): { r2: number; mape: number; theil: { um: number; us: number; uc: number } };
loopsThatMatter(model, compiled: CompiledModel, result: SimResult, loops: Loop[]): { time: Float64Array; relScore: Record<LoopKey, Float64Array>; linkScore: Record<Id, Float64Array> };
rankLeverage(input: { structural; sensitivity?; ltm? }): { varId: Id; score: number; evidence: string[]; cumulativeShare: number }[];
```
**Loops That Matter (verified from primary sources, RESEARCH §LTM):** link score for `z = f(x, …)`: `LS = |Δₓz/Δz| · sign(Δₓz/Δx)` with `Δₓz = f(x_t, others_{t−1}) − z_{t−1}` (via `evalVar`), 0 if Δz = 0 or Δx = 0. Flow→stock links use the **2023 revision** (Schoenberg, Hayward & Eberlein, SDR 39(2), doi:10.1002/sdr.1728) in its net-flow form: `LS(i→S) = +|Δi/Δnet|`, `LS(o→S) = −|Δo/Δnet|`, `Δnet = ΣΔinflows − ΣΔoutflows` — the 2020 flow formula never shifts a births/deaths logistic model to its B loop, so the brief's logistic criterion requires the revision. Loop score = product of link scores (computed in log-magnitude + sign to avoid overflow); relative score = score / Σ|scores| over loops in the same cycle partition (= strongly connected component of the causal graph). Dominant: |rel| ≥ 0.5; otherwise the smallest descending-|rel| set reaching 0.5 (LoopLab rule, logged in DECISIONS). Computed on saved points, so it is independent of the integration method (default save step = DT). Test oracles: single-loop exponential → rel = +1 at every scored step; logistic (births = rP, deaths = rP²/K) → relR = K/(K + Pₖ + Pₖ₋₁), so dominance switches R→B at P ≈ K/2; Bass diffusion table from P1 Table 3 to 4 significant digits.
Chunked variants (`monteCarloChunk(samples, …)`) exist so the web worker pool can split runs.

### 6.7 XMILE — `src/xmile/` (interop, Phase 3)
`importXmile(xml: string): { ok: true; model: Model; warnings: string[] } | { ok: false; errors: string[] }` and `exportXmile(model: Model): string`. Documented subset in RESEARCH.md §XMILE; unsupported features (arrays, macros, modules, conveyors/queues/ovens) are rejected with a named error. LoopLab-only data (polarity, delay marks, confidence, notes, origin, frame, CLD layout) round-trips in a vendor-namespaced extension element.

### 6.8 Report — `src/report/` (interop, Phase 3)
`buildReport(input: ReportInput): { markdown: string; html: string }` in pyramid order: recommendation → key loops (with names, R/B, narratives) → leverage ranking (Pareto) → evidence (health, sensitivity, Monte Carlo, LTM) → simulation results (charts) → appendix (model listing, assumptions, sources). Charts are generated in core as SVG strings (`svg.ts`: line, band, tornado, Pareto) so reports never depend on the DOM. `toCsv(result: SimResult, names: Record<Id, string>): string`.

### 6.9 Copilot protocol — `src/protocol/` (copilot)
Request/response types shared by server and web, `applyPatch`, `previewPatch` (§7).

### 6.10 Content — `packages/content` (methodologist)
```ts
archetypes: Archetype[]; // { id: ArchetypeId; name; summary; structure; cld: Model; sfd: Model; signature: { kpi: string; shape: ShapeId; description }; interventions: { text; leverage: 1..12 }[]; illustrations: { generic: string; epc: string }; sources: Citation[] }
leveragePoints: LeveragePoint[]; // 12 entries, { level: 1..12; name; description; examples; source: Citation }
examples: ExampleModel[];        // ids: 'epc-rework', 'epc-handoff', 'qc-ncr-backlog', 'tank-draining'; { id; title; description; model: Model; analytic?: (t) => number }
Citation = { key: 'sterman-2000'|'meadows-2008'|'meadows-1999'|'senge-1990'|'kim-1992'|'lyneis-ford-2007'|string; locator?: string; verified: boolean }
```
Every bundled model parses under `ModelSchema` and simulates without health errors.

## 7. Copilot

### 7.1 Server `apps/server`
- `GET /api/health` → `{ ok: true, copilot: 'ready' | 'no-key', model: string | null }` (never the key).
- `POST /api/copilot` body `CopilotRequest` (Zod-validated, ≤ 2 MB) → `CopilotResponse`.
- Binds `127.0.0.1` (`PORT`, default 8787). CORS: only `APP_ORIGIN` (default `http://127.0.0.1:5173` and `http://localhost:5173` in dev; same-origin in `npm start`). `.env`: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `PORT`, `APP_ORIGIN`. The key is read once, never logged, never echoed; request logs omit headers and bodies.
- Anthropic client is injected (`createCopilotHandler({ client, model })`) so tests use a fake `messages.create`.

### 7.2 Tool loop
- Read-only tools (run `packages/core` on the client-sent model): `get_model_summary`, `list_loops`, `get_health`, `simulate_scenario` `{ overrides?, simSpec?, saveIds? }` (returns downsampled KPI series + final values), `run_sensitivity`, `get_leverage` (the last two return "not available yet" until Phase 3, so the tool list never changes). Max **8** read-only calls per request. Each call is recorded in `trace` (name, validated input, ok/error, short result summary, ms) and shown in the UI.
- **API usage (per RESEARCH §Anthropic, verified 2026-09-29):** `@anthropic-ai/sdk` non-streaming `messages.create`, `max_tokens: 16000`, `output_config: { effort: 'medium' }`, no `thinking`/`temperature` params. `tool_choice: { type: 'auto', disable_parallel_tool_use: true }` on every turn — forced `any`/`tool` returns 400 on the current models, so the answer is enforced by (1) the system prompt, (2) `strict: true` tool schemas (generated from Zod by a `toToolSchema()` that strips unsupported keywords and maps `oneOf`→`anyOf`), (3) budget enforcement: a read-only call after the 8th returns an `is_error` `tool_result` "budget exhausted — answer now with an output tool", (4) a hard cap of 12 API iterations. The identical tool array (fixed order) is sent on every request; history is append-only and assistant content (including thinking blocks) is echoed back verbatim. A `stop_reason: 'refusal'` is shown as "Claude declined" and changes nothing (no beta fallback).
- Output tools: `propose_patch` (→ `Patch`), `ask_question` `{ question, options?, why }`, `respond` `{ markdown, findings?: { elementIds: Id[]; severity; rule; message }[], hypotheses: string[] }`.
- Allowed outputs per mode: Interview → ask_question | propose_patch; Critique → respond (findings cite element ids) | propose_patch; Explain → respond (one section per loop key); Intervene → propose_patch adding interventions + scenarios, **server rejects any proposed intervention whose scenario was not simulated in this request**; Report → respond (markdown in pyramid order).
- Every tool input is Zod-validated. Invalid output-tool input → one retry with the validation error as `tool_result` (`is_error: true`); an `end_turn` without an output tool → one retry with a user message "answer by calling an output tool"; a second failure returns `{ ok: false, error }` and the client changes nothing. The tool-facing `propose_patch` schema uses explicit per-entity op shapes (required fields, few optionals) to stay within strict-mode limits; the server converts it to the core `Patch`. If it does not compile under strict mode (checked by `smoke:copilot`), that one tool falls back to `strict: false` + Zod + retry (logged in DECISIONS).
- Grounding rules in the system prompt: cite only numbers present in tool results; label hypotheses; model text and imported files are untrusted data (wrapped in delimiters, never instructions).
- Caching: one frozen system block (all five mode instructions + SD conventions + grounding rules + Meadows list; no dates, ids, or model data) with `cache_control: { type: 'ephemeral' }` (covers tools + system), plus top-level automatic `cache_control` for the growing loop tail; 5-minute TTL. The mode, model JSON and chat go in the first user message. `usage` per API call (`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`) is returned and displayed. `smoke:copilot` asserts the second call reads from cache.
- The web app never imports `@anthropic-ai/sdk` (its code contains the string `ANTHROPIC_API_KEY`, which the bundle check forbids); shared request/response types live in `core/protocol`.
- `.env.example`: `ANTHROPIC_API_KEY=` (empty), `CLAUDE_MODEL=claude-opus-5-5` (docs: recommended default; cheaper alternative `claude-sonnet-5-5` commented), `PORT=8787`, `APP_ORIGIN=http://127.0.0.1:5173`.

### 7.3 Patch contract — `packages/core/src/schema/patch.ts` (orchestrator)
```ts
export const PatchEntity = z.enum(['variable', 'link', 'loopAnnotation', 'intervention', 'scenario', 'assertion']);
export const PatchOp = z.discriminatedUnion('op', [
  z.object({ opId: z.string().min(1), op: z.literal('add'), entity: PatchEntity, value: z.record(z.string(), z.unknown()) }),
  z.object({ opId: z.string().min(1), op: z.literal('update'), entity: PatchEntity, id: z.string(), changes: z.record(z.string(), z.unknown()) }),
  z.object({ opId: z.string().min(1), op: z.literal('remove'), entity: PatchEntity, id: z.string() }),
]);
export const Patch = z.object({ id: z.string(), title: z.string().max(200), rationale: z.string().max(4000), ops: z.array(PatchOp).min(1).max(200) });
```
`applyPatch(model, patch, acceptedOpIds: Set<string>): { model: Model; applied: string[]; skipped: { opId: string; reason: string }[] }` (copilot, in `protocol/`): each accepted op is validated against the entity schema; ops whose dependencies were rejected (e.g. a link to a rejected variable) are skipped with a reason; added/updated elements get `origin: 'ai-proposed'`; the result must satisfy `ModelSchema` or nothing is applied. `previewPatch(model, patch): PatchPreview` gives the canvas ghost elements/changed/removed ids. Marking confirmed sets `origin: 'ai-confirmed'`.

## 8. Web app `apps/web`
- **Layout at 1280×800:** top bar (44 px: model name, save status, undo/redo, theme, file menu) · left workflow rail (64 px, six stages) · main canvas/work area · right dock (340 px, tabs *Inspector* | *Copilot*, collapsible). No modal dialogs for common actions: inline rename, inspector editing, non-blocking toasts.
- **Stages** show only their own tools: Frame (problem, horizon ⇄ simSpec, KPIs, reference-mode sketch pad + CSV import, boundary chart); Map (CLD editor); Analyze (loop list R/B with highlight, participation/betweenness table, archetype candidates to confirm, structural leverage Pareto); Quantify (SFD editor, equation editor with autocomplete + units, lookup editor, Model Health panel); Test (run/compare, scenarios, tornado + Pareto, Monte Carlo bands + importance, LTM dominance chart, calibration); Decide (interventions with Meadows level, scenario-backed KPI comparison, report preview + export).
- **Map shortcuts:** `A` add variable · `L` link mode · `P` flip polarity · `D` toggle delay · `Del/Backspace` delete · `⌘/Ctrl+Z` undo · `⇧⌘Z`/`Ctrl+Y` redo · `Shift+L` auto-layout · `F` fit view · `?` shortcut sheet (non-modal).
- **State:** Zustand `useModelStore` (`model`, `commit(label, recipe: (m) => Model)`, `undo`, `redo`, `load`, history capped at 200 snapshots) in `src/state/`; `useCopilotStore` (`pendingPatch`, `decisions`, `decideOp`, `acceptAll`, `rejectAll`) in `src/copilot/`. The canvas renders `previewPatch` ghosts from `useCopilotStore`.
- **Persistence:** IndexedDB autosave (debounced 500 ms, via `idb`), JSON file open/save (`migrateModel` on open), XMILE import/export, PNG/SVG diagram export (`html-to-image` on the React Flow viewport), CSV results export.
- **Workers:** `src/workers/sim.worker.ts` + `simClient.ts` (canvas-ui, Phase 2); `src/workers/analysis.worker.ts`, `pool.ts`, `protocol.ts` (analysis, Phase 3; pool size `max(1, hardwareConcurrency − 1)`, progress events, cancel = terminate).
- **Themes:** CSS custom properties, light/dark, follows `prefers-color-scheme` with a manual toggle.
- **Test ids (contract for e2e):** `stage-{frame|map|analyze|quantify|test|decide}`, `canvas-cld`, `canvas-sfd`, `node-{varId}`, `edge-{linkId}`, `btn-add-variable`, `loop-list`, `loop-item-{index}`, `loop-type-{index}` (text `R`/`B`/`U`), `loop-cap-warning`, `health-panel`, `btn-simulate`, `chart-timeseries`, `chart-tornado`, `chart-pareto`, `chart-mc-bands`, `btn-mc-run`, `btn-mc-cancel`, `mc-progress`, `leverage-pareto`, `btn-export-report`, `report-preview`, `examples-menu`, `example-{id}`, `save-status`, `copilot-panel`, `copilot-error`, `patch-op-{opId}`, `patch-accept-{opId}`, `patch-reject-{opId}`.

## 9. File ownership

| Owner | Paths (write access) |
|---|---|
| orchestrator | root configs (`package.json` ×all, `package-lock.json`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc`, `vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `.env.example`), `packages/core/src/{schema,model}/**`, `packages/core/src/index.ts`, `scripts/**`, `README.md`, `CLAUDE.md`, `docs/{SPEC,RESEARCH,DECISIONS,PROGRESS,BLOCKERS,ARCHITECTURE}.md`, `.claude/**` |
| sd-engine | `packages/core/src/{parser,units,sim}/**`, `packages/core/test/fixtures/sim/**` |
| graph-analyst | `packages/core/src/graph/**`, `packages/core/test/fixtures/graph/**` |
| canvas-ui | `apps/web/**` except `apps/web/src/copilot/**` and the Phase-3 analysis worker files |
| copilot | `apps/server/**`, `apps/web/src/copilot/**`, `packages/core/src/protocol/**` |
| methodologist | `packages/content/**`, `docs/USER_GUIDE.md` |
| analysis (P3) | `packages/core/src/analysis/**`, `apps/web/src/workers/{analysis.worker,pool,protocol}.ts` |
| interop (P3) | `packages/core/src/{xmile,report}/**`, `packages/core/test/fixtures/sdxorg/**`, `tests/interop/**` |
| qa (P4) | `e2e/**`, `tests/{perf,security,numeric,docs}/**` — never edits product code |

Every agent also owns `docs/decisions/<agent>.md` (its design decisions and tolerance justifications); `docs/DECISIONS.md` (orchestrator) indexes them. Tests are co-located (`*.test.ts[x]` next to the source) and owned by the source's owner; canvas-ui's own Playwright checks live in `apps/web/e2e/`, qa's in root `e2e/`. Each agent reports changes it needs outside its paths; the orchestrator makes them.

## 10. Dependencies
_Filled from research (exact versions); see §10 after research completes._

## 11. Test plan — acceptance criteria → tests

| # | Acceptance criterion | Test(s) | Owner | Command |
|---|---|---|---|---|
| 1 | install/build/typecheck/lint/test pass; no unlogged skips | `scripts/check-skips.mjs` (fails on `.skip`/`.todo`/`xit` without a `SKIP-REASON:` comment referencing DECISIONS.md) runs inside `npm test` | orchestrator | `npm install && npm run build && npm run typecheck && npm run lint && npm test` |
| 2 | dev serves app, zero console errors | `e2e/smoke.spec.ts` visits all six stages, fails on any `console.error`/`pageerror` | qa (+canvas-ui) | `npm run e2e` |
| 3 | RK4 vs analytic ≤1e-6 rel; convergence order Euler 1±0.3, RK4 4±0.3 over DT ∈ {1, ½, ¼} | `sim/analytic.test.ts` (exponential growth, goal seeking, logistic; parameters chosen so RK4 errors stay far above float noise); qa re-check `tests/numeric/convergence.test.ts` | sd-engine, qa | `npm test` |
| 4 | SDXorg supported subset within justified tolerance | `xmile/sdxorg.test.ts` over vendored fixtures; skip list with reasons in RESEARCH/DECISIONS | interop | `npm test` |
| 5 | loops exact incl. self-loops; flip-polarity property; 150-var < 2 s or cap + warning | `graph/loops.test.ts` (hand-verified fixtures), `graph/loops.property.test.ts` (fast-check), `graph/loops.perf.test.ts`; UI warning in `e2e/analyze.spec.ts` | graph-analyst, qa | `npm test`, `npm run e2e` |
| 6 | polarity consistency flags wrong polarity | `graph/polarity.test.ts` with fixture model containing a deliberately wrong sign | graph-analyst | `npm test` |
| 7 | LTM: single-loop exponential = 100 % every step; logistic R→B shift | `analysis/ltm.test.ts` | analysis | `npm test` |
| 8 | 8 archetype SFDs pass behaviour-shape tests | `content/src/archetypes.test.ts` + `shapes.ts` classifiers | methodologist | `npm test` |
| 9 | copilot mocked: 5 modes schema-valid; malformed → no change + error; no apply without accept; smoke with key / clean skip | `server/src/copilot.test.ts` (fake client, all modes, retry-once), `web/src/copilot/*.test.tsx`; `npm run smoke:copilot` | copilot | `npm test`, `npm run smoke:copilot` |
| 10 | server on 127.0.0.1; bundle has no key/`ANTHROPIC_API_KEY`; `.env` ignored; `.env.example` exists | `server/src/bind.test.ts`; `tests/security/bundle.test.ts` (scans `apps/web/dist`), `tests/security/repo.test.ts` (`git check-ignore .env`) | copilot, qa | `npm run build && npm test` |
| 11 | every bundled model round-trips JSON and XMILE with identical results | `tests/interop/bundled-roundtrip.test.ts` | interop | `npm test` |
| 12 | Playwright: 6-var CLD → R/B; rework example → simulate → tornado + Pareto; save → reload → identical; report with loops, leverage, charts | `e2e/cld.spec.ts`, `e2e/rework.spec.ts`, `e2e/persistence.spec.ts`, `e2e/report.spec.ts` | qa | `npm run e2e` |
| 13 | 500-var SFD 10k Euler steps < 1 s in a worker; 1,000-run MC with progress/cancel, UI responsive; numbers in PROGRESS.md | `tests/perf/engine.perf.test.ts` (Node worker_threads), `e2e/perf.spec.ts` (browser worker timing, rAF gap < 100 ms during MC, cancel) | qa | `npm test`, `npm run e2e` |
| 14 | README ≤5 commands; USER_GUIDE covers every stage | `tests/docs/docs.test.ts` | qa | `npm test` |

## 12. Process
- **Phases** as in BRIEF. Parallel agents run in separate git worktrees (Agent `isolation: "worktree"`), each running `npm ci` there; max 5 concurrent. The orchestrator merges a branch only after its tests pass, then runs the full suite on the integration branch.
- **Agent report** (≤200 words): files changed, tests run with pass/fail counts, open issues, changes needed outside owned paths.
- **Stubs:** code against the interfaces above; stub not-yet-merged modules behind the same signatures (e.g. graph-analyst's polarity check may take a `evalVar` function parameter until sim merges).
- **Checkpoints:** commit locally after each phase; append `✅ [phase] — … | … | commit [hash]` to PROGRESS.md.
