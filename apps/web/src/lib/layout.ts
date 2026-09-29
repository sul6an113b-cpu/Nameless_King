/**
 * Auto-layout with dagre (layered, cycle tolerant: its acyclic pass reverses feedback edges).
 * Pure, so it runs in the layout worker and in tests. Returns React Flow top-left positions.
 */
import dagre from '@dagrejs/dagre';

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export interface LayoutOptions {
  rankdir?: 'LR' | 'TB';
  nodesep?: number;
  ranksep?: number;
}

export type Positions = Record<string, { x: number; y: number }>;

export function computeLayout(nodes: LayoutNode[], edges: LayoutEdge[], opts: LayoutOptions = {}): Positions {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: opts.rankdir ?? 'LR',
    nodesep: opts.nodesep ?? 50,
    ranksep: opts.ranksep ?? 90,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) g.setNode(n.id, { width: n.width, height: n.height });
  edges.forEach((e, i) => {
    if (ids.has(e.from) && ids.has(e.to)) g.setEdge(e.from, e.to, {}, `e${i}`);
  });
  dagre.layout(g);
  const out: Positions = {};
  for (const n of nodes) {
    const p = g.node(n.id) as { x: number; y: number };
    // dagre returns centres; React Flow positions are top-left
    out[n.id] = { x: Math.round(p.x - n.width / 2), y: Math.round(p.y - n.height / 2) };
  }
  return out;
}
