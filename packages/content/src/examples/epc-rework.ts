/**
 * EPC project rework cycle, after the rework-cycle structure reviewed by Lyneis & Ford (2007): work is done either
 * correctly or with errors that stay undiscovered for a while; discovered rework returns to the backlog. Schedule
 * pressure raises productivity (overtime, haste) but lowers quality, so part of the extra output returns later as
 * rework. Because undiscovered rework looks like finished work, reported progress runs ahead of true progress.
 * Checked (search summaries) that Lyneis & Ford (2007) name the rework cycle, feedback effects and knock-on effects as
 * the drivers of project dynamics: https://ocw.mit.edu/courses/esd-36-system-project-management-fall-2012/800ceb204ef03177b61e1288533446c1_MITESD_36F12_Lec06.pdf
 * All parameter values and graphical functions are illustrative, not calibrated to any project.
 */
import { buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { ExampleModel } from '../types.ts';

const model = buildModel({
  id: 'm_example_epc_rework',
  name: 'EPC engineering rework cycle',
  simSpec: { start: 0, stop: 120, dt: 0.25, method: 'euler', timeUnit: 'week' },
  units: ['tasks', 'people'],
  variables: [
    // stocks
    { id: 'v_todo', name: 'Work to do', kind: 'stock', eq: 'Project_scope', units: 'tasks', nonNegative: true, doc: 'Tasks not yet attempted, plus discovered rework.' },
    { id: 'v_done', name: 'Work done', kind: 'stock', eq: '0', units: 'tasks', doc: 'Tasks done correctly.' },
    { id: 'v_undiscovered', name: 'Undiscovered rework', kind: 'stock', eq: '0', units: 'tasks', doc: 'Tasks believed done that contain errors nobody has found yet.' },
    // flows
    { id: 'v_correct', name: 'Correct work', kind: 'flow', eq: 'Work_rate * Quality', units: 'tasks/week', from: 'v_todo', to: 'v_done' },
    { id: 'v_flawed', name: 'Flawed work', kind: 'flow', eq: 'Work_rate * (1 - Quality)', units: 'tasks/week', from: 'v_todo', to: 'v_undiscovered' },
    { id: 'v_discovery', name: 'Rework discovery', kind: 'flow', eq: 'Undiscovered_rework / Time_to_discover_rework', units: 'tasks/week', from: 'v_undiscovered', to: 'v_todo' },
    // auxiliaries
    { id: 'v_rate', name: 'Work rate', kind: 'aux', eq: 'MIN(Staff * Productivity, Work_to_do / Minimum_task_duration)', units: 'tasks/week', doc: 'Capacity-limited, and slows down as the backlog empties.' },
    { id: 'v_time_left', name: 'Time remaining', kind: 'aux', eq: 'MAX(Deadline - TIME, Minimum_time_remaining)', units: 'week' },
    {
      id: 'v_pressure',
      name: 'Schedule pressure',
      kind: 'aux',
      eq: 'Work_to_do / (Time_remaining * Staff * Normal_productivity)',
      units: 'dmnl',
      doc: 'Work rate needed to finish by the deadline relative to normal capacity. Only visible work counts: undiscovered rework is invisible.',
    },
    {
      id: 'v_effect_productivity',
      name: 'Effect of pressure on productivity',
      kind: 'aux',
      eq: 'Schedule_pressure',
      units: 'dmnl',
      doc: 'Overtime and haste raise output under pressure, up to a limit (illustrative).',
      graph: { xs: [0, 1, 1.5, 2, 3], ys: [1, 1, 1.1, 1.2, 1.25] },
    },
    {
      id: 'v_effect_quality',
      name: 'Effect of pressure on quality',
      kind: 'aux',
      eq: 'Schedule_pressure',
      units: 'dmnl',
      doc: 'Haste makes waste: more errors under pressure (illustrative).',
      graph: { xs: [0, 1, 1.5, 2, 3], ys: [1, 1, 0.9, 0.8, 0.7] },
    },
    { id: 'v_productivity', name: 'Productivity', kind: 'aux', eq: 'Normal_productivity * Effect_of_pressure_on_productivity', units: 'tasks/(people*week)' },
    { id: 'v_quality', name: 'Quality', kind: 'aux', eq: 'Normal_quality * Effect_of_pressure_on_quality', units: 'dmnl', doc: 'Fraction of work done without errors.' },
    { id: 'v_true_progress', name: 'True progress', kind: 'aux', eq: 'Work_done / Project_scope', units: 'dmnl' },
    { id: 'v_perceived_progress', name: 'Perceived progress', kind: 'aux', eq: '(Work_done + Undiscovered_rework) / Project_scope', units: 'dmnl', doc: 'What progress reports show: flawed work counts as done until discovered.' },
    // constants (illustrative values, ranges for sensitivity and Monte Carlo)
    { id: 'v_scope', name: 'Project scope', kind: 'constant', eq: '1000', units: 'tasks', range: [900, 1100], doc: 'E.g. engineering deliverables of an EPC package.' },
    { id: 'v_staff', name: 'Staff', kind: 'constant', eq: '10', units: 'people', range: [8, 12] },
    { id: 'v_normal_productivity', name: 'Normal productivity', kind: 'constant', eq: '2', units: 'tasks/(people*week)', range: [1.6, 2.4] },
    { id: 'v_normal_quality', name: 'Normal quality', kind: 'constant', eq: '0.8', units: 'dmnl', range: [0.7, 0.9] },
    { id: 'v_discover_time', name: 'Time to discover rework', kind: 'constant', eq: '8', units: 'week', range: [4, 16] },
    { id: 'v_deadline', name: 'Deadline', kind: 'constant', eq: '52', units: 'week', range: [44, 60] },
    { id: 'v_min_time', name: 'Minimum time remaining', kind: 'constant', eq: '4', units: 'week', range: [2, 8], doc: 'Planning horizon used once the deadline has passed.' },
    { id: 'v_min_duration', name: 'Minimum task duration', kind: 'constant', eq: '1', units: 'week', range: [0.5, 2] },
  ],
  links: [
    ['v_scope', 'v_todo', '+', { note: 'Initial backlog.' }],
    ['v_rate', 'v_correct', '+'],
    ['v_quality', 'v_correct', '+'],
    ['v_rate', 'v_flawed', '+'],
    ['v_quality', 'v_flawed', '-', { note: 'Lower quality → more flawed work.' }],
    ['v_undiscovered', 'v_discovery', '+'],
    ['v_discover_time', 'v_discovery', '-'],
    ['v_staff', 'v_rate', '+'],
    ['v_productivity', 'v_rate', '+'],
    ['v_todo', 'v_rate', '+'],
    ['v_min_duration', 'v_rate', '-'],
    ['v_deadline', 'v_time_left', '+'],
    ['v_min_time', 'v_time_left', '+'],
    ['v_todo', 'v_pressure', '+', { note: 'Visible remaining work drives pressure.' }],
    ['v_time_left', 'v_pressure', '-'],
    ['v_staff', 'v_pressure', '-'],
    ['v_normal_productivity', 'v_pressure', '-'],
    ['v_pressure', 'v_effect_productivity', '+', { note: 'Overtime and haste.' }],
    ['v_pressure', 'v_effect_quality', '-', { note: 'Haste makes waste.' }],
    ['v_normal_productivity', 'v_productivity', '+'],
    ['v_effect_productivity', 'v_productivity', '+'],
    ['v_normal_quality', 'v_quality', '+'],
    ['v_effect_quality', 'v_quality', '+'],
    ['v_done', 'v_true_progress', '+'],
    ['v_scope', 'v_true_progress', '-'],
    ['v_done', 'v_perceived_progress', '+'],
    ['v_undiscovered', 'v_perceived_progress', '+'],
    ['v_scope', 'v_perceived_progress', '-'],
  ],
  frame: {
    problem:
      'Engineering packages report ~90 % complete for months while the true end date keeps slipping; the planned ' +
      '52 weeks become well over a year.',
    purpose:
      'Explain the overrun through the rework cycle and schedule pressure, and compare policies: more staff, earlier ' +
      'discovery of rework, honest progress reporting.',
    kpis: [
      { id: 'k_true_progress', name: 'True progress', varId: 'v_true_progress', goal: 'target', target: 1 },
      { id: 'k_undiscovered', name: 'Undiscovered rework', varId: 'v_undiscovered', goal: 'minimize' },
      { id: 'k_pressure', name: 'Schedule pressure', varId: 'v_pressure', goal: 'target', target: 1 },
    ],
    referenceModes: [
      {
        id: 'r_ninety_percent',
        name: 'Reported progress stalls near 90 %',
        varId: 'v_perceived_progress',
        source: 'sketch',
        label: 'feared',
        units: 'dmnl',
        note: 'Illustrative sketch of the pattern often called the “90 % syndrome”; not project data.',
        points: [[0, 0], [20, 0.4], [40, 0.75], [52, 0.88], [65, 0.93], [80, 0.97], [95, 1]],
      },
    ],
    excluded: [
      { id: 'b_hiring', name: 'Hiring, training and experience dilution', reason: 'Staff is a policy lever here; Brooks-type effects are left out for simplicity.' },
      { id: 'b_scope_change', name: 'Client scope changes', reason: 'Scope is fixed to isolate the rework dynamics.' },
      { id: 'b_fatigue', name: 'Fatigue from sustained overtime', reason: 'Its effect is folded into the quality effect of schedule pressure.' },
      { id: 'b_phases', name: 'Knock-on effects on procurement and construction', reason: 'See the handoff example.' },
    ],
  },
  assertions: [
    { id: 'a_todo', expr: 'Work_to_do >= 0', note: 'Backlog cannot be negative.' },
    { id: 'a_undiscovered', expr: 'Undiscovered_rework >= 0' },
  ],
  scenarios: [
    { id: 's_add_staff', name: 'Add two engineers', overrides: [{ varId: 'v_staff', equation: '12' }] },
    { id: 's_early_reviews', name: 'Earlier design reviews', note: 'Rework found in about half the time.', overrides: [{ varId: 'v_discover_time', equation: '4' }] },
    { id: 's_realistic_deadline', name: 'Plan for rework', note: 'Deadline set with expected rework included.', overrides: [{ varId: 'v_deadline', equation: '64' }] },
  ],
  interventions: [
    { id: 'i_add_staff', name: 'Add two engineers', leverage: 12, scenarioId: 's_add_staff', description: 'More capacity: a parameter change.' },
    { id: 'i_early_reviews', name: 'Hold design reviews earlier', leverage: 9, scenarioId: 's_early_reviews', description: 'Shortens the delay before errors are found.' },
    {
      id: 'i_honest_progress',
      name: 'Report progress on verified work only',
      leverage: 6,
      description: 'Adds the missing information flow: undiscovered rework becomes visible in progress reports and schedule pressure. Needs a structural change to test.',
    },
  ],
});

export const epcRework: ExampleModel = {
  id: 'epc-rework',
  title: 'EPC project rework cycle',
  description:
    'Engineering tasks are done correctly or flawed; flaws surface only after a delay and return as rework, while ' +
    'schedule pressure trades quality for speed. Shows why reported progress runs ahead of true progress and why the ' +
    'last 10 % takes so long. Illustrative parameters.',
  model,
  sources: [cite('lyneis-ford-2007', true), cite('sterman-2000', false)],
};
