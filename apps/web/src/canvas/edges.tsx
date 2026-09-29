/**
 * Custom React Flow edges, drawn entirely in SVG so PNG/SVG export captures them:
 * - `causal`: CLD link or SFD information connector — curve, arrowhead, +/−/? sign, delay mark ‖,
 *   dashed when confidence is low; ghost/diff styling for copilot patch previews.
 * - `pipe`: SFD material flow between a stock/cloud and a flow valve.
 */
import { useInternalNode, type Edge, type EdgeProps, type InternalNode } from '@xyflow/react';
import type { Confidence, Origin, Polarity } from '@looplab/core';
import { arrowHead, curvedEdge, delayMark, pipeEdge, selfLoopEdge, type Box, type Shape } from './geometry.ts';

export type Diff = 'added' | 'changed' | 'removed';

export interface CausalEdgeData extends Record<string, unknown> {
  polarity: Polarity;
  delay: boolean;
  confidence: Confidence;
  origin: Origin;
  variant: 'cld' | 'connector';
  testId: string;
  diff?: Diff;
}
export type CausalEdgeType = Edge<CausalEdgeData, 'causal'>;

export interface PipeEdgeData extends Record<string, unknown> {
  arrow: boolean;
  diff?: Diff;
}
export type PipeEdgeType = Edge<PipeEdgeData, 'pipe'>;

const POLARITY_TEXT: Record<Polarity, string> = { '+': '+', '-': '−', '?': '?' };

function nodeBox(n: InternalNode | undefined): Box | null {
  if (!n) return null;
  const w = n.measured.width ?? n.initialWidth ?? 100;
  const h = n.measured.height ?? n.initialHeight ?? 36;
  const shape = ((n.data as { shape?: Shape } | undefined)?.shape ?? 'rect') satisfies Shape;
  return { x: n.internals.positionAbsolute.x, y: n.internals.positionAbsolute.y, w, h, shape };
}

export function CausalEdge({ source, target, data, selected }: EdgeProps<CausalEdgeType>) {
  const sb = nodeBox(useInternalNode(source));
  const tb = nodeBox(useInternalNode(target));
  if (!sb || !tb || !data) return null;
  const g = source === target ? selfLoopEdge(sb) : curvedEdge(sb, tb, data.variant === 'connector' ? 0.12 : 0.16);
  const cls = [
    'causal-edge',
    data.variant,
    data.polarity === '-' ? 'neg' : data.polarity === '?' ? 'unknown' : 'pos',
    data.confidence === 'low' ? 'low-confidence' : '',
    selected ? 'selected' : '',
    data.diff ? `diff-${data.diff}` : '',
    data.origin === 'ai-proposed' ? 'ai' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <g
      className={cls}
      data-testid={data.testId}
      data-polarity={data.polarity}
      data-delay={data.delay ? 'true' : 'false'}
    >
      <path d={g.d} className="edge-hit" />
      <path d={g.d} className="edge-line" />
      <path d={arrowHead(g.tip, g.dir)} className="edge-arrow" />
      {data.delay && <path d={delayMark(g.mid, g.midDir)} className="edge-delay" />}
      <circle cx={g.label.x} cy={g.label.y} r={10} className="edge-label-hit" />
      <text x={g.label.x} y={g.label.y} className="edge-polarity" textAnchor="middle" dominantBaseline="central">
        {POLARITY_TEXT[data.polarity]}
      </text>
    </g>
  );
}

export function PipeEdge({ source, target, data }: EdgeProps<PipeEdgeType>) {
  const sb = nodeBox(useInternalNode(source));
  const tb = nodeBox(useInternalNode(target));
  if (!sb || !tb) return null;
  const g = pipeEdge(sb, tb);
  return (
    <g className={`pipe-edge${data?.diff ? ` diff-${data.diff}` : ''}`}>
      <path d={g.walls[0]} className="pipe-wall" />
      <path d={g.walls[1]} className="pipe-wall" />
      {data?.arrow && <path d={arrowHead(g.tip, g.dir, 12, 7)} className="pipe-arrow" />}
    </g>
  );
}
