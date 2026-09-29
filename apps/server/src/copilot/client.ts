/**
 * The narrow Anthropic seam the copilot depends on (RESEARCH §Anthropic 5): production wraps the real SDK client,
 * tests pass a fake `messages.create` that returns scripted messages. The key is passed explicitly and never logged.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface CopilotClient {
  messages: {
    create(
      body: Anthropic.MessageCreateParamsNonStreaming,
      opts?: { signal?: AbortSignal },
    ): Promise<Anthropic.Message>;
  };
}

export interface AnthropicClientOptions {
  /** custom fetch (tests only; production uses the global fetch) */
  fetch?: typeof fetch;
  maxRetries?: number;
}

export function createAnthropicClient(apiKey: string, opts: AnthropicClientOptions = {}): CopilotClient {
  const sdk = new Anthropic({
    apiKey,
    // Never fall back to ANTHROPIC_AUTH_TOKEN / ant profiles: exactly one credential, the one from .env.
    authToken: null,
    maxRetries: opts.maxRetries ?? 2,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  return { messages: { create: (body, options) => sdk.messages.create(body, options) } };
}
