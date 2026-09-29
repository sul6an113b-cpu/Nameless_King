/**
 * The copilot's tool array (SPEC §7.2): six read-only tools + three output tools, in a fixed order, generated once
 * and frozen. The identical array is sent on every API call of every request and mode, so the cached prefix
 * (tools → system) never changes.
 */
import type Anthropic from '@anthropic-ai/sdk';
import {
  AskQuestionInput,
  OUTPUT_TOOL_NAMES,
  ProposePatchInput,
  RespondInput,
  type OutputToolName,
} from '@looplab/core';
import type { z } from 'zod';
import { READ_TOOL_DESCRIPTIONS, READ_TOOL_INPUTS, READ_TOOL_NAMES, type ReadToolName } from './readTools.ts';
import { toToolSchema } from './toolSchema.ts';

export type ToolName = ReadToolName | OutputToolName;

export const OUTPUT_TOOL_INPUTS: Record<OutputToolName, z.ZodType> = {
  propose_patch: ProposePatchInput,
  ask_question: AskQuestionInput,
  respond: RespondInput,
};

const OUTPUT_TOOL_DESCRIPTIONS: Record<OutputToolName, string> = {
  propose_patch:
    'Output tool: proposes changes to the model as a patch the engineer reviews op by op; nothing changes until they accept. ' +
    'Ops apply in order: add_variable, add_link, annotate_loop (name/narrative for a loop key from list_loops), add_scenario, ' +
    'add_intervention, add_assertion, update (one field of an existing element per op) and remove. ' +
    'Updatable fields: variable name/kind/equation/units/doc/nonNegative; link polarity/delay/note/confidence; ' +
    'loopAnnotation (id = loop key) name/note; intervention name/description/leverage/scenarioId/status/rationale; ' +
    'scenario name/note; assertion expr/note/enabled. Use only in modes that allow it; calling it ends your turn.',
  ask_question:
    'Output tool: asks the engineer one focused question and ends your turn (Interview mode). Offer up to 6 short answer ' +
    'options when the answer space is small, [] otherwise, and say why the answer matters for the model. ' +
    'Use it when a missing fact would change the causal structure; do not use it to ask permission.',
  respond:
    'Output tool: answers in Markdown and ends your turn (Critique, Explain, Report). In Critique, add one finding per issue ' +
    'with the ids of the model elements involved (ids must exist in the model), a severity and a short rule name; in other ' +
    'modes findings is []. List every causal claim not established by tool results in hypotheses.',
};

const TOOL_INPUTS: Record<ToolName, z.ZodType> = { ...READ_TOOL_INPUTS, ...OUTPUT_TOOL_INPUTS };
const TOOL_DESCRIPTIONS: Record<ToolName, string> = { ...READ_TOOL_DESCRIPTIONS, ...OUTPUT_TOOL_DESCRIPTIONS };

export const TOOL_ORDER: readonly ToolName[] = [...READ_TOOL_NAMES, ...OUTPUT_TOOL_NAMES];

/**
 * `propose_patch` is strict too; if the API ever rejects its grammar as too complex (checked by `smoke:copilot`),
 * set this to false: Zod + the retry-once path still validate it (SPEC §7.2 fallback).
 */
export const PROPOSE_PATCH_STRICT = true;

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object') {
    Object.values(x).forEach(deepFreeze);
    Object.freeze(x);
  }
  return x;
}

export const TOOLS: readonly Anthropic.Tool[] = deepFreeze(
  TOOL_ORDER.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    input_schema: toToolSchema(TOOL_INPUTS[name]) as Anthropic.Tool.InputSchema,
    strict: name === 'propose_patch' ? PROPOSE_PATCH_STRICT : true,
  })),
);

export const isReadTool = (name: string): name is ReadToolName => (READ_TOOL_NAMES as readonly string[]).includes(name);
export const isOutputTool = (name: string): name is OutputToolName =>
  (OUTPUT_TOOL_NAMES as readonly string[]).includes(name);
