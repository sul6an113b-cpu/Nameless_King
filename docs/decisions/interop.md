# interop — design decisions

## Report (SPEC §6.8) — `packages/core/src/report/`

- **One block list, two renderers.** `build.ts` assembles the brief as blocks (`doc.ts`); `renderMarkdown` and `renderHtml` print the same blocks, so the two outputs cannot drift. Sections, in pyramid order: Recommendation → Key loops → Leverage ranking → Evidence (health, sensitivity, Monte Carlo, loop dominance) → Simulation results → Appendix. A section with no input prints a one-line placeholder, so the headings are always there.
- **Charts are SVG strings from `svg.ts`** (line, band, tornado, Pareto): fixed light Okabe–Ito palette, series thinned to ≤ 320 points, non-finite values break a line, every label XML-escaped. In HTML they are inline; in Markdown they are `data:image/svg+xml` images (percent-encoded, parentheses escaped) so the `.md` is one self-contained file.
- **Model text is data.** HTML escapes every text node; Markdown backslash-escapes inline markup, `<`/`>`, `[`/`]` and line-start block markers (heading, list, rule, setext, fence, ordered list), but leaves in-word underscores and numbers such as `0.25` alone. The HTML page also carries a `Content-Security-Policy` meta (`default-src 'none'; img-src data:; style-src 'unsafe-inline'`), so even a missed escape could not run a script when the file is opened on its own.
- **Meadows level is printed as a number** (12 = parameters … 1 = paradigm) with a one-line key, because core must not depend on `@looplab/content` for the level names.
- **Sources** are three fixed plain-text references (Meadows 1999, Sterman 2000, Schoenberg–Hayward–Eberlein 2023 as cited in SPEC §6.6); no bibliography data lives in core.
- **`toCsv`** writes `time` + one column per saved variable, numbers with `String(n)` (round-trip exact), NaN as an empty cell. A header starting with `= + - @` gets a `'` prefix so a spreadsheet never reads a variable name as a formula.
- **`kpiComparison`** (exported) is the one place that decides "better / worse / same" against the first run by KPI goal (minimize, maximize, target); both the report's results table and the Decide stage use it.
