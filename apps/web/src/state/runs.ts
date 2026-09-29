/**
 * Simulation runs kept for comparison (session only, not saved in the model). Colours follow the variable
 * (a stable slot while it stays plotted) and dash patterns follow the run, so toggling one never repaints
 * the others.
 */
import { create } from 'zustand';
import type { Id, SimResult } from '@looplab/core';

export interface Run {
  seq: number;
  name: string;
  result: SimResult;
  ms: number;
}

export const MAX_RUNS = 6;
export const MAX_PLOTTED = 8;
export const MAX_SHOWN = 4;

export interface RunsState {
  runs: Run[];
  /** runs overlaid on the chart */
  shown: number[];
  /** plotted variable → colour slot 0..7 */
  slots: Record<Id, number>;
  /** sequence number of the next run (restarts at 1 for a new model) */
  nextSeq: number;
  addRun: (result: SimResult, ms: number, defaults: Id[]) => void;
  removeRun: (seq: number) => void;
  toggleShown: (seq: number) => void;
  togglePlotted: (id: Id) => void;
  clear: () => void;
}

function freeSlot(slots: Record<Id, number>): number | null {
  const used = new Set(Object.values(slots));
  for (let s = 0; s < MAX_PLOTTED; s++) if (!used.has(s)) return s;
  return null;
}

export const useRunsStore = create<RunsState>()((set, get) => ({
  runs: [],
  shown: [],
  slots: {},
  nextSeq: 1,
  addRun(result, ms, defaults) {
    const seq = get().nextSeq;
    const run: Run = { seq, name: `Run ${seq}`, result, ms };
    const runs = [...get().runs, run].slice(-MAX_RUNS);
    const kept = new Set(runs.map((r) => r.seq));
    const shown = [...get().shown.filter((s) => kept.has(s)), run.seq].slice(-MAX_SHOWN);
    let slots = get().slots;
    if (Object.keys(slots).length === 0) {
      slots = {};
      for (const id of defaults.slice(0, MAX_PLOTTED)) slots[id] = Object.keys(slots).length;
    }
    set({ runs, shown, slots, nextSeq: seq + 1 });
  },
  removeRun(s) {
    set({ runs: get().runs.filter((r) => r.seq !== s), shown: get().shown.filter((x) => x !== s) });
  },
  toggleShown(s) {
    const shown = get().shown;
    if (shown.includes(s)) set({ shown: shown.filter((x) => x !== s) });
    else set({ shown: [...shown, s].slice(-MAX_SHOWN) });
  },
  togglePlotted(id) {
    const slots = { ...get().slots };
    if (id in slots) delete slots[id];
    else {
      const slot = freeSlot(slots);
      if (slot === null) return;
      slots[id] = slot;
    }
    set({ slots });
  },
  clear() {
    set({ runs: [], shown: [], slots: {}, nextSeq: 1 });
  },
}));

/** Dash pattern of a run (by its sequence number, so it never changes while the run exists). */
export const RUN_DASHES: number[][] = [[], [7, 4], [2, 3], [10, 3, 2, 3]];
export const dashOf = (s: number): number[] => RUN_DASHES[(s - 1) % RUN_DASHES.length] ?? [];
