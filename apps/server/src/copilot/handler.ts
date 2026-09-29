/**
 * `/api/copilot` tool loop (SPEC §7.2, RESEARCH §Anthropic 2.6 and 7).
 * - Non-streaming `messages.create`, `tool_choice: auto` + `disable_parallel_tool_use` (forced tool choice is a 400 on
 *   the current models), strict tool schemas, the same frozen tools + system block on every call, automatic caching.
 * - At most 8 read-only calls (further calls get an `is_error` "budget exhausted" result) and 12 API iterations.
 * - History is append-only; assistant content (incl. thinking blocks) is echoed back verbatim.
 * - An answer must come through an output tool allowed in the mode, Zod-valid and applicable to the model; one retry
 *   with the error, then `{ ok: false }` — the client changes nothing.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  AskQuestionInput,
  MODE_OUTPUTS,
  ProposePatchInput,
  RespondInput,
  applyPatch,
  modelElementIds,
  newId,
  toCorePatch,
  type CopilotError,
  type CopilotOutput,
  type CopilotRequest,
  type CopilotResponse,
  type Model,
  type OutputToolName,
  type ToolTraceEntry,
  type UsageEntry,
} from '@looplab/core';
import type { CopilotClient } from './client.ts';
import { MAX_MODEL_CHARS, SYSTEM_PROMPT, buildRequestMessage, jsonData, modelForPrompt } from './prompt.ts';
import {
  READ_TOOL_INPUTS,
  ToolInputError,
  coreReadTools,
  type ReadToolImpls,
  type ToolContext,
  type ToolRunResult,
} from './readTools.ts';
import { TOOLS, isOutputTool, isReadTool } from './tools.ts';

export const MAX_READ_CALLS = 8;
export const MAX_ITERATIONS = 12;
export const MAX_TOKENS = 16000;
const MAX_TOOL_RESULT_CHARS = 30_000;

/** The frozen system block; its cache breakpoint covers tools + system (tools render first). */
export const SYSTEM_BLOCKS: readonly Anthropic.TextBlockParam[] = Object.freeze([
  Object.freeze({ type: 'text' as const, text: SYSTEM_PROMPT, cache_control: Object.freeze({ type: 'ephemeral' as const }) }),
]);

export interface CopilotHandlerOptions {
  client: CopilotClient;
  /** model id from CLAUDE_MODEL — never defaulted in code */
  model: string;
  /** read-only tool implementations (default: core adapters) */
  readTools?: ReadToolImpls;
}

export type CopilotHandler = (req: CopilotRequest, opts?: { signal?: AbortSignal }) => Promise<CopilotResponse>;

/** Inputs are Zod-validated against READ_TOOL_INPUTS[name] before the call. */
type AnyReadTool = (model: Model, input: unknown, ctx: ToolContext) => ToolRunResult;

export function requestBody(model: string, messages: Anthropic.MessageParam[]): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_BLOCKS as Anthropic.TextBlockParam[],
    tools: TOOLS as Anthropic.Tool[],
    tool_choice: { type: 'auto', disable_parallel_tool_use: true },
    output_config: { effort: 'medium' },
    cache_control: { type: 'ephemeral' },
    messages,
  };
}

function toUsage(call: number, u: Anthropic.Usage): UsageEntry {
  return {
    call,
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
  };
}

function apiError(e: unknown, aborted: boolean): CopilotError {
  if (e instanceof Anthropic.APIUserAbortError || aborted) return { code: 'aborted', message: 'The request was cancelled; nothing was changed.' };
  if (e instanceof Anthropic.APIConnectionError)
    return { code: 'api-error', message: 'Could not reach the Anthropic API (connection error or timeout); nothing was changed.' };
  if (e instanceof Anthropic.APIError) {
    const body = e.error as { error?: { message?: unknown } } | undefined;
    const detail = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 300) : 'request failed';
    return {
      code: 'api-error',
      message: `Anthropic API error${typeof e.status === 'number' ? ` ${e.status}` : ''}${e.type ? ` (${e.type})` : ''}: ${detail}`,
      detail: { status: typeof e.status === 'number' ? e.status : null, type: e.type ?? null, requestId: e.requestID ?? null },
    };
  }
  return { code: 'internal', message: 'The copilot failed unexpectedly; nothing was changed.' };
}

type Validated = { ok: true; output: CopilotOutput; summary: string } | { ok: false; error: string };

const prettify = (e: z.ZodError) => z.prettifyError(e);

/** Validate an output-tool call: allowed in this mode, Zod-valid, and (for patches) applicable to the model. */
export function validateOutput(name: OutputToolName, input: unknown, req: CopilotRequest): Validated {
  const allowed = MODE_OUTPUTS[req.mode];
  if (!allowed.includes(name)) return { ok: false, error: `${name} is not allowed in ${req.mode} mode; answer with ${allowed.join(' or ')}.` };
  switch (name) {
    case 'propose_patch': {
      const p = ProposePatchInput.safeParse(input);
      if (!p.success) return { ok: false, error: prettify(p.error) };
      const converted = toCorePatch(p.data, req.model, newId('p'));
      if (!converted.ok) return { ok: false, error: converted.errors.join('\n') };
      const { patch } = converted;
      const check = applyPatch(req.model, patch, new Set(patch.ops.map((o) => o.opId)));
      if (check.skipped.length > 0) {
        const index = new Map(patch.ops.map((o, i) => [o.opId, i]));
        const lines = check.skipped.map((s) => `- ops[${index.get(s.opId)}]: ${s.reason}`);
        return { ok: false, error: `These ops cannot be applied to the current model:\n${lines.join('\n')}` };
      }
      return { ok: true, output: { kind: 'patch', patch, hypotheses: p.data.hypotheses }, summary: `patch with ${patch.ops.length} ops` };
    }
    case 'ask_question': {
      const q = AskQuestionInput.safeParse(input);
      if (!q.success) return { ok: false, error: prettify(q.error) };
      return { ok: true, output: { kind: 'question', ...q.data }, summary: 'question' };
    }
    case 'respond': {
      const r = RespondInput.safeParse(input);
      if (!r.success) return { ok: false, error: prettify(r.error) };
      const known = modelElementIds(req.model);
      const unknown = [...new Set(r.data.findings.flatMap((f) => f.elementIds).filter((id) => !known.has(id)))];
      if (unknown.length > 0)
        return { ok: false, error: `findings cite element ids that are not in the model: ${unknown.join(', ')}. Cite ids from <model_data>.` };
      return { ok: true, output: { kind: 'answer', ...r.data }, summary: `answer, ${r.data.findings.length} findings` };
    }
  }
}

function toolText(content: unknown): string {
  const text = jsonData(content);
  return text.length <= MAX_TOOL_RESULT_CHARS ? text : `${text.slice(0, MAX_TOOL_RESULT_CHARS)} …[truncated]`;
}

export function createCopilotHandler(options: CopilotHandlerOptions): CopilotHandler {
  const readTools = options.readTools ?? coreReadTools;

  return async (req, { signal } = {}) => {
    const trace: ToolTraceEntry[] = [];
    const usage: UsageEntry[] = [];
    const fail = (error: CopilotError): CopilotResponse => ({ ok: false, error, trace, usage });
    const allowed = MODE_OUTPUTS[req.mode].join(' or ');

    const modelJson = jsonData(modelForPrompt(req.model));
    if (modelJson.length > MAX_MODEL_CHARS)
      return fail({ code: 'bad-request', message: `The model is too large for the copilot (${modelJson.length} > ${MAX_MODEL_CHARS} characters of JSON).` });

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: [{ type: 'text', text: buildRequestMessage(req, modelJson) }] }];
    const ctx: ToolContext = { simulated: [] };
    let readCalls = 0;
    let retried = false;

    const runReadTool = (call: Anthropic.ToolUseBlock): Anthropic.ToolResultBlockParam => {
      const t0 = performance.now();
      const result = (content: string, isError: boolean, entry: Omit<ToolTraceEntry, 'ms'>): Anthropic.ToolResultBlockParam => {
        trace.push({ ...entry, ms: Math.round(performance.now() - t0) });
        return { type: 'tool_result', tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) };
      };
      if (!isReadTool(call.name))
        return result(`Unknown tool "${call.name}".`, true, { name: call.name, input: call.input, ok: false, summary: 'unknown tool' });
      if (readCalls >= MAX_READ_CALLS)
        return result(
          `Read-tool budget exhausted (${MAX_READ_CALLS} calls). Answer now with an output tool (${allowed}).`,
          true,
          { name: call.name, input: call.input, ok: false, summary: 'budget exhausted' },
        );
      const parsed = READ_TOOL_INPUTS[call.name].safeParse(call.input);
      if (!parsed.success)
        return result(`Invalid input for ${call.name}:\n${prettify(parsed.error)}`, true, { name: call.name, input: call.input, ok: false, summary: 'invalid input' });
      readCalls++;
      try {
        const run = (readTools[call.name] as AnyReadTool)(req.model, parsed.data, ctx);
        return result(toolText(run.content), false, { name: call.name, input: parsed.data, ok: run.ok, summary: run.summary });
      } catch (e) {
        const message = e instanceof ToolInputError ? e.message : `${call.name} failed: ${e instanceof Error ? e.message : String(e)}`;
        return result(message, true, { name: call.name, input: parsed.data, ok: false, summary: message.slice(0, 120) });
      }
    };

    for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
      let res: Anthropic.Message;
      try {
        res = await options.client.messages.create(requestBody(options.model, messages), signal ? { signal } : undefined);
      } catch (e) {
        return fail(apiError(e, signal?.aborted ?? false));
      }
      usage.push(toUsage(iteration, res.usage));

      if (res.stop_reason === 'refusal') {
        const category = res.stop_details?.category;
        return fail({ code: 'refusal', message: `Claude declined this request${category ? ` (category: ${category})` : ''}; nothing was changed.` });
      }
      if (res.stop_reason === 'max_tokens' || res.stop_reason === 'model_context_window_exceeded')
        return fail({ code: 'truncated', message: 'The answer was cut off before it was complete; nothing was changed.' });
      if (res.stop_reason !== 'tool_use' && res.stop_reason !== 'end_turn')
        return fail({ code: 'unexpected-stop', message: `Unexpected stop reason "${res.stop_reason ?? 'none'}"; nothing was changed.` });

      // Verbatim echo (thinking blocks included). An empty turn is not sent back; consecutive user turns are merged by the API.
      if (res.content.length > 0) messages.push({ role: 'assistant', content: res.content });
      const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

      if (calls.length === 0) {
        if (retried) return fail({ code: 'no-output', message: 'Claude answered without an output tool twice; nothing was changed.' });
        retried = true;
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: `Answer by calling an output tool (${allowed}). Plain text is not shown to the engineer.` }],
        });
        continue;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        if (!isOutputTool(call.name)) {
          results.push(runReadTool(call));
          continue;
        }
        const v = validateOutput(call.name, call.input, req);
        trace.push({ name: call.name, input: call.input, ok: v.ok, summary: v.ok ? v.summary : 'invalid output', ms: 0 });
        if (v.ok) return { ok: true, output: v.output, trace, usage, model: options.model };
        if (retried)
          return fail({ code: 'invalid-output', message: `Claude's ${call.name} answer was invalid twice; nothing was changed.`, detail: v.error });
        retried = true;
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          is_error: true,
          content: `Invalid ${call.name} input:\n${v.error}\nFix these problems and answer again with an output tool (${allowed}).`,
        });
      }
      messages.push({ role: 'user', content: results });
    }
    return fail({ code: 'iteration-cap', message: `Stopped after ${MAX_ITERATIONS} API calls without an answer; nothing was changed.` });
  };
}
