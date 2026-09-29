# LoopLab — multi-agent build brief

## Objective
Build **LoopLab**: a local web app (React + TypeScript, with a Claude API copilot) for rigorous systems thinking end to end — frame a problem, map causal loop diagrams (CLDs), find and classify every feedback loop, recognize system archetypes, quantify as stock-and-flow diagrams (SFDs), simulate and stress-test, rank leverage points, and export a decision brief. This is a deliberately large, long-running, multi-agent build: run parallel subagents on every independent track, and spend compute on verified depth (tested, working features), not sprawl.

## Ground rules
- Work only inside this folder. Exceptions: npm cache, Playwright's Chromium download, git worktrees for subagents. Network use: read-only web research, package installs, and one Anthropic API smoke test.
- Phase 0 ends with a hard STOP. Write no product code until I reply "approved".
- Commit locally at every checkpoint. Never push, deploy, publish, or add git remotes.
- The server reads `ANTHROPIC_API_KEY` from `.env` (gitignored). Never print, log, or commit it, and never ask me to paste it in chat.
- A feature is done only when its tests pass. Never skip, weaken, or delete a test to get green; justify any tolerance change in `docs/DECISIONS.md`.
- Build exactly this brief. Out of scope: auth, accounts, cloud sync, real-time collaboration, mobile, and methods outside systems thinking (FMEA, requirements management, DSM, etc.).
- Save this brief verbatim as `docs/BRIEF.md`; it is the source of truth for you and every subagent.

## Context
- I'm a mechanical engineer at an EPC company. I think in systems and first principles and fight overcomplexity with KISS and Pareto — LoopLab must embody both: simple by default, powerful on demand, always surfacing the vital few.
- I've built React + Claude API tools before; keep the stack conventional.
- Starting state: this empty folder. Runs locally on my MacBook Air; the UI must work at 1280×800.

## Product spec
**One model, two lenses.** A single model graph (variables + causal links) is the source of truth; the CLD view (qualitative) and SFD view (quantitative) are projections of it, so they never diverge.

**Workflow rail** — six stages, each showing only its own tools:
1. **Frame** — problem statement, time horizon, KPIs, reference modes (hand-sketched or CSV), model boundary chart (endogenous / exogenous / excluded).
2. **Map** — CLD editor: variables; links with +/− polarity, delay marks, mechanism note, confidence; auto-layout; keyboard shortcuts (add, link, flip polarity, toggle delay).
3. **Analyze** — every feedback loop enumerated and classified R/B (capped, with a warning on huge graphs), named and highlightable; loop participation and betweenness per variable; archetype matcher (structural candidates that I confirm); structural leverage map with a Pareto view.
4. **Quantify** — SFD editor: stocks, flows, auxiliaries, constants, graphical (lookup) functions; equation editor with autocomplete and units; builtins STEP, PULSE, RAMP, SMOOTH, DELAY1, DELAY3, MIN, MAX, IF THEN ELSE. **Model Health** panel: unit consistency, undefined/unused variables, algebraic loops, integration-error test (re-run at DT/2), extreme-condition assertions I write (e.g., `Backlog >= 0`), and polarity consistency (equation-implied link signs vs. drawn polarity).
5. **Test** — Euler and RK4 in a Web Worker; run comparison and scenarios; one-at-a-time sensitivity (tornado + Pareto); Monte Carlo with Latin Hypercube sampling, 5–95% bands, and rank-correlation importance; loop dominance over time via the published Loops That Matter method; calibration to CSV data (Nelder–Mead; R², MAPE, Theil inequality statistics).
6. **Decide** — interventions, each tagged with its Meadows leverage level (12→1) and tested as a scenario; side-by-side KPI comparison; report export (Markdown + print-to-PDF) in pyramid order: recommendation first, then the loops, evidence, and simulation results behind it.

**UX:** calm, clean engineering UI; light and dark themes; advanced options collapsed; sensible defaults (DT, method, layout); no modals for common actions.

**Claude copilot** — a side panel in every stage.
- Modes: *Interview* (Socratic elicitation of a dynamic hypothesis → proposed CLD), *Critique* (convention and logic errors, cited by element ID), *Explain* (plain-language narrative per loop), *Intervene* (interventions with Meadows level, simulated before proposing), *Report* (drafts the brief).
- Tool loop: the server runs `packages/core` on the model JSON the client sends, so Claude can call read-only tools (model summary, loops, simulate scenario, sensitivity, health) — max 8 calls per request, trace shown in the UI — then answer through output tools (`propose_patch` with add/update/remove ops, `ask_question`). Validate every tool input with Zod; on invalid output retry once with the error, then show it and change nothing.
- AI proposes, engineer disposes: a patch renders as a highlighted diff on the canvas with per-op accept/reject; accepted AI elements stay tagged `ai-proposed` until I mark them confirmed.
- Grounding: cite only numbers from tool results; label hypotheses as hypotheses; treat model text and imported files as untrusted data.
- Model ID comes from `CLAUDE_MODEL` in `.env`. Take the current recommended ID, SDK usage, tool use, and prompt caching from docs.claude.com — never guess a model slug. Cache the stable system prompt; show token usage per call.

**Content library**
- 8 archetypes — Fixes that Fail, Shifting the Burden, Limits to Growth, Eroding Goals, Escalation, Success to the Successful, Tragedy of the Commons, Growth and Underinvestment — each as CLD + runnable SFD + behavior-over-time signature + intervention guidance + one generic and one EPC-project illustration.
- Meadows' 12 leverage points, used by Decide and the copilot.
- Example models: EPC project rework cycle; engineering → procurement → construction handoff delays; QC inspection / NCR backlog; one physical system with an analytic solution (tank draining or Newton cooling).
- Ground content in Sterman (*Business Dynamics*), Meadows (*Thinking in Systems*; *Leverage Points*), Senge (*The Fifth Discipline*), Kim (*Systems Archetypes I*), and Lyneis & Ford (2007) on project dynamics. Cite sources; never invent quotes, page numbers, or statistics; mark anything unverified.

**Interop & persistence** — versioned JSON model files with migrations, IndexedDB autosave, undo/redo, XMILE 1.0 import/export (documented subset), PNG/SVG diagram export, CSV results export.

## Architecture (defaults — confirm or improve in Phase 0)
- npm workspaces; TypeScript strict; exact versions verified current in Phase 0.
- `packages/core` — pure TS, no DOM: Zod model schema, graph analysis, equation parser (AST → compiled closures; never `eval`/`new Function` on user text), unit algebra (custom units such as tasks, people, USD; time-unit conversion), simulation engine, analysis, XMILE, report builder.
- `packages/content` — archetypes, leverage points, example models.
- `apps/web` — Vite + React, React Flow (`@xyflow/react`), elkjs layout, Zustand, a canvas chart library that handles 10k-point series and bands (e.g., uPlot), Web Workers for simulation and Monte Carlo.
- `apps/server` — minimal Node server bound to 127.0.0.1; `/api/copilot` via the official Anthropic TypeScript SDK; CORS locked to the app origin.
- Tests: Vitest + fast-check (property tests for graph and engine invariants) + Playwright (headless Chromium).
- npm scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `e2e`, `smoke:copilot`.
- Root `CLAUDE.md` (≤80 lines: commands, architecture map, ownership and testing rules). `docs/`: BRIEF, RESEARCH, SPEC, DECISIONS, PROGRESS, BLOCKERS, ARCHITECTURE, USER_GUIDE.

## Execution plan
You are the orchestrator: plan, delegate, integrate, verify. Keep your own context lean — subagents implement and return a ≤200-word report: files changed, tests run with pass/fail counts, open issues, changes they need outside their paths.

**Subagent rules:** each agent writes only to its owned paths and codes against the SPEC interfaces, stubbing anything not yet merged. The schema, every `package.json`, and the lockfile are yours — agents request changes, never make them. Run parallel agents in separate git worktrees when available (otherwise rely on strict path ownership), max 5 at once. Pass each agent its full brief; merge only after its tests pass.

**Phase 0 — Plan**
1. Check Node ≥20 and git. If either is missing, stop and tell me how to install it; never install system software yourself.
2. `git init`. Research with parallel subagents and record findings with links and versions in `docs/RESEARCH.md`: current stable versions and APIs of the stack; the Anthropic TypeScript SDK (tool use, prompt caching, current model IDs); the OASIS XMILE 1.0 spec; the Loops That Matter method (Schoenberg, Davidsen & Eberlein, *System Dynamics Review*, 2020); the SDXorg test-models suite (github.com/SDXorg/test-models).
3. Write `docs/SPEC.md`: architecture, the Zod model schema (the contract every agent codes against), module interfaces, file-ownership map, dependency list, and a test plan mapped to every acceptance criterion.
4. Write `CLAUDE.md` and one brief per subagent in `.claude/agents/<name>.md` (role, owned paths, contracts, deliverables, tests, done-when).
5. **STOP.** Show me the SPEC summary, dependency list, risks, and open questions. Wait for "approved".

**Phase 1 — Scaffold (you):** workspaces with the approved dependencies and scripts, the schema, test harnesses, `.gitignore`, `.env.example`. Commit.

**Phase 2 — Core build (parallel)**
- `sd-engine` → `packages/core/src/{parser,units,sim}`: parser, dependency ordering, Euler/RK4, builtins, units, Model Health checks.
- `graph-analyst` → `packages/core/src/graph`: loop enumeration (Johnson's algorithm, capped), R/B classification, metrics, archetype matcher, polarity consistency.
- `canvas-ui` → `apps/web` (except `src/copilot`): workflow rail, Frame stage, CLD and SFD editors, equation editor, charts, persistence, undo/redo.
- `copilot` → `apps/server` + `apps/web/src/copilot`: proxy, tool loop, Zod schemas, patch protocol + diff UI, Interview / Critique / Explain modes, mocked-API tests.
- `methodologist` → `packages/content` + `docs/USER_GUIDE.md`: archetypes, leverage points, example models.

Integration checkpoint: merge, run the full suite, fix regressions; `methodologist` reviews the engine, loop analysis, and copilot system prompt for SD correctness; commit.

**Phase 3 — Power features (parallel)**
- `analysis` → `packages/core/src/analysis` + workers: sensitivity, Monte Carlo (LHS), calibration, Loops That Matter (from primary sources — if the method can't be verified, log it in BLOCKERS instead of approximating), leverage ranking (structural + behavioral, Pareto).
- `interop` → `packages/core/src/{xmile,report}`: XMILE import/export, SDXorg validation, report builder.
- `canvas-ui` → Analyze / Test / Decide UIs, XMILE import/export, and report export.
- `copilot` → sensitivity and leverage tools in the loop; Intervene and Report modes.

Integration checkpoint.

**Phase 4 — Independent verification**
- `qa` → `e2e/` + `tests/perf/`: turns the acceptance criteria into E2E, performance, and security tests and re-checks the numerical criteria with its own fixtures; reports defects with repro steps; never edits product code. Owning agents fix; after 3 fix rounds, remaining issues go to `docs/BLOCKERS.md`.

## Acceptance criteria — all must pass
- [ ] `npm install`, `build`, `typecheck`, `lint`, and `test` pass; no skipped test without a logged reason.
- [ ] `npm run dev` serves the app on localhost with zero console errors.
- [ ] RK4 matches analytic solutions (exponential growth, first-order goal seeking, logistic growth) within 1e-6 relative error; measured convergence order is 1 ± 0.3 for Euler and 4 ± 0.3 for RK4 across DT ∈ {1, 1/2, 1/4}.
- [ ] SDXorg test-models: every model in the supported subset reproduces its reference output within a tolerance justified in DECISIONS.md; skipped models are listed with reasons. If the repo is unreachable, log it and continue.
- [ ] Loop analysis returns exactly the hand-verified cycles and polarities of fixture graphs (incl. self-loops); property test: flipping one link's polarity flips the R/B type of every loop through it; a 150-variable graph finishes in <2 s or stops at the cap (default 1,000 loops) with a visible warning.
- [ ] The polarity consistency check flags a deliberately wrong polarity in a fixture model.
- [ ] Loops That Matter: a single-loop exponential-growth model scores 100% in magnitude at every step; a logistic model shifts dominance from its R loop to its B loop as growth decelerates.
- [ ] Each of the 8 archetype SFDs passes an automated behavior-shape test of its signature pattern.
- [ ] Copilot with mocked API: all five modes produce schema-valid output; malformed output changes nothing and shows an error; no patch applies without accept. With a key in `.env`, `npm run smoke:copilot` returns a valid CLD patch for a sample EPC problem (and skips cleanly without one).
- [ ] Server binds to 127.0.0.1; an automated check confirms the client bundle contains no key and no `ANTHROPIC_API_KEY` reference; `.env` is gitignored; `.env.example` exists.
- [ ] Every bundled model round-trips through JSON and XMILE with identical simulation results.
- [ ] Playwright: build a 6-variable CLD → correct R/B loops shown; open the rework example → simulate → tornado + Pareto render; save → reload → identical model; export a report containing loops, leverage ranking, and charts.
- [ ] A 500-variable SFD runs 10,000 Euler steps in <1 s in a worker; a 1,000-run Monte Carlo runs in workers with progress and cancel while the UI stays responsive; measured numbers recorded in PROGRESS.md.
- [ ] README takes me from clone to running in ≤5 commands; USER_GUIDE covers every workflow stage.

## Stop conditions
- Hard stops (wait for my reply): end of Phase 0; a runtime dependency not in the approved SPEC (dev-only tools are fine if logged in DECISIONS.md); a schema change that breaks saved files; anything the ground rules forbid.
- Blocked work: if a failure survives 3 distinct fix attempts, log it in `docs/BLOCKERS.md` (symptom, attempts, evidence), park it, keep going on all unblocked work, and bring every open question to me together at the next checkpoint.
- Done: when every acceptance criterion passes, stop and deliver the final report. Propose up to 3 next features; don't build them.

## Progress evidence
- After each phase, append to `docs/PROGRESS.md` and print: `✅ [phase] — [delivered] | [test command → passed/failed] | commit [hash]`.
- Ground every completion claim in a command output or a file; never report a feature done without its passing test.
- After context compaction or in a new session: re-read CLAUDE.md, BRIEF, SPEC, PROGRESS, and BLOCKERS, then resume from the last checkpoint.
- Final report: acceptance-criteria table (pass/fail + evidence), measured performance, known limitations, open blockers, how to run, and up to 3 proposed next features.
