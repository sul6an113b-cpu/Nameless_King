/**
 * Pure, immutable model operations (SPEC §4). Every path that edits a model (web store, copilot patch-apply,
 * content authoring) goes through these, so the hard integrity rules I1–I8 hold after every op.
 * Ops never touch timestamps; the caller stamps `updatedAt` when saving.
 */
import type { z } from 'zod';
import {
  Link,
  Variable,
  type Id,
  type VariableInput,
  type Model,
  type LinkInput,
  type Polarity,
  type VarKind,
  type Variable as VariableT,
  type Link as LinkT,
  type XY,
} from '../schema/model.ts';
import { canonicalName, isReservedName } from '../schema/names.ts';

export type ModelOpErrorCode =
  | 'not-found'
  | 'duplicate-id'
  | 'duplicate-name'
  | 'reserved-name'
  | 'duplicate-link'
  | 'invalid'
  | 'not-a-stock'
  | 'not-a-flow';

export class ModelOpError extends Error {
  readonly code: ModelOpErrorCode;
  constructor(code: ModelOpErrorCode, message: string) {
    super(message);
    this.name = 'ModelOpError';
    this.code = code;
  }
}

const fail = (code: ModelOpErrorCode, message: string): never => {
  throw new ModelOpError(code, message);
};

// ── lookups ────────────────────────────────────────────────────────────────

export function getVariable(model: Model, id: Id): VariableT | undefined {
  return model.variables.find((v) => v.id === id);
}

export function getLink(model: Model, id: Id): LinkT | undefined {
  return model.links.find((l) => l.id === id);
}

export function findVariableByName(model: Model, name: string): VariableT | undefined {
  const key = canonicalName(name);
  return model.variables.find((v) => canonicalName(v.name) === key);
}

export function findLinkBetween(model: Model, from: Id, to: Id): LinkT | undefined {
  return model.links.find((l) => l.from === from && l.to === to);
}

const requireVariable = (model: Model, id: Id): VariableT =>
  getVariable(model, id) ?? fail('not-found', `Variable "${id}" not found`);

const requireLink = (model: Model, id: Id): LinkT => getLink(model, id) ?? fail('not-found', `Link "${id}" not found`);

function assertNameFree(model: Model, name: string, exceptId?: Id): void {
  if (isReservedName(name)) fail('reserved-name', `"${name.trim()}" is a reserved word or builtin function name`);
  const existing = findVariableByName(model, name);
  if (existing && existing.id !== exceptId)
    fail('duplicate-name', `A variable named "${existing.name}" already exists (names ignore case and _/space)`);
}

function parseOrFail<S extends z.ZodType>(schema: S, value: unknown, what: string): z.infer<S> {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  const first = r.error.issues[0];
  return fail('invalid', `Invalid ${what}: ${first ? `${first.path.join('.')} ${first.message}` : 'unknown error'}`);
}

// ── variables ──────────────────────────────────────────────────────────────

/** Add a variable. `input.id` is required (use `newId('v')`); other fields default per schema. */
export function addVariable(model: Model, input: VariableInput): Model {
  const v = parseOrFail(Variable, input, 'variable');
  if (getVariable(model, v.id)) fail('duplicate-id', `Variable id "${v.id}" already exists`);
  assertNameFree(model, v.name);
  const normalized = normalizeKindFields(v);
  return { ...model, variables: [...model.variables, normalized] };
}

type VariableChanges = Partial<Pick<VariableT, 'equation' | 'units' | 'doc' | 'nonNegative' | 'graph' | 'uncertainty' | 'origin'>>;

/**
 * Update non-structural fields. Structural changes have dedicated ops: `setKind`, `connectFlow`,
 * and `renameVariable` (parser module — it rewrites equations).
 */
export function updateVariable(model: Model, id: Id, changes: VariableChanges): Model {
  const current = requireVariable(model, id);
  const next = parseOrFail(Variable, { ...current, ...changes, id, name: current.name, kind: current.kind }, 'variable');
  if (next.graph && !['aux', 'flow', 'lookup'].includes(next.kind))
    fail('invalid', `Only aux, flow and lookup variables can have a graphical function`);
  return { ...model, variables: model.variables.map((v) => (v.id === id ? next : v)) };
}

/** Change a display name without touching equations. Prefer the parser's `renameVariable`, which also rewrites references. */
export function setVariableName(model: Model, id: Id, name: string): Model {
  const current = requireVariable(model, id);
  assertNameFree(model, name, id);
  const next = parseOrFail(Variable, { ...current, name }, 'variable');
  return { ...model, variables: model.variables.map((v) => (v.id === id ? next : v)) };
}

/** Remove a variable and everything that references it (links, flow ends, layout, KPI/ref-mode bindings, overrides, roles). */
export function removeVariable(model: Model, id: Id): Model {
  requireVariable(model, id);
  const dropKey = <T>(rec: Record<string, T>): Record<string, T> => {
    if (!(id in rec)) return rec;
    const copy = { ...rec };
    delete copy[id];
    return copy;
  };
  return {
    ...model,
    variables: model.variables
      .filter((v) => v.id !== id)
      .map((v) =>
        v.flow && (v.flow.from === id || v.flow.to === id)
          ? { ...v, flow: { from: v.flow.from === id ? null : v.flow.from, to: v.flow.to === id ? null : v.flow.to } }
          : v,
      ),
    links: model.links.filter((l) => l.from !== id && l.to !== id),
    frame: {
      ...model.frame,
      kpis: model.frame.kpis.map((k) => (k.varId === id ? { ...k, varId: null } : k)),
      referenceModes: model.frame.referenceModes.map((r) => (r.varId === id ? { ...r, varId: null } : r)),
    },
    scenarios: model.scenarios.map((s) =>
      s.overrides.some((o) => o.varId === id) ? { ...s, overrides: s.overrides.filter((o) => o.varId !== id) } : s,
    ),
    archetypeFindings: model.archetypeFindings.map((f) =>
      Object.values(f.roles).includes(id)
        ? { ...f, roles: Object.fromEntries(Object.entries(f.roles).filter(([, v]) => v !== id)) }
        : f,
    ),
    layout: { cld: dropKey(model.layout.cld), sfd: dropKey(model.layout.sfd) },
  };
}

/** Initialise/clear kind-specific fields so the variable satisfies I4/I5 for its kind. */
function normalizeKindFields(v: VariableT): VariableT {
  let next: VariableT = v;
  if (v.kind === 'flow' && !v.flow) next = { ...next, flow: { from: null, to: null } };
  if (v.kind !== 'flow' && v.flow) {
    const { flow: _drop, ...rest } = next;
    next = rest;
  }
  if (v.kind === 'lookup' && !v.graph) next = { ...next, graph: { xs: [0, 1], ys: [0, 1], mode: 'continuous' } };
  if (next.graph && !['aux', 'flow', 'lookup'].includes(v.kind)) {
    const { graph: _drop, ...rest } = next;
    next = rest;
  }
  return next;
}

/**
 * Change a variable's kind. Leaving 'flow' drops its flow ends; leaving 'stock' disconnects flows attached to it.
 * Causal links are kept (they are the CLD); flow-implied links are re-checked by Model Health.
 */
export function setKind(model: Model, id: Id, kind: VarKind): Model {
  const current = requireVariable(model, id);
  if (current.kind === kind) return model;
  const next = normalizeKindFields({ ...current, kind });
  let variables = model.variables.map((v) => (v.id === id ? next : v));
  if (current.kind === 'stock')
    variables = variables.map((v) =>
      v.flow && (v.flow.from === id || v.flow.to === id)
        ? { ...v, flow: { from: v.flow.from === id ? null : v.flow.from, to: v.flow.to === id ? null : v.flow.to } }
        : v,
    );
  return { ...model, variables };
}

// ── links ──────────────────────────────────────────────────────────────────

/** Add a causal link. `input.id` is required (use `newId('l')`). Self-links are allowed; duplicates are not. */
export function addLink(model: Model, input: LinkInput): Model {
  const l = parseOrFail(Link, input, 'link');
  if (getLink(model, l.id)) fail('duplicate-id', `Link id "${l.id}" already exists`);
  requireVariable(model, l.from);
  requireVariable(model, l.to);
  if (findLinkBetween(model, l.from, l.to)) fail('duplicate-link', `A link from "${l.from}" to "${l.to}" already exists`);
  return { ...model, links: [...model.links, l] };
}

type LinkChanges = Partial<Pick<LinkT, 'polarity' | 'delay' | 'note' | 'confidence' | 'origin'>>;

export function updateLink(model: Model, id: Id, changes: LinkChanges): Model {
  const current = requireLink(model, id);
  const next = parseOrFail(Link, { ...current, ...changes, id, from: current.from, to: current.to }, 'link');
  return { ...model, links: model.links.map((l) => (l.id === id ? next : l)) };
}

export function removeLink(model: Model, id: Id): Model {
  requireLink(model, id);
  return { ...model, links: model.links.filter((l) => l.id !== id) };
}

const FLIP: Record<Polarity, Polarity> = { '+': '-', '-': '+', '?': '+' };

/** + ↔ −; an unknown '?' becomes '+'. */
export function flipPolarity(model: Model, id: Id): Model {
  return updateLink(model, id, { polarity: FLIP[requireLink(model, id).polarity] });
}

export function toggleDelay(model: Model, id: Id): Model {
  return updateLink(model, id, { delay: !requireLink(model, id).delay });
}

// ── flows ──────────────────────────────────────────────────────────────────

/** Id for a flow-implied link; deterministic so ops stay pure. */
function impliedLinkId(model: Model, flowId: Id, stockId: Id): Id {
  const base = `l_${flowId}__${stockId}`.slice(0, 60);
  let id = base;
  for (let n = 2; getLink(model, id); n++) id = `${base}_${n}`;
  return id;
}

function ensureImpliedLink(model: Model, flowId: Id, stockId: Id, polarity: '+' | '-'): Model {
  const existing = findLinkBetween(model, flowId, stockId);
  if (existing) return existing.polarity === polarity ? model : updateLink(model, existing.id, { polarity });
  return addLink(model, { id: impliedLinkId(model, flowId, stockId), from: flowId, to: stockId, polarity });
}

function dropImpliedLink(model: Model, flowId: Id, stockId: Id): Model {
  const existing = findLinkBetween(model, flowId, stockId);
  return existing ? removeLink(model, existing.id) : model;
}

/**
 * Connect a flow's ends (null = cloud; undefined = unchanged) and maintain the implied causal links:
 * flow→to-stock (+) and flow→from-stock (−). The link to a replaced end is removed.
 */
export function connectFlow(model: Model, flowId: Id, ends: { from?: Id | null; to?: Id | null }): Model {
  const flow = requireVariable(model, flowId);
  if (flow.kind !== 'flow' || !flow.flow) return fail('not-a-flow', `"${flow.name}" is not a flow`);
  const from = ends.from === undefined ? flow.flow.from : ends.from;
  const to = ends.to === undefined ? flow.flow.to : ends.to;
  for (const s of [from, to])
    if (s !== null && requireVariable(model, s).kind !== 'stock')
      fail('not-a-stock', `"${requireVariable(model, s).name}" is not a stock`);
  if (from !== null && from === to) fail('invalid', 'A flow cannot drain and fill the same stock');

  let m: Model = {
    ...model,
    variables: model.variables.map((v) => (v.id === flowId ? { ...v, flow: { from, to } } : v)),
  };
  const old = flow.flow;
  if (old.from !== null && old.from !== from) m = dropImpliedLink(m, flowId, old.from);
  if (old.to !== null && old.to !== to) m = dropImpliedLink(m, flowId, old.to);
  if (from !== null) m = ensureImpliedLink(m, flowId, from, '-');
  if (to !== null) m = ensureImpliedLink(m, flowId, to, '+');
  return m;
}

/** The flow→stock links the SFD structure implies (Model Health checks they exist with this polarity). */
export function impliedFlowLinks(model: Model): { flowId: Id; stockId: Id; polarity: '+' | '-' }[] {
  const out: { flowId: Id; stockId: Id; polarity: '+' | '-' }[] = [];
  for (const v of model.variables) {
    if (v.kind !== 'flow' || !v.flow) continue;
    if (v.flow.to !== null) out.push({ flowId: v.id, stockId: v.flow.to, polarity: '+' });
    if (v.flow.from !== null) out.push({ flowId: v.id, stockId: v.flow.from, polarity: '-' });
  }
  return out;
}

// ── layout ─────────────────────────────────────────────────────────────────

export function setLayout(model: Model, lens: 'cld' | 'sfd', positions: Record<Id, XY>): Model {
  return { ...model, layout: { ...model.layout, [lens]: { ...model.layout[lens], ...positions } } };
}
