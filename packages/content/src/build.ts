/**
 * Small authoring helper: builds a bundled `Model` from a compact spec using the core model ops, so every bundled
 * model goes through the same integrity rules as user edits (SPEC §4). Deterministic: fixed ids and timestamps.
 */
import {
  ModelSchema,
  addLink,
  addVariable,
  connectFlow,
  createEmptyModel,
  type Model,
  type ModelInput,
  type VariableInput,
} from '@looplab/core';

/** Timestamp stamped on every bundled model (content release date). */
export const CONTENT_TIMESTAMP = '2026-09-29T00:00:00.000Z';

export type Kind = 'stock' | 'flow' | 'aux' | 'constant' | 'variable';

export interface VarSpec {
  id: string;
  name: string;
  kind: Kind;
  /** stock: initial value; flow/aux: expression; constant: numeric literal */
  eq?: string;
  units?: string;
  doc?: string;
  nonNegative?: boolean;
  /** embedded graphical function applied to the equation result (aux/flow) */
  graph?: { xs: number[]; ys: number[]; mode?: 'continuous' | 'extrapolate' | 'discrete' };
  /** constants: plausible range for sensitivity / Monte Carlo (uniform) */
  range?: [number, number];
  /** flows: source and target stock ids (null = cloud) */
  from?: string | null;
  to?: string | null;
}

/** [from, to, polarity, options]. Flow→stock links are created by `connectFlow` and must not be listed. */
export type LinkSpec = [
  from: string,
  to: string,
  polarity: '+' | '-',
  opts?: { delay?: boolean; note?: string; confidence?: 'low' | 'medium' | 'high' },
];

export interface ModelSpec {
  id: string;
  name: string;
  variables: VarSpec[];
  links: LinkSpec[];
  simSpec?: ModelInput['simSpec'];
  /** custom unit names used by the model (base dimensions) */
  units?: string[];
  frame?: ModelInput['frame'];
  assertions?: ModelInput['assertions'];
  scenarios?: ModelInput['scenarios'];
  interventions?: ModelInput['interventions'];
}

const linkId = (from: string, to: string): string => `l_${from.replace(/^v_/, '')}__${to.replace(/^v_/, '')}`;

/** Build and validate a model. Throws (at import time) if the spec breaks any schema or integrity rule. */
export function buildModel(spec: ModelSpec): Model {
  let m = createEmptyModel(spec.name, { id: spec.id, now: CONTENT_TIMESTAMP });
  for (const v of spec.variables) {
    const input: VariableInput = {
      id: v.id,
      name: v.name,
      kind: v.kind,
      equation: v.eq ?? '',
      units: v.units ?? '',
      doc: v.doc ?? '',
      nonNegative: v.nonNegative ?? false,
      ...(v.graph ? { graph: v.graph } : {}),
      ...(v.range ? { uncertainty: { min: v.range[0], max: v.range[1] } } : {}),
    };
    m = addVariable(m, input);
  }
  for (const v of spec.variables) {
    if (v.kind === 'flow') m = connectFlow(m, v.id, { from: v.from ?? null, to: v.to ?? null });
  }
  for (const [from, to, polarity, opts] of spec.links) {
    m = addLink(m, { id: linkId(from, to), from, to, polarity, ...opts });
  }
  return ModelSchema.parse({
    ...m,
    ...(spec.simSpec ? { simSpec: spec.simSpec } : {}),
    ...(spec.frame ? { frame: spec.frame } : {}),
    units: (spec.units ?? []).map((name) => ({ name })),
    assertions: spec.assertions ?? [],
    scenarios: spec.scenarios ?? [],
    interventions: spec.interventions ?? [],
  });
}

/** A causal loop diagram: every variable is qualitative (kind `variable`). */
export function buildCld(spec: {
  id: string;
  name: string;
  variables: { id: string; name: string; doc?: string }[];
  links: LinkSpec[];
  frame?: ModelInput['frame'];
}): Model {
  return buildModel({
    id: spec.id,
    name: spec.name,
    variables: spec.variables.map((v) => ({ ...v, kind: 'variable' as const })),
    links: spec.links,
    ...(spec.frame ? { frame: spec.frame } : {}),
  });
}
