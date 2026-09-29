/** Inline rename on the canvas (no modal): Enter or blur commits, Escape cancels. */
import { useRef, useState } from 'react';
import { renameVar } from '../lib/engine.ts';
import { act } from '../state/actions.ts';
import { useUiStore } from '../state/ui.ts';

export function NameEditor({ id, name }: { id: string; name: string }) {
  const [value, setValue] = useState(name);
  const done = useRef(false);

  const finish = (commit: boolean, keepOnError: boolean) => {
    if (done.current) return;
    const next = value.trim();
    if (commit && next && next !== name) {
      const ok = act('Rename variable', (m) => renameVar(m, id, next));
      if (!ok && keepOnError) return;
    }
    done.current = true;
    useUiStore.getState().setRenaming(null);
  };

  return (
    <input
      className="name-editor nodrag nopan"
      aria-label="Variable name"
      autoFocus
      value={value}
      maxLength={80}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true, true);
        else if (e.key === 'Escape') finish(false, false);
      }}
      onBlur={() => finish(true, false)}
    />
  );
}
