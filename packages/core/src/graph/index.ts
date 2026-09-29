/** Structural analysis (SPEC §6.5) — owner: graph-analyst. Phase-1 stub: signatures only. */
import type {
  ArchetypeCandidate,
  BoundaryChart,
  CompiledModel,
  FindLoopsOptions,
  FindLoopsResult,
  HealthItem,
  Loop,
  LoopType,
  SimResult,
  StructuralLeverageRow,
  VarEvaluator,
} from '../contracts.ts';
import type { Id, Model } from '../schema/model.ts';
import { notImplemented } from '../stub.ts';

export function findLoops(_model: Model, _opts?: FindLoopsOptions): FindLoopsResult {
  return notImplemented('graph.findLoops');
}

/** Even number of '-' links → R, odd → B, any '?' → U. */
export function loopType(_model: Model, _linkIds: Id[]): LoopType {
  return notImplemented('graph.loopType');
}

export function loopParticipation(_loops: Loop[]): Record<Id, number> {
  return notImplemented('graph.loopParticipation');
}

export function betweenness(_model: Model): Record<Id, number> {
  return notImplemented('graph.betweenness');
}

export function boundaryChart(_model: Model, _loops: Loop[]): BoundaryChart {
  return notImplemented('graph.boundaryChart');
}

export function structuralLeverage(_model: Model, _loops: Loop[]): StructuralLeverageRow[] {
  return notImplemented('graph.structuralLeverage');
}

export function matchArchetypes(_model: Model, _loops: Loop[]): ArchetypeCandidate[] {
  return notImplemented('graph.matchArchetypes');
}

/** Equation-implied link signs vs drawn polarity. `evaluator` defaults to `compiled.evalVar`. */
export function checkPolarity(
  _model: Model,
  _compiled?: CompiledModel,
  _samples?: SimResult,
  _evaluator?: VarEvaluator,
): HealthItem[] {
  return notImplemented('graph.checkPolarity');
}
