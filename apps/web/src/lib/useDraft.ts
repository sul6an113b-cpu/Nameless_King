import { useState } from 'react';

/**
 * Local draft of a model value: edits stay local until committed (blur/Enter = one undo step), and the
 * draft resets whenever the committed value changes underneath (undo, redo, copilot, open file).
 */
export function useDraft<T>(value: T): [T, (v: T) => void] {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (!Object.is(seen, value)) {
    setSeen(value);
    setDraft(value);
  }
  return [draft, setDraft];
}
