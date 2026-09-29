/** Pointer interactions shared by both canvases. */
import type { Node } from '@xyflow/react';
import { useUiStore } from '../state/ui.ts';

const isModelNode = (node: Node) => node.type !== 'ghost' && node.type !== 'cloud';

/** Link mode (L): first click picks the cause, second click the effect; the mode stays on until Esc/L. */
export function onLinkModeClick(node: Node, link: (from: string, to: string) => unknown): void {
  const ui = useUiStore.getState();
  if (!ui.linkMode || !isModelNode(node)) return;
  if (!ui.linkSource) {
    ui.setLinkSource(node.id);
    return;
  }
  link(ui.linkSource, node.id);
  ui.setLinkSource(null);
}

export function onRenameDoubleClick(node: Node): void {
  if (isModelNode(node)) useUiStore.getState().setRenaming(node.id);
}
