import { describe, expect, it } from 'vitest';
import { graphModel, linkId } from '../../test/fixtures/graph/build.ts';
import { loopFixtures } from '../../test/fixtures/graph/loops.fixtures.ts';
import { findLoops, loopKey, loopType } from './index.ts';

const fixture = (name: string) => {
  const f = loopFixtures.find((x) => x.name === name);
  if (!f) throw new Error(`no fixture ${name}`);
  return graphModel(f.spec);
};

describe('findLoops on hand-verified fixtures', () => {
  it('has at least six fixtures covering self-loops, nesting, figure-eight, disconnected graphs and zero loops', () => {
    expect(loopFixtures.length).toBeGreaterThanOrEqual(6);
  });

  for (const f of loopFixtures) {
    it(`${f.name}: exact cycle set, types and order`, () => {
      const result = findLoops(graphModel(f.spec));
      expect(result.truncated).toBe(false);
      expect(result.reason).toBeUndefined();
      expect(result.loops.map((l) => ({ key: l.key, type: l.type }))).toEqual(
        f.expected.map(({ key, type }) => ({ key, type })),
      );
      f.expected.forEach((e, i) => {
        if (e.hasDelay !== undefined) expect(result.loops[i].hasDelay).toBe(e.hasDelay);
      });
    });

    it(`${f.name}: every loop is internally consistent`, () => {
      for (const loop of findLoops(graphModel(f.spec)).loops) {
        expect(loop.length).toBe(loop.varIds.length);
        expect(loop.linkIds).toHaveLength(loop.length);
        expect(loop.key).toBe(loop.varIds.join('>'));
        expect(loop.key).toBe(loopKey(loop.varIds));
        loop.varIds.forEach((from, i) => expect(loop.linkIds[i]).toBe(linkId(from, loop.varIds[(i + 1) % loop.length])));
      }
    });
  }

  it('reports self-loops with their single link', () => {
    const [a] = findLoops(fixture('self-loops')).loops;
    expect(a).toEqual({ key: 'a', varIds: ['a'], linkIds: ['l_a_a'], type: 'R', length: 1, hasDelay: false });
  });

  it('rotates varIds and linkIds so the smallest id comes first', () => {
    const [loop] = findLoops(fixture('key rotation')).loops;
    expect(loop.varIds).toEqual(['b', 'z', 'm']);
    expect(loop.linkIds).toEqual(['l_b_z', 'l_z_m', 'l_m_b']);
  });

  it('finds loops through flow→stock links of a stock-and-flow model', () => {
    const loops = findLoops(fixture('stock-and-flow population')).loops;
    expect(loops.map((l) => l.linkIds)).toEqual([
      ['l_births_pop', 'l_pop_births'],
      ['l_deaths_pop', 'l_pop_deaths'],
    ]);
  });
});

describe('cap and truncation', () => {
  const k3 = () => fixture('complete digraph K3'); // 5 loops

  it('does not truncate when the loop count equals the cap', () => {
    expect(findLoops(k3(), { cap: 5 })).toMatchObject({ truncated: false, cap: 5 });
  });

  it('stops at the cap and reports truncated with reason "cap"', () => {
    const result = findLoops(k3(), { cap: 3 });
    expect(result).toMatchObject({ truncated: true, reason: 'cap', cap: 3 });
    // Search order groups loops by their smallest variable: all loops through a are found before b>c.
    expect(result.loops.map((l) => l.key)).toEqual(['a>b', 'a>c', 'a>b>c']);
  });

  it('cap 0 returns no loops but reports truncation', () => {
    expect(findLoops(k3(), { cap: 0 })).toMatchObject({ loops: [], truncated: true, reason: 'cap' });
    expect(findLoops(fixture('no loops (DAG)'), { cap: 0 })).toMatchObject({ loops: [], truncated: false });
  });

  it('defaults to model.settings.loopCap (1,000)', () => {
    const m = k3();
    expect(findLoops(m).cap).toBe(1000);
    expect(findLoops({ ...m, settings: { ...m.settings, loopCap: 2 } })).toMatchObject({ truncated: true, cap: 2 });
  });

  it('self-loops count toward the cap', () => {
    const result = findLoops(fixture('self-loops'), { cap: 2 });
    expect(result.loops.map((l) => l.key)).toEqual(['a', 'b']);
    expect(result.truncated).toBe(true);
  });
});

describe('loopType', () => {
  const m = fixture('complete digraph K3');

  it('even number of − links → R, odd → B', () => {
    expect(loopType(m, ['l_a_c', 'l_c_a'])).toBe('R');
    expect(loopType(m, ['l_b_c', 'l_c_b'])).toBe('R');
    expect(loopType(m, ['l_a_b', 'l_b_a'])).toBe('B');
    expect(loopType(m, ['l_a_b', 'l_b_c', 'l_c_a'])).toBe('B');
  });

  it('any ? link → U', () => {
    expect(loopType(fixture('unknown polarity and delay'), ['l_a_b', 'l_b_a'])).toBe('U');
  });

  it('agrees with findLoops', () => {
    for (const loop of findLoops(m).loops) expect(loopType(m, loop.linkIds)).toBe(loop.type);
  });

  it('throws on a link id that is not in the model', () => {
    expect(() => loopType(m, ['l_missing'])).toThrow(/l_missing/);
  });
});

describe('loopKey', () => {
  it('rotates to the smallest id (JS string order) and joins with >', () => {
    expect(loopKey(['z', 'm', 'b'])).toBe('b>z>m');
    expect(loopKey(['v_2', 'v_10'])).toBe('v_10>v_2');
    expect(loopKey(['a'])).toBe('a');
  });
});
