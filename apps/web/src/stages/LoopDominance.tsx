/**
 * Loop dominance (Loops That Matter): which feedback loops drive the behaviour at each moment of the run.
 * A loop's relative score is its share of the change in behaviour among the loops that share stocks with it: above 0 it
 * acts as reinforcing, below 0 as balancing, and the magnitudes within one group add up to 100%. One chart per group
 * (scores of different groups are not comparable) with the strongest loops drawn under short handles (R1, B2, …); the
 * table below it is the legend key (handle → path), the text twin of the chart, and lists the strongest loops with their
 * shares. Recomputed once per run, like the sensitivity panel.
 */
import { lazy, Suspense, useMemo } from 'react';
import type { Model } from '@looplab/core';
import type { ChartSeries } from '../charts/align.ts';
import { loopDominance, MAX_TABLE_ROWS, type LoopGroup } from '../lib/loopDominance.ts';

// uPlot is loaded only when a chart is first shown (keeps it out of the main bundle).
const TimeSeriesChart = lazy(() =>
  import('../charts/TimeSeriesChart.tsx').then((m) => ({ default: m.TimeSeriesChart })),
);

const CHART_HEIGHT = 230;
/** Scores lie in [−1, 1]; the margin keeps a line at ±1 from being clipped by the plot edge. */
const Y_RANGE: [number, number] = [-1.05, 1.05];

const pct = (x: number) => (x === 0 ? '0%' : Math.round(x * 100) === 0 ? '<1%' : `${Math.round(x * 100)}%`);

export function LoopDominance({ model, runSeq }: { model: Model; runSeq: number }) {
  const out = useMemo(() => {
    try {
      return { view: loopDominance(model), error: null };
    } catch (e) {
      return { view: null, error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute per run, not per keystroke
  }, [runSeq]);
  if (out.error) return <p className="error-text">Loop dominance failed: {out.error}</p>;
  const view = out.view;
  if (!view) return null;
  const xLabel = `Time (${model.simSpec.timeUnit})`;
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <h2>Loop dominance</h2>
      <p className="note" style={{ marginTop: 0 }}>
        Each loop’s share of the change in behaviour at every step. Above 0 the loop acts as reinforcing, below 0 as
        balancing. Loops that share stocks form a group whose shares add up to 100%.
      </p>
      {view.truncated && (
        <div className="banner" role="alert" data-testid="ltm-cap-warning" style={{ margin: '8px 0' }}>
          Only the first {view.cap} loops were scored — the search stopped at the {view.reason === 'time' ? 'time budget' : 'loop cap'}.
          Shares are relative to those loops.
        </div>
      )}
      {view.idle ? (
        <p className="empty" data-testid="ltm-idle">
          Nothing changes over this run, so no loop has a score. A model at equilibrium has no dominant loop; disturb it
          (for example with a STEP input) to see one.
        </p>
      ) : (
        <div data-testid="chart-ltm" className="chart-stack">
          {view.groups.map((g, i) => (
            <GroupChart key={g.rows[0]?.key ?? i} group={g} time={view.time} xLabel={xLabel} index={i} count={view.groups.length} />
          ))}
        </div>
      )}
      {view.silent > 0 && (
        <p className="note" data-testid="ltm-silent">
          Loops that score 0 throughout ({view.silent}): at no step are all their links changing together (a MIN or IF branch
          that never binds, say), or they run through a SMOOTH or DELAY builtin, which is not scored yet.
        </p>
      )}
    </div>
  );
}

function GroupChart({
  group,
  time,
  xLabel,
  index,
  count,
}: {
  group: LoopGroup;
  time: Float64Array;
  xLabel: string;
  index: number;
  count: number;
}) {
  const series = useMemo<ChartSeries[]>(
    () =>
      group.rows
        .filter((r) => r.slot !== null)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        .map((r) => ({ label: r.handle, time, values: r.values, slot: r.slot ?? 0, dash: [] })),
    [group, time],
  );
  const total = group.rows.length;
  const listed = group.rows.slice(0, MAX_TABLE_ROWS);
  return (
    <div style={{ marginBottom: 10 }}>
      {count > 1 && (
        <h3>
          Loop group {index + 1} <span className="muted">· {total} {total === 1 ? 'loop' : 'loops'}</span>
        </h3>
      )}
      <div className="chart-box">
        <Suspense fallback={<div style={{ height: CHART_HEIGHT }} />}>
          <TimeSeriesChart
            series={series}
            xLabel={xLabel}
            yLabel="Relative loop score"
            yRange={Y_RANGE}
            height={CHART_HEIGHT}
          />
        </Suspense>
      </div>
      <table className="ltm-table" data-testid="ltm-table" aria-label="Loops, their paths and shares over the run">
        <thead>
          <tr>
            <th>Loop</th>
            <th className="num" title="Mean of |relative score| over the run">
              Average share
            </th>
            <th className="num" title="Largest |relative score| over the run">
              Peak share
            </th>
          </tr>
        </thead>
        <tbody>
          {listed.map((r) => (
            <tr key={r.key}>
              <td>
                <div className="ltm-loop">
                  <span
                    className="swatch"
                    aria-hidden="true"
                    style={{ background: r.slot !== null ? `var(--series-${r.slot + 1})` : 'transparent' }}
                  />
                  <span>
                    <strong>{r.handle}</strong> {r.label}
                  </span>
                </div>
              </td>
              <td className="num">{pct(r.mean)}</td>
              <td className="num">{pct(r.peak)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > series.length && (
        <p className="note">
          Drawing the {series.length} strongest of {total} loops
          {total > listed.length ? `; the table lists the ${listed.length} strongest.` : '; all of them are in the table.'}
        </p>
      )}
    </div>
  );
}
