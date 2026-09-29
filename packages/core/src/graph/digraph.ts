/**
 * Index-based view of a model's causal graph (`model.links`), shared by loop enumeration and metrics.
 * Vertices are the model's variables sorted by id (JS string order), so every algorithm that walks
 * vertices "in order" is independent of the order variables and links happen to be stored in.
 */
import type { Id, Link, Model } from '../schema/model.ts';

export interface CausalGraph {
  /** vertex ids in ascending JS string order */
  ids: Id[];
  indexOf: Map<Id, number>;
  /** successor vertex indices per vertex, ascending, self-links excluded */
  succ: number[][];
  /** outgoing link per (from, to) vertex pair, self-links included */
  out: Map<number, Link>[];
}

export const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function buildCausalGraph(model: Model): CausalGraph {
  const ids = model.variables.map((v) => v.id).sort(compareIds);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const out = ids.map(() => new Map<number, Link>());
  for (const link of model.links) {
    const from = indexOf.get(link.from);
    const to = indexOf.get(link.to);
    // Links to unknown variables cannot occur in a schema-valid model (I3); ignore them defensively.
    if (from === undefined || to === undefined || out[from].has(to)) continue;
    out[from].set(to, link);
  }
  const succ = out.map((links, from) => [...links.keys()].filter((to) => to !== from).sort((a, b) => a - b));
  return { ids, indexOf, succ, out };
}

/**
 * Strongly connected components (Tarjan, iterative) of the subgraph induced by `members`.
 * Each component is returned sorted ascending; components come out in reverse topological order.
 */
export function stronglyConnectedComponents(succ: number[][], members: Iterable<number>): number[][] {
  const n = succ.length;
  const inSet = new Uint8Array(n);
  const roots: number[] = [];
  for (const v of members) {
    inSet[v] = 1;
    roots.push(v);
  }
  const index = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  const components: number[][] = [];
  const frames: { v: number; next: number }[] = [];
  let counter = 0;

  const visit = (v: number) => {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = 1;
    frames.push({ v, next: 0 });
  };

  for (const root of roots) {
    if (index[root] !== -1) continue;
    visit(root);
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const v = frame.v;
      if (frame.next < succ[v].length) {
        const w = succ[v][frame.next++];
        if (!inSet[w]) continue;
        if (index[w] === -1) visit(w);
        else if (onStack[w]) low[v] = Math.min(low[v], index[w]);
        continue;
      }
      frames.pop();
      if (frames.length > 0) {
        const parent = frames[frames.length - 1].v;
        low[parent] = Math.min(low[parent], low[v]);
      }
      if (low[v] === index[v]) {
        const component: number[] = [];
        let w: number;
        do {
          w = stack.pop() as number;
          onStack[w] = 0;
          component.push(w);
        } while (w !== v);
        components.push(component.sort((a, b) => a - b));
      }
    }
  }
  return components;
}

/** Ids of variables that lie on at least one feedback loop (a non-trivial SCC, or a self-link). Exact, never capped. */
export function variablesOnLoops(graph: CausalGraph): Set<Id> {
  const onLoop = new Set<Id>();
  for (const component of stronglyConnectedComponents(graph.succ, graph.ids.keys()))
    if (component.length > 1) for (const v of component) onLoop.add(graph.ids[v]);
  graph.out.forEach((links, v) => {
    if (links.has(v)) onLoop.add(graph.ids[v]);
  });
  return onLoop;
}
