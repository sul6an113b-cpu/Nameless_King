/**
 * Tragedy of the Commons. Structure after Senge (1990) and Kim (1992): each user's activity grows by its own
 * reinforcing loop, but all draw on one limited resource; when total activity exceeds what the resource can supply,
 * the gain per activity collapses for everyone (balancing loops through the shared resource). Meadows (2008, ch. 5)
 * lists it as a system trap; overshoot and collapse is one of the modes in Sterman (2000, ch. 4). Checked against
 * Kim's at-a-glance summary (https://library.alnap.org/system/files/content/resource/files/main/PG01E-System-Archetypes-at-a-Glance.pdf,
 * via search summary). All parameter values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_tragedy_of_the_commons_cld',
  name: 'Tragedy of the Commons (CLD)',
  variables: [
    { id: 'v_a_activity', name: 'Activity of A' },
    { id: 'v_b_activity', name: 'Activity of B' },
    { id: 'v_a_gain', name: 'Net gains for A' },
    { id: 'v_b_gain', name: 'Net gains for B' },
    { id: 'v_total', name: 'Total activity' },
    { id: 'v_gain_per', name: 'Gain per individual activity' },
    { id: 'v_limit', name: 'Resource limit' },
  ],
  links: [
    ['v_a_activity', 'v_a_gain', '+'],
    ['v_a_gain', 'v_a_activity', '+', { note: 'A reinvests its gains (R1).' }],
    ['v_b_activity', 'v_b_gain', '+'],
    ['v_b_gain', 'v_b_activity', '+', { note: 'B reinvests its gains (R2).' }],
    ['v_a_activity', 'v_total', '+'],
    ['v_b_activity', 'v_total', '+'],
    ['v_total', 'v_gain_per', '-', { delay: true, note: 'Overuse depletes the shared resource, so each unit of activity yields less (B3, B4).' }],
    ['v_limit', 'v_gain_per', '+'],
    ['v_gain_per', 'v_a_gain', '+'],
    ['v_gain_per', 'v_b_gain', '+'],
  ],
});

const sfd = buildModel({
  id: 'm_arch_tragedy_of_the_commons_sfd',
  name: 'Tragedy of the Commons (SFD)',
  simSpec: { start: 0, stop: 120, dt: 0.25, method: 'euler', timeUnit: 'month' },
  units: ['resource', 'activity'],
  variables: [
    { id: 'v_resource', name: 'Shared resource', kind: 'stock', eq: '1000', units: 'resource', nonNegative: true, doc: 'Starts at its capacity.' },
    { id: 'v_a', name: 'A activity', kind: 'stock', eq: '0.25', units: 'activity' },
    { id: 'v_b', name: 'B activity', kind: 'stock', eq: '0.25', units: 'activity' },
    { id: 'v_regen', name: 'Regeneration', kind: 'flow', eq: 'Shared_resource * Regeneration_fraction * (1 - Resource_availability)', units: 'resource/month', to: 'v_resource', doc: 'Logistic regrowth: fastest at half capacity.' },
    { id: 'v_harvest', name: 'Total harvest', kind: 'flow', eq: 'Total_activity * Yield_per_activity', units: 'resource/month', from: 'v_resource' },
    { id: 'v_a_growth', name: 'A expansion', kind: 'flow', eq: 'A_activity * Expansion_fraction * (Resource_availability - Breakeven_availability)', units: 'activity/month', to: 'v_a', doc: 'A expands while its activity pays (R1) and shrinks when it no longer does.' },
    { id: 'v_b_growth', name: 'B expansion', kind: 'flow', eq: 'B_activity * Expansion_fraction * (Resource_availability - Breakeven_availability)', units: 'activity/month', to: 'v_b', doc: 'Same rule for B (R2).' },
    { id: 'v_availability', name: 'Resource availability', kind: 'aux', eq: 'Shared_resource / Resource_capacity', units: 'dmnl' },
    { id: 'v_yield', name: 'Yield per activity', kind: 'aux', eq: 'Maximum_yield * Resource_availability', units: 'resource/(activity*month)', doc: 'Gain per individual activity: falls as the resource is depleted.' },
    { id: 'v_total', name: 'Total activity', kind: 'aux', eq: 'A_activity + B_activity', units: 'activity' },
    { id: 'v_capacity', name: 'Resource capacity', kind: 'constant', eq: '1000', units: 'resource', range: [800, 1200] },
    { id: 'v_regen_frac', name: 'Regeneration fraction', kind: 'constant', eq: '0.05', units: '1/month', range: [0.03, 0.08] },
    { id: 'v_max_yield', name: 'Maximum yield', kind: 'constant', eq: '10', units: 'resource/(activity*month)', range: [8, 12] },
    { id: 'v_expansion', name: 'Expansion fraction', kind: 'constant', eq: '0.1', units: '1/month', range: [0.05, 0.15] },
    { id: 'v_breakeven', name: 'Breakeven availability', kind: 'constant', eq: '0.3', units: 'dmnl', range: [0.2, 0.4], doc: 'Availability below which activity no longer pays.' },
  ],
  links: [
    ['v_resource', 'v_regen', '+'],
    ['v_regen_frac', 'v_regen', '+'],
    ['v_availability', 'v_regen', '-'],
    ['v_total', 'v_harvest', '+'],
    ['v_yield', 'v_harvest', '+'],
    ['v_a', 'v_a_growth', '+'],
    ['v_expansion', 'v_a_growth', '+'],
    ['v_availability', 'v_a_growth', '+'],
    ['v_breakeven', 'v_a_growth', '-'],
    ['v_b', 'v_b_growth', '+'],
    ['v_expansion', 'v_b_growth', '+'],
    ['v_availability', 'v_b_growth', '+'],
    ['v_breakeven', 'v_b_growth', '-'],
    ['v_resource', 'v_availability', '+'],
    ['v_capacity', 'v_availability', '-'],
    ['v_max_yield', 'v_yield', '+'],
    ['v_availability', 'v_yield', '+'],
    ['v_a', 'v_total', '+'],
    ['v_b', 'v_total', '+'],
  ],
  frame: {
    problem: 'Every user of a shared resource does well by expanding, until the resource is exhausted and everyone loses.',
    purpose: 'Show how individually rational growth overloads a common resource.',
    kpis: [
      { id: 'k_harvest', name: 'Total harvest', varId: 'v_harvest', goal: 'maximize' },
      { id: 'k_resource', name: 'Shared resource', varId: 'v_resource', goal: 'maximize' },
    ],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'Boom, then bust',
        varId: 'v_harvest',
        source: 'sketch',
        label: 'feared',
        units: 'resource/month',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 5], [20, 20], [35, 45], [45, 40], [60, 15], [120, 10]],
      },
    ],
    excluded: [{ id: 'b_new_users', name: 'New users entering', reason: 'Two users suffice to show the pattern.' }],
  },
  scenarios: [
    {
      id: 's_managed',
      name: 'Managed commons',
      note: 'Users agree to stop expanding while availability is below 60 % (raised breakeven threshold).',
      overrides: [{ varId: 'v_breakeven', equation: '0.6' }],
    },
  ],
});

export const tragedyOfTheCommons: Archetype = {
  id: 'tragedy-of-the-commons',
  name: 'Tragedy of the Commons',
  summary:
    'Each party expands its use of a shared, limited resource because it pays individually; the total load ' +
    'eventually overwhelms the resource, and the gain per activity collapses for all of them.',
  structure:
    'R1, R2: each party’s activity → (+) its net gains → (+) its activity. ' +
    'B3, B4: each activity → (+) Total activity → (−, delayed) Gain per individual activity → (+) that party’s gains.',
  cld,
  sfd,
  signature: {
    kpi: 'v_harvest',
    shape: 'overshoot-and-collapse',
    description:
      'Total harvest grows while the resource seems plentiful, peaks as the resource is drawn down, and collapses ' +
      'to a fraction of its peak once the resource is depleted.',
  },
  interventions: [
    { text: 'Agree a governance rule for the shared resource (quotas, booking, allocation) that all parties follow.', leverage: 5 },
    { text: 'Give every user timely feedback on the state of the shared resource and their share of its use.', leverage: 6 },
    { text: 'Change the goal from maximising individual gain to sustaining the commons.', leverage: 3 },
  ],
  illustrations: {
    generic: 'Fishing fleets expand while catches are good until the fish stock collapses.',
    epc:
      'Several subcontractors share the site’s heavy-lift cranes and lay-down area; each books more slots to protect ' +
      'its own schedule until the shared plan is gridlocked and every crew waits.',
  },
  sources: [
    cite('senge-1990', true),
    cite('kim-1992', true),
    cite('meadows-2008', true, 'ch. 5, “System Traps … and Opportunities”'),
    cite('sterman-2000', true, 'ch. 4, “Structure and Behavior of Dynamic Systems”'),
  ],
};
