/**
 * Copilot protocol (SPEC §6.9, §7) — owner: copilot. Request/response types shared by server and web, the
 * output-tool schemas, and the patch helpers. Never imports the Anthropic SDK (the web bundle includes this file).
 */
import type { Patch } from '../schema/patch.ts';
import type { Finding } from './schemas.ts';

export {
  AskQuestionInput,
  COPILOT_MODES,
  ChatTurnSchema,
  CopilotModeSchema,
  CopilotRequestSchema,
  FindingSchema,
  MAX_CHAT_TURNS,
  MAX_TURN_CHARS,
  MODE_OUTPUTS,
  OUTPUT_TOOL_NAMES,
  ProposePatchInput,
  RespondInput,
  StageSchema,
  ToolPatchOp,
  UPDATABLE_FIELDS,
  modelElementIds,
  toCorePatch,
  type ChatTurn,
  type CopilotMode,
  type CopilotRequest,
  type Finding,
  type OutputToolName,
  type Stage,
  type ToCorePatchResult,
} from './schemas.ts';
export {
  aiProposedElements,
  applyPatch,
  markConfirmed,
  opTarget,
  previewPatch,
  type AiElement,
  type ApplyPatchResult,
  type PatchPreview,
} from './apply.ts';

/** One tool call of a copilot request, shown in the UI trace. */
export interface ToolTraceEntry {
  name: string;
  /** validated input (raw input when validation failed) */
  input: unknown;
  ok: boolean;
  summary: string;
  ms: number;
}

/** Token usage of one API call (SPEC §7.2 caching). Total input = input + cacheCreation + cacheRead. */
export interface UsageEntry {
  call: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export type CopilotOutput =
  | { kind: 'patch'; patch: Patch; hypotheses: string[] }
  | { kind: 'question'; question: string; options: string[]; why: string }
  | { kind: 'answer'; markdown: string; findings: Finding[]; hypotheses: string[] };

export type CopilotErrorCode =
  | 'bad-request'
  | 'no-key'
  | 'no-model'
  | 'refusal'
  | 'truncated'
  | 'invalid-output'
  | 'no-output'
  | 'iteration-cap'
  | 'unexpected-stop'
  | 'api-error'
  | 'aborted'
  | 'network'
  | 'internal';

export interface CopilotError {
  code: CopilotErrorCode;
  message: string;
  detail?: unknown;
}

export type CopilotResponse =
  | { ok: true; output: CopilotOutput; trace: ToolTraceEntry[]; usage: UsageEntry[]; model: string }
  | { ok: false; error: CopilotError; trace: ToolTraceEntry[]; usage: UsageEntry[] };
