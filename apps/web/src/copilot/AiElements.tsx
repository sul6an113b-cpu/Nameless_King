/** Accepted AI elements stay tagged `ai-proposed` until the engineer marks them confirmed (BRIEF, copilot). */
import { useMemo } from 'react';
import { aiProposedElements, markConfirmed } from '@looplab/core';
import { useModelStore } from '../state/store.ts';

export function AiElements() {
  const model = useModelStore((s) => s.model);
  const items = useMemo(() => aiProposedElements(model), [model]);
  if (items.length === 0) return null;
  const confirm = (ids?: Set<string>) =>
    useModelStore
      .getState()
      .commit(ids ? 'Mark AI element confirmed' : 'Mark all AI elements confirmed', (m) => markConfirmed(m, ids));

  return (
    <details className="cp-ai" data-testid="ai-proposed-list">
      <summary>
        AI-proposed, not yet confirmed <span className="cp-badge">{items.length}</span>
      </summary>
      <ul>
        {items.map((it) => (
          <li key={`${it.entity}:${it.id}`}>
            <span className="cp-op-text">
              <span className="muted">{it.entity}</span> {it.label}
            </span>
            <button type="button" data-testid={`confirm-${it.id}`} onClick={() => confirm(new Set([it.id]))}>
              Mark confirmed
            </button>
          </li>
        ))}
      </ul>
      <button type="button" data-testid="confirm-all" onClick={() => confirm()}>
        Confirm all
      </button>
    </details>
  );
}
