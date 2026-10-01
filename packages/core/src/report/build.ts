/**
 * Decision-brief builder (SPEC §6.8). The brief is organised as a pyramid — the answer first, the evidence under it, the
 * detail last: Recommendation → Key loops → Leverage ranking → Evidence → Simulation results → Appendix. The same blocks
 * render to Markdown (charts as data-URI SVG images) and to a self-contained, print-ready HTML page (charts as inline SVG).
 */
import type { Loop, ReportInput, ReportOutput } from '../contracts.ts';
import type { Id, Intervention, Model } from '../schema/model.ts';
import { renderHtml, renderMarkdown, type Block, type Cell } from './doc.ts';
import { kpiComparison } from './kpi.ts';
import { bandChartSvg, fmt, lineChartSvg, paretoSvg, tornadoSvg } from './svg.ts';

const MAX_LOOP_ROWS = 15;
const MAX_LEVERAGE_ROWS = 12;
const MAX_TABLE_ROWS = 10;
const MAX_KPI_CHARTS = 6;
const MAX_MODEL_ROWS = 200;
const MAX_HEALTH_ITEMS = 10;

const pct = (x: number): string => (Number.isFinite(x) ? `${fmt(Math.round(x * 1000) / 10)}%` : 'n/a');
const signedPct = (x: number): string => `${x > 0 ? '+' : ''}${pct(x)}`;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const sentence = (id: string): string => {
  const s = id.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

interface LoopInfo {
  loop: Loop;
  handle: string;
  /** annotation name, '' when unnamed */
  name: string;
  path: string;
  /** mean and peak of |relative score| over the scored steps; null without Loops That Matter */
  mean: number | null;
  peak: number | null;
}

function loopInfos(input: ReportInput, names: Map<Id, string>): LoopInfo[] {
  const annotated = new Map(input.model.loopAnnotations.map((a) => [a.key, a]));
  const counts: Record<Loop['type'], number> = { R: 0, B: 0, U: 0 };
  return input.loops.map((loop) => {
    const scores = input.ltm?.relScore[loop.key];
    let mean: number | null = null;
    let peak: number | null = null;
    if (scores && scores.length > 1) {
      let sum = 0;
      peak = 0;
      for (let k = 1; k < scores.length; k++) {
        const a = Math.abs(scores[k] ?? 0);
        sum += a;
        if (a > peak) peak = a;
      }
      mean = sum / (scores.length - 1);
    }
    const labels = loop.varIds.map((id) => names.get(id) ?? id);
    return {
      loop,
      handle: `${loop.type}${++counts[loop.type]}`,
      name: annotated.get(loop.key)?.name ?? '',
      path: [...labels, labels[0] ?? ''].join(' → '),
      mean,
      peak,
    };
  });
}

const TYPE_LABEL: Record<Loop['type'], string> = { R: 'Reinforcing', B: 'Balancing', U: 'Unknown polarity' };
const STATUS_ORDER: Record<Intervention['status'], number> = { recommended: 0, tested: 1, idea: 2, rejected: 3 };

function recommendation(model: Model): Block[] {
  const d = model.decision;
  const out: Block[] = [{ t: 'h', level: 2, text: 'Recommendation' }];
  out.push(
    d.recommendation.trim()
      ? { t: 'p', text: d.recommendation.trim() }
      : { t: 'note', text: 'No recommendation has been written yet (Decide stage).' },
  );
  if (d.summary.trim()) out.push({ t: 'p', text: d.summary.trim() });
  if (model.interventions.length > 0) {
    const scenario = new Map(model.scenarios.map((s) => [s.id, s.name]));
    const sorted = [...model.interventions].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.leverage - b.leverage,
    );
    out.push({
      t: 'table',
      head: ['Intervention', 'Meadows level', 'Status', 'Tested as scenario', 'Rationale'],
      rows: sorted.map((i) => [
        i.name,
        String(i.leverage),
        i.status,
        (i.scenarioId && scenario.get(i.scenarioId)) || 'not tested',
        i.rationale || i.description,
      ]),
      right: [1],
    });
    out.push({
      t: 'note',
      text: 'Meadows’ leverage points run from level 12 (parameters, the weakest) to level 1 (the paradigm a system rests on, the strongest).',
    });
  }
  return out;
}

function keyLoops(model: Model, infos: LoopInfo[], hasLtm: boolean): Block[] {
  const out: Block[] = [{ t: 'h', level: 2, text: 'Key loops' }];
  if (infos.length === 0) {
    out.push({ t: 'note', text: 'The model has no feedback loop.' });
    return out;
  }
  const ranked = infos
    .map((info, i) => ({ info, i }))
    .sort((a, b) => (b.info.mean ?? 0) - (a.info.mean ?? 0) || a.info.loop.length - b.info.loop.length || a.i - b.i)
    .map((x) => x.info);
  const shown = ranked.slice(0, MAX_LOOP_ROWS);
  const nR = infos.filter((l) => l.loop.type === 'R').length;
  const nB = infos.filter((l) => l.loop.type === 'B').length;
  out.push({
    t: 'p',
    text:
      `${plural(infos.length, 'feedback loop')}: ${nR} reinforcing (R), ${nB} balancing (B)` +
      (infos.length - nR - nB > 0 ? `, ${infos.length - nR - nB} of unknown polarity (U)` : '') +
      (hasLtm ? '. Strongest first, by mean share of the change in behaviour.' : '. Shortest first.'),
  });
  out.push({
    t: 'table',
    head: ['Loop', 'Type', 'Name', 'Path', 'Delay', ...(hasLtm ? ['Mean share'] : [])],
    rows: shown.map((l) => [
      l.handle,
      TYPE_LABEL[l.loop.type],
      l.name || '—',
      l.path,
      l.loop.hasDelay ? 'yes' : 'no',
      ...(hasLtm ? [l.mean === null ? '—' : pct(l.mean)] : []),
    ]),
  });
  if (infos.length > shown.length) out.push({ t: 'note', text: `Showing ${shown.length} of ${infos.length} loops.` });
  const stories = ranked.filter((l) => model.loopAnnotations.find((a) => a.key === l.loop.key)?.note.trim());
  if (stories.length > 0)
    out.push(
      { t: 'h', level: 3, text: 'What the loops do' },
      {
        t: 'ul',
        items: stories.slice(0, MAX_LOOP_ROWS).map((l) => {
          const note = model.loopAnnotations.find((a) => a.key === l.loop.key)?.note.trim() ?? '';
          return `${l.handle}${l.name ? ` ${l.name}` : ''}: ${note}`;
        }),
      },
    );
  const byKey = new Map(infos.map((l) => [l.loop.key, l.handle]));
  const confirmed = model.archetypeFindings.filter((f) => f.status === 'confirmed');
  if (confirmed.length > 0)
    out.push(
      { t: 'h', level: 3, text: 'Confirmed archetypes' },
      {
        t: 'ul',
        items: confirmed.map((f) => {
          const handles = f.loopKeys.map((k) => byKey.get(k)).filter((h): h is string => Boolean(h));
          return `${sentence(f.archetypeId)}${handles.length ? ` (${handles.join(', ')})` : ''}${f.note.trim() ? `: ${f.note.trim()}` : ''}`;
        }),
      },
    );
  return out;
}

function leverageRanking(input: ReportInput, names: Map<Id, string>): Block[] {
  const out: Block[] = [{ t: 'h', level: 2, text: 'Leverage ranking' }];
  const rows = input.leverage.slice(0, MAX_LEVERAGE_ROWS);
  if (rows.length === 0) {
    out.push({ t: 'note', text: 'No leverage ranking was computed.' });
    return out;
  }
  const label = (id: Id) => names.get(id) ?? id;
  const k = input.leverage.findIndex((r) => r.cumulativeShare >= 0.8) + 1;
  out.push({
    t: 'p',
    text:
      k > 0 && k < input.leverage.length
        ? `The top ${plural(k, 'variable')} of ${input.leverage.length} carry ${pct(input.leverage[k - 1]?.cumulativeShare ?? 0)} of the total leverage score: look there first.`
        : `${plural(input.leverage.length, 'variable')} ranked by how much leverage they offer, highest first.`,
  });
  out.push({
    t: 'fig',
    svg: paretoSvg(
      rows.map((r) => ({ label: label(r.varId), value: r.score, cumulativeShare: r.cumulativeShare })),
      { title: 'Leverage Pareto', yLabel: 'leverage score' },
    ),
    alt: 'Leverage Pareto chart',
    caption: 'Leverage score per variable (bars) and cumulative share of the total (line).',
  });
  out.push({
    t: 'table',
    head: ['#', 'Variable', 'Score', 'Cumulative', 'Evidence'],
    rows: rows.map((r, i) => [String(i + 1), label(r.varId), fmt(r.score), pct(r.cumulativeShare), r.evidence.join('; ')]),
    right: [0, 2, 3],
  });
  if (input.leverage.length > rows.length)
    out.push({ t: 'note', text: `Showing ${rows.length} of ${input.leverage.length} variables.` });
  return out;
}

function evidence(input: ReportInput, infos: LoopInfo[], names: Map<Id, string>): Block[] {
  const { model } = input;
  const label = (id: Id) => names.get(id) ?? id;
  const out: Block[] = [{ t: 'h', level: 2, text: 'Evidence' }];

  out.push({ t: 'h', level: 3, text: 'Model health' });
  if (!input.health) out.push({ t: 'note', text: 'Model Health was not run for this report.' });
  else {
    const count = (s: string) => input.health?.items.filter((i) => i.severity === s).length ?? 0;
    out.push({
      t: 'p',
      text: `${input.health.ok ? 'No errors' : plural(count('error'), 'error')}; ${plural(count('warning'), 'warning')}; ${plural(count('info'), 'note')}.`,
    });
    const order = { error: 0, warning: 1, info: 2 } as const;
    const items = [...input.health.items].sort((a, b) => order[a.severity] - order[b.severity]);
    if (items.length > 0)
      out.push({
        t: 'ul',
        items: items.slice(0, MAX_HEALTH_ITEMS).map((i) => `${i.severity}: ${i.message}`),
      });
    if (items.length > MAX_HEALTH_ITEMS) out.push({ t: 'note', text: `${items.length - MAX_HEALTH_ITEMS} more not shown.` });
  }

  out.push({ t: 'h', level: 3, text: 'Sensitivity' });
  const sens = input.sensitivity ?? [];
  if (sens.length === 0)
    out.push({ t: 'note', text: 'No sensitivity analysis was run (it needs constants with an uncertainty range).' });
  else {
    const base = sens[0]?.base ?? 0;
    out.push({
      t: 'fig',
      svg: tornadoSvg(
        sens.map((r) => ({ label: label(r.varId), atLow: r.kpiAtLow, atHigh: r.kpiAtHigh, low: r.low, high: r.high })),
        base,
        { title: 'Sensitivity of the headline KPI', xLabel: 'KPI value' },
      ),
      alt: 'Tornado chart of one-at-a-time sensitivity',
      caption: 'Each uncertain parameter moved across its range with the others held at base; widest swing first.',
    });
    out.push({
      t: 'table',
      head: ['Parameter', 'Range', 'KPI at low', 'KPI at high', 'Swing', 'Cumulative'],
      rows: sens
        .slice(0, MAX_TABLE_ROWS)
        .map((r) => [label(r.varId), `${fmt(r.low)} to ${fmt(r.high)}`, fmt(r.kpiAtLow), fmt(r.kpiAtHigh), fmt(r.swing), pct(r.cumulativeShare)]),
      right: [2, 3, 4, 5],
    });
  }

  out.push({ t: 'h', level: 3, text: 'Monte Carlo' });
  const mc = input.monteCarlo;
  const bandId = mc && (model.frame.kpis.map((k) => k.varId).find((id) => id !== null && id in mc.bands) ?? Object.keys(mc.bands)[0]);
  if (!mc || !bandId) out.push({ t: 'note', text: 'No Monte Carlo run was supplied.' });
  else {
    const band = mc.bands[bandId];
    out.push({
      t: 'p',
      text: `${plural(mc.runs, 'run')} sampling the uncertain parameters${mc.cancelled ? ' (cancelled early)' : ''}.`,
    });
    if (band)
      out.push({
        t: 'fig',
        svg: bandChartSvg(mc.time, band, {
          title: `${label(bandId)}: Monte Carlo band`,
          xLabel: `Time (${model.simSpec.timeUnit})`,
          yLabel: model.variables.find((v) => v.id === bandId)?.units || undefined,
        }),
        alt: `Monte Carlo percentile band of ${label(bandId)}`,
        caption: 'Median and 5th–95th percentile across runs.',
      });
    const imp = [...mc.importance].sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho)).slice(0, MAX_TABLE_ROWS);
    if (imp.length > 0)
      out.push({
        t: 'table',
        head: ['Parameter', 'Spearman ρ with the KPI'],
        rows: imp.map((r) => [label(r.varId), fmt(r.rho)]),
        right: [1],
      });
  }

  out.push({ t: 'h', level: 3, text: 'Loop dominance' });
  const ltm = input.ltm;
  const scored = infos.filter((l) => l.mean !== null && ltm?.relScore[l.loop.key]);
  if (!ltm || scored.length === 0) out.push({ t: 'note', text: 'Loop dominance (Loops That Matter) was not computed.' });
  else {
    const top = [...scored].sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0)).slice(0, 6);
    out.push({
      t: 'fig',
      svg: lineChartSvg(
        top.map((l) => ({ label: `${l.handle} ${l.name || l.loop.varIds.map(label).slice(0, 3).join(' → ')}`, x: ltm.time, y: ltm.relScore[l.loop.key] ?? [] })),
        { title: 'Loop dominance over time', xLabel: `Time (${model.simSpec.timeUnit})`, yLabel: 'relative loop score', yDomain: [-1.05, 1.05] },
      ),
      alt: 'Relative loop scores over time',
      caption: 'Above 0 a loop acts as reinforcing, below 0 as balancing; scores of loops that share stocks add up to 100 %.',
    });
    out.push({
      t: 'table',
      head: ['Loop', 'Name', 'Mean share', 'Peak share'],
      rows: top.map((l) => [l.handle, l.name || l.path, pct(l.mean ?? 0), pct(l.peak ?? 0)]),
      right: [2, 3],
    });
  }
  return out;
}

function results(input: ReportInput): Block[] {
  const { model, runs } = input;
  const out: Block[] = [{ t: 'h', level: 2, text: 'Simulation results' }];
  const first = runs[0];
  if (!first) {
    out.push({ t: 'note', text: 'No simulation run was supplied.' });
    return out;
  }
  const cmp = kpiComparison(model, runs);
  if (cmp.rows.length > 0) {
    out.push({
      t: 'p',
      text: `Final value of each KPI per run. Later runs are compared with ${first.name}: the change, and whether the KPI's goal is better or worse served.`,
    });
    out.push({
      t: 'table',
      head: ['KPI', 'Goal', 'Units', ...cmp.runs],
      rows: cmp.rows.map((r) => [
        r.name,
        r.goal === 'target' && r.target !== undefined ? `target ${fmt(r.target)}` : r.goal,
        r.units || '—',
        ...r.cells.map((c) => {
          if (c.value === null) return 'n/a';
          const extra = [c.delta === null ? '' : signedPct(c.delta), c.verdict ?? ''].filter(Boolean).join(', ');
          return extra ? `${fmt(c.value)} (${extra})` : fmt(c.value);
        }),
      ]),
      right: cmp.runs.map((_, i) => i + 3),
    });
  }
  const names = new Map(model.variables.map((v) => [v.id, v]));
  let ids = [...new Set(cmp.rows.map((r) => r.varId))];
  if (ids.length === 0)
    ids = model.variables.filter((v) => v.kind === 'stock' && v.id in first.result.series).map((v) => v.id).slice(0, 4);
  for (const id of ids.slice(0, MAX_KPI_CHARTS)) {
    const v = names.get(id);
    if (!v || !(id in first.result.series)) continue;
    out.push({
      t: 'fig',
      svg: lineChartSvg(
        runs.flatMap((r) => (r.result.series[id] ? [{ label: r.name, x: r.result.time, y: r.result.series[id] }] : [])),
        { title: v.name, xLabel: `Time (${model.simSpec.timeUnit})`, yLabel: v.units || undefined },
      ),
      alt: `${v.name} over time`,
      caption: `${v.name}${v.units ? ` (${v.units})` : ''}${runs.length > 1 ? `, ${plural(runs.length, 'run')} compared` : ''}.`,
    });
  }
  return out;
}

function appendix(input: ReportInput, infos: LoopInfo[]): Block[] {
  const { model } = input;
  const out: Block[] = [{ t: 'h', level: 2, text: 'Appendix' }];

  out.push({ t: 'h', level: 3, text: 'Framing' });
  out.push(model.frame.problem.trim() ? { t: 'p', text: `Problem: ${model.frame.problem.trim()}` } : { t: 'note', text: 'No problem statement.' });
  if (model.frame.purpose.trim()) out.push({ t: 'p', text: `Purpose: ${model.frame.purpose.trim()}` });
  const kpiVar = (id: Id | null) => model.variables.find((v) => v.id === id)?.name ?? 'no variable';
  if (model.frame.kpis.length > 0)
    out.push({
      t: 'ul',
      items: model.frame.kpis.map(
        (k) => `KPI ${k.name}: ${k.goal}${k.target !== undefined ? ` (target ${fmt(k.target)})` : ''}, measured by ${kpiVar(k.varId)}`,
      ),
    });

  out.push({ t: 'h', level: 3, text: 'Model listing' });
  const listed = model.variables.slice(0, MAX_MODEL_ROWS);
  out.push({
    t: 'table',
    head: ['Variable', 'Kind', 'Equation', 'Units'],
    rows: listed.map((v): Cell[] => [v.name, v.kind, v.equation ? { code: v.equation } : '—', v.units || '—']),
  });
  if (model.variables.length > listed.length)
    out.push({ t: 'note', text: `${model.variables.length - listed.length} more variables not listed.` });

  out.push({ t: 'h', level: 3, text: 'Assumptions' });
  const name = (id: Id) => model.variables.find((v) => v.id === id)?.name ?? id;
  const assumptions: string[] = [
    ...model.variables.flatMap((v) =>
      v.uncertainty ? [`${v.name} (${v.equation || 'unset'}) is uncertain between ${fmt(v.uncertainty.min)} and ${fmt(v.uncertainty.max)}.`] : [],
    ),
    ...model.scenarios.map(
      (s) => `Scenario ${s.name}: ${s.overrides.map((o) => `${name(o.varId)} = ${o.equation}`).join('; ') || 'no overrides'}${s.note.trim() ? `. ${s.note.trim()}` : ''}`,
    ),
    ...model.assertions.filter((a) => a.enabled).map((a) => `Assertion: ${a.expr}${a.note.trim() ? `. ${a.note.trim()}` : ''}`),
    ...model.frame.excluded.map((b) => `Out of scope: ${b.name}${b.reason.trim() ? `. ${b.reason.trim()}` : ''}`),
    ...model.frame.referenceModes.map((r) => `Reference mode (${r.label}): ${r.name}, ${plural(r.points.length, 'point')}${r.note.trim() ? `. ${r.note.trim()}` : ''}`),
  ];
  out.push(assumptions.length > 0 ? { t: 'ul', items: assumptions } : { t: 'note', text: 'None recorded.' });

  out.push({ t: 'h', level: 3, text: 'Method and sources' });
  const s = model.simSpec;
  out.push({
    t: 'p',
    text:
      `Simulated from ${fmt(s.start)} to ${fmt(s.stop)} ${s.timeUnit} with ${s.method === 'rk4' ? 'Runge–Kutta 4' : 'Euler'} integration, DT ${fmt(s.dt)}. ` +
      `${plural(infos.length, 'loop')} analysed (cap ${model.settings.loopCap}); the random seed is ${model.settings.seed}.`,
  });
  out.push({
    t: 'ul',
    items: [
      'Meadows, D. (1999). Leverage Points: Places to Intervene in a System. The Sustainability Institute.',
      'Sterman, J. (2000). Business Dynamics: Systems Thinking and Modeling for a Complex World. Irwin/McGraw-Hill.',
      'Schoenberg, W., Hayward, J. and Eberlein, R. (2023). System Dynamics Review 39(2), doi:10.1002/sdr.1728 (loop dominance, Loops That Matter).',
    ],
  });
  return out;
}

/** Build the decision brief. Deterministic: the same input (including `generatedAt`) gives byte-identical output. */
export function buildReport(input: ReportInput): ReportOutput {
  const { model } = input;
  const names = new Map(model.variables.map((v) => [v.id, v.name]));
  const infos = loopInfos(input, names);
  const s = model.simSpec;
  const title = `${model.name}: decision brief`;
  const blocks: Block[] = [
    { t: 'h', level: 1, text: title },
    {
      t: 'note',
      text: `Generated ${input.generatedAt} · ${plural(model.variables.length, 'variable')} · ${plural(infos.length, 'loop')} · horizon ${fmt(s.start)}–${fmt(s.stop)} ${s.timeUnit}`,
    },
    ...recommendation(model),
    ...keyLoops(model, infos, Boolean(input.ltm)),
    ...leverageRanking(input, names),
    ...evidence(input, infos, names),
    ...results(input),
    ...appendix(input, infos),
  ];
  return { markdown: renderMarkdown(blocks), html: renderHtml(title, blocks) };
}
