/**
 * Patch application (SPEC §7.3) — owner: copilot. The copilot never mutates a model; the engineer accepts ops one
 * by one and only those are applied here, through the same immutable model ops as the editor.
 */
import type { z } from 'zod';
import {
  Assertion,
  FlowEnds,
  Intervention,
  LoopAnnotation,
  ModelSchema,
  Scenario,
  VarKind,
  integrityIssues,
  type Id,
  type LinkInput,
  type Model,
  type Origin,
  type VariableInput,
} from '../schema/model.ts';
import type { Patch, PatchEntity, PatchOp } from '../schema/patch.ts';
import {
  addLink,
  addVariable,
  connectFlow,
  removeLink,
  removeVariable,
  setKind,
  setVariableName,
  updateLink,
  updateVariable,
} from '../model/ops.ts';

export interface ApplyPatchResult {
  model: Model;
  applied: string[];
  skipped: { opId: string; reason: string }[];
}

export interface PatchPreview {
  added: { variables: Id[]; links: Id[] };
  changed: Id[];
  removed: Id[];
  /** the model as it would look if every op were accepted (for ghost rendering) */
  preview: Model;
  /** element each op targets (loop key for loop annotations), so canvas ghosts can offer per-op accept/reject */
  targets: Record<string, { entity: PatchEntity; id: string }>;
  /** ops that would fail even if accepted, with the reason */
  skipped: { opId: string; reason: string }[];
}

const AI: Origin = 'ai-proposed';

class PatchOpError extends Error {}
const fail = (message: string): never => {
  throw new PatchOpError(message);
};

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const key = (entity: PatchEntity, id: string) => `${entity}:${id}`;

function parseEntity<S extends z.ZodType>(schema: S, value: unknown, what: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  return fail(`invalid ${what}: ${first ? `${first.path.join('.') || '(value)'} ${first.message}` : 'unknown error'}`);
}

function checkFields(changes: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const k of Object.keys(changes)) if (!allowed.includes(k)) fail(`cannot change "${k}" of a ${what}`);
}

/** The element an op creates or touches. */
export function opTarget(op: PatchOp): { entity: PatchEntity; id: string } {
  if (op.op !== 'add') return { entity: op.entity, id: op.id };
  const id = op.entity === 'loopAnnotation' ? str(op.value.key) : str(op.value.id);
  return { entity: op.entity, id: id ?? '' };
}

/** Elements an op needs (its own target for update/remove, link endpoints, scenario/variable references). */
function opDeps(op: PatchOp): string[] {
  const deps: string[] = [];
  const v = op.op === 'add' ? op.value : op.op === 'update' ? op.changes : {};
  if (op.op !== 'add') deps.push(key(op.entity, op.id));
  if (op.entity === 'link' && op.op === 'add') {
    for (const end of [v.from, v.to]) if (typeof end === 'string') deps.push(key('variable', end));
  }
  if (op.entity === 'variable' && op.op === 'add' && v.flow && typeof v.flow === 'object') {
    for (const end of Object.values(v.flow as Record<string, unknown>))
      if (typeof end === 'string') deps.push(key('variable', end));
  }
  if (op.entity === 'loopAnnotation' && op.op === 'add' && typeof v.key === 'string') {
    for (const id of v.key.split('>')) deps.push(key('variable', id));
  }
  if (op.entity === 'intervention' && typeof v.scenarioId === 'string') deps.push(key('scenario', v.scenarioId));
  if (op.entity === 'scenario' && Array.isArray(v.overrides)) {
    for (const o of v.overrides as unknown[])
      if (o && typeof o === 'object' && typeof (o as { varId?: unknown }).varId === 'string')
        deps.push(key('variable', (o as { varId: string }).varId));
  }
  return deps;
}

// ── per-entity application ─────────────────────────────────────────────────

function applyVariable(m: Model, op: PatchOp): Model {
  if (op.op === 'add') {
    const { flow, ...rest } = op.value;
    let next = addVariable(m, { ...rest, origin: AI } as VariableInput);
    if (flow !== undefined && flow !== null) {
      const ends = parseEntity(FlowEnds, flow, 'flow ends');
      next = connectFlow(next, str(rest.id) ?? '', ends);
    }
    return next;
  }
  if (op.op === 'remove') return removeVariable(m, op.id);
  checkFields(
    op.changes,
    ['name', 'kind', 'equation', 'units', 'doc', 'nonNegative', 'graph', 'uncertainty'],
    'variable',
  );
  const { name, kind, ...rest } = op.changes;
  let next = m;
  if (kind !== undefined) next = setKind(next, op.id, parseEntity(VarKind, kind, 'kind'));
  if (name !== undefined) next = setVariableName(next, op.id, str(name) ?? fail('name must be text'));
  // values are validated by updateVariable's schema parse
  return updateVariable(next, op.id, { ...rest, origin: AI });
}

function applyLink(m: Model, op: PatchOp): Model {
  if (op.op === 'add') return addLink(m, { ...op.value, origin: AI } as LinkInput);
  if (op.op === 'remove') return removeLink(m, op.id);
  checkFields(op.changes, ['polarity', 'delay', 'note', 'confidence'], 'link');
  return updateLink(m, op.id, { ...op.changes, origin: AI });
}

function applyLoopAnnotation(m: Model, op: PatchOp): Model {
  const list = m.loopAnnotations;
  if (op.op === 'add') {
    const a = parseEntity(LoopAnnotation, { ...op.value, origin: AI }, 'loop annotation');
    if (list.some((x) => x.key === a.key)) fail(`loop "${a.key}" is already annotated`);
    return { ...m, loopAnnotations: [...list, a] };
  }
  const current = list.find((x) => x.key === op.id) ?? fail(`loop annotation "${op.id}" not found`);
  if (op.op === 'remove') return { ...m, loopAnnotations: list.filter((x) => x !== current) };
  checkFields(op.changes, ['name', 'note'], 'loop annotation');
  const next = parseEntity(
    LoopAnnotation,
    { ...current, ...op.changes, key: current.key, origin: AI },
    'loop annotation',
  );
  return { ...m, loopAnnotations: list.map((x) => (x === current ? next : x)) };
}

function applyIntervention(m: Model, op: PatchOp): Model {
  const list = m.interventions;
  if (op.op === 'add') {
    const iv = parseEntity(Intervention, { ...op.value, origin: AI }, 'intervention');
    if (list.some((x) => x.id === iv.id)) fail(`intervention id "${iv.id}" already exists`);
    return { ...m, interventions: [...list, iv] };
  }
  const current = list.find((x) => x.id === op.id) ?? fail(`intervention "${op.id}" not found`);
  if (op.op === 'remove') return { ...m, interventions: list.filter((x) => x !== current) };
  checkFields(op.changes, ['name', 'description', 'leverage', 'scenarioId', 'status', 'rationale'], 'intervention');
  const next = parseEntity(Intervention, { ...current, ...op.changes, id: current.id, origin: AI }, 'intervention');
  return { ...m, interventions: list.map((x) => (x === current ? next : x)) };
}

function applyScenario(m: Model, op: PatchOp): Model {
  const list = m.scenarios;
  if (op.op === 'add') {
    const s = parseEntity(Scenario, { ...op.value, origin: AI }, 'scenario');
    if (list.some((x) => x.id === s.id)) fail(`scenario id "${s.id}" already exists`);
    return { ...m, scenarios: [...list, s] };
  }
  const current = list.find((x) => x.id === op.id) ?? fail(`scenario "${op.id}" not found`);
  if (op.op === 'remove')
    return {
      ...m,
      scenarios: list.filter((x) => x !== current),
      interventions: m.interventions.map((iv) => (iv.scenarioId === current.id ? { ...iv, scenarioId: null } : iv)),
    };
  checkFields(op.changes, ['name', 'note', 'overrides', 'simSpec'], 'scenario');
  const next = parseEntity(Scenario, { ...current, ...op.changes, id: current.id, origin: AI }, 'scenario');
  return { ...m, scenarios: list.map((x) => (x === current ? next : x)) };
}

/** Assertions carry no `origin` field in the schema, so they cannot be tagged ai-proposed. */
function applyAssertion(m: Model, op: PatchOp): Model {
  const list = m.assertions;
  if (op.op === 'add') {
    const a = parseEntity(Assertion, op.value, 'assertion');
    if (list.some((x) => x.id === a.id)) fail(`assertion id "${a.id}" already exists`);
    return { ...m, assertions: [...list, a] };
  }
  const current = list.find((x) => x.id === op.id) ?? fail(`assertion "${op.id}" not found`);
  if (op.op === 'remove') return { ...m, assertions: list.filter((x) => x !== current) };
  checkFields(op.changes, ['expr', 'note', 'enabled'], 'assertion');
  const next = parseEntity(Assertion, { ...current, ...op.changes, id: current.id }, 'assertion');
  return { ...m, assertions: list.map((x) => (x === current ? next : x)) };
}

const APPLY: Record<PatchEntity, (m: Model, op: PatchOp) => Model> = {
  variable: applyVariable,
  link: applyLink,
  loopAnnotation: applyLoopAnnotation,
  intervention: applyIntervention,
  scenario: applyScenario,
  assertion: applyAssertion,
};

/** Apply one op; throws with a human-readable reason if the op or the resulting model is invalid. */
function applyOne(m: Model, op: PatchOp): Model {
  const next = APPLY[op.entity](m, op);
  const issue = integrityIssues(next)[0];
  if (issue) fail(issue.message);
  return next;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function run(model: Model, patch: Patch, accepted: ReadonlySet<string>): ApplyPatchResult {
  let m = model;
  const applied: string[] = [];
  const skipped: { opId: string; reason: string }[] = [];
  /** elements that will not exist because the op adding them was rejected or skipped → why */
  const missing = new Map<string, string>();

  for (const op of patch.ops) {
    const target = opTarget(op);
    if (!accepted.has(op.opId)) {
      if (op.op === 'add') missing.set(key(target.entity, target.id), `rejected in ${op.opId}`);
      continue;
    }
    const blocked = opDeps(op).find((d) => missing.has(d));
    if (blocked !== undefined) {
      const [entity, ...rest] = blocked.split(':');
      skipped.push({ opId: op.opId, reason: `depends on ${entity} "${rest.join(':')}" (${missing.get(blocked)})` });
      if (op.op === 'add') missing.set(key(target.entity, target.id), `skipped in ${op.opId}`);
      continue;
    }
    try {
      m = applyOne(m, op);
      applied.push(op.opId);
    } catch (e) {
      skipped.push({ opId: op.opId, reason: messageOf(e) });
      if (op.op === 'add') missing.set(key(target.entity, target.id), `skipped in ${op.opId}`);
    }
  }
  return { model: m, applied, skipped };
}

/**
 * Apply the accepted ops of a patch, in patch order. Ops that are invalid, or depend on an element whose op was
 * rejected or skipped, are skipped with a reason. Added and updated elements get `origin: 'ai-proposed'`.
 * With no accepted op the input model is returned as is; if the result failed `ModelSchema`, nothing is applied.
 */
export function applyPatch(model: Model, patch: Patch, acceptedOpIds: ReadonlySet<string>): ApplyPatchResult {
  const r = run(model, patch, acceptedOpIds);
  if (r.applied.length === 0) return { model, applied: [], skipped: r.skipped };
  const check = ModelSchema.safeParse(r.model);
  if (!check.success) {
    const reason = `the patched model is invalid (${check.error.issues[0]?.message ?? 'unknown'}); nothing was applied`;
    return {
      model,
      applied: [],
      skipped: patch.ops.filter((o) => acceptedOpIds.has(o.opId)).map((o) => ({ opId: o.opId, reason })),
    };
  }
  return r;
}

/** What the model would look like with every op accepted, for canvas ghosts and the diff list. */
export function previewPatch(model: Model, patch: Patch): PatchPreview {
  const r = run(model, patch, new Set(patch.ops.map((o) => o.opId)));
  const p = r.model;
  const before = { v: new Set(model.variables.map((v) => v.id)), l: new Set(model.links.map((l) => l.id)) };
  const after = { v: new Set(p.variables.map((v) => v.id)), l: new Set(p.links.map((l) => l.id)) };
  const appliedIds = new Set(r.applied);
  const targets: PatchPreview['targets'] = {};
  const changed: Id[] = [];
  const removed: Id[] = [
    ...model.variables.filter((v) => !after.v.has(v.id)).map((v) => v.id),
    ...model.links.filter((l) => !after.l.has(l.id)).map((l) => l.id),
  ];
  for (const op of patch.ops) {
    const t = opTarget(op);
    targets[op.opId] = t;
    if (!appliedIds.has(op.opId)) continue;
    if (op.op === 'update' && !changed.includes(t.id)) changed.push(t.id);
    if (op.op === 'remove' && t.entity !== 'variable' && t.entity !== 'link') removed.push(t.id);
  }
  return {
    added: {
      variables: p.variables.filter((v) => !before.v.has(v.id)).map((v) => v.id),
      links: p.links.filter((l) => !before.l.has(l.id)).map((l) => l.id),
    },
    changed: changed.filter((id) => !removed.includes(id)),
    removed,
    preview: p,
    targets,
    skipped: r.skipped,
  };
}

export interface AiElement {
  entity: 'variable' | 'link' | 'loopAnnotation' | 'intervention' | 'scenario';
  /** element id (loop key for loop annotations) */
  id: string;
  label: string;
}

/** Elements still tagged `ai-proposed` (accepted from a copilot patch, not yet confirmed by the engineer). */
export function aiProposedElements(model: Model): AiElement[] {
  const name = new Map(model.variables.map((v) => [v.id, v.name]));
  const out: AiElement[] = [];
  for (const v of model.variables) if (v.origin === AI) out.push({ entity: 'variable', id: v.id, label: v.name });
  for (const l of model.links)
    if (l.origin === AI)
      out.push({
        entity: 'link',
        id: l.id,
        label: `${name.get(l.from) ?? l.from} → ${name.get(l.to) ?? l.to} (${l.polarity})`,
      });
  for (const a of model.loopAnnotations)
    if (a.origin === AI) out.push({ entity: 'loopAnnotation', id: a.key, label: a.name || a.key });
  for (const s of model.scenarios) if (s.origin === AI) out.push({ entity: 'scenario', id: s.id, label: s.name });
  for (const iv of model.interventions)
    if (iv.origin === AI) out.push({ entity: 'intervention', id: iv.id, label: iv.name });
  return out;
}

/**
 * Mark `ai-proposed` elements as `ai-confirmed` (all of them, or those whose id / loop key is in `ids`).
 * Returns the same model object when nothing changes.
 */
export function markConfirmed(model: Model, ids?: ReadonlySet<string>): Model {
  let changed = false;
  const confirm = <T extends { origin: Origin }>(item: T, id: string): T => {
    if (item.origin !== AI || (ids && !ids.has(id))) return item;
    changed = true;
    return { ...item, origin: 'ai-confirmed' };
  };
  const next: Model = {
    ...model,
    variables: model.variables.map((v) => confirm(v, v.id)),
    links: model.links.map((l) => confirm(l, l.id)),
    loopAnnotations: model.loopAnnotations.map((a) => confirm(a, a.key)),
    scenarios: model.scenarios.map((s) => confirm(s, s.id)),
    interventions: model.interventions.map((iv) => confirm(iv, iv.id)),
  };
  return changed ? next : model;
}
