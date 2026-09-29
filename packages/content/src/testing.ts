/**
 * Test support for the content package (imported by *.test.ts only; not re-exported from index.ts).
 * - Readiness probes for modules built in parallel (engine, graph, parser): a probe is "ready" unless the stub
 *   throws `NotImplementedError`, so any other failure surfaces as a real test failure.
 * - `structureIssues`: static checks every bundled model must pass today, before the engine exists.
 */
import {
  BUILTIN_NAMES,
  NotImplementedError,
  RESERVED_WORDS,
  canonicalName,
  compileModel,
  findLoops,
  impliedFlowLinks,
  parseEquation,
  referencedNames,
  simulate,
  type Model,
  type Scenario,
  type SimResult,
} from '@looplab/core';
import { buildModel } from './build.ts';

/** A two-variable drain model used only to probe whether a module is implemented. */
export const probeModel: Model = buildModel({
  id: 'm_probe',
  name: 'Probe',
  simSpec: { start: 0, stop: 1, dt: 0.25, method: 'euler', timeUnit: 'month' },
  variables: [
    { id: 'v_level', name: 'Level', kind: 'stock', eq: '1', units: 'dmnl' },
    { id: 'v_drain', name: 'Drain', kind: 'flow', eq: 'Level / Drain_time', units: '1/month', from: 'v_level' },
    { id: 'v_time', name: 'Drain time', kind: 'constant', eq: '2', units: 'month', range: [1, 3] },
  ],
  links: [
    ['v_level', 'v_drain', '+'],
    ['v_time', 'v_drain', '-'],
  ],
});

function implemented(probe: () => unknown): boolean {
  try {
    probe();
    return true;
  } catch (e) {
    return !(e instanceof NotImplementedError);
  }
}

export const engineReady = implemented(() => simulate(probeModel));
export const graphReady = implemented(() => findLoops(probeModel));
export const parserReady = implemented(() => parseEquation('1'));

/** Run a model's scenario through the engine (compile with the scenario, then simulate with its SimSpec overrides). */
export function simulateScenario(model: Model, scenarioId: string): SimResult {
  const scenario: Scenario | undefined = model.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`No scenario ${scenarioId} in ${model.name}`);
  const c = compileModel(model, { scenario });
  if (!c.ok) throw new Error(`Scenario ${scenarioId} does not compile: ${c.errors.map((e) => e.message).join('; ')}`);
  return c.compiled.simulate(scenario.simSpec ?? {});
}

// ── static structure checks ────────────────────────────────────────────────

const NON_VARIABLE_NAMES = new Set([...BUILTIN_NAMES, ...RESERVED_WORDS]);

/**
 * Canonical names referenced by an equation. Uses the real parser once it is merged; until then a small tokenizer
 * that understands numbers (incl. 1e-3), quoted names, identifiers and function calls.
 */
export function equationReferences(eq: string): { names: string[]; calls: string[] } {
  if (parserReady) {
    const r = parseEquation(eq);
    if (!r.ok) throw new Error(`Parse error in "${eq}": ${r.error.message}`);
    return { names: referencedNames(r.ast).filter((n) => !NON_VARIABLE_NAMES.has(n)), calls: callsOf(eq) };
  }
  const names = new Set<string>();
  for (const t of tokens(eq)) if (t.kind === 'name' && !NON_VARIABLE_NAMES.has(t.canon)) names.add(t.canon);
  return { names: [...names], calls: callsOf(eq) };
}

type Token = { kind: 'num' | 'name' | 'call' | 'op'; canon: string };

function tokens(eq: string): Token[] {
  const re =
    /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|(<=|>=|<>|[-+*/^(),<>=]))/y;
  const out: Token[] = [];
  let i = 0;
  while (i < eq.length) {
    if (eq.slice(i).trim() === '') break;
    re.lastIndex = i;
    const m = re.exec(eq);
    if (!m) throw new Error(`Cannot tokenize "${eq}" at ${i}`);
    if (m[1] !== undefined) out.push({ kind: 'num', canon: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'name', canon: canonicalName(m[2]) });
    else if (m[3] !== undefined) out.push({ kind: m[4] ? 'call' : 'name', canon: canonicalName(m[3]) });
    else out.push({ kind: 'op', canon: m[5] ?? '' });
    i = re.lastIndex;
  }
  return out;
}

function callsOf(eq: string): string[] {
  return tokens(eq)
    .filter((t) => t.kind === 'call')
    .map((t) => t.canon);
}

const NUMERIC_LITERAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Static checks for a runnable bundled model. Returns human-readable problems (empty = OK):
 * units present; constants are numeric literals with an uncertainty range around their value; every flow is
 * connected; equations reference only existing variables and known builtins; drawn links match equation references
 * one-to-one (the SPEC §3 soft rule "equation references ⇔ incoming links"); flow→stock links exist with the right sign.
 */
export function structureIssues(model: Model): string[] {
  const issues: string[] = [];
  const byCanon = new Map(model.variables.map((v) => [canonicalName(v.name), v]));
  const implied = new Set(impliedFlowLinks(model).map((l) => `${l.flowId}>${l.stockId}`));

  for (const v of model.variables) {
    const where = `${model.name} / ${v.name}`;
    if (v.kind === 'variable') {
      issues.push(`${where}: unquantified variable in a runnable model`);
      continue;
    }
    if (v.units.trim() === '') issues.push(`${where}: no units`);
    if (v.equation.trim() === '') issues.push(`${where}: empty equation`);
    if (v.kind === 'flow' && v.flow && v.flow.from === null && v.flow.to === null)
      issues.push(`${where}: flow not connected to any stock`);
    if (v.kind === 'constant') {
      if (!NUMERIC_LITERAL.test(v.equation.trim())) issues.push(`${where}: constant is not a numeric literal`);
      const x = Number(v.equation);
      if (!v.uncertainty) issues.push(`${where}: constant has no uncertainty range`);
      else if (!(v.uncertainty.min <= x && x <= v.uncertainty.max))
        issues.push(`${where}: value ${x} outside its uncertainty range`);
    }

    let refs: { names: string[]; calls: string[] };
    try {
      refs = equationReferences(v.equation);
    } catch (e) {
      issues.push(`${where}: ${(e as Error).message}`);
      continue;
    }
    for (const c of refs.calls)
      if (!BUILTIN_NAMES.includes(c)) issues.push(`${where}: unknown function ${c.toUpperCase()}`);
    const refIds = new Set<string>();
    for (const n of refs.names) {
      const target = byCanon.get(n);
      if (!target) issues.push(`${where}: equation references unknown name "${n}"`);
      else refIds.add(target.id);
    }
    const linkSources = new Set(
      model.links.filter((l) => l.to === v.id && !implied.has(`${l.from}>${l.to}`)).map((l) => l.from),
    );
    for (const id of refIds)
      if (!linkSources.has(id)) issues.push(`${where}: references ${nameOf(model, id)} but has no link from it`);
    for (const id of linkSources)
      if (!refIds.has(id)) issues.push(`${where}: link from ${nameOf(model, id)} is not used in the equation`);
  }

  for (const f of impliedFlowLinks(model)) {
    const l = model.links.find((x) => x.from === f.flowId && x.to === f.stockId);
    if (!l) issues.push(`${model.name}: missing flow link ${nameOf(model, f.flowId)} → ${nameOf(model, f.stockId)}`);
    else if (l.polarity !== f.polarity) issues.push(`${model.name}: flow link ${l.id} should be '${f.polarity}'`);
  }
  return issues;
}

const nameOf = (model: Model, id: string): string => model.variables.find((v) => v.id === id)?.name ?? id;

/** Elementary cycles of a small graph with their R/B type — an independent oracle for hand-verified loop counts. */
export function loopCounts(model: Model): { R: number; B: number } {
  const out = { R: 0, B: 0 };
  const ids = model.variables.map((v) => v.id).sort();
  const adj = new Map(ids.map((id) => [id, model.links.filter((l) => l.from === id)]));
  for (const start of ids) {
    const path = new Set([start]);
    const walk = (node: string, negatives: number): void => {
      for (const l of adj.get(node) ?? []) {
        const neg = negatives + (l.polarity === '-' ? 1 : 0);
        if (l.to === start) out[neg % 2 === 0 ? 'R' : 'B']++;
        else if (l.to > start && !path.has(l.to)) {
          path.add(l.to);
          walk(l.to, neg);
          path.delete(l.to);
        }
      }
    };
    walk(start, 0);
  }
  return out;
}
