/**
 * The model is the source of truth for the canvas: nodes and edges are derived from it on every render.
 * React Flow's transient state lives here — measured sizes (kept so nodes stay visible), drag positions
 * (written back to the model once, on drag stop = one undo step) and selection (shared UI store).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Position, type Edge, type EdgeChange, type Node, type NodeChange, type OnNodeDrag } from '@xyflow/react';
import { getVariable, setLayout, type XY } from '@looplab/core';
import { act } from '../state/actions.ts';
import { useUiStore } from '../state/ui.ts';

export interface BaseNode {
  id: string;
  type: string;
  position: XY;
  data: Record<string, unknown>;
  size: { w: number; h: number };
  draggable?: boolean;
  selectable?: boolean;
  connectable?: boolean;
}

type Size = { width: number; height: number };

export function useDiagram(base: BaseNode[], baseEdges: Edge[], lens: 'cld' | 'sfd') {
  const selection = useUiStore((s) => s.selection);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [drag, setDrag] = useState<Record<string, XY>>({});
  const dragRef = useRef<Record<string, XY>>({});

  const nodes = useMemo(() => {
    const sel = new Set(selection);
    return base.map((n): Node => {
      const { size, ...rest } = n;
      const measured = sizes[n.id];
      return {
        ...rest,
        position: drag[n.id] ?? n.position,
        selected: sel.has(n.id),
        // Until React Flow has measured a node, give it a size and a handle so its edges can render.
        ...(measured
          ? { measured }
          : {
              initialWidth: size.w,
              initialHeight: size.h,
              // Both types: React Flow's first frame uses Strict mode before our Loose prop reaches its store.
              handles: [
                {
                  type: 'source' as const,
                  position: Position.Right,
                  x: size.w - 1,
                  y: size.h / 2,
                  width: 1,
                  height: 1,
                },
                { type: 'target' as const, position: Position.Left, x: 0, y: size.h / 2, width: 1, height: 1 },
              ],
            }),
      };
    });
  }, [base, selection, sizes, drag]);

  const edges = useMemo(() => {
    const sel = new Set(selection);
    return baseEdges.map((e) => (sel.has(e.id) ? { ...e, selected: true } : e));
  }, [baseEdges, selection]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const dims: Record<string, Size> = {};
    const pos: Record<string, XY> = {};
    const sel: { id: string; selected: boolean }[] = [];
    for (const c of changes) {
      if (c.type === 'dimensions' && c.dimensions) dims[c.id] = c.dimensions;
      else if (c.type === 'position' && c.position) pos[c.id] = c.position;
      else if (c.type === 'select') sel.push({ id: c.id, selected: c.selected });
    }
    if (Object.keys(dims).length > 0) setSizes((s) => ({ ...s, ...dims }));
    if (Object.keys(pos).length > 0) {
      dragRef.current = { ...dragRef.current, ...pos };
      setDrag(dragRef.current);
    }
    if (sel.length > 0) useUiStore.getState().applySelection(sel);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const sel = changes.flatMap((c) => (c.type === 'select' ? [{ id: c.id, selected: c.selected }] : []));
    if (sel.length > 0) useUiStore.getState().applySelection(sel);
  }, []);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node, dragged) => {
      const positions: Record<string, XY> = {};
      for (const n of dragged.length > 0 ? dragged : [node]) {
        const p = dragRef.current[n.id] ?? n.position;
        positions[n.id] = { x: Math.round(p.x), y: Math.round(p.y) };
      }
      act('Move', (m) => {
        const known = Object.fromEntries(Object.entries(positions).filter(([id]) => getVariable(m, id)));
        return Object.keys(known).length > 0 ? setLayout(m, lens, known) : m;
      });
      dragRef.current = {};
      setDrag({});
    },
    [lens],
  );

  return { nodes, edges, onNodesChange, onEdgesChange, onNodeDragStop };
}

/** Grid slots for nodes that have no stored position yet (new, imported, or copilot-added). */
export function fallbackPositions(
  ids: string[],
  placed: XY[],
  opts: { columns?: number; dx?: number; dy?: number; beside?: boolean } = {},
): Record<string, XY> {
  const { columns = 4, dx = 180, dy = 90, beside = false } = opts;
  const minX = placed.length ? Math.min(...placed.map((p) => p.x)) : 0;
  const minY = placed.length ? Math.min(...placed.map((p) => p.y)) : 0;
  const maxX = placed.length ? Math.max(...placed.map((p) => p.x)) : -dx;
  const maxY = placed.length ? Math.max(...placed.map((p) => p.y)) : -dy;
  const out: Record<string, XY> = {};
  ids.forEach((id, k) => {
    out[id] = beside
      ? { x: maxX + dx + Math.floor(k / 6) * dx, y: minY + (k % 6) * dy }
      : { x: minX + (k % columns) * dx, y: maxY + dy + Math.floor(k / columns) * dy };
  });
  return out;
}
