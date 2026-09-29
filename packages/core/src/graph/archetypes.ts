/**
 * Structural archetype matcher (SPEC §6.5). Proposes candidates for the engineer to confirm; never decides.
 *
 * Each of the 8 system archetypes is a loop-role pattern over the model's R/B loops. The structures follow the
 * archetype templates of Senge (1990), *The Fifth Discipline*, and Kim (1992), *Systems Archetypes I* (Pegasus
 * Communications); Kim's "Drifting Goals" is Senge's "Eroding Goals". Signatures, score weights and limits are
 * documented in docs/decisions/graph-analyst.md G-007.
 *
 * Notation: for a loop L through variable x, in(L, x) / out(L, x) are the polarities of L's links entering and
 * leaving x. Classifying pairs of loops that touch at one variable by whether these signs agree makes the
 * signatures invariant to renaming x to its opposite (e.g. "problem" vs "performance"), which flips all four signs.
 */
import type { ArchetypeCandidate, Loop } from '../contracts.ts';
import type { ArchetypeId, Id, Link, LoopKey, Model, Polarity } from '../schema/model.ts';
import { buildCausalGraph, compareIds, variablesOnLoops } from './digraph.ts';
import { compareLoops } from './loops.ts';

/** Candidates scoring at least this are "strong" (all characteristic features present). */
export const STRONG_ARCHETYPE_SCORE = 0.7;
/** Only the shortest loops are matched: archetypes are small structures and pair matching is quadratic. */
const MAX_MATCH_LOOPS = 200;
const MAX_MATCH_LOOP_LENGTH = 10;
/** Work bounds for large models (deterministic: iteration order is fixed). */
const MAX_DRAFTS = 2000;
const MAX_COMMONS_PARTNERS = 8;
const MAX_CANDIDATES = 50;
/** A pattern that is part of a larger matched structure keeps this share of its score, so the whole ranks first. */
const COMPONENT_FACTOR = 0.6;

const LABEL: Record<ArchetypeId, string> = {
  'fixes-that-fail': 'Fixes that Fail',
  'shifting-the-burden': 'Shifting the Burden',
  'limits-to-growth': 'Limits to Growth',
  'eroding-goals': 'Eroding Goals',
  escalation: 'Escalation',
  'success-to-the-successful': 'Success to the Successful',
  'tragedy-of-the-commons': 'Tragedy of the Commons',
  'growth-and-underinvestment': 'Growth and Underinvestment',
};

interface LoopView {
  loop: Loop;
  type: 'R' | 'B';
  vars: Set<Id>;
  links: Set<Id>;
  pos: Map<Id, number>;
  /** polarity[i] / delayed[i] describe the link from varIds[i] to varIds[i + 1] */
  polarity: Polarity[];
  delayed: boolean[];
}

interface Draft {
  archetypeId: ArchetypeId;
  views: LoopView[];
  roles: [string, Id | undefined][];
  score: number;
  explanation: string;
}

// ── loop helpers ─────────────────────────────────────────────────────────────

const wrap = (L: LoopView, i: number): number => ((i % L.loop.length) + L.loop.length) % L.loop.length;
const at = (L: LoopView, i: number): Id => L.loop.varIds[wrap(L, i)];
const succ = (L: LoopView, x: Id): Id => at(L, (L.pos.get(x) as number) + 1);
const pred = (L: LoopView, x: Id): Id => at(L, (L.pos.get(x) as number) - 1);
const outSign = (L: LoopView, x: Id): Polarity => L.polarity[L.pos.get(x) as number];
const inSign = (L: LoopView, x: Id): Polarity => L.polarity[wrap(L, (L.pos.get(x) as number) - 1)];
const hasDelay = (L: LoopView): boolean => L.loop.hasDelay;
/** A delayed link of L that `other` does not share. */
const delayOutside = (L: LoopView, other: LoopView): boolean =>
  L.loop.linkIds.some((id, i) => L.delayed[i] && !other.links.has(id));
const sharedVars = (a: LoopView, b: LoopView): Id[] => a.loop.varIds.filter((id) => b.vars.has(id));
const sharedLinkCount = (a: LoopView, b: LoopView): number => a.loop.linkIds.filter((id) => b.links.has(id)).length;
const disjoint = (a: LoopView, b: LoopView): boolean => a.loop.varIds.every((id) => !b.vars.has(id));

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function makeView(loop: Loop, linkById: Map<Id, Link>): LoopView | undefined {
  if (loop.type === 'U') return undefined;
  const links = loop.linkIds.map((id) => linkById.get(id));
  if (links.some((l) => l === undefined)) return undefined; // stale loop
  return {
    loop,
    type: loop.type,
    vars: new Set(loop.varIds),
    links: new Set(loop.linkIds),
    pos: new Map(loop.varIds.map((id, i) => [id, i])),
    polarity: links.map((l) => (l as Link).polarity),
    delayed: links.map((l) => (l as Link).delay),
  };
}

// ── matcher ──────────────────────────────────────────────────────────────────

/** Archetype candidates, strongest first (at most 50). */
export function matchArchetypes(model: Model, loops: Loop[]): ArchetypeCandidate[] {
  const linkById = new Map(model.links.map((l) => [l.id, l]));
  // Self-loops are left out: every template loop links at least two variables, and a one-variable loop would
  // make the same variable play several roles.
  const views = loops
    .filter((l) => l.length >= 2 && l.length <= MAX_MATCH_LOOP_LENGTH)
    .sort(compareLoops)
    .map((l) => makeView(l, linkById))
    .filter((v): v is LoopView => v !== undefined)
    .slice(0, MAX_MATCH_LOOPS);

  const names = new Map(model.variables.map((v) => [v.id, v.name]));
  const q = (id: Id | undefined): string => `"${(id !== undefined && names.get(id)) || id}"`;
  const onLoop = variablesOnLoops(buildCausalGraph(model));
  const incoming = new Map<Id, Id[]>();
  for (const l of model.links) push(incoming, l.to, l.from);
  /** First variable on no loop that drives one of `targets` (a constraint, standard or resource limit). */
  const exogenousDriver = (targets: Iterable<Id>): Id | undefined => {
    for (const t of targets) {
      const driver = (incoming.get(t) ?? []).filter((from) => !onLoop.has(from)).sort(compareIds)[0];
      if (driver !== undefined) return driver;
    }
    return undefined;
  };

  const byVar = new Map<Id, number[]>();
  views.forEach((v, i) => v.loop.varIds.forEach((id) => push(byVar, id, i)));

  const drafts: Draft[] = [];
  const add = (d: Draft) => {
    if (drafts.length < MAX_DRAFTS) drafts.push(d);
  };

  // Limits to Growth: an R loop and a B loop touching at the state variable x (no shared link); the B loop's
  // slowing action is often driven by an exogenous constraint.
  const limitsToGrowth = (r: LoopView, b: LoopView, x: Id) => {
    const constraint = exogenousDriver(b.loop.varIds.filter((id) => id !== x));
    add({
      archetypeId: 'limits-to-growth',
      views: [r, b],
      roles: [
        ['state', x],
        ['growingAction', succ(r, x)],
        ['slowingAction', succ(b, x)],
        ['constraint', constraint],
      ],
      score: 0.55 + (constraint ? 0.25 : 0) + (hasDelay(b) ? 0.1 : 0),
      explanation: `The reinforcing loop through ${q(succ(r, x))} grows ${q(x)} while the balancing loop through ${q(succ(b, x))} slows it${constraint ? `, limited by ${q(constraint)}` : ''}.`,
    });
  };

  // Growth and Underinvestment: Limits to Growth plus a second, typically delayed, B loop (capacity investment)
  // that shares the slowing condition with the first B loop and stays off the growth loop.
  const growthAndUnderinvestment = (r: LoopView, b1: LoopView, x: Id) => {
    const partners = new Set<number>();
    for (const id of b1.loop.varIds) if (id !== x) for (const j of byVar.get(id) ?? []) partners.add(j);
    for (const j of [...partners].sort((a, b) => a - b)) {
      const b2 = views[j];
      if (b2 === b1 || b2.type !== 'B' || !disjoint(b2, r)) continue;
      let condition = succ(b1, x);
      while (!b2.vars.has(condition)) condition = succ(b1, condition);
      const capacity = pred(b2, condition);
      const investment = pred(b2, capacity);
      const standard = exogenousDriver(b2.loop.varIds.filter((id) => !b1.vars.has(id)));
      const delayed = delayOutside(b2, b1);
      add({
        archetypeId: 'growth-and-underinvestment',
        views: [r, b1, b2],
        roles: [
          ['state', x],
          ['growingAction', succ(r, x)],
          ['slowingAction', condition],
          ['capacity', capacity],
          ['investment', investment],
          ['performanceStandard', standard],
        ],
        score: 0.7 + (delayed ? 0.2 : 0) + (standard ? 0.05 : 0),
        explanation: `Growth of ${q(x)} through ${q(succ(r, x))} is held back by ${q(condition)}, and the investment loop through ${q(capacity)} that would relieve it ${delayed ? 'acts only after a delay' : 'competes with the growth loop'}.`,
      });
    }
  };

  // Fixes that Fail: a B loop (the fix) and an R loop sharing the problem → fix path; the R loop's own links carry
  // the unintended consequence, characteristically delayed.
  const fixesThatFail = (b: LoopView, r: LoopView) => {
    const shared = (i: number) => r.links.has(b.loop.linkIds[wrap(b, i)]);
    // The shared run starts where b's links switch from private to shared (two distinct cycles never share all links).
    let start = 0;
    while (start < b.loop.length && !(shared(start) && !shared(start - 1))) start++;
    if (start === b.loop.length) return;
    let end = start;
    while (shared(end)) end++;
    const problem = at(b, start);
    const fix = at(b, end);
    const consequence = succ(r, fix);
    if (b.vars.has(consequence)) return; // the R loop must pass through a consequence outside the fix loop
    const rDelay = delayOutside(r, b);
    add({
      archetypeId: 'fixes-that-fail',
      views: [b, r],
      roles: [
        ['problem', problem],
        ['fix', fix],
        ['consequence', consequence],
      ],
      score: 0.55 + (rDelay ? 0.3 : 0) + (delayOutside(b, r) ? 0 : 0.1),
      explanation: `The balancing loop through the fix ${q(fix)} relieves ${q(problem)}, but the reinforcing loop through ${q(consequence)} feeds the problem back${rDelay ? ' after a delay' : ''}.`,
    });
  };

  // Shifting the Burden: two B loops correcting the same problem x with the same sign pattern (a symptomatic and a
  // delayed fundamental solution), plus an R loop through both where the symptomatic fix's side effect erodes the
  // fundamental solution.
  const shiftingTheBurden = (b1: LoopView, b2: LoopView, x: Id) => {
    const oneDelayed = hasDelay(b1) !== hasDelay(b2);
    const fundamentalFirst = oneDelayed ? hasDelay(b1) : b1.loop.length > b2.loop.length;
    const [symptomatic, fundamental] = fundamentalFirst ? [b2, b1] : [b1, b2];
    const touches = (L: LoopView, other: LoopView) => L.loop.varIds.some((id) => id !== x && other.vars.has(id));
    const sideLoop = (byVar.get(x) ?? [])
      .map((i) => views[i])
      .find((L) => L.type === 'R' && touches(L, symptomatic) && touches(L, fundamental));
    let sideEffect: Id | undefined;
    if (sideLoop)
      for (let id = succ(sideLoop, x); id !== x && !sideEffect; id = succ(sideLoop, id))
        if (!symptomatic.vars.has(id) && !fundamental.vars.has(id)) sideEffect = id;
    add({
      archetypeId: 'shifting-the-burden',
      views: sideLoop ? [symptomatic, fundamental, sideLoop] : [symptomatic, fundamental],
      roles: [
        ['problem', x],
        ['symptomaticSolution', succ(symptomatic, x)],
        ['fundamentalSolution', succ(fundamental, x)],
        ['sideEffect', sideEffect],
      ],
      score: 0.55 + (sideLoop ? 0.25 : 0) + (oneDelayed ? 0.15 : 0),
      explanation: `${q(x)} is corrected by a symptomatic solution through ${q(succ(symptomatic, x))} and a ${oneDelayed ? 'delayed ' : ''}fundamental solution through ${q(succ(fundamental, x))}${sideLoop ? `, and the reinforcing loop through ${q(sideEffect ?? succ(sideLoop, x))} lets the symptomatic fix undermine the fundamental one` : ''}.`,
    });
  };

  // Eroding (Drifting) Goals: two B loops closing the gap x; both leave x with the same sign but enter it with
  // opposite signs — the goal loop (in = out) lowers the goal, the condition loop (in ≠ out) acts, with a delay.
  const erodingGoals = (b1: LoopView, b2: LoopView, x: Id) => {
    const [goalLoop, conditionLoop] = inSign(b1, x) === outSign(b1, x) ? [b1, b2] : [b2, b1];
    const delayed = hasDelay(conditionLoop);
    add({
      archetypeId: 'eroding-goals',
      views: [goalLoop, conditionLoop],
      roles: [
        ['gap', x],
        ['goal', pred(goalLoop, x)],
        ['condition', pred(conditionLoop, x)],
        ['correctiveAction', succ(conditionLoop, x)],
        ['goalPressure', succ(goalLoop, x)],
      ],
      score: 0.55 + (delayed ? 0.25 : 0) + (hasDelay(goalLoop) ? 0 : 0.1),
      explanation: `The gap ${q(x)} closes either through ${delayed ? 'delayed ' : ''}corrective action on ${q(pred(conditionLoop, x))} or by lowering the goal ${q(pred(goalLoop, x))}, so the goal can drift down.`,
    });
  };

  // Escalation and Success to the Successful: two mirror-image loops touching at x (a relative position, or an
  // allocation) that push x in opposite directions — balancing for Escalation, reinforcing for Success to the
  // Successful. Symmetry (equal lengths, matching delays) is the characteristic feature.
  const twoParties = (id: 'escalation' | 'success-to-the-successful', a: LoopView, b: LoopView, x: Id) => {
    const symmetric = a.loop.length === b.loop.length;
    const escalation = id === 'escalation';
    add({
      archetypeId: id,
      views: [a, b],
      roles: escalation
        ? [
            ['relativePosition', x],
            ['activityA', succ(a, x)],
            ['activityB', succ(b, x)],
            ['resultsA', pred(a, x)],
            ['resultsB', pred(b, x)],
          ]
        : [
            ['allocation', x],
            ['resourcesA', succ(a, x)],
            ['resourcesB', succ(b, x)],
            ['successA', pred(a, x)],
            ['successB', pred(b, x)],
          ],
      score: 0.55 + (symmetric ? 0.25 : 0) + (hasDelay(a) === hasDelay(b) ? 0.1 : 0),
      explanation: escalation
        ? `Each party's balancing loop (through ${q(succ(a, x))} and through ${q(succ(b, x))}) reacts to ${q(x)}, which the other party's response pushes the opposite way, so together they escalate.`
        : `The reinforcing loops through ${q(succ(a, x))} and ${q(succ(b, x))} compete through ${q(x)}: success on one side wins it more of ${q(x)} at the other's expense.`,
    });
  };

  // Tragedy of the Commons: two disjoint R loops (each party's gains), each coupled to a B loop; the two B loops
  // share the commons, which lies on neither R loop.
  const tragedyOfTheCommons = (b1: LoopView, b2: LoopView) => {
    const side = (b: LoopView, other: LoopView) =>
      [...new Set(b.loop.varIds.flatMap((id) => byVar.get(id) ?? []))]
        .sort((i, j) => i - j)
        .map((i) => views[i])
        .filter((L) => L.type === 'R' && disjoint(L, other))
        .slice(0, MAX_COMMONS_PARTNERS);
    const side2 = side(b2, b1);
    let pair: [LoopView, LoopView] | undefined;
    for (const r1 of side(b1, b2)) {
      const r2 = side2.find((L) => disjoint(L, r1));
      if (r2) {
        pair = [r1, r2];
        break;
      }
    }
    if (!pair) return;
    const [r1, r2] = pair;
    // Where each B loop leaves its party's R loop (the activity) and re-enters it (the gain).
    const exit = (b: LoopView, r: LoopView) =>
      b.loop.varIds.find((id) => r.vars.has(id) && !r.vars.has(succ(b, id))) as Id;
    const entry = (b: LoopView, r: LoopView) =>
      b.loop.varIds.find((id) => r.vars.has(id) && !r.vars.has(pred(b, id))) as Id;
    const activityA = exit(b1, r1);
    let total = succ(b1, activityA);
    while (!b2.vars.has(total)) total = succ(b1, total);
    let resource = pred(b1, entry(b1, r1));
    while (!b2.vars.has(resource)) resource = pred(b1, resource);
    const commons = sharedVars(b1, b2);
    const limit = exogenousDriver(commons);
    const delayed = hasDelay(b1) && hasDelay(b2);
    add({
      archetypeId: 'tragedy-of-the-commons',
      views: [r1, r2, b1, b2],
      roles: [
        ['activityA', activityA],
        ['activityB', exit(b2, r2)],
        ['gainA', entry(b1, r1)],
        ['gainB', entry(b2, r2)],
        ['totalActivity', total],
        ['gainPerActivity', resource],
        ['resourceLimit', limit],
      ],
      score: 0.7 + (delayed ? 0.15 : 0) + (limit ? 0.1 : 0),
      explanation: `Two reinforcing loops (through ${q(activityA)} and ${q(exit(b2, r2))}) both draw on ${q(total)}, and the shared balancing loops through ${q(resource)} ${delayed ? 'cut every party’s gains after a delay' : 'cut every party’s gains'}.`,
    });
  };

  // Enumerate pairs of loops that share at least one variable.
  views.forEach((a, i) => {
    const partners = new Set<number>();
    for (const id of a.loop.varIds) for (const j of byVar.get(id) ?? []) if (j > i) partners.add(j);
    for (const j of [...partners].sort((p, r) => p - r)) {
      const b = views[j];
      const common = sharedVars(a, b);
      const touch = common.length === 1 && sharedLinkCount(a, b) === 0 ? common[0] : undefined;
      if (a.type !== b.type) {
        const [r, bal] = a.type === 'R' ? [a, b] : [b, a];
        if (touch !== undefined) {
          limitsToGrowth(r, bal, touch);
          growthAndUnderinvestment(r, bal, touch);
        } else if (sharedLinkCount(a, b) > 0) fixesThatFail(bal, r);
      } else if (a.type === 'B') {
        tragedyOfTheCommons(a, b);
        if (touch === undefined) continue;
        const sameIn = inSign(a, touch) === inSign(b, touch);
        const sameOut = outSign(a, touch) === outSign(b, touch);
        if (sameIn && sameOut) shiftingTheBurden(a, b, touch);
        else if (sameOut) erodingGoals(a, b, touch);
        else if (inSign(a, touch) !== outSign(a, touch) && inSign(b, touch) !== outSign(b, touch))
          twoParties('escalation', a, b, touch);
      } else if (
        touch !== undefined &&
        inSign(a, touch) !== inSign(b, touch) &&
        outSign(a, touch) !== outSign(b, touch)
      ) {
        twoParties('success-to-the-successful', a, b, touch);
      }
    }
  });

  return finalize(drafts);
}

/** Dedupe, down-weight patterns contained in a larger match, sort and cap. */
function finalize(drafts: Draft[]): ArchetypeCandidate[] {
  const best = new Map<string, Draft>();
  for (const d of drafts) {
    const id = `${d.archetypeId}|${d.views
      .map((v) => v.loop.key)
      .sort(compareIds)
      .join('|')}`;
    const prev = best.get(id);
    if (!prev || d.score > prev.score) best.set(id, d);
  }
  const unique = [...best.values()];
  const keySets = new Map(unique.map((d) => [d, new Set(d.views.map((v) => v.loop.key))]));
  const large = unique.filter((d) => d.views.length > 2);

  const candidates = unique.map((d): ArchetypeCandidate => {
    const keys = keySets.get(d) as Set<LoopKey>;
    const container = large
      .filter((big) => big !== d && big.views.length > keys.size && [...keys].every((k) => keySets.get(big)?.has(k)))
      .sort((a, b) => b.score - a.score)[0];
    const score = container ? d.score * COMPONENT_FACTOR : d.score;
    const roles: Record<string, Id> = {};
    const used = new Set<Id>();
    for (const [role, id] of d.roles)
      if (id !== undefined && !used.has(id)) {
        roles[role] = id;
        used.add(id);
      }
    return {
      archetypeId: d.archetypeId,
      loopKeys: d.views.map((v) => v.loop.key),
      roles,
      score: Math.round(score * 1000) / 1000,
      explanation: container
        ? `${d.explanation.slice(0, -1)}; this is part of a larger ${LABEL[container.archetypeId]} structure.`
        : d.explanation,
    };
  });

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      compareIds(a.archetypeId, b.archetypeId) ||
      compareIds(a.loopKeys.join('|'), b.loopKeys.join('|')),
  );
  return candidates.slice(0, MAX_CANDIDATES);
}
