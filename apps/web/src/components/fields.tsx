/** Form fields that edit the model: local draft, commit on blur or Enter (one undo step per edit). */
import { useId, useState, type ReactNode } from 'react';
import { useDraft } from '../lib/useDraft.ts';

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (v: string) => boolean | void;
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  testId?: string;
  hint?: ReactNode;
  required?: boolean;
}

export function TextField({
  label,
  value,
  onCommit,
  multiline,
  rows = 3,
  placeholder,
  maxLength,
  testId,
  hint,
  required,
}: TextFieldProps) {
  const [draft, setDraft] = useDraft(value);
  const id = useId();
  const commit = () => {
    if (draft === value) return;
    if (required && draft.trim() === '') return setDraft(value);
    if (onCommit(draft) === false) setDraft(value);
  };
  const common = {
    id,
    value: draft,
    placeholder,
    maxLength,
    'data-testid': testId,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea {...common} rows={rows} />
      ) : (
        <input
          {...common}
          type="text"
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(value);
          }}
        />
      )}
      {hint}
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onCommit: (v: number | undefined) => boolean | void;
  allowEmpty?: boolean;
  min?: number;
  testId?: string;
  suffix?: string;
}

const formatNumber = (v: number | undefined): string => (v === undefined ? '' : String(v));

export function NumberField({ label, value, onCommit, allowEmpty, min, testId, suffix }: NumberFieldProps) {
  const [draft, setDraft] = useDraft(formatNumber(value));
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const commit = () => {
    const text = draft.trim();
    if (text === formatNumber(value)) return setError(null);
    if (text === '' && allowEmpty) {
      setError(null);
      if (onCommit(undefined) === false) setDraft(formatNumber(value));
      return;
    }
    const n = Number(text);
    if (text === '' || !Number.isFinite(n)) return setError('Enter a number');
    if (min !== undefined && n < min) return setError(`Must be at least ${min}`);
    setError(null);
    if (onCommit(n) === false) setDraft(formatNumber(value));
  };
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <span className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft}
          data-testid={testId}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        {suffix && <span className="muted small">{suffix}</span>}
      </span>
      {error && <span className="error-text">{error}</span>}
    </label>
  );
}

export function Unavailable({ what, children }: { what: string; children?: ReactNode }) {
  return (
    <div className="unavailable" data-state="unavailable" role="note">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" />
        <path d="M8 4.5v4l2.5 1.5" fill="none" stroke="currentColor" strokeLinecap="round" />
      </svg>
      <span>
        {what} will be available after integration{children ? ': ' : '.'}
        {children}
      </span>
    </div>
  );
}
