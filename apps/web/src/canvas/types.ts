/** Node and edge type registries, defined once at module scope (React Flow requires stable objects). */
import { CausalEdge, PipeEdge } from './edges.tsx';
import { CloudNode, GhostNode, GlyphNode, SfdVariableNode, StockNode, VariableNode } from './nodes.tsx';

export const cldNodeTypes = { variable: VariableNode, ghost: GhostNode };

export const sfdNodeTypes = {
  stock: StockNode,
  flow: GlyphNode,
  aux: GlyphNode,
  constant: GlyphNode,
  lookup: GlyphNode,
  sfdvar: SfdVariableNode,
  cloud: CloudNode,
  ghost: GhostNode,
};

export const edgeTypes = { causal: CausalEdge, pipe: PipeEdge };
