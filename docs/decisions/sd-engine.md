# sd-engine decisions

Scope: `packages/core/src/{parser,units,sim}`. Semantics follow SPEC §5 and RESEARCH §XMILE 2–3; this file records the choices those leave open, with rationale and the test that pins each one. Index entries for `docs/DECISIONS.md` are at the bottom.

## Equation language

- **SE-01 — Precedence and operators follow XMILE §3.3.1 exactly.** `^` is right-associative and binds tighter than unary minus (`-2^2 = -4`); `MOD` is the floored modulus (sign of the divisor) and `INT` is floor, as the spec requires. The SDXorg `rounding` test encodes Vensim's truncating variants instead and stays skipped (SPEC §11 row 4). Pinned by `parser/parser.test.ts` (precedence) and `sim/builtins.test.ts` (math).
- **SE-02 — `name(x)` is parsed as `LOOKUP(name, x)`.** Any call of a non-builtin name is a graphical-function call; the compiler reports "unknown function or graphical function" when the name is not a table. One AST shape keeps the compiler, rename and printer simple.
- **SE-03 — Zero-argument builtins are calls, not references** (`TIME` → `{k:'call', fn:'TIME'}`; `PI()` is also accepted). Only variables are `ref` nodes, so `referencedNames` is exactly the set of variables used.
- **SE-04 — Import conveniences:** `IF_THEN_ELSE(c, a, b)` parses to an IF node; `{…}` comments are skipped; typographic `− × ÷ ≤ ≥ ≠` are read as operators; two adjacent names get a hint (`Work_Remaining` or `"Work Remaining"`). `PREVIOUS` takes 1–2 arguments (initial defaults to 0, per the XMILE prose "or zero in the first DT").
- **SE-05 — `renameVariable` is token-based.** It replaces only the name tokens that denote the renamed variable and leaves every other character (spacing, comments, other names' spelling) untouched, so it also works inside equations that do not parse yet. The new name is written `Like_This`, or quoted when it is not a plain identifier. Validation (reserved/duplicate names) reuses `model/ops.setVariableName`.

## Units

- **SE-06 — Time-unit convention: year = 365 days = 12 months = 4 quarters; week = 7 days; day = 24 h.** So a month is 30.4167 days and 4.345 weeks. Why: planners expect exactly 12 months and 4 quarters per year, and 7 days per week; 365 (not 365.25) keeps "per year" rates identical to calendar planning figures. Only conversion *factors* depend on this; dimension checks do not. The time dimension's base unit is `day` (SPEC §6.2 example `tasks/week → { scale: 1/7, dims: { tasks: 1, day: −1 } }`). Pinned by `units/units.test.ts`.
- **SE-07 — Unit names are case-insensitive identifiers**; undefined names are implicit base units (XMILE §3.3.6). There is no plural folding: `person` and `people` differ unless a `UnitDef` alias says otherwise — guessing plurals would silently merge distinct units. `-` means multiplication (`person-hours`), a leading number is a scale (`1000 USD`), exponents are integers.
- **SE-08 — Numeric literals adapt.** In `+ − MOD`, comparisons, `MIN/MAX` and IF branches a literal takes the other operand's units; in `* /` it is dimensionless with an unknown scale, because a literal is often a conversion factor (`weekly * 4.345`). Where a scale is unknown only dimensions are compared. This avoids false alarms while still catching dimension errors.
- **SE-09 — All unit findings are warnings.** Units are advisory (SDXorg SIR/teacup declare inconsistent units and must still run); they never block a simulation. Checked: `+ −`, comparisons, `MIN/MAX`, IF branches, EXP/LN/trig arguments dimensionless, smoothing/delay times are times, each equation against its declared units, and each flow against `stock units / model time unit` (with the conversion factor when only the scale differs).

## Simulation

- **SE-10 — Whole number of steps within 1e-9 *relative*.** `(stop − start)/DT` must be within `1e-9·max(1, steps)` of an integer; an absolute 1e-9 would reject valid long runs because of binary rounding. `saveEvery` must likewise be a whole multiple of DT. The stop time is always saved.
- **SE-11 — Test inputs on the DT grid.** `STEP`: `TIME + DT/2 > t0` (nearest grid point, absorbs float drift). `PULSE`: value `volume/DT` while `TIME ∈ [first + k·interval, … + DT)` with a `1e-9·DT` tolerance, so an off-grid first time fires at the next grid time (Health warns). `RAMP` accepts the Stella/Vensim 3rd argument (end time).
- **SE-12 — Stateful builtins.** SMTH1/3/N and DELAY1/3/N are hoisted into hidden stocks (integrated by Euler/RK4 exactly like user stocks, also inside IF branches). `DELAY` (pipeline) and `PREVIOUS` are *discrete* states: sampled at `(tₙ, Sₙ)` and applied after the step, so under RK4 they are constant within a step (integrating them would smear a pure delay). `INIT` slots are frozen after the initialisation pass. `DELAY`'s time is evaluated once at the start and must be a whole multiple of DT (1e-9 relative), else a `numeric` error — matching PySD and Vensim DELAY FIXED. The order `n` of SMTHN/DELAYN must be a constant whole number 1–1000.
- **SE-13 — Non-negative stocks: outflow limiting iterated to a fixed point.** SPEC §5 formula in priority order (model order of flows); the pass repeats until no flow changes (flows only decrease; capped at one pass per non-negative stock), so a stock never counts an inflow that another non-negative stock limits later in the same step. Found by the conservation property test (`A → B → C → A` ring). Known limitation: an auxiliary that reads a limited flow in the same step sees the unlimited value. Non-negative flows clamp with `x < 0 ? 0 : x` (NaN propagates rather than being hidden).
- **SE-14 — Net flow is summed in flow-id order** (not file order), so results are bit-identical under any reordering of `model.variables` (property test). Outflow *priority* still follows file order, by SPEC.
- **SE-15 — Static auxiliaries** (no TIME and nothing time-varying upstream: constants, parameter expressions, `INIT`, `DT`) are evaluated once per run in the initialisation pass; numeric overrides replace a constant/aux value or a stock's initial value.
- **SE-16 — Assertions** are evaluated at saved steps; a value of 0 or NaN is a violation; only the first violation per assertion is reported. A broken assertion never blocks a run (it becomes a warning in `SimResult.warnings` and a Health error).
- **SE-17 — `CompiledModel` details.** `index`/`varIds` cover stocks, flows, auxiliaries and constants; graphical-function tables (`lookup`) have no value slot. `deps` is keyed by the same ids and lists only value-bearing variables: equation references for flows/auxes/constants and the connected flows for stocks (a stock's initial-value references are not causal links). `evalVar` applies the variable's table and non-negative clamp; for a stock it returns the stock's value. Hidden builtin states occupy slots `≥ varIds.length`; see "Contract gap" below.
- **SE-18 — Performance design.** One `Float64Array` value vector; closures are compiled once; slot reads and constants are fused into their parent operation and each math function has its own closure (halves the megamorphic calls). Measured in Node 22 (Vitest, this container): 500 variables × 10,000 Euler steps, every variable saved, **compile ≈ 30 ms, first run ≈ 340 ms, warm run ≈ 330 ms** (`sim/engine.perf.test.ts`; budget 1 s).

## Model Health (severity per check)

| check | severity | notes |
|---|---|---|
| unquantified, parse, undefined, algebraic-loop | error | from the compiler; block the run-based checks. An initialisation cycle is an `algebraic-loop` item with `detail.initialisation = true`. |
| assertion | error | violated or unparsable assertion |
| numeric | error | a saved value becomes NaN/±Infinity; bad time axis; DELAY time off the DT grid |
| units, flow-link, link-equation-mismatch | warning | flow-link: missing or mis-signed flow→stock link (unconnected flow = info) |
| unused | warning (constant, lookup) / info (aux) | KPI and reference-mode variables and assertion subjects count as used |
| integration-error | warning | DT vs DT/2 (same method, `settings.integrationErrorTolerance` on `max|Δ| / max|x|`); RK4 with STEP/PULSE/RAMP/time-based IF/discrete tables; RK4 with non-negative stocks; PULSE off the DT grid |
| polarity | (graph-analyst) | `checkPolarity` is called with the compiled model and baseline run; skipped while it throws `NotImplementedError` |

## Test tolerances

- **Analytic (criterion 3):** RK4 max relative error over all saved steps < 1e-6 at DT = 1/4 (measured worst 3.3e-8). Convergence order from final-time errors at DT = 1, ½, ¼ for each consecutive pair: Euler 0.94–1.05, RK4 3.94–4.12. Rates of 0.1–0.2 keep `r·DT ≤ 0.2` (asymptotic regime) and RK4 errors 1e-6–4e-4 absolute, ≥ 7 orders above round-off.
- **Closed-form step responses** of SMTH1/3/N and DELAY1/3/N: < 1e-6 absolute against the Erlang-n CDF with RK4 at DT = 1/32 (at DT = 1/16 the 5-stage cases showed 1.03e-6 of pure RK4 truncation).
- **Builtin ≡ explicit stock-flow structure:** 12 decimal places, Euler and RK4.
- **Conservation property:** total of a closed chain constant within `1e-9·max(1, total)`.

## Contract gap (request to the orchestrator)

`SimResult` does not expose hidden builtin states (smooth/delay stages), so a caller rebuilding a value vector from saved series cannot fill slots `≥ varIds.length`; `evalVar` on a variable that *uses* a stateful builtin then reads 0 for that builtin. Suggested addition: `SimOptions.saveState?: boolean` → `SimResult.state?: Float64Array[]` (full vectors at saved steps), or `CompiledModel.stateAt(result, k)`. Needed by LTM (Phase 3) for models with SMOOTH/DELAY.

## Index (for docs/DECISIONS.md)

SE-01 precedence/MOD/INT · SE-02 table calls · SE-03 zero-arg builtins · SE-04 import conveniences · SE-05 token-based rename · SE-06 time-unit factors · SE-07 unit names · SE-08 literals in unit checks · SE-09 unit findings are warnings · SE-10 step-count rule · SE-11 STEP/PULSE/RAMP grid rules · SE-12 stateful builtins · SE-13 non-negative fixed point · SE-14 file-order independence · SE-15 static auxes · SE-16 assertions · SE-17 CompiledModel details · SE-18 performance · Health severities · test tolerances · contract gap.
