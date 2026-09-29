/**
 * Growth and Underinvestment. Structure after Senge (1990) and Kim (1992): growth approaches a limit that capacity
 * investment could remove; investment responds to performance falling below a standard, but the standard itself
 * erodes, so investment comes too little and too late and demand stalls — validating the decision not to invest.
 * Checked against Kim's at-a-glance summary
 * (https://library.alnap.org/system/files/content/resource/files/main/PG01E-System-Archetypes-at-a-Glance.pdf, via
 * search summary). All parameter values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_growth_and_underinvestment_cld',
  name: 'Growth and Underinvestment (CLD)',
  variables: [
    { id: 'v_growing', name: 'Growing action' },
    { id: 'v_demand', name: 'Demand' },
    { id: 'v_performance', name: 'Performance' },
    { id: 'v_standard', name: 'Performance standard' },
    { id: 'v_need', name: 'Perceived need to invest' },
    { id: 'v_investment', name: 'Investment in capacity' },
    { id: 'v_capacity', name: 'Capacity' },
  ],
  links: [
    ['v_growing', 'v_demand', '+'],
    ['v_demand', 'v_growing', '+', { note: 'Growth feeds on itself (R1).' }],
    ['v_demand', 'v_performance', '-', { note: 'More demand on the same capacity lowers performance…' }],
    ['v_performance', 'v_demand', '+', { note: '…and poor performance holds demand back (B2).' }],
    ['v_performance', 'v_need', '-'],
    ['v_standard', 'v_need', '+'],
    ['v_need', 'v_investment', '+'],
    ['v_investment', 'v_capacity', '+', { delay: true, note: 'Capacity takes long to build (B3).' }],
    ['v_capacity', 'v_performance', '+'],
    ['v_performance', 'v_standard', '+', { delay: true, note: 'The standard drifts toward actual performance (R4, eroding the standard).' }],
  ],
});

const sfd = buildModel({
  id: 'm_arch_growth_and_underinvestment_sfd',
  name: 'Growth and Underinvestment (SFD)',
  simSpec: { start: 0, stop: 120, dt: 0.25, method: 'euler', timeUnit: 'month' },
  units: ['customers'],
  variables: [
    { id: 'v_demand', name: 'Demand', kind: 'stock', eq: '100', units: 'customers' },
    { id: 'v_capacity', name: 'Capacity', kind: 'stock', eq: '120', units: 'customers', doc: 'Customers the organisation can serve well.' },
    { id: 'v_standard', name: 'Service standard', kind: 'stock', eq: '1.2', units: 'dmnl', doc: 'Capacity headroom management aims for (1.2 = 20 % above demand).' },
    { id: 'v_growth', name: 'Demand growth', kind: 'flow', eq: 'Demand * Normal_growth_fraction * Effect_of_service_on_growth', units: 'customers/month', to: 'v_demand', doc: 'Growth engine (R1), throttled by service (B2).' },
    { id: 'v_additions', name: 'Capacity additions', kind: 'flow', eq: '(Desired_capacity - Capacity) / Capacity_acquisition_time', units: 'customers/month', to: 'v_capacity', nonNegative: true, doc: 'Investment closes the capacity gap slowly (B3).' },
    { id: 'v_erosion', name: 'Standard erosion', kind: 'flow', eq: '(Service_standard - Service_level) / Standard_adjustment_time', units: '1/month', from: 'v_standard', nonNegative: true, doc: 'The standard drifts down toward actual service (R4). It never drifts up.' },
    { id: 'v_service', name: 'Service level', kind: 'aux', eq: 'Capacity / Demand', units: 'dmnl' },
    {
      id: 'v_effect',
      name: 'Effect of service on growth',
      kind: 'aux',
      eq: 'Service_level',
      units: 'dmnl',
      doc: 'Full growth at service ≥ 1; no growth at 0.8; customers leave below that.',
      graph: { xs: [0.6, 0.8, 1, 1.2], ys: [-1, 0, 1, 1] },
    },
    { id: 'v_desired', name: 'Desired capacity', kind: 'aux', eq: 'Demand * Service_standard', units: 'customers' },
    { id: 'v_growth_frac', name: 'Normal growth fraction', kind: 'constant', eq: '0.05', units: '1/month', range: [0.03, 0.07] },
    { id: 'v_acq_time', name: 'Capacity acquisition time', kind: 'constant', eq: '18', units: 'month', range: [12, 24] },
    { id: 'v_std_time', name: 'Standard adjustment time', kind: 'constant', eq: '12', units: 'month', range: [6, 24] },
  ],
  links: [
    ['v_demand', 'v_growth', '+'],
    ['v_growth_frac', 'v_growth', '+'],
    ['v_effect', 'v_growth', '+'],
    ['v_desired', 'v_additions', '+'],
    ['v_capacity', 'v_additions', '-'],
    ['v_acq_time', 'v_additions', '-'],
    ['v_standard', 'v_erosion', '+'],
    ['v_service', 'v_erosion', '-'],
    ['v_std_time', 'v_erosion', '-'],
    ['v_capacity', 'v_service', '+'],
    ['v_demand', 'v_service', '-'],
    ['v_service', 'v_effect', '+'],
    ['v_demand', 'v_desired', '+'],
    ['v_standard', 'v_desired', '+'],
  ],
  frame: {
    problem: 'Demand grew fast, service slipped, the standard was relaxed, and growth has now stalled.',
    purpose: 'Show how an eroding performance standard starves capacity investment and caps growth.',
    kpis: [
      { id: 'k_demand', name: 'Demand', varId: 'v_demand', goal: 'maximize' },
      { id: 'k_service', name: 'Service level', varId: 'v_service', goal: 'target', target: 1.2 },
    ],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'Growth stalls',
        varId: 'v_demand',
        source: 'sketch',
        label: 'feared',
        units: 'customers',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 100], [12, 170], [24, 240], [36, 280], [60, 300], [120, 300]],
      },
    ],
    excluded: [{ id: 'b_price', name: 'Price and competition', reason: 'Not needed to show the pattern.' }],
  },
  scenarios: [
    {
      id: 's_hold_standard',
      name: 'Hold the standard',
      note: 'Keep investing to the original service standard (it never erodes).',
      overrides: [{ varId: 'v_std_time', equation: '1000000' }],
    },
  ],
});

export const growthAndUnderinvestment: Archetype = {
  id: 'growth-and-underinvestment',
  name: 'Growth and Underinvestment',
  summary:
    'Growth approaches a limit that investment in capacity could remove, but investment waits for performance to ' +
    'fall below a standard that is itself allowed to erode; capacity arrives too late, performance drops, and demand ' +
    'stalls — which seems to confirm that investing was unnecessary.',
  structure:
    'R1 (growth): Demand → (+) Growing action → (+) Demand. B2 (limit): Demand → (−) Performance → (+) Demand. ' +
    'B3 (investment, delayed): Performance → (−) Need to invest → (+) Investment → (+, delayed) Capacity → (+) Performance. ' +
    'R4 (eroding standard): Performance → (+, delayed) Standard → (+) Need to invest → … → (+) Performance.',
  cld,
  sfd,
  signature: {
    kpi: 'v_demand',
    shape: 'growth-then-stagnation',
    description:
      'Demand grows, service falls as capacity lags, the standard erodes, investment tapers off, and demand stalls ' +
      'well short of what sustained investment would have supported.',
  },
  interventions: [
    { text: 'Hold the performance standard; derive it from customer needs, not from recent performance.', leverage: 3 },
    { text: 'Invest ahead of demand, sized to the growth you intend, not to today’s shortfall.', leverage: 5 },
    { text: 'Shorten the capacity acquisition delay (pre-qualified vendors, modular capacity).', leverage: 9 },
  ],
  illustrations: {
    generic: 'A fast-growing service firm delays hiring, response times slip, targets are relaxed, and customers go elsewhere.',
    epc:
      'A fabrication yard wins spool orders faster than it adds welders and QC staff; delivery performance slips, ' +
      'the “acceptable” lead time is quietly extended, and clients start placing orders elsewhere.',
  },
  sources: [cite('senge-1990', true), cite('kim-1992', true)],
};
