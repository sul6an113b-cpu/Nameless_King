# LoopLab

A local workbench for rigorous systems thinking: frame a problem → map a causal loop diagram → find and classify every feedback loop and archetype → quantify as a stock-and-flow model → simulate and stress-test → rank leverage points → export a decision brief. A Claude copilot helps at every stage; it proposes, you decide.

> Status: under construction (see `docs/PROGRESS.md`). Phase 1 scaffold is in place.

## Quick start

Requires Node **24 LTS** (or 22.22.2+) and git.

```sh
git clone <this-repo-url> looplab && cd looplab
npm install
cp .env.example .env   # optional: add ANTHROPIC_API_KEY to enable the copilot
npm run dev            # open http://127.0.0.1:5173
```

Everything runs on `127.0.0.1`; the API key stays in the local server process and never reaches the browser.

## Other commands

| Command | What it does |
|---|---|
| `npm run build` | Type-check every workspace and build the web app |
| `npm start` | Serve the built app and the copilot API on http://127.0.0.1:8787 |
| `npm test` | Unit, property and integration tests (Vitest) plus the skipped-test check |
| `npm run e2e` | Browser tests (Playwright; first run `npx playwright install chromium`) |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run smoke:copilot` | One live copilot call (skips cleanly without a key) |

## Documentation

- `docs/USER_GUIDE.md` — how to use each workflow stage
- `docs/SPEC.md` — architecture, model schema, interfaces, test plan
- `docs/ARCHITECTURE.md` — the as-built map
- `docs/DECISIONS.md`, `docs/RESEARCH.md`, `docs/PROGRESS.md`, `docs/BLOCKERS.md`
