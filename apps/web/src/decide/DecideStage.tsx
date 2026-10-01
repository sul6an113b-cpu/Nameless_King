/**
 * Decide: write the recommendation, tag each intervention with its Meadows leverage level and the scenario that tests it,
 * compare the scenarios side by side on the KPIs, and export the decision brief (Markdown, print to PDF) and the results (CSV).
 * The brief is built by core from the same model and run results; the preview is the report's own HTML in a sandboxed frame
 * (no scripts), so model text can never become markup in the app.
 */
import { useMemo, useRef, useState } from 'react';
import { leveragePoints } from '@looplab/content';
import { kpiComparison, newId, toCsv, type Intervention, type KpiComparison, type Model } from '@looplab/core';
import { TextField } from '../components/fields.tsx';
import { addIntervention, removeIntervention, setDecision, updateIntervention } from '../lib/edits.ts';
import { computeDecideData, reportOf, type DecideData } from '../lib/decide.ts';
import { download, fileStem } from '../lib/files.ts';
import { act } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';

const STATUSES: Intervention['status'][] = ['idea', 'tested', 'recommended', 'rejected'];
const fmtNum = (n: number): string => (Number.isFinite(n) ? String(Number(n.toPrecision(4))) : 'n/a');
const fmtPct = (x: number): string => `${x > 0 ? '+' : ''}${Math.round(x * 1000) / 10}%`;

export function DecideStage() {
  const model = useModelStore((s) => s.model);
  // Evidence depends on the model's structure, not on the decision text: recompute when that changes, not per keystroke.
  const data = useMemo(
    () => computeDecideData(model),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- decision, interventions and layout do not affect the runs
    [model.variables, model.links, model.scenarios, model.simSpec, model.frame, model.assertions, model.units, model.settings, model.loopAnnotations, model.archetypeFindings],
  );
  const report = useMemo(() => {
    try {
      return { ok: true as const, ...reportOf(model, data) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  }, [model, data]);

  return (
    <div className="stage-scroll decide" data-testid="decide-stage">
      <section className="card">
        <h2>Recommendation</h2>
        <TextField
          label="What should be done, and why"
          multiline
          rows={4}
          maxLength={8000}
          value={model.decision.recommendation}
          testId="decision-recommendation"
          onCommit={(v) => act('Edit recommendation', (m) => setDecision(m, { recommendation: v }))}
        />
        <TextField
          label="Summary (optional): the case in a few sentences"
          multiline
          rows={2}
          maxLength={8000}
          value={model.decision.summary}
          testId="decision-summary"
          onCommit={(v) => act('Edit summary', (m) => setDecision(m, { summary: v }))}
        />
      </section>
      <Interventions model={model} />
      <Comparison model={model} data={data} />
      <ReportCard model={model} report={report} />
    </div>
  );
}

function Interventions({ model }: { model: Model }) {
  return (
    <section className="card" data-testid="interventions">
      <h2>
        Interventions <span className="muted">Meadows level 12 = parameters (weakest) … 1 = paradigms (strongest)</span>
      </h2>
      {model.scenarios.length === 0 && (
        <p className="note" data-testid="no-scenarios">
          No scenarios yet. Ask the copilot (Intervene mode) to propose and simulate one, or open an example, and link it here.
        </p>
      )}
      {model.interventions.length === 0 && <p className="empty">No interventions yet.</p>}
      <ul className="interventions">
        {model.interventions.map((i) => (
          <InterventionRow key={i.id} model={model} item={i} />
        ))}
      </ul>
      <button
        type="button"
        className="btn"
        data-testid="btn-add-intervention"
        onClick={() => act('Add intervention', (m) => addIntervention(m, { id: newId('i'), name: 'New intervention', leverage: 12 }))}
      >
        + Add intervention
      </button>
    </section>
  );
}

function InterventionRow({ model, item }: { model: Model; item: Intervention }) {
  const edit = (label: string, changes: Partial<Intervention>) =>
    act(label, (m) => updateIntervention(m, item.id, changes));
  const point = leveragePoints.find((p) => p.level === item.leverage);
  return (
    <li className="intervention" data-testid={`intervention-${item.id}`}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <TextField
          label="Intervention"
          value={item.name}
          required
          maxLength={120}
          testId={`intervention-name-${item.id}`}
          onCommit={(v) => edit('Rename intervention', { name: v })}
        />
        <button
          type="button"
          className="btn ghost small"
          style={{ marginBottom: 8 }}
          aria-label={`Remove ${item.name}`}
          onClick={() => act('Remove intervention', (m) => removeIntervention(m, item.id))}
        >
          Remove
        </button>
      </div>
      <div className="row">
        <label className="field">
          <span>Meadows leverage level</span>
          <select
            value={item.leverage}
            data-testid={`intervention-level-${item.id}`}
            onChange={(e) => edit('Set leverage level', { leverage: Number(e.target.value) })}
          >
            {leveragePoints.map((p) => (
              <option key={p.level} value={p.level}>
                {p.level} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tested as scenario</span>
          <select
            value={item.scenarioId ?? ''}
            data-testid={`intervention-scenario-${item.id}`}
            onChange={(e) => {
              const scenarioId = e.target.value || null;
              const status = scenarioId && item.status === 'idea' ? 'tested' : !scenarioId && item.status === 'tested' ? 'idea' : item.status;
              edit('Link scenario', { scenarioId, status });
            }}
          >
            <option value="">Not tested</option>
            {model.scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select
            value={item.status}
            data-testid={`intervention-status-${item.id}`}
            onChange={(e) => edit('Set status', { status: e.target.value as Intervention['status'] })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {point && <p className="note">{point.description}</p>}
      <TextField
        label="Rationale"
        multiline
        rows={2}
        maxLength={4000}
        value={item.rationale}
        testId={`intervention-rationale-${item.id}`}
        onCommit={(v) => edit('Edit rationale', { rationale: v })}
      />
    </li>
  );
}

function Comparison({ model, data }: { model: Model; data: DecideData }) {
  const cmp: KpiComparison = useMemo(() => kpiComparison(model, data.runs), [model, data.runs]);
  const [csvRun, setCsvRun] = useState(0);
  const run = data.runs[Math.min(csvRun, data.runs.length - 1)];
  const exportCsv = () => {
    if (!run) return;
    const names = Object.fromEntries(model.variables.map((v) => [v.id, v.name]));
    try {
      download(`${fileStem(model.name)}-${fileStem(run.name).toLowerCase()}.csv`, toCsv(run.result, names), 'text/csv');
    } catch (e) {
      useUiStore.getState().toast(`CSV export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };
  const testedBy = (scenarioId: string | null) =>
    model.interventions.filter((i) => i.scenarioId === scenarioId && scenarioId !== null).map((i) => i.name).join(', ');
  return (
    <section className="card" data-testid="comparison">
      <h2>
        Compare scenarios <span className="muted">final value of each KPI, against the baseline</span>
      </h2>
      {data.problems.map((p) => (
        <p key={p} className="error-text">
          {p}
        </p>
      ))}
      {data.runs.length === 0 ? (
        <p className="empty">The model cannot run yet, so there is nothing to compare. Check Model Health in Quantify.</p>
      ) : cmp.rows.length === 0 ? (
        <p className="empty">Define a KPI with a variable in Frame to compare the scenarios on it.</p>
      ) : (
        <table className="ltm-table" data-testid="kpi-comparison" aria-label="KPI values per scenario">
          <thead>
            <tr>
              <th>KPI</th>
              <th>Goal</th>
              {cmp.runs.map((name, i) => (
                <th key={i} className="num">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((r) => (
              <tr key={r.kpiId}>
                <td>
                  {r.name}
                  {r.units && <span className="muted"> ({r.units})</span>}
                </td>
                <td>{r.goal === 'target' && r.target !== undefined ? `target ${fmtNum(r.target)}` : r.goal}</td>
                {r.cells.map((c, i) => (
                  <td key={i} className="num" data-verdict={c.verdict ?? undefined}>
                    {c.value === null ? 'n/a' : fmtNum(c.value)}
                    {c.delta !== null && <span className="muted"> {fmtPct(c.delta)}</span>}
                    {c.verdict && c.verdict !== 'same' && <span className={`verdict ${c.verdict}`}> {c.verdict}</span>}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="muted">Interventions tested</td>
              <td />
              {data.runs.map((r, i) => (
                <td key={i} className="num muted">
                  {testedBy(r.scenarioId) || '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <label className="field" style={{ flex: '0 1 220px', marginBottom: 0 }}>
          <span>Results to export</span>
          <select data-testid="csv-run" value={csvRun} disabled={data.runs.length === 0} onChange={(e) => setCsvRun(Number(e.target.value))}>
            {data.runs.map((r, i) => (
              <option key={r.scenarioId ?? 'base'} value={i}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn" data-testid="btn-export-results" disabled={!run} onClick={exportCsv} style={{ alignSelf: 'flex-end' }}>
          Export CSV
        </button>
      </div>
    </section>
  );
}

function ReportCard({ model, report }: { model: Model; report: { ok: true; markdown: string; html: string } | { ok: false; error: string } }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const exportMarkdown = () => {
    if (report.ok) download(`${fileStem(model.name)}-decision-brief.md`, report.markdown, 'text/markdown');
  };
  const print = () => {
    const w = frame.current?.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
  };
  return (
    <section className="card" data-testid="report-card">
      <h2>
        Decision brief <span className="muted">recommendation first, evidence below</span>
      </h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <button type="button" className="btn primary" data-testid="btn-export-report" disabled={!report.ok} onClick={exportMarkdown}>
          Download Markdown
        </button>
        <button type="button" className="btn" data-testid="btn-print-report" disabled={!report.ok} onClick={print}>
          Print / save as PDF
        </button>
      </div>
      {report.ok ? (
        <iframe
          ref={frame}
          title="Decision brief preview"
          data-testid="report-preview"
          className="report-frame"
          sandbox="allow-same-origin allow-modals"
          srcDoc={report.html}
        />
      ) : (
        <p className="error-text">The report could not be built: {report.error}</p>
      )}
    </section>
  );
}
