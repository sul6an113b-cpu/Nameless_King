/**
 * Engineering → procurement → construction handoff for one bulk commodity (piping spools), as an aging chain with
 * delays. Engineering issues isometrics at its capacity after a start-up period; each issued spool enters
 * fabrication and delivery (a third-order material delay, DELAY3, with no spools in the pipeline at the start);
 * delivered spools wait on site until the installation crews, mobilised on a fixed date, install them.
 * Shows how delays in the upstream phases leave construction capacity idle and push the installation S-curve right.
 * The knock-on effects between phases follow the project-dynamics drivers reviewed by Lyneis & Ford (2007).
 * All parameter values are illustrative.
 */
import { buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { ExampleModel } from '../types.ts';

const model = buildModel({
  id: 'm_example_epc_handoff',
  name: 'EPC handoff: engineering → procurement → construction',
  simSpec: { start: 0, stop: 80, dt: 0.0625, method: 'euler', timeUnit: 'week' },
  units: ['spools'],
  variables: [
    // stocks (the aging chain)
    { id: 'v_to_engineer', name: 'Spools to engineer', kind: 'stock', eq: 'Piping_scope', units: 'spools', nonNegative: true },
    { id: 'v_in_procurement', name: 'Spools in procurement', kind: 'stock', eq: '0', units: 'spools', doc: 'Isometric issued; spool being bought, fabricated and shipped.' },
    { id: 'v_on_site', name: 'Spools on site', kind: 'stock', eq: '0', units: 'spools', nonNegative: true, doc: 'Delivered, waiting for installation.' },
    { id: 'v_installed', name: 'Spools installed', kind: 'stock', eq: '0', units: 'spools' },
    // flows
    { id: 'v_issue', name: 'Isometric issue', kind: 'flow', eq: 'MIN(Engineering_output, Spools_to_engineer / Minimum_issue_time)', units: 'spools/week', from: 'v_to_engineer', to: 'v_in_procurement' },
    { id: 'v_delivery', name: 'Spool delivery', kind: 'flow', eq: 'DELAY3(Isometric_issue, Procurement_lead_time)', units: 'spools/week', from: 'v_in_procurement', to: 'v_on_site', doc: 'Third-order material delay: deliveries spread around the average lead time.' },
    { id: 'v_install', name: 'Installation', kind: 'flow', eq: 'MIN(Construction_capacity, Spools_on_site / Minimum_installation_time)', units: 'spools/week', from: 'v_on_site', to: 'v_installed' },
    // auxiliaries
    { id: 'v_eng_output', name: 'Engineering output', kind: 'aux', eq: 'STEP(Engineering_capacity, Engineering_start_time)', units: 'spools/week', doc: 'No isometrics until basic design is frozen.' },
    {
      id: 'v_cons_capacity',
      name: 'Construction capacity',
      kind: 'aux',
      eq: 'MIN(STEP(Crew_capacity, Construction_mobilisation_time), (Piping_scope - Spools_installed) / Minimum_installation_time)',
      units: 'spools/week',
      doc: 'Crews from the mobilisation date; released as the remaining scope runs out.',
    },
    { id: 'v_idle', name: 'Idle crew capacity', kind: 'aux', eq: 'Construction_capacity - Installation', units: 'spools/week', doc: 'Installation capacity paid for but not used because spools are missing.' },
    { id: 'v_installed_fraction', name: 'Installed fraction', kind: 'aux', eq: 'Spools_installed / Piping_scope', units: 'dmnl' },
    // constants
    { id: 'v_scope', name: 'Piping scope', kind: 'constant', eq: '2000', units: 'spools', range: [1800, 2200] },
    { id: 'v_eng_capacity', name: 'Engineering capacity', kind: 'constant', eq: '80', units: 'spools/week', range: [60, 100], doc: 'Isometrics issued per week.' },
    { id: 'v_eng_start', name: 'Engineering start time', kind: 'constant', eq: '4', units: 'week', range: [2, 8] },
    { id: 'v_min_issue', name: 'Minimum issue time', kind: 'constant', eq: '1', units: 'week', range: [0.5, 2] },
    { id: 'v_lead_time', name: 'Procurement lead time', kind: 'constant', eq: '16', units: 'week', range: [12, 24], doc: 'Average time from isometric issue to spool delivery on site.' },
    { id: 'v_crew', name: 'Crew capacity', kind: 'constant', eq: '60', units: 'spools/week', range: [50, 70] },
    { id: 'v_mobilisation', name: 'Construction mobilisation time', kind: 'constant', eq: '12', units: 'week', range: [8, 20], doc: 'Planned on an assumed 8-week procurement lead time.' },
    { id: 'v_min_install', name: 'Minimum installation time', kind: 'constant', eq: '2', units: 'week', range: [1, 4], doc: 'Preparation time for a delivered spool (preservation, rigging, access).' },
  ],
  links: [
    ['v_scope', 'v_to_engineer', '+', { note: 'Initial scope.' }],
    ['v_eng_output', 'v_issue', '+'],
    ['v_to_engineer', 'v_issue', '+'],
    ['v_min_issue', 'v_issue', '-'],
    ['v_issue', 'v_delivery', '+', { delay: true, note: 'Procurement handoff: fabrication and shipping.' }],
    ['v_lead_time', 'v_delivery', '-'],
    ['v_cons_capacity', 'v_install', '+'],
    ['v_on_site', 'v_install', '+'],
    ['v_min_install', 'v_install', '-'],
    ['v_eng_capacity', 'v_eng_output', '+'],
    ['v_eng_start', 'v_eng_output', '-'],
    ['v_crew', 'v_cons_capacity', '+'],
    ['v_mobilisation', 'v_cons_capacity', '-'],
    ['v_scope', 'v_cons_capacity', '+'],
    ['v_installed', 'v_cons_capacity', '-'],
    ['v_min_install', 'v_cons_capacity', '-'],
    ['v_cons_capacity', 'v_idle', '+'],
    ['v_install', 'v_idle', '-'],
    ['v_installed', 'v_installed_fraction', '+'],
    ['v_scope', 'v_installed_fraction', '-'],
  ],
  frame: {
    problem:
      'Piping crews were mobilised on the planned date but sat partly idle for months waiting for spools, and ' +
      'mechanical completion still slipped.',
    purpose:
      'Show how the engineering start-up, procurement lead time and crew mobilisation date interact, and which lever ' +
      'moves the installation curve most.',
    kpis: [
      { id: 'k_installed', name: 'Installed fraction', varId: 'v_installed_fraction', goal: 'target', target: 1 },
      { id: 'k_idle', name: 'Idle crew capacity', varId: 'v_idle', goal: 'minimize' },
    ],
    referenceModes: [
      {
        id: 'r_installation',
        name: 'Installation S-curve lags the plan',
        varId: 'v_installed_fraction',
        source: 'sketch',
        label: 'historical',
        units: 'dmnl',
        note: 'Illustrative sketch of a typical lagging installation curve; not project data.',
        points: [[0, 0], [16, 0], [24, 0.05], [32, 0.2], [40, 0.45], [48, 0.7], [56, 0.9], [64, 1]],
      },
    ],
    excluded: [
      { id: 'b_rework', name: 'Engineering rework and design changes', reason: 'See the rework example.' },
      { id: 'b_priority', name: 'Area-by-area prioritisation', reason: 'One aggregate commodity keeps the chain simple.' },
      { id: 'b_other', name: 'Other commodities (steel, equipment, E&I)', reason: 'Same structure, one commodity shown.' },
    ],
  },
  assertions: [
    { id: 'a_on_site', expr: 'Spools_on_site >= 0' },
    { id: 'a_idle', expr: 'Idle_crew_capacity >= 0', note: 'Crews never install more than their capacity.' },
  ],
  scenarios: [
    { id: 's_late_mobilisation', name: 'Mobilise crews later', note: 'Mobilise when spools are actually on site.', overrides: [{ varId: 'v_mobilisation', equation: '22' }] },
    { id: 's_faster_procurement', name: 'Shorter procurement lead time', note: 'Frame agreements with the spool fabricator.', overrides: [{ varId: 'v_lead_time', equation: '10' }] },
    { id: 's_early_engineering', name: 'Start isometrics earlier', overrides: [{ varId: 'v_eng_start', equation: '2' }] },
  ],
  interventions: [
    { id: 'i_mobilise_later', name: 'Mobilise installation crews when spools arrive', leverage: 12, scenarioId: 's_late_mobilisation', description: 'Changes a date (a parameter) to cut idle capacity.' },
    { id: 'i_faster_procurement', name: 'Shorten the procurement lead time', leverage: 9, scenarioId: 's_faster_procurement', description: 'Shortens the longest delay in the chain.' },
  ],
});

export const epcHandoff: ExampleModel = {
  id: 'epc-handoff',
  title: 'Engineering → procurement → construction handoff',
  description:
    'Piping spools flow from engineering through procurement (a third-order delay) to installation. Shows how ' +
    'upstream delays leave crews idle and push the installation S-curve right. Illustrative parameters.',
  model,
  sources: [cite('lyneis-ford-2007', true)],
};
