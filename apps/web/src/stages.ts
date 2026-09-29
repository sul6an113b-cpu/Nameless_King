import type { Stage } from '@looplab/core';

/** The six workflow stages, in rail order (BRIEF: Workflow rail). */
export const STAGES: readonly { id: Stage; label: string; hint: string }[] = [
  { id: 'frame', label: 'Frame', hint: 'Problem, horizon, KPIs, reference modes, boundary' },
  { id: 'map', label: 'Map', hint: 'Causal loop diagram' },
  { id: 'analyze', label: 'Analyze', hint: 'Loops, archetypes, structural leverage' },
  { id: 'quantify', label: 'Quantify', hint: 'Stock-and-flow model and Model Health' },
  { id: 'test', label: 'Test', hint: 'Simulate, sensitivity, Monte Carlo, loop dominance' },
  { id: 'decide', label: 'Decide', hint: 'Interventions, comparison, report' },
];
