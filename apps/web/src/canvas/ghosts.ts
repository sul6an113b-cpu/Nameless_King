/**
 * Copilot patch ghosts (SPEC §7.3, §8): what a pending patch would add, change or remove, from core
 * `previewPatch`. Ops the engineer has rejected disappear from the overlay. If the preview is unavailable
 * (module not merged yet) or fails, there is simply no overlay: the canvas never depends on it.
 */
import type { Id, Link, Model, Patch, PatchPreview, Variable, XY } from '@looplab/core';
import type { OpDecision } from '../copilot/index.ts';
import { patchPreview, type Attempt } from '../lib/engine.ts';

export interface GhostOverlay {
  variables: Variable[];
  links: Link[];
  changed: ReadonlySet<Id>;
  removed: ReadonlySet<Id>;
  layout: { cld: Record<Id, XY>; sfd: Record<Id, XY> };
}

/** Element ids targeted by ops the engineer rejected. */
export function rejectedIds(patch: Patch, decisions: Readonly<Record<string, OpDecision>>): Set<string> {
  const out = new Set<string>();
  for (const op of patch.ops) {
    if (decisions[op.opId] !== 'reject') continue;
    const id = op.op === 'add' ? op.value.id : op.id;
    if (typeof id === 'string') out.add(id);
  }
  return out;
}

export function buildGhosts(
  model: Model,
  patch: Patch | null,
  decisions: Readonly<Record<string, OpDecision>>,
  preview: (m: Model, p: Patch) => Attempt<PatchPreview> = patchPreview,
): GhostOverlay | null {
  if (!patch) return null;
  const r = preview(model, patch);
  if (r.status !== 'ok') return null;
  const p = r.value;
  const rejected = rejectedIds(patch, decisions);
  const keep = (id: Id) => !rejected.has(id);
  const variables = p.added.variables
    .filter(keep)
    .map((id) => p.preview.variables.find((v) => v.id === id))
    .filter((v): v is Variable => v !== undefined);
  const shown = new Set([...model.variables.map((v) => v.id), ...variables.map((v) => v.id)]);
  const links = p.added.links
    .filter(keep)
    .map((id) => p.preview.links.find((l) => l.id === id))
    .filter((l): l is Link => l !== undefined && shown.has(l.from) && shown.has(l.to));
  return {
    variables,
    links,
    changed: new Set(p.changed.filter(keep)),
    removed: new Set(p.removed.filter(keep)),
    layout: p.preview.layout,
  };
}

/** Diff flag of a real element under the overlay. */
export function diffOf(overlay: GhostOverlay | null, id: Id): 'changed' | 'removed' | undefined {
  if (!overlay) return undefined;
  if (overlay.removed.has(id)) return 'removed';
  if (overlay.changed.has(id)) return 'changed';
  return undefined;
}
