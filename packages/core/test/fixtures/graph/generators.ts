/** Deterministic large-graph generators for the performance tests (test-only). */
import type { Model } from '../../../src/schema/model.ts';
import { graphModel, type LinkSpec } from './build.ts';

/** mulberry32 PRNG: small, seeded, good enough for test graphs. */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zero-padded ids so JS string order equals numeric order. */
export const varId = (i: number): string => `v_${String(i).padStart(3, '0')}`;

function build(n: number, links: Map<string, LinkSpec>): Model {
  return graphModel({ vars: Array.from({ length: n }, (_, i) => varId(i)), links: [...links.values()] });
}

function linker(rnd: () => number, links: Map<string, LinkSpec>) {
  return (from: number, to: number) => {
    const key = `${from},${to}`;
    if (from === to || links.has(key)) return;
    links.set(key, [varId(from), varId(to), rnd() < 0.3 ? '-' : '+', rnd() < 0.1 ? 'delay' : undefined]);
  };
}

/** Every variable gets `outDegree` random targets: astronomically many loops for outDegree ≥ 2. */
export function randomGraph(n: number, outDegree: number, seed: number): Model {
  const rnd = mulberry32(seed);
  const links = new Map<string, LinkSpec>();
  const add = linker(rnd, links);
  for (let i = 0; i < n; i++) {
    const before = links.size;
    while (links.size - before < outDegree) add(i, Math.floor(rnd() * n));
  }
  return build(n, links);
}

/**
 * SD-like structure: sectors of `sector` variables, each a ring with one internal chord, chained forward, plus
 * `backLinks` random long feedback links from later to earlier variables.
 */
export function sectorGraph(n: number, sector: number, backLinks: number, seed: number): Model {
  const rnd = mulberry32(seed);
  const links = new Map<string, LinkSpec>();
  const add = linker(rnd, links);
  for (let s = 0; s < n; s += sector) {
    for (let k = 0; k < sector; k++) add(s + k, s + ((k + 1) % sector));
    add(s + 1, s + 3);
    if (s + sector < n) add(s + 2, s + sector);
  }
  for (let k = 0; k < backLinks; k++) {
    const from = Math.floor(rnd() * n);
    add(from, Math.floor(rnd() * from));
  }
  return build(n, links);
}
