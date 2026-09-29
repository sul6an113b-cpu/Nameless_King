# XMILE 1.0: research notes for LoopLab import/export

**Phase 0 research. Planning only, no product code.** Written 2026-09-29 by a research subagent.
Anything I could not confirm from a primary source is marked **UNVERIFIED**. Section numbers (§) refer to the
OASIS Standard text I actually read (source S1 below). I did not make up any section numbers.

---

## 0. Sources, and what was actually read

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

## 1. File structure

### 1.1 Root element and namespace (§2, §2.1)
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

### 1.2 `<header>` (§2.2, §2.2.1)
- REQUIRED: `<vendor>` and `<product version="…" lang="…">`. The product version is REQUIRED. `lang` is ISO 639-1 and defaults to English.
- OPTIONAL: `<options>`, `<name>`, `<version>`, `<caption>`, `<image>`, `<author>`, `<affiliation>`, `<client>`, `<copyright>`, `<contact>`, `<created>`/`<modified>` (ISO 8601), `<uuid>` (RFC 4122), `<includes>`.
- `<options namespace="std, isee">` holds the conformance flags. §2.2.1: "If a file makes use of any of the following functionality, it MUST be listed": `<uses_conveyor/>`, `<uses_queue/>`, `<uses_arrays maximum_dimensions="…"/>`, `<uses_submodels/>`, `<uses_macros recursive_macros="…" option_filters="…"/>`, `<uses_event_posters/>`, `<has_model_view/>`, `<uses_outputs/>`, `<uses_inputs/>`, `<uses_annotation/>`.
  - Real files often **omit** these flags even when they use the features (for example, arrays without `uses_arrays`). **Do not rely on them for rejection.** Detect features structurally.
  - The spec is inconsistent with itself here: §2.2.1's sample has `<uses_conveyors leak="true"/>` (plural), and §7.2.4 says `<uses_array>`. **Accept singular and plural forms.**

### 1.3 `<sim_specs>` (§2.3, §3.4, §3.4.1)
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

### 1.4 `<model_units>` (§2.4, §3.3.6)
```xml
<model_units>
  <unit name="People"><eqn/><alias>person</alias><alias>persons</alias></unit>   <!-- Stella writes <eqn/> for primary units -->
  <unit name="models_per_year"><eqn>models/year</eqn><alias>mpy</alias></unit>
  <unit name="Joules" disabled="true"><alias>J</alias></unit>
</model_units>
```
- Each unit has a name, an optional equation and zero or more aliases. `disabled="true"` removes the unit from substitution. Circular definitions and repeated aliases are forbidden.
- See section 6 for the unit expression syntax.

### 1.5 `<behavior>` (§2.6)
- "Support for behaviors is REQUIRED". Behaviors cascade: entity, then model `<behavior>`, then file `<behavior>`, then XMILE default.
- The example is `<behavior><non_negative/></behavior>` (all stocks and flows), or `<behavior><flow><non_negative/></flow></behavior>` (flows only). An entity can switch it off locally with `<non_negative>false</non_negative>` (§4.2, §4.3).
- SDXorg `non_negative_*` tests use exactly these forms, including `<non_negative> false  </non_negative>` and `FALSE  `. **Trim the text and compare case-insensitively.**

### 1.6 `<data>` (§2.8): *not* a general extension area
`<data>` holds persistent CSV, Excel or XML **import/export connections**: `<import>`/`<export>` with `type`, `enabled`, `frequency`, `orientation`, `resource`, `worksheet`, `interval`, and `<all/>` or `<table uid=…/>`. **Do not put LoopLab metadata in `<data>`.** See section 1.13.

### 1.7 `<model>` and `<variables>` (§4 intro, §4.1)
- Child order is mandatory: "sub-tags MUST appear in this order": `<sim_specs>`?, `<behavior>`?, `<variables>` (REQUIRED), `<views>`?.
- The root model is unnamed and every other model MUST be named. More than one model means submodels (footnote 15: `<uses_submodels>` MUST be set).
- The `<model>` attributes `resource=` (external file) and `encryption-scheme`/`iv`/`hmac` (AES-128-CBC encrypted model) are both **rejected by LoopLab**.
- Common variable properties (§4.1):
  - `name` is REQUIRED and unique within the model.
  - `<eqn>` is the equation, which for a stock is the **initial value**.
  - `<units>`, `<doc>` (plain text with XMILE escapes `\n` `\t` `\\`, or HTML "with the proper HTML header"), `<mathml>`, `<range min max>`, `<scale min max>`, `<format>`, `<event_poster>`, `access=`, `autoexport=`, `<dimensions>`, `<element subscript=…>`.

### 1.8 Variable elements
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

### 1.9 Documentation and units on variables
`<doc>` is free text or HTML (§3.3.5, §4.1). Treat it as **untrusted**: never render it as live HTML without sanitising. `<units>` holds a unit expression (see section 6). Neither affects simulation.

### 1.10 Identifiers (§3.2.2)
- **Form** (§3.2.2.1): letters, digits, `_`, `$` and Unicode characters above 127. An identifier must not start with a digit or `$` (units are an exception) and must not start or end with `_`. Anything else must be in double quotes. Inside quotes the only escapes are `\"`, `\n` and `\\`; any other backslash sequence makes the identifier invalid.
- **Equivalence** (§3.2.2.2): identifiers are **case-insensitive** (Unicode Collation Algorithm). Space, NBSP (U+00A0), newline and underscore are all whitespace and are equivalent to each other, and a run of whitespace counts as one character. So `wom_multiplier` = `"wom multiplier"` = `wom______multiplier`. En-space, em-space and full-width characters are NOT equivalent.
- **Qualified names** (§3.2.2.3): a `.` separates a namespace or module from a name, as in `std.MIN`, `isee.HISTORY` or `marketing.expenditures`. The top-level model is written `.cost` (§3.7.4).
- **Reserved** (§3.2.2.5): `AND`, `OR`, `NOT`, `IF`, `THEN`, `ELSE`, every built-in function name, and `std`.
- Real files: the `name` attribute holds the display form (`"teacup temperature"`, `"Stock with \n Newline Character"`), while equations and `<inflow>` refer to the underscore form (`teacup_temperature`) or a quoted form (`"Aux_with_$peC!@|_characters"`). Views refer to names with underscores.

### 1.11 Expression grammar (§3.2.1, §3.3)
- **Numbers**: `[digit]+[.[digit]*] | [digit]*.[digit]+` with an optional `E|e[+|-]digits`. There is no leading sign; a leading minus is the unary operator. `14.`, `.375` and `6E5` are all valid.
- **Precedence**, highest first (§3.3.1): `[ ]`, `( )`, then `^` (**right-assoc**), then unary `+ - NOT`, then `* / MOD`, then `+ -`, then `< <= > >=`, then `= <>`, then `AND`, then `OR`. The consequence is that **`-2^2 = -4`**, because `^` binds tighter than unary minus. The printer must parenthesise to match.
- Logical, relational and equality operators return 0 or 1. **MOD is the floored modulus** (the result takes the sign of the divisor). Footnote 7: "INT function … must return the floor", and `a = INT(a/b)*b + a MOD b`.
- Parameterless builtins are written without parentheses: `TIME`, `DT`, `PI`, `INF` (§3.3.2).
- **IF** (§3.3.3): the statement form `IF cond THEN expr ELSE expr` MUST be supported. Non-zero means true. The function form `if_then_else(c,a,b)` is an OPTIONAL vendor alternative that "should be implemented … using an XMILE macro". xmutil turns Vensim `IF THEN ELSE(c,a,b)` into `( IF c THEN a ELSE b )`.
- **Comments** (§3.3.4): `{ … }` may appear anywhere inside an expression and MUST be supported.
- Real files contain tabs and newlines inside `<eqn>` (xmutil adds trailing tabs), `&gt;`/`&lt;` entities, and lowercase builtins (`step(1, 1)`, `pulse(...)`). Builtin names are identifiers, so they are case-insensitive (see the SDXorg `function_capitalization` test).

### 1.12 Views (§5, §6.1): what a minimal exporter must write
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

### 1.13 Extensions and vendor namespaces
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

## 2. Built-in functions: exact semantics

### 2.1 What the spec requires (§3.5)
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

### 2.2 Test inputs

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

### 2.3 Smooths (the brief's "SMOOTH" is XMILE `SMTH1`)
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

### 2.4 Delays
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

### 2.5 Other builtins in the brief's list
- **MIN(x, y) / MAX(x, y)**: exactly 2 arguments in the scalar subset. The 1-argument form (array) is rejected.
- **IF c THEN a ELSE b**: see section 1.11. Stateful builtins inside a branch (for example `IF x THEN SMTH1(a,5) ELSE 0`) must be **hoisted into implicit stocks that update every DT, whichever branch is taken**, because XMILE treats them as stocks (§3.6.1, §5.1.2). Simlin does this with stdlib modules.
- **TIME, DT, STARTTIME, STOPTIME** (§3.5.5) are constants except TIME. Under RK, TIME returns intermediate stage times (see section 3.3).
- **INIT(x)** (§3.5.6): "initial value (i.e., value at STARTTIME) of a variable". It is frozen after the initialisation pass.
- **PREVIOUS(x, init)** (§3.5.6): returns "the value of price in the last DT, or zero in the first DT". It breaks dependency cycles.
- **Math**: ABS, EXP, LN, SQRT, LOG10, INT (floor) and MOD (floored). The spec does not say what happens outside a function's domain or on division by zero. **UNVERIFIED** vendor behaviour (IEEE NaN/Inf vs 0). LoopLab: use IEEE results and have Model Health flag NaN/Inf.

---

## 3. Integration, initialisation and evaluation order

### 3.1 What the spec says
- §3 intro: all variables are floating point, and IEEE-754 double is RECOMMENDED.
- §3.1.1: "stock_t = stock_{t−dt} + dt×(inflows_{t−dt} – outflows_{t−dt}) … The above computation is notional, though it is used in one of the specified integration techniques (Euler)."
- §3.1.1 on initialisation: the initial value is "either a constant or with an initial equation. The initial equation is evaluated only once, at the beginning of the simulation." §4.2: non-constant initial equations use the *initial values* of the variables they reference.
- §3.4.1 names the methods only. It does not give RK4 formulas, nor stage times, nor any rule for discontinuities.
- §7.3.1: a simulator "MUST support Euler's method and Runge-Kutta 4".
- **The spec is silent on:** evaluation order, how algebraic loops are handled, how many steps to take when (stop−start)/DT is not an integer, how flows are reported at STOPTIME, and division by zero.

### 3.2 Recommended engine rules (the de-facto convention, as implemented in Simlin and PySD)
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

### 3.3 RK4 and discontinuities (a gotcha)
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

### 3.4 `non_negative` (§3.6.2, §4.2, §4.3, §4.8.4)
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

## 4. Conformance and the proposed LoopLab subset

### 4.1 What "XMILE 1.0 compliant" requires (§7)
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

### 4.2 Proposed documented subset

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

## 5. Round-trip rules (JSON → XMILE → JSON with identical results)

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

## 6. Name normalisation and unit syntax

### 6.1 Canonical identifier key (derived from §3.2.2; used for matching only, the display name is kept separately)
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

### 6.2 Unit expressions (§3.3.6)
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

## 7. SDXorg XMILE inventory (for the interop agent)
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

## 8. UNVERIFIED items (collected)
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
