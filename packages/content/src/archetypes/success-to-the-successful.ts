/**
 * Success to the Successful. Structure after Senge (1990) and Kim (1992): two activities compete for a limited
 * resource; the more successful one gets a larger share, which makes it more successful still (two reinforcing
 * loops coupled through the allocation). Meadows (2008, ch. 5) lists it as a system trap. Checked against Kim's
 * at-a-glance summary (https://library.alnap.org/system/files/content/resource/files/main/PG01E-System-Archetypes-at-a-Glance.pdf,
 * via search summary). All parameter values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_success_to_the_successful_cld',
  name: 'Success to the Successful (CLD)',
  variables: [
    { id: 'v_a_success', name: 'Success of A' },
    { id: 'v_b_success', name: 'Success of B' },
    { id: 'v_allocation', name: 'Allocation to A instead of B' },
    { id: 'v_a_resources', name: 'Resources to A' },
    { id: 'v_b_resources', name: 'Resources to B' },
  ],
  links: [
    ['v_a_success', 'v_allocation', '+', { note: 'Success earns a bigger share.' }],
    ['v_b_success', 'v_allocation', '-'],
    ['v_allocation', 'v_a_resources', '+'],
    ['v_a_resources', 'v_a_success', '+', { delay: true, note: 'Resources turn into success over time (R1).' }],
    ['v_allocation', 'v_b_resources', '-'],
    ['v_b_resources', 'v_b_success', '+', { delay: true, note: 'Starved of resources, B falls behind (R2).' }],
  ],
});

const sfd = buildModel({
  id: 'm_arch_success_to_the_successful_sfd',
  name: 'Success to the Successful (SFD)',
  simSpec: { start: 0, stop: 60, dt: 0.125, method: 'euler', timeUnit: 'month' },
  units: ['capability'],
  variables: [
    { id: 'v_a', name: 'A capability', kind: 'stock', eq: '10.2', units: 'capability', doc: 'A starts marginally ahead.' },
    { id: 'v_b', name: 'B capability', kind: 'stock', eq: '9.8', units: 'capability' },
    { id: 'v_a_invest', name: 'Investment in A', kind: 'flow', eq: 'Total_resources * Share_to_A', units: 'capability/month', to: 'v_a' },
    { id: 'v_b_invest', name: 'Investment in B', kind: 'flow', eq: 'Total_resources * (1 - Share_to_A)', units: 'capability/month', to: 'v_b' },
    { id: 'v_a_decay', name: 'A obsolescence', kind: 'flow', eq: 'A_capability / Capability_lifetime', units: 'capability/month', from: 'v_a' },
    { id: 'v_b_decay', name: 'B obsolescence', kind: 'flow', eq: 'B_capability / Capability_lifetime', units: 'capability/month', from: 'v_b' },
    { id: 'v_a_rel', name: 'A share of capability', kind: 'aux', eq: 'A_capability / (A_capability + B_capability)', units: 'dmnl', doc: 'Relative success of A (0.5 = balanced).' },
    {
      id: 'v_share',
      name: 'Share to A',
      kind: 'aux',
      eq: 'A_share_of_capability',
      units: 'dmnl',
      doc: 'Allocation policy: the leader gets more than its proportional share (graphical function of relative success).',
      graph: { xs: [0, 0.25, 0.5, 0.75, 1], ys: [0, 0, 0.5, 1, 1] },
    },
    { id: 'v_total', name: 'Total resources', kind: 'constant', eq: '2', units: 'capability/month', range: [1.5, 2.5] },
    { id: 'v_life', name: 'Capability lifetime', kind: 'constant', eq: '10', units: 'month', range: [6, 15] },
  ],
  links: [
    ['v_total', 'v_a_invest', '+'],
    ['v_share', 'v_a_invest', '+'],
    ['v_total', 'v_b_invest', '+'],
    ['v_share', 'v_b_invest', '-'],
    ['v_a', 'v_a_decay', '+'],
    ['v_life', 'v_a_decay', '-'],
    ['v_b', 'v_b_decay', '+'],
    ['v_life', 'v_b_decay', '-'],
    ['v_a', 'v_a_rel', '+'],
    ['v_b', 'v_a_rel', '-'],
    ['v_a_rel', 'v_share', '+'],
  ],
  frame: {
    problem: 'One team keeps getting the resources because it performs best, while the other falls ever further behind.',
    purpose: 'Show how an allocation rule that rewards current success amplifies a small initial difference.',
    kpis: [{ id: 'k_a_rel', name: 'A share of capability', varId: 'v_a_rel', goal: 'target', target: 0.5 }],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'Small lead becomes dominance',
        varId: 'v_a_rel',
        source: 'sketch',
        label: 'feared',
        units: 'dmnl',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 0.51], [15, 0.54], [25, 0.62], [35, 0.8], [45, 0.93], [60, 0.98]],
      },
    ],
    excluded: [{ id: 'b_outside', name: 'Resources from outside the two teams', reason: 'The total is fixed.' }],
  },
  scenarios: [
    {
      id: 's_proportional',
      name: 'Proportional allocation',
      note: 'Allocate by need or in fixed proportion instead of by past success (share no longer amplifies the lead).',
      overrides: [{ varId: 'v_share', equation: '0.5' }],
    },
  ],
});

export const successToTheSuccessful: Archetype = {
  id: 'success-to-the-successful',
  name: 'Success to the Successful',
  summary:
    'Two activities compete for a limited pool of resources; the one that does better gets more, which makes it do ' +
    'better still, while the other is starved — regardless of which one would be better in the long run.',
  structure:
    'R1: Success of A → (+) Allocation to A → (+) Resources to A → (+, delayed) Success of A. ' +
    'R2: Success of B → (−) Allocation to A → (−) Resources to B → (+, delayed) Success of B. ' +
    'The shared allocation couples the two reinforcing loops.',
  cld,
  sfd,
  signature: {
    kpi: 'v_a_rel',
    shape: 'divergence',
    description: 'A marginal initial lead is amplified: the leader’s share departs slowly from balance, then rapidly toward total dominance.',
  },
  interventions: [
    { text: 'Decouple the allocation from past success (allocate by need, strategy or fixed proportion).', leverage: 5 },
    { text: 'Review the goal that the allocation serves; balanced capability may matter more than short-term returns.', leverage: 3 },
    { text: 'Make the long-term cost of starving the other activity visible to whoever allocates.', leverage: 6 },
  ],
  illustrations: {
    generic: 'The best-selling product line gets the marketing budget, so the newer line never gets the chance to prove itself.',
    epc:
      'The strongest project in the portfolio keeps receiving the most experienced piping and stress engineers; the ' +
      'weaker project slips, is labelled “troubled”, and loses even more senior staff.',
  },
  sources: [cite('senge-1990', true), cite('kim-1992', true), cite('meadows-2008', true, 'ch. 5, “System Traps … and Opportunities”')],
};
