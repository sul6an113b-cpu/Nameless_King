/**
 * Bibliography for the content library (BRIEF: Content library; methodologist brief: sourcing rules).
 *
 * Verification (2026-09-29): WebFetch was blocked by the sandbox egress policy, so claims were checked against
 * WebSearch result summaries of authoritative pages. The URL behind each check is listed here and in
 * docs/decisions/methodologist.md. A `Citation` is `verified: true` only when the specific claim it supports was
 * confirmed that way; page numbers are never given.
 */
import type { Citation, SourceKey } from './types.ts';

export interface Reference {
  key: SourceKey;
  /** Author-year form used in text, e.g. "Sterman (2000)". */
  short: string;
  /** Full reference, APA-like. */
  full: string;
  /** Pages used to verify the bibliographic data (not necessarily the full text). */
  checkedAt: string[];
}

export const bibliography: Readonly<Record<string, Reference>> = {
  'sterman-2000': {
    key: 'sterman-2000',
    short: 'Sterman (2000)',
    full: 'Sterman, J. D. (2000). Business Dynamics: Systems Thinking and Modeling for a Complex World. Irwin/McGraw-Hill.',
    // Ch. 4 "Structure and Behavior of Dynamic Systems": exponential growth, goal seeking, oscillation, S-shaped growth,
    // S-shaped growth with overshoot, overshoot and collapse (publisher table of contents via search summary).
    checkedAt: [
      'https://www.mheducation.com.au/business-dynamics-systems-thinking-and-modeling-for-a-complex-world-9780072311358-aus',
    ],
  },
  'meadows-2008': {
    key: 'meadows-2008',
    short: 'Meadows (2008)',
    full: 'Meadows, D. H. (2008). Thinking in Systems: A Primer (D. Wright, Ed.). Chelsea Green Publishing.',
    // Ch. 5 "System Traps ... and Opportunities": policy resistance, tragedy of the commons, drift to low performance,
    // escalation, success to the successful, shifting the burden to the intervenor (addiction), rule beating,
    // seeking the wrong goal.
    checkedAt: [
      'https://library.alnap.org/system/files/content/resource/files/main/thinking-in-systems-a-primer.pdf',
      'https://bytepawn.com/systems-thinking.html',
    ],
  },
  'meadows-1999': {
    key: 'meadows-1999',
    short: 'Meadows (1999)',
    full: 'Meadows, D. H. (1999). Leverage Points: Places to Intervene in a System. The Sustainability Institute, Hartland, VT.',
    // The 12 leverage points, wording and order (12 = least, 1 = most effective), identical in several independent copies.
    checkedAt: ['https://sites.dartmouth.edu/climateaction/?p=27', 'https://explore.psychsafety.com/n/meadows-1999/'],
  },
  'senge-1990': {
    key: 'senge-1990',
    short: 'Senge (1990)',
    full: 'Senge, P. M. (1990). The Fifth Discipline: The Art and Practice of the Learning Organization. Doubleday/Currency.',
    // Ch. 4 "The Laws of the Fifth Discipline" (e.g. "behavior grows better before it grows worse"); archetypes
    // appendix (the at-a-glance summaries below state they are drawn from The Fifth Discipline).
    checkedAt: [
      'https://maaw.info/ArticleSummaries/ArtSumSenge90.htm',
      'https://www.simonwhatley.co.uk/writing/senges-11-laws-of-systems-thinking/',
    ],
  },
  'kim-1992': {
    key: 'kim-1992',
    short: 'Kim (1992)',
    full:
      'Kim, D. H. (1992). Systems Archetypes I: Diagnosing Systemic Issues and Designing High-Leverage Interventions ' +
      '(Toolbox Reprint Series). Pegasus Communications, Waltham, MA.',
    checkedAt: [
      'https://thesystemsthinker.com/wp-content/uploads/2016/03/Systems-Archetypes-I-TRSA01_pk.pdf',
      'https://thesystemsthinker.com/wp-content/uploads/2016/01/PG01E-System-Archetypes-at-a-Glance.pdf',
    ],
  },
  'lyneis-ford-2007': {
    key: 'lyneis-ford-2007',
    short: 'Lyneis & Ford (2007)',
    full:
      'Lyneis, J. M., & Ford, D. N. (2007). System dynamics applied to project management: a survey, assessment, and ' +
      'directions for future research. System Dynamics Review, 23(2–3), 157–189. https://doi.org/10.1002/sdr.377',
    // The rework cycle, feedback effects and knock-on effects as drivers of project dynamics (MIT OCW ESD.36 lecture
    // notes by Lyneis; SD conference abstract), via search summaries.
    checkedAt: [
      'https://proceedings.systemdynamics.org/2007/proceed/abstracts/563.htm',
      'https://ocw.mit.edu/courses/esd-36-system-project-management-fall-2012/800ceb204ef03177b61e1288533446c1_MITESD_36F12_Lec06.pdf',
    ],
  },
  'torricelli-law': {
    key: 'torricelli-law',
    short: "Torricelli's law",
    full:
      "Torricelli's law: efflux speed v = √(2gh); for a tank of constant cross-section, dh/dt = −k√h, so √h falls " +
      'linearly in time (standard result, e.g. calculus and fluid-mechanics texts).',
    checkedAt: [
      'https://sites.math.washington.edu/~aloveles/ProjectGallery/TorricellisLawProject.pdf',
      'https://ace.gatech.edu/experiments2/2413/torricelli/fall02/TorricelliLaw/extension.htm',
    ],
  },
};

/** Shorthand for a citation; `verified` is explicit at every call site on purpose. */
export function cite(key: SourceKey, verified: boolean, locator?: string): Citation {
  return locator === undefined ? { key, verified } : { key, locator, verified };
}
