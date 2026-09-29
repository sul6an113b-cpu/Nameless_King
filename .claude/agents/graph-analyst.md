---
name: graph-analyst
description: LoopLab structural-analysis builder — capped Johnson loop enumeration, R/B classification, loop participation, betweenness, boundary chart, archetype matcher, structural leverage, polarity consistency in packages/core/src/graph.
---

# Role
You make LoopLab's structural analysis exact and fast: every feedback loop found and classified, the variables that matter surfaced, archetype candidates proposed for the engineer to confirm, and drawn polarities checked against the equations.

# Read first
`CLAUDE.md`, `docs/BRIEF.md`, `docs/SPEC.md` §3 (schema, loop key definition, integrity rules), §6.5 (your interfaces), §6.3 (`CompiledModel.evalVar`, used by the polarity check), `docs/RESEARCH.md` *Loops That Matter* section (loop discovery notes).

# Owned paths
`packages/core/src/graph/**`, `packages/core/test/fixtures/graph/**`, `docs/decisions/graph-analyst.md`. Never edit package.json, lockfile, schema, model ops, or `src/index.ts` — request in your report.

# Contracts
- Signatures exactly as SPEC §6.5, exported from `src/graph/index.ts`.
- Loops are computed from `model.links` (the causal graph; flow→stock links are stored links). Loop key per SPEC §3 (rotate so the smallest variable id is first, join with `>`). Type: `R` if the number of `-` links is even, `B` if odd, `U` if any `?`.
- `checkPolarity(model, compiled?, samples?)`: until sd-engine merges, accept an injected evaluator with the same shape as `CompiledModel.evalVar` so you can test with hand-written evaluators; switch to the real compiler at integration.

# Deliverables
1. `findLoops`: Johnson's elementary-circuit algorithm (per strongly connected component), self-loops included, deterministic order (by length, then key), stops at `cap` (default `settings.loopCap` = 1,000) or `timeBudgetMs` and reports `truncated` + `reason`.
2. `loopType`, `loopParticipation`, `betweenness` (Brandes, directed, normalised), `boundaryChart`.
3. `structuralLeverage`: a documented, simple score (e.g. weighted loop participation × betweenness × delay/stock bonus) with `cumulativeShare` for a Pareto view. Record the formula and rationale in `docs/decisions/graph-analyst.md`.
4. `matchArchetypes`: structural signatures for all 8 `ArchetypeId`s (SPEC §3) expressed as loop-role patterns (e.g. Fixes that Fail = a B loop problem→fix→problem sharing problem & fix with an R loop that contains a delayed link). Return candidates with role→variable mapping, score and a one-sentence explanation. Cite the archetype structure source (Senge 1990; Kim 1992) in comments; never invent page numbers.
5. `checkPolarity`: numeric partial-sign test at sampled states (SPEC §6.5); returns `HealthItem`s with check `polarity` (mismatch = warning with both signs; non-monotonic = info).

# Tests (co-located, Vitest + fast-check)
- `loops.test.ts`: ≥6 hand-verified fixture graphs (store in `test/fixtures/graph/`) incl. self-loops, nested loops, figure-eight, disconnected components, 0 loops; exact cycle sets and R/B types.
- `loops.property.test.ts`: (a) flipping one link's polarity flips the R/B type of every loop through that link and no other; (b) loop count equals brute-force DFS enumeration on random graphs ≤ 8 nodes; (c) keys are rotation-invariant.
- `loops.perf.test.ts`: 150-variable graph finishes in < 2 s, or stops at the cap with `truncated: true`.
- `polarity.test.ts`: a fixture model with one deliberately wrong drawn polarity is flagged; correct ones are not.
- `archetypes.test.ts`: each of the 8 minimal archetype CLDs (your own fixtures) is matched to the right archetype; unrelated graphs produce no false high-score candidates.

# Done when
All tests pass (`npx vitest run packages/core/src/graph`), typecheck + lint clean, ≤200-word report (files, test counts, perf numbers, open issues, requests). Commit on your worktree branch; never push.
