/**
 * Graphical (lookup) functions, XMILE §3.1.4 types: `continuous` interpolates and clamps at the ends,
 * `extrapolate` continues the end segments linearly, `discrete` holds each y until the next x.
 */
import type { GraphicalFunction } from '../schema/model.ts';

/** Largest i in [0, n−2] with xs[i] ≤ x (clamped), by binary search. */
function segment(xs: Float64Array, x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function makeGraphical(g: GraphicalFunction): (x: number) => number {
  const xs = Float64Array.from(g.xs);
  const ys = Float64Array.from(g.ys);
  const last = xs.length - 1;
  const lerp = (i: number, x: number) => ys[i] + ((ys[i + 1] - ys[i]) * (x - xs[i])) / (xs[i + 1] - xs[i]);

  switch (g.mode) {
    case 'discrete':
      return (x) => {
        if (Number.isNaN(x)) return NaN;
        if (x >= xs[last]) return ys[last];
        return x <= xs[0] ? ys[0] : ys[segment(xs, x)];
      };
    case 'extrapolate':
      return (x) => lerp(segment(xs, x), x);
    default:
      return (x) => {
        if (Number.isNaN(x)) return NaN;
        if (x <= xs[0]) return ys[0];
        if (x >= xs[last]) return ys[last];
        return lerp(segment(xs, x), x);
      };
  }
}
