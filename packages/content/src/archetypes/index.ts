/** The eight system archetypes of the BRIEF (Senge 1990; Kim 1992), in the order of `ArchetypeId`. */
import type { Archetype } from '../types.ts';
import { erodingGoals } from './eroding-goals.ts';
import { escalation } from './escalation.ts';
import { fixesThatFail } from './fixes-that-fail.ts';
import { growthAndUnderinvestment } from './growth-and-underinvestment.ts';
import { limitsToGrowth } from './limits-to-growth.ts';
import { shiftingTheBurden } from './shifting-the-burden.ts';
import { successToTheSuccessful } from './success-to-the-successful.ts';
import { tragedyOfTheCommons } from './tragedy-of-the-commons.ts';

export const archetypes: readonly Archetype[] = [
  fixesThatFail,
  shiftingTheBurden,
  limitsToGrowth,
  erodingGoals,
  escalation,
  successToTheSuccessful,
  tragedyOfTheCommons,
  growthAndUnderinvestment,
];
