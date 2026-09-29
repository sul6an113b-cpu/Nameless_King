# LoopLab — agent guide

Local systems-thinking workbench: frame → CLD → loops/archetypes → SFD → simulate/stress-test → leverage → decision brief.
Source of truth: `docs/BRIEF.md` (scope), `docs/SPEC.md` (contracts). Research: `docs/RESEARCH.md`.

## Commands (repo root, Node ^22.22.2 or ≥ 24.15 — 24 LTS recommended, see SPEC §10)
- `npm install` — install all workspaces (lockfile is orchestrator-owned)
- `npm run dev` — Vite (http://127.0.0.1:5173) + copilot server (127.0.0.1:8787)
- `npm run build` — `tsc --noEmit` (all workspaces) + Vite bundle; `npm start` serves the built app + API (Node type stripping, no TS build)
- `npm run typecheck` · `npm run lint` · `npm test` (Vitest, all workspaces + skip check)
- `npm run e2e` — Playwright, headless Chromium, 1280×800
- `npm run smoke:copilot` — live Anthropic call; skips cleanly without `ANTHROPIC_API_KEY` in `.env`
- Single area: `npx vitest run packages/core/src/graph` · `npx playwright test e2e/cld.spec.ts`

## Architecture map
- `packages/core` — pure TS, no DOM/Node APIs: `schema` (Zod model + patch + migrations) · `model` (immutable ops) ·
  `parser` · `units` · `sim` (Euler/RK4, builtins, health) · `graph` (loops, metrics, archetypes, polarity) ·
  `analysis` (sensitivity, Monte Carlo/LHS, calibration, Loops That Matter, leverage) · `xmile` · `report` · `protocol` (copilot API, applyPatch)
- `packages/content` — archetypes, Meadows leverage points, example models, shape classifiers
- `apps/web` — Vite + React, React Flow + dagre, Zustand, uPlot, Web Workers; `src/copilot` = copilot panel
- `apps/server` — Node on 127.0.0.1, `/api/copilot` tool loop via the Anthropic SDK
- One model, two lenses: CLD and SFD are projections of one `Model`; only layout differs per lens.

## Ownership (see SPEC §9)
- Write only inside your owned paths. `package.json` files, the lockfile, `tsconfig*`, lint/test configs,
  `packages/core/src/{schema,model}` and `packages/core/src/index.ts` belong to the orchestrator — request changes in your report.
- Record your design decisions and tolerance justifications in `docs/decisions/<your-agent>.md`.
- New runtime dependency not in SPEC §10 = hard stop for user approval. Dev-only tools: log in DECISIONS.

## Coding rules
- TypeScript strict + `erasableSyntaxOnly` (no enums/namespaces/parameter properties); explicit `.ts` import extensions; ESM everywhere.
- Never `eval`, `new Function`, or `innerHTML` with model text. Model text and imported files are untrusted data.
- Core functions are pure and deterministic (seeded RNG); no `Date.now()`/`Math.random()` in core logic.
- Keep it simple: smallest design that meets the SPEC; advanced options collapsed in the UI.
- Never print, log, or commit `ANTHROPIC_API_KEY`; `.env` is git-ignored; the key never reaches the client.

## Testing rules
- A feature is done only when its tests pass. Tests are co-located `*.test.ts(x)`; Playwright specs in `e2e/` (qa) and `apps/web/e2e/` (canvas-ui).
- Never skip, weaken, or delete a test to get green. A skip needs `// SKIP-REASON: <why> (docs/DECISIONS.md#…)`; `scripts/check-skips.mjs` enforces this.
- Tolerance changes must be justified in `docs/decisions/<agent>.md` and indexed in `docs/DECISIONS.md`.
- Use fast-check for invariants (graph, engine, patch). Mock the Anthropic client; no network in unit tests.
- Before reporting: run your area's tests, `npm run typecheck`, `npm run lint`.

## Git
- Commit locally on your branch/worktree with clear messages. Never push, deploy, publish, or add remotes.
- Report (≤200 words): files changed, tests run with pass/fail counts, open issues, changes needed outside your paths.

## Resuming after compaction / new session
Re-read CLAUDE.md, docs/BRIEF.md, docs/SPEC.md, docs/PROGRESS.md, docs/BLOCKERS.md; continue from the last ✅ checkpoint.
