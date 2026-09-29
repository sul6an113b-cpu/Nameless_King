/**
 * QC inspection and NCR (non-conformance report) backlog during a construction peak. Items submitted for
 * inspection queue for a capacity-limited inspection team; rejected items get an NCR and return for re-inspection
 * after repair (a rework loop that adds to the inspection load). During the peak the load exceeds capacity and the
 * backlog grows; afterwards it drains only at the spare capacity, so waiting times stay long well after the peak.
 * Queue and rework structure as in the project rework cycle reviewed by Lyneis & Ford (2007).
 * All parameter values are illustrative.
 */
import { buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { ExampleModel } from '../types.ts';

const model = buildModel({
  id: 'm_example_qc_ncr_backlog',
  name: 'QC inspection and NCR backlog',
  simSpec: { start: 0, stop: 78, dt: 0.125, method: 'euler', timeUnit: 'week' },
  units: ['items'],
  variables: [
    // stocks
    { id: 'v_awaiting', name: 'Awaiting inspection', kind: 'stock', eq: '0', units: 'items', nonNegative: true, doc: 'Inspection requests (e.g. welds, test packs) waiting for QC.' },
    { id: 'v_open_ncrs', name: 'Open NCRs', kind: 'stock', eq: '0', units: 'items', nonNegative: true, doc: 'Rejected items being repaired.' },
    { id: 'v_accepted', name: 'Accepted', kind: 'stock', eq: '0', units: 'items' },
    // flows
    { id: 'v_submissions', name: 'Submissions', kind: 'flow', eq: 'Normal_submission_rate + STEP(Peak_extra_submissions, Peak_start_time) - STEP(Peak_extra_submissions, Peak_end_time)', units: 'items/week', to: 'v_awaiting', doc: 'Work offered for inspection; higher during the construction peak.' },
    { id: 'v_passed', name: 'Items passed', kind: 'flow', eq: 'Inspection_rate * (1 - Rejection_fraction)', units: 'items/week', from: 'v_awaiting', to: 'v_accepted' },
    { id: 'v_rejected', name: 'Items rejected', kind: 'flow', eq: 'Inspection_rate * Rejection_fraction', units: 'items/week', from: 'v_awaiting', to: 'v_open_ncrs' },
    { id: 'v_repaired', name: 'NCRs closed', kind: 'flow', eq: 'MIN(Repair_capacity, Open_NCRs / Minimum_repair_time)', units: 'items/week', from: 'v_open_ncrs', to: 'v_awaiting', doc: 'Repaired items return for re-inspection.' },
    // auxiliaries
    { id: 'v_inspection_rate', name: 'Inspection rate', kind: 'aux', eq: 'MIN(Inspection_capacity, Awaiting_inspection / Minimum_inspection_time)', units: 'items/week' },
    { id: 'v_wait', name: 'Inspection waiting time', kind: 'aux', eq: 'Awaiting_inspection / Inspection_capacity', units: 'week', doc: 'Approximate wait for a new request when QC works at capacity (Little’s law).' },
    // constants
    { id: 'v_normal_rate', name: 'Normal submission rate', kind: 'constant', eq: '35', units: 'items/week', range: [30, 40] },
    { id: 'v_peak_extra', name: 'Peak extra submissions', kind: 'constant', eq: '30', units: 'items/week', range: [20, 40] },
    { id: 'v_peak_start', name: 'Peak start time', kind: 'constant', eq: '10', units: 'week', range: [8, 12] },
    { id: 'v_peak_end', name: 'Peak end time', kind: 'constant', eq: '30', units: 'week', range: [26, 34] },
    { id: 'v_capacity', name: 'Inspection capacity', kind: 'constant', eq: '50', units: 'items/week', range: [40, 60], doc: 'E.g. inspectors × inspections per inspector-week.' },
    { id: 'v_rejection', name: 'Rejection fraction', kind: 'constant', eq: '0.1', units: 'dmnl', range: [0.05, 0.2] },
    { id: 'v_repair_capacity', name: 'Repair capacity', kind: 'constant', eq: '10', units: 'items/week', range: [6, 14] },
    { id: 'v_min_inspection', name: 'Minimum inspection time', kind: 'constant', eq: '1', units: 'week', range: [0.5, 2] },
    { id: 'v_min_repair', name: 'Minimum repair time', kind: 'constant', eq: '1', units: 'week', range: [0.5, 2] },
  ],
  links: [
    ['v_normal_rate', 'v_submissions', '+'],
    ['v_peak_extra', 'v_submissions', '+'],
    ['v_peak_start', 'v_submissions', '-'],
    ['v_peak_end', 'v_submissions', '+'],
    ['v_inspection_rate', 'v_passed', '+'],
    ['v_rejection', 'v_passed', '-'],
    ['v_inspection_rate', 'v_rejected', '+'],
    ['v_rejection', 'v_rejected', '+'],
    ['v_repair_capacity', 'v_repaired', '+'],
    ['v_open_ncrs', 'v_repaired', '+'],
    ['v_min_repair', 'v_repaired', '-'],
    ['v_capacity', 'v_inspection_rate', '+'],
    ['v_awaiting', 'v_inspection_rate', '+'],
    ['v_min_inspection', 'v_inspection_rate', '-'],
    ['v_awaiting', 'v_wait', '+'],
    ['v_capacity', 'v_wait', '-'],
  ],
  frame: {
    problem:
      'During the construction peak the QC inspection backlog exploded; months after the peak, crews still wait weeks ' +
      'for hold-point releases.',
    purpose: 'Explain why the backlog outlives the peak and compare inspection capacity, repair capacity and first-time quality as levers.',
    kpis: [
      { id: 'k_awaiting', name: 'Awaiting inspection', varId: 'v_awaiting', goal: 'minimize' },
      { id: 'k_wait', name: 'Inspection waiting time', varId: 'v_wait', goal: 'target', target: 1 },
      { id: 'k_ncrs', name: 'Open NCRs', varId: 'v_open_ncrs', goal: 'minimize' },
    ],
    referenceModes: [
      {
        id: 'r_backlog',
        name: 'Backlog outlives the peak',
        varId: 'v_awaiting',
        source: 'sketch',
        label: 'historical',
        units: 'items',
        note: 'Illustrative sketch of the pattern; not project data.',
        points: [[0, 0], [10, 50], [20, 240], [30, 450], [45, 300], [60, 150], [78, 40]],
      },
    ],
    excluded: [
      { id: 'b_latent', name: 'Defects missed by inspection', reason: 'Detection is assumed perfect to keep the queue simple.' },
      { id: 'b_rushing', name: 'Inspectors rushing under backlog pressure', reason: 'A possible extension (would lower detection).' },
      { id: 'b_work_at_risk', name: 'Crews proceeding past hold points at risk', reason: 'Left out for simplicity.' },
    ],
  },
  assertions: [
    { id: 'a_awaiting', expr: 'Awaiting_inspection >= 0' },
    { id: 'a_ncrs', expr: 'Open_NCRs >= 0' },
  ],
  scenarios: [
    { id: 's_more_inspectors', name: 'Add inspection capacity', overrides: [{ varId: 'v_capacity', equation: '60' }] },
    { id: 's_first_time_quality', name: 'Improve first-time quality', note: 'E.g. welder qualification and pre-inspection by the contractor.', overrides: [{ varId: 'v_rejection', equation: '0.05' }] },
  ],
  interventions: [
    { id: 'i_more_inspectors', name: 'Add inspectors for the peak', leverage: 12, scenarioId: 's_more_inspectors', description: 'A capacity parameter.' },
    { id: 'i_first_time_quality', name: 'Improve first-time quality', leverage: 12, scenarioId: 's_first_time_quality', description: 'Fewer rejections means less re-inspection load (a parameter in this model).' },
    {
      id: 'i_publish_wait',
      name: 'Publish the live inspection backlog and waiting time to site',
      leverage: 6,
      description: 'Lets supervisors level submissions ahead of the peak; needs a structural change to test.',
    },
  ],
});

export const qcNcrBacklog: ExampleModel = {
  id: 'qc-ncr-backlog',
  title: 'QC inspection and NCR backlog',
  description:
    'A capacity-limited inspection queue with a repair-and-reinspect loop. Shows why the backlog peaks after the ' +
    'construction peak and drains only at the spare capacity. Illustrative parameters.',
  model,
  sources: [cite('lyneis-ford-2007', true)],
};
