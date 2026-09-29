# graph-analyst — design decisions

Module: `packages/core/src/graph/` (SPEC §6.5). Fixtures: `packages/core/test/fixtures/graph/`.
Format: `G-NNN — decision — rationale`. All dated 2026-09-29.

## G-001 — Loop enumeration: Johnson's algorithm, iterative, per strongly connected component

- Loops are the elementary circuits of `model.links`. Flow→stock links are ordinary links (D-005), so CLD and SFD
  share one edge list.
- Algorithm: Johnson (1975), *Finding all the elementary circuits of a directed graph*, SIAM J. Comput. 4(1).
  - Vertices are the variables sorted by id (JS string order). Results therefore do not depend on the storage order of
    variables or links (fast-check property).
  - Self-links are reported first, as loops of length 1. Johnson then runs on the graph without self-links.
  - Johnson's outer loop is run over strongly connected components (Tarjan 1972, iterative). The algorithm picks the
    component with the smallest vertex s and finds the circuits through s inside it. It then removes s and splits the
    rest into components again (the same scheme as networkx's `simple_cycles`). Each circuit is emitted once, starting
    at its smallest vertex, so it is already rotated to its loop key.
  - Circuit search and unblocking use explicit stacks, not recursion, so a large component cannot overflow the call
    stack.
- Cost: O((n + e)(c + 1)) for c circuits. 150-variable timings are in G-009.

## G-002 — Loop identity, order and truncation

- Key (SPEC §3): the variable ids, rotated so the smallest id (JS `<`, UTF-16 code units) comes first, joined by `>`.
  `loopKey(varIds)` is exported for other modules (LTM, UI).
- `varIds[i] → varIds[i+1]` is the link `linkIds[i]`. `length` is the number of links.
- Order: by length, then key.
- Cap: `opts.cap ?? settings.loopCap` (default 1,000). The search stops when a loop beyond the cap is found. So
  `truncated: true, reason: 'cap'` means strictly more loops exist, and `cap` loops are returned. A model with exactly
  `cap` loops is not truncated.
- Time budget: with `timeBudgetMs`, the search reads `performance.now()` every 1,024 search steps and stops with
  `reason: 'time'`. This is the only non-deterministic path in the module, and it applies only when a budget is
  passed. `performance.now()` is available in browsers, workers and Node.
- A truncated set is the first loops in search order: self-loops first, then loops grouped by their smallest variable
  id. It is **not** ranked by importance (RESEARCH §LTM 6). The UI must show the cap warning (`loop-cap-warning`).
- `boundaryChart` does not depend on the cap (G-005).

## G-003 — Loop type

- The type is `R` for an even number of `-` links, `B` for an odd number, and `U` if any link is `?` (D-003).
- `loopType(model, linkIds)` throws on an unknown link id. A stale loop is a programming error, not an unknown
  polarity.

## G-004 — Loop participation and betweenness

- `loopParticipation(loops)` counts the loops each variable lies on. Variables on no loop are absent from the record.
- `betweenness(model)` implements Brandes (2001), *A faster algorithm for betweenness centrality*, J. Math. Sociol.
  25(2).
  - The graph is directed and unweighted. Self-links are ignored because they are never on a shortest path.
  - The result is normalised by (n − 1)(n − 2), the number of ordered (source, target) pairs that exclude the
    variable itself, so it lies in [0, 1]. This matches networkx's directed normalisation.
  - When n ≤ 2, every value is 0.
  - A fast-check property compares the result with a brute-force σ(s,v)·σ(v,t)/σ(s,t) count.

## G-005 — Boundary chart

- A variable is **endogenous** iff it is on a loop or reachable along links from a loop variable. Every other
  variable is **exogenous**: drivers, parameters and isolated variables.
- "On a loop" comes from the graph's strongly connected components (non-trivial SCC or self-link), together with the
  loops passed in. So the chart stays exact when `findLoops` was truncated.
- Both lists keep `model.variables` order. `excluded` is `model.frame.excluded`.

## G-006 — Structural leverage score

```
score(v) = ½ · ( loops(v) / max_u loops(u)  +  betweenness(v) / max_u betweenness(u) ) · (1 + 0.5·stock(v) + 0.5·delay(v))
```

- `loops(v)`: loop participation (G-004). Loop gains and strengths are Meadows' leverage points 7–8, and they act
  through the variables on the loops.
- `betweenness(v)`: normalised betweenness (G-004). A variable on many shortest causal paths relays information.
  Treating this as a proxy for Meadows' point 6 (information flows) is **LoopLab's own interpretation**.
- Each term is divided by its maximum over all variables, so both lie in [0, 1] and weigh equally, and the top
  variable of each term scores 1. The base score therefore lies in [0, 1].
- Bonuses:
  - `stock(v) = 1` for `kind === 'stock'`. Accumulations: Meadows' points 10–11 (stock-and-flow structure, buffers).
  - `delay(v) = 1` when a delayed link on one of the given loops ends at v. Meadows' point 9 (delays). The bonus goes
    to the target because the delayed response happens there.
  - The multiplier lies in [1, 2].
- Rows cover every variable. They are sorted by score, then id. `cumulativeShare` is the running share of the total
  score, for the Pareto line. The last row is exactly 1, or every row is 0 if the total is 0.
- `components`: `{ loopCount, participation, betweenness, stock, delay }`, with participation and betweenness
  max-normalised.
- Source: Meadows, D. H. (1999), *Leverage Points: Places to Intervene in a System*, The Sustainability Institute,
  for the numbered leverage points. The weights (½, 0.5, 0.5) are simple defaults, not calibrated values. The score is
  a structural screen. The analysis agent's behavioural ranking (Phase 3) is meant to refine it.

## G-007 — Archetype matcher: loop-role signatures

### Sources

- Senge, P. M. (1990), *The Fifth Discipline*, Doubleday/Currency.
- Kim, D. H. (1992), *Systems Archetypes I*, Pegasus Communications. Kim's "Drifting Goals" is Senge's "Eroding
  Goals".

The structures below are LoopLab's structural reading of those templates. No page or figure numbers are claimed.

### Notation

- For a loop L through a variable x, `in(L,x)` is the polarity of L's link entering x and `out(L,x)` the polarity of
  the link leaving x.
- Two loops **touch** at x when x is their only shared variable and they share no link.
- A variable is **exogenous** when it lies on no loop (G-005).

### Signatures

| Archetype | Required structure (base score) | Characteristic features (bonus) | Roles |
|---|---|---|---|
| Limits to Growth | R and B touch at the state x (0.55) | exogenous constraint drives a B-loop variable ≠ x (+0.25); B loop delayed (+0.1) | state, growingAction, slowingAction, constraint |
| Fixes that Fail | B (fix) and R share ≥ 1 link, the problem → fix path; the R loop passes a consequence outside the B loop (0.55) | delay on the R loop's own links (+0.3); no delay on the B loop's own links (+0.1) | problem, fix, consequence |
| Shifting the Burden | two B loops touch at the problem x with `in` equal and `out` equal (0.55) | an R loop through x and both solutions (side effect) (+0.25); exactly one B loop delayed, the fundamental one (+0.15) | problem, symptomaticSolution, fundamentalSolution, sideEffect |
| Eroding Goals | two B loops touch at the gap x, `out` equal and `in` different (0.55). The goal loop has in = out. | condition loop delayed (+0.25); goal loop not delayed (+0.1) | gap, goal, condition, correctiveAction, goalPressure |
| Escalation | two B loops touch at the relative position x, with in ≠ out in each loop and opposite `in` signs (0.55) | equal lengths (+0.25); both delayed or neither (+0.1) | relativePosition, activityA/B, resultsA/B |
| Success to the Successful | two R loops touch at the allocation x with opposite `in` and opposite `out` signs (0.55) | equal lengths (+0.25); both delayed or neither (+0.1) | allocation, resourcesA/B, successA/B |
| Tragedy of the Commons | two disjoint R loops R1 and R2; B1 meets R1 but not R2; B2 meets R2 but not R1; B1 ∩ B2 (the commons) is non-empty and lies on neither R loop (0.7) | both B loops delayed (+0.15); exogenous resource limit drives the commons (+0.1) | activityA/B, gainA/B, totalActivity, gainPerActivity, resourceLimit |
| Growth and Underinvestment | Limits to Growth (R and B1 touch at x), plus a B loop B2 that shares a variable ≠ x with B1 and is disjoint from R (0.7) | delay on B2's own links (capacity takes time) (+0.2); exogenous performance standard drives B2 (+0.05) | state, growingAction, slowingAction, capacity, investment, performanceStandard |

### Why sign patterns

- For two loops that touch at x, the matcher only compares whether signs agree. Renaming x to its opposite (for
  example "problem" to "performance") flips all four signs, so it does not change the match. A test checks this for
  every fixture.
- Shifting the Burden, Eroding Goals and Escalation are mutually exclusive. The two sign combinations left over match
  nothing.

### Scoring

- Two-loop patterns start at 0.55. The more specific three- and four-loop patterns start at 0.7.
- Features add up to a maximum of 0.9–0.95.
- **Strong** means `score ≥ STRONG_ARCHETYPE_SCORE = 0.7` (exported). In practice this means the characteristic
  delay or constraint is present. The canonical fixtures score 0.9–0.95, and the bare fragments in the unrelated
  fixtures score 0.55.
- **Components:** when a candidate's loop set is a strict subset of a larger candidate's loop set, its score is
  multiplied by 0.6 and its sentence says which larger structure it belongs to. So the whole structure ranks first.
  For example, the Fixes-that-Fail pattern inside Shifting the Burden drops from 0.95 to 0.57.
- Candidates are deduplicated by (archetype, loop set).
- A variable fills at most one role. The first role listed wins.

### Limits

These keep the matcher fast and deterministic on large models:

- Loops of length 2–10 only. Self-loops are skipped because every template loop links at least two variables.
- `U` loops are skipped.
- The shortest 200 loops only.
- At most 2,000 drafts and 8 R-loop partners per commons.
- At most 50 candidates are returned.

The full Analyze pipeline on a capped 150-variable graph takes about 27 ms (G-009).

### Known limitations

These are proposals. The engineer confirms them.

- Structure cannot see nonlinearity. For example, a linear births/deaths population model matches Limits to Growth
  at 0.8, with "lifetime" as the constraint.
- The Shifting the Burden / Eroding Goals / Escalation split assumes the templates' naming convention: actions,
  solutions and results are named as quantities that increase. Renaming a *solution* variable to its opposite changes
  which of the three is proposed. Renaming the shared variable does not.
- Only the relative-position form of Escalation is matched. The "arms race" shorthand, one all-positive R loop
  through two threat variables, looks like any R loop.

## G-008 — Polarity consistency check

- **flow → stock links:** an inflow (`flow.to`) implies `+` and an outflow (`flow.from`) implies `−`. A link into a
  stock from anything else is left to the flow-link and link-equation checks.
- **Links into an aux or flow** from a stock, flow, aux or constant: central difference
  `f(x + h) − f(x − h)` with `h = 1e-4·|x|` (`1e-4` when x = 0), evaluated with `evalVar` at each sampled state.
  - A change of at most `1e-12·max(|f(x+h)|, |f(x−h)|)` counts as no effect. That margin is about 2,500 times the
    float noise.
  - A consistent sign gives the implied polarity. A mixed sign across states is reported as **non-monotonic**
    (severity `info`).
  - When there is no effect in any state, there is no verdict. This covers flat lookup regions, stateful builtins
    (SMOOTH/DELAY outputs are hidden stocks, so the instantaneous partial derivative is 0) and links the equation does
    not reference, which the link-equation check reports.
- **Severity:**
  - drawn `+`/`−` ≠ implied: `warning`.
  - drawn `?`: `info` stating the implied sign.
  - The message names both signs. `detail` is `{ linkId, drawn, implied, basis, states, positive, negative }`.
  - `elementIds` is `[linkId, fromId, toId]`.
- **Sample states:** up to 12 evenly spaced saved rows (first and last included).
  - They come from `samples` (a baseline run), else from a one-step run of `compiled` (`stop = start + dt`, which
    gives the initial values), else from a synthetic state (numeric-literal equations, 1 elsewhere).
  - Values missing from the run, such as hidden internal stocks, are 0.
- **Evaluator injection:** `evaluator` (same shape as `CompiledModel.evalVar`) overrides `compiled.evalVar`.
  - Without `compiled`, the value vector is laid out in `model.variables` order.
  - Tests use hand-written evaluators and a fake `CompiledModel`, because sd-engine's compiler lands in parallel.
    **At integration**, add one test with the real `compileModel` (see the report).
- Skipped: self-links, qualitative (`variable`) and `lookup` sources, and targets that are not aux or flow.

## G-009 — Measured performance (dev container, Node 22.22.2, 4 cores; median of 7 runs)

| 150-variable graph | `findLoops` (default cap 1,000) | Loops | Full Analyze pipeline |
|---|---|---|---|
| dense random, 4 out-links each (600 links) | 18.8 ms | 1,000 (truncated, cap) | 27.2 ms |
| sparse random, 2 out-links each (300 links) | 8.8 ms | 1,000 (truncated, cap) | 25.4 ms |
| SD-like sectors + 30 feedback links | 3.1 ms | 100 (complete) | 9.9 ms |

Other measurements:

- With `cap: 100000`, the dense graph enumerates 100,000 loops in about 1.0 s.
- `timeBudgetMs: 50` stops after about 60 ms, including building the graph.
- The brief's budget is < 2 s, or stopping at the cap. `loops.perf.test.ts` asserts it.
