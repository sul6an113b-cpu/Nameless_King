/**
 * Model → React Flow elements for both lenses (pure). CLD: every variable and link. SFD: `projectSfd` —
 * stocks, flow valves with pipes to stocks or clouds, auxiliaries/constants/lookups, information connectors.
 * Copilot ghosts are appended; changed/removed elements carry a diff flag.
 */
import type { Edge } from '@xyflow/react';
import { projectCld, projectSfd, type Id, type Model, type XY } from '@looplab/core';
import type { CausalEdgeData, PipeEdgeData } from './edges.tsx';
import { diffOf, type GhostOverlay } from './ghosts.ts';
import type { VarNodeData } from './nodes.tsx';
import { NODE_SIZE, type NodeKindKey } from './sizes.ts';
import { fallbackPositions, type BaseNode } from './useDiagram.ts';

function ghostNodes(overlay: GhostOverlay, lens: 'cld' | 'sfd', placed: XY[]): BaseNode[] {
  const size = NODE_SIZE.ghost;
  const layout = overlay.layout[lens];
  const unplaced = overlay.variables.filter((v) => !layout[v.id]).map((v) => v.id);
  const pos = fallbackPositions(unplaced, placed, { beside: true });
  return overlay.variables.map((v) => {
    const data: VarNodeData = {
      name: v.name,
      kind: v.kind,
      origin: 'ai-proposed',
      shape: size.shape,
      testId: `ghost-${v.id}`,
    };
    return {
      id: v.id,
      type: 'ghost',
      position: layout[v.id] ?? pos[v.id] ?? { x: 0, y: 0 },
      data,
      size,
      draggable: false,
      selectable: false,
      connectable: false,
    };
  });
}

function ghostEdges(overlay: GhostOverlay, variant: 'cld' | 'connector'): Edge[] {
  return overlay.links.map((l) => {
    const data: CausalEdgeData = {
      polarity: l.polarity,
      delay: l.delay,
      confidence: l.confidence,
      origin: 'ai-proposed',
      variant,
      testId: `ghost-edge-${l.id}`,
      diff: 'added',
    };
    return { id: `ghost:${l.id}`, source: l.from, target: l.to, type: 'causal', data, selectable: false };
  });
}

export function buildCld(
  model: Model,
  overlay: GhostOverlay | null,
  linkSource: string | null,
): { nodes: BaseNode[]; edges: Edge[] } {
  const proj = projectCld(model);
  const size = NODE_SIZE.variable;
  const placed = proj.nodes.flatMap((n) => (n.position ? [n.position] : []));
  const fallback = fallbackPositions(
    proj.nodes.filter((n) => !n.position).map((n) => n.id),
    placed,
  );
  const nodes: BaseNode[] = proj.nodes.map((n) => {
    const data: VarNodeData = {
      name: n.name,
      kind: n.kind,
      origin: n.origin,
      shape: size.shape,
      testId: `node-${n.id}`,
      diff: diffOf(overlay, n.id),
      linkSource: n.id === linkSource,
    };
    return { id: n.id, type: 'variable', position: n.position ?? fallback[n.id] ?? { x: 0, y: 0 }, data, size };
  });
  const edges: Edge[] = proj.edges.map((l) => {
    const data: CausalEdgeData = {
      polarity: l.polarity,
      delay: l.delay,
      confidence: l.confidence,
      origin: l.origin,
      variant: 'cld',
      testId: `edge-${l.id}`,
      diff: diffOf(overlay, l.id),
    };
    return { id: l.id, source: l.from, target: l.to, type: 'causal', data };
  });
  if (overlay) {
    nodes.push(...ghostNodes(overlay, 'cld', [...placed, ...Object.values(fallback)]));
    edges.push(...ghostEdges(overlay, 'cld'));
  }
  return { nodes, edges };
}

const SFD_TYPE: Record<string, NodeKindKey> = {
  stock: 'stock',
  flow: 'flow',
  aux: 'aux',
  constant: 'constant',
  lookup: 'lookup',
  variable: 'sfdvar',
};

/** Clouds sit beside their flow valve: sources to the left, sinks to the right. */
export const cloudId = (flowId: Id, end: 'from' | 'to'): string => `cloud:${flowId}:${end}`;

export function buildSfd(
  model: Model,
  overlay: GhostOverlay | null,
  linkSource: string | null,
): { nodes: BaseNode[]; edges: Edge[] } {
  const proj = projectSfd(model);
  const placed = proj.nodes.flatMap((n) => (n.position ? [n.position] : []));
  const fallback = fallbackPositions(
    proj.nodes.filter((n) => !n.position).map((n) => n.id),
    placed,
    { dx: 200, dy: 110 },
  );
  const posOf = new Map<Id, XY>();
  const nodes: BaseNode[] = proj.nodes.map((n) => {
    const type = SFD_TYPE[n.kind] ?? 'sfdvar';
    const size = NODE_SIZE[type];
    const position = n.position ?? fallback[n.id] ?? { x: 0, y: 0 };
    posOf.set(n.id, position);
    const data: VarNodeData = {
      name: n.name,
      kind: n.kind,
      origin: n.origin,
      shape: size.shape,
      testId: `node-${n.id}`,
      diff: diffOf(overlay, n.id),
      linkSource: n.id === linkSource,
    };
    return { id: n.id, type, position, data, size };
  });

  const edges: Edge[] = [];
  const cloud = NODE_SIZE.cloud;
  const valve = NODE_SIZE.flow;
  for (const p of proj.pipes) {
    const at = posOf.get(p.flowId) ?? { x: 0, y: 0 };
    const cy = at.y + valve.h / 2 - cloud.h / 2;
    const ends: ['from' | 'to', Id | null][] = [
      ['from', p.from],
      ['to', p.to],
    ];
    const endIds: Record<'from' | 'to', string> = { from: '', to: '' };
    for (const [end, stock] of ends) {
      if (stock !== null) {
        endIds[end] = stock;
        continue;
      }
      const id = cloudId(p.flowId, end);
      endIds[end] = id;
      nodes.push({
        id,
        type: 'cloud',
        position: { x: end === 'from' ? at.x - 110 : at.x + valve.w + 70, y: cy },
        data: { testId: `cloud-${p.flowId}-${end}`, shape: cloud.shape },
        size: cloud,
        draggable: false,
        selectable: false,
        connectable: false,
      });
    }
    const diff = diffOf(overlay, p.flowId);
    const inData: PipeEdgeData = { arrow: false, diff };
    const outData: PipeEdgeData = { arrow: true, diff };
    edges.push(
      {
        id: `pipe:${p.flowId}:in`,
        source: endIds.from,
        target: p.flowId,
        type: 'pipe',
        data: inData,
        selectable: false,
      },
      {
        id: `pipe:${p.flowId}:out`,
        source: p.flowId,
        target: endIds.to,
        type: 'pipe',
        data: outData,
        selectable: false,
      },
    );
  }

  for (const l of proj.connectors) {
    const data: CausalEdgeData = {
      polarity: l.polarity,
      delay: l.delay,
      confidence: l.confidence,
      origin: l.origin,
      variant: 'connector',
      testId: `edge-${l.id}`,
      diff: diffOf(overlay, l.id),
    };
    edges.push({ id: l.id, source: l.from, target: l.to, type: 'causal', data });
  }
  if (overlay) {
    nodes.push(...ghostNodes(overlay, 'sfd', [...posOf.values()]));
    edges.push(...ghostEdges(overlay, 'connector'));
  }
  return { nodes, edges };
}
