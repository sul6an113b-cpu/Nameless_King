import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { XMLValidator } from 'fast-xml-parser';
import { buildModel, idOf } from '../../test/fixtures/sim/build.ts';
import type { HealthReport, LeverageRankRow, ReportInput, SimResult } from '../contracts.ts';
import { oatSensitivity, loopsThatMatter } from '../analysis/index.ts';
import { findLoops, structuralLeverage } from '../graph/index.ts';
import type { Model } from '../schema/model.ts';
import { compileModel } from '../sim/index.ts';
import { buildReport, kpiComparison, toCsv } from './index.ts';
import { csvField } from './csv.ts';
import { mdText } from './doc.ts';
import { bandChartSvg, lineChartSvg, paretoSvg, tornadoSvg } from './svg.ts';

/** Logistic growth: a reinforcing birth loop and a balancing crowding loop. */
function population(): Model {
  const m = buildModel(
    [
      { name: 'Population', kind: 'stock', eq: '10', units: 'people' },
      { name: 'Births', from: undefined, to: 'Population', eq: 'Population * Growth_rate', units: 'people/year' },
      { name: 'Deaths', from: 'Population', eq: 'Population * Population * Growth_rate / Capacity', units: 'people/year' },
      { name: 'Growth_rate', kind: 'constant', eq: '0.4', units: '1/year' },
      { name: 'Capacity', kind: 'constant', eq: '100', units: 'people' },
    ],
    { simSpec: { start: 0, stop: 20, dt: 0.25, timeUnit: 'year' } },
  );
  const rate = idOf('Growth_rate');
  return {
    ...m,
    name: 'Island population',
    variables: m.variables.map((v) => (v.id === rate ? { ...v, uncertainty: { min: 0.2, max: 0.6, distribution: 'uniform' as const } } : v)),
    frame: {
      ...m.frame,
      problem: 'The island fills up faster than the roads.',
      purpose: 'Decide whether to cap arrivals.',
      kpis: [{ id: 'k_pop', name: 'Population', varId: idOf('Population'), goal: 'minimize' }],
    },
    scenarios: [{ id: 's_cap', name: 'Cap arrivals', note: '', overrides: [{ varId: idOf('Capacity'), equation: '60' }], origin: 'user' }],
    interventions: [
      { id: 'i_cap', name: 'Cap arrivals', description: '', leverage: 6, scenarioId: 's_cap', status: 'recommended', rationale: 'Lowers the carrying capacity.', origin: 'user' },
      { id: 'i_ads', name: 'Run an ad campaign', description: 'More awareness.', leverage: 12, scenarioId: null, status: 'idea', rationale: '', origin: 'user' },
    ],
    decision: { recommendation: 'Cap arrivals at 60 people.', summary: 'Growth stalls at the cap.' },
  };
}

function simulate(model: Model, scenarioId?: string): SimResult {
  const scenario = model.scenarios.find((s) => s.id === scenarioId);
  const c = compileModel(model, scenario ? { scenario } : {});
  if (!c.ok) throw new Error(c.errors.map((e) => e.message).join('\n'));
  return c.compiled.simulate(undefined, { saveState: true });
}

function fullInput(model = population()): ReportInput {
  const c = compileModel(model);
  if (!c.ok) throw new Error('compile');
  const base = c.compiled.simulate(undefined, { saveState: true });
  const { loops } = findLoops(model);
  const structural = structuralLeverage(model, loops);
  const health: HealthReport = {
    ok: true,
    items: [{ check: 'unused', severity: 'warning', message: 'Capacity is barely used', elementIds: [] }],
  };
  const leverage: LeverageRankRow[] = structural.map((r) => ({
    varId: r.varId,
    score: r.score,
    cumulativeShare: r.cumulativeShare,
    evidence: Object.entries(r.components).map(([k, v]) => `${k} ${v.toFixed(2)}`),
  }));
  return {
    model: {
      ...model,
      loopAnnotations: [{ key: loops.find((l) => l.type === 'R')?.key ?? 'x', name: 'Baby boom', note: 'More people, more births.', origin: 'user' }],
    },
    loops,
    leverage,
    runs: [
      { name: 'Baseline', result: base },
      { name: 'Cap arrivals', result: simulate(model, 's_cap') },
    ],
    health,
    sensitivity: oatSensitivity(model, [{ varId: idOf('Growth_rate'), min: 0.2, max: 0.6 }], { varId: idOf('Population'), statistic: 'final' }).rows,
    monteCarlo: {
      time: base.time,
      bands: { [idOf('Population')]: { p5: base.series[idOf('Population')] ?? new Float64Array(), p50: base.series[idOf('Population')] ?? new Float64Array(), p95: base.series[idOf('Population')] ?? new Float64Array() } },
      importance: [{ varId: idOf('Growth_rate'), rho: 0.91 }],
      runs: 200,
      cancelled: false,
    },
    ltm: loopsThatMatter(model, c.compiled, base, loops),
    generatedAt: '2026-10-01T09:00:00Z',
  };
}

const HEADINGS = ['## Recommendation', '## Key loops', '## Leverage ranking', '## Evidence', '## Simulation results', '## Appendix'];

describe('buildReport', () => {
  const input = fullInput();
  const { markdown, html } = buildReport(input);

  it('puts the sections in pyramid order, recommendation first', () => {
    const at = HEADINGS.map((h) => markdown.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const h2 = [...html.matchAll(/<h2>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(h2).toEqual(['Recommendation', 'Key loops', 'Leverage ranking', 'Evidence', 'Simulation results', 'Appendix']);
  });

  it('opens with the title and the recommendation text', () => {
    expect(markdown.startsWith('# Island population: decision brief')).toBe(true);
    const rec = markdown.slice(markdown.indexOf('## Recommendation'), markdown.indexOf('## Key loops'));
    expect(rec).toContain('Cap arrivals at 60 people.');
    expect(rec).toContain('Growth stalls at the cap.');
    expect(rec).toMatch(/\| Cap arrivals \| 6 \| recommended \| Cap arrivals \|/);
    expect(rec).toMatch(/\| Run an ad campaign \| 12 \| idea \| not tested \|/);
  });

  it('lists loops with R/B type, handle and name', () => {
    const loops = markdown.slice(markdown.indexOf('## Key loops'), markdown.indexOf('## Leverage ranking'));
    expect(loops).toMatch(/\| R1 \| Reinforcing \| Baby boom \|/);
    expect(loops).toMatch(/\| B1 \| Balancing \|/);
    expect(loops).toContain('More people, more births.');
    expect(html).toContain('<td>Reinforcing</td>');
  });

  it('ranks leverage with a Pareto chart', () => {
    const lev = markdown.slice(markdown.indexOf('## Leverage ranking'), markdown.indexOf('## Evidence'));
    expect(lev).toContain('data:image/svg+xml');
    expect(lev).toMatch(/\| 1 \| (Population|Births|Deaths|Growth\\_rate|Capacity) \|/);
  });

  it('shows evidence: health, sensitivity, Monte Carlo and loop dominance', () => {
    const ev = markdown.slice(markdown.indexOf('## Evidence'), markdown.indexOf('## Simulation results'));
    for (const h of ['### Model health', '### Sensitivity', '### Monte Carlo', '### Loop dominance']) expect(ev).toContain(h);
    expect(ev).toContain('warning: Capacity is barely used');
    expect(ev).toContain('200 runs');
    expect(ev).toMatch(/Growth_rate \| 0\.2 to 0\.6/);
  });

  it('compares the runs by KPI and charts them', () => {
    const res = markdown.slice(markdown.indexOf('## Simulation results'), markdown.indexOf('## Appendix'));
    expect(res).toMatch(/\| Population \| minimize \| people \| [\d.]+ \| [\d.]+ \(-\d+(\.\d+)?%, better\) \|/);
    expect(res.match(/!\[/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('embeds charts as inline SVG in the HTML and as data-URI images in the Markdown', () => {
    expect(html.match(/<svg /g)?.length).toBeGreaterThanOrEqual(4);
    expect(markdown.match(/!\[[^\]]*\]\(data:image\/svg\+xml/g)?.length).toBe(html.match(/<figure>/g)?.length);
  });

  it('produces a self-contained, scriptless HTML page ready to print', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('@page');
    expect(html).toContain(`content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"`); // text is untrusted: no script even if one slipped in
    expect(html.replace(/xmlns="[^"]*"/g, '')).not.toMatch(/<script|<link|<img|https?:\/\//i);
  });

  it('is deterministic', () => {
    expect(buildReport(fullInput())).toEqual({ markdown, html });
  });

  it('every inline SVG in the HTML is well-formed XML', () => {
    for (const [svg] of html.matchAll(/<svg [\s\S]*?<\/svg>/g)) expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('builds from a bare model: placeholders, no throw, still in order', () => {
    const bare = buildReport({ model: buildModel([{ name: 'Lonely', eq: '1' }]), loops: [], leverage: [], runs: [], generatedAt: 'now' });
    const at = HEADINGS.map((h) => bare.markdown.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(bare.markdown).toContain('No recommendation has been written yet');
    expect(bare.markdown).toContain('The model has no feedback loop.');
    expect(bare.markdown).toContain('No leverage ranking was computed.');
    expect(bare.markdown).toContain('No simulation run was supplied.');
    expect(bare.html).not.toContain('<svg');
  });

  it('treats model text as data: nothing from it becomes markup', () => {
    const evil = '<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>';
    const m = fullInput();
    const r = buildReport({
      ...m,
      model: {
        ...m.model,
        name: evil,
        decision: { recommendation: `# Heading\n\n${evil}`, summary: evil },
        interventions: [{ id: 'i_e', name: evil, description: evil, leverage: 3, scenarioId: null, status: 'idea', rationale: evil, origin: 'user' }],
        loopAnnotations: m.model.loopAnnotations.map((a) => ({ ...a, name: evil, note: evil })),
      },
    });
    expect(r.html).not.toMatch(/<script|<img|onerror=alert\(1\)>/);
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(r.markdown).not.toMatch(/<script|<img/);
    expect(r.markdown).not.toMatch(/(^|[^\\])\]\(javascript:/); // the escaped `\]` is literal text, not a link
    expect(r.markdown).toContain('\\# Heading');
  });

  it('keeps table rows intact when text holds pipes and line breaks', () => {
    const m = fullInput();
    const r = buildReport({ ...m, model: { ...m.model, interventions: [{ id: 'i_p', name: 'a | b\nc', description: '', leverage: 4, scenarioId: null, status: 'idea', rationale: '', origin: 'user' }] } });
    expect(r.markdown).toContain('| a \\| b c | 4 | idea | not tested |');
  });
});

describe('mdText', () => {
  it('leaves plain text and in-word underscores alone', () => {
    expect(mdText('Work_to_do rises 5 %')).toBe('Work_to_do rises 5 %');
    expect(mdText('0.25 to 1.5')).toBe('0.25 to 1.5');
    expect(mdText('-3 and +4')).toBe('-3 and +4');
  });
  it('never lets text start a block or open inline markup', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = mdText(s);
        expect(out).not.toMatch(/^\s*(#{1,6}|[+-]|[-=]+|~{3,}|\d+[.)])(\s|$)/m);
        expect(out).not.toMatch(/[<>]/);
      }),
    );
  });
});

describe('toCsv', () => {
  const result: SimResult = {
    time: Float64Array.from([0, 0.5, 1]),
    series: { v_a: Float64Array.from([1, 1.5, Number.NaN]), v_b: Float64Array.from([0.1, 0.2, 0.30000000000000004]) },
    spec: { start: 0, stop: 1, dt: 0.5, method: 'euler', timeUnit: 'year' },
    assertions: [],
    warnings: [],
  };

  it('writes a header of names and one row per saved step', () => {
    expect(toCsv(result, { v_a: 'Stock A', v_b: 'Rate, per year' })).toBe(
      'time,Stock A,"Rate, per year"\n0,1,0.1\n0.5,1.5,0.2\n1,,0.30000000000000004\n',
    );
  });

  it('falls back to ids and round-trips numbers exactly', () => {
    const rows = toCsv(result, {}).trim().split('\n');
    expect(rows[0]).toBe('time,v_a,v_b');
    expect(Number(rows[3]?.split(',')[2])).toBe(0.30000000000000004);
  });

  it('neutralises spreadsheet formulas and quotes in names', () => {
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('kpiComparison', () => {
  const m = population();
  const mk = (final: number): { name: string; result: SimResult } => ({
    name: `r${final}`,
    result: { time: Float64Array.from([0, 1]), series: { [idOf('Population')]: Float64Array.from([1, final]) }, spec: m.simSpec, assertions: [], warnings: [] },
  });
  const withGoal = (goal: 'minimize' | 'maximize' | 'target', target?: number): Model => ({
    ...m,
    frame: { ...m.frame, kpis: [{ id: 'k', name: 'Pop', varId: idOf('Population'), goal, ...(target !== undefined ? { target } : {}) }] },
  });

  it('judges each run against the first by the KPI goal', () => {
    const verdicts = (model: Model) => kpiComparison(model, [mk(100), mk(60), mk(140), mk(100)]).rows[0]?.cells.map((c) => c.verdict);
    expect(verdicts(withGoal('minimize'))).toEqual([null, 'better', 'worse', 'same']);
    expect(verdicts(withGoal('maximize'))).toEqual([null, 'worse', 'better', 'same']);
    expect(verdicts(withGoal('target', 70))).toEqual([null, 'better', 'worse', 'same']);
    expect(verdicts(withGoal('target'))).toEqual([null, null, null, null]);
  });

  it('reports the change as a fraction of the baseline', () => {
    const row = kpiComparison(withGoal('minimize'), [mk(100), mk(60)]).rows[0];
    expect(row?.cells[1]?.delta).toBeCloseTo(-0.4);
    expect(row?.cells[0]?.delta).toBeNull();
    expect(row?.units).toBe('people');
  });

  it('skips KPIs without a variable and tolerates runs that did not save it', () => {
    const model = { ...m, frame: { ...m.frame, kpis: [...m.frame.kpis, { id: 'k2', name: 'Open', varId: null, goal: 'minimize' as const }] } };
    const none = { name: 'x', result: { ...mk(1).result, series: {} } };
    const cmp = kpiComparison(model, [mk(1), none]);
    expect(cmp.rows).toHaveLength(1);
    expect(cmp.rows[0]?.cells[1]).toEqual({ value: null, delta: null, verdict: null });
  });
});

describe('svg charts', () => {
  const t = Float64Array.from({ length: 50 }, (_, i) => i);
  const y = Float64Array.from(t, (x) => Math.sin(x / 5) * 10 + 20);

  it('draws one path per series, with a legend, and is well-formed', () => {
    const svg = lineChartSvg([{ label: 'Run 1', x: t, y }, { label: 'Run 2', x: t, y: y.map((v) => v * 2) }], { title: 'Pop', xLabel: 'Time (year)', yLabel: 'people' });
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain('Run 2');
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('breaks a line at non-finite values and never prints NaN', () => {
    const bad = Float64Array.from([1, 2, Number.NaN, 4, Number.POSITIVE_INFINITY, 6]);
    const svg = lineChartSvg([{ label: 'x', x: Float64Array.from([0, 1, 2, 3, 4, 5]), y: bad }], { title: 'gaps' });
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    expect(svg.match(/M[\d.-]+ [\d.-]+/g)?.length).toBe(3);
  });

  it('thins a long series to a bounded path', () => {
    const n = 100_000;
    const x = Float64Array.from({ length: n }, (_, i) => i);
    const svg = lineChartSvg([{ label: 'long', x, y: x }], { title: 'long' });
    expect(svg.length).toBeLessThan(40_000);
    expect(svg).toMatch(/L[\d.]+ [\d.]+"/);
  });

  it('says so when there is nothing to plot', () => {
    for (const svg of [lineChartSvg([], { title: 'e' }), paretoSvg([], { title: 'e' }), tornadoSvg([], 0, { title: 'e' })]) {
      expect(svg).toContain('No data to plot');
      expect(XMLValidator.validate(svg)).toBe(true);
    }
  });

  it('draws a flat series without dividing by zero', () => {
    const svg = lineChartSvg([{ label: 'flat', x: t, y: new Float64Array(50).fill(5) }], { title: 'flat' });
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('band chart has a band polygon and a median line', () => {
    const svg = bandChartSvg(t, { p5: y.map((v) => v - 3), p50: y, p95: y.map((v) => v + 3) }, { title: 'band' });
    expect(svg).toContain('<polygon');
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(XMLValidator.validate(svg)).toBe(true);
  });

  it('tornado has two bars per row and a base line; pareto one bar per row plus the cumulative line', () => {
    const rows = [
      { label: 'Rate', atLow: 5, atHigh: 15, low: 1, high: 2 },
      { label: 'Cap', atLow: 9, atHigh: 11, low: 3, high: 4 },
    ];
    const tor = tornadoSvg(rows, 10, { title: 'tor' });
    expect(tor.match(/<rect [^>]*><title>/g)).toHaveLength(4); // 2 rows × 2 bars
    expect(XMLValidator.validate(tor)).toBe(true);
    const par = paretoSvg([{ label: 'A', value: 3, cumulativeShare: 0.6 }, { label: 'B', value: 2, cumulativeShare: 1 }], { title: 'par' });
    expect(par).toContain('<polyline');
    expect(XMLValidator.validate(par)).toBe(true);
  });

  it('escapes any label: output is always well-formed and free of raw markup from the label', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (label) => {
        const svgs = [
          lineChartSvg([{ label, x: t, y }], { title: label, xLabel: label, yLabel: label }),
          paretoSvg([{ label, value: 1, cumulativeShare: 1 }], { title: label }),
          tornadoSvg([{ label, atLow: 1, atHigh: 2, low: 0, high: 1 }], 1.5, { title: label }),
        ];
        for (const svg of svgs) expect(XMLValidator.validate(svg)).toBe(true);
      }),
      { numRuns: 60 },
    );
    expect(lineChartSvg([{ label: '<script>', x: t, y }], { title: '<b>' })).not.toMatch(/<script>|<b>/);
  });
});
