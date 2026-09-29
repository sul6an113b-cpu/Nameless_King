/**
 * Everything rendered inside <ReactFlow> besides nodes/edges: the stage toolbar, keyboard shortcuts
 * (SPEC §8), the non-modal shortcut sheet, and the PNG/SVG exporter.
 */
import { useEffect } from 'react';
import { Panel, getNodesBounds, getViewportForBounds, useReactFlow, useStore, type Node } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';
import type { VarKind, XY } from '@looplab/core';
import { isEditable } from '../lib/dom.ts';
import { downloadDataUrl, fileStem } from '../lib/files.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { addVariableAt, autoLayout, deleteSelection, flipSelectedPolarity, toggleSelectedDelay } from './actions.ts';
import { registerExporter } from './exporter.ts';
import { freeSpot } from './placement.ts';

type Lens = 'cld' | 'sfd';

/** Flow-space drop point for a new node: the free spot nearest the centre of the visible canvas. */
function useDropPoint(): () => XY {
  const { getViewport, getNodes } = useReactFlow();
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  return () => {
    const vp = getViewport();
    const centre = { x: (width / 2 - vp.x) / vp.zoom - 60, y: (height / 2 - vp.y) / vp.zoom - 18 };
    return freeSpot(
      centre,
      getNodes().map((n) => n.position),
    );
  };
}

function useLayoutAndFit(lens: Lens) {
  const { getNodes, getEdges, fitView } = useReactFlow();
  return async () => {
    const edges = getEdges().filter((e) => !e.id.startsWith('ghost:'));
    if (await autoLayout(lens, getNodes(), edges)) setTimeout(() => void fitView({ padding: 0.2, duration: 200 }), 50);
  };
}

const SFD_ADD: { kind: VarKind; label: string; key?: string }[] = [
  { kind: 'stock', label: 'Stock' },
  { kind: 'flow', label: 'Flow' },
  { kind: 'aux', label: 'Auxiliary' },
  { kind: 'constant', label: 'Constant' },
  { kind: 'lookup', label: 'Lookup' },
];

export function CanvasToolbar({ lens }: { lens: Lens }) {
  const { fitView } = useReactFlow();
  const center = useDropPoint();
  const layout = useLayoutAndFit(lens);
  const linkMode = useUiStore((s) => s.linkMode);
  const linkSource = useUiStore((s) => s.linkSource);
  const shortcutsOpen = useUiStore((s) => s.shortcutsOpen);
  const sourceName = useModelStore((s) => s.model.variables.find((v) => v.id === linkSource)?.name);

  return (
    <>
      <Panel position="top-left" className="canvas-toolbar" aria-label="Canvas tools">
        {lens === 'cld' ? (
          <button
            type="button"
            className="btn primary"
            data-testid="btn-add-variable"
            title="Add variable (A)"
            onClick={() => addVariableAt('variable', center())}
          >
            + Variable
          </button>
        ) : (
          SFD_ADD.map((a) => (
            <button
              key={a.kind}
              type="button"
              className="btn"
              data-testid={`btn-add-${a.kind}`}
              title={`Add ${a.label.toLowerCase()}`}
              onClick={() => addVariableAt(a.kind, center())}
            >
              + {a.label}
            </button>
          ))
        )}
        <span className="toolbar-sep" />
        <button
          type="button"
          className={linkMode ? 'btn active' : 'btn'}
          aria-pressed={linkMode}
          data-testid="btn-link-mode"
          title="Link mode (L): click a cause, then its effect"
          onClick={() => useUiStore.getState().setLinkMode(!linkMode)}
        >
          Link
        </button>
        <button
          type="button"
          className="btn"
          data-testid="btn-auto-layout"
          title="Auto-layout (Shift+L)"
          onClick={() => void layout()}
        >
          Auto-layout
        </button>
        <button
          type="button"
          className="btn"
          title="Fit view (F)"
          onClick={() => void fitView({ padding: 0.2, duration: 200 })}
        >
          Fit
        </button>
        <button
          type="button"
          className={shortcutsOpen ? 'btn active' : 'btn'}
          aria-pressed={shortcutsOpen}
          title="Keyboard shortcuts (?)"
          onClick={() => useUiStore.getState().setShortcutsOpen(!shortcutsOpen)}
        >
          ?
        </button>
      </Panel>
      {linkMode && (
        <Panel position="bottom-center" className="canvas-hint" role="status">
          {linkSource
            ? `Linking from “${sourceName ?? ''}”: click the effect`
            : 'Link mode: click a cause, then its effect'}{' '}
          · Esc to exit
        </Panel>
      )}
      {shortcutsOpen && <ShortcutSheet lens={lens} />}
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ['A', 'Add variable'],
  ['L', 'Link mode'],
  ['P', 'Flip polarity of selected link'],
  ['D', 'Toggle delay on selected link'],
  ['Del / Backspace', 'Delete selection'],
  ['Enter', 'Rename selected variable'],
  ['⌘/Ctrl+Z', 'Undo'],
  ['⇧⌘Z / Ctrl+Y', 'Redo'],
  ['Shift+L', 'Auto-layout'],
  ['F', 'Fit view'],
  ['?', 'This sheet'],
  ['Esc', 'Cancel / clear selection'],
];

function ShortcutSheet({ lens }: { lens: Lens }) {
  return (
    <Panel position="top-right" className="shortcut-sheet" aria-label="Keyboard shortcuts">
      <div className="sheet-head">
        <strong>Shortcuts</strong>
        <button
          type="button"
          className="btn ghost"
          aria-label="Close shortcuts"
          onClick={() => useUiStore.getState().setShortcutsOpen(false)}
        >
          ×
        </button>
      </div>
      <dl>
        {SHORTCUTS.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{k === 'A' && lens === 'sfd' ? 'Add auxiliary' : v}</dd>
          </div>
        ))}
      </dl>
      <p className="muted small">Drag from the dot on a node’s edge to link it. Double-click a name to rename.</p>
    </Panel>
  );
}

/** Map/Quantify shortcuts; ignored while typing in a field. Undo/redo are global (App). */
export function CanvasKeys({ lens }: { lens: Lens }) {
  const { fitView } = useReactFlow();
  const center = useDropPoint();
  const layout = useLayoutAndFit(lens);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const ui = useUiStore.getState();
      const k = e.key;
      const lower = k.toLowerCase();
      let handled = true;
      if (lower === 'l' && e.shiftKey) void layout();
      else if (lower === 'l') ui.setLinkMode(!ui.linkMode);
      else if (lower === 'a') addVariableAt(lens === 'cld' ? 'variable' : 'aux', center());
      else if (lower === 'p') flipSelectedPolarity();
      else if (lower === 'd') toggleSelectedDelay();
      else if (lower === 'f') void fitView({ padding: 0.2, duration: 200 });
      else if (k === 'Delete' || k === 'Backspace') deleteSelection();
      else if (k === '?') ui.setShortcutsOpen(!ui.shortcutsOpen);
      else if (k === 'Enter' || k === 'F2') {
        const [only] = ui.selection;
        const isVar = only !== undefined && useModelStore.getState().model.variables.some((v) => v.id === only);
        if (ui.selection.length === 1 && isVar) ui.setRenaming(only);
        else handled = false;
      } else if (k === 'Escape') {
        if (ui.linkMode) ui.setLinkMode(false);
        else if (ui.shortcutsOpen) ui.setShortcutsOpen(false);
        else ui.select([]);
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lens, fitView, center, layout]);

  return null;
}

const excludeFromExport = (el: HTMLElement): boolean => {
  const cl = el.classList as DOMTokenList | undefined;
  return !(cl?.contains('react-flow__handle') || cl?.contains('ghost') || cl?.contains('diff-added'));
};

/** Registers the PNG/SVG exporter of this canvas (html-to-image on the React Flow viewport). */
export function CanvasExporter({ lens }: { lens: Lens }) {
  const { getNodes } = useReactFlow();
  useEffect(
    () =>
      registerExporter(async (format) => {
        const viewport = document.querySelector<HTMLElement>(`[data-testid="canvas-${lens}"] .react-flow__viewport`);
        const nodes: Node[] = getNodes().filter((n) => n.type !== 'ghost');
        if (!viewport || nodes.length === 0) {
          useUiStore.getState().toast('Nothing to export yet');
          return;
        }
        const bounds = getNodesBounds(nodes);
        const pad = 48;
        const width = Math.min(4000, Math.ceil(bounds.width + pad * 2));
        const height = Math.min(4000, Math.ceil(bounds.height + pad * 2 + 40));
        const vp = getViewportForBounds(bounds, width, height, 0.1, 1, 0.08);
        const background = getComputedStyle(document.body).backgroundColor;
        const options = {
          backgroundColor: background,
          width,
          height,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
          },
          filter: excludeFromExport,
        };
        try {
          const url = format === 'png' ? await toPng(viewport, options) : await toSvg(viewport, options);
          const name = fileStem(useModelStore.getState().model.name);
          downloadDataUrl(`${name}-${lens === 'cld' ? 'cld' : 'sfd'}.${format}`, url);
          useUiStore.getState().toast(`Exported ${format.toUpperCase()}`, 'success');
        } catch (e) {
          useUiStore.getState().toast(`Export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        }
      }),
    [lens, getNodes],
  );
  return null;
}
