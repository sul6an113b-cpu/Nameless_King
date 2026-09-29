/**
 * Inspector (right dock): edits the selected element in place — no modals. Map shows the qualitative fields
 * (name, description, link polarity/delay/confidence/mechanism); Quantify adds kind, equation, units, flow
 * ends, lookup table and advanced options.
 */
import { useMemo } from 'react';
import {
  connectFlow,
  getLink,
  getVariable,
  setKind,
  updateLink,
  updateVariable,
  type Confidence,
  type Link,
  type Model,
  type Polarity,
  type Variable,
  type VarKind,
} from '@looplab/core';
import { deleteSelection } from '../canvas/actions.ts';
import { checkUnit, renameVar, unitIssuesFor } from '../lib/engine.ts';
import { EquationEditor } from '../quantify/EquationEditor.tsx';
import { LookupEditor } from '../quantify/LookupEditor.tsx';
import { act } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { TextField } from './fields.tsx';

const KIND_LABEL: Record<VarKind, string> = {
  variable: 'Unquantified (CLD only)',
  stock: 'Stock',
  flow: 'Flow',
  aux: 'Auxiliary',
  constant: 'Constant',
  lookup: 'Lookup (graphical function)',
};

const EQUATION_LABEL: Partial<Record<VarKind, string>> = {
  stock: 'Initial value',
  flow: 'Equation (rate)',
  aux: 'Equation',
  constant: 'Value',
};

export function Inspector() {
  const model = useModelStore((s) => s.model);
  const selection = useUiStore((s) => s.selection);
  const stage = useUiStore((s) => s.stage);

  const existing = selection.filter((id) => getVariable(model, id) || getLink(model, id));
  if (existing.length === 0) return <EmptyInspector stage={stage} model={model} />;
  if (existing.length > 1)
    return (
      <div data-testid="inspector">
        <p>
          <strong>{existing.length}</strong> elements selected.
        </p>
        <button type="button" className="btn danger" onClick={deleteSelection}>
          Delete selected
        </button>
        <p className="note">Tip: Shift-drag on the canvas to box-select; Del deletes.</p>
      </div>
    );
  const id = existing[0];
  const v = getVariable(model, id);
  if (v) return <VariableInspector key={v.id} v={v} model={model} quantify={stage === 'quantify'} />;
  const l = getLink(model, id);
  return l ? <LinkInspector key={l.id} l={l} model={model} /> : null;
}

const TIPS: Record<string, string> = {
  frame: 'Frame the problem first: what behaviour over time worries you, over what horizon, measured by which KPIs?',
  map: 'Select a variable or link to edit it. Press ? for shortcuts.',
  analyze: 'Loop analysis lists every feedback loop with its type (R/B).',
  quantify: 'Select a stock, flow or auxiliary to edit its equation and units.',
  test: 'Run the model, then compare runs by keeping earlier results.',
  decide: 'Record interventions and compare their scenarios.',
};

function EmptyInspector({ stage, model }: { stage: string; model: Model }) {
  const quantified = model.variables.filter((v) => v.kind !== 'variable').length;
  return (
    <div data-testid="inspector">
      <p className="muted">{TIPS[stage] ?? 'Select an element to edit it.'}</p>
      <dl className="kv" style={{ marginTop: 12 }}>
        <dt>Variables</dt>
        <dd>{model.variables.length}</dd>
        <dt>Links</dt>
        <dd>{model.links.length}</dd>
        <dt>Quantified</dt>
        <dd>
          {quantified} of {model.variables.length}
        </dd>
        <dt>Horizon</dt>
        <dd>
          {model.simSpec.start}–{model.simSpec.stop} {model.simSpec.timeUnit}
        </dd>
      </dl>
    </div>
  );
}

function OriginRow({ origin, onConfirm }: { origin: Variable['origin']; onConfirm: () => void }) {
  if (origin === 'user') return null;
  return (
    <div className="row" style={{ margin: '4px 0 10px' }}>
      {origin === 'ai-proposed' ? (
        <>
          <span className="chip ai">AI-proposed</span>
          <button type="button" className="btn small" data-testid="btn-mark-confirmed" onClick={onConfirm}>
            Mark confirmed
          </button>
        </>
      ) : (
        <span className="chip ok">AI · confirmed</span>
      )}
    </div>
  );
}

function VariableInspector({ v, model, quantify }: { v: Variable; model: Model; quantify: boolean }) {
  const stocks = useMemo(() => model.variables.filter((x) => x.kind === 'stock'), [model.variables]);
  return (
    <div data-testid="inspector">
      <TextField
        label="Name"
        value={v.name}
        required
        maxLength={80}
        testId="inspector-name"
        onCommit={(name) => act('Rename variable', (m) => renameVar(m, v.id, name.trim()))}
      />
      <OriginRow
        origin={v.origin}
        onConfirm={() => act('Confirm AI element', (m) => updateVariable(m, v.id, { origin: 'ai-confirmed' }))}
      />

      {quantify ? (
        <label className="field">
          <span>Kind</span>
          <select
            data-testid="inspector-kind"
            value={v.kind}
            onChange={(e) => act('Change kind', (m) => setKind(m, v.id, e.target.value as VarKind))}
          >
            {(Object.keys(KIND_LABEL) as VarKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="note" style={{ margin: '0 0 8px' }}>
          Kind: <span className="chip">{KIND_LABEL[v.kind]}</span>
          {v.kind === 'variable' && ' — quantify it in the Quantify stage.'}
        </p>
      )}

      {quantify && v.kind === 'flow' && v.flow && <FlowEnds v={v} flow={v.flow} stocks={stocks} />}

      {quantify && EQUATION_LABEL[v.kind] && (
        <EquationEditor
          varId={v.id}
          label={EQUATION_LABEL[v.kind] ?? 'Equation'}
          value={v.equation}
          placeholder={v.kind === 'constant' ? 'e.g. 12' : 'Type a name or function; suggestions appear as you type'}
        />
      )}
      {quantify && v.kind === 'lookup' && v.graph && <LookupEditor varId={v.id} graph={v.graph} />}
      {quantify && v.kind !== 'variable' && <UnitsField v={v} model={model} />}

      <TextField
        label="Description"
        value={v.doc}
        multiline
        rows={3}
        maxLength={4000}
        placeholder="What does this variable measure? Assumptions, sources…"
        onCommit={(doc) => act('Edit description', (m) => updateVariable(m, v.id, { doc }))}
      />

      {quantify && (v.kind === 'stock' || v.kind === 'flow' || v.kind === 'aux') && (
        <details className="advanced">
          <summary>Advanced</summary>
          {(v.kind === 'stock' || v.kind === 'flow') && (
            <label className="check">
              <input
                type="checkbox"
                checked={v.nonNegative}
                onChange={(e) =>
                  act('Toggle non-negative', (m) => updateVariable(m, v.id, { nonNegative: e.target.checked }))
                }
              />
              Non-negative{' '}
              {v.kind === 'stock'
                ? '(limits outflows so the stock never goes below zero)'
                : '(clamps the rate at zero)'}
            </label>
          )}
          {(v.kind === 'aux' || v.kind === 'flow') && (
            <>
              <label className="check" style={{ marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={v.graph !== undefined}
                  onChange={(e) =>
                    act(e.target.checked ? 'Add graphical function' : 'Remove graphical function', (m) =>
                      updateVariable(m, v.id, {
                        graph: e.target.checked ? { xs: [0, 1], ys: [0, 1], mode: 'continuous' } : undefined,
                      }),
                    )
                  }
                />
                Apply a graphical function to the result
              </label>
              {v.graph && <LookupEditor varId={v.id} graph={v.graph} />}
            </>
          )}
        </details>
      )}
    </div>
  );
}

function FlowEnds({ v, flow, stocks }: { v: Variable; flow: NonNullable<Variable['flow']>; stocks: Variable[] }) {
  const set = (end: 'from' | 'to', value: string) =>
    act('Connect flow', (m) => connectFlow(m, v.id, { [end]: value === '' ? null : value }));
  return (
    <div className="row">
      {(['from', 'to'] as const).map((end) => (
        <label key={end} className="field">
          <span>{end === 'from' ? 'Drains (from)' : 'Fills (to)'}</span>
          <select data-testid={`flow-${end}`} value={flow[end] ?? ''} onChange={(e) => set(end, e.target.value)}>
            <option value="">Cloud (outside the model)</option>
            {stocks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function UnitsField({ v, model }: { v: Variable; model: Model }) {
  const parse = v.units.trim() === '' ? null : checkUnit(v.units, model);
  const issues = unitIssuesFor(model, v.id);
  return (
    <TextField
      label="Units"
      value={v.units}
      maxLength={120}
      placeholder={v.kind === 'flow' ? `e.g. tasks/${model.simSpec.timeUnit}` : 'e.g. tasks, people, USD, dmnl'}
      testId="inspector-units"
      onCommit={(units) => act('Edit units', (m) => updateVariable(m, v.id, { units: units.trim() }))}
      hint={
        <>
          {parse?.status === 'ok' && !parse.value.ok && <span className="error-text">{parse.value.message}</span>}
          {issues.status === 'ok' &&
            issues.value.map((i, k) => (
              <span key={k} className={i.severity === 'error' ? 'error-text' : 'warn-text'}>
                {i.message}
              </span>
            ))}
          {issues.status === 'unavailable' && (
            <span className="note">Unit checking is available after integration.</span>
          )}
        </>
      }
    />
  );
}

const POLARITIES: { p: Polarity; label: string; title: string }[] = [
  { p: '+', label: '+', title: 'Same direction: if cause rises, effect rises (above what it would have been)' },
  { p: '-', label: '−', title: 'Opposite direction: if cause rises, effect falls' },
  { p: '?', label: '?', title: 'Unknown or ambiguous' },
];
const CONFIDENCE: Confidence[] = ['low', 'medium', 'high'];

function LinkInspector({ l, model }: { l: Link; model: Model }) {
  const from = getVariable(model, l.from)?.name ?? l.from;
  const to = getVariable(model, l.to)?.name ?? l.to;
  const update = (label: string, changes: Parameters<typeof updateLink>[2]) =>
    act(label, (m) => updateLink(m, l.id, changes));
  return (
    <div data-testid="inspector">
      <p style={{ marginTop: 0 }}>
        <strong>{from}</strong> → <strong>{to}</strong>
        {l.from === l.to && (
          <span className="chip" style={{ marginLeft: 6 }}>
            self-link
          </span>
        )}
      </p>
      <OriginRow origin={l.origin} onConfirm={() => update('Confirm AI element', { origin: 'ai-confirmed' })} />
      <div className="field">
        <span className="field-label">Polarity</span>
        <div className="seg" role="group" aria-label="Polarity">
          {POLARITIES.map((x) => (
            <button
              key={x.p}
              type="button"
              aria-pressed={l.polarity === x.p}
              title={x.title}
              data-testid={`polarity-${x.p === '-' ? 'neg' : x.p === '+' ? 'pos' : 'unknown'}`}
              onClick={() => update('Set polarity', { polarity: x.p })}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <label className="check" style={{ marginBottom: 8 }}>
        <input
          type="checkbox"
          data-testid="link-delay"
          checked={l.delay}
          onChange={() => update('Toggle delay', { delay: !l.delay })}
        />
        Significant delay (‖)
      </label>
      <div className="field">
        <span className="field-label">Confidence</span>
        <div className="seg" role="group" aria-label="Confidence">
          {CONFIDENCE.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={l.confidence === c}
              onClick={() => update('Set confidence', { confidence: c })}
            >
              {c}
            </button>
          ))}
        </div>
        {l.confidence === 'low' && <span className="note">Low-confidence links are drawn dashed.</span>}
      </div>
      <TextField
        label="Mechanism"
        value={l.note}
        multiline
        rows={4}
        maxLength={2000}
        placeholder="How does the cause change the effect? Evidence or source."
        onCommit={(note) => update('Edit mechanism', { note })}
      />
      <button type="button" className="btn danger" onClick={deleteSelection}>
        Delete link
      </button>
    </div>
  );
}
