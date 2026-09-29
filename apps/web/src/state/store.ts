/**
 * Model store (SPEC §8) — owner: canvas-ui from Phase 2. Phase-1 scaffold implements the contract:
 * one user action = one `commit` = one undo step; history capped at 200 snapshots.
 */
import { create } from 'zustand';
import { createEmptyModel, type Model } from '@looplab/core';

export const HISTORY_CAP = 200;

interface HistoryEntry {
  label: string;
  model: Model;
}

export interface ModelState {
  model: Model;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Apply a pure model op; throws (e.g. ModelOpError) without changing state if the recipe throws. */
  commit: (label: string, recipe: (m: Model) => Model) => void;
  undo: () => void;
  redo: () => void;
  /** Replace the model (open file, example, restore); clears history. */
  load: (model: Model) => void;
}

export const useModelStore = create<ModelState>()((set, get) => ({
  model: createEmptyModel('Untitled model'),
  past: [],
  future: [],
  commit(label, recipe) {
    const prev = get().model;
    const next = recipe(prev);
    if (next === prev) return;
    set({ model: next, past: [...get().past, { label, model: prev }].slice(-HISTORY_CAP), future: [] });
  },
  undo() {
    const { past, future, model } = get();
    const last = past[past.length - 1];
    if (!last) return;
    set({ model: last.model, past: past.slice(0, -1), future: [{ label: last.label, model }, ...future] });
  },
  redo() {
    const { past, future, model } = get();
    const next = future[0];
    if (!next) return;
    set({ model: next.model, past: [...past, { label: next.label, model }], future: future.slice(1) });
  },
  load(model) {
    set({ model, past: [], future: [] });
  },
}));
