# Decisions log

Format: `D-NNN — decision — rationale — date`. Agent-specific decisions and tolerance justifications live in `docs/decisions/<agent>.md` and are indexed at the bottom.

## Orchestrator

- **D-001 — The folder was not empty; `git init` was skipped.** The working directory is an existing git repository (branch `claude/sweet-lamport-ja78y5`, remote `origin`) that already contains one unrelated file, `Simulation` (a standalone HTML queue-simulation demo). I left it untouched and did not add or change any remotes. — 2026-09-29
- **D-002 — SDXorg test-models are cloned into the git-ignored `vendor/` folder** inside the project (`vendor/sdxorg-test-models`, shallow clone, ~95 MB), so nothing large is committed. The interop agent will vendor only the small files of the supported subset (with LICENSE and upstream commit hash) into `packages/core/test/fixtures/sdxorg/`. — 2026-09-29
- **D-003 — Link polarity allows `?` (unknown) besides `+`/`−`.** XMILE imports carry no polarity, and the copilot may be uncertain. Loops through a `?` link are typed `U`, and Critique/Health flag them. The CLD editor defaults to `+`. — 2026-09-29
- **D-004 — Variable kinds include `variable` (qualitative, not yet quantified) and `constant`.** A CLD variable exists before it is quantified. A constant is exported as an XMILE `<aux>` with a numeric equation, and on import a numeric-literal `<aux>` becomes a constant, so simulation is unchanged. — 2026-09-29
- **D-005 — Flow→stock causal links are stored as ordinary links**, and `connectFlow` maintains them. Loop analysis therefore reads one edge list for CLD and SFD alike. Model Health reports a missing or mis-signed implied link. — 2026-09-29
- **D-006 — Workspace packages export TypeScript source, and there is no TS build for Node.** Vite and Vitest compile the source on the fly. The server runs from source using Node's built-in type stripping, so tsx, dotenv and esbuild are not needed. The cost: all code uses erasable syntax only, with explicit `.ts` import extensions. `npm run build` runs `tsc --noEmit` for every workspace plus `vite build`. Nothing is published. — 2026-09-29
- **D-007 — Tests are co-located with source, and each agent owns `docs/decisions/<agent>.md`.** Ownership then follows paths without shared-file merge conflicts. — 2026-09-29
- **D-008 — Loops That Matter uses the 2023 revision** (Schoenberg, Hayward & Eberlein, SDR 39(2)) of the flow→stock link score, in its net-flow form. Scores are normalised per cycle partition (a strongly connected component). The dominance rule is ≥ 50 %, or else the smallest set that reaches 50 %. Why: under the 2020 formula, a births/deaths logistic model never shifts to its B loop, which contradicts the brief's acceptance criterion. Evidence: RESEARCH §LTM 5.2. — 2026-09-29
- **D-009 — XMILE builtins follow the de-facto semantics recorded in RESEARCH §XMILE 2–3**, checked against Stella, Simlin and PySD outputs. The XMILE spec gives prose only. LoopLab says it "reads and writes a documented subset of XMILE 1.0" and does not claim conformance, because base conformance requires include files and statistical builtins. Statistical builtins are rejected, so every run stays deterministic; Monte Carlo varies parameters outside the equations instead. — 2026-09-29
- **D-010 — Non-negative stocks limit their outflows in priority order**, which conserves material. The priority is the order of flow variables in the model. The two SDXorg `non_negative_*` tests encode PySD's stock-clamping behaviour and a flow shared between two stocks, so they are skipped with that reason. — 2026-09-29
- **D-011 — SDXorg tolerance: a value passes if `|err| ≤ 1e-4·|ref| + 1e-5·max(1, column magnitude)`**, with rows matched by step index. 1e-4 is the suite's own threshold. The absolute floor covers reference files that print only about 6 significant digits. A prototype interpreter reproduced every in-scope model with at least 14× headroom, and wrong semantics fail by 40× or more. The interop agent re-justifies this in `docs/decisions/interop.md`. — 2026-09-29
- **D-012 — Copilot tool loop.** `tool_choice` is `auto` with `disable_parallel_tool_use`. Output is enforced by strict tool schemas, a budget of 8 read-only calls (extra calls get `is_error` results) and a 12-iteration cap. Why: forced `tool_choice` (`any`/`tool`) returns HTTP 400 on the current recommended models, per the official docs checked 2026-09-29. — 2026-09-29
- **D-013 — Dev-tool pins:**
  - typescript 6.0.3, because typescript-eslint 8.71 requires `<6.1`.
  - @playwright/test 1.56.1, which matches the Chromium build pre-installed in this build environment, where browser downloads are blocked.
  - html-to-image 1.11.11, per React Flow's docs.

  All three should be revisited after Phase 4. — 2026-09-29

- **D-014 — Phase 1 scaffold choices.**
  - Contract types live in `packages/core/src/contracts.ts`.
  - Every module starts as a stub with the SPEC signatures, so parallel agents compile against the same interfaces from day one.
  - `migrateModel` returns a result union instead of throwing.
  - `.env` is loaded in code with `process.loadEnvFile`. Why: `node --watch` crashes on `--env-file-if-exists` when `.env` is absent (seen on Node 22.22.2).
  - Vite proxies `/api` with `changeOrigin: true`, because the server rejects any Host other than `127.0.0.1|localhost:<port>` (DNS-rebinding guard).
  - `noUncheckedIndexedAccess` stays off, to keep numeric hot loops readable; strict mode is on. — 2026-09-29
- **D-015 — Open Phase 0 questions resolved by default when the user said "Start Phase 1".**
  - No pushing: the brief's ground rule stands.
  - dagre replaces elkjs (license).
  - Node `^22.22.2 || >=24.15.0`.
  - The `Simulation` file is left untouched.

  The user can revise any of these. — 2026-09-29
- **D-016 — Temporary Phase 2 skips.** The content package's behaviour-shape tests may use `it.skipIf(!engineReady)` only while the simulation engine is unmerged, because the parallel agents cannot run it yet. The skip condition clears automatically once `simulate` works. The same applies to the tests that are gated on loop analysis (methodologist decision M-5).
  - At the Phase 2 integration checkpoint, these tests must run and pass; a skip that is still active is a defect.
  - Verified at integration: `npx vitest run --project content` → 126 passed, 0 skipped. — 2026-09-29
- **D-017 — `Assertion` gains `origin` (default `user`)**, so accepted AI-proposed assertions can be tagged `ai-proposed` like other elements. Additive with a default: saved v1 files still parse, so no migration is needed. — 2026-09-29

## Agent decision files
- `docs/decisions/graph-analyst.md` — structural leverage formula, archetype loop-role patterns and scoring, polarity-check method, loop enumeration timings (Phase 2).
- `docs/decisions/copilot.md` — tool-loop design, strict tool schemas (`toToolSchema`), budget enforcement, patch apply/preview semantics, mocking strategy (Phase 2).
- `docs/decisions/sd-engine.md` — SE-01…SE-18: time-unit convention (365-day year = 12 months = 4 quarters), builtin grid rules, non-negative limiting (iterated to a fixed point), DELAY τ read at t0, health checks, numeric test tolerances (Phase 2).
- `docs/decisions/methodologist.md` — sourcing and verification status per claim, illustrative parameters, shape-classifier definitions, engine behaviours the bundled models rely on (Phase 2).
