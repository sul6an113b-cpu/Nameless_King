/**
 * Equation editor (SPEC §8): a textarea with an ARIA-combobox suggestion list driven by the identifier at the
 * caret — variable names and builtins — plus inline parse diagnostics. Enter commits (Shift+Enter = newline).
 */
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { updateVariable, type Id } from '@looplab/core';
import { applySuggestion, suggest, tokenAt, type Suggestion, type Token } from '../lib/autocomplete.ts';
import { builtinSuggestions, checkEquation } from '../lib/engine.ts';
import { useDraft } from '../lib/useDraft.ts';
import { act } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';

interface Props {
  varId: Id;
  label: string;
  value: string;
  placeholder?: string;
}

export function EquationEditor({ varId, label, value, placeholder }: Props) {
  const variables = useModelStore((s) => s.model.variables);
  const [draft, setDraft] = useDraft(value);
  const [token, setToken] = useState<Token | null>(null);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const id = useId();
  const listId = `${id}-list`;

  const names = useMemo(() => variables.filter((v) => v.id !== varId).map((v) => v.name), [variables, varId]);
  const builtins = useMemo(() => builtinSuggestions(), []);
  const suggestions: Suggestion[] = token ? suggest(token.prefix, names, builtins) : [];
  const open = suggestions.length > 0;
  const check = useMemo(() => (draft.trim() === '' ? null : checkEquation(draft)), [draft]);

  const onText = (text: string, caret: number) => {
    setDraft(text);
    setToken(tokenAt(text, caret));
    setActive(0);
  };

  const accept = (s: Suggestion) => {
    if (!token) return;
    const r = applySuggestion(draft, token, s);
    setDraft(r.text);
    setToken(null);
    pendingCaret.current = r.caret;
  };

  // Place the caret after an accepted suggestion right after React writes the new value (before more keys).
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(caret, caret);
  });

  const commit = () => {
    setToken(null);
    if (draft !== value) act('Edit equation', (m) => updateVariable(m, varId, { equation: draft }));
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="eq-wrap">
        <textarea
          ref={ref}
          id={id}
          className="eq-input"
          data-testid="equation-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          aria-invalid={check?.status === 'ok' && !check.value.ok ? true : undefined}
          spellCheck={false}
          rows={2}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => onText(e.target.value, e.target.selectionStart)}
          onClick={(e) => setToken(tokenAt(draft, e.currentTarget.selectionStart))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (open) {
              const pick = suggestions[active];
              if (e.key === 'ArrowDown') setActive((active + 1) % suggestions.length);
              else if (e.key === 'ArrowUp') setActive((active - 1 + suggestions.length) % suggestions.length);
              else if ((e.key === 'Enter' || e.key === 'Tab') && pick) accept(pick);
              else if (e.key === 'Escape') setToken(null);
              else return;
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
          }}
        />
        {open && (
          <ul className="eq-suggest" id={listId} role="listbox" aria-label="Suggestions">
            {suggestions.map((s, i) => (
              <li
                key={`${s.kind}:${s.label}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  accept(s);
                }}
              >
                <span className="sugg-kind">{s.kind === 'variable' ? 'var' : 'fn'}</span>
                <span>{s.kind === 'variable' ? s.insert : s.label}</span>
                {s.detail && <span className="sugg-detail">{s.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Diagnostics text={draft} check={check} />
    </div>
  );
}

function Diagnostics({ text, check }: { text: string; check: ReturnType<typeof checkEquation> | null }) {
  if (!check) return null;
  if (check.status === 'unavailable') return <p className="note">Equation checking is available after integration.</p>;
  if (check.status === 'error') return <p className="error-text">{check.message}</p>;
  if (check.value.ok) return <p className="ok-text">✓ Parses</p>;
  const { message, span } = check.value.error;
  const start = Math.max(0, Math.min(span.start, text.length));
  const end = Math.max(start, Math.min(span.end, text.length));
  return (
    <div role="alert">
      <p className="error-text">
        {message} (col {start + 1})
      </p>
      <p className="eq-error-snippet">
        {text.slice(0, start)}
        <mark>{text.slice(start, end) || ' '}</mark>
        {text.slice(end)}
      </p>
    </div>
  );
}
