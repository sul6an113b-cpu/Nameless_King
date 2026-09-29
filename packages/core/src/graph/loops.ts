/**
 * Feedback-loop enumeration and classification (SPEC §6.5).
 *
 * Loops are the elementary circuits of the causal graph `model.links` (flow→stock links are ordinary stored
 * links, DECISIONS D-005). They are found with Johnson's algorithm (Johnson 1975, "Finding all the elementary
 * circuits of a directed graph", SIAM J. Comput. 4(1)), run per strongly connected component, with self-links
 * reported as loops of length 1. See docs/decisions/graph-analyst.md G-001/G-002.
 */
import type { FindLoopsOptions, FindLoopsResult, Loop, LoopType } from '../contracts.ts';
import type { Id, Link, LoopKey, Model } from '../schema/model.ts';
import { buildCausalGraph, compareIds, stronglyConnectedComponents, type CausalGraph } from './digraph.ts';

/** How many search steps pass between two clock reads when a time budget is set. */
const CLOCK_EVERY = 1024;

/** Loop key (SPEC §3): the cycle's variable ids rotated so the smallest id (JS string order) is first, joined by '>'. */
export function loopKey(varIds: readonly Id[]): LoopKey {
  if (varIds.length === 0) return '';
  let start = 0;
  for (let i = 1; i < varIds.length; i++) if (varIds[i] < varIds[start]) start = i;
  return [...varIds.slice(start), ...varIds.slice(0, start)].join('>');
}

/** Even number of '-' links → R, odd → B, any '?' → U. Throws on an unknown link id (a stale loop). */
export function loopType(model: Model, linkIds: Id[]): LoopType {
  const byId = new Map(model.links.map((l) => [l.id, l]));
  return typeOfLinks(
    linkIds.map((id) => {
      const link = byId.get(id);
      if (!link) throw new Error(`loopType: link "${id}" is not in the model`);
      return link;
    }),
  );
}

function typeOfLinks(links: readonly Link[]): LoopType {
  let negatives = 0;
  for (const link of links) {
    if (link.polarity === '?') return 'U';
    if (link.polarity === '-') negatives++;
  }
  return negatives % 2 === 0 ? 'R' : 'B';
}

/** Loops sorted by length, then key. */
export function compareLoops(a: Loop, b: Loop): number {
  return a.length - b.length || compareIds(a.key, b.key);
}

function makeLoop(graph: CausalGraph, cycle: readonly number[]): Loop {
  const links = cycle.map((from, i) => graph.out[from].get(cycle[(i + 1) % cycle.length]) as Link);
  const varIds = cycle.map((v) => graph.ids[v]);
  return {
    key: varIds.join('>'), // cycles are emitted starting at their smallest vertex, i.e. already rotated
    varIds,
    linkIds: links.map((l) => l.id),
    type: typeOfLinks(links),
    length: cycle.length,
    hasDelay: links.some((l) => l.delay),
  };
}

/**
 * All feedback loops of the model, sorted by length then key.
 *
 * Stops after `cap` loops (default `model.settings.loopCap`): if a further loop exists the result is
 * `truncated` with `reason: 'cap'`. With `timeBudgetMs`, the search also stops once that much wall time has
 * passed (`reason: 'time'`). A truncated set is the first loops in search order (self-loops, then loops grouped
 * by their smallest variable id), not the most important ones.
 */
export function findLoops(model: Model, opts: FindLoopsOptions = {}): FindLoopsResult {
  const requested = opts.cap ?? model.settings.loopCap;
  const cap = Number.isNaN(requested) ? model.settings.loopCap : Math.max(0, Math.floor(requested));
  const graph = buildCausalGraph(model);
  const loops: Loop[] = [];
  let reason: 'cap' | 'time' | undefined;

  const budget = opts.timeBudgetMs;
  const clockStart = budget === undefined ? 0 : performance.now();
  let ticks = 0;
  const outOfTime = (): boolean => {
    if (budget === undefined || ++ticks % CLOCK_EVERY !== 0) return false;
    if (performance.now() - clockStart <= budget) return false;
    reason = 'time';
    return true;
  };
  /** Records a loop; returns false when the search must stop. */
  const accept = (cycle: readonly number[]): boolean => {
    if (loops.length >= cap) {
      reason = 'cap';
      return false;
    }
    loops.push(makeLoop(graph, cycle));
    return true;
  };

  let stopped = false;
  for (let v = 0; v < graph.ids.length && !stopped; v++) if (graph.out[v].has(v)) stopped = !accept([v]);
  if (!stopped) johnsonCircuits(graph, accept, outOfTime);

  loops.sort(compareLoops);
  return reason === undefined ? { loops, truncated: false, cap } : { loops, truncated: true, cap, reason };
}

/**
 * Johnson's elementary-circuit algorithm, iterative, over the graph without self-links.
 * Components are processed by their smallest vertex s; circuits through s use only vertices of s's strong
 * component in the subgraph of vertices ≥ s, so each circuit is emitted exactly once, starting at its smallest vertex.
 * `emit` / `outOfTime` returning true / false as documented stop the search.
 */
function johnsonCircuits(
  graph: CausalGraph,
  emit: (cycle: readonly number[]) => boolean,
  outOfTime: () => boolean,
): void {
  const { succ } = graph;
  const n = succ.length;
  const blocked = new Uint8Array(n);
  const inComponent = new Uint8Array(n);
  const blockedBy: Set<number>[] = Array.from({ length: n }, () => new Set<number>());

  const unblock = (u: number) => {
    const pending = [u];
    while (pending.length > 0) {
      const x = pending.pop() as number;
      if (!blocked[x]) continue;
      blocked[x] = 0;
      for (const w of blockedBy[x]) pending.push(w);
      blockedBy[x].clear();
    }
  };

  const work = stronglyConnectedComponents(succ, graph.ids.keys()).filter((c) => c.length > 1);
  while (work.length > 0) {
    // Take the component with the smallest vertex, as Johnson's outer loop does.
    let pick = 0;
    for (let i = 1; i < work.length; i++) if (work[i][0] < work[pick][0]) pick = i;
    const component = work.splice(pick, 1)[0];
    const s = component[0];

    for (const v of component) {
      inComponent[v] = 1;
      blocked[v] = 0;
      blockedBy[v].clear();
    }

    const path = [s];
    blocked[s] = 1;
    const frames: { v: number; next: number; closed: boolean }[] = [{ v: s, next: 0, closed: false }];
    while (frames.length > 0) {
      if (outOfTime()) return;
      const frame = frames[frames.length - 1];
      const neighbours = succ[frame.v];
      if (frame.next < neighbours.length) {
        const w = neighbours[frame.next++];
        if (!inComponent[w]) continue;
        if (w === s) {
          if (!emit(path)) return;
          frame.closed = true;
        } else if (!blocked[w]) {
          path.push(w);
          blocked[w] = 1;
          frames.push({ v: w, next: 0, closed: false });
        }
        continue;
      }
      // All neighbours explored: Johnson's post-processing for this vertex.
      frames.pop();
      path.pop();
      if (frame.closed) {
        unblock(frame.v);
        if (frames.length > 0) frames[frames.length - 1].closed = true;
      } else {
        for (const w of neighbours) if (inComponent[w]) blockedBy[w].add(frame.v);
      }
    }

    for (const v of component) inComponent[v] = 0;
    const rest = component.slice(1);
    for (const sub of stronglyConnectedComponents(succ, rest)) if (sub.length > 1) work.push(sub);
  }
}
