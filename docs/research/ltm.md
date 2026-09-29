# Loops That Matter (LTM): method research for LoopLab

Phase 0 research note (planning only; no product code). Accessed 2026-09-29.
Owner: research subagent. Consumer: `analysis` agent (Phase 3, `packages/core/src/analysis`) and SPEC author.

**Bottom line**

1. The method is fully specified in the primary sources I read, so it is not a blocker.
2. LoopLab must use the **2023 revised flow→stock link score** (Schoenberg, Hayward & Eberlein 2023), not the 2020 original.
   - With the 2020 formula, a logistic model built from separate `births` and `deaths` flows **never** hands dominance to its B loop. R only tends toward 50%. That would fail the brief's acceptance criterion. See §5.2.
   - With the 2023 formula, dominance shifts exactly when the net flow peaks (P ≈ K/2).
3. Several open points need decisions rather than more research: time labeling, dt scaling in Eq. 3 (2023), the RK4 status, and how the loop set is chosen when the 1,000-loop cap is hit. They are listed in §9.

---

## 0. Sources actually read (provenance)

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

## 1. Link score for non-integration links x → z, where z = f(x, y, …)

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

## 2. Link score for flow → stock links

### 2.1 Original formulation (P1 Eqn 2, p. 166). Deprecated by P2.

```
Inflow:  LS(i→s) = | i / (i − o) | · (+1)
Outflow: LS(o→s) = | o / (i − o) | · (−1)
```

- Score is 0 if the net flow (i − o) = 0 (p. 166).
- Fig. 1 (p. 171) uses the flows' **previous** values: `source.previousValue / sumOfFlows`.
- **Discrepancy inside P1.** Fig. 1 assigns `-ABS(...)` to inflows and `+ABS(...)` to outflows. That contradicts Eqn 2 and Table 3, where `Adopting → adopters = +1.000` and `Adopting → potential adopters = −1.000`. **Follow Eqn 2 and Table 3.**

### 2.2 Revised formulation (P2 Eq. 3, p. 144). Use this one.

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

## 3. Loop score and relative loop score

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

## 4. Dominance and "% contribution"

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

## 5. Worked examples and test oracles

### 5.1 Exponential growth (single loop): 100% at every scored step

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

### 5.2 Logistic growth: dominance shift, and why the 2023 formula is required

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

### 5.3 Linear births and deaths (P4 pp. 11–12)

Model: `births = P·0.1`, `deaths = P/20`.
- The birth rate of 0.1 is inferred from P4: a lifetime of exactly 10 gives equilibrium.
- Both formulas give relR = 0.1/(0.1 + 0.05) = 2/3 and relB = −1/3, constant over time. My numeric check gives 0.6667 / −0.3333.
- P4 prints "67%" and "35%".
- If average lifetime = 10 exactly, there is no change, so no loops are reported (P4 p. 13). This is the LTM equilibrium limitation (P1 p. 183).

### 5.4 Bass diffusion: P1 Table 3 (p. 173), a numeric fixture reproduced to 4 significant digits

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

### 5.5 Other published examples (qualitative use only)

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

## 6. Loop discovery for large models

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

## 7. Practical implementation notes

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

## 8. Minimal algorithm (pseudo-code, 2023 formulation)

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

## 9. UNVERIFIED items and decisions to log

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
