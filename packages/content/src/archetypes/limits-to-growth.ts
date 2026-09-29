/**
 * Limits to Growth (Limits to Success). Structure after Senge (1990) and Kim (1992): a reinforcing growth process
 * (R1) runs into a balancing process (B2) whose slowing action strengthens as a limit is approached. The resulting
 * S-shaped growth is one of the fundamental modes in Sterman (2000, ch. 4). Checked against Kim's at-a-glance summary
 * (https://library.alnap.org/system/files/content/resource/files/main/PG01E-System-Archetypes-at-a-Glance.pdf, via
 * search summary). All parameter values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_limits_to_growth_cld',
  name: 'Limits to Growth (CLD)',
  variables: [
    { id: 'v_effort', name: 'Growing action' },
    { id: 'v_performance', name: 'Performance' },
    { id: 'v_slowing', name: 'Slowing action' },
    { id: 'v_limit', name: 'Limiting condition' },
  ],
  links: [
    ['v_effort', 'v_performance', '+', { note: 'Effort produces results.' }],
    ['v_performance', 'v_effort', '+', { note: 'Success encourages more effort (R1).' }],
    ['v_performance', 'v_slowing', '+', { note: 'Growth brings the system closer to its limit.' }],
    ['v_slowing', 'v_performance', '-', { delay: true, note: 'The slowing action holds performance back (B2).' }],
    ['v_limit', 'v_slowing', '-', { note: 'The tighter the limit, the stronger the slowing action.' }],
  ],
});

const sfd = buildModel({
  id: 'm_arch_limits_to_growth_sfd',
  name: 'Limits to Growth (SFD)',
  simSpec: { start: 0, stop: 60, dt: 0.25, method: 'euler', timeUnit: 'month' },
  units: ['customers'],
  variables: [
    { id: 'v_customers', name: 'Customers', kind: 'stock', eq: '10', units: 'customers' },
    { id: 'v_new', name: 'New customers', kind: 'flow', eq: 'Customers * Growth_fraction * Room_to_grow', units: 'customers/month', to: 'v_customers', doc: 'Word of mouth (R1), damped as the market fills up (B2).' },
    { id: 'v_room', name: 'Room to grow', kind: 'aux', eq: '1 - Customers / Market_size', units: 'dmnl', doc: 'Share of the market not yet served; the slowing action grows as this shrinks.' },
    { id: 'v_growth', name: 'Growth fraction', kind: 'constant', eq: '0.15', units: '1/month', range: [0.1, 0.2] },
    { id: 'v_market', name: 'Market size', kind: 'constant', eq: '1000', units: 'customers', range: [800, 1200], doc: 'The limiting condition.' },
  ],
  links: [
    ['v_customers', 'v_new', '+'],
    ['v_growth', 'v_new', '+'],
    ['v_room', 'v_new', '+'],
    ['v_customers', 'v_room', '-'],
    ['v_market', 'v_room', '+'],
  ],
  frame: {
    problem: 'Growth that came easily is slowing down although we push as hard as ever.',
    purpose: 'Show how a limiting condition takes over from the growth engine.',
    kpis: [{ id: 'k_customers', name: 'Customers', varId: 'v_customers', goal: 'maximize' }],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'S-shaped growth',
        varId: 'v_customers',
        source: 'sketch',
        label: 'expected',
        units: 'customers',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 10], [15, 90], [25, 350], [35, 750], [45, 950], [60, 990]],
      },
    ],
    excluded: [{ id: 'b_competition', name: 'Competitors', reason: 'Folded into the market size.' }],
  },
  scenarios: [
    {
      id: 's_bigger_market',
      name: 'Raise the limit',
      note: 'Open a new market segment (relieves the limit instead of pushing harder on growth).',
      overrides: [{ varId: 'v_market', equation: '2000' }],
    },
  ],
});

export const limitsToGrowth: Archetype = {
  id: 'limits-to-growth',
  name: 'Limits to Growth',
  summary:
    'A reinforcing process produces growth, but growth itself strengthens a balancing process tied to a limiting ' +
    'condition; growth slows and stalls, and pushing harder on the growth engine does not help.',
  structure:
    'R1 (engine): Growing action → (+) Performance → (+) Growing action. ' +
    'B2 (limit): Performance → (+) Slowing action → (−) Performance, with the slowing action set by a limiting condition.',
  cld,
  sfd,
  signature: {
    kpi: 'v_customers',
    shape: 's-shaped',
    description: 'Accelerating growth while R1 dominates, then deceleration and a plateau as B2 takes over near the limit.',
  },
  interventions: [
    { text: 'Do not push harder on the growth engine; find and relieve the limiting condition instead.', leverage: 8 },
    { text: 'Anticipate the limit: monitor the slowing action before growth stalls.', leverage: 6 },
    { text: 'Raise the limit (new capacity, a new market segment); in the model, a larger market size.', leverage: 12 },
  ],
  illustrations: {
    generic: 'A product spreads by word of mouth until most potential customers already have it.',
    epc:
      'A contractor wins ever more work on its reputation until the pool of experienced project engineers it can ' +
      'hire runs dry; further bids stretch the same people and delivery quality starts to limit new awards.',
  },
  sources: [cite('senge-1990', true), cite('kim-1992', true), cite('sterman-2000', true, 'ch. 4, “Structure and Behavior of Dynamic Systems”')],
};
