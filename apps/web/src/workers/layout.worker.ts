/** Runs dagre off the main thread so auto-layout never blocks the UI on large diagrams. */
import { computeLayout, type LayoutEdge, type LayoutNode, type LayoutOptions } from '../lib/layout.ts';

export interface LayoutRequest {
  id: number;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  opts?: LayoutOptions;
}

self.onmessage = (ev: MessageEvent<LayoutRequest>) => {
  const { id, nodes, edges, opts } = ev.data;
  try {
    self.postMessage({ id, ok: true, positions: computeLayout(nodes, edges, opts) });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
