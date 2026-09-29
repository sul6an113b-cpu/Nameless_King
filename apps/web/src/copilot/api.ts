/** Browser → local copilot server. The browser never talks to Anthropic and never sees the key. */
import type { CopilotRequest, CopilotResponse } from '@looplab/core';

const failure = (code: 'network' | 'aborted' | 'internal', message: string): CopilotResponse => ({
  ok: false,
  error: { code, message },
  trace: [],
  usage: [],
});

export async function postCopilot(req: CopilotRequest, signal?: AbortSignal): Promise<CopilotResponse> {
  let res: Response;
  try {
    res = await fetch('/api/copilot', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch {
    if (signal?.aborted) return failure('aborted', 'Request cancelled; nothing was changed.');
    return failure('network', 'Cannot reach the copilot server. Is `npm run dev` (or `npm start`) running?');
  }
  const body: unknown = await res.json().catch(() => null);
  if (body !== null && typeof body === 'object' && 'ok' in body && Array.isArray((body as { trace?: unknown }).trace))
    return body as CopilotResponse;
  return failure('internal', `The copilot server answered HTTP ${res.status} without a valid response.`);
}
