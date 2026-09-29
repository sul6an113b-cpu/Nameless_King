/** Default node sizes (before React Flow measures them) and their edge-attachment shapes. */
import type { Shape } from './geometry.ts';

export type NodeKindKey = 'variable' | 'stock' | 'flow' | 'aux' | 'constant' | 'lookup' | 'sfdvar' | 'cloud' | 'ghost';

export const NODE_SIZE: Record<NodeKindKey, { w: number; h: number; shape: Shape }> = {
  variable: { w: 120, h: 36, shape: 'rect' },
  ghost: { w: 120, h: 36, shape: 'rect' },
  stock: { w: 112, h: 52, shape: 'rect' },
  sfdvar: { w: 112, h: 38, shape: 'rect' },
  flow: { w: 28, h: 28, shape: 'circle' },
  aux: { w: 24, h: 24, shape: 'circle' },
  constant: { w: 22, h: 22, shape: 'circle' },
  lookup: { w: 26, h: 26, shape: 'circle' },
  cloud: { w: 40, h: 26, shape: 'rect' },
};
