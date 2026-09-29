/**
 * One model, two lenses (SPEC §1, §4): the CLD and SFD views are pure projections of the same Model.
 */
import type { Id, Link, Model, VarKind, Origin, XY } from '../schema/model.ts';
import { impliedFlowLinks } from './ops.ts';

export interface CldNode {
  id: Id;
  name: string;
  kind: VarKind;
  origin: Origin;
  position?: XY;
}

export interface CldProjection {
  nodes: CldNode[];
  edges: Link[];
}

/** CLD lens: every variable and every causal link. */
export function projectCld(model: Model): CldProjection {
  return {
    nodes: model.variables.map((v) => ({
      id: v.id,
      name: v.name,
      kind: v.kind,
      origin: v.origin,
      ...(model.layout.cld[v.id] ? { position: model.layout.cld[v.id] } : {}),
    })),
    edges: model.links,
  };
}

export interface SfdNode {
  id: Id;
  name: string;
  kind: 'stock' | 'flow' | 'aux' | 'constant' | 'lookup' | 'variable';
  origin: Origin;
  position?: XY;
}

export interface SfdPipe {
  flowId: Id;
  from: Id | null; // null = cloud
  to: Id | null;
}

export interface SfdProjection {
  nodes: SfdNode[];
  /** material flows between stocks/clouds */
  pipes: SfdPipe[];
  /** information connectors = causal links not implied by a flow→stock connection */
  connectors: Link[];
  /** variables still of kind 'variable' (shown dashed; block simulation) */
  unquantified: Id[];
}

/** SFD lens: stocks, flows as pipes, auxiliaries/constants/lookups, and information connectors. */
export function projectSfd(model: Model): SfdProjection {
  const implied = new Set(impliedFlowLinks(model).map((l) => `${l.flowId}\u0000${l.stockId}`));
  return {
    nodes: model.variables.map((v) => ({
      id: v.id,
      name: v.name,
      kind: v.kind,
      origin: v.origin,
      ...(model.layout.sfd[v.id] ? { position: model.layout.sfd[v.id] } : {}),
    })),
    pipes: model.variables
      .filter((v) => v.kind === 'flow' && v.flow)
      .map((v) => ({ flowId: v.id, from: v.flow?.from ?? null, to: v.flow?.to ?? null })),
    connectors: model.links.filter((l) => !implied.has(`${l.from}\u0000${l.to}`)),
    unquantified: model.variables.filter((v) => v.kind === 'variable').map((v) => v.id),
  };
}
