/**
 * Copilot UI state (SPEC §8) — owner: copilot. The pending patch and per-op decisions are the contract the canvas
 * reads (with `previewPatch`) to draw ghosts; `applyDecisions` is the only path from a patch into the model, and it
 * applies accepted ops only, as one undoable commit.
 */
import { create } from 'zustand';
import {
  MAX_CHAT_TURNS,
  MAX_TURN_CHARS,
  Patch,
  applyPatch,
  type ApplyPatchResult,
  type CopilotError,
  type CopilotMode,
  type CopilotOutput,
  type Stage,
  type ToolTraceEntry,
  type UsageEntry,
} from '@looplab/core';
import { useModelStore } from '../state/store.ts';
import { postCopilot } from './api.ts';

export type OpDecision = 'pending' | 'accept' | 'reject';

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  mode: CopilotMode;
  /** the text sent back as chat history */
  text: string;
  output?: CopilotOutput;
  trace?: ToolTraceEntry[];
  usage?: UsageEntry[];
}

export interface CopilotState {
  pendingPatch: Patch | null;
  decisions: Record<string, OpDecision>;
  setPendingPatch: (patch: Patch | null) => void;
  decideOp: (opId: string, decision: OpDecision) => void;
  acceptAll: () => void;
  rejectAll: () => void;

  mode: CopilotMode;
  entries: ChatEntry[];
  busy: boolean;
  error: CopilotError | null;
  /** trace and usage of the last failed request (successful ones are attached to their chat entry) */
  failed: { trace: ToolTraceEntry[]; usage: UsageEntry[] } | null;
  lastApply: { applied: string[]; skipped: { opId: string; reason: string }[] } | null;
  setMode: (mode: CopilotMode) => void;
  send: (text: string, stage: Stage) => Promise<void>;
  cancel: () => void;
  /** Apply the accepted ops of the pending patch to the model (one undo step); null if nothing was accepted. */
  applyDecisions: () => ApplyPatchResult | null;
  discardPatch: () => void;
  clearChat: () => void;
  reset: () => void;
}

export const DEFAULT_PROMPTS: Record<CopilotMode, string> = {
  interview: 'Help me build a dynamic hypothesis for my problem.',
  critique: 'Critique the current model.',
  explain: 'Explain the feedback loops of the current model.',
  intervene: 'Propose interventions and test them by simulation.',
  report: 'Draft the decision brief.',
};

const all = (patch: Patch | null, d: OpDecision): Record<string, OpDecision> =>
  Object.fromEntries((patch?.ops ?? []).map((op) => [op.opId, d]));

/** Chat-history text for an assistant answer. */
export function outputText(output: CopilotOutput): string {
  switch (output.kind) {
    case 'question':
      return [output.question, ...output.options.map((o) => `- ${o}`)].join('\n');
    case 'answer':
      return output.markdown;
    case 'patch':
      return `Proposed patch "${output.patch.title}" (${output.patch.ops.length} ops): ${output.patch.rationale}`;
  }
}

let nextEntryId = 1;
let inflight: AbortController | null = null;

const initial = {
  pendingPatch: null,
  decisions: {},
  mode: 'interview' as CopilotMode,
  entries: [] as ChatEntry[],
  busy: false,
  error: null,
  failed: null,
  lastApply: null,
};

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  ...initial,

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

  setMode(mode) {
    set({ mode });
  },

  async send(text, stage) {
    if (get().busy) return;
    const mode = get().mode;
    const user: ChatEntry = {
      id: nextEntryId++,
      role: 'user',
      mode,
      text: (text.trim() || DEFAULT_PROMPTS[mode]).slice(0, MAX_TURN_CHARS),
    };
    const entries = [...get().entries, user];
    const messages = entries
      .slice(-MAX_CHAT_TURNS)
      .map((e) => ({ role: e.role, text: e.text.slice(0, MAX_TURN_CHARS) }));
    set({ entries, busy: true, error: null, failed: null, lastApply: null });

    const controller = new AbortController();
    inflight = controller;
    const res = await postCopilot({ mode, stage, model: useModelStore.getState().model, messages }, controller.signal);
    if (inflight === controller) inflight = null;

    if (!res.ok) {
      set({ busy: false, error: res.error, failed: { trace: res.trace, usage: res.usage } });
      return;
    }
    if (res.output.kind === 'patch' && !Patch.safeParse(res.output.patch).success) {
      set({
        busy: false,
        error: { code: 'invalid-output', message: 'The copilot returned a malformed patch; nothing was changed.' },
        failed: { trace: res.trace, usage: res.usage },
      });
      return;
    }
    const answer: ChatEntry = {
      id: nextEntryId++,
      role: 'assistant',
      mode,
      text: outputText(res.output).slice(0, MAX_TURN_CHARS),
      output: res.output,
      trace: res.trace,
      usage: res.usage,
    };
    set({ busy: false, entries: [...get().entries, answer] });
    if (res.output.kind === 'patch') get().setPendingPatch(res.output.patch);
  },

  cancel() {
    inflight?.abort();
  },

  applyDecisions() {
    const { pendingPatch, decisions } = get();
    if (!pendingPatch) return null;
    const accepted = new Set(
      Object.entries(decisions)
        .filter(([, d]) => d === 'accept')
        .map(([opId]) => opId),
    );
    if (accepted.size === 0) return null; // AI proposes, engineer disposes: nothing applies without an accept
    const out: { result: ApplyPatchResult | null } = { result: null };
    useModelStore.getState().commit('Apply AI patch', (m) => {
      out.result = applyPatch(m, pendingPatch, accepted);
      return out.result.model;
    });
    const r = out.result;
    set({ pendingPatch: null, decisions: {}, lastApply: r ? { applied: r.applied, skipped: r.skipped } : null });
    return r;
  },

  discardPatch() {
    set({ pendingPatch: null, decisions: {} });
  },

  clearChat() {
    set({ entries: [], error: null, failed: null, lastApply: null });
  },

  reset() {
    inflight?.abort();
    inflight = null;
    set({ ...initial });
  },
}));
