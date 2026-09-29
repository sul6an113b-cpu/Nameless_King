/** Compact builder for graph-analysis fixture models (test-only). */
import { ModelSchema, SCHEMA_VERSION, type Model, type VarKind } from '../../../src/schema/model.ts';

/** [from, to, polarity, 'delay'?] */
export type LinkSpec = readonly [from: string, to: string, polarity: '+' | '-' | '?', delay?: 'delay'];

export interface VarSpec {
  id: string;
  name?: string;
  kind?: VarKind;
  equation?: string;
  flow?: { from: string | null; to: string | null };
}

export interface GraphSpec {
  /** a bare string is a qualitative variable whose name is its id */
  vars: readonly (string | VarSpec)[];
  links: readonly LinkSpec[];
}

/** Deterministic link id used by every fixture: `l_<from>_<to>`. */
export const linkId = (from: string, to: string): string => `l_${from}_${to}`;

export function graphModel(spec: GraphSpec, name = 'fixture'): Model {
  return ModelSchema.parse({
    format: 'looplab-model',
    schemaVersion: SCHEMA_VERSION,
    id: 'm_fixture',
    name,
    createdAt: '2026-09-29T00:00:00.000Z',
    updatedAt: '2026-09-29T00:00:00.000Z',
    variables: spec.vars.map((v) => (typeof v === 'string' ? { id: v, name: v } : { name: v.id, ...v })),
    links: spec.links.map(([from, to, polarity, delay]) => ({
      id: linkId(from, to),
      from,
      to,
      polarity,
      delay: delay === 'delay',
    })),
  });
}
