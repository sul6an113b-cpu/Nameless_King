/** Tornado: one bar per parameter from KPI-at-low to KPI-at-high around the base value. Plain SVG; text via React. */
import type { TornadoRow } from '@looplab/core';

export function TornadoChart({ rows, names, kpiName }: { rows: TornadoRow[]; names: Record<string, string>; kpiName: string }) {
  const top = rows.slice(0, 10);
  const W = 520;
  const label = 170;
  const rowH = 24;
  const H = top.length * rowH + 8;
  const base = top[0]?.base ?? 0;
  const lo = Math.min(base, ...top.map((r) => Math.min(r.kpiAtLow, r.kpiAtHigh)));
  const hi = Math.max(base, ...top.map((r) => Math.max(r.kpiAtLow, r.kpiAtHigh)));
  const span = hi - lo || 1;
  const x = (v: number) => label + ((v - lo) / span) * (W - label - 8);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Tornado chart of ${kpiName}`}
      data-testid="chart-tornado"
    >
      {top.map((r, i) => {
        const a = Math.min(r.kpiAtLow, r.kpiAtHigh);
        const b = Math.max(r.kpiAtLow, r.kpiAtHigh);
        const y = i * rowH + 4;
        return (
          <g key={r.varId}>
            <text x={label - 6} y={y + 14} textAnchor="end" fontSize="12" fill="currentColor">
              {names[r.varId] ?? r.varId}
            </text>
            <rect x={x(a)} y={y + 3} width={Math.max(x(b) - x(a), 1)} height={rowH - 8} fill="var(--accent, #4f6bed)">
              <title>{`${names[r.varId] ?? r.varId}: ${r.low} → ${r.kpiAtLow.toPrecision(4)}, ${r.high} → ${r.kpiAtHigh.toPrecision(4)}`}</title>
            </rect>
          </g>
        );
      })}
      <line x1={x(base)} x2={x(base)} y1={0} y2={H} stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
