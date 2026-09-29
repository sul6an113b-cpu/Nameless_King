/**
 * Model Health (SPEC §6.4): every check the Quantify stage shows, in one report.
 * Structural checks (flow-link, link↔equation, unused) and units never need a run; compile errors
 * (unquantified, parse, undefined, algebraic loops) block the run-based checks (assertions, NaN/Inf,
 * RK4 caveats, DT vs DT/2 integration error, polarity).
 */
import type { Ast, CompiledModel, HealthItem, HealthReport, SimResult } from '../contracts.ts';
import { checkPolarity } from '../graph/index.ts';
import { findLinkBetween, impliedFlowLinks } from '../model/ops.ts';
import { constantValue } from '../parser/constant.ts';
import { parseEquation, referencedNames } from '../parser/parse.ts';
import type { Id, Model, Variable } from '../schema/model.ts';
import { canonicalName } from '../schema/names.ts';
import { NotImplementedError } from '../stub.ts';
import { inferUnits } from '../units/infer.ts';
import { compileProgram, SimulationError } from './compile.ts';
import { mergeSpec, toCompiled } from './model.ts';
import { firstNonFinite } from './run.ts';

export function runHealth(model: Model, opts: { runIntegrationTest?: boolean } = {}): HealthReport {
  const items: HealthItem[] = [];
  const byName = new Map<string, Variable>(model.variables.map((v) => [canonicalName(v.name), v]));
  const byId = new Map<Id, Variable>(model.variables.map((v) => [v.id, v]));
  const name = (id: Id) => byId.get(id)?.name ?? id;
  const asts = new Map<Id, Ast>();
  for (const v of model.variables) {
    if (v.kind === 'variable' || v.kind === 'lookup' || v.equation.trim() === '') continue;
    const r = parseEquation(v.equation);
    if (r.ok) asts.set(v.id, r.ast);
  }
  const refIds = (ast: Ast): Id[] =>
    referencedNames(ast)
      .map((n) => byName.get(n)?.id)
      .filter((x): x is Id => x !== undefined);

  items.push(...flowLinkChecks(model, name));
  items.push(...linkEquationChecks(model, asts, refIds, name));
  items.push(...unusedChecks(model, asts, refIds));
  items.push(...inferUnits(model).issues);

  // ── compile ──
  const { program, errors } = compileProgram(model);
  items.push(...errors);
  if (!program) return report(items);
  items.push(...program.assertionErrors);
  const compiled = toCompiled(program, mergeSpec(model.simSpec));
  items.push(...methodChecks(model, asts, byName));

  // ── baseline run ──
  let base: SimResult | undefined;
  try {
    base = compiled.simulate();
  } catch (e) {
    if (!(e instanceof SimulationError)) throw e;
    items.push(e.item);
    return report(items);
  }
  for (const a of base.assertions) {
    const note = model.assertions.find((x) => x.id === a.assertionId)?.note;
    items.push({ check: 'assertion', severity: 'error', message: note ? `${a.message} — ${note}` : a.message, elementIds: [a.assertionId], detail: { time: a.time } });
  }
  for (const f of firstNonFinite(base))
    items.push({
      check: 'numeric',
      severity: 'error',
      message: `"${name(f.id)}" becomes ${f.value} at time ${f.time} (check divisions by zero, LN/SQRT of negatives, overflow)`,
      elementIds: [f.id],
      detail: { time: f.time },
    });

  if (opts.runIntegrationTest ?? true) items.push(...integrationTest(model, compiled, base, name));

  try {
    items.push(...checkPolarity(model, compiled, base));
  } catch (e) {
    if (!(e instanceof NotImplementedError)) throw e; // graph-analyst's check not merged yet
  }
  return report(items);
}

function report(items: HealthItem[]): HealthReport {
  return { items, ok: !items.some((i) => i.severity === 'error') };
}

/** Every flow into (out of) a stock needs a link flow → stock with polarity + (−). */
function flowLinkChecks(model: Model, name: (id: Id) => string): HealthItem[] {
  const out: HealthItem[] = [];
  for (const { flowId, stockId, polarity } of impliedFlowLinks(model)) {
    const verb = polarity === '+' ? 'fills' : 'drains';
    const link = findLinkBetween(model, flowId, stockId);
    if (!link)
      out.push({
        check: 'flow-link',
        severity: 'warning',
        message: `"${name(flowId)}" ${verb} "${name(stockId)}" but there is no link ${name(flowId)} → ${name(stockId)} (${polarity})`,
        elementIds: [flowId, stockId],
      });
    else if (link.polarity !== polarity)
      out.push({
        check: 'flow-link',
        severity: 'warning',
        message: `The link ${name(flowId)} → ${name(stockId)} should be ${polarity}: the flow ${verb} the stock`,
        elementIds: [link.id, flowId, stockId],
      });
  }
  for (const v of model.variables)
    if (v.kind === 'flow' && v.flow && v.flow.from === null && v.flow.to === null)
      out.push({ check: 'flow-link', severity: 'info', message: `Flow "${v.name}" is not connected to any stock`, elementIds: [v.id] });
  return out;
}

/** Equation references ⇔ incoming causal links (SPEC §3 soft rules). */
function linkEquationChecks(
  model: Model,
  asts: Map<Id, Ast>,
  refIds: (ast: Ast) => Id[],
  name: (id: Id) => string,
): HealthItem[] {
  const out: HealthItem[] = [];
  const mismatch = (message: string, elementIds: Id[]) =>
    out.push({ check: 'link-equation-mismatch', severity: 'warning', message, elementIds });
  for (const v of model.variables) {
    if (v.kind === 'variable') continue;
    const incoming = model.links.filter((l) => l.to === v.id);
    const ast = asts.get(v.id);
    const refs = new Set(ast ? refIds(ast) : []);
    if (v.kind === 'stock') {
      const flows = new Set(
        model.variables.filter((f) => f.kind === 'flow' && (f.flow?.to === v.id || f.flow?.from === v.id)).map((f) => f.id),
      );
      for (const l of incoming)
        if (!flows.has(l.from) && !refs.has(l.from))
          mismatch(`Only flows change a stock: the link ${name(l.from)} → ${v.name} is not a flow of "${v.name}"`, [l.id, l.from, v.id]);
      continue;
    }
    if (v.kind === 'lookup') {
      for (const l of incoming)
        mismatch(`"${v.name}" is a graphical function with no inputs, so the link ${name(l.from)} → ${v.name} is unused`, [l.id, l.from, v.id]);
      continue;
    }
    if (!ast) continue; // parse errors are reported by the compiler
    for (const r of refs)
      if (!incoming.some((l) => l.from === r))
        mismatch(`The equation of "${v.name}" uses "${name(r)}" but there is no link ${name(r)} → ${v.name}`, [r, v.id]);
    for (const l of incoming)
      if (!refs.has(l.from))
        mismatch(`The link ${name(l.from)} → ${v.name} is not used by the equation of "${v.name}"`, [l.id, l.from, v.id]);
  }
  return out;
}

/** Auxiliaries, constants and lookups that nothing uses (KPIs and assertion subjects count as used). */
function unusedChecks(model: Model, asts: Map<Id, Ast>, refIds: (ast: Ast) => Id[]): HealthItem[] {
  const used = new Set<Id>();
  for (const ast of asts.values()) for (const id of refIds(ast)) used.add(id);
  for (const a of model.assertions) {
    const r = parseEquation(a.expr);
    if (r.ok) for (const id of refIds(r.ast)) used.add(id);
  }
  for (const k of model.frame.kpis) if (k.varId) used.add(k.varId);
  for (const r of model.frame.referenceModes) if (r.varId) used.add(r.varId);
  const out: HealthItem[] = [];
  for (const v of model.variables)
    if ((v.kind === 'aux' || v.kind === 'constant' || v.kind === 'lookup') && !used.has(v.id))
      out.push({
        check: 'unused',
        severity: v.kind === 'aux' ? 'info' : 'warning',
        message: `"${v.name}" is not used by any equation`,
        elementIds: [v.id],
      });
  return out;
}

/** RK4 near discontinuities and non-negative limits; PULSE times off the DT grid. */
function methodChecks(model: Model, asts: Map<Id, Ast>, byName: Map<string, Variable>): HealthItem[] {
  const out: HealthItem[] = [];
  const { dt, start, method } = model.simSpec;
  const discontinuous: Id[] = [];
  const offGrid = (x: number) => Math.abs((x - start) / dt - Math.round((x - start) / dt)) > 1e-9 * Math.max(1, Math.abs(x / dt));
  const usesTime = (n: Ast): boolean =>
    n.k === 'call' ? n.fn === 'TIME' || n.args.some(usesTime)
    : n.k === 'un' ? usesTime(n.a)
    : n.k === 'bin' ? usesTime(n.a) || usesTime(n.b)
    : n.k === 'if' ? usesTime(n.c) || usesTime(n.t) || usesTime(n.e)
    : false;

  for (const v of model.variables) {
    const ast = asts.get(v.id);
    let jumps = v.graph?.mode === 'discrete';
    const walk = (n: Ast): void => {
      if (n.k === 'call') {
        if (n.fn === 'STEP' || n.fn === 'PULSE' || n.fn === 'RAMP') jumps = true;
        if (n.fn === 'LOOKUP' && n.args[0].k === 'ref' && byName.get(n.args[0].name)?.graph?.mode === 'discrete') jumps = true;
        if (n.fn === 'PULSE') {
          const first = constantValue(n.args[1]);
          const interval = n.args[2] ? constantValue(n.args[2]) : 0;
          if ((first !== null && offGrid(first)) || (interval !== null && interval > 0 && offGrid(start + interval)))
            out.push({
              check: 'integration-error',
              severity: 'warning',
              message: `"${v.name}": PULSE times are not on the DT grid (DT = ${dt}); the pulse fires at the next grid time`,
              elementIds: [v.id],
            });
        }
        n.args.forEach(walk);
      } else if (n.k === 'un') walk(n.a);
      else if (n.k === 'bin') {
        walk(n.a);
        walk(n.b);
      }
      else if (n.k === 'if') {
        if (usesTime(n.c)) jumps = true;
        walk(n.c);
        walk(n.t);
        walk(n.e);
      }
    };
    if (ast) walk(ast);
    if (jumps) discontinuous.push(v.id);
  }
  if (method === 'rk4' && discontinuous.length > 0)
    out.push({
      check: 'integration-error',
      severity: 'warning',
      message: `RK4 loses accuracy at jumps (STEP, PULSE, RAMP, time-based IF, discrete lookups) used by ${discontinuous.length} variable(s); Euler is exact on the DT grid`,
      elementIds: discontinuous,
    });
  const nonNeg = model.variables.filter((v) => v.kind === 'stock' && v.nonNegative).map((v) => v.id);
  if (method === 'rk4' && nonNeg.length > 0)
    out.push({
      check: 'integration-error',
      severity: 'warning',
      message: 'With RK4, non-negative stocks limit their outflows per stage, so they can still dip slightly below 0; Euler guarantees it',
      elementIds: nonNeg,
    });
  return out;
}

/** Re-run at DT/2 (same method) and flag stocks whose trajectories move by more than the tolerance. */
function integrationTest(model: Model, compiled: CompiledModel, base: SimResult, name: (id: Id) => string): HealthItem[] {
  const stocks = model.variables.filter((v) => v.kind === 'stock').map((v) => v.id);
  if (stocks.length === 0) return [];
  const { dt, saveEvery } = model.simSpec;
  let fine: SimResult;
  try {
    fine = compiled.simulate({ dt: dt / 2, saveEvery: saveEvery ?? dt }, { saveIds: stocks });
  } catch (e) {
    if (e instanceof SimulationError) return [e.item];
    throw e;
  }
  const tol = model.settings.integrationErrorTolerance;
  const out: HealthItem[] = [];
  for (const id of stocks) {
    const a = base.series[id];
    const b = fine.series[id];
    let maxDiff = 0;
    let maxAbs = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
      maxAbs = Math.max(maxAbs, Math.abs(a[i]), Math.abs(b[i]));
    }
    const rel = maxDiff / Math.max(maxAbs, 1e-9);
    if (rel > tol)
      out.push({
        check: 'integration-error',
        severity: 'warning',
        message: `"${name(id)}" changes by ${(rel * 100).toPrecision(3)}% when DT is halved (tolerance ${(tol * 100).toPrecision(3)}%): use a smaller DT`,
        elementIds: [id],
        detail: { relativeChange: rel, dt },
      });
  }
  return out;
}
