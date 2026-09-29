# Research: Anthropic TypeScript SDK and Claude API (as of 2026-09-29)

Scope: what `apps/server` needs for the LoopLab copilot (`/api/copilot`): model IDs, the SDK surface for a
manual tool loop, strict tools / Zod, prompt caching, errors / retries / streaming, test mocking, and security.
Phase 0 research only. No product code was written and no API call was made.

**How this was checked.** Each claim below comes from one of these sources:

- **[skill]**: the bundled `claude-api` skill, cached 2026-09-25. It is Anthropic's curated reference.
- **[docs]**: official docs at platform.claude.com, fetched 2026-09-29. docs.claude.com now redirects there.
- **[npm]**: the npm registry, queried 2026-09-29.
- **[src]**: the published `@anthropic-ai/sdk@0.129.0` package itself (type definitions and JS), unpacked in a
  temp directory.
- **[test]**: a throwaway Vitest + `tsc` project in a temp directory, run against 0.129.0 with no network and no
  API key. It has since been deleted.

Anything that I could not confirm in [docs], [src] or [test] is marked **UNVERIFIED**.

---

## 0. TL;DR: decisions to carry into SPEC

| Topic | Decision | Basis |
|---|---|---|
| Default `CLAUDE_MODEL` | `claude-opus-5-5` | [docs] models overview: "If you're unsure which model to use, start with Claude Opus 5.5". Also [skill] |
| Cheaper option | `claude-sonnet-5-5` (about half the price) | [docs] models overview |
| Not recommended | `claude-haiku-4-5`: retirement "not sooner than October 15, 2026"; rejects `output_config.effort`; 4,096-token cache minimum | [docs] overview, effort, prompt caching |
| SDK | `@anthropic-ai/sdk` **0.129.0**, pinned exact. The package is 0.x and its releases are roughly weekly | [npm], [docs] SemVer note |
| Call style | Non-streaming `client.messages.create`, with `max_tokens: 16000` | [src]/[test]: the SDK throws unless max_tokens ≤ 21,333 or a timeout is set |
| Thinking / effort | Omit `thinking`. Set `output_config: { effort: "medium" }` explicitly | [docs] effort, Opus 5.5 migration guide |
| `tool_choice` | `{ type: "auto", disable_parallel_tool_use: true }`, the same on every turn. **Never** use `any` or `tool`: they return 400 on Opus 5.5 and Sonnet 5.5 | [docs] define-tools, errors |
| Tool schemas | `strict: true` on all 7 tools, with `additionalProperties: false`. Zod still validates every input and output | [docs] strict tool use |
| Tool set | Send the same 7 tools, in the same order, on every request and in every mode | [docs] caching hierarchy, preserved thinking |
| History | Append-only. Push `response.content` back **verbatim**, including `thinking` blocks | [docs] errors ("Thinking blocks cannot be modified"), Opus 5.5 migration guide |
| Caching | `cache_control: {type:"ephemeral"}` on the single frozen system block, plus top-level automatic `cache_control` for the growing tail. Default 5-minute TTL. No beta header | [docs] prompt caching |
| Usage shown per call | `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`. Total input is the sum of the first three | [docs], [src] |
| Test seam | Our own `MessagesApi` interface for unit tests, plus `new Anthropic({ fetch: fake })` for one SDK-level test | [src]/[test] |
| Key hygiene | `apps/web` never imports `@anthropic-ai/sdk` at runtime. The SDK bundle contains the string `ANTHROPIC_API_KEY`, which would fail the bundle check | [src] |

---

## 1. Models

### 1.1 Current lineup

Source: [docs] Models overview, fetched 2026-09-29.

| Model | Claude API ID (use exactly) | Context | Max output (sync) | Price in / out per MTok | Default effort | Retirement (not sooner than) |
|---|---|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | 1M | 128K | $10 / $50 | `high` | 2027-09-01 |
| **Claude Opus 5.5** | **`claude-opus-5-5`** | 1M | 128K | **$4 / $20** | **`medium`** | 2027-09-22 |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 1M | 128K | $2 / $10 | `high` | 2027-09-28 |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | 200K | 64K | $1 / $5 | effort not supported | **2026-10-15** |

The docs say: "Every Claude model ID is a pinned snapshot, including the dateless IDs used from the 4.6 generation
on". So never append a date suffix to `claude-opus-5-5` or `claude-sonnet-5-5`. The SDK's `Model` type in 0.129.0
lists both IDs [src].

Cache pricing, from [docs] prompt caching:

- **Opus 5.5:** 5-minute cache write $5/MTok, 1-hour write $8/MTok, cache read $0.20/MTok (0.05× base input).
- **Other models:** cache reads cost 0.1× base input. Sonnet 5.5 is therefore $0.20/MTok.
- **All models:** writes cost 1.25× base input (5-minute TTL) or 2× (1-hour TTL).

### 1.2 Recommendation for `.env.example`

```dotenv
ANTHROPIC_API_KEY=            # server-only; never commit
CLAUDE_MODEL=claude-opus-5-5  # recommended default (docs: "start with Claude Opus 5.5")
# CLAUDE_MODEL=claude-sonnet-5-5  # cheaper/faster option ($2/$10 vs $4/$20 per MTok)
```

Behaviour both models share, which the loop must respect ([docs] errors, define-tools, Opus 5.5 migration guide):

- **Forced tool use is rejected.** `tool_choice` `any` or `tool` returns 400 with the message
  `tool_choice: type "tool" and "any" are not supported for this model.` Only `auto` and `none` work.
- **Thinking cannot be disabled.**
  - On Opus 5.5 it is always adaptive. `thinking: {type:"disabled"}` and `thinking: {type:"enabled", ...}` both return 400.
  - On Sonnet 5.5, `disabled` also returns 400. `between_tools` is its lowest setting.
  - Omitting `thinking` works on both.
- **`max_tokens` counts thinking plus text.** Thinking tokens are billed as output tokens even when their text is
  not returned.
- **No assistant prefill** (400). Do not send `temperature`, `top_p` or `top_k` ([skill]: 400 on Opus 5.5; non-default values 400 on Sonnet 5.5).
- **Responses may begin with `thinking` blocks.** Their text is empty by default (`display: "omitted"`). Always read
  blocks by `type`, never by position.
- **A safety classifier can end a response** with `stop_reason: "refusal"`. This is HTTP 200, and the response
  carries `stop_details.category`.

If the user swaps in another `CLAUDE_MODEL`, the request shape in §7 still works on Opus 5.5 and Sonnet 5.5. On
Haiku 4.5, `output_config.effort` would error ([docs] effort lists the supported models, and Haiku 4.5 is not among
them).

---

## 2. SDK and tool use

### 2.1 Package facts

- **Version:** `npm view @anthropic-ai/sdk version` → **0.129.0**, published 2026-09-28 [npm].
  - Recent releases: 0.126.0 (09-15), 0.127.0 (09-18), 0.128.0 (09-22, added `claude-opus-5-5`), 0.129.0 (09-28,
    added `claude-sonnet-5-5`).
- **Dependencies:** there is no `engines` field. `peerDependencies: { zod: "^3.25.0 || ^4.0.0" }`, and it is
  optional. Runtime dependencies are `standardwebhooks` and `json-schema-to-ts` [npm]. The current zod release is
  `4.6.5` [npm].
- **Requirements:** TypeScript ≥ 5.0 and Node.js 20 LTS or later [docs][src README]. Local Node is v22.22.2.
- **Install:** `npm install @anthropic-ai/sdk`. Pin it exactly in `apps/server/package.json`.
- **Versioning:** [docs] SemVer section: "certain backward-incompatible changes may be released as minor
  versions". Re-run `npm view` at Phase 1.

### 2.2 Client construction

Source: [docs] TypeScript SDK page; [src] `client.d.ts`.

```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // default is this env var; pass explicitly (see §6)
  maxRetries: 2,                         // default 2
  timeout: 10 * 60 * 1000,               // ms; default 10 min
});
```

- `timeout` is in **milliseconds**. It can be set on the client or per request:
  `client.messages.create(body, { timeout, maxRetries, signal })`. `signal` is an `AbortSignal`, which we can use to
  cancel the call when the browser disconnects [src `request-options.d.ts`].
- Other options [src]:
  - `fetch` (custom fetch), `fetchOptions` and `defaultHeaders`.
  - `logLevel`, default `ANTHROPIC_LOG` or `'warn'`, and `logger`.
  - `dangerouslyAllowBrowser`, default `false`.
- If `apiKey` and `authToken` are both absent, the client falls back to other credential sources: `ant auth login`
  profiles, config files, and Workload Identity Federation env vars [src][skill]. See §6 for why we pass the key
  explicitly.

### 2.3 `messages.create` for tool use

**Request fields we use.** [src] `MessageCreateParamsBase`, [docs]:

- `model`, `max_tokens` and `messages`.
- `system`: a string or `TextBlockParam[]`.
- `tools`: `ToolUnion[]`.
- `tool_choice`.
- `cache_control`: the top-level automatic breakpoint.
- `output_config: { effort }`.

Other fields that exist but we do not need: `thinking`, `stop_sequences`, `metadata`, `service_tier`,
`inference_geo`, `diagnostics`.

**Tool definition** (`Anthropic.Tool`). [docs] define-tools, [src]:

- `name` must match `^[a-zA-Z0-9_-]{1,128}$`.
- `description`: docs say "by far the most important factor". Aim for at least 3–4 sentences covering when to use
  the tool and when not to.
- `input_schema`: a JSON Schema object `{ type: "object", properties, required, ... }`.
- Optional fields: `strict`, `input_examples` (must validate against the schema, or the request returns 400),
  `cache_control`, `defer_loading`, `allowed_callers`, and `eager_input_streaming` (streaming only).

**`tool_choice`.** [docs] define-tools, [src] types:

| Value | Meaning |
|---|---|
| `{type:"auto"}` | The default when tools are present. Claude decides whether to call a tool. With `disable_parallel_tool_use: true` it makes at most one call. |
| `{type:"any"}` / `{type:"tool", name}` | Forces a tool call. **Returns 400 on Opus 5.5, Sonnet 5.5, Fable 5.1 and Mythos 5.1.** It works on older models such as `claude-opus-5`. |
| `{type:"none"}` | Claude may not call tools. |

Changing `tool_choice` between requests invalidates the cached **messages**; the cached tools and system prompt
survive [docs]. So we keep it constant.

**Response `content` blocks** relevant to us:

- `thinking`: fields `thinking` and `signature`. The text is empty by default.
- `text`.
- `tool_use`: fields `id`, `name`, and `input: unknown`. Always parse `input` as an object. Never string-match its
  JSON, because escaping differs by model [skill].

**`stop_reason`.** [src] `StopReason`, [docs] handling-stop-reasons:

| Value | What the loop does |
|---|---|
| `tool_use` | Run the tool, then return a `tool_result`. |
| `end_turn` | For us this is a protocol miss: the model must answer through an output tool. Handle it as the one retry (§2.6). If `content` is empty, see the note below this table. |
| `max_tokens` | The output may be truncated. A trailing `tool_use` can be incomplete even when it parses, so **never execute it**. Retry with a higher budget, or report an error. |
| `refusal` | HTTP 200. `stop_details = {type:"refusal", category: "cyber"\|"bio"\|"frontier_llm"\|"reasoning_extraction"\|"general_harms"\|null, explanation}`. Show it and change nothing. |
| `pause_turn` | Only happens with server tools. We use none, so treat it as unexpected. |
| `model_context_window_exceeded` | Treat as truncated. |
| `stop_sequence` | Not used. |

A note on empty `end_turn` responses. [docs] handling-stop-reasons: "Adding text blocks immediately after tool
results" can cause "an empty response (exactly 2–3 tokens with no content)". So the `tool_result` user messages
contain **only** `tool_result` blocks.

**Sending results back.** [docs] handle-tool-calls:

- Each result is a `user` message holding `{ type: "tool_result", tool_use_id, content?: string | blocks[], is_error?: boolean }`.
- The results must **immediately follow** the assistant `tool_use` message.
- `tool_result` blocks must come **first** in the content array.
- Every `tool_use` id in the assistant turn needs a matching result.
- For a failed tool or invalid input, send `is_error: true` with an instructive message. The docs say Claude
  "will retry 2-3 times with corrections before apologizing" for invalid calls.

The docs also say: "Keep untrusted content inside `tool_result` blocks rather than `system` prompts or plain user
`text` blocks". That fits our read-only tools: model JSON and imported files reach Claude as tool results.

**Thinking blocks in the loop.** [docs] errors and the Opus 5.5 migration guide: "Echo the assistant message as
received rather than filtering its content blocks by type or rebuilding it: the API rejects edited, reordered, or
partially dropped thinking blocks with a 400 error".

**Preserved thinking.** Keep the conversation append-only: no edits to `system`, `tools` or earlier messages. For
"accounts created on or after August 31, 2026, 00:00 UTC", replaying a thinking block after such an edit returns
400 [docs]. Consequences for us:

- Never swap the tool set mid-request. Swapping it would also invalidate the whole cache.
- Never rewrite earlier turns.
- For multi-turn chat across `/api/copilot` requests, either keep the server-side transcript strictly append-only,
  or start a fresh conversation per request and carry prior chat as plain text. The second option replays no
  thinking blocks, so there is nothing to invalidate. The second option is the KISS choice.

### 2.4 Zod helpers: what exists and how stable it is

Source: [docs] TS SDK page and structured-outputs page; [src].

| Helper | Import | Status | Use for us |
|---|---|---|---|
| `zodOutputFormat(schema)` plus `client.messages.parse(...)` with `output_config.format` | `@anthropic-ai/sdk/helpers/zod` | Stable namespace (structured outputs) | Not needed: we answer through output tools, not JSON text |
| `jsonSchemaOutputFormat(schema)` | `@anthropic-ai/sdk/helpers/json-schema` | Stable | Same as above |
| `betaZodTool({ name, description, inputSchema, run })` plus `client.beta.messages.toolRunner(...)` | `@anthropic-ai/sdk/helpers/beta/zod` | **Beta** | We skip it (§2.6) |
| `betaTool()`, `ToolError` | `helpers/beta/json-schema`, `lib/tools/BetaRunnableTool` | **Beta** | Skip |

The helpers import `zod/v4`, which is why the peer range is `^3.25 || ^4` [src].

**Why a manual loop rather than the beta Tool Runner.** Our loop needs:

- a per-request cap of 8 read-only calls that counts calls, not iterations;
- output tools that *end* the loop without running;
- one retry with the Zod error;
- a UI trace;
- no beta dependency.

The runner could be bent to fit using `max_iterations`, `setMessagesParams` and `generateToolResponse`
([skill]/[docs]). The manual loop is about 50 lines (§7) and is fully under our control. The runner also does not
auto-resume `pause_turn` [skill]. That is irrelevant without server tools.

### 2.5 Strict tools (structured outputs for tool inputs)

Source: [docs] strict-tool-use, structured-outputs.

- **How to enable:** `strict: true` at the top level of the tool definition. No beta header. The schema must set
  `additionalProperties: false` on every object.
- **Guarantees:** "Tool `input` strictly follows the `input_schema`" and "Tool `name` is always valid". This works
  with `tool_choice: auto`, which is the recommended replacement for forced tool use on Opus 5.5 and Sonnet 5.5.
- **Supported JSON Schema subset:**
  - basic types;
  - `enum` (primitives only) and `const`;
  - `anyOf` and `allOf` (`allOf` cannot contain `$ref`);
  - `$ref`, `$defs` and `definitions`;
  - `default`, `required`, and `additionalProperties:false`;
  - string `format`s: date-time, time, date, duration, email, hostname, uri, ipv4, ipv6, uuid;
  - `minItems` of 0 or 1 only;
  - simple `pattern`.
- **Not supported:** recursive schemas, `minimum`/`maximum`/`multipleOf`, `minLength`/`maxLength`, array limits
  beyond `minItems` 0/1, and `additionalProperties` set to anything other than `false`.
- **Limits per request:**
  - 20 strict tools;
  - 24 optional parameters in total across all strict schemas;
  - 16 parameters with union types (`anyOf` or type arrays);
  - an internal cap on grammar size (error: "Schema is too complex for compilation.");
  - a 180 s compilation timeout.

  Compiled schemas are cached for up to 24 h.
- **Enum casing:** "Schema doesn't guarantee capitalization of `enum` and `const` string values". Normalise case
  before Zod, or avoid enum values that differ only by case.
- **Refusal and `max_tokens`:** after either, the output "may not match schema".

**Findings from our own tests** [src]/[test]:

1. **Zod 4's `z.toJSONSchema(schema)` output needs small fixes before use as a strict schema.**
   - What already works: it emits `additionalProperties: false` for `z.object` by default, `anyOf` for `z.union`,
     and `const` for literals.
   - Problem 1: it adds a `$schema` key. Strip it.
   - Problem 2: it emits **`oneOf`** for `z.discriminatedUnion`, which is not in the supported subset. Use
     `z.union` in tool-facing schemas, or rewrite `oneOf` to `anyOf`.
   - Problem 3: `.max()`, `.min()`, `.length()` and similar become unsupported keywords. Keep those rules in Zod
     only, and strip them from the JSON Schema sent to the API.
2. **The SDK's internal `transformJSONSchema` is lossy.** It lives at
   `@anthropic-ai/sdk/lib/transform-json-schema` and is used by `zodOutputFormat`. It is not documented as public.
   In 0.129.0 it moves `enum` and `const` into the `description` text instead of keeping them as constraints, even
   though the docs list both as supported. Do not use it for tool schemas. Instead, write a small `toToolSchema()`
   that calls `z.toJSONSchema`, drops `$schema` and unsupported keywords, and maps `oneOf` to `anyOf`. Add a unit
   test that asserts the output uses only the supported keywords.
3. **Strict mode does not replace Zod.** Strict guarantees only the schema *shape*. Zod still enforces what strict
   cannot express: length and number bounds, and semantic checks such as "`link.from` must be an existing variable
   ID". Validate every input and output with Zod regardless.
4. **The `propose_patch` schema could hit the strict limits.** A union of op types with optional fields adds up
   against the 24-optional and 16-union caps. Prefer required fields, or `nullable` only where needed.
   **UNVERIFIED:** whether our final `propose_patch` schema compiles under strict. Confirm it in the
   `smoke:copilot` run. If it does not compile, set `strict: false` on that tool only and rely on Zod plus one
   retry.

### 2.6 Features that best fit the planned loop

The plan: at most 8 read-only calls, then an answer through `propose_patch` or `ask_question`, with Zod on
everything and one retry on invalid output.

- **Final turn.** Do **not** plan on `tool_choice: {type:"any"}` for the final turn: it returns 400 on the default
  model. Use `auto` together with:
  1. **A system prompt instruction:** "Always finish by calling exactly one of `propose_patch` or `ask_question`;
     never answer in plain text".
  2. **`strict: true`** on the output tools.
  3. **Budget enforcement in our code.** Keep counting after the 8th call. Answer any further read-only call with
     an `is_error: true` `tool_result`: "Read-tool budget exhausted (8). Answer now with propose_patch or
     ask_question." The note goes *inside* the `tool_result`, not as trailing text, to avoid the empty-`end_turn`
     problem. The tool set stays unchanged, so the cache and thinking blocks stay valid.
  4. **A hard cap on API iterations**, for example 8 + 2 + 2 = 12, as a runaway guard.
- **`disable_parallel_tool_use: true`.** Each response then has at most one tool call. This makes the "8 calls"
  count exact, keeps the UI trace linear, and stops read and output tools from being mixed in one turn. The cost is
  more round trips; the cached prefix makes each one cheap. Allowing parallel calls later is a contained change,
  but a response with several `tool_use` blocks then needs one `tool_result` per id.
- **Retry once.** When `propose_patch` or `ask_question` input fails Zod, append a `tool_result` for that
  `tool_use_id` with `is_error: true` and the prettified Zod error, then call again.

  When the model ends with `end_turn` and no tool call, append a user message instead: "You must answer by calling
  propose_patch or ask_question."

  A second failure goes to the UI as an error, and the canvas is left unchanged. This matches the brief.
- **Model switching.** Do not switch models mid-conversation. Caches are model-scoped, and other models cannot
  read Opus 5.5's thinking blocks, apart from Fable 5.1 and Mythos 5.1 on the Claude API [docs].

**Optional, beta:** server-side refusal fallback. The skill recommends opting in by default for `claude-opus-5-5`:
use `client.beta.messages.create` with `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"`.

- The parameter exists in the 0.129.0 beta types: `fallbacks?: Array<{model}> | 'default'` [src].
- The pairing of this header with the `"default"` value comes from the [skill] only. **UNVERIFIED** against a docs
  page.
- A fallback model runs without Opus 5.5's thinking blocks.
- KISS alternative: surface a refusal as "Claude declined (category: …)" and change nothing. SPEC should decide.

---

## 3. Prompt caching

Source: [docs] prompt-caching page unless noted.

- **Syntax:** `cache_control: { type: "ephemeral" }` gives the 5-minute TTL (default).
  `{ type: "ephemeral", ttl: "1h" }` gives 1 hour. **Neither needs a beta header.** The SDK type is
  `CacheControlEphemeral { type:'ephemeral'; ttl?: '5m'|'1h' }` [src].
- **Where markers go:**
  - tool definitions;
  - system text blocks;
  - message content blocks: text, and `tool_use`/`tool_result` in either role; images and documents in user
    turns only.

  Thinking blocks and empty text blocks cannot carry a marker.
- **Automatic caching:** a **top-level** `cache_control` on the request places the breakpoint on the last
  cacheable block and moves it forward as the conversation grows.
- **Limits:**
  - At most **4 breakpoints**. The automatic one uses one slot [skill].
  - The lookback window is **20 blocks per breakpoint**. On the Claude API, a run of consecutive
    `tool_use`/`tool_result` blocks counts as one position.
- **Prefix order is `tools → system → messages`.** A change at one level invalidates that level and everything
  after it.
  - A change to tool definitions invalidates everything.
  - A `tool_choice` change invalidates only the messages.
  - A change to thinking or effort always invalidates the messages, and can invalidate more depending on the
    model.

  A breakpoint on the last system block therefore caches tools and system together.
- **Minimum cacheable prompt:**

  | Model | Minimum |
  |---|---|
  | Opus 5.5 and Sonnet 5.5 | **512 tokens** |
  | Sonnet 5 and Opus 4.8 | 1,024 |
  | Haiku 4.5 | 4,096 |

  A shorter prefix is simply not cached: there is no error, and `cache_creation_input_tokens` is 0.
- **Pricing multipliers:** a 5-minute write costs 1.25× base input and a 1-hour write 2×. A read costs 0.1×, or
  0.05× on Opus 5.5 ($0.20/MTok). A cache read refreshes the entry's TTL at no extra cost [skill].
- **Usage fields** (display these per call): `input_tokens` (the uncached tokens after the last breakpoint),
  `cache_creation_input_tokens`, `cache_read_input_tokens` and `output_tokens`.
  - `total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens`.
  - In the TS types the two cache fields are `number | null`, so use `?? 0` [src].
  - Optional extras: `usage.cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}`, and
    `usage.output_tokens_details.thinking_tokens`. The latter is the thinking share of `output_tokens` [src].
- **Placement for LoopLab:**
  1. **One frozen system prompt** as a single `TextBlockParam` with `cache_control: {type:"ephemeral"}`. It holds
     no dates, IDs, model JSON or mode flags. One system prompt covers all five modes, and the mode is named in
     the first user message. The alternative, one system prompt per mode, gives five separate cache entries and
     also works.
  2. **The same tools array on every request**, in a fixed order and deterministically serialised. Tools render
     first, so this lets the system breakpoint cover them.
  3. **Top-level `cache_control: {type:"ephemeral"}`** so each loop iteration reads the previous iteration's prefix.
     This is the "robust combination for agent loops" from the [skill]. It uses 2 of 4 breakpoints.
  4. **TTL:** keep 5 minutes. Loop turns are seconds apart, and every read refreshes the entry. Consider `ttl:"1h"`
     on the system block only if measurements show 5–60 minute gaps between copilot requests. Longer TTLs must
     come **before** shorter ones [skill].
  5. **Guard test:** in `smoke:copilot`, assert that the second call shows `cache_read_input_tokens > 0`. If reads
     stay at 0, something in the prefix is changing between requests.

---

## 4. Errors, retries, timeouts, streaming

**Typed errors.** [docs] TS SDK page, [src] `core/error.d.ts`, [test]:

- Every error is an `Anthropic.APIError` with `status`, `error`, `headers`, `requestID` and `type`. `type` holds
  values such as `"overloaded_error"` or `"rate_limit_error"`.
- Subclasses by status:
  - `BadRequestError` 400
  - `AuthenticationError` 401
  - `PermissionDeniedError` 403
  - `NotFoundError` 404 (this is also what a wrong model ID returns)
  - `ConflictError` 409
  - `UnprocessableEntityError` 422
  - `RateLimitError` 429
  - `InternalServerError` ≥500, **including 529 overloaded**. [test] confirmed that a 529 is an
    `InternalServerError` with `status 529` and `type "overloaded_error"`.
  - `APIConnectionError`, with the subclass `APIConnectionTimeoutError`.
- Successful responses carry `_request_id`.
- Catch the most specific class first. In TS, `APIConnectionError` is a subclass of `APIError`, so check it before
  `APIError` [skill].

**Retries.** The SDK retries automatically **2 times by default**, with exponential backoff that honours
`retry-after`. It retries on connection errors, 408, 409, 429 and ≥500 (so 529 too) [docs]. Timeouts are retried
as well, so the worst-case wall-clock time is about `timeout × (maxRetries + 1)`. Keep the default of 2.

- One exception [docs errors]: a 429 caused by a tier spend cap has no `retry-after` header and keeps failing.
- Map errors for the UI as `{status, type, request_id}`. Never forward raw `err.headers` or the request.

**Non-streaming limit.** [src] `client.js` `calculateNonstreamingTimeout`, [test], and [docs] "Long requests":

- For a non-streaming `messages.create` with **no explicit `timeout`**, the SDK computes
  `expected = 3,600,000 ms × max_tokens / 128,000`.
- If `expected` exceeds 10 minutes, the SDK **throws synchronously**: "Streaming is required for operations that
  may take longer than 10 minutes". This is not a rejected promise. It happens whenever `max_tokens > 21,333`.
- Otherwise the timeout is 10 minutes.
- Two consequences:
  1. With `max_tokens: 16000` we are safe.
  2. Wrap calls in `try { await ... } catch`, not in `.catch()`, which cannot see a synchronous throw.

The docs text says the timeout "scales up to 60 minutes". The 0.129.0 code throws instead, as described above. The
code is authoritative for our pinned version.

**Streaming.** It is not required for the copilot. KISS: use non-streaming `create` per loop iteration, and send
the UI trace after each iteration using our own server→browser mechanism.

- Streaming (`client.messages.stream(...)` then `await stream.finalMessage()`) becomes necessary only if
  `max_tokens` goes above about 21K, or for token-by-token UX.
- If we ever stream with client tools, the [skill] recommends `eager_input_streaming: true`, with validation of
  every parsed input.
- Opus 5.5 always thinks, so expect several seconds per turn at `medium` effort. **UNVERIFIED:** actual latency.
  Measure it in `smoke:copilot`.

---

## 5. Mocking for tests (Vitest, no network)

Both approaches were verified in [test]: 4 of 4 Vitest tests passed and `tsc --strict` passed on SDK 0.129.0.

1. **Unit tests: inject a narrow interface.** The loop depends on
   `interface MessagesApi { create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> }`.
   Production wires it with `{ create: b => client.messages.create(b) }`. Tests pass a fake that returns scripted
   `Anthropic.Message` fixtures and records each request body.

   Use `structuredClone` when recording, because the loop mutates `messages`. With this seam you can assert the
   whole protocol:
   - `thinking` blocks are echoed verbatim;
   - `tool_result` ids match;
   - the budget message is sent;
   - the retry-once path works;
   - `refusal` and `max_tokens` end the loop without a patch;
   - `cache_control` sits on the system block.

   For fixtures, a helper `msg(content, stop_reason)` cast as `unknown as Anthropic.Message` keeps them short. The
   `Message` type has several nullable fields, such as `stop_details` and `container`.
2. **One SDK-level test: the real client over a fake `fetch`.** Construct
   `new Anthropic({ apiKey: "sk-test", fetch: fakeFetch, maxRetries: 0 })`. `fakeFetch` returns a `Response` with
   a JSON message body or a JSON error body.

   This checks serialisation (URL `https://api.anthropic.com/v1/messages`, top-level `cache_control`, headers
   present), response parsing and `_request_id`, error-class mapping (429 and 529), and the synchronous
   `max_tokens` guard. `maxRetries: 0` keeps error tests instant.
3. **Guard rails for tests:**
   - Unit tests never read `ANTHROPIC_API_KEY`. Run them with the variable unset.
   - `smoke:copilot` is the only code path that calls the real API. It skips cleanly when the key is empty.
   - To prove the no-network rule, a test can pass a `fetch` that throws.
   - The client bundle check (§6) belongs to `qa`.

---

## 6. Security notes

- **Server-only key.** `apps/server` alone depends on `@anthropic-ai/sdk`.
  - [src]: the SDK's `client.mjs` contains the literal string `ANTHROPIC_API_KEY` (3 occurrences). Any runtime
    import from `apps/web` would therefore fail the acceptance check that the client bundle contains no
    `ANTHROPIC_API_KEY` reference.
  - Share types with the web app through our own Zod schemas in `packages/core`, or at most through
    `import type`, which is erased at build.
  - Never set `dangerouslyAllowBrowser`.
- **Deterministic credentials.** Read `ANTHROPIC_API_KEY` from `.env` ourselves and pass `apiKey` explicitly.
  - If it is empty, return a clear "copilot disabled: no key" response, or skip in `smoke:copilot`. Do not let the
    SDK fall back to `ANTHROPIC_AUTH_TOKEN` or an `ant auth` profile [src][skill].
  - Setting both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` makes the SDK send both headers, and the API
    rejects the request [skill].
- **Never log request headers, the client object, or `process.env`.**
  - The SDK's own debug logging (`ANTHROPIC_LOG=debug` / `logLevel:"debug"`) redacts `x-api-key`,
    `authorization`, `api-key`, `cookie` and `set-cookie` [src `internal/utils/log.js`]. But the docs warn that at
    debug level "sensitive data in request and response bodies may still be visible". Keep the default `warn`.
  - Our own logs: `request_id`, model, stop_reason, usage, and tool names only.
- **Errors to the browser:** only `{status, type, request_id, message}`, never `err.headers`.
- **Untrusted content.** Model text, CSV and XMILE imports go to Claude inside `tool_result` blocks, never in the
  system prompt [docs]. Enforce everything that comes back with Zod plus our semantic checks. Nothing applies
  without the engineer accepting it, per the brief.
- **Request size:** the Messages API limit is 32 MB. A 413 is `request_too_large` [docs errors]. Cap the size of
  the model JSON we serialise into tool results.

---

## 7. Minimal code sketch: one loop iteration

This is not product code. It is 54 lines and typechecks under `tsc --strict --noUncheckedIndexedAccess` against
`@anthropic-ai/sdk@0.129.0` and `zod@4.6.5` [test]. It uses only the APIs verified above.

```ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/** Narrow seam: the real client satisfies it; tests pass a fake. */
export interface MessagesApi {
  create(body: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
}
export const realApi = (c: Anthropic): MessagesApi => ({ create: (b) => c.messages.create(b) });

const MAX_READ_CALLS = 8;
const OUTPUT_TOOLS = new Set(["propose_patch", "ask_question"]);
type ReadTool = { schema: z.ZodType; run: (input: unknown) => Promise<string> };

export type Step =
  | { kind: "continue" }
  | { kind: "final"; tool: Anthropic.ToolUseBlock }
  | { kind: "stopped"; reason: string };

/** One loop iteration. `messages` is append-only; tools/system never change mid-request. */
export async function step(
  api: MessagesApi, model: string, system: string, tools: Anthropic.Tool[],
  readTools: Record<string, ReadTool>, messages: Anthropic.MessageParam[],
  budget: { used: number }, onUsage: (u: Anthropic.Usage) => void,
): Promise<Step> {
  const res = await api.create({
    model, max_tokens: 16000, messages, tools,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], // tools+system prefix
    cache_control: { type: "ephemeral" }, // automatic breakpoint on the growing tail
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    output_config: { effort: "medium" },
  });
  onUsage(res.usage);
  if (res.stop_reason !== "tool_use" && res.stop_reason !== "end_turn")
    return { kind: "stopped", reason: res.stop_reason ?? "unknown" }; // max_tokens, refusal, ...
  messages.push({ role: "assistant", content: res.content }); // verbatim, incl. thinking blocks
  const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!call) return { kind: "stopped", reason: "no_tool_call" }; // caller retries once
  if (OUTPUT_TOOLS.has(call.name)) return { kind: "final", tool: call }; // caller Zod-validates
  const tool = readTools[call.name];
  const parsed = tool?.schema.safeParse(call.input);
  let result: Anthropic.ToolResultBlockParam;
  if (budget.used >= MAX_READ_CALLS) {
    result = { type: "tool_result", tool_use_id: call.id, is_error: true,
      content: `Read-tool budget exhausted (${MAX_READ_CALLS}). Answer now with propose_patch or ask_question.` };
  } else if (!tool || !parsed?.success) {
    result = { type: "tool_result", tool_use_id: call.id, is_error: true,
      content: `Invalid call: ${tool ? z.prettifyError(parsed!.error!) : `unknown tool ${call.name}`}` };
  } else {
    budget.used++;
    result = { type: "tool_result", tool_use_id: call.id, content: await tool.run(parsed.data) };
  }
  messages.push({ role: "user", content: [result] }); // tool_result only, no trailing text
  return { kind: "continue" };
}
```

**What the caller does with each result:**

- **`final`:** Zod-parse `tool.input` for `propose_patch` or `ask_question`.
  - On success, return it to the UI. Do not append a `tool_result`, because the loop ends.
  - On failure with no retry used yet, append `{ role:"user", content:[{ type:"tool_result", tool_use_id: tool.id, is_error:true, content: z.prettifyError(err) }] }` and call `step` again.
- **`stopped: no_tool_call`:** use the one retry by appending a user text message that tells Claude to answer with
  an output tool.
- **Any other `stopped`, or a second failure:** return an error. The model is unchanged.
- **Always:** wrap `step` in `try/catch` for `Anthropic.APIError`, and pass an `AbortSignal` if the client
  disconnects. `step` can be extended to forward `{ signal }` as the second argument to `create`.

---

## 8. Unverified items and open questions

- **UNVERIFIED:** whether the final `propose_patch` schema fits the strict-mode limits (24 optional parameters, 16
  union-typed parameters, grammar size). Check it in `smoke:copilot`. The fallback is `strict: false` on that tool
  plus Zod.
- **UNVERIFIED:** real latency and cost per copilot request on Opus 5.5 at `medium` effort, and the actual cache
  hit rate. Record both from `smoke:copilot`.
- **UNVERIFIED in official docs:** the `server-side-fallback-2026-07-01` header paired with `fallbacks: "default"`.
  It comes from the [skill]; the parameter type itself is confirmed in [src].
- **SDK finding, open question:** `transformJSONSchema` (internal) drops `enum` and `const` into descriptions in
  0.129.0 (§2.5). It is not a problem for us as long as we build tool schemas ourselves.
- **Docs vs code:** the TS SDK docs say non-streaming timeouts "scale up to 60 minutes". The 0.129.0 code throws
  above 10 minutes' expected duration. This does not affect us at `max_tokens` 16000.
- **For SPEC:**
  - whether copilot chat history is kept server-side (append-only) or rebuilt per request as plain text (§2.3);
  - whether to opt into refusal fallbacks (§2.6);
  - whether to use one system prompt for all modes or one per mode (§3).

---

## Sources (accessed 2026-09-29)

- Bundled `claude-api` skill (Claude Code 2.1.285; model table cached 2026-09-25). Files used:
  `SKILL.md`, `typescript/claude-api/{README,tool-use,streaming}.md`,
  `shared/{prompt-caching,tool-use-concepts,error-codes,models,model-migration,live-sources}.md`.
- Models overview: https://platform.claude.com/docs/en/about-claude/models/overview
  (served as /docs/en/models/overview)
- Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Define tools (tool definitions, `tool_choice`, forced-tool-use restrictions):
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools (requested via
  /implement-tool-use.md, which returns the same page)
- Handle tool calls: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
- Strict tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use
- Structured outputs (JSON Schema limits, strict limits, SDK helpers):
  https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Handling stop reasons: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons
- API errors (codes, 529, request size, long requests, forced tool use, thinking-block errors):
  https://platform.claude.com/docs/en/api/errors
- TypeScript SDK: https://platform.claude.com/docs/en/api/sdks/typescript (served as
  /docs/en/cli-sdks-libraries/sdks/typescript)
- Migrating to Claude Opus 5.5: https://platform.claude.com/docs/en/models/opus-5-5/migration-guide
- Effort: https://platform.claude.com/docs/en/build-with-claude/effort
- npm registry: `npm view @anthropic-ai/sdk version | time | engines peerDependencies dependencies | dist-tags`;
  `npm view zod version` (https://www.npmjs.com/package/@anthropic-ai/sdk)
- SDK package source: `@anthropic-ai/sdk@0.129.0` tarball (`npm pack`). Files inspected: `README.md`,
  `CHANGELOG.md`, `client.d.ts`/`client.js`, `resources/messages/messages.d.ts`, `core/error.d.ts`,
  `internal/utils/log.js`, `internal/request-options.d.ts`, `helpers/{zod,json-schema}.d.ts`,
  `helpers/beta/zod.d.ts`, `src/lib/transform-json-schema.ts`, `resources/beta/messages/messages.d.ts`,
  `resources/models.d.ts`
- GitHub: https://github.com/anthropics/anthropic-sdk-typescript (referenced by docs; not fetched separately)
