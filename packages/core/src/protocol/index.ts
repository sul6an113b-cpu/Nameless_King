/** Copilot protocol (SPEC §7) — owner: copilot. Phase-1 stub: request/response types and patch helpers. */
import type { Id, LoopKey, Model } from '../schema/model.ts';
import type { Patch } from '../schema/patch.ts';
import { notImplemented } from '../stub.ts';

export type CopilotMode = 'interview' | 'critique' | 'explain' | 'intervene' | 'report';
export type Stage = 'frame' | 'map' | 'analyze' | 'quantify' | 'test' | 'decide';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface CopilotRequest {
  mode: CopilotMode;
  stage: Stage;
  model: Model;
  messages: ChatTurn[];
  focus?: { elementIds?: Id[]; loopKeys?: LoopKey[] };
}

export interface ToolTraceEntry {
  name: string;
  input: unknown;
  ok: boolean;
  summary: string;
  ms: number;
}

export interface UsageEntry {
  call: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface Finding {
  elementIds: Id[];
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

export type CopilotOutput =
  | { kind: 'patch'; patch: Patch; message?: string }
  | { kind: 'question'; question: string; options?: string[]; why?: string }
  | { kind: 'answer'; markdown: string; findings?: Finding[]; hypotheses: string[] };

export type CopilotResponse =
  | { ok: true; output: CopilotOutput; trace: ToolTraceEntry[]; usage: UsageEntry[]; model: string }
  | { ok: false; error: { code: string; message: string; detail?: unknown }; trace: ToolTraceEntry[]; usage: UsageEntry[] };

export interface ApplyPatchResult {
  model: Model;
  applied: string[];
  skipped: { opId: string; reason: string }[];
}

export interface PatchPreview {
  added: { variables: Id[]; links: Id[] };
  changed: Id[];
  removed: Id[];
  /** the model as it would look if every op were accepted (for ghost rendering) */
  preview: Model;
}

export function applyPatch(_model: Model, _patch: Patch, _acceptedOpIds: ReadonlySet<string>): ApplyPatchResult {
  return notImplemented('protocol.applyPatch');
}

export function previewPatch(_model: Model, _patch: Patch): PatchPreview {
  return notImplemented('protocol.previewPatch');
}
