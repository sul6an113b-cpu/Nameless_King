import { describe, expect, it } from 'vitest';
import { computeLayout } from './layout.ts';
import { runLayout } from './layoutClient.ts';
import { freeSpot } from '../canvas/placement.ts';

const node = (id: string) => ({ id, width: 120, height: 36 });
const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < 120 && Math.abs(a.y - b.y) < 36;

describe('auto-layout (dagre)', () => {
  it('lays out a cyclic graph (feedback loops) without overlaps', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(node);
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'd' }, // self-loop
      { from: 'b', to: 'a' }, // opposing pair
    ];
    const pos = computeLayout(nodes, edges);
    expect(Object.keys(pos).sort()).toEqual(['a', 'b', 'c', 'd']);
    const ps = Object.values(pos);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) expect(overlaps(ps[i]!, ps[j]!)).toBe(false);
  });

  it('left-to-right: a chain goes from left to right', () => {
    const pos = computeLayout(['a', 'b', 'c'].map(node), [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
    ]);
    expect(pos.a!.x).toBeLessThan(pos.b!.x);
    expect(pos.b!.x).toBeLessThan(pos.c!.x);
  });

  it('ignores edges to unknown nodes and is deterministic', () => {
    const nodes = ['a', 'b'].map(node);
    const edges = [
      { from: 'a', to: 'b' },
      { from: 'a', to: 'zzz' },
    ];
    expect(computeLayout(nodes, edges)).toEqual(computeLayout(nodes, edges));
  });

  it('runLayout falls back to the main thread where Web Workers are unavailable', async () => {
    const pos = await runLayout(['a', 'b'].map(node), [{ from: 'a', to: 'b' }]);
    expect(pos.a!.x).toBeLessThan(pos.b!.x);
  });

  it('lays out 150 nodes quickly enough for the main-thread fallback', () => {
    const nodes = Array.from({ length: 150 }, (_, i) => node(`n${i}`));
    const edges = nodes.map((n, i) => ({ from: n.id, to: `n${(i * 7 + 3) % 150}` }));
    const t0 = performance.now();
    computeLayout(nodes, edges);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe('free-spot placement for new nodes', () => {
  it('returns the wanted point when it is free', () => {
    expect(freeSpot({ x: 0, y: 0 }, [{ x: 500, y: 500 }])).toEqual({ x: 0, y: 0 });
  });

  it('never stacks: repeated adds at the same point land on distinct, non-overlapping spots', () => {
    const taken: { x: number; y: number }[] = [];
    for (let i = 0; i < 12; i++) taken.push(freeSpot({ x: 0, y: 0 }, taken));
    for (let i = 0; i < taken.length; i++)
      for (let j = i + 1; j < taken.length; j++) expect(overlaps(taken[i]!, taken[j]!)).toBe(false);
  });
});
