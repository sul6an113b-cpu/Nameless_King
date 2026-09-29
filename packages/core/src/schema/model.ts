/**
 * LoopLab model schema — THE contract every module codes against (SPEC §3).
 * Owned by the orchestrator. Changes that break saved files need a migration (migrate.ts) and user approval.
 */
import { z } from 'zod';
import { canonicalName } from './names.ts';

// Zod 4 compiles fast-path validators with `new Function` by default; LoopLab never runs generated code.
z.config({ jitless: true });

export const SCHEMA_VERSION = 1 as const;

/** Stable element id. Convention: v_ variable, l_ link, k_ KPI, r_ reference mode, b_ boundary item,
 *  a_ assertion, s_ scenario, i_ intervention, f_ archetype finding, m_ model. */
export const Id = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
export type Id = z.infer<typeof Id>;

export const Origin = z.enum(['user', 'ai-proposed', 'ai-confirmed']);
export type Origin = z.infer<typeof Origin>;

/** '?' = unknown (imports, AI uncertainty); loops through it are type 'U'. */
export const Polarity = z.enum(['+', '-', '?']);
export type Polarity = z.infer<typeof Polarity>;

export const Confidence = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof Confidence>;

/** 'variable' = qualitative CLD variable not yet quantified. 'constant' exports to XMILE as <aux> with a numeric eqn. */
export const VarKind = z.enum(['variable', 'stock', 'flow', 'aux', 'constant', 'lookup']);
export type VarKind = z.infer<typeof VarKind>;

export const XY = z.object({ x: z.number(), y: z.number() });
export type XY = z.infer<typeof XY>;

export const GraphicalFunction = z.object({
  xs: z.array(z.number()).min(2),
  ys: z.array(z.number()).min(2),
  /** XMILE gf types: continuous (clamp at ends), extrapolate, discrete (step) */
  mode: z.enum(['continuous', 'extrapolate', 'discrete']).default('continuous'),
});
export type GraphicalFunction = z.infer<typeof GraphicalFunction>;

export const Uncertainty = z.object({
  min: z.number(),
  max: z.number(),
  distribution: z.enum(['uniform', 'triangular']).default('uniform'),
  mode: z.number().optional(), // triangular only
});
export type Uncertainty = z.infer<typeof Uncertainty>;

export const FlowEnds = z.object({ from: Id.nullable(), to: Id.nullable() });
export type FlowEnds = z.infer<typeof FlowEnds>;

export const Variable = z.object({
  id: Id,
  name: z.string().trim().min(1).max(80),
  kind: VarKind.default('variable'),
  /** stock: initial-value expression; flow/aux: expression; constant: numeric literal; lookup: '' */
  equation: z.string().max(4000).default(''),
  units: z.string().max(120).default(''),
  doc: z.string().max(4000).default(''),
  /** flows only: source/target stock ids (null = cloud) */
  flow: FlowEnds.optional(),
  /** stocks and flows (XMILE non_negative) */
  nonNegative: z.boolean().default(false),
  /** aux/flow: applied to the equation result (XMILE embedded gf); lookup: the table, called as LOOKUP(name, x) or name(x) */
  graph: GraphicalFunction.optional(),
  /** constants: default range for sensitivity / Monte Carlo */
  uncertainty: Uncertainty.optional(),
  origin: Origin.default('user'),
});
export type Variable = z.infer<typeof Variable>;
export type VariableInput = z.input<typeof Variable>;

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
export type Link = z.infer<typeof Link>;
export type LinkInput = z.input<typeof Link>;

export const SimSpec = z.object({
  start: z.number().default(0),
  stop: z.number().default(24),
  dt: z.number().positive().default(0.25),
  method: z.enum(['euler', 'rk4']).default('euler'),
  timeUnit: z.string().min(1).default('month'),
  saveEvery: z.number().positive().optional(), // default = dt
});
export type SimSpec = z.infer<typeof SimSpec>;

export const Kpi = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  varId: Id.nullable().default(null),
  goal: z.enum(['minimize', 'maximize', 'target']).default('minimize'),
  target: z.number().optional(),
});
export type Kpi = z.infer<typeof Kpi>;

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
export type ReferenceMode = z.infer<typeof ReferenceMode>;

export const BoundaryItem = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  reason: z.string().max(1000).default(''),
});
export type BoundaryItem = z.infer<typeof BoundaryItem>;

export const Frame = z.object({
  problem: z.string().max(8000).default(''),
  purpose: z.string().max(4000).default(''),
  kpis: z.array(Kpi).default([]),
  referenceModes: z.array(ReferenceMode).default([]),
  /** Boundary chart: endogenous/exogenous are derived from the graph; excluded items are listed by the user. */
  excluded: z.array(BoundaryItem).default([]),
});
export type Frame = z.infer<typeof Frame>;

export const UnitDef = z.object({
  name: z.string().min(1).max(40), // e.g. 'tasks', 'people', 'USD'
  aliases: z.array(z.string().min(1).max(40)).default([]),
  definition: z.string().max(120).default(''), // '' = new base dimension; else e.g. '1000 USD'
});
export type UnitDef = z.infer<typeof UnitDef>;

export const Assertion = z.object({
  id: Id,
  expr: z.string().min(1).max(500), // e.g. 'Backlog >= 0'; evaluated every saved step
  note: z.string().max(1000).default(''),
  enabled: z.boolean().default(true),
  origin: Origin.default('user'),
});
export type Assertion = z.infer<typeof Assertion>;

export const Scenario = z.object({
  id: Id,
  name: z.string().min(1).max(80),
  note: z.string().max(2000).default(''),
  overrides: z.array(z.object({ varId: Id, equation: z.string().max(4000) })).default([]),
  simSpec: SimSpec.partial().optional(),
  origin: Origin.default('user'),
});
export type Scenario = z.infer<typeof Scenario>;

export const Intervention = z.object({
  id: Id,
  name: z.string().min(1).max(120),
  description: z.string().max(4000).default(''),
  /** Meadows level; 12 = weakest (parameters) … 1 = strongest */
  leverage: z.number().int().min(1).max(12),
  scenarioId: Id.nullable().default(null),
  status: z.enum(['idea', 'tested', 'recommended', 'rejected']).default('idea'),
  rationale: z.string().max(4000).default(''),
  origin: Origin.default('user'),
});
export type Intervention = z.infer<typeof Intervention>;

export const ArchetypeId = z.enum([
  'fixes-that-fail',
  'shifting-the-burden',
  'limits-to-growth',
  'eroding-goals',
  'escalation',
  'success-to-the-successful',
  'tragedy-of-the-commons',
  'growth-and-underinvestment',
]);
export type ArchetypeId = z.infer<typeof ArchetypeId>;

/** Loop key = variable ids of the cycle, rotated so the lexicographically smallest id is first, joined by '>'. */
export const LoopKey = z.string().min(1).max(4000);
export type LoopKey = z.infer<typeof LoopKey>;

export const LoopAnnotation = z.object({
  key: LoopKey,
  name: z.string().max(120).default(''),
  note: z.string().max(4000).default(''), // e.g. copilot Explain narrative
  origin: Origin.default('user'),
});
export type LoopAnnotation = z.infer<typeof LoopAnnotation>;

export const ArchetypeFinding = z.object({
  id: Id,
  archetypeId: ArchetypeId,
  loopKeys: z.array(LoopKey).min(1),
  roles: z.record(z.string(), Id).default({}), // archetype role name → variable id
  status: z.enum(['candidate', 'confirmed', 'rejected']).default('candidate'),
  note: z.string().max(2000).default(''),
});
export type ArchetypeFinding = z.infer<typeof ArchetypeFinding>;

export const Settings = z.object({
  loopCap: z.number().int().positive().default(1000),
  /** DT vs DT/2 relative stock difference that triggers a Model Health warning */
  integrationErrorTolerance: z.number().positive().default(0.01),
  /** Monte Carlo / LHS reproducibility */
  seed: z.number().int().default(1),
});
export type Settings = z.infer<typeof Settings>;

export const Decision = z.object({
  recommendation: z.string().max(8000).default(''),
  summary: z.string().max(8000).default(''),
});
export type Decision = z.infer<typeof Decision>;

export const Layout = z.object({
  cld: z.record(z.string(), XY).default({}),
  sfd: z.record(z.string(), XY).default({}),
});
export type Layout = z.infer<typeof Layout>;

export const ModelObject = z.object({
  format: z.literal('looplab-model'),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: Id,
  name: z.string().min(1).max(120),
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(),
  // Zod 4: .prefault parses the default through the schema, so inner defaults apply.
  frame: Frame.prefault({}),
  variables: z.array(Variable).default([]),
  links: z.array(Link).default([]),
  simSpec: SimSpec.prefault({}),
  units: z.array(UnitDef).default([]),
  assertions: z.array(Assertion).default([]),
  scenarios: z.array(Scenario).default([]),
  interventions: z.array(Intervention).default([]),
  loopAnnotations: z.array(LoopAnnotation).default([]),
  archetypeFindings: z.array(ArchetypeFinding).default([]),
  layout: Layout.prefault({}),
  settings: Settings.prefault({}),
  decision: Decision.prefault({}),
});

type ModelShape = z.infer<typeof ModelObject>;

/** Returns the hard-integrity problems (I1–I8, SPEC §3) of a structurally valid model. Empty = OK. */
export function integrityIssues(m: ModelShape): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  // I1 unique ids per collection
  const uniq = (items: { id: string }[], coll: string) => {
    const seen = new Set<string>();
    items.forEach((it, i) => {
      if (seen.has(it.id)) add([coll, i, 'id'], `I1: duplicate id "${it.id}" in ${coll}`);
      seen.add(it.id);
    });
  };
  uniq(m.variables, 'variables');
  uniq(m.links, 'links');
  uniq(m.frame.kpis, 'frame.kpis');
  uniq(m.frame.referenceModes, 'frame.referenceModes');
  uniq(m.frame.excluded, 'frame.excluded');
  uniq(m.assertions, 'assertions');
  uniq(m.scenarios, 'scenarios');
  uniq(m.interventions, 'interventions');
  uniq(m.archetypeFindings, 'archetypeFindings');

  // I2 canonical names unique
  const byCanon = new Map<string, string>();
  m.variables.forEach((v, i) => {
    const key = canonicalName(v.name);
    const other = byCanon.get(key);
    if (other !== undefined) add(['variables', i, 'name'], `I2: name "${v.name}" duplicates "${other}"`);
    else byCanon.set(key, v.name);
  });

  const vars = new Map(m.variables.map((v) => [v.id, v]));

  // I3 link endpoints exist; one link per ordered pair
  const pairs = new Set<string>();
  m.links.forEach((l, i) => {
    if (!vars.has(l.from)) add(['links', i, 'from'], `I3: link "${l.id}" source "${l.from}" does not exist`);
    if (!vars.has(l.to)) add(['links', i, 'to'], `I3: link "${l.id}" target "${l.to}" does not exist`);
    const pair = `${l.from}\u0000${l.to}`;
    if (pairs.has(pair)) add(['links', i], `I3: more than one link from "${l.from}" to "${l.to}"`);
    pairs.add(pair);
  });

  m.variables.forEach((v, i) => {
    // I4 flow ends
    if (v.kind === 'flow') {
      if (!v.flow) add(['variables', i, 'flow'], `I4: flow "${v.name}" needs flow.from/to`);
      else {
        for (const end of ['from', 'to'] as const) {
          const s = v.flow[end];
          if (s !== null && vars.get(s)?.kind !== 'stock')
            add(['variables', i, 'flow', end], `I4: flow "${v.name}" ${end} "${s}" is not a stock`);
        }
        if (v.flow.from !== null && v.flow.from === v.flow.to)
          add(['variables', i, 'flow'], `I4: flow "${v.name}" drains and fills the same stock`);
      }
    } else if (v.flow) {
      add(['variables', i, 'flow'], `I4: only flows may have flow.from/to ("${v.name}" is ${v.kind})`);
    }
    // I5 graphical functions
    if (v.kind === 'lookup' && !v.graph) add(['variables', i, 'graph'], `I5: lookup "${v.name}" needs a graph`);
    if (v.graph) {
      if (!['aux', 'flow', 'lookup'].includes(v.kind))
        add(['variables', i, 'graph'], `I5: only aux/flow/lookup may have a graph ("${v.name}" is ${v.kind})`);
      const { xs, ys } = v.graph;
      if (xs.length !== ys.length) add(['variables', i, 'graph'], `I5: graph of "${v.name}" has |xs| ≠ |ys|`);
      for (let k = 1; k < xs.length; k++)
        if (!(xs[k] > xs[k - 1])) {
          add(['variables', i, 'graph', 'xs'], `I5: graph xs of "${v.name}" must be strictly increasing`);
          break;
        }
    }
    // I8 uncertainty
    const u = v.uncertainty;
    if (u) {
      if (u.min > u.max) add(['variables', i, 'uncertainty'], `I8: uncertainty of "${v.name}" has min > max`);
      if (u.mode !== undefined && (u.mode < u.min || u.mode > u.max))
        add(['variables', i, 'uncertainty', 'mode'], `I8: uncertainty mode of "${v.name}" outside [min, max]`);
    }
  });

  // I6 references
  const scenarioIds = new Set(m.scenarios.map((s) => s.id));
  m.scenarios.forEach((s, i) =>
    s.overrides.forEach((o, j) => {
      if (!vars.has(o.varId)) add(['scenarios', i, 'overrides', j, 'varId'], `I6: unknown variable "${o.varId}"`);
    }),
  );
  m.frame.kpis.forEach((k, i) => {
    if (k.varId !== null && !vars.has(k.varId)) add(['frame', 'kpis', i, 'varId'], `I6: unknown variable "${k.varId}"`);
  });
  m.frame.referenceModes.forEach((r, i) => {
    if (r.varId !== null && !vars.has(r.varId))
      add(['frame', 'referenceModes', i, 'varId'], `I6: unknown variable "${r.varId}"`);
  });
  m.interventions.forEach((iv, i) => {
    if (iv.scenarioId !== null && !scenarioIds.has(iv.scenarioId))
      add(['interventions', i, 'scenarioId'], `I6: unknown scenario "${iv.scenarioId}"`);
  });

  // I7 time axis
  const { start, stop, dt } = m.simSpec;
  if (!(stop > start)) add(['simSpec', 'stop'], 'I7: simSpec.stop must be greater than start');
  else if ((stop - start) / dt > 1_000_000) add(['simSpec', 'dt'], 'I7: more than 1,000,000 steps');

  return issues;
}

/** Hard structural integrity. Soft issues (flow-link sync, polarity, units, …) are Model Health items, not parse errors. */
export const ModelSchema = ModelObject.superRefine((m, ctx) => {
  for (const issue of integrityIssues(m)) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
});
export type Model = z.infer<typeof ModelSchema>;
export type ModelInput = z.input<typeof ModelSchema>;
