/**
 * Frame (BRIEF stage 1): problem and purpose, time horizon (⇄ simSpec), KPIs, reference modes (sketched or
 * CSV) and the model boundary chart (endogenous/exogenous derived from the graph; excluded items listed here).
 */
import { useMemo, useRef, useState } from 'react';
import { newId, type Id, type Model } from '@looplab/core';
import { NumberField, TextField, Unavailable } from '../components/fields.tsx';
import { SketchPad } from '../frame/SketchPad.tsx';
import { parseReferenceCsv } from '../lib/csv.ts';
import {
  addExcluded,
  addKpi,
  addReferenceMode,
  removeExcluded,
  removeKpi,
  removeReferenceMode,
  setFrameText,
  setSimSpec,
  TIME_UNITS,
  updateKpi,
  updateReferenceMode,
} from '../lib/edits.ts';
import { boundary } from '../lib/engine.ts';
import { act } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';

export function FrameStage() {
  const model = useModelStore((s) => s.model);
  return (
    <div className="stage-scroll" data-testid="frame-stage">
      <div className="grid-2">
        <div className="col">
          <ProblemCard model={model} />
          <HorizonCard model={model} />
          <KpiCard model={model} />
        </div>
        <div className="col">
          <ReferenceModesCard model={model} />
          <BoundaryCard model={model} />
        </div>
      </div>
    </div>
  );
}

function ProblemCard({ model }: { model: Model }) {
  return (
    <section className="card">
      <h2>Problem</h2>
      <TextField
        label="Problem statement"
        value={model.frame.problem}
        multiline
        rows={4}
        maxLength={8000}
        testId="frame-problem"
        placeholder="What behaviour over time is the problem? e.g. “Rework keeps the engineering backlog high and pushes the schedule out.”"
        onCommit={(t) => act('Edit problem', (m) => setFrameText(m, 'problem', t))}
      />
      <TextField
        label="Purpose"
        value={model.frame.purpose}
        multiline
        rows={2}
        maxLength={4000}
        placeholder="Which decision should this model inform?"
        onCommit={(t) => act('Edit purpose', (m) => setFrameText(m, 'purpose', t))}
      />
    </section>
  );
}

function HorizonCard({ model }: { model: Model }) {
  const { start, stop, timeUnit } = model.simSpec;
  return (
    <section className="card">
      <h2>
        Time horizon <span className="muted">long enough to see the feedback play out</span>
      </h2>
      <div className="row">
        <NumberField
          label="Start"
          value={start}
          testId="horizon-start"
          onCommit={(v) => act('Edit horizon', (m) => setSimSpec(m, { start: v }))}
        />
        <NumberField
          label="Stop"
          value={stop}
          testId="horizon-stop"
          onCommit={(v) => act('Edit horizon', (m) => setSimSpec(m, { stop: v }))}
        />
        <label className="field">
          <span>Time unit</span>
          <select
            data-testid="horizon-unit"
            value={timeUnit}
            onChange={(e) => act('Edit time unit', (m) => setSimSpec(m, { timeUnit: e.target.value }))}
          >
            {(TIME_UNITS.includes(timeUnit) ? TIME_UNITS : [timeUnit, ...TIME_UNITS]).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="note">
        {stop - start} {timeUnit}s · integration step DT = {model.simSpec.dt} (
        {model.simSpec.method === 'rk4' ? 'RK4' : 'Euler'}; change in Test)
      </p>
    </section>
  );
}

function VarSelect({
  model,
  value,
  onChange,
  label,
}: {
  model: Model;
  value: Id | null;
  onChange: (id: Id | null) => void;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">— not linked —</option>
      {model.variables.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}

function KpiCard({ model }: { model: Model }) {
  const kpis = model.frame.kpis;
  return (
    <section className="card" data-testid="kpi-card">
      <h2>
        KPIs <span className="muted">the vital few measures of success</span>
      </h2>
      {kpis.length === 0 && <p className="empty">No KPIs yet.</p>}
      <ul className="list">
        {kpis.map((k) => (
          <li key={k.id} className="kpi-row">
            <div>
              <TextField
                label="Name"
                value={k.name}
                required
                maxLength={80}
                onCommit={(name) => act('Rename KPI', (m) => updateKpi(m, k.id, { name: name.trim() }))}
              />
            </div>
            <label className="field">
              <span>Variable</span>
              <VarSelect
                model={model}
                value={k.varId}
                label="KPI variable"
                onChange={(varId) => act('Link KPI', (m) => updateKpi(m, k.id, { varId }))}
              />
            </label>
            <label className="field">
              <span>Goal</span>
              <select
                value={k.goal}
                onChange={(e) =>
                  act('Edit KPI goal', (m) => updateKpi(m, k.id, { goal: e.target.value as typeof k.goal }))
                }
              >
                <option value="minimize">Minimize</option>
                <option value="maximize">Maximize</option>
                <option value="target">Target</option>
              </select>
            </label>
            {k.goal === 'target' && (
              <div className="kpi-target">
                <NumberField
                  label="Target"
                  value={k.target}
                  allowEmpty
                  onCommit={(target) => act('Edit KPI target', (m) => updateKpi(m, k.id, { target }))}
                />
              </div>
            )}
            <button
              type="button"
              className="btn ghost icon kpi-remove"
              aria-label={`Remove KPI ${k.name}`}
              onClick={() => act('Remove KPI', (m) => removeKpi(m, k.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn"
        data-testid="btn-add-kpi"
        onClick={() => act('Add KPI', (m) => addKpi(m, { id: newId('k'), name: `KPI ${m.frame.kpis.length + 1}` }))}
      >
        + KPI
      </button>
    </section>
  );
}

function Thumb({ points }: { points: [number, number][] }) {
  if (points.length < 2) return <svg className="refmode-thumb" aria-hidden="true" />;
  const ts = points.map((p) => p[0]);
  const vs = points.map((p) => p[1]);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const v0 = Math.min(...vs);
  const v1 = Math.max(...vs);
  const step = Math.max(1, Math.floor(points.length / 200));
  const pts = points
    .filter((_, i) => i % step === 0)
    .map(
      ([t, v]) =>
        `${(3 + ((t - t0) / (t1 - t0 || 1)) * 90).toFixed(1)},${(31 - ((v - v0) / (v1 - v0 || 1)) * 28).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg className="refmode-thumb" viewBox="0 0 96 34" aria-hidden="true">
      <polyline points={pts} />
    </svg>
  );
}

function ReferenceModesCard({ model }: { model: Model }) {
  const [sketching, setSketching] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { start, stop, timeUnit } = model.simSpec;

  const importCsv = async (file: File) => {
    setCsvError(null);
    const r = parseReferenceCsv(await file.text());
    if (!r.ok) return setCsvError(`${file.name}: ${r.error}`);
    const name = (r.header?.[1] || file.name.replace(/\.[^.]+$/, '')).slice(0, 80) || 'Imported data';
    act('Import reference mode', (m) =>
      addReferenceMode(m, { id: newId('r'), name, source: 'data', label: 'historical', points: r.points }),
    );
  };

  return (
    <section className="card" data-testid="refmodes-card">
      <h2>
        Reference modes <span className="muted">behaviour over time: seen, feared, hoped</span>
      </h2>
      {model.frame.referenceModes.length === 0 && !sketching && (
        <p className="empty">None yet: sketch the pattern or import data.</p>
      )}
      <ul className="list">
        {model.frame.referenceModes.map((r) => (
          <li key={r.id} data-testid={`refmode-${r.id}`}>
            <Thumb points={r.points} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</strong>
                <span className="chip">{r.source === 'sketch' ? 'sketch' : 'data'}</span>
                <span className="chip">{r.label}</span>
              </div>
              <VarSelect
                model={model}
                value={r.varId}
                label={`Variable for ${r.name}`}
                onChange={(varId) => act('Link reference mode', (m) => updateReferenceMode(m, r.id, { varId }))}
              />
            </div>
            <button
              type="button"
              className="btn ghost icon"
              aria-label={`Remove ${r.name}`}
              onClick={() => act('Remove reference mode', (m) => removeReferenceMode(m, r.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {sketching ? (
        <SketchPad
          start={start}
          stop={stop}
          timeUnit={timeUnit}
          onCancel={() => setSketching(false)}
          onSave={(points, name, label) => {
            if (
              act('Sketch reference mode', (m) =>
                addReferenceMode(m, { id: newId('r'), name, source: 'sketch', label, points }),
              )
            )
              setSketching(false);
          }}
        />
      ) : (
        <div className="row" style={{ marginTop: 6 }}>
          <button type="button" className="btn" data-testid="btn-sketch" onClick={() => setSketching(true)}>
            Sketch…
          </button>
          <button type="button" className="btn" data-testid="btn-import-csv" onClick={() => fileRef.current?.click()}>
            Import CSV…
          </button>
          <span className="note" style={{ margin: 0 }}>
            two columns: time, value
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            hidden
            data-testid="refmode-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importCsv(f);
            }}
          />
        </div>
      )}
      {csvError && (
        <p className="error-text" role="alert">
          {csvError}
        </p>
      )}
    </section>
  );
}

function BoundaryCard({ model }: { model: Model }) {
  const chart = useMemo(() => boundary(model), [model]);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const names = (ids: Id[]) => ids.map((id) => model.variables.find((v) => v.id === id)?.name ?? id);

  const add = () => {
    if (!name.trim()) return;
    if (
      act('Exclude from boundary', (m) => addExcluded(m, { id: newId('b'), name: name.trim(), reason: reason.trim() }))
    ) {
      setName('');
      setReason('');
    }
  };

  return (
    <section className="card" data-testid="boundary-card">
      <h2>
        Model boundary <span className="muted">what is inside, given, and deliberately left out</span>
      </h2>
      {chart.status === 'unavailable' && <Unavailable what="The derived endogenous/exogenous lists" />}
      {chart.status === 'error' && <p className="error-text">{chart.message}</p>}
      <div className="boundary" style={{ marginTop: chart.status === 'ok' ? 0 : 8 }}>
        {chart.status === 'ok' && (
          <>
            <div data-testid="boundary-endogenous">
              <h3>Endogenous</h3>
              {chart.value.endogenous.length ? (
                <ul>
                  {names(chart.value.endogenous).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty">None (no feedback loops yet)</p>
              )}
            </div>
            <div data-testid="boundary-exogenous">
              <h3>Exogenous</h3>
              {chart.value.exogenous.length ? (
                <ul>
                  {names(chart.value.exogenous).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty">None</p>
              )}
            </div>
          </>
        )}
        <div data-testid="boundary-excluded" style={chart.status === 'ok' ? undefined : { gridColumn: '1 / -1' }}>
          <h3>Excluded</h3>
          {model.frame.excluded.length === 0 && <p className="empty">Nothing listed</p>}
          <ul className="list">
            {model.frame.excluded.map((b) => (
              <li key={b.id}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {b.name}
                  {b.reason && <span className="muted small"> — {b.reason}</span>}
                </span>
                <button
                  type="button"
                  className="btn ghost icon small"
                  aria-label={`Remove ${b.name}`}
                  onClick={() => act('Remove excluded item', (m) => removeExcluded(m, b.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
        <label className="field">
          <span>Exclude</span>
          <input
            type="text"
            value={name}
            maxLength={120}
            placeholder="e.g. Currency exchange rates"
            data-testid="excluded-name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </label>
        <label className="field">
          <span>Why</span>
          <input
            type="text"
            value={reason}
            maxLength={1000}
            placeholder="reason (optional)"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </label>
        <button
          type="button"
          className="btn"
          style={{ marginBottom: 8 }}
          data-testid="btn-add-excluded"
          onClick={add}
          disabled={!name.trim()}
        >
          Add
        </button>
      </div>
    </section>
  );
}
