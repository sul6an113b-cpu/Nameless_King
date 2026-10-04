# Progress

Each checkpoint: `✅ [phase] — [delivered] | [test command → passed/failed] | commit [hash]`

## Phase 0 — Plan
- Environment: Node v22.22.2, npm 10.9.7, git 2.43.0 (Linux cloud container; Chromium pre-installed at `/opt/pw-browsers`).
- Research: 5 parallel agents → `docs/RESEARCH.md` (Stack, Anthropic, XMILE, LTM, SDXorg).
- Plan: `docs/SPEC.md` (schema contract, interfaces, ownership, dependency list, test plan for all 14 acceptance criteria), `CLAUDE.md`, 8 agent briefs in `.claude/agents/`, DECISIONS D-001…D-013.

✅ Phase 0 — plan: research, SPEC, CLAUDE.md, agent briefs, decisions | n/a (documents only; no product code) → awaiting "approved" | commit ac50662

## Phase 1 — Scaffold
- Workspaces `@looplab/{core,content,server,web}` with the 15 approved runtime and 23 dev dependencies, pinned exactly; `npm install` added 300 packages.
- `packages/core/src/schema`: the Zod 4 model contract with integrity rules I1–I8, plus the patch schema, migrations, factory and name rules. `src/model`: immutable ops and CLD/SFD projections. `src/contracts.ts` and a stub per module matching SPEC §6.
- Server: Hono on 127.0.0.1 with Host/Origin guards, CORS, `/api/health` and a 501 copilot placeholder. Web: Vite + React shell with six stages, a model store with undo/redo and a copilot store.
- Harnesses: Vitest (5 projects), Playwright (`app` and `qa` projects), ESLint (type-aware, plus core-purity rules), and `scripts/check-skips.mjs`.
- Verified:
  - `npm run build` → OK
  - `npm run typecheck` → OK (5 projects)
  - `npm run lint` → OK
  - `npm test` → 39/39 passed in 7 files, 0 skips
  - `npm run e2e` → 1/1 passed, zero console errors
  - `npm run smoke:copilot` → skipped cleanly (no key)
  - `npm start` → serves `/` (200) and `/api/health`; a foreign Host gets 403
  - web bundle contains 0 occurrences of `ANTHROPIC_API_KEY` or `sk-ant-`

✅ Phase 1 — scaffold: workspaces, schema contract, model ops, module stubs, test harnesses | npm run build/typecheck/lint → passed; npm test → 39/39 passed; npm run e2e → 1/1 passed | commit 5d52df1

## Phase 2 — Core build
- Merged five agents: sd-engine (parser, units, Euler/RK4, Model Health), graph-analyst (loops, metrics, archetypes, polarity), copilot (tool loop, patch protocol, panel), methodologist (8 archetypes, 12 leverage points, 4 examples, USER_GUIDE), canvas-ui (shell, Frame/Map/Quantify/Test, persistence, workers).
- Measured: RK4 max rel. error 3.3e-8; convergence order Euler 0.94–1.05, RK4 3.94–4.12; 500-var × 10k Euler steps 330–430 ms (Node); 150-var loop enumeration ≤19 ms.
- SD review (methodologist): 0 blockers, 1 major (fixed: DT restored after DT/2 health run), 5 minors carried to Phase 3 owners (docs/decisions/methodologist.md).
- Verified: npm run build/typecheck/lint → OK; npm test → 728/728, 0 skips; npm run e2e → 5/5.

✅ Phase 2 — core engine, graph, copilot, content, canvas | npm test → 728/728 passed; npm run e2e → 5/5 passed | commit be9bf30

## Final verification — acceptance criteria

Run on branch `claude/sweet-lamport-ja78y5` after adding the Decide-stage "Add scenario" control (name + one constant override, `addScenario` in `apps/web/src/lib/edits.ts`; tests in `edits.test.ts` and `DecideStage.test.tsx`).

| Command | Result |
|---|---|
| `npm ci` / `npm install` (fresh clone) | OK, 0 vulnerabilities |
| `npm run build` | OK (`tsc --noEmit` for all workspaces + Vite bundle) |
| `npm run typecheck` | OK |
| `npm run lint` | OK |
| `npm test` | 839/839 passed in 64 files; `check-skips: OK (0 skip(s))` |
| `npm run e2e` | 9/9 passed (Chromium, 1280×800) |
| `npm run smoke:copilot` | skipped cleanly — no `ANTHROPIC_API_KEY` in `.env` |

Measured performance (`npx vitest run packages/core/src/sim/engine.perf.test.ts packages/core/src/graph/loops.perf.test.ts`):
- 500-variable SFD, 10,000 Euler steps: compile 15.7 ms, first run 290.1 ms, warm run 285.9 ms (Node, main thread).
- 150-variable loop enumeration: 8–19 ms for the SD-like and capped cases; the full Analyze pipeline on a capped 150-variable graph takes 53 ms.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `npm install`, `build`, `typecheck`, `lint`, `test` pass; no unlogged skip | PASS | Table above; `scripts/check-skips.mjs` → 0 skips |
| 2 | `npm run dev` serves on localhost with zero console errors | PASS | Fresh clone: `npm run dev` → `/` 200, `/api/health` 200 (also through the Vite proxy); a Playwright page load of http://127.0.0.1:5173 logged 0 console errors. E2E: `apps/web/e2e/shell.spec.ts`, `stages.spec.ts` (light and dark) |
| 3 | RK4 matches analytic solutions within 1e-6; convergence order Euler 1 ± 0.3, RK4 4 ± 0.3 | PASS | `packages/core/src/sim/analytic.test.ts` (exponential, goal seeking, logistic; DT ∈ {1, 1/2, 1/4}) |
| 4 | SDXorg test-models reproduce within a justified tolerance | DEFERRED | XMILE import/export is still a stub (`packages/core/src/xmile/index.ts`: `importXmile`, `exportXmile`). The tolerance (D-011) and the skip list are written but untested |
| 5 | Loop analysis: hand-verified cycles and polarities (incl. self-loops); flip-one-link property; 150 variables < 2 s or capped with a warning | PASS | `packages/core/src/graph/loops.test.ts` (fixtures incl. `self-loops`), `loops.property.test.ts` (a), `loops.perf.test.ts` |
| 6 | Polarity consistency check flags a deliberately wrong polarity | PASS | `packages/core/src/graph/polarity.test.ts`, `packages/core/test/integration/polarity.test.ts` |
| 7 | Loops That Matter: single-loop growth scores 100 %; logistic shifts from R to B | PASS | `packages/core/src/analysis/ltm.test.ts` (R loop +1 at every step; logistic relR/relB), `apps/web/e2e/ltm.spec.ts` |
| 8 | Each of the 8 archetype SFDs passes a behavior-shape test | PASS | `packages/content/src/archetypes.test.ts` ("KPI shows the signature shape" × 8), `shapes.test.ts` |
| 9 | Copilot with mocked API: five modes schema-valid; malformed output changes nothing; no patch without accept; live smoke | PARTIAL | Pass: mocked tool loop, schema validation, retry-then-error and "stops and errors change nothing" (`apps/server/src/copilot.test.ts`); no patch applies without accept (`apps/web/src/copilot/store.test.ts`, `CopilotPanel.test.tsx`); `smoke:copilot` skips cleanly. **DEFERRED:** copilot Intervene and Report — their server-side fake-client tests pass (`copilot.test.ts`), but the in-app flows are not signed off and no live call was run (no key) |
| 10 | Server binds 127.0.0.1; bundle has no key; `.env` ignored; `.env.example` exists | PARTIAL | `apps/server/src/bind.test.ts`, `tests/meta/scaffold.test.ts` (`.env` ignored, `.env.example` has an empty key). `grep -rlE 'ANTHROPIC_API_KEY\|sk-ant-' apps/web/dist` → 0 files, run by hand: there is **no automated bundle-scan test yet** |
| 11 | Every bundled model round-trips through JSON and XMILE with identical results | PARTIAL | JSON: every bundled example parses under `ModelSchema` (`packages/content/src/examples.test.ts`); JSON round-trip (`packages/core/src/schema/model.test.ts`) and save → restore (`apps/web/src/state/persistence.test.ts`). XMILE is **DEFERRED** (stub, see 4); the identical-simulation check is untested |
| 12 | Playwright: 6-variable CLD → R/B loops; rework example → tornado + Pareto; save → reload identical; report with loops, leverage, charts | PARTIAL | Pass: `apps/web/e2e/sensitivity.spec.ts` (rework → simulate → tornado + Pareto), `decide.spec.ts` (report with recommendation, loops, leverage ranking, chart), `ltm.spec.ts`. Not covered end-to-end: building a 6-variable CLD and save → reload (save/restore is unit-tested only). The report's leverage ranking is the structural one, because `rankLeverage` is DEFERRED |
| 13 | 500-variable SFD, 10,000 Euler steps < 1 s in a worker; 1,000-run Monte Carlo in workers with progress and cancel | PARTIAL | 500 variables: 290 ms first run (`packages/core/src/sim/engine.perf.test.ts`, Node main thread; the worker pool exists but is not timed separately). Monte Carlo is **DEFERRED** (`latinHypercube`, `monteCarlo` are stubs) |
| 14 | README clone → running in ≤ 5 commands; USER_GUIDE covers every stage | PASS | Fresh clone: `git clone`, `cd`, `npm install`, `cp .env.example .env`, `npm run dev` = 5 commands; the app answered on 5173 and 8787. `docs/USER_GUIDE.md` has sections 1 Frame … 6 Decide, plus Copilot and Files |

**Deferred (not built; stubs in `packages/core`):** Monte Carlo and Latin hypercube, calibration and fit statistics, XMILE import/export and the SDXorg validation, `rankLeverage`, and the copilot Intervene/Report sign-off.

**Known gaps found during verification:**
- No automated client-bundle key scan (criterion 10); the Phase 1 manual check still holds (0 matches).
- `npm run dev` logs `serveStatic: root path 'apps/web/dist' is not found` until `npm run build` has run; it is harmless in dev.
- Decide's "Add scenario" makes one-constant scenarios only; multi-override scenarios still come from examples or the copilot.
