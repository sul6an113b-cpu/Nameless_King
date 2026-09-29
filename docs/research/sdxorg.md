# SDXorg test-models: survey and LoopLab's supported subset

Phase 0 research for the acceptance criterion *"SDXorg test-models: every model in the supported subset reproduces its reference output within a tolerance justified in DECISIONS.md; skipped models are listed with reasons."* (docs/BRIEF.md).

| Item | Value |
|---|---|
| Upstream | <https://github.com/SDXorg/test-models> |
| Commit surveyed | `21aab02739dc5187bc9564e4d3de14e575905d2f` (2025-03-14, "Add XMILE test for case insensitive treatment of logical operators. (#93)"). `git ls-remote` on 2026-09-29 shows this is still upstream `HEAD`. |
| Local clone | `vendor/sdxorg-test-models` (gitignored via `.gitignore: vendor/`), shallow, LFS smudge skipped |
| Accessed | 2026-09-29 |
| Other sources | PySD `8b6d3890527f799e66c5a84c5228e681a53e77a6` (master, 2026-09-29): `pysd/tools/benchmarking.py`, `tests/pytest_integration/pytest_integration_xmile_pathway.py`, `pysd/py_backend/{functions,statefuls,utils}.py`. Simlin `e6f95a6bb6038e13d2aca6b5c4320a6bd6acebcc` (bpowers/simlin, 2026-09-29): `src/simlin-engine/tests/integration/{simulate.rs,test_helpers.rs}` and its `test/test-models` fork. Both were fetched read-only with git and raw.githubusercontent.com. |
| Not reachable | docs.oasis-open.org, www.oasis-open.org and iseesystems.com are blocked by the egress proxy. For XMILE semantics, see the sibling note `docs/research/xmile.md`. |

## TL;DR

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

## 1. Suite layout and provenance

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

## 2. Inventory of XMILE-bearing directories (60)

**Status legend:**
- **SUP**: SUPPORTED.
- **CAND**: supported if the named cheap addition is accepted.
- **SKIP**: skipped, with the reason given.

"Euler" is the XMILE default when `method` is absent. All references are saved every DT (row count = (stop−start)/DT + 1, checked). No file has a `<save_step>`.

### 2a. `samples/`

| Path | Model file(s) used | Reference | Method, DT, start–stop | Features | Status |
|---|---|---|---|---|---|
| samples/SIR | `SIR.xmile` (go-xmile), `SIR_reciprocal-dt.xmile` (`<dt reciprocal="true">32</dt>`), `SIR.stmx` (Stella 1.4). Skip file: `SIR_legacy.stmx` (STELLA 10 pre-standard) | output.csv (Vensim 6.3 Mac, 3201 rows, CR line ends) | Euler, 1/32, 0–100 | 3 stocks, 2 flows, 3 aux; units (days vs time units "Time", inconsistent) | **SUP** |
| samples/teacup | `teacup.xmile` (hand-coded XMILE 1.0, quoted names in eqns), `teacup_w_diagram.xmile` (go-xmile), `teacup.stmx` (Stella 1.4). Skip file: `teacup_legacy.stmx` | output.csv (Vensim 6.3 Mac, 241 rows) | Euler, 0.125, 0–30 | 1 stock, 1 flow, 2 aux; `non_negative` on stock and flow (never binds); units inconsistent (deg/time vs minutes) | **SUP** |
| samples/arrays/a2a | `a2a.stmx` | none | Euler, 1/4, 1–13 | apply-to-all arrays | **SKIP**: arrays; no reference output |
| samples/arrays/non-a2a | `non-a2a.stmx`, `non-a2a-gf.stmx` | none | Euler, 1/4, 1–13 | non-a2a arrays, gf | **SKIP**: arrays; no reference output |
| samples/bpowers-hares_and_lynxes_modules | `model.xmile` (go-xmile), `model.stmx`, `model_legacy.stmx` | output.csv (headers `hares.hares`, time column `time`) | Euler, 0.5, 0–12 | 3 models (modules + `<connect>`), gf with both xscale and xpts, PULSE, non_negative | **SKIP**: modules/submodels |
| samples/display | `1style.stmx`, `multipoint-connection.stmx` | none | Euler, 1/4, 1–13 | display/styling fixtures; empty equations | **SKIP**: no reference output (diagram-only) |

### 2b. `tests/`

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

## 3. Reference output format

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

## 4. Tolerances used elsewhere, measured errors, and the recommendation

### 4.1 The suite's own scripts (`compare.py`, `regression-test.py`)

- Both use `isclose(ref, sim, rel_tol=1e-4)` in "weak" mode, which scales by the larger of |a| and |b|.
- Both pass a cell as near-zero when `|ref| ≤ 1e-6` (`regression-test.py`: `3e-6`) **and** `|sim| ≤ 1e-6`.
- Header names are lowercased and spaces become `_`.
- They ignore `saveper, initial_time, final_time, time_step` (and `regression-test.py` also ignores `time`, `months` and spaced variants).
- **Known bugs:**
  - A column missing from the simulation hits `break` without setting the error flag, so it silently passes.
  - `float('')` crashes on Vensim blank cells.
  - `compare.py` picks `,` whenever the header contains a comma.
  - LoopLab should not reuse these scripts. It should reuse only the 1e-4 threshold.

### 4.2 PySD

- `assert_allclose`: `|x − y| ≤ atol + rtol·|y|` with **defaults `rtol = 1e-5`, `atol = 1e-5`**, overridable per test (`pysd/tools/benchmarking.py`).
- It requires **identical column sets** and **identical time indices**, and forward-fills Vensim constant columns.
- Its XMILE integration list xfails:
  - `active_initial`;
  - `lookups_no-indirect`;
  - the 4 `macro_*` tests;
  - `smooth_and_stock` (the extra reference columns);
  - 8 `subscript_*` tests ("eqn with ??? in the model").
- It passes `rounding` and `non_negative_*` because those references encode PySD's own semantics (section 5).

### 4.3 Simlin

- Absolute epsilon **2e-3**. For Vensim VDF references it is relative 5e-6, floored at 2e-3.
- Near-zero guard: `|exp| ≤ 3e-6 && |act| ≤ 1e-6`.
- It ignores the 4 control columns and panics on any other expected variable missing from the output (`test_helpers.rs::ensure_results_excluding`).
- It disables `rounding` and `special_characters` (Vensim) as failing.
- It runs a **modified fork** of test-models (for example, its macro `.xmile` files do contain `<macro>` elements, and it adds XMILE ports of `delays`, `input_functions`, `time` and `builtin_int`). Its pass list is therefore not directly comparable to upstream.

### 4.4 Measured with an independent reference interpreter

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

### 4.5 Recommendation for DECISIONS.md

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

## 5. Semantic and format gotchas found in the files

### 5.1 Importer (XMILE parsing)

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

### 5.2 Engine semantics encoded by references

- **Operator precedence:** `-2^2 = -4` (`exponentiation`), because `^` binds tighter than unary minus. `^` is right-associative (`arithmetics_exp`: `30^1.2^1.2 = 68.92 = 30^(1.2^1.2)`). This matches the XMILE §3.3.1 precedence reported in `docs/research/xmile.md`.
- **INT and MOD (`rounding`):**
  - The reference uses **truncation** (`INT(-9.9) = -9`) and **sign-of-dividend modulo** (`-10 mod 3 = -1`). PySD maps XMILE `INT` to Vensim `integer()` (`int(x)`) and `MOD` to Vensim `modulo()`.
  - XMILE (per xmile.md, spec footnote 7) requires **floor** INT and **floored** MOD (−10 INT → floor; −10 mod 3 = 2).
  - LoopLab should follow the spec and skip `rounding`, recording the reason.
- **Comparisons and logicals** return 1/0. `=` is exact equality (`number_handling`: 3/4 = 0.75).
- **Stock initialisation:** stocks can be initialised from other stocks (`chained_initialization`), evaluated once at start.
- **INIT(x)** returns x's value at the start (`initial_function`). **SAFEDIV(a,b[,x])** returns 0 (or x) when b = 0 (`xidz_zidz`).
- **SMTH1/SMTH3** start at the input's initial value (`smooth_and_stock`, where the input is constant).

### 5.3 Declared method vs reference method

`zeroled_decimals.xmile` (a Vensim XMILE export) declares `method="RK4"`, but its reference comes from running the `.mdl` in Vensim with Euler.

- The difference is visible: the outflow `flow7 = Time` integrates to 0.5 per unit step under RK4, but to 0 at t = 1 under Euler.
- With Euler the reference is matched to 4e-15.
- Handle this through an explicit, logged per-fixture override in the manifest. Otherwise SKIP it with the reason "reference produced with Euler; file declares RK4".
- `rounding.xmile` also declares RK4, but has no stocks, so the method is irrelevant there.
- **No SUP file really exercises RK4.** RK4 correctness must come from the brief's analytic tests.

### 5.4 Non-negative stocks

The `non_negative_all` and `non_negative_stocks` references were made by PySD (`NonNegativeInteg.update: state = max(state, 0)`):
- the **stock is clipped after the update**;
- the **reported flow is not reduced** (`OutFlow` stays 28 while `TestStock0` sits at 0);
- a negative **inflow** is clipped too (`TestStock3`).

Both models also make **one flow the outflow of two stocks** (`OutFlow` drains TestStock0 and TestStock1; `if_else` drains TestStock2 and TestStock3). A one-source/one-sink flow schema cannot represent that.

- My interpreter reproduces these 4 files only with clip semantics. Outflow limiting fails `non_negative_stocks` by up to 37.25.
- `docs/research/xmile.md` recommends spec-intent outflow limiting, which conserves material. Under that choice, these dirs are rightly SKIPPED.
- The non_negative flag therefore has **no SDXorg coverage**. LoopLab needs its own non-negative fixtures.
- The only XMILE-bearing SUP files that carry `non_negative` (teacup) never make it bind.

### 5.5 Other semantic notes

- **Save interval:** every XMILE-bearing reference is saved at every DT. The only SAVEPER ≠ DT test (`euler_step_vs_saveper`, SAVEPER = 1, DT = 1/32) is `.mdl`-only and out of scope.
- **ACTIVE INITIAL:** `active_initial.xmile` is not equivalent to its `output.tab` (45 vs 0 at t = 0). `output_stella.csv` matches the XMILE, but it is not the canonical file.
- **Vensim PULSE:** Vensim `PULSE(start, width)` (1 for `width` time units) differs from XMILE `PULSE(magnitude, first[, interval])` (magnitude/DT for one DT). There is no upstream XMILE PULSE test; the only XMILE PULSE is in the skipped hares module sample. See `docs/research/xmile.md`.

## 6. Coverage gaps and an optional supplement

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

## 7. License and vendoring recommendation

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

## 8. Counts

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

## 9. Method and limitations

- **Inventory:** I read the README, LICENSE, AUTHORS, `compare.py`, `regression-test.py`, `xmile.bash` and every test README contributions table. I parsed all 123 XMILE-format files with Python ElementTree, injecting `xmlns:isee` where it was missing, and extracted `sim_specs`, variable kinds, gf, `non_negative`, dimensions, modules, macros and the function names in `<eqn>`. I checked every reference file for delimiter, line endings, headers, row counts, blank cells and LFS pointers.
- **Reproduction:** the throwaway interpreter in section 4.4 lived in the session scratchpad. It is research evidence only, not a LoopLab component, and no product code was written. Its numbers show what a *correct* double-precision implementation achieves against these references. LoopLab's own harness must re-measure with the real engine.
- **Unverified:** I could not read the OASIS spec directly because the proxy blocks it. Statements about XMILE INT/MOD, precedence and non-negative intent rely on `docs/research/xmile.md` and on the behaviour of PySD and Simlin.
