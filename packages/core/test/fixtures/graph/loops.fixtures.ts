/**
 * Hand-verified loop fixtures. For each graph, `expected` lists every elementary cycle (loop key per SPEC §3:
 * rotated so the smallest id comes first, joined by '>') and its type, in findLoops order (length, then key).
 * The derivation of each cycle set is written next to the fixture.
 */
import type { GraphSpec } from './build.ts';

export interface LoopFixture {
  name: string;
  spec: GraphSpec;
  expected: { key: string; type: 'R' | 'B' | 'U'; hasDelay?: boolean }[];
}

export const loopFixtures: LoopFixture[] = [
  {
    // A DAG: a→b→c→d plus the shortcut a→c. No vertex can reach itself.
    name: 'no loops (DAG)',
    spec: {
      vars: ['a', 'b', 'c', 'd'],
      links: [
        ['a', 'b', '+'],
        ['b', 'c', '+'],
        ['a', 'c', '-'],
        ['c', 'd', '+'],
      ],
    },
    expected: [],
  },
  {
    // Self-links a→a (+), b→b (−), c→c (?) are loops of length 1; a⇄b (+, −) is the only longer cycle.
    name: 'self-loops',
    spec: {
      vars: ['a', 'b', 'c'],
      links: [
        ['a', 'a', '+'],
        ['b', 'b', '-'],
        ['c', 'c', '?'],
        ['a', 'b', '+'],
        ['b', 'a', '-'],
      ],
    },
    expected: [
      { key: 'a', type: 'R' },
      { key: 'b', type: 'B' },
      { key: 'c', type: 'U' },
      { key: 'a>b', type: 'B' },
    ],
  },
  {
    // Nested loops: the outer cycle a→b→c→a (+, +, −) contains the chord b→a, which closes the inner a⇄b (+, +).
    name: 'nested loops',
    spec: {
      vars: ['a', 'b', 'c'],
      links: [
        ['a', 'b', '+'],
        ['b', 'c', '+'],
        ['c', 'a', '-'],
        ['b', 'a', '+'],
      ],
    },
    expected: [
      { key: 'a>b', type: 'R' },
      { key: 'a>b>c', type: 'B' },
    ],
  },
  {
    // Figure-eight: two cycles share only x. x⇄a (+, +) is R; x→b→c→x (+, −, +) is B and rotates to start at b.
    // Traversing both lobes would revisit x, so there is no third (elementary) cycle.
    name: 'figure-eight',
    spec: {
      vars: ['x', 'a', 'b', 'c'],
      links: [
        ['x', 'a', '+'],
        ['a', 'x', '+'],
        ['x', 'b', '+'],
        ['b', 'c', '-'],
        ['c', 'x', '+'],
      ],
    },
    expected: [
      { key: 'a>x', type: 'R' },
      { key: 'b>c>x', type: 'B' },
    ],
  },
  {
    // Disconnected components: a⇄b (R), c→d→e→c with one − (B), an isolated f and a chain g→h (no loops).
    name: 'disconnected components',
    spec: {
      vars: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      links: [
        ['a', 'b', '+'],
        ['b', 'a', '+'],
        ['c', 'd', '+'],
        ['d', 'e', '+'],
        ['e', 'c', '-'],
        ['g', 'h', '+'],
      ],
    },
    expected: [
      { key: 'a>b', type: 'R' },
      { key: 'c>d>e', type: 'B' },
    ],
  },
  {
    // Complete digraph on 3 vertices: three 2-cycles and the two orientations of the triangle.
    // a⇄b: + − → B · a⇄c: + + → R · b⇄c: − − → R · a→b→c→a: + − + → B · a→c→b→a: + − − → R.
    name: 'complete digraph K3',
    spec: {
      vars: ['a', 'b', 'c'],
      links: [
        ['a', 'b', '+'],
        ['b', 'a', '-'],
        ['a', 'c', '+'],
        ['c', 'a', '+'],
        ['b', 'c', '-'],
        ['c', 'b', '-'],
      ],
    },
    expected: [
      { key: 'a>b', type: 'B' },
      { key: 'a>c', type: 'R' },
      { key: 'b>c', type: 'R' },
      { key: 'a>b>c', type: 'B' },
      { key: 'a>c>b', type: 'R' },
    ],
  },
  {
    // Rotation: drawn z→m→b→z; the smallest id is b, so the key is b>z>m (one − → B).
    name: 'key rotation',
    spec: {
      vars: ['z', 'm', 'b'],
      links: [
        ['z', 'm', '+'],
        ['m', 'b', '-'],
        ['b', 'z', '+'],
      ],
    },
    expected: [{ key: 'b>z>m', type: 'B' }],
  },
  {
    // Unknown polarity and delay: a→b (?) makes the loop U; the delay mark on b→a sets hasDelay.
    name: 'unknown polarity and delay',
    spec: {
      vars: ['a', 'b'],
      links: [
        ['a', 'b', '?'],
        ['b', 'a', '+', 'delay'],
      ],
    },
    expected: [{ key: 'a>b', type: 'U', hasDelay: true }],
  },
  {
    // Stock-and-flow population: births (inflow, +) and deaths (outflow, −) with their info links from pop.
    // pop→births→pop: + + → R · pop→deaths→pop: + − → B. Constants rate and life are on no loop.
    name: 'stock-and-flow population',
    spec: {
      vars: [
        { id: 'pop', kind: 'stock', equation: '100' },
        { id: 'births', kind: 'flow', equation: 'pop * rate', flow: { from: null, to: 'pop' } },
        { id: 'deaths', kind: 'flow', equation: 'pop / life', flow: { from: 'pop', to: null } },
        { id: 'rate', kind: 'constant', equation: '0.05' },
        { id: 'life', kind: 'constant', equation: '20' },
      ],
      links: [
        ['pop', 'births', '+'],
        ['rate', 'births', '+'],
        ['births', 'pop', '+'],
        ['pop', 'deaths', '+'],
        ['life', 'deaths', '-'],
        ['deaths', 'pop', '-'],
      ],
    },
    expected: [
      { key: 'births>pop', type: 'R' },
      { key: 'deaths>pop', type: 'B' },
    ],
  },
  {
    // Six-variable rework CLD. Every cycle passes bl (the only target of er and pr); from bl the paths are
    // bl→sp→ot→pr→bl (+ + + − → B), bl→sp→ot→fa→er→bl (all + → R), bl→sp→ot→fa→pr→bl (+ + + − − → R).
    name: 'six-variable rework CLD',
    spec: {
      vars: ['bl', 'sp', 'ot', 'fa', 'er', 'pr'],
      links: [
        ['bl', 'sp', '+'],
        ['sp', 'ot', '+'],
        ['ot', 'pr', '+'],
        ['pr', 'bl', '-'],
        ['ot', 'fa', '+', 'delay'],
        ['fa', 'er', '+'],
        ['er', 'bl', '+', 'delay'],
        ['fa', 'pr', '-'],
      ],
    },
    expected: [
      { key: 'bl>sp>ot>pr', type: 'B', hasDelay: false },
      { key: 'bl>sp>ot>fa>er', type: 'R', hasDelay: true },
      { key: 'bl>sp>ot>fa>pr', type: 'R', hasDelay: true },
    ],
  },
];
