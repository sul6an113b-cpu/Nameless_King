/**
 * Pure, immutable edits for model parts that SPEC §4 core ops do not cover (frame, horizon, model name).
 * Every edit validates the touched entity with its schema and re-checks hard integrity (I1–I8), throwing a
 * ModelOpError like the core ops, so `commit` leaves the model unchanged on bad input.
 */
import {
  BoundaryItem,
  Decision,
  Intervention,
  Kpi,
  ModelOpError,
  ReferenceMode,
  SimSpec,
  integrityIssues,
  type Frame,
  type Id,
  type Model,
} from '@looplab/core';

/** Structural view of a Zod schema (the web app does not depend on zod directly). */
interface Schema<T> {
  safeParse(
    v: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] } };
}
type KpiT = Model['frame']['kpis'][number];
type RefModeT = Model['frame']['referenceModes'][number];
type ExcludedT = Model['frame']['excluded'][number];
type SimSpecT = Model['simSpec'];
type InterventionT = Model['interventions'][number];
type DecisionT = Model['decision'];

/** Time units with fixed conversion factors in the engine (SPEC §5). */
export const TIME_UNITS: readonly string[] = ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];

function checked(next: Model): Model {
  const issue = integrityIssues(next)[0];
  if (issue) throw new ModelOpError('invalid', issue.message.replace(/^I\d: /, ''));
  return next;
}

function parse<T>(schema: Schema<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  const where = first ? first.path.map(String).join('.') : '';
  throw new ModelOpError(
    'invalid',
    `Invalid ${what}${where ? ` (${where})` : ''}: ${first?.message ?? 'unknown error'}`,
  );
}

const withFrame = (m: Model, frame: Partial<Frame>): Model => checked({ ...m, frame: { ...m.frame, ...frame } });

export function setModelName(m: Model, name: string): Model {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 120)
    throw new ModelOpError('invalid', 'Model name must be 1–120 characters');
  return trimmed === m.name ? m : { ...m, name: trimmed };
}

export function setFrameText(m: Model, field: 'problem' | 'purpose', text: string): Model {
  if (m.frame[field] === text) return m;
  const max = field === 'problem' ? 8000 : 4000;
  if (text.length > max) throw new ModelOpError('invalid', `The ${field} is limited to ${max} characters`);
  return { ...m, frame: { ...m.frame, [field]: text } };
}

/** Horizon and integration settings; stop must exceed start (I7). */
export function setSimSpec(m: Model, changes: Partial<SimSpecT>): Model {
  const next = parse(SimSpec, { ...m.simSpec, ...changes }, 'simulation settings');
  if (!(next.stop > next.start)) throw new ModelOpError('invalid', 'The stop time must be after the start time');
  return checked({ ...m, simSpec: next });
}

// ── KPIs ───────────────────────────────────────────────────────────────────

export function addKpi(m: Model, input: Pick<KpiT, 'id' | 'name'> & Partial<KpiT>): Model {
  return withFrame(m, { kpis: [...m.frame.kpis, parse(Kpi, input, 'KPI')] });
}

export function updateKpi(m: Model, id: Id, changes: Partial<KpiT>): Model {
  const kpis = m.frame.kpis.map((k) => (k.id === id ? parse(Kpi, { ...k, ...changes, id }, 'KPI') : k));
  return withFrame(m, { kpis });
}

export const removeKpi = (m: Model, id: Id): Model => withFrame(m, { kpis: m.frame.kpis.filter((k) => k.id !== id) });

// ── reference modes ────────────────────────────────────────────────────────

export function addReferenceMode(
  m: Model,
  input: Pick<RefModeT, 'id' | 'name' | 'source' | 'points'> & Partial<RefModeT>,
): Model {
  return withFrame(m, { referenceModes: [...m.frame.referenceModes, parse(ReferenceMode, input, 'reference mode')] });
}

export function updateReferenceMode(m: Model, id: Id, changes: Partial<RefModeT>): Model {
  const referenceModes = m.frame.referenceModes.map((r) =>
    r.id === id ? parse(ReferenceMode, { ...r, ...changes, id }, 'reference mode') : r,
  );
  return withFrame(m, { referenceModes });
}

export const removeReferenceMode = (m: Model, id: Id): Model =>
  withFrame(m, { referenceModes: m.frame.referenceModes.filter((r) => r.id !== id) });

// ── boundary: excluded items ───────────────────────────────────────────────

export function addExcluded(m: Model, input: Pick<ExcludedT, 'id' | 'name'> & Partial<ExcludedT>): Model {
  return withFrame(m, { excluded: [...m.frame.excluded, parse(BoundaryItem, input, 'excluded item')] });
}

export function updateExcluded(m: Model, id: Id, changes: Partial<ExcludedT>): Model {
  const excluded = m.frame.excluded.map((b) =>
    b.id === id ? parse(BoundaryItem, { ...b, ...changes, id }, 'excluded item') : b,
  );
  return withFrame(m, { excluded });
}

export const removeExcluded = (m: Model, id: Id): Model =>
  withFrame(m, { excluded: m.frame.excluded.filter((b) => b.id !== id) });

// ── decision and interventions (Decide stage) ─────────────────────────────

export function setDecision(m: Model, changes: Partial<DecisionT>): Model {
  const next = parse(Decision, { ...m.decision, ...changes }, 'decision');
  return next.recommendation === m.decision.recommendation && next.summary === m.decision.summary
    ? m
    : { ...m, decision: next };
}

export function addIntervention(m: Model, input: Pick<InterventionT, 'id' | 'name' | 'leverage'> & Partial<InterventionT>): Model {
  return checked({ ...m, interventions: [...m.interventions, parse(Intervention, input, 'intervention')] });
}

/** Edits one intervention; `scenarioId` must name an existing scenario (I6). */
export function updateIntervention(m: Model, id: Id, changes: Partial<InterventionT>): Model {
  if (!m.interventions.some((i) => i.id === id)) throw new ModelOpError('not-found', `No intervention "${id}"`);
  const interventions = m.interventions.map((i) => (i.id === id ? parse(Intervention, { ...i, ...changes, id }, 'intervention') : i));
  return checked({ ...m, interventions });
}

export const removeIntervention = (m: Model, id: Id): Model =>
  checked({ ...m, interventions: m.interventions.filter((i) => i.id !== id) });
