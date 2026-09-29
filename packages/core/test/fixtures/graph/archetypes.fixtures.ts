/**
 * Minimal causal loop diagrams of the eight system archetypes, drawn after the templates in Senge (1990),
 * *The Fifth Discipline*, and Kim (1992), *Systems Archetypes I*. These are LoopLab's own minimal renderings
 * (variable names generic), used to test the structural matcher; they are not reproductions of the books' figures.
 */
import type { ArchetypeId } from '../../../src/schema/model.ts';
import type { GraphSpec } from './build.ts';

export interface ArchetypeFixture {
  archetypeId: ArchetypeId;
  spec: GraphSpec;
  /** loop keys of the expected top candidate (in the matcher's role order) */
  loopKeys: string[];
  roles: Record<string, string>;
}

const v = (id: string, name: string) => ({ id, name });

export const archetypeFixtures: ArchetypeFixture[] = [
  {
    // R: effort ⇄ perf. B: perf → slow → perf (delayed). The limit constrains the slowing action.
    archetypeId: 'limits-to-growth',
    spec: {
      vars: [v('effort', 'Growing action'), v('perf', 'Performance'), v('slow', 'Slowing action'), v('limit', 'Resource limit')],
      links: [
        ['effort', 'perf', '+'],
        ['perf', 'effort', '+'],
        ['perf', 'slow', '+'],
        ['slow', 'perf', '-', 'delay'],
        ['limit', 'slow', '-'],
      ],
    },
    loopKeys: ['effort>perf', 'perf>slow'],
    roles: { state: 'perf', growingAction: 'effort', slowingAction: 'slow', constraint: 'limit' },
  },
  {
    // B: problem → fix → problem. R: problem → fix → side effect → problem, the consequence arriving late.
    archetypeId: 'fixes-that-fail',
    spec: {
      vars: [v('problem', 'Problem symptom'), v('fix', 'Fix'), v('side', 'Unintended consequences')],
      links: [
        ['problem', 'fix', '+'],
        ['fix', 'problem', '-'],
        ['fix', 'side', '+'],
        ['side', 'problem', '+', 'delay'],
      ],
    },
    loopKeys: ['fix>problem', 'fix>side>problem'],
    roles: { problem: 'problem', fix: 'fix', consequence: 'side' },
  },
  {
    // B1 symptomatic and B2 fundamental (delayed) solutions to one problem; the symptomatic solution's side
    // effect weakens the fundamental solution, closing the R loop problem → symp → side → fund → problem (+ + − −).
    archetypeId: 'shifting-the-burden',
    spec: {
      vars: [
        v('problem', 'Problem symptom'),
        v('symp', 'Symptomatic solution'),
        v('fund', 'Fundamental solution'),
        v('side', 'Side effect'),
      ],
      links: [
        ['problem', 'symp', '+'],
        ['symp', 'problem', '-'],
        ['problem', 'fund', '+'],
        ['fund', 'problem', '-', 'delay'],
        ['symp', 'side', '+'],
        ['side', 'fund', '-'],
      ],
    },
    loopKeys: ['problem>symp', 'fund>problem', 'fund>problem>symp>side'],
    roles: { problem: 'problem', symptomaticSolution: 'symp', fundamentalSolution: 'fund', sideEffect: 'side' },
  },
  {
    // Gap = goal − condition. B1: gap → pressure → goal → gap (+ − +). B2: gap → action → condition → gap (+ + −),
    // with the corrective action delayed.
    archetypeId: 'eroding-goals',
    spec: {
      vars: [
        v('goal', 'Goal'),
        v('gap', 'Gap'),
        v('cond', 'Condition'),
        v('action', 'Corrective action'),
        v('pressure', 'Pressure to lower goal'),
      ],
      links: [
        ['goal', 'gap', '+'],
        ['cond', 'gap', '-'],
        ['gap', 'pressure', '+'],
        ['pressure', 'goal', '-'],
        ['gap', 'action', '+'],
        ['action', 'cond', '+', 'delay'],
      ],
    },
    loopKeys: ['gap>pressure>goal', 'action>cond>gap'],
    roles: { gap: 'gap', goal: 'goal', condition: 'cond', correctiveAction: 'action', goalPressure: 'pressure' },
  },
  {
    // A's results relative to B's (rel): A acts when rel falls, B acts when rel rises. Two B loops, mirror images.
    archetypeId: 'escalation',
    spec: {
      vars: [
        v('rel', "A's results relative to B's"),
        v('actA', 'Activity by A'),
        v('resA', 'Results of A'),
        v('actB', 'Activity by B'),
        v('resB', 'Results of B'),
      ],
      links: [
        ['rel', 'actA', '-'],
        ['actA', 'resA', '+'],
        ['resA', 'rel', '+'],
        ['rel', 'actB', '+'],
        ['actB', 'resB', '+'],
        ['resB', 'rel', '-'],
      ],
    },
    loopKeys: ['actA>resA>rel', 'actB>resB>rel'],
    roles: { relativePosition: 'rel', activityA: 'actA', activityB: 'actB', resultsA: 'resA', resultsB: 'resB' },
  },
  {
    // Allocation to A instead of B: R1 through A's resources and success (+ + +), R2 through B's (− + −).
    archetypeId: 'success-to-the-successful',
    spec: {
      vars: [
        v('alloc', 'Allocation to A instead of B'),
        v('resA', 'Resources to A'),
        v('sucA', 'Success of A'),
        v('resB', 'Resources to B'),
        v('sucB', 'Success of B'),
      ],
      links: [
        ['alloc', 'resA', '+'],
        ['resA', 'sucA', '+'],
        ['sucA', 'alloc', '+'],
        ['alloc', 'resB', '-'],
        ['resB', 'sucB', '+'],
        ['sucB', 'alloc', '-'],
      ],
    },
    loopKeys: ['alloc>resA>sucA', 'alloc>resB>sucB'],
    roles: { allocation: 'alloc', resourcesA: 'resA', resourcesB: 'resB', successA: 'sucA', successB: 'sucB' },
  },
  {
    // Each party's R loop (activity ⇄ net gains); both activities add to total activity, which (after a delay)
    // lowers the gain per individual activity, closing one B loop per party. The resource limit sets that gain.
    archetypeId: 'tragedy-of-the-commons',
    spec: {
      vars: [
        v('actA', "A's activity"),
        v('gainA', 'Net gains for A'),
        v('actB', "B's activity"),
        v('gainB', 'Net gains for B'),
        v('total', 'Total activity'),
        v('gpi', 'Gain per individual activity'),
        v('limit', 'Resource limit'),
      ],
      links: [
        ['actA', 'gainA', '+'],
        ['gainA', 'actA', '+'],
        ['actB', 'gainB', '+'],
        ['gainB', 'actB', '+'],
        ['actA', 'total', '+'],
        ['actB', 'total', '+'],
        ['total', 'gpi', '-', 'delay'],
        ['gpi', 'gainA', '+'],
        ['gpi', 'gainB', '+'],
        ['limit', 'gpi', '+'],
      ],
    },
    loopKeys: ['actA>gainA', 'actB>gainB', 'actA>total>gpi>gainA', 'actB>total>gpi>gainB'],
    roles: {
      activityA: 'actA',
      activityB: 'actB',
      gainA: 'gainA',
      gainB: 'gainB',
      totalActivity: 'total',
      gainPerActivity: 'gpi',
      resourceLimit: 'limit',
    },
  },
  {
    // R: growing action ⇄ demand. B1: demand → delivery delay → demand. B2: delivery delay → need to invest →
    // investment → capacity (delayed) → delivery delay. The performance standard sets the perceived need.
    archetypeId: 'growth-and-underinvestment',
    spec: {
      vars: [
        v('grow', 'Growing action'),
        v('demand', 'Demand'),
        v('ddelay', 'Delivery delay'),
        v('need', 'Perceived need to invest'),
        v('invest', 'Investment in capacity'),
        v('capacity', 'Capacity'),
        v('standard', 'Performance standard'),
      ],
      links: [
        ['grow', 'demand', '+'],
        ['demand', 'grow', '+'],
        ['demand', 'ddelay', '+'],
        ['ddelay', 'demand', '-'],
        ['ddelay', 'need', '+'],
        ['need', 'invest', '+'],
        ['invest', 'capacity', '+', 'delay'],
        ['capacity', 'ddelay', '-'],
        ['standard', 'need', '-'],
      ],
    },
    loopKeys: ['demand>grow', 'ddelay>demand', 'capacity>ddelay>need>invest'],
    roles: {
      state: 'demand',
      growingAction: 'grow',
      slowingAction: 'ddelay',
      capacity: 'capacity',
      investment: 'invest',
      performanceStandard: 'standard',
    },
  },
];

/** Graphs without an archetype structure (or with only a bare fragment of one). */
export const unrelatedGraphs: { name: string; spec: GraphSpec }[] = [
  {
    name: 'chain without loops',
    spec: {
      vars: ['a', 'b', 'c'],
      links: [
        ['a', 'b', '+'],
        ['b', 'c', '-'],
      ],
    },
  },
  {
    name: 'single reinforcing loop',
    spec: {
      vars: ['a', 'b', 'c'],
      links: [
        ['a', 'b', '+'],
        ['b', 'c', '+'],
        ['c', 'a', '+', 'delay'],
      ],
    },
  },
  {
    name: 'single balancing loop with an exogenous driver',
    spec: {
      vars: ['a', 'b', 'c', 'd'],
      links: [
        ['a', 'b', '+'],
        ['b', 'c', '+'],
        ['c', 'a', '-', 'delay'],
        ['d', 'b', '+'],
      ],
    },
  },
  {
    name: 'two disconnected loops',
    spec: {
      vars: ['a', 'b', 'c', 'd', 'e'],
      links: [
        ['a', 'b', '+'],
        ['b', 'a', '+'],
        ['c', 'd', '+'],
        ['d', 'e', '+'],
        ['e', 'c', '-', 'delay'],
      ],
    },
  },
  {
    name: 'two reinforcing loops pulling the shared variable the same way',
    spec: {
      vars: ['x', 'a', 'b', 'c'],
      links: [
        ['x', 'a', '+'],
        ['a', 'x', '+'],
        ['x', 'b', '+'],
        ['b', 'c', '+'],
        ['c', 'x', '+'],
      ],
    },
  },
  {
    name: 'nested R and B loops without delays',
    spec: {
      vars: ['a', 'b', 'c'],
      links: [
        ['a', 'b', '+'],
        ['b', 'c', '+'],
        ['c', 'a', '-'],
        ['b', 'a', '+'],
      ],
    },
  },
  {
    name: 'R and B loops touching at one variable, no constraint or delay',
    spec: {
      vars: ['x', 'a', 'b'],
      links: [
        ['x', 'a', '+'],
        ['a', 'x', '+'],
        ['x', 'b', '+'],
        ['b', 'x', '-'],
      ],
    },
  },
  {
    // B loops through x entering it with the same sign but leaving it with opposite signs: no archetype template.
    name: 'two balancing loops with a non-archetype sign pattern',
    spec: {
      vars: ['x', 'a', 'c', 'b', 'd'],
      links: [
        ['x', 'a', '+'],
        ['a', 'c', '-'],
        ['c', 'x', '+'],
        ['x', 'b', '-'],
        ['b', 'd', '+'],
        ['d', 'x', '+'],
      ],
    },
  },
];
