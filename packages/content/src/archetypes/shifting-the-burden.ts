/**
 * Shifting the Burden. Structure after Senge (1990) and Kim (1992): a problem symptom can be relieved by a
 * symptomatic solution (fast, B1) or a fundamental solution (slow, B2); relying on the symptomatic solution weakens
 * the fundamental one (side effect, R3). Meadows (2008, ch. 5) calls the trap "shifting the burden to the
 * intervenor" (addiction). Checked against https://thesystemsthinker.com/introducing-the-systems-archetypes-shifting-the-burden/
 * and Meadows trap summaries (search summaries). All parameter values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_shifting_the_burden_cld',
  name: 'Shifting the Burden (CLD)',
  variables: [
    { id: 'v_problem', name: 'Problem symptom' },
    { id: 'v_symptomatic', name: 'Symptomatic solution' },
    { id: 'v_fundamental', name: 'Fundamental solution' },
    { id: 'v_side_effect', name: 'Side effect' },
  ],
  links: [
    ['v_problem', 'v_symptomatic', '+', { note: 'The symptom prompts the quick relief.' }],
    ['v_symptomatic', 'v_problem', '-', { note: 'Quick relief of the symptom (B1).' }],
    ['v_problem', 'v_fundamental', '+', { note: 'The symptom could also prompt the fundamental solution.' }],
    ['v_fundamental', 'v_problem', '-', { delay: true, note: 'The fundamental solution works, but slowly (B2).' }],
    ['v_symptomatic', 'v_side_effect', '+', { note: 'Relying on the quick relief has a side effect…' }],
    ['v_side_effect', 'v_fundamental', '-', { note: '…that erodes the ability or will to apply the fundamental solution (R3).' }],
  ],
});

const sfd = buildModel({
  id: 'm_arch_shifting_the_burden_sfd',
  name: 'Shifting the Burden (SFD)',
  simSpec: { start: 0, stop: 72, dt: 0.125, method: 'euler', timeUnit: 'month' },
  units: ['issues'],
  variables: [
    { id: 'v_problem', name: 'Problem symptom', kind: 'stock', eq: '40', units: 'issues', doc: 'Starts in equilibrium with full fundamental capability.' },
    { id: 'v_capability', name: 'Fundamental capability', kind: 'stock', eq: '1', units: 'dmnl', doc: 'Ability to solve problems at the root (1 = fully maintained). Kept only through use.' },
    { id: 'v_arising', name: 'Problems arising', kind: 'flow', eq: 'Problem_pressure', units: 'issues/month', to: 'v_problem' },
    { id: 'v_relief', name: 'Symptomatic relief', kind: 'flow', eq: 'Problem_symptom * Symptomatic_intensity', units: 'issues/month', from: 'v_problem', doc: 'The quick, symptomatic solution (B1).' },
    { id: 'v_fundamental', name: 'Fundamental resolution', kind: 'flow', eq: 'Problem_symptom * Fundamental_resolution_fraction * Fundamental_capability', units: 'issues/month', from: 'v_problem', doc: 'The fundamental solution (B2); only as good as the capability behind it.' },
    { id: 'v_erosion', name: 'Capability erosion', kind: 'flow', eq: '(Fundamental_capability - Fundamental_share) / Capability_adjustment_time', units: '1/month', from: 'v_capability', doc: 'Use it or lose it: capability drifts toward the share of problems still solved at the root (R3).' },
    { id: 'v_intensity', name: 'Symptomatic intensity', kind: 'aux', eq: 'STEP(Symptomatic_fraction, Relief_start_time)', units: '1/month', doc: 'Zero until the quick relief is adopted.' },
    { id: 'v_share', name: 'Fundamental share', kind: 'aux', eq: 'Fundamental_resolution / (Fundamental_resolution + Symptomatic_relief)', units: 'dmnl', doc: 'Share of problems solved at the root.' },
    { id: 'v_pressure', name: 'Problem pressure', kind: 'constant', eq: '10', units: 'issues/month', range: [8, 12] },
    { id: 'v_fund_frac', name: 'Fundamental resolution fraction', kind: 'constant', eq: '0.25', units: '1/month', range: [0.15, 0.35] },
    { id: 'v_symp_frac', name: 'Symptomatic fraction', kind: 'constant', eq: '0.5', units: '1/month', range: [0.3, 0.7] },
    { id: 'v_start', name: 'Relief start time', kind: 'constant', eq: '6', units: 'month', range: [3, 9] },
    { id: 'v_adjust', name: 'Capability adjustment time', kind: 'constant', eq: '12', units: 'month', range: [6, 24] },
  ],
  links: [
    ['v_pressure', 'v_arising', '+'],
    ['v_problem', 'v_relief', '+'],
    ['v_intensity', 'v_relief', '+'],
    ['v_symp_frac', 'v_intensity', '+'],
    ['v_start', 'v_intensity', '-'],
    ['v_problem', 'v_fundamental', '+'],
    ['v_fund_frac', 'v_fundamental', '+'],
    ['v_capability', 'v_fundamental', '+'],
    ['v_fundamental', 'v_share', '+'],
    ['v_relief', 'v_share', '-'],
    ['v_capability', 'v_erosion', '+'],
    ['v_share', 'v_erosion', '-'],
    ['v_adjust', 'v_erosion', '-'],
  ],
  frame: {
    problem: 'The quick remedy keeps the symptom under control, yet the organisation seems less and less able to solve the problem itself.',
    purpose: 'Show how reliance on a symptomatic solution erodes the capability for the fundamental one.',
    kpis: [
      { id: 'k_capability', name: 'Fundamental capability', varId: 'v_capability', goal: 'maximize' },
      { id: 'k_problem', name: 'Problem symptom', varId: 'v_problem', goal: 'minimize' },
    ],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'Capability erodes',
        varId: 'v_capability',
        source: 'sketch',
        label: 'feared',
        units: 'dmnl',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 1], [6, 1], [12, 0.7], [24, 0.4], [48, 0.15], [72, 0.05]],
      },
    ],
    excluded: [{ id: 'b_cost', name: 'Cost of the symptomatic solution', reason: 'Not needed to show the pattern.' }],
  },
  scenarios: [
    {
      id: 's_invest_fundamental',
      name: 'Keep using the fundamental solution',
      note: 'Weaker symptomatic relief, so the fundamental solution keeps being exercised.',
      overrides: [{ varId: 'v_symp_frac', equation: '0.1' }],
    },
  ],
});

export const shiftingTheBurden: Archetype = {
  id: 'shifting-the-burden',
  name: 'Shifting the Burden',
  summary:
    'A symptomatic solution relieves the problem quickly, which lowers the pressure to apply the slower fundamental ' +
    'solution; its side effects erode the capability for the fundamental solution, so reliance on the quick fix grows.',
  structure:
    'B1 (symptomatic): Problem symptom → (+) Symptomatic solution → (−) Problem symptom. ' +
    'B2 (fundamental, delayed): Problem symptom → (+) Fundamental solution → (−, delayed) Problem symptom. ' +
    'R3 (side effect): Symptomatic solution → (+) Side effect → (−) Fundamental solution.',
  cld,
  sfd,
  signature: {
    kpi: 'v_capability',
    shape: 'goal-seeking',
    description:
      'Once the symptomatic solution is adopted, fundamental capability decays toward a much lower level (here ' +
      'toward zero) while the symptom stays controlled only as long as the quick fix is applied.',
  },
  interventions: [
    { text: 'Use the symptomatic solution only alongside the fundamental one, with a date to wean off it.', leverage: 5 },
    { text: 'Make the erosion of fundamental capability visible (track skills, root-cause closure rate), not only the symptom.', leverage: 6 },
    { text: 'Strengthen the fundamental solution so it responds faster (shorter delay).', leverage: 9 },
    { text: 'Build the system’s own capacity to solve the problem (the intervenor helps the system help itself).', leverage: 4 },
  ],
  illustrations: {
    generic:
      'Relying on overtime and heroics to meet deadlines instead of fixing planning; planning skills atrophy and the ' +
      'organisation depends on heroics ever more.',
    epc:
      'Outsourcing every stress-analysis peak to an external consultant: the in-house piping stress team shrinks and ' +
      'loses experience, so the next peak must be outsourced too.',
  },
  sources: [cite('senge-1990', true), cite('kim-1992', true), cite('meadows-2008', true, 'ch. 5, “System Traps … and Opportunities”')],
};
