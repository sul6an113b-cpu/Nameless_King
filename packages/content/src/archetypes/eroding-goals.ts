/**
 * Eroding Goals (Drifting Goals). Structure after Senge (1990) and Kim (1992): a gap between goal and performance can
 * be closed by corrective action (B1, slow) or by lowering the goal (B2, fast); under persistent pressure the goal
 * drifts down. Meadows (2008, ch. 5) calls the trap "drift to low performance"; the floating-goal formulation follows
 * Sterman (2000) (not verified to a chapter). Checked against
 * https://thesystemsthinker.com/drifting-goals-the-boiled-frog-syndrome/ (search summary). Values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_eroding_goals_cld',
  name: 'Eroding Goals (CLD)',
  variables: [
    { id: 'v_goal', name: 'Goal' },
    { id: 'v_gap', name: 'Gap' },
    { id: 'v_action', name: 'Corrective action' },
    { id: 'v_condition', name: 'Actual condition' },
    { id: 'v_pressure', name: 'Pressure to lower goal' },
  ],
  links: [
    ['v_goal', 'v_gap', '+'],
    ['v_condition', 'v_gap', '-'],
    ['v_gap', 'v_action', '+', { note: 'A gap prompts corrective action…' }],
    ['v_action', 'v_condition', '+', { delay: true, note: '…which improves the condition only after a delay (B1).' }],
    ['v_gap', 'v_pressure', '+', { note: 'A persistent gap creates pressure to lower the goal…' }],
    ['v_pressure', 'v_goal', '-', { note: '…which closes the gap without any improvement (B2).' }],
  ],
});

const sfd = buildModel({
  id: 'm_arch_eroding_goals_sfd',
  name: 'Eroding Goals (SFD)',
  simSpec: { start: 0, stop: 72, dt: 0.25, method: 'euler', timeUnit: 'month' },
  variables: [
    { id: 'v_performance', name: 'Performance', kind: 'stock', eq: '0.95', units: 'dmnl', doc: 'E.g. share of deliverables on time.' },
    { id: 'v_goal', name: 'Performance goal', kind: 'stock', eq: '0.95', units: 'dmnl' },
    { id: 'v_correction', name: 'Corrective action', kind: 'flow', eq: 'Gap / Correction_time', units: '1/month', to: 'v_performance', doc: 'Closing the gap by improving (B1, slow).' },
    { id: 'v_drag', name: 'Performance drag', kind: 'flow', eq: 'STEP(External_pressure, Pressure_start_time)', units: '1/month', from: 'v_performance', doc: 'A persistent disturbance that starts at the pressure start time.' },
    { id: 'v_erosion', name: 'Goal erosion', kind: 'flow', eq: 'Gap / Goal_adjustment_time', units: '1/month', from: 'v_goal', nonNegative: true, doc: 'Closing the gap by lowering the goal (B2, fast). Goals only ratchet down.' },
    { id: 'v_gap', name: 'Gap', kind: 'aux', eq: 'Performance_goal - Performance', units: 'dmnl' },
    { id: 'v_correction_time', name: 'Correction time', kind: 'constant', eq: '6', units: 'month', range: [3, 12] },
    { id: 'v_goal_time', name: 'Goal adjustment time', kind: 'constant', eq: '12', units: 'month', range: [6, 24] },
    { id: 'v_pressure', name: 'External pressure', kind: 'constant', eq: '0.01', units: '1/month', range: [0.005, 0.02] },
    { id: 'v_pressure_start', name: 'Pressure start time', kind: 'constant', eq: '6', units: 'month', range: [3, 9] },
  ],
  links: [
    ['v_goal', 'v_gap', '+'],
    ['v_performance', 'v_gap', '-'],
    ['v_gap', 'v_correction', '+'],
    ['v_correction_time', 'v_correction', '-'],
    ['v_pressure', 'v_drag', '+'],
    ['v_pressure_start', 'v_drag', '-'],
    ['v_gap', 'v_erosion', '+'],
    ['v_goal_time', 'v_erosion', '-'],
  ],
  frame: {
    problem: 'Standards that used to be non-negotiable have quietly become “realistic”.',
    purpose: 'Show how letting the goal adjust to performance turns a temporary gap into a permanent decline.',
    kpis: [
      { id: 'k_goal', name: 'Performance goal', varId: 'v_goal', goal: 'target', target: 0.95 },
      { id: 'k_performance', name: 'Performance', varId: 'v_performance', goal: 'maximize' },
    ],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'Goal drifts down',
        varId: 'v_goal',
        source: 'sketch',
        label: 'feared',
        units: 'dmnl',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 0.95], [6, 0.95], [18, 0.93], [36, 0.87], [54, 0.81], [72, 0.75]],
      },
    ],
    excluded: [{ id: 'b_source', name: 'Source of the external pressure', reason: 'Treated as exogenous.' }],
  },
  scenarios: [
    {
      id: 's_hold_goal',
      name: 'Hold the goal',
      note: 'Anchor the goal to an external standard (goal adjustment practically never happens).',
      overrides: [{ varId: 'v_goal_time', equation: '1000000' }],
    },
  ],
});

export const erodingGoals: Archetype = {
  id: 'eroding-goals',
  name: 'Eroding Goals',
  summary:
    'When performance falls short of the goal, the gap can be closed by corrective action or by lowering the goal; ' +
    'lowering the goal is quicker and easier, so under persistent pressure the goal, and with it performance, drifts down.',
  structure:
    'B1 (corrective action, delayed): Gap → (+) Corrective action → (+, delayed) Actual condition → (−) Gap. ' +
    'B2 (lower the goal): Gap → (+) Pressure to lower goal → (−) Goal → (+) Gap.',
  cld,
  sfd,
  signature: {
    kpi: 'v_goal',
    shape: 'goal-erosion',
    description:
      'After a disturbance opens a gap, the goal drifts steadily down and performance follows it; with the goal held ' +
      'fixed, performance would instead settle at a level just below the goal.',
  },
  interventions: [
    { text: 'Anchor goals to external benchmarks or customer requirements rather than to past performance.', leverage: 3 },
    { text: 'Make any change to a goal an explicit, recorded decision with a reason.', leverage: 5 },
    { text: 'Shorten the time corrective action takes to show results.', leverage: 9 },
  ],
  illustrations: {
    generic: 'An on-time delivery target of 95 % becomes 90 %, then 85 %, each time justified as “realistic”.',
    epc:
      'Weld-repair-rate targets on a piping package are relaxed after a bad month, then again the next quarter, until ' +
      'a repair rate that once triggered a stop-work is treated as normal.',
  },
  sources: [cite('senge-1990', true), cite('kim-1992', true), cite('meadows-2008', true, 'ch. 5, “System Traps … and Opportunities”'), cite('sterman-2000', false)],
};
