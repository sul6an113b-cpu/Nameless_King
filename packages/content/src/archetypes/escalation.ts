/**
 * Escalation. Structure after Senge (1990) and Kim (1992): each party's balancing loop tries to get ahead of the
 * other's position; together the two balancing loops form a reinforcing figure-8. Meadows (2008, ch. 5) lists
 * escalation as a system trap. Checked against Kim's at-a-glance summary
 * (https://library.alnap.org/system/files/content/resource/files/main/PG01E-System-Archetypes-at-a-Glance.pdf, via
 * search summary). All parameter values are illustrative.
 */
import { buildCld, buildModel } from '../build.ts';
import { cite } from '../sources.ts';
import type { Archetype } from '../types.ts';

const cld = buildCld({
  id: 'm_arch_escalation_cld',
  name: 'Escalation (CLD)',
  variables: [
    { id: 'v_a_activity', name: 'Activity by A' },
    { id: 'v_b_activity', name: 'Activity by B' },
    { id: 'v_relative', name: 'Result of A relative to B' },
    { id: 'v_threat_a', name: 'Threat to A' },
    { id: 'v_threat_b', name: 'Threat to B' },
  ],
  links: [
    ['v_a_activity', 'v_relative', '+'],
    ['v_b_activity', 'v_relative', '-'],
    ['v_relative', 'v_threat_a', '-', { note: 'The further A is ahead, the safer A feels.' }],
    ['v_threat_a', 'v_a_activity', '+', { delay: true, note: 'A responds to the threat (B1).' }],
    ['v_relative', 'v_threat_b', '+', { note: 'The further A is ahead, the more threatened B feels.' }],
    ['v_threat_b', 'v_b_activity', '+', { delay: true, note: 'B responds to the threat (B2).' }],
  ],
});

const sfd = buildModel({
  id: 'm_arch_escalation_sfd',
  name: 'Escalation (SFD)',
  simSpec: { start: 0, stop: 60, dt: 0.25, method: 'euler', timeUnit: 'month' },
  units: ['effort'],
  variables: [
    { id: 'v_a', name: 'A activity', kind: 'stock', eq: '10', units: 'effort' },
    { id: 'v_b', name: 'B activity', kind: 'stock', eq: '10', units: 'effort' },
    { id: 'v_a_change', name: 'A build-up', kind: 'flow', eq: '(A_target - A_activity) / A_response_time', units: 'effort/month', to: 'v_a', doc: 'A closes the gap to its target (B1).' },
    { id: 'v_b_change', name: 'B build-up', kind: 'flow', eq: '(B_target - B_activity) / B_response_time', units: 'effort/month', to: 'v_b', doc: 'B closes the gap to its target (B2).' },
    { id: 'v_a_target', name: 'A target', kind: 'aux', eq: 'B_activity * (1 + A_desired_margin)', units: 'effort', doc: 'A wants to be ahead of B by its margin.' },
    { id: 'v_b_target', name: 'B target', kind: 'aux', eq: 'A_activity * (1 + B_desired_margin)', units: 'effort', doc: 'B wants to be ahead of A by its margin.' },
    { id: 'v_a_margin', name: 'A desired margin', kind: 'constant', eq: '0.2', units: 'dmnl', range: [0.1, 0.3] },
    { id: 'v_b_margin', name: 'B desired margin', kind: 'constant', eq: '0.2', units: 'dmnl', range: [0.1, 0.3] },
    { id: 'v_a_time', name: 'A response time', kind: 'constant', eq: '6', units: 'month', range: [3, 9] },
    { id: 'v_b_time', name: 'B response time', kind: 'constant', eq: '6', units: 'month', range: [3, 9] },
  ],
  links: [
    ['v_a_target', 'v_a_change', '+'],
    ['v_a', 'v_a_change', '-'],
    ['v_a_time', 'v_a_change', '-'],
    ['v_b_target', 'v_b_change', '+'],
    ['v_b', 'v_b_change', '-'],
    ['v_b_time', 'v_b_change', '-'],
    ['v_b', 'v_a_target', '+'],
    ['v_a_margin', 'v_a_target', '+'],
    ['v_a', 'v_b_target', '+'],
    ['v_b_margin', 'v_b_target', '+'],
  ],
  frame: {
    problem: 'Each side’s response to the other makes both invest ever more, with neither ending up ahead.',
    purpose: 'Show how two balancing responses combine into a reinforcing escalation.',
    kpis: [{ id: 'k_a', name: 'A activity', varId: 'v_a', goal: 'minimize' }],
    referenceModes: [
      {
        id: 'r_signature',
        name: 'Both sides escalate',
        varId: 'v_a',
        source: 'sketch',
        label: 'feared',
        units: 'effort',
        note: 'Illustrative sketch of the archetype signature, not data.',
        points: [[0, 10], [15, 17], [30, 28], [45, 47], [60, 75]],
      },
    ],
    excluded: [{ id: 'b_resources', name: 'Resource limits of either party', reason: 'Escalation is shown before limits bite.' }],
  },
  scenarios: [
    {
      id: 's_parity',
      name: 'Both accept parity',
      note: 'Neither side seeks to be ahead (margins set to zero).',
      overrides: [
        { varId: 'v_a_margin', equation: '0' },
        { varId: 'v_b_margin', equation: '0' },
      ],
    },
  ],
});

export const escalation: Archetype = {
  id: 'escalation',
  name: 'Escalation',
  summary:
    'Two parties each see their safety or success in being ahead of the other; each response to the other’s ' +
    'move provokes a counter-move, so both escalate.',
  structure:
    'B1: A’s result relative to B → (−) Threat to A → (+, delayed) A’s activity → (+) A’s relative result. ' +
    'B2: A’s relative result → (+) Threat to B → (+, delayed) B’s activity → (−) A’s relative result. ' +
    'Together the two balancing loops form a reinforcing figure-8.',
  cld,
  sfd,
  signature: {
    kpi: 'v_a',
    shape: 'escalation',
    description: 'Both parties’ activity rises together, ever faster, while neither gains a lasting lead.',
  },
  interventions: [
    { text: 'Find a way for both sides to meet their real goal without being ahead (e.g. agree on parity).', leverage: 3 },
    { text: 'Unilateral, visible de-escalation to reverse the reinforcing loop.', leverage: 7 },
    { text: 'Agree rules that cap the contest (e.g. price floors, claim protocols).', leverage: 5 },
  ],
  illustrations: {
    generic: 'Two retailers answer each other’s price cuts until both sell below cost.',
    epc:
      'Contractor claims and client back-charges: each new claim triggers counter-claims, and both sides add ' +
      'commercial staff and legal support until the dispute costs more than the original variation.',
  },
  sources: [cite('senge-1990', true), cite('kim-1992', true), cite('meadows-2008', true, 'ch. 5, “System Traps … and Opportunities”')],
};
