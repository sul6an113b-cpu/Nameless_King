/**
 * Fixes that Fail. Structure and behaviour after Senge (1990) and Kim (1992): a quick fix relieves the problem
 * symptom (balancing loop B1), but its unintended consequence feeds the symptom after a delay (reinforcing loop R2),
 * so the symptom returns to its earlier level or gets worse. Verified against Kim's "Systems Archetypes at a Glance"
 * (https://thesystemsthinker.com/wp-content/uploads/2016/01/PG01E-System-Archetypes-at-a-Glance.pdf, via search summary).
 * All parameter values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_fixes_that_fail_cld',
  name: 'Fixes that Fail (CLD)',
  variables: [
    { id: 'v_problem', name: 'Problem symptom' },
    { id: 'v_fix', name: 'Fix' },
    { id: 'v_consequence', name: 'Unintended consequences' },
  ],
  links: [
    ['v_problem', 'v_fix', '+', { note: 'The worse the symptom, the more the fix is applied.' }],
    ['v_fix', 'v_problem', '-', { note: 'The fix relieves the symptom quickly (B1).' }],
    ['v_fix', 'v_consequence', '+', { delay: true, note: 'Side effects of the fix build up slowly.' }],
    ['v_consequence', 'v_problem', '+', { note: 'Side effects feed the original symptom (R2).' }],
  ],
});

const sfd = buildModel({
  id: 'm_arch_fixes_that_fail_sfd',
  name: 'Fixes that Fail (SFD)',
  simSpec: { start: 0, stop: 60, dt: 0.25, method: 'euler', timeUnit: 'month' },
  units: ['issues'],
  variables: [
    { id: 'v_problem', name: 'Problem symptom', kind: 'stock', eq: '100', units: 'issues', doc: 'Open issues; starts in equilibrium (arrivals = normal resolution).' },
    { id: 'v_latent', name: 'Latent side effects', kind: 'stock', eq: '0', units: 'issues', doc: 'Issues created by quick fixes that have not surfaced yet.' },
    { id: 'v_arrival', name: 'Issue arrival', kind: 'flow', eq: 'Normal_issue_rate', units: 'issues/month', to: 'v_problem' },
    { id: 'v_resolution', name: 'Normal resolution', kind: 'flow', eq: 'Problem_symptom * Normal_resolution_fraction', units: 'issues/month', from: 'v_problem' },
    { id: 'v_fixes', name: 'Quick fixes', kind: 'flow', eq: 'Problem_symptom * Fix_intensity', units: 'issues/month', from: 'v_problem', doc: 'The fix: removes issues fast, in proportion to the symptom (B1).' },
    { id: 'v_created', name: 'Side effects created', kind: 'flow', eq: 'Quick_fixes * Side_effect_ratio', units: 'issues/month', to: 'v_latent' },
    { id: 'v_surfacing', name: 'Side effects surfacing', kind: 'flow', eq: 'Latent_side_effects / Side_effect_delay', units: 'issues/month', from: 'v_latent', to: 'v_problem', doc: 'After a delay the side effects become new issues (R2).' },
    { id: 'v_intensity', name: 'Fix intensity', kind: 'aux', eq: 'STEP(Quick_fix_fraction, Fix_start_time)', units: '1/month', doc: 'Zero until the fix is adopted.' },
    { id: 'v_normal_rate', name: 'Normal issue rate', kind: 'constant', eq: '10', units: 'issues/month', range: [8, 12] },
    { id: 'v_normal_frac', name: 'Normal resolution fraction', kind: 'constant', eq: '0.1', units: '1/month', range: [0.08, 0.12] },
    { id: 'v_fix_frac', name: 'Quick fix fraction', kind: 'constant', eq: '0.3', units: '1/month', range: [0.2, 0.4] },
    { id: 'v_fix_start', name: 'Fix start time', kind: 'constant', eq: '6', units: 'month', range: [3, 9] },
    { id: 'v_ratio', name: 'Side effect ratio', kind: 'constant', eq: '1.2', units: 'dmnl', range: [0.8, 1.5], doc: 'New issues eventually caused per issue quick-fixed. Above 1 the fix fails in the long run.' },
    { id: 'v_delay', name: 'Side effect delay', kind: 'constant', eq: '6', units: 'month', range: [3, 12] },
  ],
  links: [
    ['v_normal_rate', 'v_arrival', '+'],
    ['v_problem', 'v_resolution', '+'],
    ['v_normal_frac', 'v_resolution', '+'],
    ['v_problem', 'v_fixes', '+'],
    ['v_intensity', 'v_fixes', '+'],
    ['v_fix_frac', 'v_intensity', '+'],
    ['v_fix_start', 'v_intensity', '-'],
    ['v_fixes', 'v_created', '+'],
    ['v_ratio', 'v_created', '+'],
    ['v_latent', 'v_surfacing', '+'],
    ['v_delay', 'v_surfacing', '-'],
  ],
  frame: {
    problem: 'A recurring problem is relieved by a quick fix, yet a few months later it is back, often worse.',
    purpose: 'Show how a delayed side effect of the fix turns short-term relief into long-term deterioration.',
    kpis: [{ id: 'k_problem', name: 'Problem symptom', varId: 'v_problem', goal: 'minimize' }],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'Better before worse',
        varId: 'v_problem',
        source: 'sketch',
        label: 'feared',
        units: 'issues',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 100], [6, 100], [10, 70], [14, 65], [24, 90], [36, 140], [60, 200]],
      },
    ],
    excluded: [{ id: 'b_cost', name: 'Cost of the fix', reason: 'Not needed to show the pattern.' }],
  },
  scenarios: [
    {
      id: 's_no_fix',
      name: 'No quick fix',
      note: 'Baseline: the symptom stays at its equilibrium.',
      overrides: [{ varId: 'v_fix_frac', equation: '0' }],
    },
    {
      id: 's_benign_fix',
      name: 'Fix with fewer side effects',
      note: 'Redesign the fix so each quick fix creates fewer new issues.',
      overrides: [{ varId: 'v_ratio', equation: '0.5' }],
    },
  ],
});

export const fixesThatFail: Archetype = {
  id: 'fixes-that-fail',
  name: 'Fixes that Fail',
  summary:
    'A quick fix relieves a problem symptom, but its unintended consequences, arriving after a delay, bring the ' +
    'symptom back to its earlier level or make it worse, which invites more of the same fix.',
  structure:
    'B1 (fix): Problem symptom → (+) Fix → (−) Problem symptom. ' +
    'R2 (side effect): Fix → (+, delayed) Unintended consequences → (+) Problem symptom. ' +
    'The delay on the side-effect link hides the cause from the people applying the fix.',
  cld,
  sfd,
  signature: {
    kpi: 'v_problem',
    shape: 'better-before-worse',
    description:
      'After the fix starts, the problem symptom drops quickly, then climbs back past its starting level as the ' +
      'delayed side effects surface.',
  },
  interventions: [
    { text: 'Before adopting a fix, map its likely side effects and their delays; watch the symptom over a horizon longer than the delay.', leverage: 6 },
    { text: 'Choose or redesign a fix with fewer side effects (in the model: a lower side-effect ratio).', leverage: 12 },
    { text: 'Use the fix only to buy time while working on the underlying cause; stop it once the cause is addressed.', leverage: 5 },
  ],
  illustrations: {
    generic:
      'Cutting preventive maintenance to meet this quarter’s cost target: costs fall now, breakdowns and repair costs rise later.',
    epc:
      'Chasing late vendor data by issuing “preliminary” drawings for construction: the field starts sooner, but ' +
      'revisions arrive weeks later and generate more rework than the time saved.',
  },
  sources: [
    cite('senge-1990', true),
    cite('kim-1992', true),
    cite('senge-1990', true, 'ch. 4, “behavior grows better before it grows worse”'),
  ],
};
