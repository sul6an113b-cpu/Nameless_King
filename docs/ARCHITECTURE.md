# Architecture (as built)

The design contract is `docs/SPEC.md`; this file maps what exists in the repository and is updated at each checkpoint.

## Workspaces

| Workspace | Path | Runs in | Entry |
|---|---|---|---|
| `@looplab/core` | `packages/core` | browser, Web Workers, Node, Vitest | `src/index.ts` (TypeScript source) |
| `@looplab/content` | `packages/content` | same as core | `src/index.ts` |
| `@looplab/server` | `apps/server` | Node (built-in type stripping) | `src/main.ts` |
| `@looplab/web` | `apps/web` | browser (Vite) | `src/main.tsx` |

## packages/core/src

| Folder / file | Status | Owner |
|---|---|---|
| `schema/` — Zod model (`model.ts`), names, patch, migrations, factory | implemented, tested | orchestrator |
| `model/` — immutable ops, CLD/SFD projections | implemented, tested (incl. property test) | orchestrator |
| `contracts.ts` — cross-module TypeScript interfaces (SPEC §6) | implemented | orchestrator |
| `stub.ts` — `notImplemented()` for not-yet-delivered functions | scaffold | orchestrator |
| `parser/`, `units/`, `sim/` | stubs (Phase 2) | sd-engine |
| `graph/` | stubs (Phase 2) | graph-analyst |
| `protocol/` | types + stubs (Phase 2) | copilot |
| `analysis/` | stubs (Phase 3) | analysis |
| `xmile/`, `report/` | stubs (Phase 3) | interop |

## Runtime

- `npm run dev`: Vite on 127.0.0.1:5173 (proxies `/api` with `changeOrigin`) + `node --watch apps/server/src/main.ts` on 127.0.0.1:8787.
- `npm start`: one Node process on 127.0.0.1:8787 serving `apps/web/dist` and `/api`.
- The server rejects requests whose `Host` is not `127.0.0.1|localhost:<port>` (DNS rebinding) or whose `Origin` is not allowed (CSRF), then applies CORS.
- `.env` is loaded in code (`apps/server/src/env.ts`, `process.loadEnvFile`) and never printed.

## Tests

- Vitest projects: `core`, `content`, `server`, `web` (jsdom + React Flow stubs + fake-indexeddb), `repo` (`tests/**`).
- Playwright projects: `app` (`apps/web/e2e`, canvas-ui) and `qa` (`e2e/`), against `npm run dev`, Chromium 1280×800.
- `scripts/check-skips.mjs` runs before Vitest and fails on any skip without a `SKIP-REASON:` comment.
