# Copilot decisions

Owner: copilot. Indexed from `docs/DECISIONS.md`. Format: `C-NNN — decision — rationale`.

- **C-001 — Tool-facing `propose_patch` schema: eight explicit op shapes, every field required.** `add_variable`,
  `add_link`, `annotate_loop`, `add_scenario`, `add_intervention`, `add_assertion`, `update` (one field per op; the
  value is text that the server coerces: `"true"/"false"`, digits for leverage, `""` → null scenario) and `remove`.
  The server numbers ops `op1…opN` and generates the patch id, so the model cannot get them wrong; `annotate_loop`
  becomes an add or an update depending on whether the loop is already annotated. Why: strict mode caps optional and
  union parameters, and per-field updates make per-op accept granular (e.g. "flip polarity of l_3" is one op).
- **C-002 — Strict-mode budget, measured by `toolSchema.test.ts`:** 9 strict tools (limit 20), **0 optional
  parameters** (limit 24), **2 union parameters** (limit 16: the patch-op `anyOf` and `simulate_scenario.stop`
  nullable), no unsupported keywords. `toToolSchema()` drops `$schema`, bounds (`minLength`, `maximum`, `maxItems`,
  `minItems` > 1, …), maps `oneOf` → `anyOf`, and refuses open objects; Zod still enforces every bound. The API's
  internal grammar-size limit cannot be checked offline: **UNVERIFIED until `npm run smoke:copilot` runs with a key**.
  Fallback if it is rejected: `PROPOSE_PATCH_STRICT = false` in `apps/server/src/copilot/tools.ts` (Zod + retry still
  apply), per SPEC §7.2.
- **C-003 — One retry per request, shared** by "invalid output" and "`end_turn` without an output tool". A second
  protocol failure of either kind returns `{ ok: false }`. Simplest rule that satisfies both SPEC cases.
- **C-004 — Output validation is semantic, not only Zod.** A `propose_patch` is converted to the core `Patch` and
  applied with every op accepted to the request's model; any skipped op sends the patch back (one retry) with per-op
  reasons. Critique findings must cite ids that exist in the model. An output tool the mode does not allow is also a
  retryable error.
- **C-005 — Chat across requests is replayed as text, not as API turns** (RESEARCH §Anthropic 2.3, KISS option): each
  request is a fresh conversation whose first user message carries mode, stage, allowed outputs, focus, the model
  JSON and the chat so far. No thinking block is ever replayed across requests, so edits cannot invalidate one.
- **C-006 — Untrusted data handling.** The model JSON (canvas layout dropped, reference modes thinned to 60 points)
  and the chat go inside `<model_data>` / `<conversation>` with every `<` JSON-escaped as `<`, so data can
  never close a delimiter; tool results are JSON-escaped the same way and capped at 30,000 characters. The system
  prompt is one frozen block with no dates, ids or model data. Model JSON above 200,000 characters is refused
  (`bad-request`) rather than cut silently.
- **C-007 — Read-only tools.** Core calls go through an adapter: `NotImplementedError` becomes a normal result
  "… is not available yet" (not `is_error`, so Claude does not retry), and the tool list never changes when modules
  land. Invalid input → `is_error` and does not use the 8-call budget (the 12-iteration cap still bounds it); unknown
  element ids → `is_error`; any other exception → `is_error` with the message. `simulate_scenario` records what was
  simulated in the request context, ready for the Phase 3 Intervene check.
- **C-008 — Refusals:** no beta server-side fallback; `stop_reason: refusal` is shown as "Claude declined (category)"
  and changes nothing. `max_tokens` / context overflow → "cut off", and a trailing `tool_use` is never executed.
- **C-009 — No model slug in code.** `CLAUDE_MODEL` is required; with a key but no model the copilot is disabled and
  `/api/health` reports `copilot: 'no-model'` (an addition to SPEC's `'ready' | 'no-key'`). The SDK client gets the key
  explicitly with `authToken: null`, so it never picks up other credentials.
- **C-010 — Web apply semantics.** "Apply N accepted" commits the accepted ops in one `useModelStore.commit` (one undo
  step); pending and rejected ops are discarded with the patch. The client re-validates the patch shape before showing
  it. Copilot Markdown goes through marked + DOMPurify with images, media, frames, forms and styles forbidden (a
  remote image URL could exfiltrate model text).
- **C-011 — Known gaps (schema-owned).** `Assertion` has no `origin` field, so an accepted AI assertion cannot be
  tagged `ai-proposed`; the flow→stock links that `connectFlow` creates for an AI-added flow are tagged `user`.
