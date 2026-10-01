/**
 * Loops That Matter (SPEC §6.6, RESEARCH §LTM 1–5 and 8, decision D-008; choices in docs/decisions/analysis.md).
 *
 *  - Link score of x → z, z an auxiliary or flow (Schoenberg, Davidsen & Eberlein 2020, Eqn 1):
 *    `|Δₓz/Δz| · sign(Δₓz/Δx)` with `Δₓz = f(xₜ, everything else at tₜ₋₁) − zₜ₋₁`, found by re-evaluating z's equation
 *    (`CompiledModel.evalVar`) on the saved state vectors; 0 if Δz = 0 or Δx = 0.
 *  - Link score of flow → stock: the 2023 revision (Schoenberg, Hayward & Eberlein) in its net-flow form,
 *    `+|Δi/Δnet|` for an inflow and `−|Δo/Δnet|` for an outflow, `Δnet = ΣΔinflows − ΣΔoutflows`; 0 if Δnet = 0 or Δflow = 0.
 *  - Loop score = product of its link scores, kept as log-magnitude + sign so long loops with large or tiny scores never
 *    overflow or underflow; relative score = score / Σ|score| over the loops of the same cycle partition (a strongly
 *    connected component of the causal graph).
 *
 * Everything is computed from values at saved points only, so it does not depend on the integration method. The score of
 * the interval [tₖ₋₁, tₖ] is labelled tₖ; at the first saved time nothing has changed yet and every score is 0.
 */
import type { CompiledModel, Loop, LtmResult, SimResult } from '../contracts.ts';
import { buildCausalGraph, stronglyConnectedComponents } from '../graph/digraph.ts';
import type { Id, Model } from '../schema/model.ts';

/** Product of one loop's link scores at saved step `k`, as log-magnitude and sign; `sign` 0 (log −∞) = an inactive link. */
export function loopLogScore(links: readonly ArrayLike<number>[], k: number): { log: number; sign: number } {
  let log = 0;
  let sign = 1;
  for (const scores of links) {
    const s = scores[k];
    if (s === 0 || !Number.isFinite(s)) return { log: -Infinity, sign: 0 };
    log += Math.log(Math.abs(s));
    if (s < 0) sign = -sign;
  }
  return { log, sign };
}

/**
 * Relative loop scores of one cycle partition at one step (P1 Eqn 4) from the loops' log-magnitudes and signs:
 * `sᵢ·e^ℓᵢ / Σⱼ e^ℓⱼ`, evaluated as `sᵢ·e^(ℓᵢ−ℓmax) / Σⱼ e^(ℓⱼ−ℓmax)` so magnitudes beyond the double range still work.
 * Inactive loops (sign 0) score 0; a partition with no active loop scores 0 throughout.
 */
export function relativeScores(logs: ArrayLike<number>, signs: ArrayLike<number>, out: Float64Array): void {
  let max = -Infinity;
  for (let i = 0; i < logs.length; i++) if (signs[i] !== 0 && logs[i] > max) max = logs[i];
  if (max === -Infinity) {
    out.fill(0, 0, logs.length);
    return;
  }
  let total = 0;
  for (let i = 0; i < logs.length; i++) if (signs[i] !== 0) total += Math.exp(logs[i] - max);
  for (let i = 0; i < logs.length; i++) out[i] = signs[i] === 0 ? 0 : (signs[i] * Math.exp(logs[i] - max)) / total;
}

/** z = f(x, …): re-evaluate z's equation with the current x and the previous value of everything else. */
interface EquationLink {
  out: Float64Array;
  x: number;
  z: number;
  zId: Id;
}

/** Net flow of one stock: Σ sign·flow, over every flow attached to it (also the flows that are on no loop). */
interface StockNet {
  slots: number[];
  signs: number[];
  /** Δnet of the step being scored */
  delta: number;
}

interface FlowLink {
  out: Float64Array;
  flow: number;
  /** +1 inflow, −1 outflow */
  sign: number;
  stock: StockNet;
}

/**
 * Relative loop scores of `loops` over a run. `result` must come from `compiled.simulate(spec, { saveState: true })`
 * (the full value vectors are what the equations are re-evaluated on). Scores are relative to the loops passed in, so
 * a truncated loop set (`findLoops(...).truncated`) is not the published method. `linkScore` holds the links of those loops.
 */
export function loopsThatMatter(model: Model, compiled: CompiledModel, result: SimResult, loops: Loop[]): LtmResult {
  const state = result.state;
  if (!state) throw new Error('loopsThatMatter needs a SimResult saved with { saveState: true }');
  const time = result.time;
  const n = time.length;
  if (state.length !== n) throw new Error(`loopsThatMatter: ${state.length} state vectors for ${n} saved times`);
  if (state.some((vec) => vec.length !== compiled.size))
    throw new Error(`loopsThatMatter: state vectors must have ${compiled.size} entries (the compiled model's size)`);

  // ── loops and cycle partitions (strongly connected components of the causal graph) ──
  const list = [...new Map(loops.map((l) => [l.key, l])).values()];
  const graph = buildCausalGraph(model);
  const component = new Int32Array(graph.ids.length).fill(-1);
  stronglyConnectedComponents(graph.succ, graph.ids.keys()).forEach((c, i) => c.forEach((v) => (component[v] = i)));
  const partitions = new Map<number, number[]>();
  list.forEach((loop, i) => {
    const v = graph.indexOf.get(loop.varIds[0] ?? '');
    if (v === undefined) throw new Error(`loopsThatMatter: loop "${loop.key}" uses a variable that is not in the model`);
    const members = partitions.get(component[v]);
    if (members) members.push(i);
    else partitions.set(component[v], [i]);
  });

  // ── the links to score: those of the loops ──
  const linkById = new Map(model.links.map((l) => [l.id, l]));
  const linkScore = new Map<Id, Float64Array>();
  const loopLinks = list.map((loop) =>
    loop.linkIds.map((id) => {
      if (!linkById.has(id)) throw new Error(`loopsThatMatter: loop "${loop.key}" uses link "${id}", which is not in the model`);
      let scores = linkScore.get(id);
      if (!scores) linkScore.set(id, (scores = new Float64Array(n)));
      return scores;
    }),
  );

  const variable = new Map(model.variables.map((v) => [v.id, v]));
  const attached = new Map<Id, StockNet>(); // flows of each stock, by the compiler's rule (`to` wins over `from`)
  const attach = (stock: Id, slot: number, sign: number) => {
    const net = attached.get(stock) ?? { slots: [], signs: [], delta: 0 };
    net.slots.push(slot);
    net.signs.push(sign);
    attached.set(stock, net);
  };
  for (const v of model.variables) {
    const slot = compiled.index[v.id];
    if (v.kind !== 'flow' || !v.flow || slot === undefined) continue;
    if (v.flow.to) attach(v.flow.to, slot, 1);
    if (v.flow.from && v.flow.from !== v.flow.to) attach(v.flow.from, slot, -1);
  }

  const equationLinks: EquationLink[] = [];
  const flowLinks: FlowLink[] = [];
  const nets = new Set<StockNet>();
  for (const [id, out] of linkScore) {
    const link = linkById.get(id);
    const from = link && variable.get(link.from);
    const to = link && variable.get(link.to);
    const x = from && compiled.index[from.id];
    const z = to && compiled.index[to.id];
    if (!from || !to || x === undefined || z === undefined) continue; // no value on one end: never active
    if (to.kind === 'stock') {
      const net = attached.get(to.id);
      const sign = from.kind === 'flow' && from.flow ? (from.flow.to === to.id ? 1 : from.flow.from === to.id ? -1 : 0) : 0;
      if (net && sign !== 0) {
        flowLinks.push({ out, flow: x, sign, stock: net });
        nets.add(net);
      }
    } else equationLinks.push({ out, x, z, zId: to.id });
  }

  // ── link scores per scored interval [t(k−1), t(k)] ──
  const w = new Float64Array(compiled.size);
  for (let k = 1; k < n; k++) {
    const prev = state[k - 1];
    const cur = state[k];
    w.set(prev);
    for (const l of equationLinks) {
      const dx = cur[l.x] - prev[l.x];
      const dz = cur[l.z] - prev[l.z];
      if (dx === 0 || dz === 0) continue;
      w[l.x] = cur[l.x];
      const dxz = compiled.evalVar(l.zId, w, time[k - 1]) - prev[l.z];
      w[l.x] = prev[l.x];
      if (dxz === 0) continue;
      const ls = Math.abs(dxz / dz) * (dxz > 0 === dx > 0 ? 1 : -1);
      if (Number.isFinite(ls)) l.out[k] = ls;
    }
    for (const net of nets) {
      net.delta = 0;
      for (let j = 0; j < net.slots.length; j++) net.delta += net.signs[j] * (cur[net.slots[j]] - prev[net.slots[j]]);
    }
    for (const l of flowLinks) {
      const df = cur[l.flow] - prev[l.flow];
      if (l.stock.delta === 0 || df === 0) continue;
      const ls = l.sign * Math.abs(df / l.stock.delta);
      if (Number.isFinite(ls)) l.out[k] = ls;
    }
  }

  // ── loop scores, normalised within each partition ──
  const rel = list.map(() => new Float64Array(n));
  for (const members of partitions.values()) {
    const logs = new Float64Array(members.length);
    const signs = new Float64Array(members.length);
    const shares = new Float64Array(members.length);
    for (let k = 1; k < n; k++) {
      members.forEach((li, m) => {
        const s = loopLogScore(loopLinks[li], k);
        logs[m] = s.log;
        signs[m] = s.sign;
      });
      relativeScores(logs, signs, shares);
      members.forEach((li, m) => (rel[li][k] = shares[m]));
    }
  }

  return {
    time,
    relScore: Object.fromEntries(list.map((l, i) => [l.key, rel[i]])),
    linkScore: Object.fromEntries(linkScore),
    partitions: [...partitions.values()].map((members) => members.map((i) => list[i].key)),
  };
}
