# Decisions log

Format: `D-NNN — decision — rationale — date`. Agent-specific decisions and tolerance justifications live in `docs/decisions/<agent>.md` and are indexed at the bottom.

## Orchestrator

- **D-001 — The folder was not empty; `git init` was skipped.** The working directory is an existing git repository (branch `claude/sweet-lamport-ja78y5`, remote `origin`) that already contains one unrelated file, `Simulation` (a standalone HTML queue-simulation demo). I left it untouched and did not add or change any remotes. — 2026-09-29
- **D-002 — SDXorg test-models are cloned into the git-ignored `vendor/` folder** inside the project (`vendor/sdxorg-test-models`, shallow clone, ~95 MB), so nothing large is committed. The interop agent will vendor only the small files of the supported subset (with LICENSE and upstream commit hash) into `packages/core/test/fixtures/sdxorg/`. — 2026-09-29
- **D-003 — Link polarity allows `?` (unknown) besides `+`/`−`.** XMILE imports carry no polarity, and the copilot may be uncertain. Loops through a `?` link are typed `U`, and Critique/Health flag them. The CLD editor defaults to `+`. — 2026-09-29
- **D-004 — Variable kinds include `variable` (qualitative, not yet quantified) and `constant`.** A CLD variable exists before it is quantified. A constant is exported as an XMILE `<aux>` with a numeric equation, and on import a numeric-literal `<aux>` becomes a constant, so simulation is unchanged. — 2026-09-29
- **D-005 — Flow→stock causal links are stored as ordinary links**, and `connectFlow` maintains them. Loop analysis therefore reads one edge list for CLD and SFD alike. Model Health reports a missing or mis-signed implied link. — 2026-09-29
- **D-006 — Workspace packages export TypeScript source.** Vite, Vitest and `tsx` compile it on the fly. `npm run build` type-checks with `tsc -b`, bundles the web app with Vite, and bundles the server with esbuild. Nothing is published. — 2026-09-29
- **D-007 — Tests are co-located with source, and each agent owns `docs/decisions/<agent>.md`.** Ownership then follows paths without shared-file merge conflicts. — 2026-09-29

## Agent decision files
_(indexed as agents create them)_
