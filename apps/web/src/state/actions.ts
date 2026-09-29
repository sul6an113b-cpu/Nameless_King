/** UI-facing commit: one user action = one undo step; a rejected op shows a toast and changes nothing. */
import type { Model } from '@looplab/core';
import { useModelStore } from './store.ts';
import { useUiStore } from './ui.ts';

export function act(label: string, recipe: (m: Model) => Model): boolean {
  try {
    useModelStore.getState().commit(label, recipe);
    return true;
  } catch (e) {
    useUiStore.getState().toast(e instanceof Error ? e.message : String(e), 'error');
    return false;
  }
}

/** Replace the whole model (open, example, new): clears history and selection. */
export function loadModel(model: Model): void {
  useUiStore.setState({ selection: [], renamingId: null, linkSource: null });
  useModelStore.getState().load(model);
}
