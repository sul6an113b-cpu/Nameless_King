/**
 * SVG chart strings for the report (SPEC §6.8): line, band, tornado and Pareto. Pure and deterministic — no DOM, no
 * fonts to measure, no randomness — so a report renders the same in Node, a worker and the browser. Fixed light colours
 * (a report is a printed page, not a themed screen). Every piece of text is XML-escaped: names come from the model and
 * are untrusted.
 */

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const INK = '#222';
const MUTED = '#666';
const GRID = '#e3e3e3';
/** Okabe–Ito (colour-blind safe), the yellow swapped for a dark neutral so every line reads on white. */
export const PALETTE: readonly string[] = [
  '#0072B2',
  '#D55E00',
  '#009E73',
  '#CC79A7',
  '#E69F00',
  '#56B4E9',
  '#6A3D9A',
  '#555555',
];
const DASHES: readonly string[] = ['', '7 4', '2 3', '9 3 2 3'];
/** Longest polyline kept per series; longer ones are thinned by stride (the last point is always kept). */
export const MAX_POINTS = 320;

/** Control characters other than tab/newline are not allowed in XML 1.0 and are dropped. */
function clean(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 32 || c === 9 || c === 10 || c === 13) out += ch;
  }
  return out;
}

export const escapeXml = (s: string): string =>
  clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Compact, locale-independent number: 4 significant digits, exponent form for very large or small values. */
export function fmt(n: number): string {
  if (Number.isNaN(n)) return 'n/a';
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e6 || a < 1e-3) return n.toExponential(2);
  return String(Number(n.toPrecision(4)));
}

const trunc = (s: string, max: number): string => (s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s);
const r1 = (n: number): string => String(Math.round(n * 10) / 10);

/** "Nice" tick values covering [lo, hi] with about `count` steps. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step, i = 0; t <= hi + step * 1e-9 && i < 50; t += step, i++)
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  return ticks;
}

function frame(w: number, h: number, title: string, body: string): string {
  const t = escapeXml(title);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" ` +
    `aria-label="${t}" font-family='${FONT}' font-size="11" fill="${INK}">` +
    `<title>${t}</title><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`
  );
}

const heading = (w: number, title: string): string =>
  `<text x="${w / 2}" y="16" text-anchor="middle" font-size="13" font-weight="600">${escapeXml(trunc(title, 90))}</text>`;

function noData(title: string): string {
  return frame(
    320,
    80,
    title,
    `${heading(320, title)}<text x="160" y="52" text-anchor="middle" fill="${MUTED}">No data to plot</text>`,
  );
}

/** Legend entries laid out left to right, wrapping at `width`; returns the markup and the height used. */
function legend(
  items: { label: string; color: string; dash?: string; swatch?: 'line' | 'box' }[],
  x0: number,
  y0: number,
  width: number,
): { svg: string; height: number } {
  let x = x0;
  let y = y0;
  let svg = '';
  for (const it of items) {
    const label = trunc(it.label, 34);
    const w = 30 + label.length * 6.1;
    if (x > x0 && x + w > x0 + width) {
      x = x0;
      y += 16;
    }
    svg +=
      it.swatch === 'box'
        ? `<rect x="${r1(x)}" y="${y - 8}" width="14" height="9" fill="${it.color}"/>`
        : `<line x1="${r1(x)}" x2="${r1(x + 18)}" y1="${y - 4}" y2="${y - 4}" stroke="${it.color}" stroke-width="2"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`;
    svg += `<text x="${r1(x + 22)}" y="${y}">${escapeXml(label)}</text>`;
    x += w;
  }
  return { svg, height: y - y0 + 16 };
}

export interface LineSeries {
  label: string;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
  /** colour index into PALETTE (default: the series' position) */
  color?: number;
}

export interface BandSeries {
  label: string;
  x: ArrayLike<number>;
  lo: ArrayLike<number>;
  hi: ArrayLike<number>;
  color?: number;
}

export interface ChartOptions {
  title: string;
  xLabel?: string;
  yLabel?: string;
  /** y range; default = data range */
  yDomain?: [number, number];
}

const W = 640;
const ML = 66;
const MR = 16;
const MT = 28;
const PLOT_H = 230;

/** Indices 0, s, 2s … plus the last one, so a long series is thinned to about MAX_POINTS points. */
function thin(n: number): number[] {
  const step = Math.max(1, Math.ceil(n / MAX_POINTS));
  const idx: number[] = [];
  for (let i = 0; i < n; i += step) idx.push(i);
  if (n > 0 && idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  return idx;
}

function pathOf(x: ArrayLike<number>, y: ArrayLike<number>, sx: (v: number) => number, sy: (v: number) => number): string {
  let d = '';
  let pen = false;
  for (const i of thin(Math.min(x.length, y.length))) {
    const xv = x[i] ?? NaN;
    const yv = y[i] ?? NaN;
    if (!Number.isFinite(xv) || !Number.isFinite(yv)) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${r1(sx(xv))} ${r1(sy(yv))}`;
    pen = true;
  }
  return d;
}

function xyChart(series: LineSeries[], bands: BandSeries[], o: ChartOptions): string {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  const scan = (xs: ArrayLike<number>, ys: ArrayLike<number>) => {
    for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
      const xv = xs[i] ?? NaN;
      const yv = ys[i] ?? NaN;
      if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
      if (xv < xmin) xmin = xv;
      if (xv > xmax) xmax = xv;
      if (yv < ymin) ymin = yv;
      if (yv > ymax) ymax = yv;
    }
  };
  for (const s of series) scan(s.x, s.y);
  for (const b of bands) {
    scan(b.x, b.lo);
    scan(b.x, b.hi);
  }
  if (!Number.isFinite(xmin) || !Number.isFinite(ymin)) return noData(o.title);
  if (o.yDomain) [ymin, ymax] = o.yDomain;
  if (!(xmax > xmin)) xmax = xmin + 1;
  if (!(ymax > ymin)) {
    const pad = Math.abs(ymin) * 0.1 || 1;
    ymin -= pad;
    ymax += pad;
  } else if (!o.yDomain) {
    const pad = (ymax - ymin) * 0.05;
    ymin -= pad;
    ymax += pad;
  }
  const items = [
    ...series.map((s, i) => ({ label: s.label, color: PALETTE[(s.color ?? i) % PALETTE.length] ?? INK })),
    ...bands.map((b, i) => ({
      label: b.label,
      color: PALETTE[(b.color ?? i) % PALETTE.length] ?? INK,
      swatch: 'box' as const,
    })),
  ];
  const lg = legend(items, ML, MT + PLOT_H + 46, W - ML - MR);
  const H = MT + PLOT_H + 46 + lg.height + 4;
  const pw = W - ML - MR;
  const sx = (v: number) => ML + ((v - xmin) / (xmax - xmin)) * pw;
  const sy = (v: number) => MT + PLOT_H - ((v - ymin) / (ymax - ymin)) * PLOT_H;

  let g = heading(W, o.title);
  for (const t of niceTicks(ymin, ymax)) {
    const y = r1(sy(t));
    g += `<line x1="${ML}" x2="${W - MR}" y1="${y}" y2="${y}" stroke="${GRID}"/>`;
    g += `<text x="${ML - 6}" y="${Number(y) + 4}" text-anchor="end" fill="${MUTED}">${fmt(t)}</text>`;
  }
  for (const t of niceTicks(xmin, xmax)) {
    const x = r1(sx(t));
    g += `<line x1="${x}" x2="${x}" y1="${MT}" y2="${MT + PLOT_H}" stroke="${GRID}"/>`;
    g += `<text x="${x}" y="${MT + PLOT_H + 14}" text-anchor="middle" fill="${MUTED}">${fmt(t)}</text>`;
  }
  g += `<rect x="${ML}" y="${MT}" width="${pw}" height="${PLOT_H}" fill="none" stroke="#999"/>`;
  bands.forEach((b, i) => {
    const color = PALETTE[(b.color ?? i) % PALETTE.length] ?? INK;
    const n = Math.min(b.x.length, b.lo.length, b.hi.length);
    const idx = thin(n);
    const pts = (key: ArrayLike<number>, order: number[]) =>
      order.map((k) => `${r1(sx(b.x[k] ?? NaN))},${r1(sy(key[k] ?? NaN))}`);
    const poly = [...pts(b.hi, idx), ...pts(b.lo, [...idx].reverse())].join(' ');
    if (n > 0 && !poly.includes('NaN')) g += `<polygon points="${poly}" fill="${color}" fill-opacity="0.18" stroke="none"/>`;
  });
  series.forEach((s, i) => {
    const d = pathOf(s.x, s.y, sx, sy);
    if (!d) return;
    const color = PALETTE[(s.color ?? i) % PALETTE.length] ?? INK;
    const dash = DASHES[Math.floor(i / PALETTE.length) % DASHES.length] ?? '';
    g += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
  });
  if (o.xLabel)
    g += `<text x="${ML + pw / 2}" y="${MT + PLOT_H + 32}" text-anchor="middle" fill="${MUTED}">${escapeXml(trunc(o.xLabel, 60))}</text>`;
  if (o.yLabel)
    g += `<text transform="rotate(-90 14 ${MT + PLOT_H / 2})" x="14" y="${MT + PLOT_H / 2}" text-anchor="middle" fill="${MUTED}">${escapeXml(trunc(o.yLabel, 40))}</text>`;
  g += lg.svg;
  return frame(W, H, o.title, g);
}

/** Time-series lines, one per entry (a run, a loop …). NaN/∞ values break the line instead of drawing it. */
export const lineChartSvg = (series: LineSeries[], o: ChartOptions): string => xyChart(series, [], o);

/** A percentile band (e.g. Monte Carlo p5–p95) with a median line. */
export function bandChartSvg(
  x: ArrayLike<number>,
  band: { p5: ArrayLike<number>; p50: ArrayLike<number>; p95: ArrayLike<number> },
  o: ChartOptions,
): string {
  return xyChart(
    [{ label: 'median (p50)', x, y: band.p50 }],
    [{ label: '5th–95th percentile', x, lo: band.p5, hi: band.p95 }],
    o,
  );
}

export interface TornadoBar {
  label: string;
  /** KPI value with the parameter at its low / high end */
  atLow: number;
  atHigh: number;
  /** parameter range, shown in the tooltip */
  low: number;
  high: number;
}

/** One-at-a-time sensitivity: bars from the base value to the KPI at each end of the parameter's range, widest first. */
export function tornadoSvg(bars: TornadoBar[], base: number, o: ChartOptions & { maxRows?: number }): string {
  const rows = bars.slice(0, o.maxRows ?? 12);
  const vals = rows.flatMap((r) => [r.atLow, r.atHigh, base]).filter(Number.isFinite);
  if (rows.length === 0 || vals.length === 0) return noData(o.title);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (!(hi > lo)) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.04;
  lo -= pad;
  hi += pad;
  const LEFT = 170;
  const RH = 24;
  const pw = W - LEFT - MR;
  const top = MT + 6;
  const ph = rows.length * RH;
  const sx = (v: number) => LEFT + ((v - lo) / (hi - lo)) * pw;
  let g = heading(W, o.title);
  for (const t of niceTicks(lo, hi)) {
    const x = r1(sx(t));
    g += `<line x1="${x}" x2="${x}" y1="${top}" y2="${top + ph}" stroke="${GRID}"/>`;
    g += `<text x="${x}" y="${top + ph + 14}" text-anchor="middle" fill="${MUTED}">${fmt(t)}</text>`;
  }
  rows.forEach((r, i) => {
    const y = top + i * RH;
    const bar = (v: number, color: string, which: string) => {
      if (!Number.isFinite(v)) return '';
      const x1 = Math.min(sx(base), sx(v));
      return `<rect x="${r1(x1)}" y="${y + 3}" width="${r1(Math.max(Math.abs(sx(v) - sx(base)), 1))}" height="${RH - 7}" fill="${color}"><title>${escapeXml(`${r.label} at ${which} (${fmt(which === 'low' ? r.low : r.high)}): ${fmt(v)}`)}</title></rect>`;
    };
    g += bar(r.atLow, PALETTE[0] ?? INK, 'low') + bar(r.atHigh, PALETTE[1] ?? INK, 'high');
    g += `<text x="${LEFT - 6}" y="${y + RH / 2 + 3}" text-anchor="end">${escapeXml(trunc(r.label, 26))}</text>`;
  });
  g += `<line x1="${r1(sx(base))}" x2="${r1(sx(base))}" y1="${top - 2}" y2="${top + ph + 2}" stroke="${INK}" stroke-width="1.5"/>`;
  const lg = legend(
    [
      { label: 'parameter at low end', color: PALETTE[0] ?? INK, swatch: 'box' },
      { label: 'parameter at high end', color: PALETTE[1] ?? INK, swatch: 'box' },
      { label: `base = ${fmt(base)}`, color: INK },
    ],
    LEFT,
    top + ph + 38,
    pw,
  );
  g += lg.svg;
  if (o.xLabel) g += `<text x="${LEFT + pw / 2}" y="${top + ph + 28}" text-anchor="middle" fill="${MUTED}">${escapeXml(trunc(o.xLabel, 60))}</text>`;
  return frame(W, top + ph + 38 + lg.height + 4, o.title, g);
}

export interface ParetoBar {
  label: string;
  value: number;
  /** cumulative share of the total, 0…1 */
  cumulativeShare: number;
}

/** Pareto: bars in descending order, cumulative-share line against a 0–100 % axis on the right. */
export function paretoSvg(bars: ParetoBar[], o: ChartOptions & { maxRows?: number }): string {
  const rows = bars.slice(0, o.maxRows ?? 12);
  const max = Math.max(...rows.map((r) => r.value).filter(Number.isFinite), 0);
  if (rows.length === 0 || !(max > 0)) return noData(o.title);
  const MR2 = 44;
  const pw = W - ML - MR2;
  const bw = pw / rows.length;
  const ph = 190;
  const sy = (v: number) => MT + ph - (v / max) * ph;
  const sc = (s: number) => MT + ph - Math.min(Math.max(s, 0), 1) * ph;
  let g = heading(W, o.title);
  for (const t of niceTicks(0, max, 4)) {
    const y = r1(sy(t));
    g += `<line x1="${ML}" x2="${ML + pw}" y1="${y}" y2="${y}" stroke="${GRID}"/>`;
    g += `<text x="${ML - 6}" y="${Number(y) + 4}" text-anchor="end" fill="${MUTED}">${fmt(t)}</text>`;
  }
  for (const p of [0, 0.5, 1])
    g += `<text x="${ML + pw + 6}" y="${r1(sc(p) + 4)}" fill="${MUTED}">${Math.round(p * 100)}%</text>`;
  rows.forEach((r, i) => {
    const h = Math.max(((Number.isFinite(r.value) ? r.value : 0) / max) * ph, 0);
    const x = ML + i * bw;
    g += `<rect x="${r1(x + 3)}" y="${r1(MT + ph - h)}" width="${r1(Math.max(bw - 6, 1))}" height="${r1(h)}" fill="${PALETTE[0] ?? INK}"><title>${escapeXml(`${r.label}: ${fmt(r.value)}`)}</title></rect>`;
    const lx = r1(x + bw / 2);
    g += `<text transform="rotate(-35 ${lx} ${MT + ph + 12})" x="${lx}" y="${MT + ph + 12}" text-anchor="end" fill="${MUTED}">${escapeXml(trunc(r.label, 16))}</text>`;
  });
  g += `<polyline points="${rows.map((r, i) => `${r1(ML + (i + 0.5) * bw)},${r1(sc(r.cumulativeShare))}`).join(' ')}" fill="none" stroke="${PALETTE[1] ?? INK}" stroke-width="1.8"/>`;
  g += `<rect x="${ML}" y="${MT}" width="${pw}" height="${ph}" fill="none" stroke="#999"/>`;
  const lg = legend(
    [
      { label: o.yLabel ?? 'score', color: PALETTE[0] ?? INK, swatch: 'box' },
      { label: 'cumulative share', color: PALETTE[1] ?? INK },
    ],
    ML,
    MT + ph + 62,
    pw,
  );
  return frame(W, MT + ph + 62 + lg.height + 4, o.title, g + lg.svg);
}
