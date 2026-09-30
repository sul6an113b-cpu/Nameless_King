# Methodologist decisions (`packages/content`, `docs/USER_GUIDE.md`)

Format: `M-N — decision — rationale`. Indexed from `docs/DECISIONS.md` by the orchestrator.

## M-1 — How sources were verified

**Decision.** A `Citation` is `verified: true` only if the specific claim it supports was confirmed against an authoritative page. No page numbers are given anywhere. Chapter locators appear only where a chapter number and title were confirmed.

**Method (2026-09-29).** The sandbox egress policy blocked WebFetch for every relevant host: donellameadows.org, wikipedia.org, thesystemsthinker.com, crossref.org, doi.org and dartmouth.edu. WebSearch worked, so each claim was checked against the search engine's summaries of the pages listed below, from at least one authoritative or independent source. The full texts were not read. A reviewer with web access should re-check the items marked ◐.

| Claim used in content | Source key | Checked against (search summaries) | Status |
|---|---|---|---|
| The 12 leverage points: wording and order, 12 = least effective … 1 = most | meadows-1999 | sites.dartmouth.edu/climateaction/?p=27; explore.psychsafety.com/n/meadows-1999/ (both give the same list) | ✔ |
| Meadows (2008) ch. 5 "System Traps … and Opportunities": policy resistance, tragedy of the commons, drift to low performance, escalation, success to the successful, shifting the burden to the intervenor (addiction), rule beating, seeking the wrong goal | meadows-2008 | library.alnap.org (Thinking in Systems PDF); bytepawn.com/systems-thinking.html; shortform.com | ✔ |
| Senge (1990) ch. 4 laws, e.g. "behavior grows better before it grows worse" | senge-1990 | maaw.info/ArticleSummaries/ArtSumSenge90.htm; simonwhatley.co.uk (11 laws) | ✔ |
| Archetype structures and behaviour: problem symptom returns "to its previous level or becomes worse"; figure-8 in escalation and shifting the burden; drifting goals; G&U, StS and ToC descriptions | kim-1992, senge-1990 | thesystemsthinker.com PG01E "Systems Archetypes at a Glance" (states it is drawn from The Fifth Discipline); thesystemsthinker.com archetype articles | ✔ |
| Kim (1992) bibliographic data (Pegasus, Waltham, Toolbox Reprint Series, ISBN 1-883823-00-5) | kim-1992 | thesystemsthinker.com TRSA01 PDF; ictlogy.net bibliography | ✔ |
| Sterman (2000) ch. 4 "Structure and Behavior of Dynamic Systems": exponential growth, goal seeking, oscillation, S-shaped growth, overshoot and collapse | sterman-2000 | mheducation.com.au product page (TOC) | ✔ |
| Sterman (2000) floating-goal formulation of eroding goals | sterman-2000 | not confirmed to a chapter | ◐ `verified: false` |
| Lyneis & Ford (2007): SDR 23(2–3) 157–189. The rework cycle, feedback effects and knock-on effects are the drivers of project dynamics | lyneis-ford-2007 | proceedings.systemdynamics.org/2007/…/563.htm; MIT OCW ESD.36 lecture 6 (Lyneis) | ✔ |
| The term "90 % syndrome" | — | Used only as a pattern name in an illustrative sketch note; not attributed to a source | ◐ |
| Torricelli: v = √(2gh); √h falls linearly in time | torricelli-law | sites.math.washington.edu (Torricelli project); ace.gatech.edu | ✔ |
| Discharge coefficient ≈ 0.6 for a sharp-edged orifice | — | Engineering rule of thumb, labelled illustrative | ◐ |

**What is original.** All parameter values, graphical functions and reference-mode sketches are illustrative and labelled so. Every description, example and EPC illustration is in our own words. The only quotations are the verified list names and law names above.

## M-2 — How models are authored

- **Builder.** Every bundled model is built by `src/build.ts` through the core ops `addVariable`, `addLink` and `connectFlow`, then passed through `ModelSchema.parse`. Bundled content therefore obeys the same integrity rules as user edits, and a broken spec fails at import time.
- **Determinism.** Ids are fixed (`m_…`, `v_…`, `l_<from>__<to>`; implied flow links come from `connectFlow`). The timestamp is also fixed: `2026-09-29T00:00:00.000Z`.
- **Links match equations one to one.** A variable has a link from X exactly when its equation references X. For a stock, this means its initial-value equation, as in `Project scope → Work to do`. Flow→stock links carry the implied sign. `structureIssues()` in `src/testing.ts` enforces this rule today; Model Health's `link-equation-mismatch` enforces it after integration.
- **Constants.** Every constant is a numeric literal, with a uniform `uncertainty` range that brackets its value, for use by sensitivity and Monte Carlo.
- **Units.**
  - Custom base units are declared in `model.units`: issues, tasks, people, spools, items, customers, effort, capability, resource, activity, meter.
  - Time units are singular (`week`, `month`, `second`). `dmnl` means dimensionless.
  - `meter` is spelled out rather than `m`, so it cannot collide with a time-unit alias.
  - Numeric literals appear only in dimensionless positions: `1 - x`, `(1 + margin)`, `2 * g * h`, and graph-function breakpoints.
- **Numerical accuracy.** DT satisfies the SPEC §6.4 integration-error test (DT vs DT/2, tolerance 1 %) with margin. These values were measured with an independent scratch Euler/RK4 implementation of SPEC §5 (not committed):

| Model | DT | worst max\|Δ\| / max\|x\| (DT vs DT/2) |
|---|---|---|
| Fixes that Fail | 0.25 month | 5.8e-3 |
| Shifting the Burden | 0.125 month | 6.2e-3 |
| Limits to Growth | 0.25 month | 7.6e-3 |
| Eroding Goals | 0.25 month | 1.7e-4 |
| Escalation | 0.25 month | 4.1e-3 |
| Success to the Successful | 0.125 month | 5.1e-3 |
| Tragedy of the Commons | 0.25 month | 2.1e-3 |
| Growth and Underinvestment | 0.25 month | 6.6e-4 |
| epc-rework | 0.25 week | 2.7e-3 |
| epc-handoff | 0.0625 week | 8.1e-3 (the MIN kink when installation switches from crew-limited to material-limited; at 0.125 week it was 1.6e-2) |
| qc-ncr-backlog | 0.125 week | 7.1e-3 |
| tank-draining | 0.5 s | 1.2e-4 |

## M-3 — Tolerances for the tank-draining tests

The analytic solution is h(t) = (√h0 − k·t/2)², with k = Cd·a·√(2g)/A. The horizon is 600 s, which is before the tank empties at T ≈ 753 s. Up to that point √h is smooth and the relative error is well defined. Errors below are the maximum relative error over all saved points, measured with the scratch reference implementation:

| Method, DT | max relative error |
|---|---|
| Euler, 1 s | 1.05e-2 |
| Euler, 0.5 s (model default) | 5.2e-3 |
| Euler, 0.25 s | 2.6e-3 |
| RK4, 4 s | 8.3e-9 |
| RK4, 2 s | 5.1e-10 |
| RK4, 1 s | 3.2e-11 |

Tolerances:
- **RK4 at DT = 1 s: < 1e-6.** This is the brief's criterion for analytic tests, with about 4 orders of magnitude of headroom for implementation differences such as stage evaluation order.
- **Euler at the default DT: < 1e-2.** This is the first-order global error, with about 2× headroom.
- **Convergence orders**, from errors at DT = 1 → ½ (Euler) and 4 → 2 (RK4): Euler 1 ± 0.3 and RK4 4 ± 0.3, the brief's bounds. Measured values are 1.00 and 4.01. The RK4 pair stays far above floating-point noise (errors around 1e-9 on h ≈ 0.04).
- **Reference-mode points vs analytic(t): within 5e-5.** The points are rounded to 4 decimals.

## M-4 — Shape classifiers (`src/shapes.ts`)

**Approach.** Each shape is a geometric predicate over one equally spaced series. A leading flat segment is trimmed first, so a model sitting at equilibrium until a STEP is judged from the onset of change. A series is treated as flat, and matches no shape, when its range is below 1e-4 of its magnitude.

**Tolerances.** Monotonicity allows 1–5 % of the range as backtracking. Acceleration and deceleration are judged on the net change in each third of the horizon (by ≥ 10 % for exponential growth). "Fastest change" means the largest step, located in the first 15 % (goal seeking) or between 10 % and 90 % (S-shaped).

**Why the thresholds are loose.** They judge a pattern, not a calibration. Every archetype KPI passes with wide margin in the reference runs. For example:
- Tragedy of the Commons falls by 95 % of its rise (threshold 50 %).
- Growth and Underinvestment changes by about 1 % of its rise in the last third (threshold 15 %).

**Shapes overlap on purpose**, and each archetype test checks only its own signature:
- Exponential growth also counts as escalation.
- Logistic growth also counts as divergence (it departs from an unstable equilibrium).

**Direction.**
- better-before-worse is direction-agnostic: worse-before-better is the same geometry.
- Escalation and growth shapes expect a rising KPI.
- goal-erosion expects a falling one.

**Signature KPIs** were chosen for the archetype's defining behaviour:
- Shifting the Burden → fundamental capability, goal-seeking decay.
- Eroding Goals → the goal itself, a steady drift with no asymptote.
- Tragedy of the Commons → total harvest, overshoot and collapse.
- Success to the Successful → A's share of capability, divergence from 0.51.

**Contrast tests.** For six archetypes, a scenario that removes the driving structure must make the signature disappear. The scenarios are: benign fix, hold the goal, parity, proportional allocation, managed commons, and hold the standard.

## M-5 — Graph-dependent test skips (same policy as D-016)

The archetype tests that need `findLoops` and `matchArchetypes` use `it.skipIf(!graphReady)`, where `graphReady` means the stub no longer throws `NotImplementedError`. This follows D-016 exactly, but for the graph module. These tests must run and pass at the Phase 2 integration checkpoint. A skip still active after integration is a defect.

In the meantime, the loop counts of every CLD are checked by an independent brute-force cycle enumerator (`loopCounts` in `src/testing.ts`) against these hand-verified counts:

| Archetype | CLD loops |
|---|---|
| Fixes that Fail | 1R 1B |
| Shifting the Burden | 1R 2B |
| Limits to Growth | 1R 1B |
| Eroding Goals | 0R 2B |
| Escalation | 0R 2B (figure-8) |
| Success to the Successful | 2R |
| Tragedy of the Commons | 2R 2B |
| Growth and Underinvestment | 2R 2B |

## M-6 — Engine semantics the content relies on (for the integration review)

Everything below follows SPEC §5 and was exercised with the scratch reference implementation. sd-engine should confirm each point:

1. **SQRT units** (tank-draining, `SQRT(2 * Gravity * Water_height)`). The argument has units meter²/second², so the result should be meter/second: the square root halves even exponents. If `inferUnits` instead requires a dimensionless argument, this model gets a unit finding, and the fix belongs in the unit checker.
2. **Numeric literals** are dimensionless and are used only where that is consistent (see M-2).
3. **Embedded graphical functions** (an aux with `graph`) apply the table to the equation result, clamped at the ends (`continuous`).
4. **DELAY3 initialisation** (epc-handoff). Without an initial argument, DELAY3 starts from input(t0). Here input(t0) = 0 because isometric issue starts with a STEP at week 4, so the pipeline starts empty, as intended.
5. **nonNegative.** A flow is clamped to MAX(flow, 0); a stock limits its outflows. Goal erosion, standard erosion and capacity additions rely on the flow clamp.
6. **Link–equation mismatch for stocks** compares the references in the initial-value equation with the incoming non-flow links, as in `Project scope → Work to do` and `Initial height → Water height`.
7. **Scenario overrides of a variable with an embedded graph** (Success to the Successful, `s_proportional` = `0.5`) still pass through the graph. Here gf(0.5) = 0.5, so the result is the same either way.

## M-7 — Additions to the SPEC §6.10 interface (additive only)

- `ExampleModel.sources: Citation[]`.
- New exports:
  - `SHAPES`, `SHAPE_IDS`, `matchesShape`, `explainShape`, `classifyShape` (shape classifiers, for the UI and the copilot).
  - `leveragePoint(level)`.
  - `bibliography` and `cite` (full references for report appendices).
  - `tankHeight` (the analytic solution).
- `src/testing.ts` holds the test helpers and is not exported.

## Phase 2 integration review

Scope: engine (`packages/core/src/{parser,units,sim}`), loop analysis (`packages/core/src/graph`), copilot prompt (`apps/server/src/copilot/prompt.ts`), checked against Sterman (2000), Senge (1990), Kim (1992), Meadows (1999) and RESEARCH §XMILE 2–3. Result: **0 blockers, 1 major, 5 minors.** Nothing here needs to change before Phase 3 begins; the major item should be fixed before LTM relies on `evalVar`.

### Engine — 0 blockers, 1 major, 3 minors
Verified correct: STEP (`TIME + DT/2 > t0`), PULSE (volume/DT, repeats every interval, fires at the next grid time when off-grid), RAMP (with end time), SMTH1/3/N (all stages start at init, each stage τ/n), DELAY1/3/N (stages start at init·τ/n, output Sₙ·n/τ), DELAY pipeline (output = input(t−τ), checked by hand for m = 1 and m > 1), PREVIOUS/INIT, Euler/RK4 staging (compile.ts:568–668, run.ts:150–180), outflow limiting in priority order, and TIME = start + n·DT. The units convention (year = 12 months = 365 d) and the stock = flow × time rule (infer.ts:262–276) are sound.
- **MAJOR — health.ts:71–77 (with model.ts:263, run.ts:38).** `integrationTest` runs the shared `CompiledModel` at DT/2. That mutates `program.env.dt`, and `checkPolarity` then calls `evalVar` against a DT of DT/2, so PULSE magnitudes, STEP thresholds and `DT` references differ from the baseline run whose states it samples. LTM (Phase 3) would hit the same problem after any re-run at another DT. *Fix:* run `checkPolarity` before `integrationTest`, and in `runProgram` restore `env` in a `finally` block (or make `evalVar` take the `SimSpec` of the result it reads).
- minor — health.ts:225. "Euler is exact on the DT grid" overstates the case: Euler has O(DT) truncation error everywhere. *Fix:* "Euler applies jumps exactly at grid times".
- minor — run.ts:68–87. A non-negative stock limits only its outflows, so a negative-valued (bi-directional) inflow can still drive it below 0. *Fix:* document this in SE-13, and add a health info item when a non-negative stock has an inflow that is not `nonNegative`.
- minor — health.ts (no check). Nothing flags a stock with no inflows and no outflows, which is a common modelling slip and makes the stock a disguised constant. *Fix:* add a `flow-link` warning for it.

### Loop analysis — 0 blockers, 0 majors, 1 minor
R/B typing (loops.ts:36–43; an even number of "−" links is R, any "?" is U), the loop-key rotation and self-loops follow Sterman's polarity rule. The loop-role patterns match Senge (1990, Appendix 2) and Kim (1992): Fixes that Fail is B + R sharing the fix path; Shifting the Burden is two B loops plus a side-effect R loop; Eroding Goals is a goal loop plus a delayed condition loop; Escalation is two B loops (a figure-8 that is R overall); Success to the Successful is two R loops coupled through the allocation; Tragedy of the Commons is two R loops, each coupled to a B loop, sharing the commons. All 8 bundled canonical CLDs are proposed by the matcher (content tests).
- minor — archetypes.ts:255–260. The Escalation and Success-to-the-Successful score rewards symmetry through equal loop *length*, but Kim (1992) treats symmetry of *role*, not length. *Fix:* weight the symmetry bonus lower (0.1), or compare link-sign patterns instead of lengths.

### Copilot prompt — 0 blockers, 0 majors, 1 minor
The prompt gets these right: polarity defined with "above/below what it would otherwise have been" (Sterman ch. 5), variables named as nouns with no built-in direction, R/B/U labelling, explicit goals on balancing loops, grounding (cite only tool numbers, label hypotheses), untrusted-data handling, and a Meadows list whose names and order (12→1) match Meadows (1999).
- minor — prompt.ts:32. Relating delay marks to "the time horizon of the problem" is looser than Sterman's criterion, which is a delay long relative to the dynamics of interest. *Fix:* "Mark a delay when it is long relative to the other time constants that matter to the behaviour."

### Content cleanup (Task B)
The D-016 / M-5 gates (`engineReady`, `graphReady`, `parserReady`, the probe model and the pre-parser tokenizer path) are removed from `packages/content/src/{testing,archetypes.test,examples.test}.ts`. All content tests now run unconditionally: 126/126 passing, with 0 skips.
