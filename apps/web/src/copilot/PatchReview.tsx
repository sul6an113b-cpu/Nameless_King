/** Diff list of the pending patch with per-op accept/reject (test ids per SPEC §8). Nothing applies without accept. */
import { useMemo } from 'react';
import { previewPatch, type Patch } from '@looplab/core';
import { useModelStore } from '../state/store.ts';
import { describeOp, opSign } from './describe.ts';
import { useCopilotStore } from './store.ts';

export function PatchReview({ patch, hypotheses }: { patch: Patch; hypotheses: string[] }) {
  const model = useModelStore((s) => s.model);
  const decisions = useCopilotStore((s) => s.decisions);
  const { decideOp, acceptAll, rejectAll, applyDecisions, discardPatch } = useCopilotStore.getState();
  const wontApply = useMemo(
    () => new Map(previewPatch(model, patch).skipped.map((s) => [s.opId, s.reason])),
    [model, patch],
  );
  const accepted = patch.ops.filter((op) => decisions[op.opId] === 'accept').length;

  return (
    <section className="cp-patch" aria-label="Proposed changes" data-testid="patch-review">
      <header className="cp-patch-head">
        <strong>{patch.title}</strong>
        <span className="muted">{patch.ops.length} change(s)</span>
      </header>
      <p className="cp-small">{patch.rationale}</p>
      {hypotheses.length > 0 && (
        <ul className="cp-hyp" aria-label="Hypotheses">
          {hypotheses.map((h, i) => (
            <li key={i}>Hypothesis: {h}</li>
          ))}
        </ul>
      )}
      <div className="cp-row">
        <button type="button" data-testid="patch-accept-all" onClick={acceptAll}>
          Accept all
        </button>
        <button type="button" data-testid="patch-reject-all" onClick={rejectAll}>
          Reject all
        </button>
      </div>
      <ul className="cp-ops">
        {patch.ops.map((op) => {
          const decision = decisions[op.opId] ?? 'pending';
          const text = describeOp(op, model, patch);
          const problem = wontApply.get(op.opId);
          return (
            <li
              key={op.opId}
              data-testid={`patch-op-${op.opId}`}
              data-decision={decision}
              className={`cp-op cp-op-${decision}`}
            >
              <span className={`cp-sign cp-sign-${op.op}`} aria-hidden="true">
                {opSign(op)}
              </span>
              <span className="cp-op-text">
                {text}
                {problem && <span className="cp-op-warn">won’t apply now: {problem}</span>}
              </span>
              <button
                type="button"
                className="cp-icon"
                data-testid={`patch-accept-${op.opId}`}
                aria-label={`Accept: ${text}`}
                aria-pressed={decision === 'accept'}
                onClick={() => decideOp(op.opId, 'accept')}
              >
                ✓
              </button>
              <button
                type="button"
                className="cp-icon"
                data-testid={`patch-reject-${op.opId}`}
                aria-label={`Reject: ${text}`}
                aria-pressed={decision === 'reject'}
                onClick={() => decideOp(op.opId, 'reject')}
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <div className="cp-row">
        <button
          type="button"
          className="cp-primary"
          data-testid="patch-apply"
          disabled={accepted === 0}
          onClick={() => applyDecisions()}
        >
          Apply {accepted} accepted
        </button>
        <button type="button" data-testid="patch-discard" onClick={discardPatch}>
          Discard
        </button>
      </div>
    </section>
  );
}
