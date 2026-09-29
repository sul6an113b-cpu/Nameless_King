import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { ArchetypeCandidate } from '../contracts.ts';
import type { ArchetypeId, Model } from '../schema/model.ts';
import { archetypeFixtures, unrelatedGraphs } from '../../test/fixtures/graph/archetypes.fixtures.ts';
import { graphModel, type LinkSpec } from '../../test/fixtures/graph/build.ts';
import { loopFixtures } from '../../test/fixtures/graph/loops.fixtures.ts';
import { randomGraph, sectorGraph } from '../../test/fixtures/graph/generators.ts';
import { findLoops, matchArchetypes, STRONG_ARCHETYPE_SCORE } from './index.ts';

const match = (m: Model): ArchetypeCandidate[] => matchArchetypes(m, findLoops(m).loops);

/** The variable whose sign conventions a pattern reads (for the renaming-invariance test). */
const PIVOT: Record<ArchetypeId, string> = {
  'limits-to-growth': 'state',
  'fixes-that-fail': 'problem',
  'shifting-the-burden': 'problem',
  'eroding-goals': 'gap',
  escalation: 'relativePosition',
  'success-to-the-successful': 'allocation',
  'tragedy-of-the-commons': 'totalActivity',
  'growth-and-underinvestment': 'state',
};

/** Rename a variable to its opposite: every link into or out of it changes sign (self-links keep theirs). */
function negate(m: Model, id: string): Model {
  const flip = { '+': '-', '-': '+', '?': '?' } as const;
  return {
    ...m,
    links: m.links.map((l) => ((l.from === id) !== (l.to === id) ? { ...l, polarity: flip[l.polarity] } : l)),
  };
}

function expectWellFormed(m: Model, candidates: ArchetypeCandidate[]) {
  const loopKeys = new Set(findLoops(m).loops.map((l) => l.key));
  const varIds = new Set(m.variables.map((v) => v.id));
  expect(candidates.length).toBeLessThanOrEqual(50);
  candidates.forEach((c, i) => {
    expect(c.score).toBeGreaterThan(0);
    expect(c.score).toBeLessThanOrEqual(1);
    if (i > 0) expect(c.score).toBeLessThanOrEqual(candidates[i - 1].score);
    expect(c.loopKeys.length).toBeGreaterThan(0);
    for (const key of c.loopKeys) expect(loopKeys.has(key)).toBe(true);
    const roleVars = Object.values(c.roles);
    for (const id of roleVars) expect(varIds.has(id)).toBe(true);
    expect(new Set(roleVars).size).toBe(roleVars.length);
    expect(c.explanation).toMatch(/^[^.]+\.$/); // one sentence
  });
}

describe('matchArchetypes on the eight minimal archetype CLDs', () => {
  it('covers all eight archetypes', () => {
    expect(new Set(archetypeFixtures.map((f) => f.archetypeId)).size).toBe(8);
  });

  for (const f of archetypeFixtures) {
    describe(f.archetypeId, () => {
      const m = graphModel(f.spec, f.archetypeId);

      it('is the top, strong candidate with the expected loops and roles', () => {
        const [top] = match(m);
        expect(top.archetypeId).toBe(f.archetypeId);
        expect(top.score).toBeGreaterThanOrEqual(STRONG_ARCHETYPE_SCORE);
        expect(top.loopKeys).toEqual(f.loopKeys);
        expect(top.roles).toEqual(f.roles);
      });

      it('no other archetype is a strong candidate', () => {
        const others = match(m).filter((c) => c.archetypeId !== f.archetypeId);
        for (const c of others) expect(c.score).toBeLessThan(STRONG_ARCHETYPE_SCORE);
      });

      it('candidates are well formed', () => {
        expectWellFormed(m, match(m));
      });

      it('naming the pivot variable the opposite way does not change the match', () => {
        const [top] = match(negate(m, f.roles[PIVOT[f.archetypeId]]));
        const [original] = match(m);
        expect(top).toEqual(original);
      });
    });
  }

  it('explains the match in one sentence that names the variables', () => {
    const f = archetypeFixtures.find((x) => x.archetypeId === 'fixes-that-fail');
    const [top] = match(graphModel(f?.spec ?? { vars: [], links: [] }));
    expect(top.explanation).toBe(
      'The balancing loop through the fix "Fix" relieves "Problem symptom", but the reinforcing loop through "Unintended consequences" feeds the problem back after a delay.',
    );
  });

  it('down-weights a pattern that is part of a larger matched structure', () => {
    const f = archetypeFixtures.find((x) => x.archetypeId === 'shifting-the-burden');
    const candidates = match(graphModel(f?.spec ?? { vars: [], links: [] }));
    const component = candidates.find((c) => c.archetypeId === 'fixes-that-fail');
    expect(component?.explanation).toContain('part of a larger Shifting the Burden structure');
    expect(component?.score).toBeLessThan(candidates[0].score);
  });
});

describe('matchArchetypes on unrelated graphs', () => {
  for (const g of unrelatedGraphs) {
    it(`${g.name}: no strong candidate`, () => {
      const m = graphModel(g.spec);
      const candidates = match(m);
      expectWellFormed(m, candidates);
      for (const c of candidates) expect(c.score).toBeLessThan(STRONG_ARCHETYPE_SCORE);
    });
  }

  it('graphs without shared loop structure produce no candidates at all', () => {
    for (const name of ['chain without loops', 'single reinforcing loop', 'two disconnected loops']) {
      const g = unrelatedGraphs.find((x) => x.name === name);
      expect(match(graphModel(g?.spec ?? { vars: [], links: [] }))).toEqual([]);
    }
  });

  it('ignores loops of unknown (U) type', () => {
    const lg = archetypeFixtures[0];
    const unknown = graphModel({ ...lg.spec, links: lg.spec.links.map(([a, b, , d]): LinkSpec => [a, b, '?', d]) });
    expect(match(unknown)).toEqual([]);
  });
});

describe('matchArchetypes robustness', () => {
  it('is well formed and independent of storage order on random graphs', () => {
    const ids = ['p', 'q', 'r', 's', 't', 'u'];
    const arb = fc
      .uniqueArray(fc.tuple(fc.nat(5), fc.nat(5), fc.constantFrom('+' as const, '-' as const), fc.boolean()), {
        selector: ([a, b]) => `${a}>${b}`,
        maxLength: 14,
      })
      .map((edges) =>
        graphModel({
          vars: ids,
          links: edges.map(([a, b, p, d]): LinkSpec => [ids[a], ids[b], p, d ? 'delay' : undefined]),
        }),
      )
      .chain((m) => fc.tuple(fc.constant(m), fc.shuffledSubarray(m.links, { minLength: m.links.length })));
    fc.assert(
      fc.property(arb, ([m, shuffledLinks]) => {
        const candidates = match(m);
        expectWellFormed(m, candidates);
        expect(match({ ...m, links: shuffledLinks, variables: [...m.variables].reverse() })).toEqual(candidates);
      }),
      { numRuns: 200 },
    );
  });

  it('stays bounded on large graphs', () => {
    for (const m of [randomGraph(150, 4, 1), sectorGraph(150, 5, 30, 9)]) {
      const candidates = match(m);
      expectWellFormed(m, candidates);
    }
  });

  it('proposes nothing for the loop fixtures that are not archetypes', () => {
    for (const name of ['no loops (DAG)', 'self-loops', 'key rotation', 'disconnected components']) {
      const f = loopFixtures.find((x) => x.name === name);
      expect(match(graphModel(f?.spec ?? { vars: [], links: [] }))).toEqual([]);
    }
  });
});
