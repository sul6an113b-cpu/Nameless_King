/** App-wide shortcuts: ⌘/Ctrl+Z undo, ⇧⌘Z / Ctrl+Y redo, ⌘/Ctrl+S save JSON. Text fields keep native undo. */
import { useEffect } from 'react';
import { saveModelFile } from '../state/fileOps.ts';
import { useModelStore } from '../state/store.ts';
import { isEditable } from './dom.ts';

export function useGlobalKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        saveModelFile();
        return;
      }
      if (isEditable(e.target)) return;
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useModelStore.getState().undo();
      } else if ((k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey)) {
        e.preventDefault();
        useModelStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
