/** Copilot UI state (SPEC §8) — owner: copilot. Phase-1 scaffold: pending patch + per-op decisions. */
import { create } from 'zustand';
import type { Patch } from '@looplab/core';

export type OpDecision = 'pending' | 'accept' | 'reject';

export interface CopilotState {
  pendingPatch: Patch | null;
  decisions: Record<string, OpDecision>;
  setPendingPatch: (patch: Patch | null) => void;
  decideOp: (opId: string, decision: OpDecision) => void;
  acceptAll: () => void;
  rejectAll: () => void;
}

const all = (patch: Patch | null, d: OpDecision): Record<string, OpDecision> =>
  Object.fromEntries((patch?.ops ?? []).map((op) => [op.opId, d]));

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  pendingPatch: null,
  decisions: {},
  setPendingPatch(patch) {
    set({ pendingPatch: patch, decisions: all(patch, 'pending') });
  },
  decideOp(opId, decision) {
    set({ decisions: { ...get().decisions, [opId]: decision } });
  },
  acceptAll() {
    set({ decisions: all(get().pendingPatch, 'accept') });
  },
  rejectAll() {
    set({ decisions: all(get().pendingPatch, 'reject') });
  },
}));
