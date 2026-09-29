# LoopLab — Phase 0 research

Compiled 2026-09-29 from five parallel research tracks. Each part below is the full report of one track, with its sources, access dates and an explicit list of UNVERIFIED items. SPEC decisions that come from this research are logged in `docs/DECISIONS.md` as D-008 to D-013.

| Part | Topic | Key findings carried into SPEC |
|---|---|---|
| **Stack** | Current versions and APIs | 15 runtime and 23 dev dependencies with exact versions. The set resolves cleanly with 0 audit findings. Pins: TypeScript 6.0.3 (typescript-eslint caps it), Node 22.22.2 or ≥ 24.15 (Node 20 is end-of-life), and Playwright 1.56.1. elkjs's license is EPL-2.0 OR GPL-3.0, so dagre (MIT) is proposed instead. The server runs on Node's built-in type stripping. |
| **Anthropic** | SDK, tool use, caching, models | Default `CLAUDE_MODEL=claude-opus-5-5` per the official models overview; cheaper option `claude-sonnet-5-5`. Use `@anthropic-ai/sdk` 0.129.0. Forced `tool_choice` returns 400 on current models, so use `auto` with strict tools and budget enforcement. Cache one frozen system block and add a top-level automatic cache breakpoint. Show four usage fields per call. |
| **XMILE** | OASIS XMILE 1.0 and builtin semantics | The spec gives builtins as prose only; the de-facto definitions were checked against Stella, Simlin and PySD. PULSE takes a volume. SMOOTH is spelled `SMTH1`. Rules are recorded for DELAY initial values, RK4 stage times and non-negative stocks and flows. A documented subset with rejection codes; LoopLab does not claim conformance. |
| **LTM** | Loops That Matter, from primary sources | Link, loop and relative loop scores. The 2023 flow→stock revision is required for the logistic R→B shift. Scores are normalised per cycle partition; a loop dominates at ≥ 50 %. Exact test oracles exist for exponential and logistic growth, plus the Bass diffusion table from the 2020 paper. |
| **SDXorg** | test-models suite at `21aab02` | 60 XMILE-bearing tests: 31 supported, 3 candidates and 1 constant-delay case in scope; 25 skipped with reasons. The suite is MIT-licensed; we vendor a ~0.4 MB subset. Tolerance is 1e-4 relative plus a 1e-5 floor. |

Primary sources that could not be fetched directly (docs.oasis-open.org, wiley.com and web.archive.org were blocked by the sandbox proxy) were read from public mirrors. Each part records where its sources came from and gives SHA-256 hashes where available.

---

# Part Stack — LoopLab: web/tooling stack research (Phase 0)

- **Date:** 2026-09-29. **Researcher:** stack subagent. **Scope:** current stable versions, constraints and key APIs of the web/tooling stack in `docs/BRIEF.md`. This file contains no product code.
- **Environment used for verification:** Node v22.22.2, npm 10.9.7, Linux container. All versions come from `npm view <pkg> version|time|license|peerDependencies|engines` run against registry.npmjs.org on 2026-09-29. I did not invent any version.
- **Local verification:** packages were installed only in a throwaway scratch dir (`/tmp/claude-0/.../scratchpad`), never in the repo. There I ran real smoke tests (build, test, lint, bundle-size measurements). They are listed in §6 and cited inline as **[verified]**.
- **Web access:** reactflow.dev, zod.dev, vite.dev, unpkg.com, jsdelivr.net and cdn.playwright.dev are **blocked** by this sandbox's egress proxy. When a doc page could not be fetched, I used its GitHub raw source or a search-engine snippet and label it that way. Anything I could not check is marked **UNVERIFIED**.

---

### 1. Summary table

Legend: **use** = recommended; **dev** = dev-dependency; **skip** = not recommended; **alt** = documented fallback.
"Released" is the publish date of that exact version.

| Package | Version | Released | License | Role | Rec. |
|---|---|---|---|---|---|
| typescript | **6.0.3** (latest tag is 7.0.2) | 2026-04-16 | Apache-2.0 | Type checker | **dev**. Pin 6.0.3 because TS 7 breaks typescript-eslint (§3) |
| zod | 4.6.5 | 2026-09-13 | MIT | Model schema, tool I/O validation, JSON Schema export | **use** |
| vite | 8.3.1 | 2026-09-24 | MIT | Dev server / bundler (Rolldown + Oxc) | **dev** |
| @vitejs/plugin-react | 6.1.1 | 2026-08-28 | MIT | React Fast Refresh (Oxc, no Babel) | **dev** |
| react / react-dom | 19.3.0 | 2026-09-09 | MIT | UI | **use** |
| @types/react / @types/react-dom | 19.3.0 | 2026-09-09 | MIT | Types | **dev** |
| @types/node | 22.20.4 (latest is 26.6.3) | 2026-09-19 | MIT | Node types matched to the Node 22 floor | **dev** |
| @xyflow/react | 12.12.0 | 2026-09-24 | MIT | CLD/SFD canvas | **use** |
| elkjs | 0.12.0 | 2026-07-17 | **EPL-2.0 OR GPL-3.0-or-later** | Layered auto-layout | **skip / alt**. License is outside MIT/BSD/Apache/ISC; 440 KB gz |
| @dagrejs/dagre | 3.1.1 | 2026-08-08 | MIT | Layered auto-layout | **use** (replaces elkjs; needs sign-off, §2.2) |
| zustand | 5.0.15 | 2026-08-13 | MIT | App state | **use** |
| zundo | 2.3.0 | 2024-11-17 | MIT | Undo/redo middleware | **skip**. Hand-roll instead; near-stale (~22 months) |
| uplot | 1.6.32 | 2025-03-14 | MIT | Time-series charts with bands | **use** |
| html-to-image | **1.11.11** (latest is 1.11.13) | 2023-02-01 | MIT | PNG/SVG export of the canvas | **use**, pinned per React Flow docs |
| @codemirror/state, view, autocomplete, commands, language, lint | 6.7.6 / 6.43.13 / 6.20.3 / 6.11.1 / 6.12.4 / 6.9.7 | 2026-06…09 | MIT | Equation editor | **alt**. Default is a plain textarea (§2.3) |
| @lezer/lr, common, highlight, generator | 1.4.10 / 1.5.3 / 1.2.5 / 1.8.1 | 2026 | MIT | Grammar-based highlighting | **skip** |
| idb | 8.0.3 | 2025-05-07 | ISC | IndexedDB wrapper for autosave | **use** |
| dexie | 4.4.6 | 2026-09-10 | Apache-2.0 | IndexedDB ORM | **skip** (32.6 KB gz vs 1.4 KB) |
| fake-indexeddb | 6.2.5 | 2025-11-07 | Apache-2.0 | IndexedDB in Vitest | **dev** |
| fast-xml-parser | 5.11.2 | **2026-09-29 (same day)** | MIT | XMILE import/export (Node and browser) | **use** |
| hono | 4.13.11 | **2026-09-29 (same day)** | MIT | `/api/copilot` server, 0 deps | **use** |
| @hono/node-server | 2.1.3 | **2026-09-29 (same day)** | MIT | Node adapter for Hono, 0 deps | **use** |
| express | 5.2.1 | 2025-12-01 | MIT | Server | **skip** (68 packages) |
| fastify | 5.12.5 | 2026-09-16 | MIT | Server | **skip** (49 packages, 15 MB) |
| node:http | built-in | n/a | MIT (Node) | Server | **alt** (0 deps, but hand-rolled CORS and body limit) |
| dotenv | 18.0.4 | 2026-09-25 | BSD-2-Clause | .env loading | **skip**. Use Node's built-in `process.loadEnvFile` / `--env-file-if-exists` |
| comlink | 4.4.2 | 2024-11-07 | Apache-2.0 | Worker RPC | **skip**. Native `Worker` plus a typed message union; near-stale |
| vitest | 5.0.2 | 2026-09-25 | MIT | Unit tests | **dev** |
| @vitest/coverage-v8 | 5.0.2 | 2026-09-25 | MIT | Coverage | **dev** (must equal the vitest version exactly) |
| fast-check | 4.10.2 | 2026-09-19 | MIT | Property tests | **dev** |
| @fast-check/vitest | 0.5.0 | 2026-09-11 | MIT | `test.prop` sugar | **skip** (KISS; `fc.assert` is enough) |
| @playwright/test | **1.56.1** (latest is 1.63.0) | 2025-10-17 | Apache-2.0 | E2E | **dev**, pinned to match `/opt/pw-browsers/chromium-1194` (§2.6) |
| jsdom | 30.1.1 | 2026-09-22 | MIT | DOM for component tests | **dev** |
| happy-dom | 20.14.5 | 2026-09-12 | MIT | DOM for component tests | **alt** (use if a Node floor below 22.22.2 is required) |
| @testing-library/react | 16.3.3 | 2026-08-27 | MIT | Component tests | **dev** |
| @testing-library/dom | 10.4.2 | 2026-09-13 | MIT | Required peer of RTL 16 | **dev** |
| @testing-library/user-event | 14.6.7 | 2026-09-02 | MIT | Interaction tests | **dev** |
| @testing-library/jest-dom | 7.0.1 | 2026-08-09 | MIT | Extra matchers | **skip** (optional; Node ≥22) |
| eslint | 10.11.0 | 2026-09-18 | MIT | Lint (flat config only) | **dev** |
| @eslint/js | 10.0.1 | 2026-02-06 | MIT | Recommended rules | **dev** |
| typescript-eslint | 8.71.0 | 2026-09-28 | MIT | TS lint | **dev** |
| eslint-plugin-react-hooks | 7.1.1 | 2026-04-17 | MIT | Hooks and compiler rules | **dev** |
| eslint-plugin-react-refresh | 0.5.7 | 2026-09-14 | MIT | HMR-safe exports | **dev** |
| globals | 17.12.0 | 2026-09-01 | MIT | ESLint globals | **dev** |
| prettier | 3.9.9 | 2026-09-23 | MIT | Formatter | **dev** |
| eslint-config-prettier | 10.1.8 | 2025-07-18 | MIT | Disables style rules | **skip** (no style rules are enabled) |
| npm-run-all2 | 9.0.3 | 2026-07-28 | MIT | `run-p` web + server in `npm run dev` | **dev** |
| concurrently | 10.0.5 | 2026-08-15 | MIT | Same role | **alt** (20 packages / 14 MB vs 17 / 1.2 MB) |
| tsx | 4.23.15 | 2026-09-20 | MIT | Run TS server in dev | **alt**. Default is native Node type stripping (§2.5) |
| marked | 18.0.14 | 2026-09-22 | MIT | Markdown → HTML (report preview, copilot text) | **use** |
| dompurify | 3.4.16 | 2026-09-23 | MPL-2.0 OR Apache-2.0 (take Apache-2.0) | Sanitize rendered HTML | **use** |
| markdown-it | 15.0.2 | 2026-09-11 | MIT | Markdown | **skip** (41 KB gz) |
| react-markdown | 10.1.0 | 2025-03-07 | MIT | Markdown as React elements | **skip** (83 packages, 36 KB gz) |
| mathjs | 15.2.0 | 2026-04-07 | Apache-2.0 | Units / math | **skip** (190 KB gz; hand-roll) |
| unitmath | 1.1.1 | 2024-10-05 | Apache-2.0 | Units | **skip** (failed to parse `task/person/day`) |
| js-quantities | 1.8.0 | 2023-08-21 | MIT | Units | **skip** (abandoned: >2 years since release) |
| convert-units | 2.3.4 | 2018-01-12 | MIT | Units | **skip** (abandoned) |
| simple-statistics | 7.12.1 | 2026-09-27 | ISC | Spearman / quantiles | **optional dev** (independent test oracle only) |
| fmin | 0.0.4 | 2024-10-29 | BSD-3-Clause | Nelder–Mead | **skip** (ESM packaging broken on Node 22) |
| jstat | 1.9.6 | 2022-11-21 | (no license field) | Stats | **skip** (abandoned, no license) |
| @anthropic-ai/sdk | 0.129.0 | 2026-09-28 | MIT | Copilot | **use**. Details in `docs/research/anthropic-sdk.md` |

---

### 2. Per-package notes

#### 2.1 Core

**typescript: pin 6.0.3, not 7.0.2**
- `latest` is 7.0.2 (2026-07-08), the Go-native compiler. Its package `exports["."]` is only `./lib/version.cjs` plus `./unstable/*`, so it has no classic JS compiler API.
- typescript-eslint 8.71.0 declares the peer `typescript: ">=4.8.4 <6.1.0"`. A dry-run install of TS 7 gives `ERESOLVE overriding peer dependency` **[verified]**.
- Per the TS 7.0 RC post and InfoQ (search snippets), the stable programmatic API is expected in 7.1. Microsoft publishes `@typescript/typescript6` (6.0.2; provides the `tsc6` binary) as a bridge. KISS: run a single compiler, 6.0.3, and revisit when TS 7.1 ships and typescript-eslint widens its range.
- TS 6.0 is the last JS-based release. It changes defaults: `strict: true`, `module: esnext`, `target` = latest ES, `types: []`, and `rootDir: .`.
- TS 6.0 deprecates `moduleResolution: node`/`node10`/`classic`, `baseUrl`, `outFile`, `target: es5`, `esModuleInterop:false` and others. These become hard errors in 7.0. `ignoreDeprecations: "6.0"` silences them, but the scaffold should simply not use them.
- Recommended tsconfig flags: `"moduleResolution": "bundler"`, `"verbatimModuleSyntax": true`, `"erasableSyntaxOnly": true` (needed for Node type stripping, §2.5), `"allowImportingTsExtensions": true` with `"noEmit": true`, and explicit `"types": [...]`.
- ESLint 10, typescript-eslint 8.71 and `tsc` 6.0.3 run cleanly on a sample `.tsx` **[verified]**.

**zod 4.6.5.** Checked locally in the scratch dir **[verified]**.
- `import * as z from 'zod'`. **Bundle note:** `import { z } from 'zod'` measured about 92 KB gz, because the namespace object defeats tree-shaking. `import * as z from 'zod'` measured 25–28 KB gz for object, discriminatedUnion, record, enum and prettifyError. Both measured with esbuild 0.28.2; the Rolldown result is UNVERIFIED. Use the `* as z` form.
- v3 → v4 changes that matter for the schema:
  - Error customization moves to `{ error: '...' }`. `message` is deprecated; `invalid_type_error` and `required_error` are removed.
  - `z.strictObject()` / `z.looseObject()` replace `.strict()` / `.passthrough()`.
  - `.merge()` is deprecated; use `.extend()`.
  - `z.record(keySchema, valueSchema)` now requires 2 arguments.
  - `.default()` short-circuits on `undefined` and must match the **output** type. `.prefault()` restores the v3 behaviour.
  - Format validators are top-level: `z.email()`, `z.uuid()`.
  - `ZodError.format()/.flatten()` are deprecated in favour of `z.treeifyError()` / `z.prettifyError()`.
  - `z.infer`, `z.input` and `z.output` are unchanged.
- `z.discriminatedUnion('kind', [...])` works. JSON Schema emits it as `oneOf` **[verified]**.
- **`z.toJSONSchema(schema, params)`** is in core, with no extra package. Params:
  - `target`: `'draft-2020-12'` (default; emits `$schema`), `'draft-07'`, `'draft-04'` or `'openapi-3.0'`
  - `io`: `'output'` (default) or `'input'`
  - `unrepresentable`: `'throw'` (default), `'any'`, or a handler function
  - `cycles`: `'ref' | 'throw'`; `reused`: `'ref' | 'inline'`; `override`; `metadata` registry
- In practice:
  - `strictObject` yields `additionalProperties: false`.
  - With `io: 'input'`, `.default()` fields drop out of `required`.
  - `z.date()` throws "cannot be represented" **[verified]**. Keep tool-input schemas to plain JSON types.
  - `z.fromJSONSchema` is also exported in 4.6, but I did not test it.
- The `zod/mini` functional API is about 4.4 KB gz. It is not needed; the classic API is fine for a local app.
- **Security note:** by default Zod v4 JIT-compiles object parsers with `new Function`. It probes for this via `allowsEval`, and the optional `zod/compile` does more of it. This compiles *schema shapes*, not user text. `z.config({ jitless: true })` turns it off; do that if we ship a CSP without `'unsafe-eval'`. Aim any automated "no `eval`/`new Function`" check at our own `packages/core/src` rather than the bundle, because the Zod code will match.
- The `@anthropic-ai/sdk@0.129.0` peer is `zod: ^3.25.0 || ^4.0.0`, so the two are compatible.

**vite 8.3.1** (8.0 shipped 2026-03-12)
- Rolldown (Rust) replaced both esbuild and Rollup; Oxc does the transforms. esbuild is now only an optional peer.
- Config renames: `build.rollupOptions` → `build.rolldownOptions`, `worker.rollupOptions` → `worker.rolldownOptions`, `esbuild` → `oxc`, `optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`.
- Default build targets rose to Chrome/Edge 111, Firefox 114 and Safari 16.4. Source: the migration guide on GitHub raw.
- engines: `node ^20.19.0 || >=22.12.0`.
- A module worker via `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })` builds into a separate chunk **[verified]**.
- `server.proxy: { '/api': 'http://127.0.0.1:8787' }` lets the web app call the server same-origin in dev.
- For Vitest config inside `vite.config.ts`, import `defineConfig` from `vitest/config`, or add `/// <reference types="vitest/config" />`. This is the standard pattern; I did not type-check it here.

**@vitejs/plugin-react 6.1.1**
- 6.0.0 (2026-03-12) **removed Babel**: React Refresh now runs through Oxc. Babel plugins now need the separate `@rolldown/plugin-babel`.
- Requires Vite 8+ and Node 20.19+/22.12+.
- 6.1 adds experimental Rust React Compiler support (`react({ compiler: true })` plus `oxc-transform-react`). Leave it off.
- Usage stays `plugins: [react()]`.
- Source: the plugin CHANGELOG on GitHub raw.

**react / react-dom 19.3.0** (2026-09-09)
- `react-dom` peer is `react ^19.3.0`; keep the two, plus `@types/react` and `@types/react-dom`, on the same version.
- The contents of the 19.3 release post are **UNVERIFIED**: I did not fetch it. Nothing in LoopLab depends on 19.3-specific APIs.
- Use `createRoot`.

#### 2.2 Canvas

**@xyflow/react 12.12.0**
- Peers: `react >=17`, `react-dom >=17`, optional `@types/*`. React 19.3 works and was rendered in tests **[verified]**.
- It depends on `zustand ^4.4.0` internally, so a nested zustand 4.5.7 installs next to our zustand 5.0.15. This is harmless, about 1 KB.
- API used by LoopLab:
  - Named imports: `import { ReactFlow, ReactFlowProvider, useReactFlow, Handle, Position, BaseEdge, EdgeLabelRenderer, getBezierPath, MarkerType, Background, Controls, MiniMap, applyNodeChanges, getNodesBounds, getViewportForBounds } from '@xyflow/react'`, plus `import '@xyflow/react/dist/style.css'`. There is no default export in v12.
  - Custom nodes: `nodeTypes = { variable: VariableNode }`, defined at module scope. Type them with `NodeProps<Node<Data, 'variable'>>`. In v12 the measured size is `node.measured.{width,height}`.
  - Custom edges: `EdgeProps<Edge<Data, 'causal'>>`. Render `<BaseEdge path markerEnd/>`, plus `<EdgeLabelRenderer>` holding an absolutely positioned div at `labelX/labelY` for the polarity sign and delay mark. Give that label `pointerEvents: 'all'` and the classes `nodrag nopan` so it can be clicked.
  - Wrap in `ReactFlowProvider` whenever toolbar or export components call `useReactFlow()` outside `<ReactFlow>`.
  - `getViewportForBounds(bounds, width, height, minZoom, maxZoom, padding) → {x,y,zoom}`. Signature checked in the `@xyflow/system` 0.0.83 `.d.ts` **[verified]**.
- **Model is the source of truth:** derive `nodes`/`edges` from the model with selectors. Use `applyNodeChanges` for transient drag state, and write positions back to the model in `onNodeDragStop`, which gives one undo step per drag.
- Recent changelog: 12.10 added `zIndexMode` and `experimental_useOnNodesChangeMiddleware`; 12.11 added `autoPanOnSelection` and optional `@types` peers; 12.12 is a resize fix. No breaking changes. Source: CHANGELOG on GitHub raw.
- **Testing:** jsdom throws `ReferenceError: ResizeObserver is not defined` when mounting `<ReactFlow>`. It passes after stubbing `ResizeObserver` and `DOMMatrixReadOnly` in a Vitest setup file **[verified]**. Test real layout and interaction in Playwright.

**elkjs 0.12.0: license flag**
- License is `EPL-2.0 OR GPL-3.0-or-later`; 0.9.3 was `EPL-2.0`. That is weak or strong copyleft, **not** in the required MIT/BSD/Apache/ISC set. It is probably fine for an undistributed local tool, but it breaks the stated rule.
- Size: `elk.bundled.js` is 1.46 MB minified / **440 KB gz**.
- Vite pattern **[verified build]**:
  ```ts
  import ELK from 'elkjs/lib/elk-api.js';
  import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
  new ELK({ workerUrl: elkWorkerUrl });
  ```
  The main chunk grows by about 2 KB; a separate 1.6 MB worker asset loads lazily. The package ships no `exports` map and uses classic CJS/UMD files.

**@dagrejs/dagre 3.1.1: recommended replacement (needs orchestrator/user sign-off, because the brief names elkjs)**
- MIT. One dependency: `@dagrejs/graphlib` 4.0.5 (MIT). 16.8 KB gz. Actively released: 3.0.0 2026-03-22, 3.1.1 2026-08-08. Ships types.
- API:
  ```ts
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'LR', nodesep, ranksep });
  g.setDefaultEdgeLabel(() => ({}));
  g.setNode(id, { width, height });
  g.setEdge(v, w, {}, name);
  dagre.layout(g);
  g.node(id); // returns the node CENTRE {x, y}
  ```
  React Flow positions are top-left, so subtract w/2 and h/2.
- Cyclic graphs work: the acyclic pass reverses feedback edges **[verified]**.
- Measured layout time in Node 22 in this container **[verified]**:

  | Graph | dagre | ELK layered (warm) |
  |---|---|---|
  | 30 nodes, 40 edges | 33 ms | 140 ms |
  | 60 / 80 | 110 ms | 143 ms |
  | 150 / 207 | 285 ms | 290 ms |
  | 500 / 698 | 1.9 s | 1.16 s |
  | dense random, 500 / 996 | 14.4 s | 3.0 s |

- **Implication:** for typical CLDs (≤60 variables) dagre is fast enough on the main thread. For >100 variables, run layout in the existing Web Worker, or cap auto-layout with a warning.
- Fallback: if layout quality is inadequate, elkjs is a drop-in alternative once the license is accepted.

**zustand 5.0.15**
- Named exports only: `create<S>()((set, get) => ...)`.
- A selector that returns a fresh object or array now throws "Maximum update depth exceeded". Wrap such selectors with `useShallow` from `zustand/react/shallow`.
- `createWithEqualityFn` moved to `zustand/traditional` and needs the optional peer `use-sync-external-store`. Avoid it.
- Requires React ≥18. The middlewares `subscribeWithSelector` and `devtools` are in `zustand/middleware` **[verified exports]**.
- Size: 0.7 KB gz. Non-React access via `store.getState()/subscribe()` is useful for debounced IndexedDB autosave and for passing snapshots to workers.

**zundo 2.3.0: skip; hand-roll undo/redo**
- `temporal(creator, { partialize, limit, equality, handleSet })`, then `store.temporal.getState().undo/redo/pause/resume/clear()`. 0.7 KB gz. Peer: zustand ^4.3 || ^5.
- Last release was 2024-11-17 (~22 months), close to the 2-year staleness line.
- The model is a single immutable JSON document, so undo is simply `{ past: Model[], future: Model[] }` plus `commit(next, label)`, capped at about 200 entries.
- Explicit commit points (drag stop, accepted AI patch = 1 step, equation blur) are clearer than zundo's per-`set` capture plus `pause/resume` or debounced `handleSet`.
- About 40 lines, easy to property-test (e.g., undo after commit restores the previous model; redo after undo restores the next).

**uplot 1.6.32**
- MIT, 23 KB gz, no dependencies, ships `uPlot.d.ts`. Last release 2025-03-14, single maintainer, stable.
- README claims "150,000 data points in 90ms", so 10k-point series are trivial.
- Bands: `bands: [{ series: [upperIdx, lowerIdx], fill: 'rgba(...)', dir?: 1|-1 }]` (type checked in `.d.ts`). A 5–95% band is `[t, p95, p50, p5]` with the band spanning series 1 to 3.
- React wrapper: write your own of about 40 lines:
  - `useRef` div; in an effect, `new uPlot(opts, data, el)`.
  - `u.setData(data)` when data changes.
  - `u.setSize()` from a `ResizeObserver`.
  - `u.destroy()` in cleanup.
  - Import `uplot/dist/uPlot.min.css`.

  Skip `uplot-react` 1.2.4 and `react-uplot` 0.0.9.
- Export uses `u.ctx.canvas.toDataURL('image/png')`. uPlot is canvas-only, so there is **no SVG**; embed charts in the report as PNG.
- jsdom has no canvas (`canvas` is only an optional peer of jsdom), so test chart rendering in Playwright.
- **Tornado and Pareto:** uPlot bars are vertical (`uPlot.paths.bars`), and horizontal tornado bars are awkward. Draw tornado and Pareto as small hand-rolled SVG components (≤50 bars), which also export as true SVG.

**html-to-image: pin 1.11.11**
- React Flow's "Download image" example states that "the version of the html-to-image package used in this example has been locked to 1.11.11, which is the latest working version… recent versions… are not exporting images properly". This comes from a search snippet of reactflow.dev/examples/misc/download-image; direct fetch was blocked. The specific upstream issue is **UNVERIFIED**.
- 1.11.11 was published 2023-02-01; the latest, 1.11.13, on 2025-02-14. 4.9 KB gz.
- Pattern: `toPng(document.querySelector('.react-flow__viewport'), { backgroundColor, width, height, style: { width, height, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` } })`, where `vp = getViewportForBounds(getNodesBounds(nodes), width, height, minZoom, maxZoom, padding)`.
- `toSvg` from the same library wraps HTML in `<foreignObject>`. It renders in browsers; whether it opens in Inkscape, Illustrator or Office is **UNVERIFIED** and commonly problematic. If a clean vector SVG is required, write a small serializer from model geometry (node rects/text plus edge paths). About 100 lines.

#### 2.3 Equation editor: KISS recommendation is a textarea

- **Default: a plain `<textarea>`/`<input>` with a suggestion list rendered *below* the field.**
  - Use the ARIA combobox pattern, driven by the token at the caret. That token comes from our own tokenizer, which the parser needs anyway.
  - Parse errors and unit errors show inline under the field.
  - No new runtime dependency, no caret-pixel positioning, fully testable with RTL and user-event.
  - SD equations are short one-liners, so this covers the common case.
- **Fallback: CodeMirror 6.** State + view + autocomplete measured **90 KB gz**; adding commands/history and lint gives 106 KB gz. That is 1.3× React, so lazy-load it in the Quantify stage.
  - API: `new EditorView({ parent, state: EditorState.create({ doc, extensions: [autocompletion({ override: [ctx => ({ from, options })] }), history(), keymap.of([...defaultKeymap, ...historyKeymap]), linter(src => diagnostics)] }) })`.
  - `@codemirror/language` and `@lezer/*` are only needed for grammar-based highlighting. Skip them.
  - CodeMirror autocomplete works in jsdom: `completionStatus` returned `active` with the expected option **[verified]**.
  - All packages are MIT and actively released (2026).

#### 2.4 Persistence and XML

**idb 8.0.3** (ISC, 1.4 KB gz, ships types)
- `openDB(name, version, { upgrade(db) { db.createObjectStore('models') } })`, then `db.put('models', value, key)` and `db.get(...)`. Promise API.
- Autosave: debounce store subscriptions and put the whole model JSON by id.
- Latest release is 2025-05-07; the API is small and stable.
- **dexie 4.4.6** is 23× bigger (32.6 KB gz) for query features we don't need. Skip it.

**fake-indexeddb 6.2.5**
- Use `import 'fake-indexeddb/auto'` in the Vitest setup file.
- The idb round-trip test passes under jsdom **[verified]**.

**fast-xml-parser 5.11.2** (MIT; ESM and CJS; bundled `.d.ts`; 24.6 KB gz; 6 small dependencies: strnum, is-unsafe, xml-naming, fast-xml-builder, @nodable/entities, path-expression-matcher)
- Works in both `packages/core` (Node, where there is no DOMParser) and the browser.
- Parser settings used against a real XMILE snippet **[verified]**:
  ```ts
  new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, trimValues: true, isArray: n => ['stock','flow','aux','inflow','outflow', ...].includes(n) })
  ```
  - `parseTagValue: false` keeps equations and numbers as strings; the SD parser owns numeric parsing.
  - `isArray` avoids single-element or array ambiguity.
  - `&lt;` in `<eqn>` decodes correctly.
- `XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@_', format: true })` escapes `<` and `&` on output **[verified]**.
- `preserveOrder: true` gives an ordered array-of-objects form (`[{a:[...], ':@': {'@_x':'1'}}]`). Use it only if round-trip order matters; the documented XMILE subset shouldn't need it.
- `XMLValidator.validate(xml)` is available for early rejection.
- v4 → v5: 5.0 added ESM with "no change in the functionality, syntax, APIs, options"; 5.7 hardened entity processing. Source: search snippet of the CHANGELOG. The `legacy` dist-tag is 4.5.7.
- The version was published today, so re-check `npm view` at scaffold time. If a regression appears, pin the previous 5.11.x.

#### 2.5 Server, environment, workers, dev orchestration

**Server: Hono 4.13.11 + @hono/node-server 2.1.3.** Both have 0 dependencies and are MIT.
- Smoke test **[verified]**:
  ```ts
  const app = new Hono();
  app.use('/api/*', cors({ origin: 'http://127.0.0.1:5173', allowMethods: ['POST'], allowHeaders: ['Content-Type'] }));
  app.post('/api/copilot', bodyLimit({ maxSize: 2 * 1024 * 1024 }), async c => c.json(...));
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' });
  ```
  - It listened on 127.0.0.1.
  - The allowed origin was echoed back.
  - A preflight from `http://evil.example` got no `Access-Control-Allow-Origin`.
- Tests can call `app.request('/api/copilot', {...})` with no port. `hono/testing`, `hono/streaming` (`streamSSE`, useful for streaming the tool trace) and `hono/secure-headers` all exist **[verified exports]**.
- @hono/node-server 2.0.0 shipped 2026-04-21; engines `node >=20`, peer `hono ^4`.
- Both hono and @hono/node-server were published today (2026-09-29), so re-verify at scaffold time.
- **Security note:** CORS only governs what a *browser* may read. The handler should also reject requests whose `Origin` is not the app origin, and whose `Host` is not `127.0.0.1:<port>`/`localhost:<port>`. This covers CSRF and DNS-rebinding. Never log request headers or env.
- **Alternatives:**
  - express 5.2.1 (68 packages) and fastify 5.12.5 (49 packages, 15 MB) are overkill for one endpoint.
  - `node:http` has zero dependencies, but CORS preflight, body limits and JSON errors would be hand-rolled and hand-tested. Hono gives the same with one tiny dependency.

**.env: use Node built-ins, skip dotenv**
- `process.loadEnvFile(path)` was added in v20.12.0 / v21.7.0 (Node docs, search snippet) and works here **[verified]**. `--env-file` was added in v20.6.0; `--env-file-if-exists` in v22.9.0. Both have been "no longer experimental" (Stability 2) since v24.10.0 / v22.21.0 (Node `doc/api/cli.md`).
- Existing environment variables override values from the file.
- Recommended: start the server with `node --env-file-if-exists=.env ...`. `smoke:copilot` can then skip cleanly when `ANTHROPIC_API_KEY` is unset.
- dotenv 18.0.4 prints `◇ injected env (1) from .env` on load by default **[verified]**. That is an extra dependency and log noise near secrets.

**Running the TypeScript server: native Node type stripping (no tsx)**
- Unflagged by default since v22.18.0 / v23.6.0; no warning since v22.18/v24.3; **stable** in v24.12.0 / v25.2.0. Source: nodejs.org/api/typescript.md via search snippet.
- On Node 22.22.2, `node apps/server/src/index.ts` ran with no warning and imported a workspace package (`@looplab/core` symlinked, `exports: "./src/index.ts"`) **[verified]**. `process.features.typescript === 'strip'`.
- Constraints **[verified]**:
  - Only erasable syntax. `enum` throws; use `erasableSyntaxOnly` in tsconfig, and also avoid namespaces and parameter properties.
  - Relative imports must carry the `.ts` extension. Extensionless imports throw `ERR_MODULE_NOT_FOUND`.
  - No type-checking at runtime; `tsc` does that.
- Dev command: `node --watch --env-file-if-exists=.env apps/server/src/main.ts`.
- **Fallback:** `tsx` 4.23.15 (esbuild-based, node ≥18) if the extension or enum constraints become a burden.

**Workers: native Vite workers + a typed message union (skip comlink)**
- Pattern: `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })`, set `worker.format: 'es'`, and post a `Req` union (`run | cancel`). Builds under Vite 8 **[verified]**.
- Progress = periodic `postMessage({ kind: 'progress', done, total })`. Cancel = `worker.terminate()` for Monte Carlo, or a cancel flag checked between runs.
- comlink 4.4.2 (2.1 KB gz, last release 2024-11) only hides `postMessage`. That abstraction is not worth a dependency here, and cancellation and progress are clearer when explicit.
- For unit tests, test the pure `simulate()` function directly, and test worker plumbing in Playwright. `@vitest/web-worker` 5.0.2 exists but isn't needed.

**Dev orchestration: npm-run-all2 9.0.3**
- `"dev": "run-p -l dev:web dev:server"`. Fewer packages than concurrently 10.0.5 (17 packages / 1.2 MB vs 20 / 14 MB).
- engines `node ^22.22.2 || ^24.15.0 || >=26.0.0`, `npm >=10`.
- concurrently is the alternative, with nicer colored prefixes; engines `node >=22`.

#### 2.6 Testing

**vitest 5.0.2** (5.0.0 on 2026-09-03: a new major, about 4 weeks old)
- Requires **Node ≥22.12** (engines `^22.12.0 || ^24.0.0 || >=26.0.0`) and Vite ≥6.4 (peer `vite ^6.4 || ^7 || ^8`).
- Breaking changes from the migration guide on GitHub raw:
  - `clearMocks` defaults to on.
  - Hoisted `vi.mock`/`vi.hoisted` calls inside functions or describe blocks now throw.
  - Un-awaited async assertions fail.
  - `testNamePattern` uses the `' > '` separator.
  - Inline projects default to `extends: true`.
  - Coverage-threshold globs are now root-relative.
  - Artifacts are consolidated into `.vitest/`.
- Use `test.projects` for the monorepo; there is no `workspace` option in the 5.x types **[verified]**. Vite 8 + plugin-react 6 + Vitest 5 + jsdom 30 + RTL 16 + user-event 14 + fast-check 4 all passed a sample run **[verified]**.
- **Fallback:** Vitest 4.1.11 (2026-08-18; engines `^20 || ^22 || >=24`) if Node 20 support were mandatory.
- `@vitest/coverage-v8` must equal the vitest version exactly (peer `vitest: "5.0.2"`).

**fast-check 4.10.2**
- `fc.assert(fc.property(arbs..., predicate))`, `fc.integer`, `fc.double({ noNaN: true, noDefaultInfinity: true })`, `fc.uniqueArray`, `fc.constantFrom`, `fc.record`. Use a seed or `numRuns` for reproducibility.
- Worked in Vitest 5 **[verified]**.

**@playwright/test: pin 1.56.1 to match the pre-installed browser**
- `/opt/pw-browsers` contains `chromium-1194`, `chromium_headless_shell-1194` and `ffmpeg-1011`. The binary reports **Chromium 141.0.7390.37**.
- Mapping from each version's `browsers.json` **[verified]**: 1.55.1 → 1193; **1.56.0 and 1.56.1 → 1194**; 1.57.0 → 1200; 1.63.0 → 1243 (Chromium 153).
- 1.56.1 launches the pre-installed headless shell with no download **[verified]**.
- 1.63.0 fails with `Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1243/...`, and the download hosts (`cdn.playwright.dev`, `playwright.download.prss.microsoft.com`) return **403 from the egress proxy**.
- 1.63.0 with `launchOptions.executablePath: '/opt/pw-browsers/chromium'` did launch and render, but that combination is unsupported.
- **Recommendation:** pin `@playwright/test` to `1.56.1` so the sandbox and the Mac behave the same. On the Mac, `npx playwright install chromium` downloads build 1194 for 1.56.1; not verifiable from here, so **UNVERIFIED**.
- Upgrade to 1.63.x only if a needed feature appears.

**Component-test DOM: jsdom 30.1.1**
- React Flow needs `ResizeObserver` and `DOMMatrixReadOnly` stubs (§2.2). Charts (canvas) belong in Playwright.
- **engines `node ^22.22.2 || ^24.15.0 || >=26.0.0`**. This is the strictest Node constraint in the stack; see §3.
- **Alternative:** happy-dom 20.14.5 (engines `node >=20`, 9 packages vs 37). It is faster and has a built-in no-op ResizeObserver, but it is less standards-complete. Use it if the Node floor must drop below 22.22.2.

**@testing-library/react 16.3.3**
- Peers: React 18/19 and **`@testing-library/dom ^10` as an explicit peer**, so install it.
- `@testing-library/user-event` 14.6.7: use `await userEvent.click(...)`.
- Skip `@testing-library/jest-dom` 7 (Node ≥22); plain `expect` is enough.

#### 2.7 Lint and format

- **eslint 10.11.0** (10.0.0 on 2026-02-06).
  - eslintrc is fully removed; only `eslint.config.*`. Config lookup now starts from each linted file's directory, which helps monorepos.
  - engines `^20.19 || ^22.13 || >=24`.
  - The ESLint 9.x line reached end-of-life on 2026-08-06 (eslint.org banner, search snippet).
- **typescript-eslint 8.71.0**: peers `eslint ^8.57 || ^9 || ^10`, `typescript >=4.8.4 <6.1.0`. Use `tseslint.configs.recommendedTypeChecked` with `parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }`.
- **eslint-plugin-react-hooks 7.1.1**: use `reactHooks.configs.flat.recommended`. It includes the React Compiler-derived rules (`set-state-in-effect`, `purity`, `refs`, `immutability`, and others; 29 rules). It flagged setState-in-effect in a sample **[verified]**.
- **eslint-plugin-react-refresh 0.5.7**: use `reactRefresh.configs.vite`. Peer `eslint ^9 || ^10`.
- **@eslint/js 10.0.1** + **globals 17.12.0**.
- Config shape that ran cleanly **[verified]**:
  ```js
  defineConfig([globalIgnores(['dist']), { files: ['**/*.{ts,tsx}'], extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked, reactHooks.configs.flat.recommended, reactRefresh.configs.vite], languageOptions: { globals: globals.browser, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } } }])
  ```
  Import `defineConfig` and `globalIgnores` from `eslint/config`.
- **prettier 3.9.9**. `eslint-config-prettier` is unnecessary because none of the configs above enable stylistic rules.

#### 2.8 Report Markdown rendering: marked + DOMPurify

- **marked 18.0.14** (13.5 KB gz, 0 dependencies, **ESM-only**: `main` and `module` are both `lib/marked.esm.js`).
  - `marked.parse(md, { async: false, gfm: true })` returns a string, with GFM tables **[verified]**.
  - marked **passes raw HTML and `javascript:` links through** **[verified]**.
- **dompurify 3.4.16** (11.6 KB gz; licensed `MPL-2.0 OR Apache-2.0`, so choose Apache-2.0; ships its own types, and `@types/dompurify` is a deprecated stub).
- Render with `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(md, { async: false })) }}`. This stripped `onerror` and `javascript:` in a jsdom test **[verified]**.
- Use the same renderer for copilot text and the report preview. The brief says to treat model text and imported files as untrusted, so every render goes through DOMPurify. Add a unit test with an XSS payload.
- Rejected:
  - react-markdown 10.1.0 is safe by default but pulls **83 packages** and 36 KB gz.
  - markdown-it 15.0.2 is 41 KB gz and would still need DOMPurify.

#### 2.9 Stats and math: hand-roll

- **Nelder–Mead** (about 80 lines, Lagarias et al. coefficients ρ=1, χ=2, γ=½, σ=½), **Latin Hypercube** (about 20 lines, seeded PRNG such as sfc32 or mulberry32), **Spearman** (Pearson on mid-ranks, about 25 lines), **quantiles** (R-7 linear interpolation), plus **R²/MAPE/Theil statistics**. All are small, pure TS, deterministic and property-testable, so hand-roll them.
- Existing packages:
  - `fmin` 0.0.4 is BSD-3 but its ESM entry exposes neither a default nor a `nelderMead` export on Node 22 **[verified]**. Skip.
  - `jstat` last released in 2022 and has no license field. Skip.
  - **Optional dev-only oracle:** `simple-statistics` 7.12.1 (ISC, released 2026-09-27). Its `sampleRankCorrelation` uses mid-ranks (tie-case result 1.0 **[verified]**), and its `quantile([1..10], 0.05) = 1.45`, which is R-7 **[verified]**. It is handy as an independent reference in tests and never ships.

#### 2.10 Unit algebra: hand-roll

- SD units are products and quotients of named units with integer exponents (`tasks/(person*Month)`, `USD`, `dmnl`), plus time-unit conversion factors. Represent a unit as `Map<baseUnit, exponent>` with a scale factor. Custom base units (tasks, people, USD) are just new keys. About 150 lines, including a parser for the unit strings in XMILE `<units>`.
- Candidates checked:
  - `mathjs` 15.2.0 supports `createUnit('task')` and converts `task/day → task/week` correctly **[verified]**. But it is **190 KB gz** and carries its own expression language. Skip.
  - `unitmath` 1.1.1 threw `Unexpected additional "/"` on `10 task/person/day` **[verified]**. Skip.
  - `js-quantities` (2023-08) and `convert-units` (2018) are abandoned.

---

### 3. Compatibility matrix and known conflicts

| # | Combination | Status | Evidence / action |
|---|---|---|---|
| C1 | **typescript 7.0.2 + typescript-eslint 8.71.0** | **CONFLICT** | Peer `typescript <6.1.0`, and TS 7 has no JS API. **Pin typescript 6.0.3.** Revisit at TS 7.1. |
| C2 | **Node floor** | **Conflicts with the brief's "Node ≥ 20"** | See the list below this table. **Set `engines.node` to `"^22.22.2 \|\| >=24.15.0"`, recommend Node 24 LTS, and add `.nvmrc`.** Fallback for Node 20 (not recommended): vitest 4.1.11, happy-dom or jsdom 27.4.0, concurrently 9.2.4, and tsx instead of type stripping. |
| C3 | React 19.3.0 + @xyflow/react 12.12.0 | OK | Peer `react >=17`; rendered under jsdom **[verified]**. Nested zustand 4.5.7 inside React Flow is harmless. |
| C4 | Vite 8.3.1 + @vitejs/plugin-react 6.1.1 + Vitest 5.0.2 | OK | Peers `vite ^8.0.0` and `vite ^6.4 \|\| ^7 \|\| ^8`. A single `vite@8.3.1` (rolldown 1.2.11) deduped; build and tests pass **[verified]**. |
| C5 | vitest 5.0.2 + @vitest/coverage-v8 | Must match exactly | Peer `vitest: "5.0.2"`. |
| C6 | ESLint 10.11 + @eslint/js 10.0.1 + typescript-eslint 8.71 + react-hooks 7.1.1 + react-refresh 0.5.7 | OK | All peers include `^10`; lint ran **[verified]**. |
| C7 | @testing-library/react 16.3.3 | Needs `@testing-library/dom@10` installed explicitly | Peer dependency. |
| C8 | @playwright/test ↔ browser build | 1.56.1 ↔ chromium-1194 | 1.63.0 needs 1243; download blocked here (403). **Pin 1.56.1.** |
| C9 | zod 4.6.5 + @anthropic-ai/sdk 0.129.0 | OK | SDK peer `zod ^3.25.0 \|\| ^4.0.0`. |
| C10 | jsdom 30 + React Flow | Needs stubs | `ResizeObserver` (and `DOMMatrixReadOnly`) setup file **[verified]**. |
| C11 | jsdom + uPlot / canvas | Not testable in jsdom | Test charts in Playwright. |
| C12 | html-to-image latest (1.11.13) + React Flow | Known export problems (per React Flow docs) | **Pin 1.11.11** (issue link UNVERIFIED). |
| C13 | Node type stripping + TS sources | Constraint | `erasableSyntaxOnly`, `.ts` import extensions, no enums/namespaces/parameter properties **[verified failures]**. |
| C14 | Zod JIT (`new Function`) vs a strict CSP or "no eval" audits | Note | `z.config({ jitless: true })` if needed; scope audits to our source. |
| C15 | Full proposed set (§4) | Resolves cleanly | `npm install --package-lock-only`: 322 packages, no ERESOLVE; **`npm audit`: 0 vulnerabilities** **[verified]**. |

**Detail for C2 (Node floor):**
- Node 20 reached **EOL on 2026-04-30** (nodejs/Release `schedule.json`). The latest 20.x is v20.20.2 (2026-03-24).
- Package engines:
  - Vitest 5 needs `^22.12`.
  - ESLint 10 needs `^22.13`.
  - **jsdom 30 and npm-run-all2 9 need `^22.22.2 || ^24.15.0 || >=26`.**
  - Unflagged type stripping needs ≥22.18.
- Current releases (nodejs.org/dist/index.json): v24.21.0 is the Active LTS "Krypton" (maintenance from 2026-10-20); v22.23.3 is the Maintenance LTS "Jod"; v26.10.0 is Current (becomes LTS on 2026-10-28).

**Transitive license scan** of the resolved lockfile (322 packages):
- 241 MIT, 23 ISC, 22 Apache-2.0, 8 BSD-2, 4 BSD-3, 5 BlueOak-1.0.0, 2 MIT-0, 1 CC0, 1 CC-BY-4.0 (data), and 1 `(MPL-2.0 OR Apache-2.0)` (dompurify).
- Items to note:
  - **`fast-sha256` (Unlicense, public-domain-style), a production dependency** via `@anthropic-ai/sdk → standardwebhooks`. Permissive.
  - **`lightningcss` (MPL-2.0), dev-only** via Vite 8's CSS pipeline. It is not shipped in our bundle.
  - `memorystream` is MIT (old `licenses` array format), dev-only via npm-run-all2.
- No GPL, AGPL or EPL remains once elkjs is excluded.

**Abandoned (>2 years since last release):** js-quantities, convert-units, jstat. **Near-stale (~19–23 months):** zundo, comlink, html-to-image, uplot, react-markdown. Of these, only uplot and html-to-image are recommended, and both are small and stable.

**ESM-only:** marked 18; the CLIs concurrently 10 and npm-run-all2 9 (`type: module`). This is irrelevant here because the whole repo is ESM (`"type": "module"`).

**Heavy bundles (min+gzip, esbuild 0.28.2, react external unless noted):**

| Bundle | Size (gz) | Notes |
|---|---|---|
| react + react-dom | 68.8 KB | |
| @xyflow/react | ~59 KB | 127.7 KB with React |
| CodeMirror (min set) | 90 KB | |
| **elkjs bundled** | **440 KB** | |
| **mathjs** | **190 KB** | |
| dexie | 32.6 KB | |
| react-markdown | 36.4 KB | |
| fast-xml-parser | 24.6 KB | |
| uplot | 23.0 KB | |
| zod (`* as z`) | 25–28 KB | `{ z }` import: 92 KB |
| @dagrejs/dagre | 16.8 KB | |
| marked | 13.5 KB | |
| dompurify | 11.6 KB | |
| html-to-image | 4.9 KB | |
| idb | 1.4 KB | |
| zustand | 0.7 KB | |

---

### 4. Proposed minimal dependency lists (exact versions)

**Runtime `dependencies` (15)**

| Workspace | Package | Version |
|---|---|---|
| apps/web | react | 19.3.0 |
| apps/web | react-dom | 19.3.0 |
| apps/web | @xyflow/react | 12.12.0 |
| apps/web | zustand | 5.0.15 |
| apps/web | uplot | 1.6.32 |
| apps/web | @dagrejs/dagre | 3.1.1 (in place of elkjs, pending sign-off) |
| apps/web | html-to-image | 1.11.11 |
| apps/web | idb | 8.0.3 |
| apps/web | marked | 18.0.14 |
| apps/web | dompurify | 3.4.16 |
| packages/core | zod | 4.6.5 |
| packages/core | fast-xml-parser | 5.11.2 |
| apps/server | hono | 4.13.11 |
| apps/server | @hono/node-server | 2.1.3 |
| apps/server | @anthropic-ai/sdk | 0.129.0 (see anthropic-sdk.md) |

`packages/content` has no runtime dependencies (data plus `@looplab/core` types). The web app also uses zod through `@looplab/core`.

Not included, by design:
- CodeMirror: textarea first.
- elkjs: license.
- zundo, comlink, dotenv, tsx, express, react-markdown, mathjs.
- Hand-rolled instead: undo/redo, unit algebra, Nelder–Mead, LHS, Spearman, uPlot wrapper, tornado/Pareto SVG.

**Root `devDependencies` (23)**

| Area | Package | Version |
|---|---|---|
| TypeScript | typescript | 6.0.3 |
| Types | @types/react | 19.3.0 |
| Types | @types/react-dom | 19.3.0 |
| Types | @types/node | 22.20.4 |
| Build | vite | 8.3.1 |
| Build | @vitejs/plugin-react | 6.1.1 |
| Test | vitest | 5.0.2 |
| Test | @vitest/coverage-v8 | 5.0.2 |
| Test | fast-check | 4.10.2 |
| Test | jsdom | 30.1.1 |
| Test | @testing-library/react | 16.3.3 |
| Test | @testing-library/dom | 10.4.2 |
| Test | @testing-library/user-event | 14.6.7 |
| Test | fake-indexeddb | 6.2.5 |
| E2E | @playwright/test | 1.56.1 |
| Lint | eslint | 10.11.0 |
| Lint | @eslint/js | 10.0.1 |
| Lint | typescript-eslint | 8.71.0 |
| Lint | eslint-plugin-react-hooks | 7.1.1 |
| Lint | eslint-plugin-react-refresh | 0.5.7 |
| Lint | globals | 17.12.0 |
| Format | prettier | 3.9.9 |
| Dev orchestration | npm-run-all2 | 9.0.3 |

- Optional dev-only (log in DECISIONS.md if adopted): `simple-statistics@7.12.1` (stats test oracle) and `tsx@4.23.15` (only if native type stripping is rejected).
- Root `package.json`: `"type": "module"`, `"engines": { "node": "^22.22.2 || >=24.15.0", "npm": ">=10" }`.
- Suggested scripts:
  - `dev`: `run-p -l dev:web dev:server`
  - `dev:server`: `node --watch --env-file-if-exists=.env apps/server/src/main.ts`
  - `e2e`: `playwright test`

---

### 5. Sources (all accessed 2026-09-29)

**Primary:**
- npm registry via `npm view` for every version, date, license, peer dependency and engines field in this file: https://registry.npmjs.org/
- Package tarballs (`npm pack` / scratch install) for `browsers.json` (playwright-core 1.55.0–1.63.0), `.d.ts` files (zod, uplot, zundo, @xyflow/system, vitest), and READMEs (elkjs, uplot, @vitejs/plugin-react).
- Node.js releases: https://nodejs.org/dist/index.json
- Node.js schedule: https://raw.githubusercontent.com/nodejs/Release/main/schedule.json
- Node CLI docs (`--env-file`, `--env-file-if-exists`): https://raw.githubusercontent.com/nodejs/node/main/doc/api/cli.md
- Vite 7→8 migration guide: https://raw.githubusercontent.com/vitejs/vite/main/docs/guide/migration.md
- @vitejs/plugin-react CHANGELOG: https://raw.githubusercontent.com/vitejs/vite-plugin-react/main/packages/plugin-react/CHANGELOG.md
- Vitest 5 migration guide: https://raw.githubusercontent.com/vitest-dev/vitest/main/docs/guide/migration/index.md
- Zod v4 changelog: https://raw.githubusercontent.com/colinhacks/zod/main/packages/docs/content/v4/changelog.mdx
- React Flow CHANGELOG: https://raw.githubusercontent.com/xyflow/xyflow/main/packages/react/CHANGELOG.md

**Search-engine snippets (direct page blocked or not fetched):**
- React Flow "Download image" (html-to-image locked to 1.11.11): https://reactflow.dev/examples/misc/download-image
- Node type stripping stability: https://nodejs.org/api/typescript.md
- `process.loadEnvFile` (added v20.12.0): https://beta.docs.nodejs.org/process/loadEnvFile
- ESLint v10.0.0 release: https://eslint.org/blog/2026/02/eslint-v10.0.0-released/
- ESLint v10 migration: https://eslint.org/docs/next/use/migrate-to-10.0.0
- Zustand v5 migration: https://zustand.docs.pmnd.rs/migrations/migrating-to-v5
- TypeScript 6.0 release coverage: https://visualstudiomagazine.com/articles/2026/03/23/typescript-6-0-ships-as-final-javascript-based-release-clears-path-for-go-native-7-0.aspx
- TypeScript 7.0 RC: https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/
- TypeScript 7 released (InfoQ): https://infoq.com/news/2026/08/typescript-7-released/
- Vite 8 announcement: https://vite.dev/blog/announcing-vite8
- fast-xml-parser CHANGELOG: https://cdn.jsdelivr.net/npm/fast-xml-parser@5.8.0/CHANGELOG.md
- Vitest 5 digest: https://releases.sh/collections/js-toolchain/digest/2026-08-31
- React 19.3.0 release date: https://www.gitclear.com/open_repos/facebook/react/release/v19.3.0

**Project repos:**
- https://github.com/leeoniya/uPlot
- https://github.com/kieler/elkjs
- https://github.com/dagrejs/dagre
- https://github.com/bubkoo/html-to-image
- https://github.com/honojs/hono
- https://github.com/NaturalIntelligence/fast-xml-parser

---

### 6. Local verification log (scratch dir only; deleted after)

1. **Zod 4.6.5:** schema with strictObject, discriminatedUnion and record; `safeParse` issues; `prettifyError`; `toJSONSchema` (output and input modes); `z.date()` unrepresentable. Passed as described.
2. **fast-xml-parser 5.11.2:** parsed and built an XMILE fragment; `preserveOrder` output shape; `XMLValidator`. Passed.
3. **Lint stack:** ESLint 10.11.0, typescript-eslint 8.71.0, TS 6.0.3, react-hooks 7.1.1 (flat) and react-refresh 0.5.7 (vite) lint a `.tsx`; `tsc --noEmit` is clean. TS 7.0.2 dry-run gives ERESOLVE.
4. **Build and test stack:** Vite 8.3.1 build with a module worker, the elkjs `?url` worker and dagre. Vitest 5.0.2 + jsdom 30.1.1 + RTL 16.3.3 + user-event 14.6.7 + fast-check 4.10.2 pass. React Flow under jsdom fails without a ResizeObserver stub and passes with one. idb + fake-indexeddb round-trip passes. CodeMirror autocomplete works in jsdom. marked + DOMPurify XSS strip works.
5. **Playwright:** 1.56.1 launches pre-installed Chromium 141.0.7390.37. 1.63.0 needs chromium-1243; the CDN returns 403.
6. **Hono + @hono/node-server:** bound to 127.0.0.1; CORS allow/deny; body limit.
7. **Node 22.22.2 native type stripping** across an npm-workspace symlink; `--env-file`, `--env-file-if-exists`, `process.loadEnvFile`, `util.parseEnv`. Enums and extensionless imports fail, as expected.
8. **Layout benchmarks** (dagre vs ELK) and bundle-size measurements (esbuild 0.28.2, `gzip -9`).
9. **Full proposed dependency set:** `npm install --package-lock-only` resolves 322 packages with no conflicts. `npm audit` finds 0 vulnerabilities. License scan as in §3.

**UNVERIFIED items:**
- React 19.3 feature list.
- The exact html-to-image issue behind the 1.11.11 pin.
- Whether `html-to-image` `toSvg` output opens in desktop vector editors.
- `npx playwright install chromium` for 1.56.1 on macOS arm64 (the download CDN is blocked here).
- Rolldown (vs esbuild) bundle sizes.
- `z.fromJSONSchema` behaviour.
- Vitest-in-`vite.config.ts` typing.

---

# Part Anthropic — Research: Anthropic TypeScript SDK and Claude API (as of 2026-09-29)

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

### 0. TL;DR: decisions to carry into SPEC

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

### 1. Models

#### 1.1 Current lineup

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

#### 1.2 Recommendation for `.env.example`

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

### 2. SDK and tool use

#### 2.1 Package facts

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

#### 2.2 Client construction

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

#### 2.3 `messages.create` for tool use

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

#### 2.4 Zod helpers: what exists and how stable it is

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

#### 2.5 Strict tools (structured outputs for tool inputs)

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

#### 2.6 Features that best fit the planned loop

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

### 3. Prompt caching

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

### 4. Errors, retries, timeouts, streaming

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

### 5. Mocking for tests (Vitest, no network)

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

### 6. Security notes

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

### 7. Minimal code sketch: one loop iteration

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

### 8. Unverified items and open questions

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

### Sources (accessed 2026-09-29)

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

---

# Part XMILE — XMILE 1.0: research notes for LoopLab import/export

**Phase 0 research. Planning only, no product code.** Written 2026-09-29 by a research subagent.
Anything I could not confirm from a primary source is marked **UNVERIFIED**. Section numbers (§) refer to the
OASIS Standard text I actually read (source S1 below). I did not make up any section numbers.

---

### 0. Sources, and what was actually read

| ID | Source | How accessed (2026-09-29) | Status |
|----|--------|---------------------------|--------|
| S1 | **OASIS XMILE v1.0, OASIS Standard, 14 Dec 2015.** Canonical: <https://docs.oasis-open.org/xmile/xmile/v1.0/os/xmile-v1.0-os.html> (latest: <https://docs.oasis-open.org/xmile/xmile/v1.0/xmile-v1.0.html>) | **docs.oasis-open.org, www.oasis-open.org and web.archive.org are blocked by the sandbox egress proxy (HTTP 403).** I read the HTML copy committed to the Simlin repo instead: <https://github.com/bpowers/simlin/blob/e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc/docs/reference/xmile-v1.0.html> (commit `e6f95a6`, 2026-09-19; windows-1252 Word export). The document identifies itself as "OASIS Standard, 14 December 2015". Its "This version" is `…/v1.0/os/xmile-v1.0-os.html`. | Read in full for ch. 2–4, 5.1, 6.1 and 7, plus the footnotes. I did not byte-compare this copy with the OASIS original (**UNVERIFIED fidelity**), but the text is internally consistent. |
| S2 | XMILE v1.0 Errata 01: <https://docs.oasis-open.org/xmile/xmile/v1.0/errata01/xmile-v1.0-errata01.html> | Blocked. I have only a web-search snippet, which says it corrects `report_interval` to `interval` in `xmile.xsd` and leaves the prose unchanged. | **UNVERIFIED** |
| S3 | XMILE XML schema (`…/v1.0/os/schemas/`) | Blocked. There is no copy on GitHub (code search for `filename:xmile.xsd` returned 0 hits). | **Not read.** Whether the XSD allows foreign-namespace elements or attributes is **UNVERIFIED**. |
| S4 | SDXorg test-models, local clone `vendor/sdxorg-test-models` @ `21aab02739dc5187bc9564e4d3de14e575905d2f` (2025-03-14), upstream <https://github.com/SDXorg/test-models> | I grepped and parsed all 123 `.xmile`/`.stmx` files. | Read |
| S5 | Simlin (Bobby Powers, one of the spec editors) @ `e6f95a6`, <https://github.com/bpowers/simlin>: `stdlib/{smth1,smth3,delay1,delay3,trend}.stmx`, `src/simlin-engine/src/vm.rs` (`step`/`pulse`/`ramp`, RK2/RK4 loop), `builtins_visitor.rs`, `xmile/{mod,views}.rs`, `common.rs::canonicalize`, `test/delays` (Stella 1.9.1 output), `test/step_into_smth1` (Stella output), and `test/test-models` (its fork of SDXorg) | Shallow clone into /tmp, deleted afterwards | Read |
| S6 | xmutil (Vensim-to-XMILE converter by Bob Eberlein), vendored in Simlin at `src/xmutil/third_party/xmutil/Function/Function.{h,cpp}` | Same clone as S5 | Read |
| S7 | PySD @ `8b6d3890527f799e66c5a84c5228e681a53e77a6` (2026-09-29), <https://github.com/SDXorg/pysd>: `pysd/py_backend/functions.py`, `statefuls.py`, `translators/xmile/*`, `docs/tables/{functions,delay_functions}.tab` | Shallow clone, deleted afterwards | Read |
| S8 | isee Stella help: Test input builtins (<https://www.iseesystems.com/resources/help/v2/Content/08-Reference/07-Builtins/Test_input_builtins.htm>), Delay builtins, Simulation builtins; isee blog "integration methods and dt" | **iseesystems.com is blocked.** I have web-search snippets only. | **UNVERIFIED** (secondary, snippet-level) |
| S9 | Vensim PULSE doc: <https://www.vensim.com/documentation/fn_pulse.html> | Web-search snippet only | **UNVERIFIED** (snippet) |

---

### 1. File structure

#### 1.1 Root element and namespace (§2, §2.1)
```xml
<?xml version="1.0" encoding="utf-8"?>
<xmile version="1.0" xmlns="http://docs.oasis-open.org/xmile/ns/XMILE/v1.0">
  <header>…</header> <sim_specs>…</sim_specs> <model_units>…</model_units>
  <dimensions/>? <behavior/>? <style/>? <data/>? <model>+ <macro>*
</xmile>
```
- §2: "The file MUST be encoded in UTF-8." Both `version` and `xmlns` are REQUIRED. Top-level tags may appear in any order, and the order above is RECOMMENDED.
- §2.1 defines four kinds of namespace: XML tag, Variable, Function and Unit. Variables and functions share a resolution context, so a variable cannot be named `MIN` or the name of a defined macro. Units have their own separate namespace, so a unit may be called `Min`.
- **What real files look like (S4, 123 files).** A reader has to be more lenient than the spec:
  - 89 files come from xmutil (`<vendor>Ventana Systems, xmutil</vendor>`). They use the `isee:` prefix (`<isee:prefs>`, `isee:simulation_delay`) **without declaring `xmlns:isee`**, so a namespace-strict parser rejects them (Python expat reports "unbound prefix"). `<product>` also has no `version` attribute, although §2.2 requires one.
  - 13 files use the pre-OASIS namespace `http://www.systemdynamics.org/XMILE` with `level="3"` and a legacy `<smile version="1.0"/>` header child.
  - Stella files declare `xmlns:isee="http://iseesystems.com/XMILE"` and put `isee:*` attributes and elements everywhere.
  - Two files are **not well-formed XML** (missing `</flow>`): `tests/non_negative_flows/test_non_negative_flows*.xmile`.
  - sdCloud files name the root model (`<model name="default">`). §4 says the root model SHALL be unnamed.
  - **Importer rule:** use a non-namespace-strict parser, or pre-declare unknown prefixes. Match on local names. Accept both namespace URIs. Treat a single named `<model>` as the root. List files that fail to parse as skipped, with the parse error.

#### 1.2 `<header>` (§2.2, §2.2.1)
- REQUIRED: `<vendor>` and `<product version="…" lang="…">`. The product version is REQUIRED. `lang` is ISO 639-1 and defaults to English.
- OPTIONAL: `<options>`, `<name>`, `<version>`, `<caption>`, `<image>`, `<author>`, `<affiliation>`, `<client>`, `<copyright>`, `<contact>`, `<created>`/`<modified>` (ISO 8601), `<uuid>` (RFC 4122), `<includes>`.
- `<options namespace="std, isee">` holds the conformance flags. §2.2.1: "If a file makes use of any of the following functionality, it MUST be listed": `<uses_conveyor/>`, `<uses_queue/>`, `<uses_arrays maximum_dimensions="…"/>`, `<uses_submodels/>`, `<uses_macros recursive_macros="…" option_filters="…"/>`, `<uses_event_posters/>`, `<has_model_view/>`, `<uses_outputs/>`, `<uses_inputs/>`, `<uses_annotation/>`.
  - Real files often **omit** these flags even when they use the features (for example, arrays without `uses_arrays`). **Do not rely on them for rejection.** Detect features structurally.
  - The spec is inconsistent with itself here: §2.2.1's sample has `<uses_conveyors leak="true"/>` (plural), and §7.2.4 says `<uses_array>`. **Accept singular and plural forms.**

#### 1.3 `<sim_specs>` (§2.3, §3.4, §3.4.1)
```xml
<sim_specs method="euler" time_units="months">   <!-- attrs optional -->
  <start>0</start> <stop>100</stop>                <!-- REQUIRED; stop > start -->
  <dt reciprocal="true">4</dt>                     <!-- optional, default 1; reciprocal => DT = 1/4 -->
</sim_specs>
```
- §2.3: "Every XMILE file MUST contain at least one set of simulation specifications", either at top level or as a child of the root model. Models may override it.
- `<dt>` defaults to 1. `reciprocal="true"` (only for DT ≤ 1) means the value is 1/DT.
- `method` (default `euler`), `time_units` (default empty), `pause`, and `<run by="all|group|module">`.
- §3.4: "Units of time MUST be specified." Real files use `Time`, `time`, `Months` and `months`. Treat the value as a unit name.
- §3.4.1 method names: `euler` (default), `rk4`, `rk2` ("OPTIONAL – falls back to RK4"), `rk45` (OPTIONAL) and `gear` (OPTIONAL). A comma-separated fallback list such as `"gear, rk4"` is allowed. Stella and Vensim write `Euler` and `RK4`, so **parse case-insensitively and use the first method you support**.
- There is no save-interval in the spec. Stella and Simlin use the vendor attribute `isee:save_interval` (Simlin writes it; I have not confirmed that Stella does, **UNVERIFIED**). Vensim's SAVEPER, TIME STEP, INITIAL TIME and FINAL TIME show up in xmutil output as **ordinary aux constants that are not wired to `<sim_specs>`**. `<sim_specs>` is the authority.

#### 1.4 `<model_units>` (§2.4, §3.3.6)
```xml
<model_units>
  <unit name="People"><eqn/><alias>person</alias><alias>persons</alias></unit>   <!-- Stella writes <eqn/> for primary units -->
  <unit name="models_per_year"><eqn>models/year</eqn><alias>mpy</alias></unit>
  <unit name="Joules" disabled="true"><alias>J</alias></unit>
</model_units>
```
- Each unit has a name, an optional equation and zero or more aliases. `disabled="true"` removes the unit from substitution. Circular definitions and repeated aliases are forbidden.
- See section 6 for the unit expression syntax.

#### 1.5 `<behavior>` (§2.6)
- "Support for behaviors is REQUIRED". Behaviors cascade: entity, then model `<behavior>`, then file `<behavior>`, then XMILE default.
- The example is `<behavior><non_negative/></behavior>` (all stocks and flows), or `<behavior><flow><non_negative/></flow></behavior>` (flows only). An entity can switch it off locally with `<non_negative>false</non_negative>` (§4.2, §4.3).
- SDXorg `non_negative_*` tests use exactly these forms, including `<non_negative> false  </non_negative>` and `FALSE  `. **Trim the text and compare case-insensitively.**

#### 1.6 `<data>` (§2.8): *not* a general extension area
`<data>` holds persistent CSV, Excel or XML **import/export connections**: `<import>`/`<export>` with `type`, `enabled`, `frequency`, `orientation`, `resource`, `worksheet`, `interval`, and `<all/>` or `<table uid=…/>`. **Do not put LoopLab metadata in `<data>`.** See section 1.13.

#### 1.7 `<model>` and `<variables>` (§4 intro, §4.1)
- Child order is mandatory: "sub-tags MUST appear in this order": `<sim_specs>`?, `<behavior>`?, `<variables>` (REQUIRED), `<views>`?.
- The root model is unnamed and every other model MUST be named. More than one model means submodels (footnote 15: `<uses_submodels>` MUST be set).
- The `<model>` attributes `resource=` (external file) and `encryption-scheme`/`iv`/`hmac` (AES-128-CBC encrypted model) are both **rejected by LoopLab**.
- Common variable properties (§4.1):
  - `name` is REQUIRED and unique within the model.
  - `<eqn>` is the equation, which for a stock is the **initial value**.
  - `<units>`, `<doc>` (plain text with XMILE escapes `\n` `\t` `\\`, or HTML "with the proper HTML header"), `<mathml>`, `<range min max>`, `<scale min max>`, `<format>`, `<event_poster>`, `access=`, `autoexport=`, `<dimensions>`, `<element subscript=…>`.

#### 1.8 Variable elements
**Stock** (§3.1.1, §4.2)
```xml
<stock name="Backlog">
  <eqn>100</eqn>                      <!-- initial value; evaluated once at start -->
  <inflow>new_work</inflow>           <!-- one tag per flow; ORDER = priority -->
  <outflow>completion</outflow>
  <non_negative/>                     <!-- optional; or <conveyor>…</conveyor> or <queue/> (mutually exclusive) -->
  <units>tasks</units>
</stock>
```
- §4.2: "If the equation is not constant, the initial values of the included variables will be used to calculate the stock's initial value."
- Flow order is the priority order. Outflow priority "is only important for non-negative stocks …, queues, and conveyors with multiple leakages."
- Footnote 17: the inflow/outflow classification is based on the direction when the rate is positive. "Negative inflows flow outward while negative outflows flow inward."

**Flow** (§3.1.2, §4.3)
```xml
<flow name="completion"><eqn>Backlog/completion_time</eqn><non_negative/><units>tasks/month</units></flow>
```
- Optional `<multiplier>` is a unit-conversion multiplier applied on the downstream side. **LoopLab rejects it**, because it breaks the simple stock equation.
- Other options: `<non_negative/>` (uniflow), `<overflow/>` (queue only) and `<leak>` (conveyor only).

**Aux** (§3.1.3, §4.4)
```xml
<aux name="completion_time" flow_concept="false"><eqn>4</eqn><units>months</units></aux>
```

**Graphical function** (§3.1.4, §4.1.3)
```xml
<aux name="effect_of_pressure">
  <eqn>schedule_pressure</eqn>                    <!-- the INPUT (x) to the gf -->
  <gf type="continuous">                          <!-- continuous (default) | extrapolate | discrete -->
    <xscale min="0" max="2"/>                     <!-- EXACTLY ONE of xscale / xpts -->
    <yscale min="0" max="1.5"/>                   <!-- display only; no effect on behaviour -->
    <ypts>0.5,0.8,1,1.2,1.3</ypts>                <!-- sep="…" attribute changes the separator -->
  </gf>
</aux>
```
- `xscale` with N `ypts` means N points evenly spaced from min to max. `<xpts>` must be ascending and the same length as `ypts`.
- Supplying both `xscale` and `xpts` is **invalid**, even when they agree (§4.1.3, the "overspecified" example). Real files still do it: `samples/bpowers-hares_and_lynxes_modules/model.xmile` has two gfs with both. **The importer should accept that and prefer `xpts` when both appear.**
- Type semantics (§3.1.4):
  - `continuous`: linear interpolation, and out-of-range x takes the nearest endpoint's y (no extrapolation).
  - `extrapolate`: linear interpolation, and out-of-range x is extrapolated linearly from the last two points at each end.
  - `discrete`: a step function that uses "the value associated with the next lower x-coordinate". "The last two points of a discrete graphical function must have the same y value". Out-of-range x clamps.
- A named standalone `<gf name="f">…</gf>` in `<variables>` is called as `f(x)` in expressions (§3.3.2). A variable can also refer to one with `<gf name="f"/>`.
- Only flows and auxes can be gfs (§4.1.3).

**Group** (§4.6): `<group name="…"><doc/><entity name="…"/>…</group>`. Groups have no computational effect unless groups are run independently. LoopLab could map them to "sectors" or drop them. Low priority.

#### 1.9 Documentation and units on variables
`<doc>` is free text or HTML (§3.3.5, §4.1). Treat it as **untrusted**: never render it as live HTML without sanitising. `<units>` holds a unit expression (see section 6). Neither affects simulation.

#### 1.10 Identifiers (§3.2.2)
- **Form** (§3.2.2.1): letters, digits, `_`, `$` and Unicode characters above 127. An identifier must not start with a digit or `$` (units are an exception) and must not start or end with `_`. Anything else must be in double quotes. Inside quotes the only escapes are `\"`, `\n` and `\\`; any other backslash sequence makes the identifier invalid.
- **Equivalence** (§3.2.2.2): identifiers are **case-insensitive** (Unicode Collation Algorithm). Space, NBSP (U+00A0), newline and underscore are all whitespace and are equivalent to each other, and a run of whitespace counts as one character. So `wom_multiplier` = `"wom multiplier"` = `wom______multiplier`. En-space, em-space and full-width characters are NOT equivalent.
- **Qualified names** (§3.2.2.3): a `.` separates a namespace or module from a name, as in `std.MIN`, `isee.HISTORY` or `marketing.expenditures`. The top-level model is written `.cost` (§3.7.4).
- **Reserved** (§3.2.2.5): `AND`, `OR`, `NOT`, `IF`, `THEN`, `ELSE`, every built-in function name, and `std`.
- Real files: the `name` attribute holds the display form (`"teacup temperature"`, `"Stock with \n Newline Character"`), while equations and `<inflow>` refer to the underscore form (`teacup_temperature`) or a quoted form (`"Aux_with_$peC!@|_characters"`). Views refer to names with underscores.

#### 1.11 Expression grammar (§3.2.1, §3.3)
- **Numbers**: `[digit]+[.[digit]*] | [digit]*.[digit]+` with an optional `E|e[+|-]digits`. There is no leading sign; a leading minus is the unary operator. `14.`, `.375` and `6E5` are all valid.
- **Precedence**, highest first (§3.3.1): `[ ]`, `( )`, then `^` (**right-assoc**), then unary `+ - NOT`, then `* / MOD`, then `+ -`, then `< <= > >=`, then `= <>`, then `AND`, then `OR`. The consequence is that **`-2^2 = -4`**, because `^` binds tighter than unary minus. The printer must parenthesise to match.
- Logical, relational and equality operators return 0 or 1. **MOD is the floored modulus** (the result takes the sign of the divisor). Footnote 7: "INT function … must return the floor", and `a = INT(a/b)*b + a MOD b`.
- Parameterless builtins are written without parentheses: `TIME`, `DT`, `PI`, `INF` (§3.3.2).
- **IF** (§3.3.3): the statement form `IF cond THEN expr ELSE expr` MUST be supported. Non-zero means true. The function form `if_then_else(c,a,b)` is an OPTIONAL vendor alternative that "should be implemented … using an XMILE macro". xmutil turns Vensim `IF THEN ELSE(c,a,b)` into `( IF c THEN a ELSE b )`.
- **Comments** (§3.3.4): `{ … }` may appear anywhere inside an expression and MUST be supported.
- Real files contain tabs and newlines inside `<eqn>` (xmutil adds trailing tabs), `&gt;`/`&lt;` entities, and lowercase builtins (`step(1, 1)`, `pulse(...)`). Builtin names are identifiers, so they are case-insensitive (see the SDXorg `function_capitalization` test).

#### 1.12 Views (§5, §6.1): what a minimal exporter must write
**Spec rules**
- `<views>` contains one or more `<view>`s. `type` is `stock_flow` (default when missing), `interface`, `popup` or vendor-specific.
- §5.1 says views are REQUIRED to have `width`/`height`, the paging attributes (`page_width`, `page_height`, `page_sequence`, `page_orientation`, `show_pages`), `home_page` and `home_view`. §7.2.8 repeats this for Model-View conformance.
- Coordinates are pixels with (0,0) at top left and y increasing downward (§5.1.2).
- **Position rule** (§5.1.2): "x and y attributes refers to the center of the object when using a `<shape>` tag. When using an arbitrary size, the x and y attributes refer to the top left corner." Simlin's reader follows this: when `width`/`height` are present it adds half the size to get the centre (S5 `xmile/views.rs`).
- Each model variable should have one display tag per view (§5.1.1), linked by `name`. A second appearance in another view is an alias.
- **Stock** `<stock name x y/>` (§6.1.1). **Aux** `<aux name x y/>` (§6.1.3).
- **Flow** `<flow name x y><pts><pt x y/>…</pts></flow>` (§6.1.2). `x,y` is the valve. `pts` is REQUIRED, and the points "MUST form right angles". The first point sits at the source (stock edge or cloud) and the last at the sink.
- **Connector** (§6.1.6) has `uid`, `angle` (REQUIRED; "angle in degrees of the takeoff point from the center of the start object. 0 is 3 o'clock and angles increase counter-clockwise"), `<from>` (a name or `<alias uid/>`), `<to>` (a name) and `<pts>` (for more than two points). It also has two **native CLD attributes**:
  - `polarity="+ | - | none"` (default none)
  - `delay_mark="true|false"` (default false)
- **Alias** (§6.1.7): `<alias uid x y><of>name</of></alias>`. Connectors may leave an alias but must not point to one.
- Shapes: stocks are rectangles, auxes circles, modules rounded rectangles. "A stock MUST NOT be represented using a circle", and an aux or flow must not be a rectangle unless its equation contains a stock-bearing function (§5.1.2).

**What Stella actually writes** (S4 `samples/teacup/teacup.stmx`, Stella Architect 1.4):
- Elements carry only `x,y` (the centre) and `name`. Sizes come from a `<style>` block (`<stock><shape type="rectangle" width="45" height="35"/></stock>`, `<aux><shape type="circle" radius="18"/></aux>`).
- A two-point connector is just `<connector uid="1" angle="139.399"><from>…</from><to>…</to></connector>`, with no `x,y` and no `pts`.
- The `<view>` has no `width`/`height`, but it does have `page_width`/`page_height`.
- So Stella's own files break several §5/§7.2.8 MUSTs. That is strong evidence that a lenient, Stella-like minimum is accepted in practice.
- Stella Enterprise 4.0 files (Simlin `test/ai-information/*.stmx`, signed timestamp from mid-2025) also write `polarity="+"`, `isee:polarity_placement` and `<isee:documentation>` (a per-link rationale) on connectors. This closely matches LoopLab's CLD link model.

**Proposed LoopLab export (minimal, spec-leaning):**
```xml
<views>
  <view type="stock_flow" width="1200" height="800" page_width="800" page_height="600"
        page_sequence="row" page_orientation="landscape" show_pages="false" home_page="0" home_view="true">
    <stock name="Backlog" x="300" y="200"/>                           <!-- centre; default size 45x35 -->
    <flow name="completion" x="400" y="200">
      <pts><pt x="322.5" y="200"/><pt x="500" y="200"/></pts>         <!-- orthogonal; ends at stock edge / cloud -->
    </flow>
    <aux name="completion_time" x="400" y="120"/>
    <connector uid="1" angle="270" polarity="+" delay_mark="false">
      <from>completion_time</from><to>completion</to>
    </connector>
  </view>
</views>
```
- Also set `<options><has_model_view/></options>` when views are written.
- **Angle conversion**: XMILE angles are counter-clockwise in a y-down space. For a straight link, `angle = atan2(-(y2-y1), x2-x1)` in degrees, normalised to [0,360). Simlin converts with `canvas = (360 − xmile) mod 360`.
- If the export has no view, simulation still works: §5 says every model is RECOMMENDED to be simulatable without views.
- **UNVERIFIED**: whether Stella or Vensim open a LoopLab-generated minimal view without errors. No Stella or Vensim was available. Simlin, which is open source, reads exactly this subset. A dev-only check with Simlin would be possible but would need approval as a dev tool.

#### 1.13 Extensions and vendor namespaces
**What the spec says**
- §2.1: "XML tag namespaces are global. Unadorned tags are described in detail in the various sections of this document and provision for vendor specific additions are also detailed."
- The only concrete provisions are:
  - Function and identifier namespaces: the registered vendor names are `anylogic`, `forio`, `insightmaker`, `isee`, `powersim`, `simanticssd`, `simile`, `sysdea` and `vensim`, plus `user`. `std` is the default (§3.2.2.3).
  - Vendor functions are defined through macros (§3.6).
  - Vendor-specific view types and line styles (§5.1, §6.1.6).
  - Footnote 3: XML-level identifiers "follow the conventions of XML … a colon instead of period for separators".
- The spec has **no explicit clause saying readers MUST ignore unknown foreign-namespace elements or attributes**, and I could not read the XSD (**UNVERIFIED**).

**What practice shows**
- Stella uses `xmlns:isee="http://iseesystems.com/XMILE"` for both attributes (`isee:simulation_delay`, `isee:build_number`) and elements (`<isee:prefs>`, `<isee:dependencies>`, `<isee:documentation>`).
- Simlin uses `xmlns:simlin="https://simlin.com/XMILE/v1.0"` (for example `<simlin:mapping>`).
- PySD and Simlin both ignore unknown elements.
- Stella also writes an **unprefixed, non-standard** top-level `<ai_information>` block with signed provenance (Simlin models it). Readers must tolerate unknown elements.

**Proposal for LoopLab**
- Declare one namespace, `xmlns:looplab="urn:looplab:xmile:1"`. A URN avoids implying ownership of a domain; the exact value is a SPEC decision.
- Store LoopLab-only data in that namespace:
  - Per element: `looplab:id="…"` (a stable element ID, since XMILE names are not stable IDs and view `uid`s "are NOT REQUIRED to be stable", §5.1.3), `looplab:provenance="ai-proposed|confirmed|human"` and `looplab:confidence="…"` on `<stock|flow|aux|connector>`.
  - Use the **native** `polarity` and `delay_mark` on `<connector>`.
  - Whole-model: one `<looplab:model>` element as the last child of `<xmile>`, holding a versioned JSON payload in CDATA. It carries everything that has no XMILE home: Frame stage (problem, horizon, KPIs, reference modes, boundary chart), CLD-only variables and links (which XMILE cannot represent without inventing equations), loop names, scenarios, assertions, interventions, the save step, time-unit conversion factors, and the schema version.
- On import, the `looplab:` payload wins only if it validates (Zod) **and** its hash of the SFD part matches the SFD actually imported. Otherwise, warn and rebuild from the standard XMILE.
- **Security**: treat all of it as untrusted input, per the brief.

---

### 2. Built-in functions: exact semantics

#### 2.1 What the spec requires (§3.5)
§3.5: "This section strives to define the minimum set of built-in functions that MUST be supported". §7.3.1 item 4: a base-level simulator "MUST support the full range of built-in functions (Section 3.5 and all subsections)".

| Group (§) | Functions (spec signature) |
|---|---|
| Math (§3.5.1) | `ABS(x)`, `ARCCOS`, `ARCSIN`, `ARCTAN`, `COS`, `EXP`, `INF`, `INT(x)` (floor), `LN` (domain (0,∞)), `LOG10`, `MAX(x,y)`, `MIN(x,y)`, `PI`, `SIN`, `SQRT` (domain [0,∞)), `TAN` |
| Statistical (§3.5.2) | `EXPRND(mean[,seed])`, `LOGNORMAL(mean,sd[,seed])`, `NORMAL(mean,sd[,seed])`, `POISSON(mean[,seed])` (the spec says "2 or 3" parameters, an internal inconsistency), `RANDOM(min,max[,seed])`, with 0 ≤ seed < 2³² |
| Delay (§3.5.3) | `DELAY(input, delay_time[, initial])`, `DELAY1(...)`, `DELAY3(...)`, `DELAYN(input, delay_time, n[, initial])`, `FORCST(input, avg_time, horizon[, initial_trend])`, `SMTH1(input, avg_time[, initial])`, `SMTH3(...)`, `SMTHN(input, avg_time, n[, initial])`, `TREND(input, avg_time[, initial])` |
| Test input (§3.5.4) | `PULSE(magnitude, first_time[, interval])`, `RAMP(slope, start_time)`, `STEP(height, start_time)` |
| Time (§3.5.5) | `DT`, `STARTTIME`, `STOPTIME`, `TIME` |
| Misc (§3.5.6) | `INIT(x)`, `PREVIOUS(x, initial)`, `SELF` (only inside PREVIOUS or SIZE) |

In array mode, `MIN`/`MAX` with one argument, plus `MEAN`, `RANK`, `SIZE`, `STDDEV` and `SUM`, are array functions (§3.7.1.3). LoopLab rejects these.

**The spec does NOT give formal stock-flow definitions for any builtin.** It gives one-line prose only, quoted below. The one stock-flow formulation in the text is the macro example in §3.6.1 (`SMOOTH1`, quoted in section 2.3). The "formal definitions" below are therefore the **de-facto** ones, and each is labelled with its evidence. Where I checked against Stella output, that is stated.

#### 2.2 Test inputs

**STEP(height, start_time)**
- Spec §3.5.4: "Generate a step increase (or decrease) at the given time … `STEP(6, 3)` steps from 0 to 6 at time 3 (and stays there)."
- Definition: `STEP = height if TIME ≥ start_time else 0`.
- The spec does not say what happens off the DT grid. Simlin (`vm.rs::step`) and PySD (`functions.step`) both use `TIME + DT/2 > start_time`, which rounds to the nearest grid point and absorbs float drift.
- Stella output at DT = 1/6 steps exactly at t = 1 (S5 `test/step_into_smth1`). That is consistent with the rule above, but Stella's exact rule is **UNVERIFIED**.
- **LoopLab: adopt `TIME + DT/2 > start_time`.**

**PULSE(magnitude, first_time[, interval])**
- Spec §3.5.4, verbatim: "Generate a one-DT wide pulse at the given time. Parameters: 2 or 3: (magnitude, first time[, interval]). Without interval or when interval = 0, the PULSE is generated only once. Example: PULSE(20, 12, 5) generates a pulse value of 20/DT at time 12, 17, 22, etc."
- The first argument is therefore a **volume**. The function's value is `magnitude/DT` during one DT, so a stock fed by it under Euler increases by exactly `magnitude`.
- Definition, taken from Simlin `vm.rs::pulse`: value `magnitude/DT` if `TIME ∈ [first + k·interval, first + k·interval + DT)` for some integer k ≥ 0 (k = 0 only when interval ≤ 0), and 0 otherwise.
- Off-grid `first` fires at the next grid point. PySD instead uses the window `[first, first + DT/2)`, which can **miss** an off-grid pulse entirely. Implementations disagree off-grid, so the Model Health check should warn when `first` or `interval` is not a multiple of DT.
- Recommendations:
  - Compute `TIME` as `start + n·DT`. Do not accumulate `t += DT`, which drifts (0.1 added ten times is 0.9999999999999999 < 1, and the pulse slips a step).
  - Compare with a tolerance of about 1e-9·DT.
- **Vensim differs.** Vensim `PULSE(start, width)` returns **1.0** for `width` time units, with width clamped to at least DT (S9 snippet; xmutil `FunctionPulse::Eval`). xmutil therefore does **not** map it to XMILE PULSE. It emits `( IF TIME >= (start) AND TIME < ((start) + MAX(DT,width)) THEN 1 ELSE 0 )`. Vensim `PULSE TRAIN` becomes an IF/MOD expression.
- The brief's PULSE is the XMILE (volume) form. If LoopLab also wants a Vensim-style pulse, it needs a different name.
- **Stella differs from the spec, per a snippet (UNVERIFIED).** The isee help (S8), as summarised by a web search, says that if first pulse is omitted the first pulse happens "at the outset", and if interval is omitted pulses repeat "each DT". This conflicts with the spec's "only once". **Export mitigation:** always write the explicit 3-argument form (`PULSE(v, t, 0)`) for a single pulse. The spec defines interval = 0 as one pulse.
- SDXorg has **no** XMILE PULSE test upstream. Simlin's fork adds `test/test-models/tests/input_functions/test_inputs.xmile` using `pulse(DT, 3, 2)` and expects the value 1 at t = 3, 5, 7, …, which is XMILE semantics.

**RAMP(slope, start_time[, end_time])**
- Spec §3.5.4: two parameters, "begin in-/de-creasing at start time". The example `RAMP(2, 5)` gives slope 2 from time 5.
- Definition: `0` if `TIME ≤ start`, else `slope·(TIME − start)`.
- The optional **3rd argument** `end_time` is **not in the spec**. It is a Stella/Vensim extension that xmutil emits (`RAMP(1, 14, 17)`). Simlin and PySD implement it as `slope·(min(TIME, end) − start)`, holding the value after `end`. **LoopLab: accept 2 or 3 arguments.** Note in the docs that 3 arguments is an extension.

#### 2.3 Smooths (the brief's "SMOOTH" is XMILE `SMTH1`)
XMILE has **no `SMOOTH` function**. xmutil maps Vensim `SMOOTH`/`SMOOTHI` to `SMTH1` and `SMOOTH3`/`SMOOTH3I` to `SMTH3` (S6 `Function.h`). **LoopLab: accept `SMOOTH` as an alias on input, and always export `SMTH1`.**

- **SMTH1(input, τ[, init])**, spec §3.5.3: "first-order exponential smooth … If initial value is not provided, the initial value of input will be used." Stock-flow equivalent:
  - `S(t0) = init ?? input(t0)`
  - `dS/dt = (input − S)/τ`
  - `SMTH1 = S`
  - This is the §3.6.1 macro example verbatim: `stock Smooth_of_Input, inflow change_in_smooth, initial eqn: input; flow eqn: (input – Smooth_of_Input)/averaging_time`. It is identical to Simlin `stdlib/smth1.stmx`.
  - **Checked against Stella output** (S5 `test/step_into_smth1`, DT = 1/6, `SMTH1(initial+input, 1, initial)`): 0.5 → 0.516667 → 0.530556 matches Euler on this equation exactly.
- **SMTH3(input, τ[, init])**: three cascaded first-order stages, each with time constant **τ/3**.
  - `S1' = (input − S1)/(τ/3)`, `S2' = (S1 − S2)/(τ/3)`, `S3' = (S2 − S3)/(τ/3)`
  - All three stages start at `init ?? input(t0)`, and the output is `S3`.
  - **Checked against Stella**: S5 `test/delays` (Stella 1.9.1 Online, Euler, DT = 1/4). `SMTH3(Input, 5)` equals an explicit 3-stock chain, with a maximum absolute difference of **0.0** over 49 rows.
- **SMTHN(input, τ, n[, init])**: n stages, each τ/n. Note the argument order: **n before init**. Vensim `SMOOTH N(input, τ, init, n)` puts them the other way round, and xmutil swaps them (`FunctionSmoothN::OutputComputable`).

#### 2.4 Delays
- **DELAY1(input, τ[, init])**, spec: "first-order material delay … If initial value is not provided, the initial value of input will be used." Stock-flow equivalent (Simlin `stdlib/delay1.stmx`):
  - `S(t0) = (init ?? input(t0))·τ`
  - `dS/dt = input − S/τ`
  - `DELAY1 = S/τ` (the outflow)
  - The initial value is the initial **output** (outflow) value, not the stock value.
- **DELAY3(input, τ[, init])**: three stages, each holding τ/3.
  - `S_i(t0) = (init ?? input(t0))·τ/3`
  - `f1 = S1/(τ/3)`, `f2 = S2/(τ/3)`, `out = S3/(τ/3)`
  - `S1' = input − f1`, `S2' = f1 − f2`, `S3' = f2 − out`
  - `DELAY3 = out`
  - **Checked against Stella**: S5 `test/delays`. The builtin equals the explicit chain (`delay 1..3` stocks initialised to `Input*(Delay_Time/3)`), with a maximum absolute difference of **0.0**.
- **DELAYN(input, τ, n[, init])**: n stages of τ/n. As with SMTHN, n comes before init. Vensim `DELAY N(input, τ, init, n)` has a different order.
- **DELAY1 vs SMTH1**: they behave the same when τ is constant. When τ changes, DELAY1 conserves material (its output `S/τ` jumps) while SMTH1 does not. That is from an isee help snippet (S8, **UNVERIFIED**) and is also clear from the equations above.
- **DELAY(input, τ[, init])**, spec: "infinite-order material delay of the input for the requested fixed time".
  - Definition: `DELAY(t) = input(t − τ)` if `t − τ ≥ STARTTIME`, else `init ?? input(STARTTIME)`. This matches the SDXorg `delay_xmile` reference output, which PySD generated, not Stella: `DELAY(Flow_2, 5)` is 2.0 for t = 1..6 and then `Flow_2(t−5)`.
  - xmutil maps Vensim `DELAY FIXED` to `DELAY`.
  - PySD evaluates τ **once at initialisation** and rounds τ/DT to an integer buffer length.
  - Simlin **approximates DELAY as DELAY1** and calls this "known-incorrect" (`builtins_visitor.rs`).
  - Stella's handling of a time-varying τ is **UNVERIFIED**.
  - DELAY is not in the brief's builtin list. Recommendation: support it with a constant τ, evaluated at t0, and require τ/DT to be an integer (Model Health error otherwise), matching PySD and Vensim DELAY FIXED. Otherwise reject it with a clear error.
- **TREND and FORCST** (not in the brief).
  - TREND per Simlin `stdlib/trend.stmx`:
    - `avg(t0) = init_given ? input/(1 + τ·init) : input`
    - `avg' = (input − avg)/τ`
    - `TREND = (input − avg)/(avg·τ)`
    - Checked against Stella in S5 `test/delays` (maximum difference 0.0).
  - FORCST's formula is **UNVERIFIED**. A plausible form is `input·(1 + TREND·horizon)`, but I could not confirm it.
- **Where an initial value is omitted**, the spec wording "the initial value of input will be used" means `input` evaluated at **STARTTIME**, during the initialisation pass. If the input depends (initially) on the delay's own output, you get an **initialisation cycle** even though the dynamic graph has no algebraic loop. Report it as a Model Health error that names the cycle.

#### 2.5 Other builtins in the brief's list
- **MIN(x, y) / MAX(x, y)**: exactly 2 arguments in the scalar subset. The 1-argument form (array) is rejected.
- **IF c THEN a ELSE b**: see section 1.11. Stateful builtins inside a branch (for example `IF x THEN SMTH1(a,5) ELSE 0`) must be **hoisted into implicit stocks that update every DT, whichever branch is taken**, because XMILE treats them as stocks (§3.6.1, §5.1.2). Simlin does this with stdlib modules.
- **TIME, DT, STARTTIME, STOPTIME** (§3.5.5) are constants except TIME. Under RK, TIME returns intermediate stage times (see section 3.3).
- **INIT(x)** (§3.5.6): "initial value (i.e., value at STARTTIME) of a variable". It is frozen after the initialisation pass.
- **PREVIOUS(x, init)** (§3.5.6): returns "the value of price in the last DT, or zero in the first DT". It breaks dependency cycles.
- **Math**: ABS, EXP, LN, SQRT, LOG10, INT (floor) and MOD (floored). The spec does not say what happens outside a function's domain or on division by zero. **UNVERIFIED** vendor behaviour (IEEE NaN/Inf vs 0). LoopLab: use IEEE results and have Model Health flag NaN/Inf.

---

### 3. Integration, initialisation and evaluation order

#### 3.1 What the spec says
- §3 intro: all variables are floating point, and IEEE-754 double is RECOMMENDED.
- §3.1.1: "stock_t = stock_{t−dt} + dt×(inflows_{t−dt} – outflows_{t−dt}) … The above computation is notional, though it is used in one of the specified integration techniques (Euler)."
- §3.1.1 on initialisation: the initial value is "either a constant or with an initial equation. The initial equation is evaluated only once, at the beginning of the simulation." §4.2: non-constant initial equations use the *initial values* of the variables they reference.
- §3.4.1 names the methods only. It does not give RK4 formulas, nor stage times, nor any rule for discontinuities.
- §7.3.1: a simulator "MUST support Euler's method and Runge-Kutta 4".
- **The spec is silent on:** evaluation order, how algebraic loops are handled, how many steps to take when (stop−start)/DT is not an integer, how flows are reported at STOPTIME, and division by zero.

#### 3.2 Recommended engine rules (the de-facto convention, as implemented in Simlin and PySD)
1. **Initialisation pass at t0.** Evaluate stock initial equations and every aux or flow they need, in dependency order over the *initial* graph. Builtin internal stocks initialise from their inputs at t0 (see section 2). Record the values used by INIT().
2. **Each step at t_n = start + n·DT.**
   - Evaluate auxes and flows in topological order. Stocks, builtin internal stocks and PREVIOUS values are known inputs.
   - A cycle among auxes and flows that passes through no stock, delay/smooth builtin or PREVIOUS is an **algebraic loop**, which is an error.
   - Record the row for t_n (stocks and flows at t_n, so flows are reported "instantaneous", as in the Stella table default `report_flows="instantaneous"`, §6.4.4).
   - Then integrate.
3. **Euler**: `S_{n+1} = S_n + DT·(Σin − Σout)(t_n)`.
4. **RK4**: the classical four stages over the full state vector (user stocks plus builtin internal stocks). Aux and flow values are re-evaluated at each stage, with `TIME = t_n, t_n+DT/2, t_n+DT/2, t_n+DT`. Then `S_{n+1} = S_n + (k1 + 2k2 + 2k3 + k4)/6`. The recorded aux and flow values are those at `(t_n, S_n)` (Simlin re-evaluates after the stages).
5. **RK2** (optional): the spec says it "falls back to RK4". Simlin implements Heun's method. **LoopLab: offer Euler and RK4 only.** On import, map `rk2` to `rk4` as the spec instructs, and `rk45`/`gear` through their fallback list, defaulting to rk4, with a warning.
6. **Save times**: rows at every DT, or every save step if LoopLab adds one. Include STOPTIME. Require `(stop − start)/DT` to be an integer within 1e-9 **(LoopLab rule; the spec is silent)**.

#### 3.3 RK4 and discontinuities (a gotcha)
- The isee help (S8 snippet, **UNVERIFIED**): "the TIME function will not return values equal to simulation time when you use the 2nd- or 4th-order Runge-Kutta … be sure to use Euler's method" when constructs rely on TIME being exact.
- **My analysis**, following Simlin's stage times:
  - **PULSE(V, t0) with t0 on the grid.**
    - In the step from t0−DT, stage 4 is evaluated at t0 and sees V/DT, adding V/6 one step early.
    - In the step from t0, stages 1–3 (t0, t0+DT/2, t0+DT/2) see V/DT and stage 4 (t0+DT) sees 0, adding 5V/6.
    - The total is conserved, but it is split across two steps.
  - **STEP**: stock trajectories start responding about one step early (stage 4).
  - Near any discontinuity (STEP, PULSE, IF on TIME, `discrete` gfs, MIN/MAX kinks) RK4 falls to roughly first-order local accuracy.
- **Consequences for LoopLab:**
  - The brief's convergence-order acceptance tests (4 ± 0.3) must use smooth models only.
  - Model Health should warn when RK4 is combined with STEP, PULSE, RAMP, time-based IF or discrete gfs.
  - SDXorg has no RK4 model with discontinuous inputs. Its five `method="RK4"` XMILE files (`rounding`, `min_max_1arg`, `subscripted_trig`, `arithmetics_exp`, `zeroled_decimals`) are Vensim-exported algebra tests.

#### 3.4 `non_negative` (§3.6.2, §4.2, §4.3, §4.8.4)
- The spec says it "is not directly supported by XMILE. The option exists partly for documentation, partly to allow a vendor to invoke a macro." It then gives option-filter macros as the reference semantics:
  - **Uniflow** (flow filter): `IF option THEN MAX(flow, 0) ELSE flow`. The flow's own (reported) value is clamped.
  - **Non-negative stock** (applied to outflows, in priority order): §4.8.4 prints `IF value THEN MAX(stock/DT – outflow_sum, flow) ELSE flow`. **As printed, this appears to be an erratum.** `MAX` would never *limit* the outflow, and the intent in §3.6.2 ("non-negative stocks implement the non-negative logic in the stock's outflows … the sum of the values of every higher-priority flow") suggests `MIN(flow, stock/DT − outflow_sum)` (floored at 0). This is my reading, **UNVERIFIED**. The printed macro also ignores the same-step inflows.
- **Stella files often carry it**: `<non_negative/>` appears on stocks and flows in Stella files (the teacup model has both), while others lack it (`samples/SIR/SIR.stmx` has none). Stella's default for new elements is **UNVERIFIED**. **Importing Stella models without honouring non_negative will change results.**
- **SDXorg references differ from the spec's intent.** The `non_negative_*` reference outputs come from **PySD** (author Eneko Martin, not Stella). PySD clamps the **stock state** after integration (`NonNegativeInteg.update: state = max(state, 0)`) and leaves the outflow's value unchanged. For example, `OutFlow` stays 1 while `TestStock1` sits at 0, so material is not conserved.
  - In `test_non_negative_stocks.xmile` one flow (`OutFlow`) is an outflow of **two** stocks. That is non-physical, and outflow-limiting semantics cannot reproduce the reference there.
  - **Recommendation (for DECISIONS.md):**
    - Implement non-negative flows as `MAX(flow, 0)`.
    - Implement non-negative stocks as outflow limiting in priority order, `out_k ← min(out_k, max(0, S/DT + Σin − Σ_{j<k} out_j))` under Euler. This conserves material and follows the spec's intent and Stella's presumed behaviour (**UNVERIFIED**).
    - Skip `non_negative_stocks` (shared outflow, PySD clamping semantics) and `non_negative_flows` (malformed XML), with reasons.
    - Under RK4, apply the limits per stage and warn in Model Health.

---

### 4. Conformance and the proposed LoopLab subset

#### 4.1 What "XMILE 1.0 compliant" requires (§7)
- **File, base level (§7.2.1)**, 13 items:
  - an `<xmile>` element with version and namespace
  - `<header>` containing `<vendor>` and `<product version>`
  - at least one `<model>`, and names on every non-root model
  - on read, resolve inconsistencies between multiple files
  - obey the namespace rules
  - list used optional features in `<options>`
  - at least one `<sim_specs>`
  - **support behaviors**
  - **support include files (§2.11)**
  - support all base objects (§3.1)
  - obey the number, identifier and expression grammar (§3.2–3.3, excluding §3.3.5 documentation and §3.3.6 units)
  - support the required common variable properties
- **Simulator, base level (§7.3.1)**: model assumptions (§3); base object simulation rules (§3.1); **Euler and RK4**; the **full range of §3.5 builtins**.
- **Optional conformance levels** (§7.2.2–7.2.11, §7.3.2–7.3.8): conveyors, queues, arrays, submodels, macros (base, recursive, option-filter), event posters, model view, outputs, inputs and annotations.
- **Implications:**
  - Base conformance *requires* include-file support (§2.11: URLs, relative, absolute and wildcard paths). That conflicts with LoopLab's local-only, untrusted-input stance.
  - The whole §3.5 set, including the statistical functions, FORCST, TREND, DELAYN, SMTHN, PREVIOUS and SELF, is required.
  - **LoopLab should state "reads and writes a documented subset of XMILE 1.0" and not claim conformance.**

#### 4.2 Proposed documented subset

**Supported (import and export)**
| Area | Details |
|---|---|
| File | Root `<xmile>` in the OASIS namespace (legacy `systemdynamics.org` namespace accepted on import), `<header>` (vendor, product+version, name, uuid, options), a single root `<model>` (a single named model is accepted as root) |
| sim_specs | start, stop, dt (incl. `reciprocal`), `method` = euler or rk4 (rk2/rk45/gear fall back to rk4 with a warning), `time_units` |
| Units | `<model_units>` (name, eqn, alias, disabled) and variable `<units>` |
| Behaviour | file- and model-level `<behavior>` with `non_negative` (all, stock or flow), plus per-entity overrides |
| Variables | scalar `<stock>` (eqn, ordered inflow/outflow, non_negative), `<flow>` (eqn, non_negative), `<aux>` (eqn, flow_concept), embedded and named `<gf>` (continuous, extrapolate, discrete; xscale or xpts; yscale; `sep`), `<doc>` (stored as text), `<group>` (optional, metadata only) |
| Expressions | full §3.3 grammar (operators, IF-THEN-ELSE, `{}` comments, quoted identifiers, floored MOD) |
| Builtins | STEP, PULSE (XMILE volume form), RAMP (2 or 3 args), SMTH1, SMTH3, SMTHN, DELAY1, DELAY3, DELAYN, DELAY (constant τ only), MIN/MAX (2 args), ABS, EXP, LN, LOG10, SQRT, INT, SIN, COS, TAN, ARCSIN, ARCCOS, ARCTAN, PI, INF, TIME, DT, STARTTIME, STOPTIME, INIT, PREVIOUS, SELF (in PREVIOUS only). TREND and FORCST are optional (cheap; FORCST semantics are **UNVERIFIED**). Import aliases: `SMOOTH`→SMTH1, `SMOOTH3`→SMTH3, `IF_THEN_ELSE(c,a,b)`→IF. |
| Views | first `stock_flow` view: stock, flow (pts), aux, connector (from/to/angle/pts, `polarity`, `delay_mark`), alias (`of`). Other views and interface objects are ignored on import. |
| Extensions | `looplab:` namespace (section 1.13). Other `isee:`, `simlin:` and unknown elements are ignored, and the user is told they were dropped. |

**Rejected with a clear error** (suggested error codes)
| Feature | Detected by | Code |
|---|---|---|
| Arrays | `<dimensions>` with `<dim>`, a variable `<dimensions>`/`<element>`, `[` in an equation, `uses_arrays` | `XMILE_UNSUPPORTED_ARRAYS` |
| Macros | `<macro>`, `uses_macros`, a call to an unknown function | `XMILE_UNSUPPORTED_MACROS` / `XMILE_UNKNOWN_FUNCTION` |
| Submodels and modules | more than one `<model>`, `<module>`, `.` qualified names, `access=`/`autoexport=`, `uses_submodels` | `XMILE_UNSUPPORTED_SUBMODELS` |
| Conveyors, queues, ovens | `<conveyor>`, `<queue/>`, `<leak>`, `<overflow/>`, `isee:` oven elements | `XMILE_UNSUPPORTED_CONVEYOR` / `_QUEUE` / `_OVEN` |
| Unit-conversion flows | `<multiplier>` on a flow | `XMILE_UNSUPPORTED_FLOW_MULTIPLIER` |
| Includes and external resources | `<includes>`, `resource=` on a model | `XMILE_UNSUPPORTED_INCLUDES` (never fetched) |
| Encrypted models | `encryption-scheme=` | `XMILE_ENCRYPTED` |
| Statistical functions | EXPRND, NORMAL, LOGNORMAL, POISSON, RANDOM | **Decision needed.** Either support them with LoopLab's own seeded PRNG and exclude them from cross-tool comparisons, or reject with `XMILE_UNSUPPORTED_RANDOM`. LoopLab's Monte Carlo already varies parameters outside equations. |
| Event posters, data connections | `<event_poster>`, `<data>` | ignored with a warning (no effect on deterministic results) |
| One flow in multiple stocks' outflow lists, or a flow that is both inflow and outflow of the same stock | structure | `XMILE_INVALID_FLOW_TOPOLOGY` |
| Malformed XML, missing start/stop/`<model>`, or an unknown element with an `isee:` semantics flag (`isee:instantaneous_flows="true"`, **semantics UNVERIFIED**) | parser or validation | `XMILE_PARSE_ERROR` / `XMILE_INVALID` / warning |

---

### 5. Round-trip rules (JSON → XMILE → JSON with identical results)

**What must be preserved exactly**
1. **sim_specs**: start, stop, DT, method and time_units. Write numbers with a *round-trip-exact* formatter (JS `Number.prototype.toString()` produces the shortest string that parses back to the same double). If DT was entered as a reciprocal, keep `reciprocal="true"` so that `1/n` is recomputed identically.
2. **Equations**:
   - Emit the canonical XMILE text. Property test: `parse(print(ast)) ≡ ast`.
   - Keep the user's original text (including `{}` comments) in the `looplab:` payload, or emit it verbatim if it is already valid XMILE.
   - Parenthesise by precedence, remembering that `^` is right-associative and binds tighter than unary minus.
   - Never localise decimal separators.
3. **Stock flow lists in order**: inflow and outflow order is the priority used by non-negative limiting. Also the flow direction: a flow's sign convention and which stock it is an inflow or outflow of.
4. **non_negative** on every stock and flow, written explicitly on the entity rather than relying on `<behavior>` cascading. That makes the file self-describing, and the reader must still honour a cascade coming from other tools.
5. **gf definitions**:
   - `type`, x points (`xscale` when evenly spaced, as §4.1.3 recommends, otherwise `xpts`) and `ypts` with round-trip-exact numbers.
   - The input `<eqn>`.
   - Whether the gf is named or embedded.
   - Floating-point caution: re-deriving an even `xscale` from N stored x values can change the last bits. Decide once whether LoopLab stores xscale or explicit x points, and round-trip the same form.
6. **Builtin arguments exactly as authored**: optional initial values (whether one was given changes the t0 semantics), the RAMP end argument, and the PULSE interval. Emit a single pulse as the explicit `PULSE(v, t, 0)` (see section 2.2).
7. **Names**: the display name goes in the `name` attribute. The canonical key (section 6) must be **injective**. LoopLab must forbid, at authoring time, two variables whose names are equivalent under XMILE rules (case, and space/underscore/NBSP/newline runs), as well as names equal to reserved words or builtins (§3.2.2.5).
8. **Units**: variable unit strings and `<model_units>`, including aliases. XMILE unit equations cannot carry numeric scale factors (see section 6), so **time-unit conversion factors** (brief: "time-unit conversion") must go in the `looplab:` payload or LoopLab's built-in table.
9. **LoopLab-only data** in the `looplab:` namespace (section 1.13): stable element IDs, the CLD layer, provenance and confidence tags, the save step, scenarios, assertions, the Frame stage and the schema version.

**Things that can be dropped without changing results**: view geometry (though LoopLab should preserve it), `<doc>`, groups, styles, and `isee:` preferences.

**Acceptance test design**
- For every bundled model:
  1. `simulate(json)`
  2. `simulate(import(export(json)))`
  3. Assert **bit-identical** series (tolerance 0). This is achievable because the engine and AST are the same and the numbers round-trip exactly.
- Also assert `import(export(json))` is deep-equal to `json` after normalisation (ignoring UIDs regenerated per §5.1.3).

---

### 6. Name normalisation and unit syntax

#### 6.1 Canonical identifier key (derived from §3.2.2; used for matching only, the display name is kept separately)
1. Decode XML entities. If the token is quoted, strip the quotes and process the escapes `\"`, `\\` and `\n`. Apply the same escape decoding to `name="…"` attributes: Stella writes a literal `\n` there, per §4.1's escape rule for text fields.
2. Treat these characters as whitespace: space, U+00A0, `\n`, `_`, and (leniently, per §3.2.2.1 "MAY be treated as a space") control characters below U+0020 such as tab and CR.
3. Collapse each whitespace run to a single `_`, and trim leading and trailing `_`.
4. Case-fold. The spec requires UCA case-insensitivity. The practical approximation is `normalize('NFC')` followed by `toLowerCase()`. Exact agreement with UCA for every script is **UNVERIFIED**, but it is fine for Latin and Arabic names.
5. An unquoted `.` means qualification (submodel or namespace). Reject it in the LoopLab subset, except for the `std.` prefix on builtins. A `.` inside quotes is literal (Simlin maps it to a sentinel character).

Result: `"Teacup  Temperature"` → `teacup_temperature`, and `Stock_with_\n_Newline_Character` → `stock_with_newline_character`.

**Export form**:
- Write `name` with spaces (Stella style), for example `name="completion time"`.
- In equations, `<inflow>`, `<outflow>`, `<from>`, `<to>` and view `name`, write the underscore form (`completion_time`).
- Quote a name (`"…"`) only if the underscore form violates the identifier rules, for example if it starts with a digit or contains `-`, `/` or `(`.

#### 6.2 Unit expressions (§3.3.6)
- Allowed operators: `^` (integer exponents), **`-` or `*` for multiplication** (so `person-hours` means person×hours, not subtraction), `/`, and parentheses.
- `1` is the identity. It is required as the numerator when nothing else is there: `1/months`, not `/months`. `Dimensionless`, `Unitless` and `Dmnl` are RECOMMENDED aliases of `1`.
- Unit names are identifiers (stored with `_`, shown with spaces). `$` may be the first character or the whole name (`<unit name="Dollar"><eqn>$</eqn></unit>` is in Simlin's fork of the SDXorg input_functions test, not upstream).
- Units live in a single, separate, model-wide namespace (§2.1).
- Units named in expressions but never defined are implicitly primary units (§3.3.6: "a unit that has neither [equation nor alias] SHOULD NOT be separately defined, as such units MUST be recognized implicitly").
- **RECOMMENDED baseline table** (§3.3.6; `1` is REQUIRED):

| Name | Aliases | Name | Aliases |
|---|---|---|---|
| `1` | Dimensionless, Unitless, Dmnl | `weeks` | wk, week (`per_week` = 1/weeks) |
| `nanoseconds` | ns, nanosecond | `months` | mo, month (`per_month` = 1/months) |
| `microseconds` | us, microsecond | `quarters` | qtr, quarter (`per_quarter`) |
| `milliseconds` | ms, milliseconds | `years` | yr, year (`per_year`) |
| `seconds` | s, second (`per_second` = 1/seconds) | `days` | day (`per_day`) |
| `minutes` | min, minute (`per_minute`) | `hours` | hr, hour (`per_hour`) |

- **Important limitation**: the spec defines names and aliases only, **with no conversion factors** (months ↔ years). Unit equations are substitutions such as `Square_Miles = Miles^2`. LoopLab's time-unit conversion therefore needs its own factor table, for example 12 months per year and about 4.33 weeks per month (a LoopLab decision), stored outside the standard XMILE unit definitions.
- Real-world strings seen in S4: `Month`, `Minute`, `people`, `person/time`, `deg/time`, `Widgets/Month`, and empty `<units></units>` (66 times). Some reference the sim time unit `Time`/`time` without defining it. **Treat undefined names as primary units**, and warn rather than fail.

---

### 7. SDXorg XMILE inventory (for the interop agent)
- There are 123 `.xmile`/`.stmx` files, from these producers:
  - xmutil: 89
  - Stella (Architect 1.4/1.8.3 and STELLA 10.0.6 legacy): 15
  - SDLabs go-xmile: 7
  - sdCloud: 6
  - Vensim export: 5
  - hand-coded: 1
- Most reference outputs are **Vensim** (`output.tab`/`.csv`), with **Stella** in `output_stella*.csv` for some tests.
- Several XMILE-only tests (`delay_xmile`, `non_negative_*`) have **PySD-generated** references. Tolerance and semantics decisions should be made per source.
- No upstream XMILE tests exist for STEP, PULSE or RAMP. Simlin's fork adds some; they are not part of upstream at `21aab02`.
- Two files are not well-formed XML (`non_negative_flows`), and 89 fail a namespace-strict parser (undeclared `isee:`).

---

### 8. UNVERIFIED items (collected)
1. Byte-fidelity of the Simlin-hosted spec copy against OASIS (S1). The OASIS site was unreachable.
2. The content of Errata 01 (S2) and of the XSD (S3), including whether foreign-namespace elements and attributes are schema-valid.
3. Stella PULSE when the interval is omitted or 0: "each DT" (S8 snippet) vs "once" (spec).
4. Stella's exact STEP/PULSE comparison tolerance off the DT grid, and Stella's PULSE/STEP handling under RK4.
5. The exact non-negative-stock algorithm in Stella (inflow accounting, biflows). I also read the §4.8.4 `MAX` as an erratum.
6. Stella's DELAY (pipeline) handling of a time-varying delay time. The FORCST formula.
7. Vendor behaviour on division by zero and out-of-domain math (for example `LN(0)`).
8. Whether Stella and Vensim open a LoopLab minimal view (section 1.12) without complaint. The meaning of `isee:instantaneous_flows`.
9. Whether `toLowerCase()` + NFC matches UCA case-insensitivity for all scripts.
10. Spec typos I noticed, quoted as found: POISSON "2 or 3" parameters for `(mean[, seed])`; the doubled commas in the TREND and FORCST signatures; LN/LOG10 "Range: [0, ∞)"; `uses_conveyors`/`uses_array` naming; §7.2.3 citing "Section 1.2" for queues.

---

# Part LTM — Loops That Matter (LTM): method research for LoopLab

Phase 0 research note (planning only; no product code). Accessed 2026-09-29.
Owner: research subagent. Consumer: `analysis` agent (Phase 3, `packages/core/src/analysis`) and SPEC author.

**Bottom line**

1. The method is fully specified in the primary sources I read, so it is not a blocker.
2. LoopLab must use the **2023 revised flow→stock link score** (Schoenberg, Hayward & Eberlein 2023), not the 2020 original.
   - With the 2020 formula, a logistic model built from separate `births` and `deaths` flows **never** hands dominance to its B loop. R only tends toward 50%. That would fail the brief's acceptance criterion. See §5.2.
   - With the 2023 formula, dominance shifts exactly when the net flow peaks (P ≈ K/2).
3. Several open points need decisions rather than more research: time labeling, dt scaling in Eq. 3 (2023), the RK4 status, and how the loop set is chosen when the 1,000-loop cap is hit. They are listed in §9.

---

### 0. Sources actually read (provenance)

The sandbox egress proxy blocked `arxiv.org`, `export.arxiv.org`, `ar5iv`, `onlinelibrary.wiley.com`, `bora.uib.no`, `proceedings.systemdynamics.org` and `iseesystems.com` (HTTP 403 on CONNECT; WebFetch returned `EGRESS_BLOCKED`).

I got the primary documents from a public GitHub repository that mirrors them:
- Repository: `github.com/bpowers/simlin`, by the author of sd.js, the engine the 2020 paper modified.
- Commit: `e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc` (2026-09-19).
- Path: `docs/reference/papers/`.

The two SDR PDFs are the publisher's versions of record. Each page carries the Wiley download watermark, the CC BY open-access notice and the DOI. I extracted text with `pypdf` and checked every equation used below against a page render with PyMuPDF.

| # | Citation | What I read | Mirror path | SHA-256 of the PDF read |
|---|---|---|---|---|
| P1 | Schoenberg, W., Davidsen, P., & Eberlein, R. (2020). Understanding model behavior using the Loops that Matter method. *System Dynamics Review*, 36(2), 158–190. DOI [10.1002/sdr.1658](https://doi.org/10.1002/sdr.1658). Open access, CC BY. | Full article, pp. 158–190, including Appendices A and B | [`schoenberg2020-loops-that-matter.pdf`](https://github.com/bpowers/simlin/blob/e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc/docs/reference/papers/schoenberg2020-loops-that-matter.pdf) | `f08295f4c237491a862ba07b73c5d288abbe24c58e282155aad765fd717ba48a` |
| P2 | Schoenberg, W., Hayward, J., & Eberlein, R. (2023). Improving Loops that Matter. *System Dynamics Review*, 39(2), 140–151. DOI [10.1002/sdr.1728](https://doi.org/10.1002/sdr.1728). Open access, CC BY. | Full article, pp. 140–151 | [`schoenberg2023-improving-loops-that-matter.pdf`](https://github.com/bpowers/simlin/blob/e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc/docs/reference/papers/schoenberg2023-improving-loops-that-matter.pdf) | `dc2c4e9531648d858e30e9b17a6ff542df983c0ff0ba5978130b8a7acf43bde4` |
| P3 | Eberlein, R., & Schoenberg, W. (2020). *Finding the Loops that Matter.* Manuscript; arXiv:2006.08425 (arXiv ID as listed in P5's publication list; I could not open arXiv). | Full 15-page manuscript. PDF metadata: Word, created 2020-04-15. Page numbers below are manuscript pages. | [`eberlein2020-finding-the-loops-that-matter.pdf`](https://github.com/bpowers/simlin/blob/e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc/docs/reference/papers/eberlein2020-finding-the-loops-that-matter.pdf) | `e29ccb090159d0d91d7cabb257fbd8404f560e94370bf9a865919496df94dedf` |
| P4 | Schoenberg, W., & Eberlein, R. (2020). *Seamlessly Integrating Loops That Matter into Model Development and Analysis.* arXiv:2005.14545. | Full 21-page manuscript. PDF metadata: "version 7", created 2020-04-13. Describes the Stella 2.0 implementation. | [`schoenberg2020.1-seamlessly-integrating-ltm.pdf`](https://github.com/bpowers/simlin/blob/e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc/docs/reference/papers/schoenberg2020.1-seamlessly-integrating-ltm.pdf) | `ae6015e2fa132d30014ea0faafd2712a1cbd700ac24754749c52ef33cd0797f2` |
| P5 | Schoenberg, W. A. (2020). *Loops that Matter.* PhD thesis, University of Bergen; defended 2020-11-06. BORA handle 1956/24455, from search results only (not opened). | Selected parts: front matter, list of publications (printed p. 5), synthesis §3.1–3.2 (printed pp. 27–30), and the reprinted P1 text used to look for a stated Bass dt (none found) | [`schoenberg2020.2-thesis.pdf`](https://github.com/bpowers/simlin/blob/e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc/docs/reference/papers/schoenberg2020.2-thesis.pdf) | `6850c4aa9e1fd6681b34a265a18a3a4aa5a59ddda5ef2d2c7e3ccb04aa709c06` |

**Secondary source, used only for corroboration and labeled wherever it is used:**

- S1: `docs/reference/ltm--loops-that-matter.md` in the same simlin commit. This is Simlin's own technical reference, not a peer-reviewed source.

**Not read (blocked). No claim below relies on these:**

- arXiv preprints 1908.11434, 2005.14545, 2006.08425 and 1909.01138 (LoopX)
- Wiley supporting-information model files for P1
- isee Systems / Stella help pages on loop dominance analysis
- SDS conference proceedings, e.g. `proceedings.systemdynamics.org/2024/papers/O1041.pdf`
- Any later Schoenberg paper on discrete or stochastic models beyond what P4 and P5 contain

Page references: for P1 and P2 they are journal page numbers; for P3 and P4 they are manuscript page numbers.

---

### 1. Link score for non-integration links x → z, where z = f(x, y, …)

This covers links into auxiliaries and flows, from any stock, flow or auxiliary.

**P1 Eqn 1 (p. 164), verified from the page render.** P2 restates it as Eq. 2 (p. 142).

```
LS(x→z) = | Δ_x z / Δz | · sign( Δ_x z / Δx )     if Δz ≠ 0 and Δx ≠ 0
        = 0                                         if Δz = 0 or Δx = 0
```

**Definitions, from P1 pp. 164–165:**
- "Δz is the change in (the value of) z from the previous time to the current time. Δx is the change in x over that interval."
- Δ_x z is the *partial change in z with respect to x*: "the amount z would have changed, conditionally, if x had changed the amount it did, but y had not changed (i.e. ceteris paribus)".

**How Δ_x z is computed. This is exact and verified in three places in P1:**
- p. 167, Table 1 worked example: "substituting into the equation for z the previous value of y (4) and the current value of x (7) … subtract from it the previous value of z (14)".
- p. 171, Fig. 1 pseudo-code: `tRespectSource = <calc. target, use current source, prev. of rest>`, then `deltaTRespectS = tRespectSource - previousValue`.
- p. 171, text: "recalculating target using the current value of source and the previous value of all other variables".

So:

```
Δ_x z = f(x_t, y_{t−dt}, …all other inputs at t−dt) − z_{t−dt}
```

Note that Δ_x z is **not** f(x_t, y_t) − f(x_{t−dt}, y_t).

**Edge cases:**
- Δz = 0 or Δx = 0 gives score 0 (Eqn 1). A link from a constant always scores 0, "by definition" (p. 164).
- The first term can exceed 1 when an equation mixes positive and negative influences nonlinearly. P1 says this is acceptable because only relative loop values are compared (p. 165).
- **First step.** "The first computation can be made only after the model has been initialized and moved forward in time" (P1 p. 170). P3 p. 7 adds: "All the link scores start at 0 because nothing has changed at the beginning of the simulation – a convention of the Loops that Matter scoring technique."

**Discrepancy inside P1: Fig. 1 vs Eqn 1.** When `deltaSource == 0`, Fig. 1 (p. 171) defaults `sign = 1` and still writes `ABS(deltaTRespectS/deltaT)*sign`. That result is non-zero only if Δ_x z ≠ 0 while Δx = 0. This can only happen when f has hidden inputs, such as TIME or state. Eqn 1 says the score is 0 in that case. **Follow Eqn 1.**

**Unit-test fixtures, taken verbatim from P1:**

| Source | Equation | Values (Time 1 → Time 2) | Expected link scores |
|---|---|---|---|
| Table 1 (p. 167) | z = 2x + y | x 5→7, y 4→5, z 14→19 | Δ_x z = 4, Δ_y z = 1; magnitudes 4/5 and 1/5 (both links positive) |
| Table 2 (p. 167) | z = (w + x)/y | w 7→10, x 2→4, y 3→5, z 3→2.8, Δz = −0.2 | Δ_w z = 1, Δ_x z = 0.67, Δ_y z = −1.2; LS(w→z) = +5, LS(x→z) = +3.33, LS(y→z) = −6 |

**Continuous form (P1 Appendix A, Eqns 5–7, pp. 187–188).**
- Eqn 5: LS = (Δ_x z/Δx) · |Δx/Δz|.
- Eqn 7: LS = (∂z/∂x) · |ẋ/ż|, and 0 if ż = 0 or ẋ = 0.

**Chain property (P1 Appendix B, Eqns 8–13).** Along a path x → u → z, the product of link scores equals the single-equation link score. This holds only if the intermediate variable changes: "this equivalence fails if Δu = 0" (p. 189).

### 2. Link score for flow → stock links

#### 2.1 Original formulation (P1 Eqn 2, p. 166). Deprecated by P2.

```
Inflow:  LS(i→s) = | i / (i − o) | · (+1)
Outflow: LS(o→s) = | o / (i − o) | · (−1)
```

- Score is 0 if the net flow (i − o) = 0 (p. 166).
- Fig. 1 (p. 171) uses the flows' **previous** values: `source.previousValue / sumOfFlows`.
- **Discrepancy inside P1.** Fig. 1 assigns `-ABS(...)` to inflows and `+ABS(...)` to outflows. That contradicts Eqn 2 and Table 3, where `Adopting → adopters = +1.000` and `Adopting → potential adopters = −1.000`. **Follow Eqn 2 and Table 3.**

#### 2.2 Revised formulation (P2 Eq. 3, p. 144). Use this one.

P2 shows that the original formula is sensitive to how flows are aggregated. On the same model, the outflow link score is 1 with separate flows but 0.25 once the flows are aggregated into a net flow (Tables 1–2, pp. 142–143). The fix, verified from the page render:

```
Updated-Inflow:  LS(i→S) = | Δi / (ΔS_t − ΔS_{t−dt}) | · (+1)
Updated-Outflow: LS(o→S) = | Δo / (ΔS_t − ΔS_{t−dt}) | · (−1)
```

- "ΔS_t − ΔS_{t−dt} is the change in the net flow which is the second order change in the stock S" (p. 144).
- P2 also states the equivalent, simpler route (pp. 143–145): "Convert all disaggregated flows into a single aggregated net flow, then use a link score of 1 for all net flow to stock links." The instantaneous and updated flow-to-stock equations "now produce the same set of calculations".
- P2 Table 3 (p. 144) fixture: S goes 100 → 101 → 106; in goes 5 → 10; out goes 4 → 5. Expected LS(in→S) = 5/4 and LS(out→S) = −1/4. The original formula gives 10/5 and 5/5 (Table 1).
- P2 (p. 149) says the change "is included in Stella Architect version 2.1 and all subsequent versions".

**Operational form for LoopLab.** This is my derivation from P2's equivalence statement, flagged as INTERPRETATION.

```
Δnet = Σ_inflows Δi − Σ_outflows Δo          (Δ of flow values between saved points t−dt and t)
LS(i→S) = +|Δi / Δnet|,  LS(o→S) = −|Δo / Δnet|,   0 if Δnet = 0 or Δflow = 0
```

- This is exactly Eqn 1 applied to the linear aggregate `net = Σi − Σo`: Δ_i net = Δi and sign(Δ_i net/Δi) = +1.
- The zero cases come from Eqn 1 through that equivalence. P2 does not spell them out for Eq. 3.
- The literal Eq. 3 divides a change in a *rate* (Δi) by a change in stock *increments*. The two differ by a factor of dt, so they agree only because dt = 1 in P2's example. The net-flow form removes that ambiguity.
- The net-flow form does not depend on the integration method: it needs only flow values at saved points.
- The exact time window Stella uses for multi-flow stocks is **UNVERIFIED** (see §9).

### 3. Loop score and relative loop score

**Loop score (P1 Eqn 3, p. 168):**

```
Loop Score(L_x) = LS(s1→t1) · LS(s2→t2) · … · LS(sn→tn)
```

- The sign is multiplied too: "an odd number of negative links yielding a negative loop".
- "any loop containing an inactive link is assigned the loop score 0" (p. 168).

**Relative loop score (P1 Eqn 4, p. 169, verified from the page render):**

```
Loop Score_{L_X} = Loop Score(L_X) / Σ_{Y=0..n} |Loop Score(L_Y)|
```

- The sum runs over "all loops n analyzed in the chosen cycle partition".
- The result lies in [−1, 1]; its sign "still represents the polarity of the feedback loop" (p. 169).
- P4 (p. 4): the relative loop score is "computed so that the absolute value of all relative loop scores add to 100%" and "measures the percentage contribution a loop to the changes of all variables in the model at each point in time".

**Normalization set is per cycle partition, not all loops (P1 p. 169).**
- "For models with a single-cycle partition (where every stock in the model has a path to and from every other stock in the model), we compare the loop score across all loops in the model. For models where this is not true … we only compare the loop scores across all loops which effect the same subset of all the stocks in the model."
- P4 footnote 1 (p. 4) says the same: variables "are broken into sets that share feedback loops, and the scores computed on each set".
- Example: in the inventory–workforce model, B3 (expected demand) sits in its own partition, separate from B1/B2 (P1 p. 179).
- LoopLab operationalization (INTERPRETATION): group loops by the strongly connected component of the causal graph that contains them. Every elementary cycle lies inside exactly one SCC, which matches P1's "path to and from every other stock". I did not read Oliva (2004), whose definition of cycle partition P1 cites.
- LTM does **not** require an independent loop set (P1 p. 169): "we consider all identified connected loops, independent or not".

**Polarity semantics.**
- Positive relative score means the loop is currently acting as reinforcing; negative means balancing.
- Polarity is instantaneous and can flip. In the yeast model, "R" acts as a balancing loop late in the run (P1 pp. 176–177).
- P4 (pp. 10–11) labels loops R, B, Ru, Bu or U. Ru/Bu mean "unknown polarity, predominantly reinforcing/balancing" when the confidence is above 0.99.
- P4 Eq. 3 defines confidence as |r − |b|| / (r + |b|), with r and b the sums of the highest-magnitude reinforcing and balancing pathway scores over the run. P4 defines it for simplified links and then applies it to loops without restating what r and b mean for a loop (**UNVERIFIED detail**).

**Magnitudes.**
- A single isolated loop always scores ±1, whatever its gain: "the loop score will always compute to 1 in an isolated loop" (P1 p. 168). Appendix B (p. 190) repeats this: "for a single positive or negative loop the score will be +/−1".
- Loop scores blow up near equilibria and inflections: in the Bass model they reach ~10⁴ at dt = 1/16 (P1 Table 3). This is why relative scores are reported.
- Implementation note, not from the papers: compute products in log-magnitude plus sign to avoid overflow. P3 p. 7 reports composite scores "can easily exceed 1.0E300".

### 4. Dominance and "% contribution"

- **Definition (P1 p. 159, quoted again in P2 p. 149):** "We say that a loop (or set of loops) is dominant if the loop(s) describe at least 50% of the observed change in behavior across all stocks in the model over the selected time period."
- Loop dominance is model-wide, or partition-wide when stocks don't share loops (P1 p. 159). It is not per-stock as in PPM.
- **Instantaneous threshold (P1 p. 173):** the Bass relative scores cross "0.5, the threshold for dominance, at the inflection point". P5 (printed p. 27–28) says dominant means contributing "the most (over 50%)".
- **When no single loop reaches 50% (P1 Table 4 footnote, p. 177):** at t = 74 in the yeast model, B3 is "the single strongest feedback loop at that exact moment, and we therefore consider it alone to be dominant across Phase 3".
- **LoopLab rule (INTERPRETATION, record in DECISIONS):**
  - If some loop has |rel| ≥ 0.5, that loop is dominant.
  - Otherwise the dominant set is the smallest set, taken in order of descending |rel|, whose sum reaches 0.5; the single strongest loop is also shown.
  - The sources do not specify how to build the set.
- **Stella's "%" reporting.** P4 reports percentages, e.g. "The reinforcing loop has a 67% contribution, the balancing loop 35%" (p. 12). Analytically this model gives 66.7% / 33.3%, so the published "35%" looks like a typo.
- **Whole-run summaries:**
  - P3 (p. 11) keeps loops describing at least 0.1% "of the total behavior".
  - P4 (p. 8) keeps loops that explain, "on average, at least the specified percent of model behavior".
  - The exact averaging (mean of |rel| over saved steps? zero-score steps included?) is **UNVERIFIED**. I did not read the Stella help pages.

### 5. Worked examples and test oracles

#### 5.1 Exponential growth (single loop): 100% at every scored step

Model: `P' = births`, `births = r·P`.

| Link | Score at every step with ΔP ≠ 0 | Why |
|---|---|---|
| P → births | +1 | `births` has one changing input, so Δ_P births = Δbirths |
| births → P, 2020 formula | +1 | \|b/b\| |
| births → P, 2023 formula | +1 | \|Δb/Δb\| |

- Loop score = +1 and relative score = +1 (100%).
- This matches P1 p. 168 ("always compute to 1 in an isolated loop") and Appendix B, p. 190 (net population growth example).
- An exponential drain gives −1 (p. 190).
- **Oracle:** for every saved step k ≥ 1 with ΔP ≠ 0, relative loop score = +1 exactly (tolerance ~1e-12). At k = 0 the score is 0 by convention (P3 p. 7).
- **The acceptance criterion's "every step" must be worded as "every step after the initial time".**

#### 5.2 Logistic growth: dominance shift, and why the 2023 formula is required

Model: `P' = births − deaths`, `births = r·P`, `deaths = r·P·P/K`, with deaths written as **one equation of P** (see the fixture-design caution below).

Loops:
- R: P → births → P
- B: P → deaths → P

Link scores:
- P→births = +1 and P→deaths = +1. Each has a single changing input, so Δ_P z = Δz.

**2023 formula (use this), exact for saved values P_{t−dt} = P₀ and P_t = P₁:**
- Δb = rΔP and Δd = (r/K)(P₁² − P₀²) = rΔP(P₁ + P₀)/K.
- Therefore:

```
relR = K / (K + P₁ + P₀)            relB = −(P₁ + P₀) / (K + P₁ + P₀)
```

- **The shift happens when P₁ + P₀ > K, i.e. P ≈ K/2 (continuous limit relR = K/(K+2P)).** That is the inflection point, where Δnet changes sign.
- In general, for one stock with two flows, |Δb| = |Δd| ⇔ Δnet = 0 ⇔ net flow at its maximum.
- relR goes 1 → 1/2 at P = K/2 → 1/3 as P → K. relB goes 0 → −1/2 → −2/3.
- The identity uses only saved values, so it holds for **any integrator**, Euler or RK4.
- Loop scores go to ±∞ at the crossover (P2 p. 149: "at inflection points … the loop score approaches infinity"). Relative scores stay bounded.
- Guard against Δnet = 0 exactly; the score is defined as 0 there.

**2020 formula, for contrast (derived):**
- relR = b/(b + d) = K/(K + P_{t−dt}), using previous flow values as in Fig. 1.
- This is ≥ 1/2 for all P ≤ K, so **R never loses dominance**. It only tends to 50% as P → K.
- This agrees with P4 p. 13 on Stella 2.0's carrying-capacity model: "At the end there is one reinforcing loop with a score of 50%, and two balancing loops with scores that add to −50%".

**Numerical check** (my scratch script, Euler, r = 1, K = 1000, P₀ = 10, dt = 1/64):
- 2023 formula: first |B| > |R| at t = 4.640625 (P = 505.1). P first reaches K/2 at t = 4.625, which is also where the Euler net flow peaks.
- 2023 formula: relR at t = 6 is 0.3851, against the analytic K/(K+2P) = 0.3848.
- 2020 formula: B never exceeds R.

**Fixture-design caution (derived).** Suppose deaths is written through an auxiliary, `crowding = P/K; deaths = r·P·crowding`:
- There are then **two** B loops: P→deaths→P and P→crowding→deaths→P.
- Each gets half of the balancing score. Exactly, LS(P→deaths) = LS(crowding→deaths) = P₀/(P₁ + P₀).
- The *balancing set* still dominates after K/2, but no single B loop ever exceeds R. Near K the scores are about +1/3, −1/3, −1/3.
- So the fixture should use a single `deaths = r*P*P/K` equation, or the test should assert on the sum of balancing relative scores.

#### 5.3 Linear births and deaths (P4 pp. 11–12)

Model: `births = P·0.1`, `deaths = P/20`.
- The birth rate of 0.1 is inferred from P4: a lifetime of exactly 10 gives equilibrium.
- Both formulas give relR = 0.1/(0.1 + 0.05) = 2/3 and relB = −1/3, constant over time. My numeric check gives 0.6667 / −0.3333.
- P4 prints "67%" and "35%".
- If average lifetime = 10 exactly, there is no change, so no loops are reported (P4 p. 13). This is the LTM equilibrium limitation (P1 p. 183).

#### 5.4 Bass diffusion: P1 Table 3 (p. 173), a numeric fixture reproduced to 4 significant digits

**Stated in P1 (p. 172):**
- Time 0–15.
- Market Size 1,000,000 with one initial adopter.
- Contact rate 100; adoption fraction 0.015.
- "standard formulation"; loops B1 and R1 are listed.
- Inflection "between time 9.5625 and 9.625".

**Not stated (the supporting-information model was not accessible):** dt and the exact equations.

**My reconstruction reproduces every tabulated value.** Euler, dt = 1/16:
- `potential adopters(0) = 999,999`, `adopters(0) = 1`
- `adopter contacts = adopters·100`
- `probability of contact with potentials = potential adopters / 1,000,000`
  - Using P/(P+A) does **not** reproduce the table.
- `potentials contacts with adopters = adopter contacts · probability`
- `adoption from word of mouth = potentials contacts · 0.015`
- `adopting = adoption from word of mouth`

| P1 column | LS(prob→pc) | LS(adopter contacts→pc) | B1 rel | R1 rel |
|---|---|---|---|---|
| T1 | 0.000 | 1.000 | 0.000 | 1.000 |
| T9.5 | 9.958 | 11.46 | −0.465 | 0.535 |
| T9.5625 | 9358 | 9806 | −0.488 | 0.512 |
| T9.625 | 10.91 | 10.41 | −0.512 | 0.488 |
| T15 | 1.000 | 0.000 | −1.000 | 0.000 |

All other links in both loops are ±1.000.

**Time-label offset (INFERRED, not stated in P1).** My values match P1's column T when the score is computed from saved values at **(T, T+dt)**. If I label the interval [t−dt, t] with t instead, every middle column shifts by one dt.
- S1, a secondary source, independently reports the same finding for Stella: "Stella labels the score computed over [t, t + dt] with t".
- Tests should either shift the timestamps by one dt or compare the sequence of values.

**Formula independence.** Each Bass stock has a single flow, so the flow→stock scores are ±1 under both the 2020 and 2023 formulas. Table 3 is therefore a valid fixture for the 2023 implementation as well.

#### 5.5 Other published examples (qualitative use only)

**Yeast alcohol model (P1 pp. 175–178, dt = 0.5).**
- Equations: B = C·(1.1 − 0.1A)/b1; D = C·EXP(A − 11)/d1; dA/dt = p·C; b1 = 16, d1 = 30, p = 0.01; "initialized with A = 0, B = 1".
- Published dominance phases (Table 4): R 0–51.5, B2 52–66, B3 66.5–75, B1 75.5–100.
- **Not exactly reproducible.** "B = 1" is ambiguous; it probably means C. With C₀ = 1, I get the same order R → B2 → B3 → B1 at 0.5–54.5, 55–70, 70.5–79.5 and 80–100.
- The model has two flows into C, so P1's numbers use the 2020 formula.
- Use it at most as a qualitative ordering test.

**Inventory–workforce model (Gonçalves 2009 version, P1 pp. 178–182).**
- The major balancing loop B1 dominates the oscillation; B2 contributes damping; B3 is in a separate partition.
- The paper gives no numbers, only a figure.

**Arms race and composite-structure models (P3 pp. 3–7).** Equations are only partly given, so these can't serve as numeric fixtures.

### 6. Loop discovery for large models

**What P1 does.** P1 analyzes *all* loops, grouped by cycle partition (p. 169). The cost of finding loops, not scoring them, dominates for small models: 2–20 stocks and fewer than 50 loops (p. 170). The enumeration algorithm is not named.

**P3's approach (manuscript pp. 7–10, 13–14):**
1. Build a composite network using the maximum of all link scores. Enumerate loops **exhaustively "if there are not too many (less than 1000)"** (p. 8).
2. Otherwise, run the **strongest-path heuristic** "at every (or almost every) point in time" (p. 8). This is a Dijkstra-like DFS from every stock:
   - Outbound links are sorted by |link score|.
   - The path score is the product of link scores.
   - A variable already on the current path ends the branch, recording a loop only if that variable is the start stock.
   - A branch is pruned when a variable was previously reached with a higher score.
   - Loops are de-duplicated.
3. The union of loops found across time steps becomes the loop set. Relative scores are computed against that set.

**The heuristic is incomplete.**
- P3 Fig. 7 (p. 9) is a counter-example: the heuristic misses the strongest loop a→b→c→a.
- Service Quality model: 76 of 104 loops found; the 8th most important is missed (p. 10).
- Economic Cycles model: 261 of 494 found; the 22nd and 40th are missed (p. 11).
- Urban Dynamics: 20,172 of 43,722,744 found in 10–20 s (p. 11).
- World3-03: 2,709 of 330,574 found in about 4 s (p. 12).
- The per-pass cost is "roughly proportional to the square of the number of variables" (p. 10). That is an empirical claim, not a bound.

**P4 (p. 7) adds builtins:**
- `LOOPSCORE`, which scores any user-specified loop, so the loop is always reported.
- `PATHSCORE`, the raw path score.

**Implications for LoopLab (150-variable graph, 1,000-loop Johnson cap):**
- **≤ 1,000 loops:** Johnson enumeration gives the exact P1 loop set. P3 uses the same 1,000 threshold.
- **Cap hit:** Johnson's output order is not importance order, so relative scores over a truncated Johnson set are **not** the published method. Options:
  - (a) Implement P3's strongest-path search (Appendix I pseudo-code, ~20 lines) over the saved steps as the fallback loop set. Keep the union capped and show the brief's cap warning.
  - (b) Refuse LTM and show a visible warning.
- Recommend (a), labelled "heuristic loop set (Eberlein & Schoenberg 2020)", plus pinned loops in the spirit of `LOOPSCORE`.
- Either way, relative scores are only relative to the loop set actually scored. The UI and report must say which set was used.

### 7. Practical implementation notes

**Sampling and integration method.**
- P1 p. 170: "we use the model's dt or time step to determine how often to compute link and loop scores. This is most straightforward using the Euler integration method. In principle, the computation could proceed also at a longer or shorter sampling interval, allowing it to work with other integration methods such as Runge–Kutta."
- **RK4 support is claimed "in principle" only; no published RK4 results (UNVERIFIED in practice).**
- Recommendation:
  - Compute LTM from values saved at every dt, never from RK4 stage values.
  - Use the net-flow form of §2.2, which needs no Euler identity.
  - The oracles in §5.1–5.2 hold for any integrator because they use only saved values.

**Equation re-evaluation.**
- Every non-stock equation is re-evaluated once per input per step (P1 p. 170: "repeated once for each independent variable in the equation").
- LoopLab needs its compiled closures callable with an arbitrary current/previous input vector, i.e. evaluate f with a chosen mix of current and previous input values.
- Implicit inputs (TIME, and the time argument of STEP/PULSE/RAMP) are "other variables", so they take their previous values under P1's rule. That is my reading (INTERPRETATION). S1 does the same.

**Nonlinear functions and lookups.**
- No derivatives are needed. Δ_x z comes from re-evaluating the actual equation, lookups included. This is why LTM applies to discontinuous and discrete models (P1 pp. 162–163, 182).
- The price is that link-score magnitudes can exceed 1 (P1 p. 165).

**Builtins with hidden stocks (SMOOTH, DELAY1, DELAY3). Rules from P4 pp. 4–6:**
- Compute through the **expanded** internal structure.
- The link score of a pathway through a macro is "the path score of the expanded pathway. If there are multiple pathways, we choose the path score with the largest magnitude (positive or negative)".
  - Example: DELAY3's delay-time argument has six internal paths; its input has one path, through all three stocks.
- Loops involving internal variables are "trimmed of those internal variables before being reported".
- Loops internal to the macro (e.g. DELAY3's three first-order drains, SMOOTH's adjustment loop) "are dropped altogether and not reported".
- Consequence: a DELAY3 driven by a pure step "will always" report link score 0 (p. 6).

For LoopLab:
- Expand SMOOTH, DELAY1 and DELAY3 into internal stocks for scoring.
- Report the collapsed input→output link with the max-magnitude path score.
- Exclude macro-internal loops from both Johnson's output and the LTM loop set.

**Discrete elements** (conveyors, queues, ovens, PREVIOUS; P4 p. 6) are handled case by case with an "instantaneous response" approximation. LoopLab's builtin set has none of these, so this does not apply.

**Equilibrium limitation.** LTM cannot analyze a model at equilibrium; all scores are 0 (P1 p. 183). The suggested workaround is to perturb the model, e.g. with a STEP (p. 183). The UI should say "no change → no loop scores" rather than show 0%.

**Exogenous drivers.** Relative scores cover endogenous loops only. P1 pp. 183–184 notes this is a weakness for heavily forced models.

### 8. Minimal algorithm (pseudo-code, 2023 formulation)

```text
input: vars V with inputs in(v) and compiled f_v; stocks S with inflows(s), outflows(s)
       trace X[k][v] saved at t_k = t0 + k·dt, k = 0..N (every dt; not RK4 stage values)
       loops Λ (edge lists, macro-internal loops removed), part(L) = SCC id of loop L
for k in 1..N:                                  # score interval [t_{k-1}, t_k], label t_k (Stella: t_{k-1})
  for v in V \ S:                               # P1 Eqn 1: auxiliaries and flows
    dz = X[k][v] - X[k-1][v]
    for x in in(v):
      dx = X[k][x] - X[k-1][x]
      if dz == 0 or dx == 0: LS[k][x→v] = 0; continue
      zx  = f_v( x ← X[k][x], every other input u ← X[k-1][u] )   # incl. TIME ← t_{k-1}
      dxz = zx - X[k-1][v]
      LS[k][x→v] = abs(dxz/dz) * sign(dxz/dx)
  for s in S:                                   # P2 Eq 3 via net-flow aggregation
    dnet = Σ_{i∈inflows(s)} ΔX(i) - Σ_{o∈outflows(s)} ΔX(o)   # ΔX(f) = X[k][f]-X[k-1][f]
    for i in inflows(s):  LS[k][i→s] = (dnet==0) ? 0 : +abs(ΔX(i)/dnet)
    for o in outflows(s): LS[k][o→s] = (dnet==0) ? 0 : -abs(ΔX(o)/dnet)
  for L in Λ:                                   # P1 Eqn 3 (use log|·| + sign to avoid overflow)
    score[k][L] = Π_{e∈L} LS[k][e]
  for each partition P:                         # P1 Eqn 4
    tot = Σ_{L∈P} abs(score[k][L])
    for L in P: rel[k][L] = (tot == 0) ? 0 : score[k][L] / tot
  dominant[k] = loops with |rel| ≥ 0.5, else smallest top-|rel| set reaching 0.5   # §4 interpretation
LS[0][*] = score[0][*] = rel[0][*] = 0          # P3 p.7 convention: nothing has changed at t0
```

To get the deprecated 2020 variant for comparison, replace the stock block with `±|X[k-1][f] / net_{k-1}|`, where `net_{k-1}` is the net flow at the previous step (P1 Eqn 2 / Fig. 1 with signs corrected).

**Test oracles:**

| Oracle | Expected result |
|---|---|
| Eqn 1 unit | P1 Tables 1–2 (§1) |
| Flow→stock unit | P2 Table 3: +5/4 and −1/4. The deprecated 2020 formula gives 2 and −1 on the same data (P2 Table 1) |
| Exponential | rel ≡ +1 for all k ≥ 1 with ΔP ≠ 0; decay gives rel ≡ −1 |
| Logistic (single-equation deaths) | relR[k] = K/(K + P_k + P_{k−1}) exactly, to ~1e-12. \|relB\| > relR ⇔ P_k + P_{k−1} > K, i.e. the first scored step after the net flow peaks (P ≈ K/2). Assert R has \|rel\| > 0.5 before and B has \|rel\| > 0.5 after, allowing a ±1-step window around the crossover |
| Aggregation invariance | The same stock written as births/deaths flows, or as one net flow with births/deaths auxiliaries, gives identical relative scores at every step (P2's central claim) |
| Bass | §5.4 table, with the one-dt label shift |

### 9. UNVERIFIED items and decisions to log

1. **Time window and labeling.**
   - The papers never say which timestamp a score is reported at.
   - The one-dt offset (Stella labels [t, t+dt] with t) is inferred from reproducing P1 Table 3 and is corroborated only by S1, a secondary source.
   - Decision needed: LoopLab's label convention. Recommend labeling with the interval end t_k and documenting it.
2. **dt scaling in P2 Eq. 3** for dt ≠ 1, and whether Stella computes multi-flow Δ over the same window as the other links.
   - Resolved by adopting P2's own net-flow equivalence (§2.2). The literal text is ambiguous.
3. **RK4:** "in principle" only (P1 p. 170). No published validation.
4. **Dominant set** when no loop reaches 50%, and **whole-run "% contribution" averaging:** not operationally specified (§4).
5. **Cycle partition = SCC:** consistent with P1's wording. Oliva (2004) not read.
6. **Bass model equations and dt:** reconstructed, not stated. The reconstruction reproduces every tabulated value to 4 significant digits.
7. **Yeast model:** not reproducible numerically from the text (ambiguous initial condition).
8. **Loop-polarity confidence for loops (P4 Eq. 3):** r and b are not fully defined for loops.
9. **Internal inconsistencies in P1 Fig. 1:** inflow and outflow signs are swapped relative to Eqn 2 and Table 3, and it defaults sign = +1 when Δx = 0. Follow the equations and tables.
10. **Not read (egress blocked):**
    - the Stella/isee help pages
    - the arXiv preprints
    - LoopX (arXiv:1909.01138)
    - the P1 supporting-information models
    - later SDS proceedings papers, including any LTM work on stochastic or agent-based models beyond P4/P5
11. **Brief wording to fix in the SPEC:**
    - Exponential: "100% in magnitude at every step after the initial time".
    - Logistic: "the logistic fixture (single-equation deaths) shifts dominance at the first scored step with P_k + P_{k−1} > K".
    - Also: "LTM uses the 2023 flow→stock formulation (Schoenberg, Hayward & Eberlein 2023)". Without this, the logistic criterion is unattainable for a births/deaths formulation.

---

# Part SDXorg — SDXorg test-models: survey and LoopLab's supported subset

Phase 0 research for the acceptance criterion *"SDXorg test-models: every model in the supported subset reproduces its reference output within a tolerance justified in DECISIONS.md; skipped models are listed with reasons."* (docs/BRIEF.md).

| Item | Value |
|---|---|
| Upstream | <https://github.com/SDXorg/test-models> |
| Commit surveyed | `21aab02739dc5187bc9564e4d3de14e575905d2f` (2025-03-14, "Add XMILE test for case insensitive treatment of logical operators. (#93)"). `git ls-remote` on 2026-09-29 shows this is still upstream `HEAD`. |
| Local clone | `vendor/sdxorg-test-models` (gitignored via `.gitignore: vendor/`), shallow, LFS smudge skipped |
| Accessed | 2026-09-29 |
| Other sources | PySD `8b6d3890527f799e66c5a84c5228e681a53e77a6` (master, 2026-09-29): `pysd/tools/benchmarking.py`, `tests/pytest_integration/pytest_integration_xmile_pathway.py`, `pysd/py_backend/{functions,statefuls,utils}.py`. Simlin `e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc` (bpowers/simlin, 2026-09-29): `src/simlin-engine/tests/integration/{simulate.rs,test_helpers.rs}` and its `test/test-models` fork. Both were fetched read-only with git and raw.githubusercontent.com. |
| Not reachable | docs.oasis-open.org, www.oasis-open.org and iseesystems.com are blocked by the egress proxy. For XMILE semantics, see the sibling note `docs/research/xmile.md`. |

### TL;DR

- The suite has **166 leaf directories**: 60 with an XMILE-format file, 104 with Vensim `.mdl` only, and 2 with a README only. Across the 60 XMILE dirs there are **123 XMILE-format files** (67 `.xmile`, 56 `.stmx`). 39 of those `.stmx` files are byte-identical copies of the `.xmile` next to them. No `.itmx` files exist. There are **no git-LFS pointer stubs**, so the shallow clone is complete.
- **Proposed subset:**
  - **31 SUPPORTED dirs** (40 model files) need only features LoopLab already plans.
  - **3 CANDIDATE dirs** need one cheap addition each: `INIT()`, `SAFEDIV()`, or a documented Euler override.
  - **26 SKIP dirs:**
    - 14 use arrays
    - 4 use macros
    - 1 uses modules
    - 1 has no reference output
    - 2 non-negative dirs encode PySD semantics and have shared flows
    - 1 is malformed XML
    - 1 uses the XMILE `DELAY` pipeline delay
    - 1 lost a Vensim-only function (`ACTIVE INITIAL`) in conversion
    - 1 has an INT/MOD semantics conflict with the spec
- **Checked independently.** A throwaway double-precision Euler/RK4 interpreter (research only, kept in the session scratchpad, not in the repo) reproduces **all 43 SUPPORTED+CANDIDATE files**. The worst relative error is **1.23e-5**. It comes from 6-significant-digit printing and single-precision Vensim, not from semantics.
- **Recommended tolerance:** a cell passes if `|sim − ref| ≤ 1e-4·|ref| + 1e-5·max(1, max_t|ref_v|)`, with rows aligned by step index. `rtol = 1e-4` is the suite's own threshold. Measured headroom is ≥ 14× on every file. Real semantic bugs, such as RK4 instead of Euler or floor instead of trunc, fail it by 40× or more.
- **License:** MIT, "Copyright 2015 The test-models Authors". **Recommendation (KISS):** vendor the ~110 small files of the subset (about 0.4 MB) into `packages/core/test/fixtures/sdxorg/` with `LICENSE`, `AUTHORS` and a manifest. Do not fetch at test time.
- **Coverage gap:** the upstream XMILE subset gives **no meaningful coverage** of STEP, PULSE, RAMP, DELAY1, DELAY3, non-trivial SMOOTH, RK4, binding non-negativity or units. Three Vensim-only tests (`smooth`, `delays`, `input_functions`) can be hand-ported to XMILE. My interpreter reproduces them to ≤ 5e-6 relative (section 6).

---

### 1. Suite layout and provenance

- `tests/<name>/`: unit-style models (153 dirs). `samples/<name>/`: complete models (13 leaf dirs: 11 top-level plus `arrays/a2a` and `arrays/non-a2a`). `random/`: 62 MB of Vensim `RANDOM *` draws and expected moments. `random/` has no models. It accounts for about 62 of the clone's 68 MB working tree (plus 27.6 MB `.git`, so ~95 MB total).
- Each model dir holds one model concept, in one or more formats, plus a canonical output `output.csv` or `output.tab`. It usually also has a `README.md` whose contributions table names the tool and version that produced the output. Extra files such as `output_stella.csv`, `output_stella1006.csv` or `output_vensim63dss.csv` are *alternative* outputs, not the canonical one.
- **Where the XMILE files came from:**
  - Most `tests/*` `.xmile` files are **xmutil conversions of the Vensim `.mdl`** (`<vendor>Ventana Systems, xmutil</vendor>`). `xmile.bash` shows `.stmx` = `cp .xmile`.
  - `comparisons`, `eval_order`, `lookups/test_lookups_no-indirect`, `samples/SIR`, `teacup_w_diagram` and `hares_and_lynxes` are **go-xmile / xmileconv** (SDLabs) files. They use the pre-standard namespace `http://www.systemdynamics.org/XMILE`.
  - `samples/*/*.stmx` are **Stella Architect 1.4** files. `*_legacy.stmx`, `comparisons.stmx`, `eval_order.stmx` and `test_lookups_no-indirect.stmx` are **STELLA 10.0.6 pre-standard** files, with variables directly under `<model>` and no `<variables>` element.
  - The `non_negative_*` (sdCloud header), `min_max_1arg` and `pi` files were hand-written by Eneko Martin, a PySD developer. `delay_xmile` comes from Stella Architect 1.8.3.
- **Where the reference outputs came from:**
  - Mostly Vensim DSS 6.3/6.4 for Mac (single precision, 6 significant digits): SIR, teacup, abs, exp, sqrt, trig, lookups and others.
  - Stella 10.0.6 for Windows: `builtin_max/min`, `comparisons`, `eval_order`, `if_stmt`, `logicals`.
  - Vensim DSS 7.3.4 double precision: `rounding`, `zeroled_decimals`, `arithmetics_exp`, `subscripted_trig`.
  - PySD / hand-made, printed at full `repr` precision: `non_negative_*`, `delay_xmile`, `min_max_1arg`, `pi`.
  - So the canonical outputs come from different tools, with different precision and sometimes different semantics (section 5).

### 2. Inventory of XMILE-bearing directories (60)

**Status legend:**
- **SUP**: SUPPORTED.
- **CAND**: supported if the named cheap addition is accepted.
- **SKIP**: skipped, with the reason given.

"Euler" is the XMILE default when `method` is absent. All references are saved every DT (row count = (stop−start)/DT + 1, checked). No file has a `<save_step>`.

#### 2a. `samples/`

| Path | Model file(s) used | Reference | Method, DT, start–stop | Features | Status |
|---|---|---|---|---|---|
| samples/SIR | `SIR.xmile` (go-xmile), `SIR_reciprocal-dt.xmile` (`<dt reciprocal="true">32</dt>`), `SIR.stmx` (Stella 1.4). Skip file: `SIR_legacy.stmx` (STELLA 10 pre-standard) | output.csv (Vensim 6.3 Mac, 3201 rows, CR line ends) | Euler, 1/32, 0–100 | 3 stocks, 2 flows, 3 aux; units (days vs time units "Time", inconsistent) | **SUP** |
| samples/teacup | `teacup.xmile` (hand-coded XMILE 1.0, quoted names in eqns), `teacup_w_diagram.xmile` (go-xmile), `teacup.stmx` (Stella 1.4). Skip file: `teacup_legacy.stmx` | output.csv (Vensim 6.3 Mac, 241 rows) | Euler, 0.125, 0–30 | 1 stock, 1 flow, 2 aux; `non_negative` on stock and flow (never binds); units inconsistent (deg/time vs minutes) | **SUP** |
| samples/arrays/a2a | `a2a.stmx` | none | Euler, 1/4, 1–13 | apply-to-all arrays | **SKIP**: arrays; no reference output |
| samples/arrays/non-a2a | `non-a2a.stmx`, `non-a2a-gf.stmx` | none | Euler, 1/4, 1–13 | non-a2a arrays, gf | **SKIP**: arrays; no reference output |
| samples/bpowers-hares_and_lynxes_modules | `model.xmile` (go-xmile), `model.stmx`, `model_legacy.stmx` | output.csv (headers `hares.hares`, time column `time`) | Euler, 0.5, 0–12 | 3 models (modules + `<connect>`), gf with both xscale and xpts, PULSE, non_negative | **SKIP**: modules/submodels |
| samples/display | `1style.stmx`, `multipoint-connection.stmx` | none | Euler, 1/4, 1–13 | display/styling fixtures; empty equations | **SKIP**: no reference output (diagram-only) |

#### 2b. `tests/`

| Path | Model file(s) used | Reference | Method, DT, start–stop | Features | Status |
|---|---|---|---|---|---|
| tests/abs | test_abs.xmile | output.csv | Euler, 1, 0–20 | ABS, 1 stock | **SUP** |
| tests/active_initial | test_active_initial.xmile | output.tab | Euler, 1, 0–10 | xmutil dropped Vensim `ACTIVE INITIAL`: XMILE stock init = Time → 0, but the reference has 45 | **SKIP**: Vensim-only function lost in conversion (PySD also xfails this) |
| tests/arithmetics_exp | test_arithmetics_exp.xmile | output.tab (blank cells) | RK4, 0.1, 1–10 | every var dimensioned (9 elements); + − * / ^ precedence | **SKIP**: arrays (it is still evidence that `^` is right-associative) |
| tests/builtin_max | builtin_max.xmile | output.csv (Stella 10) | Euler, 1, 0–10 | MAX(Time,5) | **SUP** |
| tests/builtin_min | builtin_min.xmile | output.csv (Stella 10) | Euler, 1, 0–10 | MIN(Time,5) | **SUP** |
| tests/chained_initialization | test_chained_initialization.xmile | output.tab | Euler, 1, 0–10 | stock init computed from other stocks | **SUP** |
| tests/comparisons | comparisons.xmile (go-xmile). Skip file: `.stmx` (pre-standard) | output.csv (Stella 10) | Euler, 1, 0–10 | `< <= > >= = <>` on TIME | **SUP** |
| tests/constant_expressions | test_constant_expressions.xmile | output.tab | Euler, 1, 0–1 | 10/3 | **SUP** |
| tests/delay_xmile | test_delay_xmile.xmile (Stella 1.8.3) | output.tab (full precision) | Euler, 1, 1–13 | XMILE `DELAY(x, τ[, init])` (fixed/pipeline delay), non_negative | **SKIP**: DELAY (pipeline) is not a LoopLab builtin |
| tests/eval_order | eval_order.xmile (go-xmile). Skip file: `.stmx` (pre-standard) | output.csv (Stella 10) | Euler, 1, 0–1 | `4 - 5 + 6` (left-associative) | **SUP** |
| tests/exp | test_exp.xmile | output.csv | Euler, 1, 0–100 | EXP | **SUP** |
| tests/exponentiation | exponentiation.xmile | output.tab | Euler, 1, 0–4 | `^`, `-2^2 = -4`, IF | **SUP** |
| tests/function_capitalization | test_function_capitalization.xmile | output.tab | Euler, 1, 0–20 | ABS (xmutil already normalised the case) | **SUP** |
| tests/game | test_game.xmile | output.tab | Euler, 1, 0–100 | Vensim GAME stripped to a constant | **SUP** |
| tests/if_stmt | if_stmt.xmile | output.csv (Stella 10) | Euler, 0.25, 0–12 | IF THEN ELSE | **SUP** |
| tests/initial_function | test_initial.xmile | output.csv | Euler, 1, 0–10 | `INIT(x)` | **CAND**: add XMILE `INIT` (trivial). Otherwise SKIP "uses INIT" |
| tests/limits | test_limits.xmile | output.tab | Euler, 1, 0–50 | basic stock | **SUP** |
| tests/line_breaks | test_line_breaks.xmile | output.tab | Euler, 1, 0–1 | basic | **SUP** |
| tests/line_continuation | test_line_continuation.xmile | output.tab | Euler, 1, 0–1 | names over 200 characters | **SUP** |
| tests/ln | test_ln.xmile | output.tab | Euler, 1, 0–20 | LN | **SUP** |
| tests/log | test_log.xmile | output.tab | Euler, 1, 0–1 | `LN(x)/LN(b)` | **SUP** |
| tests/logicals | test_logicals.xmile, test_logicals_caseinsensitive.xmile. Skip file: `.stmx` (broken eqn `IF false_input not THEN`) | output.csv (Stella 10) | Euler, 1, 0–1 | AND/OR/NOT, mixed case (`AnD`, `NoT`) | **SUP** |
| tests/lookups | test_lookups.xmile, _xpts_sep, _ypts_sep, _xscale, _no-indirect (go-xmile). Skip files: `.stmx` variants | output.tab (`1.05E-15`) | Euler, 0.25, 0–45 | standalone `<gf name>` called as `name(Time)`; aux with inline gf; `sep=";"`; `<xscale>`+ypts | **SUP** |
| tests/lookups_inline | test_lookups_inline.xmile | output.tab | Euler, 5, 0–100 | aux with inline gf on TIME | **SUP** |
| tests/macro_expression | test_macro_expression.xmile | output.tab | Euler, 1, 0–1 | macros. The upstream XMILE calls `EXPRESSION MACRO(...)` but has **no `<macro>` definition** | **SKIP**: macros |
| tests/macro_multi_expression | same pattern | output.tab | Euler, 1, 0–1 | macros | **SKIP**: macros |
| tests/macro_multi_macros | same pattern | output.tab | Euler, 1, 0–1 | macros | **SKIP**: macros |
| tests/macro_stock | same pattern | output.tab | Euler, 1, 0–10 | macros | **SKIP**: macros |
| tests/min_max_1arg | test_min_max_1arg.xmile | output.tab | RK4, 1, 0–1 | array-reducing MIN/MAX | **SKIP**: arrays |
| tests/model_doc | model_doc.xmile | output.tab | Euler, 1, 0–1 | documentation fields | **SUP** |
| tests/non_negative_all | test_non_negative_all1.xmile, …all2.xmile | output.tab (PySD) | Euler, 1, 0–50 | file-level `<behavior>` non_negative; **one flow is the outflow of two stocks**; PySD clip semantics | **SKIP**: see section 5.4 |
| tests/non_negative_flows | test_non_negative_flows*.xmile | output.tab | Euler, 1, 0–50 | **malformed XML** (missing `</flow>`) | **SKIP**: malformed |
| tests/non_negative_stocks | test_non_negative_stocks*.xmile | output.tab (PySD) | Euler, 1.5, 0–60 | per-stock `<non_negative>true/false</non_negative>`, shared flows, negative inflow clipped | **SKIP**: see section 5.4 |
| tests/number_handling | test_number_handling.xmile | output.csv | Euler, 1, 0–1 | 3/4 = 0.75 equality | **SUP** |
| tests/parentheses | test_parens.xmile | output.tab | Euler, 1, 0–1 | parentheses | **SUP** |
| tests/pi | test_pi.xmile | output.tab (full precision) | Euler, 1, 0–1 | `PI()` written as a call, SIN, COS | **SUP** |
| tests/reference_capitalization | test_reference_capitalization.xmile | output.tab | Euler, 1, 0–1 | case-insensitive references | **SUP** |
| tests/rounding | test_rounding.xmile | output.tab (Vensim 7.3.4, blank cells) | RK4, 1, 0–200 (no stocks) | `INT`, `mod` | **SKIP**: reference uses Vensim truncating `INTEGER` and sign-of-dividend `MODULO`. XMILE says INT = floor and MOD = floored (section 5.2). Simlin also disables this test. |
| tests/smooth_and_stock | test_smooth_and_stock.xmile | output.tab (3 reference-only columns) | Euler, 0.25, 0–45 | SMTH1, SMTH3 on a constant input | **SUP** (weak SMOOTH coverage) |
| tests/special_characters_xmile | test_special_variable_names.xmile. Skip file: `.stmx` (unquoted names) | output.tab | Euler, 1, 0–100 | quoted names with `$ ! @ \| ( ) / , * ^ + -`, literal `\n` in a name, quoted `<inflow>` | **SUP** |
| tests/sqrt | test_sqrt.xmile | output.csv | Euler, 1, 0–20 | SQRT | **SUP** |
| tests/subscript_1d_arrays | …xmile | output.csv | Euler, 1, 0–100 | arrays | **SKIP**: arrays |
| tests/subscript_constant_call | …xmile | output.tab | Euler, 1, 0–3 | arrays | **SKIP**: arrays |
| tests/subscript_individually_defined_1d_arrays | …xmile | output.csv | Euler, 1, 0–100 | arrays | **SKIP**: arrays |
| tests/subscript_mixed_assembly | …xmile | output.tab | Euler, 1, 0–3 | arrays | **SKIP**: arrays |
| tests/subscript_multiples | …xmile | output.tab | Euler, 1, 0–100 | arrays | **SKIP**: arrays |
| tests/subscript_subranges | …xmile | output.tab | Euler, 1, 0–100 | arrays | **SKIP**: arrays |
| tests/subscript_subranges_equal | …xmile | output.tab | Euler, 1, 0–100 | arrays | **SKIP**: arrays |
| tests/subscript_updimensioning | …xmile | output.tab (quoted headers) | Euler, 1, 0–2 | arrays | **SKIP**: arrays |
| tests/subscripted_flows | …xmile | output.tab | Euler, 1, 0–100 | arrays | **SKIP**: arrays |
| tests/subscripted_trig | …xmile | output.tab | RK4, 1, 0–10 | arrays + ARCSIN/COSH/SINH/TANH | **SKIP**: arrays |
| tests/trig | test_trig.xmile | output.csv | Euler, 0.125, 0–20 | SIN COS TAN ARCSIN ARCCOS ARCTAN | **SUP** (needs TAN and ARC* in the "basic math" set) |
| tests/xidz_zidz | xidz_zidz.xmile | output.tab | Euler, 1, 0–1 | `SAFEDIV(a,b)` and `SAFEDIV(a,b,x)` | **CAND**: add XMILE `SAFEDIV` (trivial) |
| tests/zeroled_decimals | test_zeroled_decimals.xmile | output.tab (blank cells) | **declares RK4, but the reference is Euler**; 1, 0–10 | `.34`, `+.72`, `3e-05`; stocks list `<aux>` variables as inflows/outflows | **CAND**: needs a manifest override `method: euler` (section 5.3) and an importer that accepts an aux used as a flow |

**Model files to run** (40 SUP + 3 CAND = 43):
- every `.xmile` in the SUP/CAND dirs;
- plus `samples/SIR/SIR.stmx` and `samples/teacup/teacup.stmx`, which are real Stella Architect files.

Do **not** run:
- the 39 `.stmx` copies that are identical to their `.xmile`;
- the pre-standard STELLA 10 `.stmx` files;
- the broken `logicals/test_logicals.stmx`.

The 104 `.mdl`-only dirs are out of scope (reason "no XMILE file"). The 2 README-only dirs (`subscript_exceptions`, `subscripted_eqns`) have no model at all.

`random/` holds statistical moments for Vensim `RANDOM UNIFORM/NORMAL/EXPONENTIAL` (min/max/shift/stretch signatures, 5e5 draws). It has no XMILE models and uses Vensim-only function signatures, so it is out of scope. It could at most inspire a moments-based test for LoopLab's own Monte Carlo/LHS samplers.

### 3. Reference output format

- **File choice:** `output.csv`, otherwise `output.tab`. PySD, the suite's `regression-test.py` and Simlin all use that order. Among the 57 XMILE dirs that have a reference, 17 use `.csv` and 40 use `.tab`. `samples/arrays/*` and `samples/display` have none.
- **Shape:** one row per saved time, first column is time, one column per variable.
- **Delimiter:** `,` for `.csv`, TAB for `.tab`. Pick it **by file extension** (or by TAB in the header). Do not pick it by comma in the header: `special_characters_xmile/output.tab` has commas inside a column name, and the suite's own `compare.py` gets this wrong (section 4.1). Use an RFC 4180 CSV reader; `subscript_updimensioning` (skipped) quotes `"Two Dims[A,D]"`.
- **Line endings are mixed:**
  - CR-only (classic Mac): 35 of 57 files, including SIR, abs, exp, lookups, trig and smooth_and_stock;
  - CRLF: 4 files;
  - LF: 18 files.
  - Split on `/\r\n|\r|\n/` and drop empty lines. There is no BOM, and the files are ASCII/UTF-8.
- **Time column:**
  - `Time` in every SUP/CAND file.
  - `time` in the hares sample.
  - Stella's non-canonical `output_stella*.csv` files name it after the time unit (`Months`).
  - Take the first column as time, whatever its name.
- **Variable naming:**
  - Headers use the source tool's display names, for example `Teacup Temperature`, while the XMILE name may be `teacup_temperature`.
  - Match by canonicalising both sides: lowercase; replace a literal `\n` with a space; collapse runs of whitespace and `_` to a single `_`; strip surrounding quotes.
  - Example: the XMILE name `Stock with \n Newline Character` appears in the header as `Stock with   Newline Character`.
  - Array elements `v[a]` / `"v[a,b]"` and module paths `module.var` occur only in skipped dirs.
- **Which variables are included:**
  - Vensim exports: every variable, *plus* the control variables `INITIAL TIME`, `FINAL TIME`, `TIME STEP`, `SAVEPER`. xmutil XMILE files also define these as ordinary `<aux>` variables.
  - Stella and go exports: every model variable.
  - PySD-made files: control variables plus all variables.
  - The reference can contain variables that are **absent from the XMILE**. `smooth_and_stock` has `Input`, `Smoothed Input` and `Smoothing Time` from the richer `.mdl`.
  - The XMILE can lack control-variable columns (go-xmile files).
- **Blank cells:** Vensim 7.x exports print constants only in the first row. This affects `rounding` and `zeroled_decimals` (CAND), and among skipped dirs `arithmetics_exp`, `subscripted_trig` and `subscript_mixed_assembly`. Skip blank cells, or forward-fill them as PySD's `_remove_constant_nan` does.
- **Precision:**
  - Vensim 6.x/7.x and Stella 10 print about **6 significant digits** (`3.33333`, `999.953`, `0.00673795`).
  - Even the time column is rounded (`10.0312` for t = 10.03125 at DT = 1/32). **Align rows by step index `round((t − start)/DT)`, not by exact time equality.**
  - The Stella-10-era files of `builtin_max/min`, `comparisons`, `eval_order`, `if_stmt` and `logicals` print time as `0.000`.
  - PySD/hand-made files print full `repr` (`3.141592653589793`, `2.0000000000000018`).
  - Exponent forms include `1.05E-15`, `3e-05`, `-2.52e-06` and `-1e+30`.
- **git-LFS:** there is no `.gitattributes`. A scan of every file for `version https://git-lfs.github.com/spec` found **0 pointer stubs**, so every needed file is present in the clone.

### 4. Tolerances used elsewhere, measured errors, and the recommendation

#### 4.1 The suite's own scripts (`compare.py`, `regression-test.py`)

- Both use `isclose(ref, sim, rel_tol=1e-4)` in "weak" mode, which scales by the larger of |a| and |b|.
- Both pass a cell as near-zero when `|ref| ≤ 1e-6` (`regression-test.py`: `3e-6`) **and** `|sim| ≤ 1e-6`.
- Header names are lowercased and spaces become `_`.
- They ignore `saveper, initial_time, final_time, time_step` (and `regression-test.py` also ignores `time`, `months` and spaced variants).
- **Known bugs:**
  - A column missing from the simulation hits `break` without setting the error flag, so it silently passes.
  - `float('')` crashes on Vensim blank cells.
  - `compare.py` picks `,` whenever the header contains a comma.
  - LoopLab should not reuse these scripts. It should reuse only the 1e-4 threshold.

#### 4.2 PySD

- `assert_allclose`: `|x − y| ≤ atol + rtol·|y|` with **defaults `rtol = 1e-5`, `atol = 1e-5`**, overridable per test (`pysd/tools/benchmarking.py`).
- It requires **identical column sets** and **identical time indices**, and forward-fills Vensim constant columns.
- Its XMILE integration list xfails:
  - `active_initial`;
  - `lookups_no-indirect`;
  - the 4 `macro_*` tests;
  - `smooth_and_stock` (the extra reference columns);
  - 8 `subscript_*` tests ("eqn with ??? in the model").
- It passes `rounding` and `non_negative_*` because those references encode PySD's own semantics (section 5).

#### 4.3 Simlin

- Absolute epsilon **2e-3**. For Vensim VDF references it is relative 5e-6, floored at 2e-3.
- Near-zero guard: `|exp| ≤ 3e-6 && |act| ≤ 1e-6`.
- It ignores the 4 control columns and panics on any other expected variable missing from the output (`test_helpers.rs::ensure_results_excluding`).
- It disables `rounding` and `special_characters` (Vensim) as failing.
- It runs a **modified fork** of test-models (for example, its macro `.xmile` files do contain `<macro>` elements, and it adds XMILE ports of `delays`, `input_functions`, `time` and `builtin_int`). Its pass list is therefore not directly comparable to upstream.

#### 4.4 Measured with an independent reference interpreter

I wrote a ~350-line throwaway Python interpreter to separate "the reference is reproducible" from "LoopLab has a bug". It lives in the scratchpad and is not committed. Its semantics:
- double precision;
- Euler and classic RK4;
- `TIME = start + n·DT`;
- SMTH/DELAY as stock chains (τ/3 per stage for 3rd order);
- continuous gf with endpoint clamping;
- STEP / RAMP / PULSE per `docs/research/xmile.md`;
- the name canonicalisation from section 3.

Results on the 43 SUP+CAND files. The CAND files used INIT, SAFEDIV and the zeroled Euler override. Rows are aligned by step index; cells compared are the intersection of canonical names; blank cells are skipped.

| Metric | Value |
|---|---|
| Files reproduced | **43 / 43**; row counts equal in every case |
| Worst relative error | 1.23e-5 (`trig`: `test arccos` = 0.0331849 vs 0.0331853, from 6-digit printing plus Vensim single precision) |
| Worst absolute error | 4e-3 on `sqrt` FlowA = 1048.58 (printing, 3.8e-6 relative) |
| Worst near-zero cell | `exp` StockA at t = 50: reference −2.52e-6, exact value 0 (single-precision accumulation of 0.1 × 50) |
| SIR (3201 rows × 8 vars) | max relative 6.75e-6 |
| teacup | max relative 4.85e-6 |
| Suite rule (rtol 1e-4 + near-zero) | 0 failures |
| PySD default (1e-5 / 1e-5) | 0 failures |
| Simlin (abs 2e-3) | 2 cells fail (`sqrt` values near 1048, a 4e-3 printing error). An absolute-only rule is unsuitable for large magnitudes. |

**Sensitivity:** a wrong semantic choice shows up far above print noise.

| Wrong choice | Result |
|---|---|
| teacup run with RK4 instead of Euler | fails 477/964 cells; max relative 1.9e-2 |
| SIR run with RK4 instead of Euler | fails 14,678/25,608 cells; max relative 4.3e-3 |
| `zeroled_decimals` run as declared (RK4) | max relative 0.74 |
| `rounding` with floor INT / floored MOD | 187/603 cells off by up to 3 |

#### 4.5 Recommendation for DECISIONS.md

For each compared reference column v and each saved row k, pass if:

```
|sim_v(k) − ref_v(k)| ≤ rtol·|ref_v(k)| + atol·max(1, max_k |ref_v(k)|)
rtol = 1e-4,  atol = 1e-5
```

Justification:
1. **rtol = 1e-4 is the suite's own threshold** (`compare.py` / `regression-test.py`).
2. **References are printed to about 6 significant digits.** Rounding alone gives up to 5e-6 relative error, and old single-precision Vensim adds more. The measured worst case from a correct implementation is 1.23e-5, so 1e-4 leaves about **8× headroom** on relative error.
3. **It is 10× tighter than 1e-3.** SIR run with the wrong integrator differs by only 4.3e-3 relative, which 1e-3 would largely wave through.
4. **The atol term is scaled to each column's own magnitude** rather than being a fixed absolute. It absorbs accumulation noise on quantities that should be 0 (for example `−2.52e-6` in a column whose magnitude is 5; worst measured ratio err/allowed is 0.071) without hiding errors in small-valued variables.
   - An absolute-only rule such as Simlin's 2e-3 fails on large magnitudes.
   - A fixed `atol = 1e-6` passes but leaves only 2× headroom on `exp`.
5. **NaN matches NaN.** Blank reference cells are skipped.

Overall, the worst err/allowed ratio across all 43 files is 0.071, which is ≥ 14× headroom.

**Row alignment:**
- `k = round((t_ref − start)/DT)`;
- require equal row counts;
- require `|t_ref − (start + k·DT)| ≤ 1e-4·max(1, |t|)`.

**Column rules:**
- Compare the intersection of canonical names.
- Reference-only columns may appear only if they are control variables (`initial_time`, `final_time`, `time_step`, `saveper`) or are listed in the manifest (`smooth_and_stock`: `input`, `smoothed_input`, `smoothing_time`).
- **Every model stock must be matched**, so a comparison cannot pass vacuously.
- Units are advisory. Unit warnings must not fail an SDXorg run: SIR and teacup declare inconsistent units, and the xmutil files use `Month` vs `Months`.

### 5. Semantic and format gotchas found in the files

#### 5.1 Importer (XMILE parsing)

1. **Undeclared `isee:` prefix.** 47 xmutil `.xmile` files in 43 dirs use `<isee:prefs>` and similar without `xmlns:isee`. A namespace-aware parser such as the browser's `DOMParser` rejects them with "unbound prefix". Inject the declaration, or use a non-namespace-validating parser, and match on local names.
2. **Two namespaces.**
   - Current: `http://docs.oasis-open.org/xmile/ns/XMILE/v1.0`.
   - Pre-standard (go-xmile, and the SIR/teacup/comparisons/eval_order/lookups-no-indirect files): `http://www.systemdynamics.org/XMILE`.
   - Accept both. Pre-standard STELLA 10 files (no `<variables>` wrapper) are out of scope.
3. **Malformed XML:** `non_negative_flows/*.xmile`. Report it as skipped, with the parse error.
4. **Names:**
   - case-insensitive;
   - space ≡ underscore;
   - literal `\n` inside `name=""`;
   - quoted identifiers in `<eqn>`, and **also in `<inflow>`/`<outflow>`** (special_characters_xmile);
   - special characters `$ ! @ | ( ) / , * ^ + -`;
   - names longer than 200 characters.
5. **Control variables as auxes.** xmutil files define `TIME STEP`, `INITIAL TIME`, `FINAL TIME` and `SAVEPER` as ordinary auxes next to `<sim_specs>`. `<sim_specs>` is authoritative, and these auxes are just variables. Do not confuse `time_step` with the builtin `DT`.
6. **`<dt reciprocal="true">32</dt>`** means DT = 1/32.
7. **Graphical functions:**
   - standalone `<gf name="…">` invoked as `name(x)` (Stella 10 rejects this idiom, per the lookups README);
   - aux with an embedded `<gf>` applied to its `<eqn>` (including a constant input `0`);
   - `<xpts sep=";">` / `<ypts sep=";">`;
   - `<xscale min max>` with ypts only (evenly spaced);
   - `discrete="false"`;
   - both xscale and xpts present (hares, skipped): prefer xpts.
8. **`<non_negative>` values:** the element may be empty or carry text (`true`, `false`, ` TruE  `, `FALSE  `). Trim and compare case-insensitively.
9. **`<behavior>` cascade:** file-level `<behavior><non_negative/></behavior>` or `<behavior><stock|flow><non_negative/></…></behavior>`.
10. **An aux used as a flow:** stocks may list `<aux>` variables in `<inflow>`/`<outflow>` (zeroled_decimals). Promote them to flows on import.
11. **Numbers:** leading-dot decimals `.34` and `+.72`; `3e-05`.
12. **PI** appears as a call, `PI()`.
13. **Logical keywords are case-insensitive** (`AnD`, `oR`, `NoT`), and `IF … THEN … ELSE` is wrapped in parentheses.

#### 5.2 Engine semantics encoded by references

- **Operator precedence:** `-2^2 = -4` (`exponentiation`), because `^` binds tighter than unary minus. `^` is right-associative (`arithmetics_exp`: `30^1.2^1.2 = 68.92 = 30^(1.2^1.2)`). This matches the XMILE §3.3.1 precedence reported in `docs/research/xmile.md`.
- **INT and MOD (`rounding`):**
  - The reference uses **truncation** (`INT(-9.9) = -9`) and **sign-of-dividend modulo** (`-10 mod 3 = -1`). PySD maps XMILE `INT` to Vensim `integer()` (`int(x)`) and `MOD` to Vensim `modulo()`.
  - XMILE (per xmile.md, spec footnote 7) requires **floor** INT and **floored** MOD (−10 INT → floor; −10 mod 3 = 2).
  - LoopLab should follow the spec and skip `rounding`, recording the reason.
- **Comparisons and logicals** return 1/0. `=` is exact equality (`number_handling`: 3/4 = 0.75).
- **Stock initialisation:** stocks can be initialised from other stocks (`chained_initialization`), evaluated once at start.
- **INIT(x)** returns x's value at the start (`initial_function`). **SAFEDIV(a,b[,x])** returns 0 (or x) when b = 0 (`xidz_zidz`).
- **SMTH1/SMTH3** start at the input's initial value (`smooth_and_stock`, where the input is constant).

#### 5.3 Declared method vs reference method

`zeroled_decimals.xmile` (a Vensim XMILE export) declares `method="RK4"`, but its reference comes from running the `.mdl` in Vensim with Euler.

- The difference is visible: the outflow `flow7 = Time` integrates to 0.5 per unit step under RK4, but to 0 at t = 1 under Euler.
- With Euler the reference is matched to 4e-15.
- Handle this through an explicit, logged per-fixture override in the manifest. Otherwise SKIP it with the reason "reference produced with Euler; file declares RK4".
- `rounding.xmile` also declares RK4, but has no stocks, so the method is irrelevant there.
- **No SUP file really exercises RK4.** RK4 correctness must come from the brief's analytic tests.

#### 5.4 Non-negative stocks

The `non_negative_all` and `non_negative_stocks` references were made by PySD (`NonNegativeInteg.update: state = max(state, 0)`):
- the **stock is clipped after the update**;
- the **reported flow is not reduced** (`OutFlow` stays 28 while `TestStock0` sits at 0);
- a negative **inflow** is clipped too (`TestStock3`).

Both models also make **one flow the outflow of two stocks** (`OutFlow` drains TestStock0 and TestStock1; `if_else` drains TestStock2 and TestStock3). A one-source/one-sink flow schema cannot represent that.

- My interpreter reproduces these 4 files only with clip semantics. Outflow limiting fails `non_negative_stocks` by up to 37.25.
- `docs/research/xmile.md` recommends spec-intent outflow limiting, which conserves material. Under that choice, these dirs are rightly SKIPPED.
- The non_negative flag therefore has **no SDXorg coverage**. LoopLab needs its own non-negative fixtures.
- The only XMILE-bearing SUP files that carry `non_negative` (teacup) never make it bind.

#### 5.5 Other semantic notes

- **Save interval:** every XMILE-bearing reference is saved at every DT. The only SAVEPER ≠ DT test (`euler_step_vs_saveper`, SAVEPER = 1, DT = 1/32) is `.mdl`-only and out of scope.
- **ACTIVE INITIAL:** `active_initial.xmile` is not equivalent to its `output.tab` (45 vs 0 at t = 0). `output_stella.csv` matches the XMILE, but it is not the canonical file.
- **Vensim PULSE:** Vensim `PULSE(start, width)` (1 for `width` time units) differs from XMILE `PULSE(magnitude, first[, interval])` (magnitude/DT for one DT). There is no upstream XMILE PULSE test; the only XMILE PULSE is in the skipped hares module sample. See `docs/research/xmile.md`.

### 6. Coverage gaps and an optional supplement

**What the SUP/CAND set exercises:**
- builtins: ABS, EXP, LN, SQRT, SIN, COS, TAN, ARCSIN, ARCCOS, ARCTAN, MIN/MAX (2-arg), IF THEN ELSE, AND/OR/NOT, comparisons, `^`, PI, gf (standalone and inline), SMTH1/SMTH3 (constant input only), TIME;
- plus INIT and SAFEDIV if the CAND dirs are accepted.

**What it does not exercise:**
- STEP, PULSE, RAMP, DELAY1, DELAY3;
- time-varying SMOOTH;
- LOG10, INT, DT, STARTTIME, STOPTIME;
- RK4;
- binding non-negativity;
- units.

**Optional, recommended supplement: "SDXorg-derived, hand-ported" fixtures.** These are three MIT `.mdl` tests whose Vensim references my interpreter reproduces after straightforward hand-porting to XMILE. They should be listed separately from the upstream subset count.

| Upstream dir | Ported columns | Mapping | Result |
|---|---|---|---|
| tests/smooth (DT 0.25, 0–20) | Smooth, SmoothI, Smooth3, Smooth3I; Adjustment Time = `2+STEP(2,10)` (time-varying τ) | SMOOTH→SMTH1, SMOOTH3→SMTH3, the `I` variants take the 3rd init argument. Drop `SMOOTH N`. | max relative 3.6e-6 |
| tests/delays (DT 1, 0–100) | Delay1, Delay1I, Delay3, Delay3I; Delay Time = `4+STEP(2,15)` | DELAY1I/DELAY3I → DELAY1/DELAY3 with an init argument. Drop `DELAY N`. | max relative 4.5e-6 |
| tests/input_functions (DT 0.0625, 0–25) | Test Step `STEP(1,1)`, Test Ramp `RAMP(1,14,17)`, Test Pulse (Vensim `PULSE(3,2)`) | Vensim pulse → `IF TIME >= 3 AND TIME < 5 …` (not XMILE PULSE). Drop `PULSE TRAIN`. | exact |

Simlin's fork already contains xmutil ports (`tests/{delays,input_functions,time}/*.xmile`). They are MIT test-models files inside an Apache-2.0 repo. They are a useful cross-check, but their `pulse(DT, 3, 2)` translation of Vensim `PULSE(3,2)` needs care.

### 7. License and vendoring recommendation

- **License:** MIT, "Copyright 2015 The test-models Authors" (`LICENSE`); the authors are in `AUTHORS`. Copying a subset into our repo as test fixtures is permitted, provided the copyright and permission notice go with it.
- **Size:**
  - the clone is ~95 MB: a 68 MB working tree, of which 62 MB is `random/*.tab`, plus a 27.6 MB `.git`;
  - the SUP+CAND subset is **111 files and about 0.4 MB**: each dir's `.xmile`, the 2 Stella `.stmx`, `output.*` and `README.md`, plus `LICENSE` and `AUTHORS`;
  - `samples/SIR/output.csv` is the largest file at 186 KB.

**KISS recommendation: vendor, do not fetch.**
1. Copy the subset into `packages/core/test/fixtures/sdxorg/`, keeping upstream relative paths (`tests/abs/test_abs.xmile`, `tests/abs/output.csv`, and so on). Add `LICENSE`, `AUTHORS` and a `SOURCE.md` giving the upstream URL, commit `21aab02739dc5187bc9564e4d3de14e575905d2f` and the copy date. Leave out screenshots, `.mdl` files, alternative outputs and `random/`.
2. Add a `manifest.json` with one entry per upstream XMILE dir, recording:
   - `path` and `status` (supported / candidate / skip);
   - `files`, `reference` and `reason`;
   - optional `overrides` (for example `{ "method": "euler" }` for zeroled_decimals) and `refOnlyColumns`.

   The test runner reads it, runs the supported entries, and **prints every skip with its reason**, which satisfies the "skipped models are listed with reasons" clause. Skip entries need no vendored files, only their upstream paths.
3. **Do not fetch at test time.**
   - Tests must be offline and deterministic.
   - The brief limits network use to research and installs.
   - The upstream repo is dormant (last commit 2025-03), so drift is not a concern.
   - Keep `vendor/sdxorg-test-models` gitignored as a research clone only.
   - An optional dev-only `scripts/refresh-sdxorg` could re-copy from a pinned commit, but it is not needed.
4. The hand-ported fixtures from section 6 (if adopted) go under `fixtures/sdxorg-derived/`, with a header comment naming the upstream `.mdl` they came from and the MIT notice.

### 8. Counts

| Bucket | Dirs | Model files |
|---|---:|---:|
| XMILE-bearing dirs, total | **60** | 123 XMILE-format files (67 `.xmile` + 56 `.stmx`) |
| SUPPORTED | **31** | 40 (38 `.xmile` + `SIR.stmx` + `teacup.stmx`) |
| CANDIDATE (INIT / SAFEDIV / Euler override) | **3** | 3 |
| SKIP: arrays/subscripts | 14 | a2a, non-a2a, arithmetics_exp, min_max_1arg, subscript_1d_arrays, subscript_constant_call, subscript_individually_defined_1d_arrays, subscript_mixed_assembly, subscript_multiples, subscript_subranges, subscript_subranges_equal, subscript_updimensioning, subscripted_flows, subscripted_trig |
| SKIP: macros (XMILE also lacks the `<macro>` definition) | 4 | macro_expression, macro_multi_expression, macro_multi_macros, macro_stock |
| SKIP: modules/submodels | 1 | bpowers-hares_and_lynxes_modules |
| SKIP: no reference output (display fixtures) | 1 | samples/display |
| SKIP: non-negative with PySD clip semantics and shared flows | 2 | non_negative_all, non_negative_stocks |
| SKIP: malformed XML | 1 | non_negative_flows |
| SKIP: XMILE DELAY (pipeline) not supported | 1 | delay_xmile |
| SKIP: Vensim-only function lost in conversion (ACTIVE INITIAL) | 1 | active_initial |
| SKIP: INT/MOD semantics conflict with the spec (Vensim trunc/fmod) | 1 | rounding |
| **SKIP total** | **26** | |
| Out of scope: `.mdl`-only dirs ("no XMILE file") | 104 | |
| Out of scope: README-only dirs | 2 | |
| Out of scope: random-number data sets (Vensim RANDOM *, no models) | 3 | |

If the CAND additions are rejected, the counts become 31 SUPPORTED and 29 SKIP:
- initial_function: "uses INIT";
- xidz_zidz: "uses SAFEDIV";
- zeroled_decimals: "reference produced with Euler; file declares RK4".

### 9. Method and limitations

- **Inventory:** I read the README, LICENSE, AUTHORS, `compare.py`, `regression-test.py`, `xmile.bash` and every test README contributions table. I parsed all 123 XMILE-format files with Python ElementTree, injecting `xmlns:isee` where it was missing, and extracted `sim_specs`, variable kinds, gf, `non_negative`, dimensions, modules, macros and the function names in `<eqn>`. I checked every reference file for delimiter, line endings, headers, row counts, blank cells and LFS pointers.
- **Reproduction:** the throwaway interpreter in section 4.4 lived in the session scratchpad. It is research evidence only, not a LoopLab component, and no product code was written. Its numbers show what a *correct* double-precision implementation achieves against these references. LoopLab's own harness must re-measure with the real engine.
- **Unverified:** I could not read the OASIS spec directly because the proxy blocks it. Statements about XMILE INT/MOD, precedence and non-negative intent rely on `docs/research/xmile.md` and on the behaviour of PySD and Simlin.

---
