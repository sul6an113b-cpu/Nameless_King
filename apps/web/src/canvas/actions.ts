/**
 * Canvas commands shared by toolbars and keyboard shortcuts. Each is one `commit` = one undo step and goes
 * through core model ops; rejected ops surface as a toast (see `act`).
 */
import type { Node } from '@xyflow/react';
import {
  addLink,
  addVariable,
  connectFlow,
  findLinkBetween,
  flipPolarity,
  getLink,
  getVariable,
  newId,
  removeLink,
  removeVariable,
  setLayout,
  toggleDelay,
  type Id,
  type Model,
  type VarKind,
  type XY,
} from '@looplab/core';
import { runLayout } from '../lib/layoutClient.ts';
import { nextVariableName } from '../lib/names.ts';
import { act } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';

const ui = () => useUiStore.getState();
const model = () => useModelStore.getState().model;
const nameOf = (m: Model, id: Id) => getVariable(m, id)?.name ?? id;

/** Add a variable of `kind` at `pos` (both lenses start aligned) and start renaming it inline. */
export function addVariableAt(kind: VarKind, pos: XY): Id | null {
  const id = newId('v');
  const p = { x: Math.round(pos.x), y: Math.round(pos.y) };
  const ok = act(`Add ${kind === 'variable' ? 'variable' : kind}`, (m) => {
    const next = addVariable(m, { id, name: nextVariableName(m, kind), kind });
    return setLayout(setLayout(next, 'cld', { [id]: p }), 'sfd', { [id]: p });
  });
  if (!ok) return null;
  ui().select([id]);
  ui().setRenaming(id);
  return id;
}

/** CLD link (or SFD information connector) from → to, polarity + by default. */
export function createLink(from: Id, to: Id): Id | null {
  const m = model();
  if (findLinkBetween(m, from, to)) {
    ui().toast(`A link from "${nameOf(m, from)}" to "${nameOf(m, to)}" already exists`, 'error');
    return null;
  }
  const id = newId('l');
  if (!act('Add link', (x) => addLink(x, { id, from, to, polarity: '+' }))) return null;
  ui().select([id]);
  return id;
}

/**
 * SFD connection semantics: flow valve → stock sets the flow's target, stock → valve sets its source,
 * anything else into a stock is refused (stocks change only through flows); otherwise an info connector.
 */
export function connectSfd(from: Id, to: Id): void {
  const m = model();
  const a = getVariable(m, from);
  const b = getVariable(m, to);
  if (!a || !b || from === to) return;
  if (a.kind === 'flow' && b.kind === 'stock') {
    if (act('Connect flow', (x) => connectFlow(x, from, { to }))) ui().select([from]);
    return;
  }
  if (a.kind === 'stock' && b.kind === 'flow') {
    if (act('Connect flow', (x) => connectFlow(x, to, { from }))) ui().select([to]);
    return;
  }
  if (b.kind === 'stock') {
    ui().toast(`A stock changes only through flows: connect a flow valve to "${b.name}" instead`, 'error');
    return;
  }
  createLink(from, to);
}

export function deleteSelection(): void {
  const m = model();
  const sel = ui().selection;
  const linkIds = sel.filter((id) => getLink(m, id));
  const varIds = sel.filter((id) => getVariable(m, id));
  const n = linkIds.length + varIds.length;
  if (n === 0) return;
  const ok = act(n === 1 ? 'Delete' : `Delete ${n} elements`, (x) => {
    let next = x;
    for (const id of linkIds) if (getLink(next, id)) next = removeLink(next, id);
    for (const id of varIds) if (getVariable(next, id)) next = removeVariable(next, id);
    return next;
  });
  if (ok) ui().select([]);
}

function selectedLinks(): Id[] {
  const m = model();
  return ui().selection.filter((id) => getLink(m, id));
}

export function flipSelectedPolarity(): void {
  const ids = selectedLinks();
  if (ids.length === 0) return ui().toast('Select a link first (click its arrow)');
  act('Flip polarity', (m) => ids.reduce((x, id) => flipPolarity(x, id), m));
}

export function toggleSelectedDelay(): void {
  const ids = selectedLinks();
  if (ids.length === 0) return ui().toast('Select a link first (click its arrow)');
  act('Toggle delay', (m) => ids.reduce((x, id) => toggleDelay(x, id), m));
}

/** Layered auto-layout (dagre in a worker) of the variables currently on the canvas. */
export async function autoLayout(
  lens: 'cld' | 'sfd',
  nodes: Node[],
  edges: { source: string; target: string }[],
): Promise<boolean> {
  const m = model();
  const layoutNodes = nodes
    .filter((n) => getVariable(m, n.id))
    .map((n) => ({
      id: n.id,
      width: n.measured?.width ?? n.initialWidth ?? 120,
      height:
        (n.measured?.height ?? n.initialHeight ?? 36) +
        (lens === 'sfd' && n.type !== 'stock' && n.type !== 'sfdvar' ? 18 : 0),
    }));
  if (layoutNodes.length === 0) return false;
  try {
    const positions = await runLayout(
      layoutNodes,
      edges.map((e) => ({ from: e.source, to: e.target })),
      { rankdir: 'LR', nodesep: lens === 'sfd' ? 60 : 50, ranksep: lens === 'sfd' ? 70 : 90 },
    );
    return act('Auto-layout', (x) => {
      const known = Object.fromEntries(Object.entries(positions).filter(([id]) => getVariable(x, id)));
      return setLayout(x, lens, known);
    });
  } catch (e) {
    ui().toast(`Auto-layout failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    return false;
  }
}
