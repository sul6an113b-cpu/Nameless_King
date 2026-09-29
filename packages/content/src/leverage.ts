/**
 * Meadows' twelve leverage points, "in increasing order of effectiveness" (Meadows 1999). Names follow the 1999
 * paper's list (verified against several independent copies of the list via search summaries; see
 * docs/decisions/methodologist.md). Descriptions and examples are our own words, not quotations.
 */
import { cite } from './sources.ts';
import type { LeveragePoint } from './types.ts';

const source = cite('meadows-1999', true);

export const leveragePoints: readonly LeveragePoint[] = [
  {
    level: 12,
    name: 'Constants, parameters, numbers (such as subsidies, taxes, standards)',
    description:
      'Changing the size of a number in the system. Easy and popular, but it rarely changes behaviour, because the ' +
      'structure that produces the behaviour stays the same.',
    examples: ['Adding two engineers to a late design package.', 'Raising an inspection crew’s daily quota.'],
    source,
  },
  {
    level: 11,
    name: 'The sizes of buffers and other stabilizing stocks, relative to their flows',
    description:
      'A large stock relative to its flows absorbs shocks; a small one reacts fast but is fragile. Buffers are often ' +
      'physical and slow or costly to change.',
    examples: [
      'Holding a float of spare spools or bulk materials on site.',
      'Keeping schedule contingency between design and construction.',
    ],
    source,
  },
  {
    level: 10,
    name: 'The structure of material stocks and flows (such as transport networks, population age structures)',
    description:
      'The physical plumbing of the system: what flows where, through which stocks. Getting it right in design is ' +
      'powerful; rebuilding it later is slow and expensive.',
    examples: [
      'Modularising and prefabricating instead of stick-building on site.',
      'Changing the sequence engineering → procurement → construction to overlap phases.',
    ],
    source,
  },
  {
    level: 9,
    name: 'The lengths of delays, relative to the rate of system change',
    description:
      'Delays in feedback loops cause overshoot and oscillation when they are long compared with how fast the system ' +
      'changes. Shortening a critical delay can be very effective, where it is possible at all.',
    examples: [
      'Reviewing drawings earlier so rework is discovered in weeks, not months.',
      'Shortening vendor-data turnaround.',
    ],
    source,
  },
  {
    level: 8,
    name: 'The strength of negative feedback loops, relative to the impacts they are trying to correct against',
    description:
      'Balancing loops keep a system near its goal. Their strength — how fast and how hard they respond — must match the ' +
      'disturbances they face; removing “unused” safeguards weakens them.',
    examples: [
      'A hold-point inspection regime that scales with the construction peak.',
      'Early-warning schedule metrics that trigger corrective action.',
    ],
    source,
  },
  {
    level: 7,
    name: 'The gain around driving positive feedback loops',
    description:
      'Reinforcing loops drive growth, erosion and collapse. Slowing a runaway loop is usually more effective than ' +
      'strengthening the balancing loops that fight it.',
    examples: [
      'Breaking the schedule-pressure → errors → rework → more pressure spiral.',
      'Stopping claim–counter-claim escalation early.',
    ],
    source,
  },
  {
    level: 6,
    name: 'The structure of information flows (who does and does not have access to information)',
    description:
      'Adding or restoring feedback to the place where decisions are made. A missing information flow is a common ' +
      'cause of malfunction, and adding one is often cheap.',
    examples: [
      'Reporting progress on verified work, not on work believed done.',
      'Showing crews the live inspection backlog and wait time.',
    ],
    source,
  },
  {
    level: 5,
    name: 'The rules of the system (such as incentives, punishments, constraints)',
    description:
      'Rules define the scope, boundaries and degrees of freedom of the system; who makes the rules has real power.',
    examples: [
      'Contract terms that reward first-time quality instead of speed alone.',
      'A rule that no package is issued for construction without a completed review.',
    ],
    source,
  },
  {
    level: 4,
    name: 'The power to add, change, evolve, or self-organize system structure',
    description:
      'The ability of a system to change its own structure — learn, diversify, create new loops and rules. It relies on ' +
      'variety, experimentation and the freedom to try.',
    examples: [
      'Lessons-learned processes that actually change procedures on the next project.',
      'Letting site teams redesign their own workflows.',
    ],
    source,
  },
  {
    level: 3,
    name: 'The goals of the system',
    description:
      'The purpose that everything else serves. Changing the goal redirects every loop, rule and delay below it.',
    examples: [
      'Optimising for total installed cost over the life of the project rather than for each phase’s budget.',
      'Holding quality standards to customer requirements instead of recent performance.',
    ],
    source,
  },
  {
    level: 2,
    name: 'The mindset or paradigm out of which the system — its goals, structure, rules, delays, parameters — arises',
    description:
      'The shared, unstated assumptions from which goals and rules arise. Paradigms are hard to change, but when they ' +
      'change, the system can change fast.',
    examples: [
      'From “the schedule is fixed, quality will follow” to “quality is how the schedule is met”.',
      'From “the client is an adversary” to “the project is a joint enterprise”.',
    ],
    source,
  },
  {
    level: 1,
    name: 'The power to transcend paradigms',
    description:
      'Holding no paradigm as the final truth, and being able to choose the one that fits the purpose. The rarest and ' +
      'most powerful source of leverage.',
    examples: ['Treating every project-delivery model (lump-sum, alliance, EPCM) as a tool to choose, not a doctrine.'],
    source,
  },
];

/** The leverage point for a Meadows level (12 = weakest … 1 = strongest). */
export function leveragePoint(level: number): LeveragePoint | undefined {
  return leveragePoints.find((p) => p.level === level);
}
