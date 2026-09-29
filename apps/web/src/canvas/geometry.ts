/**
 * Edge geometry for the CLD and SFD canvases (pure; unit-tested). Edges are "floating": they run between
 * node boundaries rather than fixed handles. Causal links are quadratic curves bent to one side, so A→B and
 * B→A never overlap; a self-link is a loop over the node.
 */
export interface Pt {
  x: number;
  y: number;
}

export type Shape = 'rect' | 'circle';

/** Node box in flow coordinates (x, y = top-left). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: Shape;
}

export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

const len = (p: Pt) => Math.hypot(p.x, p.y);
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const unit = (p: Pt): Pt => {
  const l = len(p);
  return l > 1e-9 ? { x: p.x / l, y: p.y / l } : { x: 1, y: 0 };
};
/** Left-hand normal of a direction. */
const normal = (d: Pt): Pt => ({ x: d.y, y: -d.x });

/** Point where the ray from the box centre toward `toward` leaves the shape, pushed out by `gap`. */
export function boundaryPoint(b: Box, toward: Pt, gap = 3): Pt {
  const c = center(b);
  const d = unit(sub(toward, c));
  if (b.shape === 'circle') return add(c, mul(d, Math.min(b.w, b.h) / 2 + gap));
  const hw = b.w / 2;
  const hh = b.h / 2;
  const tx = Math.abs(d.x) > 1e-9 ? hw / Math.abs(d.x) : Infinity;
  const ty = Math.abs(d.y) > 1e-9 ? hh / Math.abs(d.y) : Infinity;
  return add(c, mul(d, Math.min(tx, ty) + gap));
}

export interface EdgeGeometry {
  /** SVG path */
  d: string;
  /** arrow tip and unit direction of travel at the tip */
  tip: Pt;
  dir: Pt;
  /** polarity label anchor (near the arrowhead, on the outside of the bend) */
  label: Pt;
  /** delay mark anchor (mid-curve) and the tangent there */
  mid: Pt;
  midDir: Pt;
}

const quad = (p0: Pt, c: Pt, p2: Pt, t: number): Pt => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * c.x + t ** 2 * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * c.y + t ** 2 * p2.y,
});
const quadTangent = (p0: Pt, c: Pt, p2: Pt, t: number): Pt =>
  unit(add(mul(sub(c, p0), 2 * (1 - t)), mul(sub(p2, c), 2 * t)));

const cubic = (p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * p3.y,
  };
};

const f = (n: number) => Math.round(n * 10) / 10;

/** Curved causal link between two different nodes. `bend` is the sideways offset as a fraction of distance. */
export function curvedEdge(src: Box, tgt: Box, bend = 0.16): EdgeGeometry {
  const a = center(src);
  const b = center(tgt);
  const dist = len(sub(b, a));
  const n = normal(unit(sub(b, a)));
  const offset = Math.min(70, dist * bend);
  const ctrl = add(mul(add(a, b), 0.5), mul(n, offset));
  const p0 = boundaryPoint(src, ctrl);
  const p2 = boundaryPoint(tgt, ctrl, 4);
  const dir = quadTangent(p0, ctrl, p2, 1);
  const labelBase = quad(p0, ctrl, p2, 0.82);
  const mid = quad(p0, ctrl, p2, 0.5);
  return {
    d: `M${f(p0.x)},${f(p0.y)} Q${f(ctrl.x)},${f(ctrl.y)} ${f(p2.x)},${f(p2.y)}`,
    tip: p2,
    dir,
    label: add(labelBase, mul(n, 11)),
    mid,
    midDir: quadTangent(p0, ctrl, p2, 0.5),
  };
}

/** A self-link: a loop leaving the top-right of the node and re-entering at the top-left. */
export function selfLoopEdge(b: Box): EdgeGeometry {
  const c = center(b);
  const top = b.shape === 'circle' ? c.y - Math.min(b.w, b.h) / 2 : b.y;
  const spread = Math.max(10, Math.min(b.w * 0.22, 30));
  const p0 = { x: c.x + spread, y: top - 2 };
  const p3 = { x: c.x - spread, y: top - 4 };
  const c1 = { x: c.x + spread + 34, y: top - 58 };
  const c2 = { x: c.x - spread - 34, y: top - 58 };
  return {
    d: `M${f(p0.x)},${f(p0.y)} C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p3.x)},${f(p3.y)}`,
    tip: p3,
    dir: unit(sub(p3, c2)),
    label: { x: c.x, y: top - 54 },
    mid: cubic(p0, c1, c2, p3, 0.5),
    midDir: { x: -1, y: 0 },
  };
}

export interface PipeGeometry {
  /** the two parallel walls of the pipe */
  walls: [string, string];
  tip: Pt;
  dir: Pt;
}

/** Straight SFD pipe between two node boundaries, drawn as two parallel walls. */
export function pipeEdge(src: Box, tgt: Box, halfWidth = 3): PipeGeometry {
  const p0 = boundaryPoint(src, center(tgt), 0);
  const p1 = boundaryPoint(tgt, center(src), 1);
  const dir = unit(sub(p1, p0));
  const n = mul(normal(dir), halfWidth);
  const wall = (s: 1 | -1) => {
    const a = add(p0, mul(n, s));
    const b = add(p1, mul(n, s));
    return `M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}`;
  };
  return { walls: [wall(1), wall(-1)], tip: p1, dir };
}

/** Filled triangular arrowhead with its tip at `tip`, pointing along `dir`. */
export function arrowHead(tip: Pt, dir: Pt, length = 9, halfWidth = 4.5): string {
  const back = sub(tip, mul(dir, length));
  const n = mul(normal(dir), halfWidth);
  const l = add(back, n);
  const r = sub(back, n);
  return `M${f(tip.x)},${f(tip.y)} L${f(l.x)},${f(l.y)} L${f(r.x)},${f(r.y)} Z`;
}

/** Delay mark ‖: two short strokes across the edge at `mid`. */
export function delayMark(mid: Pt, dir: Pt, halfLength = 7, gap = 2.5): string {
  const n = mul(normal(dir), halfLength);
  const stroke = (s: number) => {
    const m = add(mid, mul(dir, s));
    const a = add(m, n);
    const b = sub(m, n);
    return `M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}`;
  };
  return `${stroke(-gap)} ${stroke(gap)}`;
}
