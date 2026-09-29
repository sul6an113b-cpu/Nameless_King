/**
 * Reference-mode sketch pad maths: pointer positions → [time, value] points on the model horizon.
 * The stroke is sorted by time, de-duplicated (last value per time bin wins) and thinned to ≤ maxPoints.
 */
export interface Box {
  width: number;
  height: number;
}

export interface Range {
  t0: number;
  t1: number;
  yMin: number;
  yMax: number;
}

/** Pixel (relative to the drawing box) → data coordinates, clamped to the range. */
export function toData(px: number, py: number, box: Box, r: Range): [number, number] {
  if (box.width <= 0 || box.height <= 0) return [r.t0, r.yMin];
  const fx = Math.min(1, Math.max(0, px / box.width));
  const fy = Math.min(1, Math.max(0, py / box.height));
  return [r.t0 + fx * (r.t1 - r.t0), r.yMax - fy * (r.yMax - r.yMin)];
}

/** Data → pixel, for drawing the stroke and saved curves. */
export function toPixel(t: number, v: number, box: Box, r: Range): [number, number] {
  const fx = (t - r.t0) / (r.t1 - r.t0 || 1);
  const fy = (r.yMax - v) / (r.yMax - r.yMin || 1);
  return [fx * box.width, fy * box.height];
}

export function finalizeStroke(raw: [number, number][], r: Range, maxPoints = 200): [number, number][] {
  const bins = maxPoints;
  const span = r.t1 - r.t0;
  if (!(span > 0) || raw.length === 0) return [];
  const byBin = new Map<number, [number, number]>();
  for (const [t, v] of raw) {
    const b = Math.round(((t - r.t0) / span) * (bins - 1));
    byBin.set(b, [r.t0 + (b / (bins - 1)) * span, v]);
  }
  return [...byBin.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}
