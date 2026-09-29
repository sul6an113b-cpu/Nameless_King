import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Model } from '../schema/model.ts';
import { graphModel, type GraphSpec, type LinkSpec } from '../../test/fixtures/graph/build.ts';
import { loopFixtures } from '../../test/fixtures/graph/loops.fixtures.ts';
import { betweenness, boundaryChart, findLoops, loopParticipation, structuralLeverage } from './index.ts';

const spec = (name: string): GraphSpec => {
  const f = loopFixtures.find((x) => x.name === name);
  if (!f) throw new Error(`no fixture ${name}`);
  return f.spec;
};
const fixture = (name: string) => graphModel(spec(name));
const chain = (ids: string[], extra: LinkSpec[] = []) =>
  graphModel({ vars: ids, links: [...ids.slice(1).map((to, i): LinkSpec => [ids[i], to, '+']), ...extra] });

describe('loopParticipation', () => {
  it('counts the loops through each variable', () => {
    const { loops } = findLoops(fixture('six-variable rework CLD'));
    expect(loopParticipation(loops)).toEqual({ bl: 3, sp: 3, ot: 3, pr: 2, fa: 2, er: 1 });
  });

  it('is empty without loops', () => {
    expect(loopParticipation([])).toEqual({});
  });
});

describe('betweenness (Brandes, directed, normalised by (n−1)(n−2))', () => {
  it('path a→b→c: b lies on the only a→c path', () => {
    expect(betweenness(chain(['a', 'b', 'c']))).toEqual({ a: 0, b: 0.5, c: 0 });
  });

  it('directed 3-cycle: each vertex lies on one of the six ordered pairs', () => {
    expect(betweenness(chain(['a', 'b', 'c'], [['c', 'a', '+']]))).toEqual({ a: 0.5, b: 0.5, c: 0.5 });
  });

  it('splits credit between equally short paths and ignores self-links', () => {
    const m = graphModel({
      vars: ['a', 'b', 'c', 'd'],
      links: [
        ['a', 'b', '+'],
        ['a', 'c', '+'],
        ['b', 'd', '+'],
        ['c', 'd', '-'],
        ['b', 'b', '+'],
      ],
    });
    expect(betweenness(m)).toEqual({ a: 0, b: 1 / 12, c: 1 / 12, d: 0 });
  });

  it('is zero for graphs with at most two variables', () => {
    expect(betweenness(chain(['a', 'b'], [['b', 'a', '+']]))).toEqual({ a: 0, b: 0 });
  });

  it('matches a brute-force shortest-path count on random graphs (≤ 7 variables)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const arb = fc
      .integer({ min: 1, max: 7 })
      .chain((n) =>
        fc
          .uniqueArray(fc.tuple(fc.nat(n - 1), fc.nat(n - 1)), { selector: ([f, t]) => `${f}>${t}`, maxLength: n * n })
          .map((edges) =>
            graphModel({ vars: ids.slice(0, n), links: edges.map(([f, t]): LinkSpec => [ids[f], ids[t], '+']) }),
          ),
      );
    fc.assert(
      fc.property(arb, (model) => {
        const expected = bruteForceBetweenness(model);
        const actual = betweenness(model);
        for (const v of model.variables) expect(actual[v.id]).toBeCloseTo(expected[v.id], 12);
      }),
      { numRuns: 200 },
    );
  });
});

/** Oracle: σ(s,t|v) = σ(s,v)·σ(v,t) when d(s,v) + d(v,t) = d(s,t), with path counts from BFS layers. */
function bruteForceBetweenness(model: Model): Record<string, number> {
  const ids = model.variables.map((v) => v.id);
  const n = ids.length;
  const adj = ids.map((a) => ids.map((b) => a !== b && model.links.some((l) => l.from === a && l.to === b)));
  const dist: number[][] = [];
  const count: number[][] = [];
  for (let s = 0; s < n; s++) {
    const d = Array<number>(n).fill(Infinity);
    const c = Array<number>(n).fill(0);
    d[s] = 0;
    c[s] = 1;
    for (let layer = 0; layer < n; layer++)
      for (let u = 0; u < n; u++)
        if (d[u] === layer)
          for (let w = 0; w < n; w++)
            if (adj[u][w] && d[w] >= layer + 1) {
              d[w] = layer + 1;
              c[w] += c[u];
            }
    dist.push(d);
    count.push(c);
  }
  const result: Record<string, number> = {};
  ids.forEach((id, v) => {
    let sum = 0;
    for (let s = 0; s < n; s++)
      for (let t = 0; t < n; t++)
        if (s !== t && s !== v && t !== v && count[s][t] > 0 && dist[s][v] + dist[v][t] === dist[s][t])
          sum += (count[s][v] * count[v][t]) / count[s][t];
    result[id] = n > 2 ? sum / ((n - 1) * (n - 2)) : 0;
  });
  return result;
}

describe('boundaryChart', () => {
  it('loop variables are endogenous; isolated and chain-only variables are exogenous', () => {
    const m = fixture('disconnected components');
    expect(boundaryChart(m, findLoops(m).loops)).toEqual({
      endogenous: ['a', 'b', 'c', 'd', 'e'],
      exogenous: ['f', 'g', 'h'],
      excluded: [],
    });
  });

  it('variables downstream of a loop are endogenous, drivers upstream are exogenous', () => {
    const base = spec('six-variable rework CLD');
    const m = graphModel({
      vars: ['policy', ...base.vars, 'cost'],
      links: [...base.links, ['policy', 'sp', '+'], ['bl', 'cost', '+']],
    });
    const chart = boundaryChart(m, findLoops(m).loops);
    expect(chart.endogenous).toEqual(['bl', 'sp', 'ot', 'fa', 'er', 'pr', 'cost']);
    expect(chart.exogenous).toEqual(['policy']);
  });

  it('is exact even when the loop list is truncated or empty', () => {
    const m = fixture('disconnected components');
    expect(boundaryChart(m, []).endogenous).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('passes the user-listed excluded items through', () => {
    const m = fixture('no loops (DAG)');
    const excluded = [{ id: 'b_weather', name: 'Weather', reason: 'outside the project’s control' }];
    const chart = boundaryChart({ ...m, frame: { ...m.frame, excluded } }, []);
    expect(chart).toEqual({ endogenous: [], exogenous: ['a', 'b', 'c', 'd'], excluded });
  });
});

describe('structuralLeverage', () => {
  it('scores the stock-and-flow population by hand-computed values', () => {
    // loops: births>pop, deaths>pop → loop counts pop 2, births 1, deaths 1 (participation 1, ½, ½).
    // betweenness ×12: pop 4 (rate→deaths, life→births, births→deaths, deaths→births), births 2, deaths 2 → 1, ½, ½.
    // pop is a stock: (1 + 1)/2 · 1.5 = 1.5; births, deaths: (½ + ½)/2 = 0.5; constants 0. Total 2.5.
    const m = fixture('stock-and-flow population');
    const rows = structuralLeverage(m, findLoops(m).loops);
    expect(rows.map((r) => [r.varId, r.score, r.cumulativeShare])).toEqual([
      ['pop', 1.5, 0.6],
      ['births', 0.5, 0.8],
      ['deaths', 0.5, 1],
      ['life', 0, 1],
      ['rate', 0, 1],
    ]);
    expect(rows[0].components).toEqual({ loopCount: 2, participation: 1, betweenness: 1, stock: 1, delay: 0 });
  });

  it('gives the delay bonus to targets of delayed links on loops', () => {
    const m = fixture('six-variable rework CLD'); // delayed links ot→fa and er→bl
    const rows = structuralLeverage(m, findLoops(m).loops);
    const delayed = rows.filter((r) => r.components.delay === 1).map((r) => r.varId);
    expect(delayed.sort()).toEqual(['bl', 'fa']);
  });

  it('covers every variable, sorted by score, with a non-decreasing cumulative share ending at 1', () => {
    for (const f of loopFixtures) {
      const m = graphModel(f.spec);
      const rows = structuralLeverage(m, findLoops(m).loops);
      expect(rows.map((r) => r.varId).sort()).toEqual(m.variables.map((v) => v.id).sort());
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i].score).toBeLessThanOrEqual(rows[i - 1].score);
        expect(rows[i].cumulativeShare).toBeGreaterThanOrEqual(rows[i - 1].cumulativeShare);
      }
      const total = rows.reduce((s, r) => s + r.score, 0);
      if (total > 0) expect(rows[rows.length - 1].cumulativeShare).toBe(1);
      else expect(rows.every((r) => r.cumulativeShare === 0)).toBe(true);
    }
  });
});
