/**
 * Behaviour-over-time shape classifiers (SPEC §11 row 8). Small, geometric predicates over one series sampled at
 * equal time steps. The shapes follow the fundamental modes in Sterman (2000, ch. 4: exponential growth, goal
 * seeking, oscillation, S-shaped growth, overshoot and collapse) plus the archetype signatures in Senge (1990) and
 * Kim (1992). Thresholds are deliberately loose (they judge the *pattern*, not the numbers) and are documented next
 * to each rule and in docs/decisions/methodologist.md.
 *
 * Shapes are not mutually exclusive: e.g. exponential growth is also escalation, and logistic growth also departs
 * from an unstable equilibrium (divergence). Each archetype test checks only its own signature shape.
 */
import type { ShapeId } from './types.ts';

export interface ShapeInfo {
  id: ShapeId;
  name: string;
  description: string;
}

export const SHAPES: Readonly<Record<ShapeId, ShapeInfo>> = {
  'exponential-growth': {
    id: 'exponential-growth',
    name: 'Exponential growth',
    description:
      'Rises ever faster: each third of the horizon adds more than the previous one (dominant reinforcing loop).',
  },
  'goal-seeking': {
    id: 'goal-seeking',
    name: 'Goal seeking',
    description:
      'Moves toward a level quickly at first, then ever more slowly as the gap closes (dominant balancing loop).',
  },
  's-shaped': {
    id: 's-shaped',
    name: 'S-shaped growth',
    description: 'Slow start, fastest change in mid-course, then levels off near a limit (reinforcing then balancing).',
  },
  'overshoot-and-collapse': {
    id: 'overshoot-and-collapse',
    name: 'Overshoot and collapse',
    description: 'Rises to a peak, then falls back by at least half of the rise without a comparable recovery.',
  },
  oscillation: {
    id: 'oscillation',
    name: 'Oscillation',
    description: 'Swings up and down repeatedly (at least three turning points; balancing loop with delay).',
  },
  'better-before-worse': {
    id: 'better-before-worse',
    name: 'Better before worse',
    description:
      'First moves one way, then reverses and ends clearly beyond its starting level on the other side ' +
      '(the geometric pattern is the same whichever direction counts as “better”).',
  },
  escalation: {
    id: 'escalation',
    name: 'Escalation',
    description: 'Keeps rising without levelling off, linearly or faster (two parties driving each other up).',
  },
  divergence: {
    id: 'divergence',
    name: 'Divergence',
    description: 'Starts near a balance, departs slowly, then ever faster, and moves far from where it started.',
  },
  'growth-then-stagnation': {
    id: 'growth-then-stagnation',
    name: 'Growth then stagnation',
    description: 'Grows substantially, then stalls: the last third of the horizon adds little or loses a little.',
  },
  'goal-erosion': {
    id: 'goal-erosion',
    name: 'Goal erosion',
    description: 'Drifts down steadily without levelling off (a goal adjusting to performance instead of the reverse).',
  },
};

export const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

export interface ShapeVerdict {
  match: boolean;
  reason: string;
}

// ── helpers ────────────────────────────────────────────────────────────────

interface Series {
  u: number[];
  n: number;
  /** range (max − min) of the trimmed series */
  range: number;
  /** total change u[n−1] − u[0] */
  change: number;
}

/** A series whose range is below this fraction of its magnitude counts as flat (no pattern worth naming). */
const FLAT = 1e-4;

/**
 * Drop a leading constant segment (e.g. a model at equilibrium until a STEP), keeping its last point as the start,
 * so the shape is judged from the moment the behaviour begins.
 */
function prepare(values: ArrayLike<number>): Series | string {
  const v = Array.from(values);
  if (v.length < 5) return 'needs at least 5 points';
  if (!v.every(Number.isFinite)) return 'series contains NaN or infinite values';
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const full = hi - lo;
  if (full <= FLAT * Math.max(Math.abs(hi), Math.abs(lo), 1e-300)) return 'series is flat';
  let i0 = 0;
  while (i0 < v.length - 1 && Math.abs(v[i0 + 1] - v[0]) <= 0.01 * full) i0++;
  const u = v.slice(i0);
  if (u.length < 5) return 'the series only changes in its last few points';
  return { u, n: u.length, range: Math.max(...u) - Math.min(...u), change: u[u.length - 1] - u[0] };
}

/** Net change in each third of the series. */
function thirds(s: Series): [number, number, number] {
  const a = Math.round((s.n - 1) / 3);
  const b = Math.round((2 * (s.n - 1)) / 3);
  return [s.u[a] - s.u[0], s.u[b] - s.u[a], s.u[s.n - 1] - s.u[b]];
}

/** True if the series never moves against `dir` by more than `tol`·range (dir = +1 rising, −1 falling). */
function monotone(u: number[], dir: 1 | -1, tol: number, range: number): boolean {
  let best = u[0] * dir;
  for (const x of u) {
    const y = x * dir;
    if (y < best - tol * range) return false;
    best = Math.max(best, y);
  }
  return true;
}

/** Per-step changes. */
const steps = (u: number[]): number[] => u.slice(1).map((x, i) => x - u[i]);

/** Average |slope| over the first or last `frac` of the series. */
function edgeSlope(u: number[], frac: number, end: 'start' | 'end'): number {
  const m = Math.max(1, Math.floor((u.length - 1) * frac));
  return end === 'start' ? Math.abs(u[m] - u[0]) / m : Math.abs(u[u.length - 1] - u[u.length - 1 - m]) / m;
}

function argMaxAbs(d: number[]): number {
  let k = 0;
  for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[k])) k = i;
  return k;
}

/** Turning points with a hysteresis of `h` (zig-zag filter): alternating local extrema that move by ≥ h. */
function turningPoints(u: number[], h: number): number {
  let count = 0;
  let dir = 0; // +1 rising, −1 falling, 0 not yet known
  let hi = u[0];
  let lo = u[0];
  for (const x of u) {
    hi = Math.max(hi, x);
    lo = Math.min(lo, x);
    if (dir === 0) {
      if (x < hi - h) [dir, lo] = [-1, x];
      else if (x > lo + h) [dir, hi] = [1, x];
    } else if (dir === 1 && x < hi - h) {
      count++; // a peak
      [dir, lo] = [-1, x];
    } else if (dir === -1 && x > lo + h) {
      count++; // a trough
      [dir, hi] = [1, x];
    }
  }
  return count;
}

const ok = (reason: string): ShapeVerdict => ({ match: true, reason });
const no = (reason: string): ShapeVerdict => ({ match: false, reason });

// ── predicates ─────────────────────────────────────────────────────────────

type Rule = (s: Series) => ShapeVerdict;

const rules: Record<ShapeId, Rule> = {
  'exponential-growth': (s) => {
    const [s1, s2, s3] = thirds(s);
    if (!(s.change > 0)) return no('does not rise overall');
    if (!monotone(s.u, 1, 0.01, s.range)) return no('not monotonically rising');
    if (!(s2 >= 1.1 * s1 && s3 >= 1.1 * s2))
      return no(`growth does not accelerate (thirds ${fmt(s1)}, ${fmt(s2)}, ${fmt(s3)})`);
    return ok('rises monotonically and each third adds ≥ 10 % more than the previous one');
  },

  'goal-seeking': (s) => {
    const dir = s.change >= 0 ? 1 : -1;
    if (Math.abs(s.change) < 0.8 * s.range) return no('does not move mostly in one direction');
    if (!monotone(s.u, dir, 0.01, s.range)) return no('not monotone');
    const d = steps(s.u);
    const peak = argMaxAbs(d);
    if (peak > 0.15 * d.length) return no('fastest change is not at the start');
    if (edgeSlope(s.u, 0.1, 'end') > 0.3 * Math.abs(d[peak])) return no('has not levelled off by the end');
    return ok('moves monotonically, fastest at the start, and levels off');
  },

  's-shaped': (s) => {
    const dir = s.change >= 0 ? 1 : -1;
    if (Math.abs(s.change) < 0.9 * s.range) return no('does not move mostly in one direction');
    if (!monotone(s.u, dir, 0.01, s.range)) return no('not monotone');
    const d = steps(s.u);
    const peak = argMaxAbs(d);
    const max = Math.abs(d[peak]);
    if (peak < 0.1 * d.length || peak > 0.9 * d.length) return no('fastest change is not in mid-course');
    if (edgeSlope(s.u, 0.05, 'start') > 0.5 * max) return no('does not start slowly');
    if (edgeSlope(s.u, 0.1, 'end') > 0.3 * max) return no('has not levelled off by the end');
    return ok('slow start, fastest change mid-course, levels off');
  },

  'overshoot-and-collapse': (s) => {
    let p = 0;
    for (let i = 1; i < s.n; i++) if (s.u[i] > s.u[p]) p = i;
    const rise = s.u[p] - s.u[0];
    if (p < 0.05 * s.n || p > 0.9 * s.n) return no('peak is not inside the horizon');
    if (rise < 0.5 * s.range) return no('the rise to the peak is small');
    if (!monotone(s.u.slice(0, p + 1), 1, 0.05, s.range)) return no('does not rise steadily to the peak');
    const fall = s.u[p] - s.u[s.n - 1];
    if (fall < 0.5 * rise) return no('does not fall back by at least half of the rise');
    const tail = s.u.slice(p);
    let m = 0;
    for (let i = 1; i < tail.length; i++) if (tail[i] < tail[m]) m = i;
    const rebound = Math.max(...tail.slice(m)) - tail[m];
    if (rebound > 0.25 * rise) return no('recovers substantially after the collapse (oscillation?)');
    return ok('rises to an interior peak, then loses at least half of the rise without recovering');
  },

  oscillation: (s) => {
    const tp = turningPoints(s.u, 0.1 * s.range);
    return tp >= 3 ? ok(`${tp} turning points`) : no(`only ${tp} turning point(s)`);
  },

  'better-before-worse': (s) => {
    const u0 = s.u[0];
    const first = s.u.find((x) => Math.abs(x - u0) >= 0.05 * s.range);
    if (first === undefined) return no('never moves');
    const dir = first > u0 ? 1 : -1;
    const end = s.u[s.n - 1];
    const extreme = dir > 0 ? Math.max(...s.u) : Math.min(...s.u);
    if (Math.abs(extreme - u0) < 0.1 * s.range) return no('the initial excursion is small');
    if ((end - u0) * dir >= 0) return no('does not end on the other side of its starting level');
    if (Math.abs(end - u0) < 0.1 * s.range) return no('ends only marginally beyond its starting level');
    return ok('moves one way first, then ends clearly beyond the start on the other side');
  },

  escalation: (s) => {
    const [s1, s2, s3] = thirds(s);
    if (!(s.change > 0)) return no('does not rise overall');
    if (!monotone(s.u, 1, 0.01, s.range)) return no('not monotonically rising');
    if (!(s2 >= 0.9 * s1 && s3 >= 0.9 * s2)) return no(`growth slows down (thirds ${fmt(s1)}, ${fmt(s2)}, ${fmt(s3)})`);
    if (s.u[0] > 0 && s.change < 0.5 * s.u[0]) return no('grows by less than half of its initial value');
    return ok('rises monotonically without levelling off');
  },

  divergence: (s) => {
    const dir = s.change >= 0 ? 1 : -1;
    if (Math.abs(s.change) < 0.8 * s.range) return no('does not move away from its start');
    if (!monotone(s.u, dir, 0.02, s.range)) return no('not monotone');
    const early = s.u[Math.floor(0.2 * (s.n - 1))] - s.u[0];
    if (Math.abs(early) > 0.2 * Math.abs(s.change))
      return no('departs quickly from the start (not a slow, self-reinforcing departure)');
    return ok('departs slowly from a near-balanced start, then moves far away');
  },

  'growth-then-stagnation': (s) => {
    let p = 0;
    for (let i = 1; i < s.n; i++) if (s.u[i] > s.u[p]) p = i;
    const rise = s.u[p] - s.u[0];
    if (rise < 0.5 * s.range || rise <= 0) return no('does not grow substantially');
    const [, , s3] = thirds(s);
    if (Math.abs(s3) > 0.15 * rise) return no(`still changing in the last third (${fmt(s3)} vs rise ${fmt(rise)})`);
    if (s.u[s.n - 1] < s.u[0] + 0.6 * rise) return no('falls back too far (collapse, not stagnation)');
    return ok('grows, then changes by ≤ 15 % of the rise in the last third');
  },

  'goal-erosion': (s) => {
    const [, s2, s3] = thirds(s);
    if (!(s.change < 0)) return no('does not decline overall');
    if (!monotone(s.u, -1, 0.01, s.range)) return no('not monotonically declining');
    if (!(Math.abs(s3) >= 0.7 * Math.abs(s2))) return no('decline levels off (goal-seeking, not erosion)');
    if (s.u[0] !== 0 && Math.abs(s.change) < 0.05 * Math.abs(s.u[0]))
      return no('declines by less than 5 % of its initial value');
    return ok('declines steadily without levelling off');
  },
};

function fmt(x: number): string {
  return Number(x.toPrecision(3)).toString();
}

/** Does the series show `shape`? Returns the verdict with a one-line reason (for test messages and the UI). */
export function explainShape(shape: ShapeId, values: ArrayLike<number>): ShapeVerdict {
  const s = prepare(values);
  if (typeof s === 'string') return no(s);
  return rules[shape](s);
}

export function matchesShape(shape: ShapeId, values: ArrayLike<number>): boolean {
  return explainShape(shape, values).match;
}

/** Every shape the series satisfies (possibly none, possibly several). */
export function classifyShape(values: ArrayLike<number>): ShapeId[] {
  const s = prepare(values);
  if (typeof s === 'string') return [];
  return SHAPE_IDS.filter((id) => rules[id](s).match);
}
