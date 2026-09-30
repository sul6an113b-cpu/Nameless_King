/**
 * Analyze: feedback loops (R/B, highlight on the map), participation and betweenness, archetype candidates to
 * confirm or reject, structural leverage Pareto. Everything is derived from the model with the core graph functions.
 */
import { useMemo } from 'react';
import {
  betweenness,
  findLoops,
  loopParticipation,
  matchArchetypes,
  newId,
  structuralLeverage,
  type Loop,
  type Model,
} from '@looplab/core';
import { CldCanvas } from '../canvas/CldCanvas.tsx';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';

const TYPE_TITLE = { R: 'Reinforcing', B: 'Balancing', U: 'Unknown polarity' } as const;

function loopSelection(loop: Loop): string[] {
  return [...loop.varIds, ...loop.linkIds];
}

function LoopList({ loops, names, model }: { loops: Loop[]; names: Record<string, string>; model: Model }) {
  const selection = useUiStore((s) => s.selection);
  const select = useUiStore((s) => s.select);
  const annotation = (key: string) => model.loopAnnotations.find((a) => a.key === key)?.name ?? '';
  return (
    <ul className="loop-list" data-testid="loop-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {loops.map((loop, i) => {
        const ids = loopSelection(loop);
        const active = ids.length > 0 && ids.every((id) => selection.includes(id));
        return (
          <li key={loop.key}>
            <button
              type="button"
              className={`btn ghost${active ? ' active' : ''}`}
              data-testid={`loop-item-${i}`}
              aria-pressed={active}
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, textAlign: 'left' }}
              onClick={() => select(active ? [] : ids)}
            >
              <strong data-testid={`loop-type-${i}`} title={TYPE_TITLE[loop.type]}>
                {loop.type}
              </strong>
              <span>
                {annotation(loop.key) || loop.varIds.map((v) => names[v] ?? v).join(' → ')}
                {loop.hasDelay && <span className="muted"> · delay</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ParticipationTable({ model, loops }: { model: Model; loops: Loop[] }) {
  const rows = useMemo(() => {
    const part = loopParticipation(loops);
    const btw = betweenness(model);
    return model.variables
      .map((v) => ({ id: v.id, name: v.name, loops: part[v.id] ?? 0, btw: btw[v.id] ?? 0 }))
      .sort((a, b) => b.loops - a.loops || b.btw - a.btw);
  }, [model, loops]);
  return (
    <table className="table" data-testid="participation-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>Loops</th>
          <th>Betweenness</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.name}</td>
            <td>{r.loops}</td>
            <td>{r.btw.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Archetypes({ model, loops, names }: { model: Model; loops: Loop[]; names: Record<string, string> }) {
  const commit = useModelStore((s) => s.commit);
  const matches = useMemo(() => matchArchetypes(model, loops), [model, loops]);
  const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((k) => b.includes(k));

  const decide = (m: (typeof matches)[number], status: 'confirmed' | 'rejected' | 'candidate') =>
    commit(`${status === 'confirmed' ? 'Confirm' : status === 'rejected' ? 'Reject' : 'Reset'} archetype`, (cur) => {
      const existing = cur.archetypeFindings.find(
        (f) => f.archetypeId === m.archetypeId && sameKeys(f.loopKeys, m.loopKeys),
      );
      return {
        ...cur,
        archetypeFindings: existing
          ? cur.archetypeFindings.map((f) => (f === existing ? { ...f, status } : f))
          : [
              ...cur.archetypeFindings,
              { id: newId('f'), archetypeId: m.archetypeId, loopKeys: m.loopKeys, roles: m.roles, status, note: '' },
            ],
      };
    });

  if (!matches.length) return <p className="muted">No archetype candidates match this structure.</p>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} data-testid="archetype-list">
      {matches.map((m, i) => {
        const status =
          model.archetypeFindings.find((f) => f.archetypeId === m.archetypeId && sameKeys(f.loopKeys, m.loopKeys))
            ?.status ?? 'candidate';
        return (
          <li key={`${m.archetypeId}-${m.loopKeys.join('|')}`} className="card" data-testid={`archetype-${i}`}>
            <h3 style={{ marginTop: 0 }}>
              {m.archetypeId.replace(/-/g, ' ')} <span className="muted">{Math.round(m.score * 100)}%</span>{' '}
              <span className="muted" data-testid={`archetype-status-${i}`}>
                {status}
              </span>
            </h3>
            <p className="muted" style={{ margin: '0 0 6px' }}>
              {m.explanation}
            </p>
            <p style={{ margin: '0 0 6px', fontSize: 12 }}>
              {Object.entries(m.roles)
                .map(([role, id]) => `${role}: ${names[id] ?? id}`)
                .join(' · ')}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn small${status === 'confirmed' ? ' active' : ''}`}
                data-testid={`archetype-confirm-${i}`}
                onClick={() => decide(m, status === 'confirmed' ? 'candidate' : 'confirmed')}
              >
                Confirm
              </button>
              <button
                type="button"
                className={`btn small${status === 'rejected' ? ' active' : ''}`}
                data-testid={`archetype-reject-${i}`}
                onClick={() => decide(m, status === 'rejected' ? 'candidate' : 'rejected')}
              >
                Reject
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Pareto: bars = structural leverage score (descending), line = cumulative share. Plain SVG, text via React. */
export function LeveragePareto({ rows }: { rows: { name: string; score: number; cumulativeShare: number }[] }) {
  const W = 320;
  const H = 150;
  const top = rows.slice(0, 12);
  const max = Math.max(...top.map((r) => r.score), 1e-9);
  const bw = W / Math.max(top.length, 1);
  const line = top.map((r, i) => `${(i + 0.5) * bw},${H - r.cumulativeShare * H}`).join(' ');
  return (
    <div data-testid="leverage-pareto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Structural leverage Pareto"
        data-testid="chart-pareto"
      >
        {top.map((r, i) => {
          const h = (r.score / max) * H;
          return (
            <rect key={r.name + i} x={i * bw + 2} y={H - h} width={Math.max(bw - 4, 1)} height={h} fill="var(--accent, #4f6bed)">
              <title>{`${r.name}: ${r.score.toFixed(3)}`}</title>
            </rect>
          );
        })}
        <polyline points={line} fill="none" stroke="var(--text, currentColor)" strokeWidth="1.5" />
      </svg>
      <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
        {top.map((r, i) => (
          <li key={r.name + i}>
            {r.name} <span className="muted">{r.score.toFixed(2)} · {Math.round(r.cumulativeShare * 100)}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AnalyzeStage() {
  const model = useModelStore((s) => s.model);
  const analysis = useMemo(() => findLoops(model), [model]);
  const { loops } = analysis;
  const names = useMemo(() => Object.fromEntries(model.variables.map((v) => [v.id, v.name])), [model]);
  const leverage = useMemo(
    () =>
      structuralLeverage(model, loops).map((r) => ({
        name: names[r.varId] ?? r.varId,
        score: r.score,
        cumulativeShare: r.cumulativeShare,
      })),
    [model, loops, names],
  );

  return (
    <div className="stage-body" style={{ flexDirection: 'row' }}>
      <div className="stage-body" style={{ flex: '1 1 50%' }}>
        <CldCanvas />
      </div>
      <div className="stage-scroll" style={{ flex: '0 0 420px' }}>
        <section className="card">
          <h2>
            Feedback loops <span className="muted">{loops.length}</span>
          </h2>
          {analysis.truncated && (
            <div className="banner" role="alert" data-testid="loop-cap-warning">
              Showing the first {analysis.cap} loops only — the search stopped at the {analysis.reason === 'time' ? 'time budget' : 'loop cap'}.
              Raise the cap in settings or simplify the map; counts and rankings below are incomplete.
            </div>
          )}
          {loops.length ? (
            <LoopList loops={loops} names={names} model={model} />
          ) : (
            <p className="muted">No feedback loops yet. Close a cycle in Map.</p>
          )}
        </section>
        <section className="card">
          <h2>Participation and betweenness</h2>
          <ParticipationTable model={model} loops={loops} />
        </section>
        <section className="card">
          <h2>Archetype candidates</h2>
          <Archetypes model={model} loops={loops} names={names} />
        </section>
        <section className="card">
          <h2>Structural leverage</h2>
          {leverage.length ? <LeveragePareto rows={leverage} /> : <p className="muted">Nothing to rank yet.</p>}
        </section>
      </div>
    </div>
  );
}
