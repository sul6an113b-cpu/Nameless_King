/**
 * LoopLab content library (SPEC §6.10) — owner: methodologist.
 * Eight system archetypes (CLD + runnable SFD + behaviour signature), Meadows' twelve leverage points, four example
 * models, behaviour-shape classifiers and the bibliography they cite. Every bundled model is built through the core
 * model ops and parses under `ModelSchema`; all parameter values are illustrative.
 */
export type { Archetype, Citation, ExampleId, ExampleModel, LeveragePoint, ShapeId, SourceKey } from './types.ts';
export { archetypes } from './archetypes/index.ts';
export { leveragePoints, leveragePoint } from './leverage.ts';
export { examples, tankHeight } from './examples/index.ts';
export {
  SHAPES,
  SHAPE_IDS,
  classifyShape,
  explainShape,
  matchesShape,
  type ShapeInfo,
  type ShapeVerdict,
} from './shapes.ts';
export { bibliography, cite, type Reference } from './sources.ts';
