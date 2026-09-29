/**
 * Structural analysis (SPEC §6.5) — owner: graph-analyst.
 * Loops (Johnson's algorithm, capped), R/B classification, loop participation, betweenness, boundary chart,
 * structural leverage, archetype candidates and the polarity consistency check.
 * Design decisions and formulas: docs/decisions/graph-analyst.md.
 */
export { findLoops, loopType, loopKey } from './loops.ts';
export { loopParticipation, betweenness, boundaryChart, structuralLeverage } from './metrics.ts';
export { matchArchetypes, STRONG_ARCHETYPE_SCORE } from './archetypes.ts';
/** Equation-implied link signs vs drawn polarity. `evaluator` defaults to `compiled.evalVar`. */
export { checkPolarity } from './polarity.ts';
