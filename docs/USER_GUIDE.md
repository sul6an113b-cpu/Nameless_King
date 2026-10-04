# LoopLab user guide

LoopLab is a local workbench for systems thinking, from a problem statement to a decision brief. You frame the problem, draw a causal loop diagram (CLD), let LoopLab find every feedback loop and likely archetype, quantify the model as a stock-and-flow diagram (SFD), simulate and stress-test it, and compare interventions ranked by leverage. A Claude copilot can help at every stage. It only ever *proposes* changes, and you accept or reject each one.

Two principles run through the tool:

- **One model, two lenses.** There is a single model. The CLD view (qualitative) and the SFD view (quantitative) are two views of it, so they can never disagree. Only the layout differs between them.
- **Simple by default, powerful on demand.** Defaults run without configuration: Euler integration, DT = ¼ time unit, auto-layout, and a cap of 1,000 loops. Advanced options are collapsed. Every ranking is sorted by impact and has a cumulative (Pareto) line, so the vital few come first.

## Screen layout

The screen is designed for 1280 × 800 and has four areas:

- **Top bar.** Model name, save status, undo/redo, light/dark theme, and the file menu.
- **Left rail.** The six stages: **Frame · Map · Analyze · Quantify · Test · Decide**. Each stage shows only its own tools. You can move between stages freely; the order is a guide, not a gate.
- **Main area.** The canvas or work area of the current stage.
- **Right dock.** Two tabs. **Inspector** shows the properties of whatever is selected. **Copilot** is the Claude side panel. The dock can be collapsed.

Common actions never open a modal dialog. You rename inline, edit in the Inspector, and messages appear as non-blocking toasts.

## Getting started

- **Open an example.** Use the examples menu. Each bundled model is ready to simulate. Their parameter values are illustrative, not data from real projects.
  - **EPC project rework cycle.** Why reported progress runs ahead of true progress, and why the last 10 % takes so long. The worked example at the end of this guide uses it.
  - **Engineering → procurement → construction handoff.** Piping spools pass through engineering, a procurement delay and installation. It shows idle crews, and why the lead time is the lever.
  - **QC inspection and NCR backlog.** An inspection queue with a repair-and-reinspect loop. It shows why the backlog outlives the construction peak.
  - **Tank draining (Torricelli's law).** A physical model with an exact solution, for checking integration accuracy (Euler vs RK4).
- **Start empty.** Begin in **Frame** and work down the rail.

---

## 1. Frame

Before drawing anything, state what you are trying to understand.

- **Problem statement and purpose.** One or two sentences each. Describe the problem as a behaviour over time ("reported progress stalls at 90 % for months"), not as a missing solution ("we need more engineers").
- **Time horizon.** Start, stop and time unit, for example 0–120 weeks. The horizon must be long enough for delayed effects to show. As a rule of thumb, use several times the longest delay in the system. These values are the model's simulation settings; DT and the integration method live under the collapsed advanced options.
- **KPIs.** The few variables you judge success by. Mark each one *minimize*, *maximize* or *target* (with a value). KPIs are what the Test and Decide stages compare.
- **Reference modes.** The behaviour over time you are trying to explain. There are two ways to add one:
  - Sketch it on the sketch pad and label it *historical*, *expected*, *feared* or *hoped*.
  - Import it from a CSV of time and value columns.

  Reference modes appear behind the simulation results, and calibration can fit the model to CSV data.
- **Boundary chart.** Lists what is inside and outside the model:
  - *Endogenous*: variables on or driven by feedback loops. Computed from the model.
  - *Exogenous*: inputs from outside. Computed from the model.
  - *Excluded*: things you deliberately left out, each with a reason. You fill in this list.

  Reviewing the excluded list is one of the cheapest ways to catch a wrong model boundary.

## 2. Map

Draw the causal loop diagram: variables connected by causal links.

- **Variables** are nouns that can go up or down, such as "Schedule pressure" or "Undiscovered rework". Avoid verbs and fixed states ("pressure increases", "bad quality"). Names are case-insensitive, spaces and underscores count as the same character, and builtin function names such as TIME or MIN are reserved.
- **Links** carry four properties:
  - **Polarity.** `+` means the effect moves in the same direction as the cause (all else equal); `−` means the opposite direction. `?` means unknown; loops through an unknown link are typed `U` until you decide.
  - **Delay mark.** Set it where the effect takes noticeably long to show. Delays are where most surprising behaviour comes from.
  - **Mechanism note.** Explains *why* the link exists.
  - **Confidence.** Low, medium or high.
- **Auto-layout** arranges the diagram (`Shift+L`). Positions you drag are kept.
- **Keyboard shortcuts.**

| Key | Action |
|---|---|
| `A` | add variable |
| `L` | link mode |
| `P` | flip polarity of the selected link |
| `D` | toggle delay mark |
| `Del` / `Backspace` | delete selection |
| `⌘/Ctrl+Z` | undo |
| `⇧⌘Z` / `Ctrl+Y` | redo |
| `Shift+L` | auto-layout |
| `F` | fit view |
| `?` | shortcut sheet (non-modal) |

Tips:
- Close every loop you believe exists. An open chain explains nothing dynamic.
- A loop with an even number of `−` links is reinforcing (R); an odd number makes it balancing (B).

## 3. Analyze

LoopLab analyses the structure you drew.

- **Loop list.** Every feedback loop is found and classified R or B (U if it passes through a `?` link). You can name a loop, and selecting it highlights it on the canvas.
  - The search stops at the loop cap (default 1,000, set in the model settings) and shows a warning, so a huge graph never freezes the app.
  - Self-loops, such as a stock draining itself, are included.
- **Loop participation and betweenness.** For each variable: how many loops pass through it, and how often it lies on the shortest paths between other variables. Variables high on both are structural hubs.
- **Archetype candidates.** LoopLab compares the loop structure with the eight system archetypes and lists candidates, each with its matching loops and a role mapping (e.g. *problem symptom* → "Schedule pressure"). A candidate is only a hint. **Confirm** it if the story fits, **reject** it if not. Confirmed archetypes bring their intervention guidance into Decide.
- **Structural leverage map.** Variables ranked by a structural score that combines loop participation, betweenness and delay/stock position. The Pareto view shows how few variables carry most of the structure.

**The archetype library.** Each archetype comes with:
- a CLD (Kim's template) and a runnable SFD;
- a behaviour-over-time signature;
- intervention guidance tagged with Meadows levels;
- one generic illustration and one EPC illustration.

| Archetype | Core structure | Signature behaviour of its KPI |
|---|---|---|
| Fixes that Fail | quick fix (B) + delayed side effect feeding the symptom (R) | better before worse |
| Shifting the Burden | symptomatic (B) and fundamental (B, delayed) solutions; the symptomatic one erodes the fundamental one (R) | fundamental capability decays (goal seeking toward a low level) |
| Limits to Growth | growth engine (R) meets a limit (B) | S-shaped growth |
| Eroding Goals | close the gap by acting (B, slow) or by lowering the goal (B, fast) | the goal drifts down without levelling off |
| Escalation | two balancing responses to each other's position, forming a reinforcing figure-8 | escalation (ever faster growth on both sides) |
| Success to the Successful | two reinforcing loops coupled through one allocation | divergence from a near-balance |
| Tragedy of the Commons | individual growth loops (R) sharing one limited resource (B) | overshoot and collapse of total gain |
| Growth and Underinvestment | growth (R) limited by capacity, investment tied to an eroding standard | growth then stagnation |

Sources: Senge (1990) *The Fifth Discipline*; Kim (1992) *Systems Archetypes I*; Meadows (2008) *Thinking in Systems*, ch. 5; Sterman (2000) *Business Dynamics*, ch. 4.

## 4. Quantify

Turn the CLD into a stock-and-flow model. It stays the same model: you give each variable a *kind* and an equation.

| Kind | Meaning | Equation holds |
|---|---|---|
| **Stock** | an accumulation: backlog, work done, capacity | its initial value |
| **Flow** | a rate into or out of stocks; draw it between a stock and another stock or a cloud | the rate |
| **Auxiliary** | an intermediate calculation | an expression |
| **Constant** | a fixed number | a number; optionally a min–max **uncertainty range**, used by sensitivity and Monte Carlo |
| **Lookup** | a graphical function (table), edited in the lookup editor | nothing; call it as `LOOKUP(name, x)` or `name(x)`. An auxiliary or flow can also carry its own table, applied to its equation's result |

Connecting a flow to a stock creates the matching causal link automatically: `+` into the stock it fills, `−` into the stock it drains. A variable still of kind *variable* (unquantified) is shown dashed and blocks simulation until you quantify it.

### Equation language (quick reference)

- **Names.** Write names with `_` for spaces, e.g. `Work_to_do / Time_remaining`, or in double quotes: `"Work to do"`. Names are case-insensitive. The editor autocompletes variable and function names.
- **Operators**, strongest first:
  - `^`
  - unary `-` and `NOT`
  - `*`, `/` and `MOD`
  - `+` and `-`
  - comparisons (`<`, `<=`, `>`, `>=`)
  - `=` and `<>`
  - `AND`, then `OR`
  - `IF c THEN a ELSE b`
- **Test inputs:**
  - `STEP(height, time)`
  - `PULSE(volume, first[, interval])`: the volume arrives within one DT
  - `RAMP(slope, start[, end])`
- **Delays and smooths:**
  - `SMTH1` (alias `SMOOTH`) and `SMTH3` (alias `SMOOTH3`): information delays (perceptions)
  - `DELAY1` and `DELAY3`: material delays, which conserve what flows through them
  - `SMTHN` and `DELAYN` (*n* stages)
  - `DELAY(input, τ)`: a fixed pipeline delay
  - `PREVIOUS`
  - `INIT`
- **Maths:** `MIN(a, b)`, `MAX(a, b)`, `ABS`, `EXP`, `LN`, `LOG10`, `SQRT`, `INT`, `SIN`/`COS`/`TAN` and their inverses, `PI`, `SAFEDIV(a, b[, x])`.
- **Time:** `TIME`, `DT`, `STARTTIME`, `STOPTIME`.
- **No random functions.** Uncertainty is explored in the Test stage, which keeps every run reproducible.
- **Units.** Examples: `tasks`, `tasks/week`, `tasks/(people*week)`, `1/month`, `meter^2`, `dmnl` (dimensionless).
  - Time units: `second`, `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`.
  - Declare your own base units (tasks, people, USD, …) in the model's unit list.
  - A stock's units must equal its flows' units × time.

### Model Health

The Model Health panel checks the model continuously and points at the elements involved:

- **Unit consistency**: operands of `+`, `−`, comparisons and MIN/MAX; flows against their stocks.
- **Undefined or unused variables**, and **links that do not match equations**. A variable should have a link from exactly the variables its equation uses.
- **Algebraic loops**: a cycle of auxiliaries and flows with no stock or delay in it. The cycle is named.
- **Integration-error test**: the model is re-run at DT/2, and any stock that moves by more than 1 % (adjustable) is flagged. If it fires, reduce DT to at most a quarter to an eighth of the shortest time constant.
- **Assertions you write**, for example `Work_to_do >= 0`. They are checked at every saved step, and the first violation is reported.
- **Polarity consistency**: the sign implied by an equation is compared with the polarity you drew. For example, if you drew `Quality → Flawed work` as `+` but the equation is `Work_rate * (1 - Quality)`, it is flagged.
- **Numeric problems**: NaN or infinite values, such as division by zero.

## 5. Test

Simulations run in a background worker, so the interface stays responsive.

- **Run and compare.** Choose Euler (default) or RK4, and change DT or the horizon if needed. Keep runs to compare them on the same chart. Reference modes are drawn behind the results.
  - RK4 is more accurate for smooth models but loses its advantage near discontinuities (STEP, PULSE, RAMP, time-based IF, discrete tables). Model Health warns when RK4 is combined with those.
- **Scenarios.** Named sets of overrides, such as a different constant value or a different equation, optionally with their own simulation settings.
- **One-at-a-time sensitivity.** Each constant with an uncertainty range is set to its minimum and then its maximum while everything else is held at base values. The result is a **tornado** chart of KPI swing, plus a **Pareto** line showing how few parameters carry most of the uncertainty.
- **Monte Carlo.** Many runs with Latin Hypercube samples of all uncertain constants. Seeded, so results are reproducible. Runs happen in parallel workers with progress and a cancel button. Results:
  - **5–95 % bands** around the median;
  - **importance**: the Spearman rank correlation of each parameter with the KPI.
- **Loop dominance.** Uses the published *Loops That Matter* method: each loop's share of the change in the model at each time step. A loop is dominant when its share reaches 50 %; otherwise the smallest set of loops that together reach 50 % is shown. Use this to see, for example, when a growth engine hands over to a limit.
- **Calibration.** Fits selected constants, within their ranges, to CSV reference data using Nelder–Mead. Reports R², MAPE and the Theil inequality statistics (Um, Us, Uc):
  - a large Um means bias;
  - a large Us means wrong amplitude or trend;
  - an error concentrated in Uc is unsystematic noise, which is what you want.

## 6. Decide

- **Interventions.** Record each intervention you consider. Each one carries:
  - its **Meadows leverage level** (12 = weakest … 1 = strongest);
  - a scenario that tests it (pick one from the list, or make one with **Add scenario**: a name, one constant and its new value);
  - a status: *idea → tested → recommended* (or *rejected*);
  - a rationale.
- **Side-by-side comparison.** The KPIs of the tested scenarios against the base run.
- **Report export** (Markdown, and print-to-PDF). The report is in pyramid order: the recommendation first, then the loops that explain the problem, the leverage ranking, the evidence (health, sensitivity, Monte Carlo, loop dominance), the simulation charts, and finally an appendix with the model listing, assumptions and sources.

**Meadows' leverage points** (Meadows 1999), weakest to strongest:

| Level | Place to intervene |
|---|---|
| 12 | Constants, parameters, numbers (such as subsidies, taxes, standards) |
| 11 | The sizes of buffers and other stabilizing stocks, relative to their flows |
| 10 | The structure of material stocks and flows (such as transport networks, population age structures) |
| 9 | The lengths of delays, relative to the rate of system change |
| 8 | The strength of negative feedback loops, relative to the impacts they are trying to correct against |
| 7 | The gain around driving positive feedback loops |
| 6 | The structure of information flows (who does and does not have access to information) |
| 5 | The rules of the system (such as incentives, punishments, constraints) |
| 4 | The power to add, change, evolve, or self-organize system structure |
| 3 | The goals of the system |
| 2 | The mindset or paradigm out of which the system — its goals, structure, rules, delays, parameters — arises |
| 1 | The power to transcend paradigms |

Most proposed fixes on projects sit at level 12: more people, a new target date, a higher quota. They are easy to test, and they are often the least effective. Before recommending one, check whether a delay (9), an information flow (6) or a rule (5) addresses the same loop more durably.

## Copilot

The copilot is a Claude side panel, available in every stage. It needs an Anthropic API key in the local `.env` file (see README). The key stays in the local server and never reaches the browser. Without a key, everything else works and the panel says the copilot is not configured.

**Modes:**

| Mode | What it does |
|---|---|
| **Interview** | Asks Socratic questions to draw out your dynamic hypothesis, then proposes a CLD |
| **Critique** | Checks your model for convention and logic errors. Each finding cites the element ids concerned |
| **Explain** | Writes a plain-language narrative for each loop |
| **Intervene** | Proposes interventions with their Meadows level. It must simulate each one before proposing it |
| **Report** | Drafts the decision brief |

**How it works.**
- **Tools.** The copilot can call read-only tools on your current model, at most 8 per request: model summary, loops, health, simulating a scenario, and later sensitivity and leverage. The tool trace is shown, so you can see where every number came from. The copilot may cite only numbers returned by these tools, and it labels hypotheses as hypotheses.
- **You decide.** Proposed changes arrive as a patch, drawn as a highlighted diff on the canvas. Accept or reject each operation, or all at once. Nothing changes until you accept. Accepted elements stay tagged *AI-proposed* until you mark them confirmed.
- **Bad output changes nothing.** If the copilot's answer is malformed, it retries once; if it fails again, you see an error and the model is untouched.
- **Untrusted text.** Model text and imported files are treated as data, never as instructions to the copilot.

## Files, import and export

| What | How |
|---|---|
| **Autosave** | The model is saved in the browser (IndexedDB) shortly after every change; the top bar shows the save status |
| **Undo / redo** | Up to 200 steps (`⌘/Ctrl+Z`, `⇧⌘Z` / `Ctrl+Y`) |
| **Save / open** | A versioned JSON model file. Files from older versions are migrated when opened. Files from a newer version, and invalid files, are rejected with a clear message and nothing changes |
| **XMILE import / export** | A documented subset of XMILE 1.0, the exchange format of Stella and other SD tools. Arrays, macros, submodules, conveyors/queues/ovens and random functions are rejected with a specific message. Link polarity, delay marks and LoopLab-only data (frame, notes, scenarios, interventions, loop names) round-trip, so a round trip gives identical simulation results |
| **Diagram export** | PNG or SVG of the current canvas |
| **Results export** | CSV of the simulated series |
| **Report export** | Markdown and print-to-PDF (see Decide) |

---

## Worked example: an EPC engineering package that is "90 % complete" for months

Open **EPC project rework cycle** from the examples menu. The model represents one engineering package of 1,000 tasks (deliverables), 10 engineers and a 52-week deadline. All values are illustrative, not project data. The pattern follows the rework-cycle structure described in the project-dynamics literature (Lyneis & Ford 2007).

**1. Frame.**
- **Problem.** Reported progress reaches about 90 % close to the deadline and then crawls, while the real end date slips by months.
- **KPIs.** *True progress* (target 1), *Undiscovered rework* (minimize) and *Schedule pressure* (target 1).
- **Reference mode.** A *feared* sketch of reported progress stalling near 90 %.
- **Excluded items.** Hiring and training, client scope changes, fatigue as a separate effect, and knock-on effects on procurement and construction. Each has a reason. Read them: they tell you what this model cannot answer.

**2. Map.** Switch to the CLD lens. Three loops matter:
- **Rework cycle (R).** Work rate → flawed work → undiscovered rework → rework discovery → work to do → work rate. Every flawed task comes back later.
- **Work harder (B).** Work to do → schedule pressure → productivity → work rate → less work to do.
- **Haste makes waste (R).** Schedule pressure → lower quality → more flawed work → more rework → more work to do → more pressure.

Look at the mechanism note on *Schedule pressure*. It is computed from **visible** work only. Undiscovered rework counts as done until someone finds it.

**3. Analyze.** The loop list shows 10 loops: 4 reinforcing and 6 balancing. The rework cycle and haste-makes-waste loops are among the reinforcing ones. *Work to do* lies on 9 of the 10 loops; *Work rate*, *Schedule pressure* and *Flawed work* each lie on 6. That makes them the hubs of the structure. The archetype matcher may suggest **Fixes that Fail**, with pressure-driven haste as the fix and delayed rework as the unintended consequence. Confirm it if that matches your experience.

**4. Quantify.** Switch to the SFD lens:
- **Stocks:** Work to do (starts at the project scope), Work done, and Undiscovered rework.
- **Flows:** Work rate × Quality goes to Work done; Work rate × (1 − Quality) goes to Undiscovered rework; Undiscovered rework / Time to discover rework returns to Work to do.
- **Graphical functions:** two tables give the effects of schedule pressure on productivity (up to +25 %) and on quality (down to −30 %).

The Model Health panel should be clean. The two assertions (`Work_to_do >= 0`, `Undiscovered_rework >= 0`) hold.

**5. Test.** Run the base case. With these illustrative values:
- *Perceived progress* passes 90 % around week 53, right at the deadline.
- *True progress* reaches 99 % only around week 76, an overrun of about half a year.
- Schedule pressure climbs as the deadline approaches, quality drops, and undiscovered rework peaks near the deadline.

This is the reference mode, reproduced by the structure. Now stress-test it:
- **Tornado.** With the uncertainty ranges given on each constant, see which parameters swing the finish date most. Usually a few dominate; the Pareto line shows how few.
- **Monte Carlo.** Run it for bands on true progress. The spread tells you how much a single-point finish date is worth.
- **Loop dominance.** See which loops drive the behaviour as the deadline approaches and after it passes.

**6. Decide.** The example ships three interventions:

| Intervention | Meadows level | Base-run result (approx.) |
|---|---|---|
| **Add two engineers** | 12, a parameter | finish around week 65 |
| **Hold design reviews earlier** (time to discover rework 8 → 4 weeks) | 9, a delay | finish around week 66. Rework surfaces while there is still time to absorb it, and the peak of undiscovered rework drops by about 40 % |
| **Report progress on verified work only** | 6, an information flow | not simulated in the bundled model; see below |

The last intervention makes undiscovered rework visible to the people setting pressure. Testing it requires a structural change: let schedule pressure see estimated undiscovered rework. Try it yourself, or ask the copilot in *Intervene* mode to propose it as a patch and simulate it.

Compare the scenarios side by side. Then write the recommendation, for example: *hold reviews early and report verified progress; add staff only if the finish date still misses*. Export the report. It opens with the recommendation, then the loops that explain it, the leverage ranking and the evidence.

Beyond these three, a fourth scenario (*Plan for rework*, deadline 64 weeks) finishes only slightly earlier than the base run. A realistic plan removes the pressure but not the rework itself.

## References

- Kim, D. H. (1992). *Systems Archetypes I: Diagnosing Systemic Issues and Designing High-Leverage Interventions*. Pegasus Communications.
- Lyneis, J. M., & Ford, D. N. (2007). System dynamics applied to project management: a survey, assessment, and directions for future research. *System Dynamics Review*, 23(2–3), 157–189.
- Meadows, D. H. (1999). *Leverage Points: Places to Intervene in a System*. The Sustainability Institute.
- Meadows, D. H. (2008). *Thinking in Systems: A Primer*. Chelsea Green.
- Senge, P. M. (1990). *The Fifth Discipline: The Art and Practice of the Learning Organization*. Doubleday/Currency.
- Sterman, J. D. (2000). *Business Dynamics: Systems Thinking and Modeling for a Complex World*. Irwin/McGraw-Hill.
