import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Model } from '../schema/model.ts';
import { graphModel, type LinkSpec } from '../../test/fixtures/graph/build.ts';
import { findLoops, loopKey } from './index.ts';

/** Mixed-case ids with '_' and '-' so JS string order differs from insertion and numeric order. */
const ID_POOL = ['q', 'a', 'm', 'v_2', 'v_10', 'Z', 'k-1', 'b_b'];

/** Random directed graphs with ≤ 8 variables, self-links allowed, at most one link per ordered pair. */
const graphArb = fc.integer({ min: 1, max: 8 }).chain((n) =>
  fc
    .uniqueArray(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.constantFrom('+' as const, '-' as const), fc.boolean()), {
      selector: ([from, to]) => `${from}>${to}`,
      maxLength: n * n,
    })
    .map((edges) =>
      graphModel({
        vars: ID_POOL.slice(0, n),
        links: edges.map(([f, t, p, d]): LinkSpec => [ID_POOL[f], ID_POOL[t], p, d ? 'delay' : undefined]),
      }),
    ),
);

/** Independent oracle: DFS from each start s through vertices with larger ids only, so each cycle is counted once. */
function bruteForceKeys(model: Model): string[] {
  const succ = new Map(model.variables.map((v) => [v.id, model.links.filter((l) => l.from === v.id).map((l) => l.to)]));
  const keys: string[] = [];
  for (const { id: s } of model.variables) {
    const dfs = (v: string, path: string[]) => {
      for (const w of succ.get(v) ?? []) {
        if (w === s) keys.push(path.join('>'));
        else if (w > s && !path.includes(w)) dfs(w, [...path, w]);
      }
    };
    dfs(s, [s]);
  }
  return keys.sort();
}

describe('findLoops properties', () => {
  it('(a) flipping one link flips the R/B type of every loop through it and no other', () => {
    fc.assert(
      fc.property(
        graphArb.filter((m) => m.links.length > 0),
        fc.nat(),
        (model, pick) => {
          const flipped = model.links[pick % model.links.length];
          const flippedModel: Model = {
            ...model,
            links: model.links.map((l) => (l === flipped ? { ...l, polarity: l.polarity === '+' ? '-' : '+' } : l)),
          };
          const before = findLoops(model, { cap: Infinity }).loops;
          const after = findLoops(flippedModel, { cap: Infinity }).loops;
          expect(after.map((l) => l.key)).toEqual(before.map((l) => l.key));
          before.forEach((loop, i) => {
            const through = loop.linkIds.includes(flipped.id);
            const expected = through ? (loop.type === 'R' ? 'B' : 'R') : loop.type;
            expect(after[i].type).toBe(expected);
          });
        },
      ),
      { numRuns: 300 },
    );
  });

  it('(b) finds exactly the cycles of a brute-force DFS enumeration (graphs ≤ 8 variables)', () => {
    fc.assert(
      fc.property(graphArb, (model) => {
        const found = findLoops(model, { cap: Infinity });
        const oracle = bruteForceKeys(model);
        expect(found.loops).toHaveLength(oracle.length);
        expect(found.loops.map((l) => l.key).sort()).toEqual(oracle);
        expect(found.truncated).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it('(c) keys are rotation-invariant and start at the smallest id', () => {
    fc.assert(
      fc.property(graphArb, (model) => {
        for (const loop of findLoops(model, { cap: Infinity }).loops) {
          for (let r = 0; r < loop.length; r++) {
            const rotated = [...loop.varIds.slice(r), ...loop.varIds.slice(0, r)];
            expect(loopKey(rotated)).toBe(loop.key);
          }
          expect(loop.varIds.every((id) => loop.varIds[0] <= id)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('results do not depend on the storage order of variables and links', () => {
    fc.assert(
      fc.property(
        graphArb.chain((m) =>
          fc.tuple(
            fc.constant(m),
            fc.shuffledSubarray(m.variables, { minLength: m.variables.length }),
            fc.shuffledSubarray(m.links, { minLength: m.links.length }),
          ),
        ),
        ([model, variables, links]) => {
          expect(findLoops({ ...model, variables, links }, { cap: Infinity })).toEqual(
            findLoops(model, { cap: Infinity }),
          );
        },
      ),
      { numRuns: 150 },
    );
  });

  it('a capped result is a subset of the full set, truncated iff more loops exist, sorted by length then key', () => {
    fc.assert(
      fc.property(graphArb, fc.nat(12), (model, cap) => {
        const all = findLoops(model, { cap: Infinity }).loops;
        const capped = findLoops(model, { cap });
        const keys = new Set(all.map((l) => l.key));
        expect(capped.loops).toHaveLength(Math.min(cap, all.length));
        expect(capped.loops.every((l) => keys.has(l.key))).toBe(true);
        expect(capped.truncated).toBe(all.length > cap);
        expect(capped.reason).toBe(all.length > cap ? 'cap' : undefined);
        for (let i = 1; i < capped.loops.length; i++) {
          const [p, c] = [capped.loops[i - 1], capped.loops[i]];
          expect(p.length < c.length || (p.length === c.length && p.key < c.key)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
