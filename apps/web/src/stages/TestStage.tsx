/**
 * Test (Phase 2 part): run the model in the simulation worker (Euler default; RK4 and DT under Advanced),
 * plot the chosen variables, overlay earlier runs for comparison, export results as CSV. Variables with
 * different units get separate charts (never two y-scales on one axis).
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { oatSensitivity, type HealthItem, type Id, type Model, type SimResult, type TornadoRow } from '@looplab/core';
import { LeveragePareto } from '../analyze/AnalyzeStage.tsx';
import { TornadoChart } from '../charts/TornadoChart.tsx';
import type { ChartSeries } from '../charts/align.ts';
import { NumberField, Unavailable } from '../components/fields.tsx';
import { setSimSpec } from '../lib/edits.ts';
import { resultsCsv } from '../lib/engine.ts';
import { download, fileStem } from '../lib/files.ts';
import { act } from '../state/actions.ts';
import { dashOf, MAX_PLOTTED, useRunsStore, type Run } from '../state/runs.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { cancelSimulation, simulateInWorker } from '../workers/simClient.ts';
import { LoopDominance } from './LoopDominance.tsx';

// uPlot is loaded only when a chart is first shown (keeps it out of the main bundle).
const TimeSeriesChart = lazy(() =>
  import('../charts/TimeSeriesChart.tsx').then((m) => ({ default: m.TimeSeriesChart })),
);

type Notice =
  { kind: 'unavailable' } | { kind: 'error'; message: string } | { kind: 'compile'; errors: HealthItem[] } | null;

/** Default variables to plot: KPI variables, else stocks, else the first few series. */
function defaultPlotted(model: Model, result: SimResult): Id[] {
  const has = (id: Id | null): id is Id => id !== null && id in result.series;
  const kpis = model.frame.kpis.map((k) => k.varId).filter(has);
  if (kpis.length) return [...new Set(kpis)].slice(0, 4);
  const stocks = model.variables.filter((v) => v.kind === 'stock' && v.id in result.series).map((v) => v.id);
  return (stocks.length ? stocks : Object.keys(result.series)).slice(0, 4);
}

export function TestStage() {
  const model = useModelStore((s) => s.model);
  const { runs, shown, slots } = useRunsStore();
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const run = async () => {
    setRunning(true);
    setNotice(null);
    const outcome = await simulateInWorker(model);
    setRunning(false);
    if (outcome.status === 'ok')
      useRunsStore.getState().addRun(outcome.result, outcome.ms, defaultPlotted(model, outcome.result));
    else if (outcome.status === 'unavailable') setNotice({ kind: 'unavailable' });
    else if (outcome.status === 'compile-error') setNotice({ kind: 'compile', errors: outcome.errors });
    else if (outcome.message !== 'Cancelled') setNotice({ kind: 'error', message: outcome.message });
  };

  const latest = runs[runs.length - 1];
  const exportCsv = () => {
    if (!latest) return;
    const names = Object.fromEntries(model.variables.map((v) => [v.id, v.name]));
    const csv = resultsCsv(latest.result, names);
    if (csv.status === 'ok')
      download(`${fileStem(model.name)}-${latest.name.replace(/\s+/g, '-').toLowerCase()}.csv`, csv.value, 'text/csv');
    else if (csv.status === 'unavailable') useUiStore.getState().toast('CSV export is available after integration');
    else useUiStore.getState().toast(`CSV export failed: ${csv.message}`, 'error');
  };

  return (
    <>
      <div className="test-toolbar">
        <button
          type="button"
          className="btn primary"
          data-testid="btn-simulate"
          disabled={running}
          onClick={() => void run()}
        >
          {running ? 'Running…' : '▶ Run'}
        </button>
        {running && (
          <button type="button" className="btn" onClick={cancelSimulation}>
            Cancel
          </button>
        )}
        <span className="muted small">
          {model.simSpec.method === 'rk4' ? 'RK4' : 'Euler'} · DT {model.simSpec.dt} · {model.simSpec.start}–
          {model.simSpec.stop} {model.simSpec.timeUnit}
          {latest &&
            ` · ${latest.name} took ${latest.ms < 1000 ? `${Math.max(1, Math.round(latest.ms))} ms` : `${(latest.ms / 1000).toFixed(2)} s`}`}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn"
          data-testid="btn-export-csv"
          disabled={!latest}
          onClick={exportCsv}
          title="Export the latest run as CSV"
        >
          Export CSV
        </button>
        <details className="menu">
          <summary className="btn" data-testid="sim-settings">
            Settings
          </summary>
          <div className="menu-list" style={{ padding: 10, width: 240 }}>
            <label className="field">
              <span>Integration method</span>
              <select
                data-testid="sim-method"
                value={model.simSpec.method}
                onChange={(e) =>
                  act('Change method', (m) => setSimSpec(m, { method: e.target.value as 'euler' | 'rk4' }))
                }
              >
                <option value="euler">Euler (default)</option>
                <option value="rk4">Runge–Kutta 4</option>
              </select>
            </label>
            <NumberField
              label={`DT (${model.simSpec.timeUnit})`}
              value={model.simSpec.dt}
              min={0}
              testId="sim-dt"
              onCommit={(dt) => act('Change DT', (m) => setSimSpec(m, { dt }))}
            />
            <p className="note">Horizon is set in Frame. Check DT with the integration-error test in Model Health.</p>
          </div>
        </details>
      </div>
      <div className="test-main">
        <div className="chart-area">
          {notice?.kind === 'unavailable' && <Unavailable what="Simulation" />}
          {notice?.kind === 'error' && <p className="error-text">Simulation failed: {notice.message}</p>}
          {notice?.kind === 'compile' && <CompileErrors errors={notice.errors} />}
          {runs.length === 0 && !notice && <p className="empty">Press Run to simulate the model over its horizon.</p>}
          {latest && <Sensitivity model={model} runSeq={latest.seq} />}
          {runs.length > 0 && <Charts model={model} runs={runs.filter((r) => shown.includes(r.seq))} slots={slots} />}
          {latest && <LoopDominance model={model} runSeq={latest.seq} />}
        </div>
        <aside className="chart-side" aria-label="Series and runs">
          <SeriesPicker model={model} runs={runs} slots={slots} />
          <RunList runs={runs} shown={shown} />
        </aside>
      </div>
    </>
  );
}

/** OAT sensitivity of the first KPI over each constant's uncertainty range; recomputed for each new run. */
function Sensitivity({ model, runSeq }: { model: Model; runSeq: number }) {
  const out = useMemo(() => {
    const kpi = model.frame.kpis.find((k) => k.varId !== null);
    const params = model.variables.flatMap((v) =>
      v.kind === 'constant' && v.uncertainty ? [{ varId: v.id, min: v.uncertainty.min, max: v.uncertainty.max }] : [],
    );
    if (!kpi?.varId || params.length === 0) return null;
    try {
      const rows: TornadoRow[] = oatSensitivity(model, params, { varId: kpi.varId, statistic: 'final' }).rows;
      return { kpiName: kpi.name, rows, error: null };
    } catch (e) {
      return { kpiName: kpi.name, rows: [] as TornadoRow[], error: e instanceof Error ? e.message : String(e) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute per run, not per keystroke
  }, [runSeq]);
  if (!out) return null;
  if (out.error) return <p className="error-text">Sensitivity failed: {out.error}</p>;
  const names = Object.fromEntries(model.variables.map((v) => [v.id, v.name]));
  const total = out.rows.reduce((t, r) => t + r.swing, 0) || 1;
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <h2>Sensitivity of {out.kpiName} (final value)</h2>
      <TornadoChart rows={out.rows} names={names} kpiName={out.kpiName} />
      <LeveragePareto
        rows={out.rows.map((r) => ({ name: names[r.varId] ?? r.varId, score: r.swing / total, cumulativeShare: r.cumulativeShare }))}
      />
    </div>
  );
}

function CompileErrors({ errors }: { errors: HealthItem[] }) {
  return (
    <div className="card" role="alert">
      <h2>The model cannot run yet</h2>
      <ul className="list">
        {errors.map((e, i) => (
          <li key={i}>
            <span className={`sev ${e.severity}`}>{e.severity}</span>
            <span style={{ flex: 1 }}>{e.message}</span>
            {e.elementIds.length > 0 && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  useUiStore.getState().setStage('quantify');
                  useUiStore.getState().select(e.elementIds);
                }}
              >
                Show
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Charts({ model, runs, slots }: { model: Model; runs: Run[]; slots: Record<Id, number> }) {
  const groups = useMemo(() => {
    const byUnit = new Map<string, ChartSeries[]>();
    const plotted = Object.keys(slots).filter((id) => model.variables.some((v) => v.id === id));
    for (const id of plotted) {
      const v = model.variables.find((x) => x.id === id);
      if (!v) continue;
      const list = byUnit.get(v.units) ?? [];
      for (const r of runs) {
        const values = r.result.series[id];
        if (!values) continue;
        list.push({
          label: runs.length > 1 ? `${v.name} · ${r.name}` : v.name,
          time: r.result.time,
          values,
          slot: slots[id] ?? 0,
          dash: dashOf(r.seq),
        });
      }
      byUnit.set(v.units, list);
    }
    return [...byUnit.entries()].filter(([, s]) => s.length > 0);
  }, [model.variables, runs, slots]);

  if (runs.length === 0) return <p className="empty">Tick a run on the right to show it.</p>;
  if (groups.length === 0) return <p className="empty">Choose variables to plot on the right.</p>;
  const height = groups.length === 1 ? 340 : 230;
  return (
    <div data-testid="chart-timeseries" className="chart-stack">
      {groups.map(([units, series]) => (
        <div key={units} className="chart-box" style={{ marginBottom: 10 }}>
          <Suspense fallback={<div style={{ height }} />}>
            <TimeSeriesChart
              series={series}
              xLabel={`Time (${model.simSpec.timeUnit})`}
              yLabel={units || undefined}
              height={height}
            />
          </Suspense>
        </div>
      ))}
    </div>
  );
}

function SeriesPicker({ model, runs, slots }: { model: Model; runs: Run[]; slots: Record<Id, number> }) {
  const latest = runs[runs.length - 1];
  const available = latest ? model.variables.filter((v) => v.id in latest.result.series) : [];
  const full = Object.keys(slots).length >= MAX_PLOTTED;
  return (
    <>
      <h3>Variables</h3>
      {available.length === 0 && <p className="empty">Run the model first.</p>}
      <div className="series-pick">
        {available.map((v) => {
          const slot = slots[v.id];
          return (
            <label key={v.id}>
              <input
                type="checkbox"
                checked={slot !== undefined}
                disabled={slot === undefined && full}
                onChange={() => useRunsStore.getState().togglePlotted(v.id)}
              />
              <span
                className="swatch"
                style={{ background: slot !== undefined ? `var(--series-${slot + 1})` : 'transparent' }}
              />
              {v.name}
            </label>
          );
        })}
      </div>
      {full && <p className="note">Up to {MAX_PLOTTED} variables at once.</p>}
    </>
  );
}

function RunList({ runs, shown }: { runs: Run[]; shown: number[] }) {
  if (runs.length === 0) return null;
  return (
    <>
      <h3>Runs (compare)</h3>
      {[...runs].reverse().map((r) => (
        <div key={r.seq} className="run-item" data-testid={`run-${r.seq}`}>
          <input
            type="checkbox"
            aria-label={`Show ${r.name}`}
            checked={shown.includes(r.seq)}
            onChange={() => useRunsStore.getState().toggleShown(r.seq)}
          />
          <span className={`dash d${(r.seq - 1) % 4}`} aria-hidden="true" />
          <span>
            {r.name}{' '}
            <span className="muted small">
              {r.result.spec.method === 'rk4' ? 'RK4' : 'Euler'} DT {r.result.spec.dt}
            </span>
          </span>
          <button
            type="button"
            className="btn ghost icon small"
            aria-label={`Remove ${r.name}`}
            onClick={() => useRunsStore.getState().removeRun(r.seq)}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}
