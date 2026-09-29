/**
 * Per-variable structural metrics (SPEC §6.5): loop participation, betweenness, boundary chart and the
 * structural leverage score. Formulas and rationale: docs/decisions/graph-analyst.md G-004…G-006.
 */
import type { BoundaryChart, Loop, StructuralLeverageRow } from '../contracts.ts';
import type { Id, Model } from '../schema/model.ts';
import { buildCausalGraph, compareIds, variablesOnLoops } from './digraph.ts';

/** Number of loops each variable lies on (variables on no loop are absent). */
export function loopParticipation(loops: Loop[]): Record<Id, number> {
  const counts: Record<Id, number> = {};
  for (const loop of loops) for (const id of loop.varIds) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/**
 * Betweenness centrality (Brandes 2001, "A faster algorithm for betweenness centrality", J. Math. Sociol. 25(2)),
 * directed and unweighted, normalised by (n−1)(n−2) — the number of ordered (source, target) pairs that exclude
 * the variable itself — so values lie in [0, 1]. Self-links never lie on a shortest path and are ignored.
 */
export function betweenness(model: Model): Record<Id, number> {
  const { ids, succ } = buildCausalGraph(model);
  const n = ids.length;
  const centrality = new Float64Array(n);
  const sigma = new Float64Array(n);
  const dist = new Int32Array(n);
  const delta = new Float64Array(n);
  const preds: number[][] = ids.map(() => []);
  const queue = new Int32Array(n);
  const order: number[] = [];

  for (let s = 0; s < n; s++) {
    sigma.fill(0);
    dist.fill(-1);
    delta.fill(0);
    for (const p of preds) p.length = 0;
    order.length = 0;
    sigma[s] = 1;
    dist[s] = 0;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const v = queue[head++];
      order.push(v);
      for (const w of succ[v]) {
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          queue[tail++] = w;
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v];
          preds[w].push(v);
        }
      }
    }
    for (let k = order.length - 1; k >= 0; k--) {
      const w = order[k];
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) centrality[w] += delta[w];
    }
  }

  const scale = n > 2 ? 1 / ((n - 1) * (n - 2)) : 0;
  const result: Record<Id, number> = {};
  ids.forEach((id, i) => (result[id] = centrality[i] * scale));
  return result;
}

/**
 * Model boundary chart. A variable is endogenous iff it lies on a feedback loop or is reachable from a loop
 * variable along causal links; every other variable is exogenous. "On a loop" is decided from the graph's strongly
 * connected components (exact even when `loops` was truncated at the cap) together with the given loops.
 * Both lists keep `model.variables` order; `excluded` is the user's list from the Frame stage.
 */
export function boundaryChart(model: Model, loops: Loop[]): BoundaryChart {
  const graph = buildCausalGraph(model);
  const endogenous = variablesOnLoops(graph);
  for (const loop of loops) for (const id of loop.varIds) if (graph.indexOf.has(id)) endogenous.add(id);

  const pending = [...endogenous];
  while (pending.length > 0) {
    const v = graph.indexOf.get(pending.pop() as Id) as number;
    for (const to of graph.out[v].keys()) {
      const id = graph.ids[to];
      if (!endogenous.has(id)) {
        endogenous.add(id);
        pending.push(id);
      }
    }
  }

  const ids = model.variables.map((v) => v.id);
  return {
    endogenous: ids.filter((id) => endogenous.has(id)),
    exogenous: ids.filter((id) => !endogenous.has(id)),
    excluded: model.frame.excluded,
  };
}

/** Bonus multipliers of the structural leverage score (G-006). */
export const LEVERAGE_WEIGHTS = { stock: 0.5, delay: 0.5 } as const;

/**
 * Structural leverage (G-006): for each variable,
 *
 *   score = ½ · (loops(v) / max loops + betweenness(v) / max betweenness) · (1 + 0.5·stock(v) + 0.5·delay(v))
 *
 * where stock(v) = 1 for stocks (accumulations; Meadows' stock-and-flow and buffer leverage points) and
 * delay(v) = 1 when a delayed link on one of the loops ends at v (Meadows' delay leverage point).
 * Rows are sorted by score (then id) with the cumulative share of the total score for a Pareto view.
 */
export function structuralLeverage(model: Model, loops: Loop[]): StructuralLeverageRow[] {
  const counts = loopParticipation(loops);
  const between = betweenness(model);
  const linkById = new Map(model.links.map((l) => [l.id, l]));
  const delayedTargets = new Set<Id>();
  for (const loop of loops)
    for (const linkId of loop.linkIds) {
      const link = linkById.get(linkId);
      if (link?.delay) delayedTargets.add(link.to);
    }

  const maxOf = (values: number[]) => values.reduce((max, x) => (x > max ? x : max), 0);
  const maxLoops = maxOf(Object.values(counts));
  const maxBetween = maxOf(Object.values(between));
  const rows = model.variables.map((v) => {
    const loopCount = counts[v.id] ?? 0;
    const participation = maxLoops > 0 ? loopCount / maxLoops : 0;
    const centrality = maxBetween > 0 ? (between[v.id] ?? 0) / maxBetween : 0;
    const stock = v.kind === 'stock' ? 1 : 0;
    const delay = delayedTargets.has(v.id) ? 1 : 0;
    const score =
      ((participation + centrality) / 2) * (1 + LEVERAGE_WEIGHTS.stock * stock + LEVERAGE_WEIGHTS.delay * delay);
    return {
      varId: v.id,
      score,
      components: { loopCount, participation, betweenness: centrality, stock, delay },
      cumulativeShare: 0,
    };
  });

  rows.sort((a, b) => b.score - a.score || compareIds(a.varId, b.varId));
  const total = rows.reduce((sum, r) => sum + r.score, 0);
  let running = 0;
  for (const row of rows) {
    running += row.score;
    row.cumulativeShare = total > 0 ? running / total : 0;
  }
  return rows;
}
