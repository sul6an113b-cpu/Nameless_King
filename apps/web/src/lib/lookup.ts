/** Lookup-table editing helpers (pure): string cells ↔ graphical function, with validation (schema rule I5). */
import type { GraphicalFunction } from '@looplab/core';

export type Row = { x: string; y: string };

export const toRows = (g: GraphicalFunction): Row[] => g.xs.map((x, i) => ({ x: String(x), y: String(g.ys[i] ?? 0) }));

export type RowsParse = { ok: true; xs: number[]; ys: number[] } | { ok: false; error: string };

export function parseRows(rows: Row[]): RowsParse {
  if (rows.length < 2) return { ok: false, error: 'A lookup needs at least two points' };
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [i, r] of rows.entries()) {
    const x = r.x.trim() === '' ? NaN : Number(r.x);
    const y = r.y.trim() === '' ? NaN : Number(r.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: `Row ${i + 1}: enter two numbers` };
    const prev = xs[xs.length - 1];
    if (prev !== undefined && !(x > prev))
      return { ok: false, error: `Row ${i + 1}: x must be greater than the row above` };
    xs.push(x);
    ys.push(y);
  }
  return { ok: true, xs, ys };
}

/** SVG path of the function in a w×h box (discrete mode draws steps). */
export function lookupPath(
  xs: number[],
  ys: number[],
  mode: GraphicalFunction['mode'],
  w: number,
  h: number,
  pad = 6,
): string {
  if (xs.length === 0) return '';
  const x0 = xs[0] ?? 0;
  const x1 = xs[xs.length - 1] ?? 1;
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = (x: number) => pad + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * pad);
  const sy = (y: number) => h - pad - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * pad);
  const pts = xs.map((x, i) => [sx(x), sy(ys[i] ?? 0)] as const);
  let d = `M${pts[0]?.[0] ?? 0},${pts[0]?.[1] ?? 0}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i] ?? [0, 0];
    const prevY = pts[i - 1]?.[1] ?? 0;
    d += mode === 'discrete' ? ` L${px},${prevY} L${px},${py}` : ` L${px},${py}`;
  }
  return d;
}
