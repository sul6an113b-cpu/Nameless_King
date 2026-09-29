/**
 * Copilot side panel (owner: copilot): mode picker, chat, tool trace (collapsed), token usage per call, patch diff with
 * per-op accept/reject, errors, and the list of AI-proposed elements to confirm. Available in every stage.
 */
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { COPILOT_MODES, type CopilotMode, type Stage, type ToolTraceEntry, type UsageEntry } from '@looplab/core';
import { AiElements } from './AiElements.tsx';
import { Markdown } from './Markdown.tsx';
import { PatchReview } from './PatchReview.tsx';
import { useCopilotStore, type ChatEntry } from './store.ts';
import './copilot.css';

const MODE_INFO: Record<CopilotMode, { label: string; hint: string }> = {
  interview: { label: 'Interview', hint: 'Socratic questions → a proposed causal loop diagram.' },
  critique: { label: 'Critique', hint: 'Convention and logic errors, cited by element id.' },
  explain: { label: 'Explain', hint: 'A plain-language story for each feedback loop.' },
  intervene: { label: 'Intervene', hint: 'Interventions with a Meadows level, simulated before proposing.' },
  report: { label: 'Report', hint: 'Drafts the decision brief, recommendation first.' },
};

const fmt = (n: number) => n.toLocaleString('en-US');

function RunDetails({ trace, usage }: { trace: ToolTraceEntry[]; usage: UsageEntry[] }) {
  if (trace.length === 0 && usage.length === 0) return null;
  return (
    <div className="cp-run">
      {trace.length > 0 && (
        <details className="cp-trace" data-testid="copilot-trace">
          <summary>Tool trace · {trace.length} call(s)</summary>
          <ol>
            {trace.map((t, i) => (
              <li key={i} className={t.ok ? '' : 'cp-bad'}>
                <code>{t.name}</code> {t.ok ? '✓' : '✕'} <span className="muted">{t.summary}</span>
                {t.ms > 0 && <span className="muted"> · {t.ms} ms</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      <ul className="cp-usage" aria-label="Token usage per API call" data-testid="copilot-usage">
        {usage.map((u) => (
          <li key={u.call}>
            #{u.call} in {fmt(u.inputTokens)} · cache read {fmt(u.cacheReadInputTokens)} · cache write{' '}
            {fmt(u.cacheCreationInputTokens)} · out {fmt(u.outputTokens)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Answer({ entry, onOption, busy }: { entry: ChatEntry; onOption: (text: string) => void; busy: boolean }) {
  const out = entry.output;
  if (!out) return null;
  switch (out.kind) {
    case 'question':
      return (
        <div>
          <p className="cp-question">{out.question}</p>
          {out.why && <p className="cp-small muted">Why it matters: {out.why}</p>}
          {out.options.length > 0 && (
            <div className="cp-options">
              {out.options.map((o) => (
                <button key={o} type="button" disabled={busy} onClick={() => onOption(o)}>
                  {o}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    case 'answer':
      return (
        <div>
          <Markdown source={out.markdown} />
          {out.findings.length > 0 && (
            <ul className="cp-findings" aria-label="Findings">
              {out.findings.map((f, i) => (
                <li key={i} className={`cp-sev-${f.severity}`}>
                  <strong>{f.severity}</strong> <code>{f.rule}</code> {f.message}
                  {f.elementIds.length > 0 && <span className="muted"> — {f.elementIds.join(', ')}</span>}
                </li>
              ))}
            </ul>
          )}
          {out.hypotheses.length > 0 && (
            <ul className="cp-hyp" aria-label="Hypotheses">
              {out.hypotheses.map((h, i) => (
                <li key={i}>Hypothesis: {h}</li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'patch':
      return (
        <p>
          Proposed <strong>{out.patch.title}</strong> ({out.patch.ops.length} change(s)) — review it below.
        </p>
      );
  }
}

export function CopilotPanel({ stage = 'map' }: { stage?: Stage }) {
  const mode = useCopilotStore((s) => s.mode);
  const entries = useCopilotStore((s) => s.entries);
  const busy = useCopilotStore((s) => s.busy);
  const error = useCopilotStore((s) => s.error);
  const failed = useCopilotStore((s) => s.failed);
  const pendingPatch = useCopilotStore((s) => s.pendingPatch);
  const lastApply = useCopilotStore((s) => s.lastApply);
  const { setMode, send, cancel, clearChat } = useCopilotStore.getState();
  const [draft, setDraft] = useState('');

  const pendingEntry = [...entries].reverse().find((e) => e.output?.kind === 'patch');
  const hypotheses = pendingEntry?.output?.kind === 'patch' ? pendingEntry.output.hypotheses : [];

  const submit = (text: string) => {
    if (busy) return;
    setDraft('');
    void send(text, stage);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <section data-testid="copilot-panel" aria-label="Copilot" className="copilot">
      <div className="cp-modes" role="radiogroup" aria-label="Copilot mode">
        {COPILOT_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={m === mode}
            data-testid={`copilot-mode-${m}`}
            className={m === mode ? 'active' : ''}
            onClick={() => setMode(m)}
          >
            {MODE_INFO[m].label}
          </button>
        ))}
      </div>
      <p className="cp-small muted">{MODE_INFO[mode].hint}</p>

      {entries.length > 0 && (
        <ol className="cp-log" aria-label="Copilot conversation" aria-live="polite">
          {entries.map((e) => (
            <li key={e.id} className={`cp-msg cp-${e.role}`}>
              {e.role === 'user' ? (
                <p>{e.text}</p>
              ) : (
                <>
                  <Answer entry={e} onOption={submit} busy={busy} />
                  <RunDetails trace={e.trace ?? []} usage={e.usage ?? []} />
                </>
              )}
            </li>
          ))}
        </ol>
      )}
      {busy && (
        <p className="cp-small muted" role="status">
          Working — Claude may call up to 8 read-only tools…
        </p>
      )}

      {error && (
        <div role="alert" className="cp-error" data-testid="copilot-error">
          <strong>{error.code === 'refusal' ? 'Claude declined' : 'Copilot error'}</strong>
          <p>{error.message}</p>
          <p className="cp-small">The model was not changed.</p>
          {failed && <RunDetails trace={failed.trace} usage={failed.usage} />}
        </div>
      )}

      {pendingPatch && <PatchReview patch={pendingPatch} hypotheses={hypotheses} />}
      {lastApply && (
        <p className="cp-small" role="status" data-testid="patch-result">
          {lastApply.applied.length > 0
            ? `Applied ${lastApply.applied.length} change(s) (undo with ⌘/Ctrl+Z).`
            : 'Nothing was applied.'}
          {lastApply.skipped.map((s) => (
            <span key={s.opId} className="cp-op-warn">
              Skipped {s.opId}: {s.reason}
            </span>
          ))}
        </p>
      )}

      <AiElements />

      <form className="cp-composer" onSubmit={onSubmit}>
        <textarea
          data-testid="copilot-input"
          aria-label="Message to the copilot"
          rows={3}
          value={draft}
          placeholder={`Message (${MODE_INFO[mode].label}) — empty sends a default request · ⌘/Ctrl+Enter`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="cp-row">
          {busy ? (
            <button type="button" onClick={cancel}>
              Stop
            </button>
          ) : (
            <button type="submit" className="cp-primary" data-testid="copilot-send">
              Send
            </button>
          )}
          {entries.length > 0 && !busy && (
            <button type="button" onClick={clearChat}>
              New chat
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
