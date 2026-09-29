/**
 * Custom React Flow nodes. CLD: a named variable. SFD: stock (box), flow (valve), auxiliary (circle),
 * constant (diamond), lookup (circle with ~), unquantified variable (dashed box), cloud (source/sink).
 * A small source handle starts a link; while a link is being dragged every other node becomes a drop target.
 */
import type { ReactNode } from 'react';
import { Handle, Position, useConnection, type Node, type NodeProps } from '@xyflow/react';
import type { Origin, VarKind } from '@looplab/core';
import { useUiStore } from '../state/ui.ts';
import type { Diff } from './edges.tsx';
import type { Shape } from './geometry.ts';
import { NameEditor } from './NameEditor.tsx';
import { NODE_SIZE, type NodeKindKey } from './sizes.ts';

export interface VarNodeData extends Record<string, unknown> {
  name: string;
  kind: VarKind;
  origin: Origin;
  shape: Shape;
  testId: string;
  diff?: Diff;
  linkSource?: boolean;
}
export type VarNode = Node<VarNodeData>;

function Handles({ id }: { id: string }) {
  const dropTarget = useConnection((c) => c.inProgress && c.fromNode.id !== id);
  return (
    <>
      <Handle type="source" position={Position.Right} className="node-handle" title="Drag to link" />
      {dropTarget && <Handle type="target" position={Position.Left} className="node-drop" isConnectableStart={false} />}
    </>
  );
}

function classes(base: string, data: VarNodeData, selected: boolean): string {
  return [
    'lnode',
    base,
    selected ? 'selected' : '',
    data.diff ? `diff-${data.diff}` : '',
    data.origin === 'ai-proposed' ? 'ai' : '',
    data.linkSource ? 'link-source' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function Label({ id, data, below }: { id: string; data: VarNodeData; below?: boolean }) {
  const renaming = useUiStore((s) => s.renamingId === id);
  return (
    <span className={below ? 'lnode-label below' : 'lnode-label'}>
      {renaming ? <NameEditor id={id} name={data.name} /> : data.name}
      {data.origin === 'ai-proposed' && (
        <span className="ai-tag" title="Proposed by the copilot; not yet confirmed">
          AI
        </span>
      )}
    </span>
  );
}

/** CLD variable (and SFD unquantified variable). */
export function VariableNode({ id, data, selected }: NodeProps<VarNode>) {
  return (
    <div
      className={classes(data.kind === 'variable' ? 'var' : `var kind-${data.kind}`, data, selected)}
      data-testid={data.testId}
    >
      <Label id={id} data={data} />
      <Handles id={id} />
    </div>
  );
}

export function SfdVariableNode({ id, data, selected }: NodeProps<VarNode>) {
  return (
    <div
      className={classes('sfd-var', data, selected)}
      data-testid={data.testId}
      title="Not quantified yet: choose a kind in the Inspector"
    >
      <Label id={id} data={data} />
      <Handles id={id} />
    </div>
  );
}

export function StockNode({ id, data, selected }: NodeProps<VarNode>) {
  return (
    <div className={classes('stock', data, selected)} data-testid={data.testId}>
      <Label id={id} data={data} />
      <Handles id={id} />
    </div>
  );
}

const GLYPH: Record<string, ReactNode> = {
  flow: (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="M3,6 L25,22 L25,6 L3,22 Z" className="glyph-fill" />
      <line x1="14" y1="14" x2="14" y2="2" className="glyph-stroke" />
    </svg>
  ),
  aux: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" className="glyph-fill" />
    </svg>
  ),
  constant: (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11,1 L21,11 L11,21 L1,11 Z" className="glyph-fill" />
    </svg>
  ),
  lookup: (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="11" className="glyph-fill" />
      <path d="M7,15 C9,9 12,9 13,13 C14,17 17,17 19,11" className="glyph-stroke" />
    </svg>
  ),
};

/** Flow valve, auxiliary, constant and lookup: a small glyph with the name underneath. */
export function GlyphNode({ id, data, selected }: NodeProps<VarNode>) {
  const size = NODE_SIZE[data.kind as NodeKindKey] ?? NODE_SIZE.aux;
  return (
    <div
      className={classes(`glyph kind-${data.kind}`, data, selected)}
      data-testid={data.testId}
      style={{ width: size.w, height: size.h }}
    >
      {GLYPH[data.kind]}
      <Label id={id} data={data} below />
      <Handles id={id} />
    </div>
  );
}

export function CloudNode({ data }: NodeProps<Node<{ testId: string; shape: Shape }>>) {
  return (
    <div className="lnode cloud" data-testid={data.testId} title="Outside the model boundary (source or sink)">
      <svg viewBox="0 0 40 26" aria-hidden="true">
        <path
          d="M10,22 C3,22 2,14 8,13 C7,7 14,4 18,8 C20,3 29,3 30,10 C36,9 39,15 35,19 C35,22 32,22 30,22 Z"
          className="glyph-stroke"
        />
      </svg>
      <Handle type="source" position={Position.Right} className="node-handle hidden" isConnectable={false} />
    </div>
  );
}

/** Copilot proposal preview: not part of the model until accepted. */
export function GhostNode({ data }: NodeProps<VarNode>) {
  return (
    <div className="lnode ghost" data-testid={data.testId} title="Proposed by the copilot (pending review)">
      <span className="lnode-label">
        {data.name}
        <span className="ai-tag">AI</span>
      </span>
      <Handle type="source" position={Position.Right} className="node-handle hidden" isConnectable={false} />
    </div>
  );
}
