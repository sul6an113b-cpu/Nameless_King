/**
 * Graphical function (lookup) editor: an x/y table with a mini chart. Edits stay local while focus is inside
 * the table and are committed as one undo step when focus leaves it (or on Enter), if valid.
 */
import { useMemo, useState } from 'react';
import { updateVariable, type GraphicalFunction, type Id } from '@looplab/core';
import { lookupPath, parseRows, toRows, type Row } from '../lib/lookup.ts';
import { useDraft } from '../lib/useDraft.ts';
import { act } from '../state/actions.ts';

const MODES: { id: GraphicalFunction['mode']; label: string }[] = [
  { id: 'continuous', label: 'Continuous (clamp at ends)' },
  { id: 'extrapolate', label: 'Extrapolate' },
  { id: 'discrete', label: 'Discrete (steps)' },
];

export function LookupEditor({ varId, graph }: { varId: Id; graph: GraphicalFunction }) {
  const initial = useMemo(() => toRows(graph), [graph]);
  const [rows, setRows] = useDraft(initial);
  const [touched, setTouched] = useState(false);
  const parsed = parseRows(rows);
  const shown = parsed.ok ? parsed : { xs: graph.xs, ys: graph.ys };

  const commit = (nextRows = rows, mode = graph.mode) => {
    const p = parseRows(nextRows);
    if (!p.ok) return;
    const same =
      mode === graph.mode &&
      p.xs.length === graph.xs.length &&
      p.xs.every((x, i) => x === graph.xs[i] && p.ys[i] === graph.ys[i]);
    if (!same) act('Edit lookup', (m) => updateVariable(m, varId, { graph: { xs: p.xs, ys: p.ys, mode } }));
    setTouched(false);
  };

  const edit = (i: number, key: keyof Row, v: string) => {
    setTouched(true);
    setRows(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  };

  const addRow = () => {
    const last = parseRows(rows).ok ? rows[rows.length - 1] : undefined;
    const x = last ? Number(last.x) + 1 : rows.length;
    const next = [...rows, { x: String(x), y: last?.y ?? '0' }];
    setRows(next);
    commit(next);
  };

  const removeRow = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    setRows(next);
    commit(next);
  };

  return (
    <div className="field" data-testid="lookup-editor">
      <span className="field-label">Graphical function</span>
      <svg className="mini-chart" viewBox="0 0 260 110" preserveAspectRatio="none" role="img" aria-label="Lookup curve">
        <line className="grid-line" x1="6" y1="55" x2="254" y2="55" />
        <path
          className="curve"
          d={lookupPath(shown.xs, shown.ys, graph.mode, 260, 110)}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        onBlur={(e) => {
          if (touched && !e.currentTarget.contains(e.relatedTarget)) commit();
        }}
      >
        <table className="lookup-table">
          <thead>
            <tr>
              <th>x (input)</th>
              <th>y (output)</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {(['x', 'y'] as const).map((k) => (
                  <td key={k}>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`${k} ${i + 1}`}
                      value={r[k]}
                      onChange={(e) => edit(i, k, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commit();
                      }}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="btn ghost icon small"
                    aria-label={`Remove row ${i + 1}`}
                    disabled={rows.length <= 2}
                    onClick={() => removeRow(i)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 4 }}>
          <button type="button" className="btn small" onClick={addRow}>
            + Row
          </button>
          <select
            aria-label="Lookup mode"
            value={graph.mode}
            onChange={(e) => commit(rows, e.target.value as GraphicalFunction['mode'])}
            style={{ flex: 1 }}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        {!parsed.ok && <p className="error-text">{parsed.error}</p>}
      </div>
    </div>
  );
}
