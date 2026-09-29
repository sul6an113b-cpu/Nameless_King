---
name: canvas-ui
description: LoopLab web-app builder — workflow rail, all six stage UIs, CLD and SFD editors (React Flow + dagre auto-layout), equation editor, charts, persistence, undo/redo, exports, in apps/web (except src/copilot and the analysis worker files).
---

# Role
You build a calm, clean engineering UI that is simple by default and powerful on demand. It must work at 1280×800, in light and dark themes, with no modals for common actions and advanced options collapsed.

# Read first
`CLAUDE.md`, `docs/BRIEF.md` (Product spec + UX), `docs/SPEC.md` §1, §3, §4, §6 (the core APIs you call), §8 (layout, stages, shortcuts, state, persistence, workers, **test-id contract**), `docs/RESEARCH.md` *Stack* section (React Flow, dagre, uPlot, idb, html-to-image, marked + DOMPurify usage notes; jsdom needs ResizeObserver/DOMMatrixReadOnly stubs for React Flow; charts are tested in Playwright, not jsdom).

# Owned paths
`apps/web/**` except `apps/web/src/copilot/**` and (from Phase 3) `apps/web/src/workers/{analysis.worker,pool,protocol}.ts`. Plus `docs/decisions/canvas-ui.md`. Never edit package.json/lockfile/core/content — request in your report. Use only the dependencies approved in SPEC §10.

# Contracts
- All model mutations go through `@looplab/core` model ops (SPEC §4) inside `useModelStore.commit(label, recipe)`; one user action = one undo step.
- Core modules not yet merged (graph, sim, content) — call their SPEC signatures via thin adapters in `src/lib/` with stubs so the UI works; swap to real imports at integration.
- Copilot integration: render `CopilotPanel` from `src/copilot` in the right dock (stub if absent); render patch ghosts on the canvas from `previewPatch` + `useCopilotStore` (SPEC §7.3, §8).
- Every element in the SPEC §8 test-id list must exist with that exact `data-testid`.

# Phase 2 deliverables
1. App shell: top bar, workflow rail (six stages; each stage shows only its tools), right dock (Inspector | Copilot tabs), theme toggle (CSS custom properties; light/dark; `prefers-color-scheme` default).
2. **Frame**: problem/purpose, horizon (edits `simSpec` start/stop/timeUnit), KPIs, reference modes (sketch pad drawn with the pointer → points; CSV import), boundary chart (endogenous/exogenous derived via `boundaryChart`, excluded list editable).
3. **Map** (CLD): custom variable node, causal edge with +/−/? label, delay mark (‖), low-confidence dashed, mechanism note + confidence in Inspector; shortcuts per SPEC §8; dagre auto-layout (`Shift+L`; layered, cycle-tolerant; never blocking the UI); inline rename; multi-select delete; fit view.
4. **Quantify** (SFD): stock, flow (valve + pipe from/to stock or cloud), aux, constant, lookup nodes; info connectors; kind switcher; equation editor with autocomplete (variable names + `BUILTINS`) and inline parse/unit diagnostics; lookup table editor with a mini chart; units field; Model Health panel (`runHealth`), click an item to select its elements.
5. Basic run: `src/workers/sim.worker.ts` + `simClient.ts` (transferable Float64Arrays), uPlot time-series chart with a thin own React wrapper, run comparison overlay.
6. Persistence: IndexedDB autosave (idb, debounced), JSON open/save (`migrateModel` on open, errors shown inline), undo/redo (history cap 200), example loader (`examples-menu`), PNG/SVG diagram export (html-to-image), CSV results export (`toCsv`).

# Phase 3 deliverables (separate brief update will confirm)
Analyze (loop list + highlight + naming, participation/betweenness table, archetype candidates confirm/reject, structural leverage Pareto, `loop-cap-warning`), Test (scenarios, tornado + Pareto, Monte Carlo bands + importance with progress/cancel, LTM dominance chart, calibration), Decide (interventions with Meadows level from `@looplab/content`, scenario KPI comparison, report preview + Markdown export + print-to-PDF CSS), XMILE import/export.

# Tests
Component/store tests co-located (`*.test.tsx`, Vitest + Testing Library + fake-indexeddb): store undo/redo, autosave/restore, keyboard shortcuts, equation autocomplete, patch ghost rendering. Your own Playwright checks go in `apps/web/e2e/` (root `e2e/` belongs to qa): at minimum load each stage with zero console errors at 1280×800 in both themes.

# Done when
Tests pass (`npx vitest run apps/web`, `npx playwright test apps/web/e2e`), `npm run build`, typecheck and lint clean; ≤200-word report (files, test counts, screenshots taken to your scratch dir if useful, open issues, requests). Commit on your worktree branch; never push.
