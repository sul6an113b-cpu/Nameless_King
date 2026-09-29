/** Test helpers: a scripted fake Anthropic client (no network) and message fixtures. Used only by *.test.ts. */
import type Anthropic from '@anthropic-ai/sdk';
import type { CopilotClient } from './client.ts';

export type Block = Record<string, unknown> & { type: string };
type Step = { content: Block[]; stop_reason?: Anthropic.StopReason; stop_details?: unknown } | Error;

let nextId = 1;
export const toolUse = (name: string, input: unknown): Block => ({ type: 'tool_use', id: `toolu_${nextId++}`, name, input });
export const thinking = (signature = 'sig'): Block => ({ type: 'thinking', thinking: '', signature });
export const text = (t: string): Block => ({ type: 'text', text: t, citations: null });

export function message(step: Exclude<Step, Error>, call: number): Anthropic.Message {
  return {
    id: `msg_${call}`,
    type: 'message',
    role: 'assistant',
    model: 'fake-model',
    content: step.content,
    stop_reason: step.stop_reason ?? (step.content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    stop_details: step.stop_details ?? null,
    container: null,
    usage: { input_tokens: 100 + call, output_tokens: 20, cache_creation_input_tokens: call === 1 ? 3000 : 0, cache_read_input_tokens: call === 1 ? 0 : 3000 },
  } as unknown as Anthropic.Message;
}

/** A client that replays `steps` in order and records a deep copy of every request body. */
export function fakeClient(steps: Step[] | ((call: number) => Step)): { client: CopilotClient; bodies: Anthropic.MessageCreateParamsNonStreaming[] } {
  const bodies: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client: CopilotClient = {
    messages: {
      create: (body) => {
        bodies.push(structuredClone(body));
        const call = bodies.length;
        const step = typeof steps === 'function' ? steps(call) : steps[call - 1];
        if (step === undefined) return Promise.reject(new Error(`fake client: no scripted response for call ${call}`));
        if (step instanceof Error) return Promise.reject(step);
        return Promise.resolve(message(step, call));
      },
    },
  };
  return { client, bodies };
}

/** Text of a tool_result block (for assertions). */
export function resultText(r: Anthropic.ToolResultBlockParam | undefined): string {
  if (!r) return '';
  return typeof r.content === 'string' ? r.content : JSON.stringify(r.content ?? '');
}

/** The tool_result blocks of the last user message of a request body. */
export function lastToolResults(body: Anthropic.MessageCreateParamsNonStreaming): Anthropic.ToolResultBlockParam[] {
  const last = body.messages[body.messages.length - 1];
  if (!last || last.role !== 'user' || typeof last.content === 'string') return [];
  return last.content.filter((b): b is Anthropic.ToolResultBlockParam => b.type === 'tool_result');
}
