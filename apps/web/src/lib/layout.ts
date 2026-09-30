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
  const g = new dagre.graphlib.Graph();
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
  // Layering only needs adjacency: parallel, opposite and self edges (a pipe plus a link, a two-node loop) make
  // dagre throw "Not possible to find intersection", so each unordered pair is added once.
  const seen = new Set<string>();
  for (const e of edges) {
    const key = e.from < e.to ? `${e.from}\u0000${e.to}` : `${e.to}\u0000${e.from}`;
    if (e.from === e.to || !ids.has(e.from) || !ids.has(e.to) || seen.has(key)) continue;
    seen.add(key);
    g.setEdge(e.from, e.to);
  }
  dagre.layout(g);
  const out: Positions = {};
  for (const n of nodes) {
    const p = g.node(n.id) as { x: number; y: number };
    // dagre returns centres; React Flow positions are top-left
    out[n.id] = { x: Math.round(p.x - n.width / 2), y: Math.round(p.y - n.height / 2) };
  }
  return out;
}
