/**
 * Make a freshly opened model presentable: lenses without any stored positions get a dagre layout
 * (synchronous: opened files and bundled examples are small). Positions only; nothing else changes.
 */
import { setLayout, type Model } from '@looplab/core';
import { NODE_SIZE } from '../canvas/sizes.ts';
import { computeLayout } from './layout.ts';

const SFD_SIZE = {
  variable: NODE_SIZE.sfdvar,
  stock: NODE_SIZE.stock,
  flow: NODE_SIZE.flow,
  aux: NODE_SIZE.aux,
  constant: NODE_SIZE.constant,
  lookup: NODE_SIZE.lookup,
};

export function withLayout(model: Model): Model {
  if (model.variables.length === 0) return model;
  let m = model;
  const edges = model.links.map((l) => ({ from: l.from, to: l.to }));
  if (Object.keys(model.layout.cld).length === 0) {
    const nodes = model.variables.map((v) => ({
      id: v.id,
      width: NODE_SIZE.variable.w + 20,
      height: NODE_SIZE.variable.h,
    }));
    m = setLayout(m, 'cld', computeLayout(nodes, edges));
  }
  if (Object.keys(model.layout.sfd).length === 0) {
    const nodes = model.variables.map((v) => {
      const s = SFD_SIZE[v.kind];
      return {
        id: v.id,
        width: Math.max(s.w, 90),
        height: s.h + (v.kind === 'stock' || v.kind === 'variable' ? 0 : 18),
      };
    });
    const pipes = model.variables.flatMap((v) =>
      v.kind === 'flow' && v.flow
        ? [
            ...(v.flow.from ? [{ from: v.flow.from, to: v.id }] : []),
            ...(v.flow.to ? [{ from: v.id, to: v.flow.to }] : []),
          ]
        : [],
    );
    m = setLayout(m, 'sfd', computeLayout(nodes, [...pipes, ...edges], { nodesep: 60, ranksep: 70 }));
  }
  return m;
}
