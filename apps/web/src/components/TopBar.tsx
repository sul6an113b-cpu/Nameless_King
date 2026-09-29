/**
 * Top bar (SPEC §8): model name (inline rename), save status, undo/redo, file menu (new/open/save JSON,
 * PNG/SVG diagram export), examples menu, theme toggle, dock toggle. Menus are non-modal <details> popovers.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { examples } from '@looplab/content';
import { exportDiagram, useCanExportDiagram } from '../canvas/exporter.ts';
import { setModelName } from '../lib/edits.ts';
import { useEffectiveTheme } from '../lib/theme.ts';
import { act } from '../state/actions.ts';
import { newModel, openExample, openModelFile, saveModelFile } from '../state/fileOps.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore, type SaveStatus } from '../state/ui.ts';

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: 'Autosave on',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Autosave failed',
  unavailable: 'Autosave off',
};

/** Non-modal popover menu; closes on item click, outside click or Escape. */
function Menu({
  label,
  testId,
  children,
  title,
}: {
  label: ReactNode;
  testId: string;
  children: ReactNode;
  title?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = () => ref.current?.removeAttribute('open');
    const onDown = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <details className="menu" ref={ref}>
      <summary className="btn" data-testid={testId} title={title}>
        {label}
      </summary>
      <div
        className="menu-list"
        role="menu"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button:not(:disabled)')) ref.current?.removeAttribute('open');
        }}
      >
        {children}
      </div>
    </details>
  );
}

function ModelName() {
  const name = useModelStore((s) => s.model.name);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  if (editing)
    return (
      <input
        className="model-name-input"
        aria-label="Model name"
        autoFocus
        value={draft}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim() && draft.trim() !== name) act('Rename model', (m) => setModelName(m, draft));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(name);
            setEditing(false);
          }
        }}
      />
    );
  return (
    <button
      type="button"
      className="model-name"
      title="Rename model"
      data-testid="model-name"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      {name}
    </button>
  );
}

export function TopBar() {
  const saveStatus = useUiStore((s) => s.saveStatus);
  const dockOpen = useUiStore((s) => s.dockOpen);
  const past = useModelStore((s) => s.past);
  const future = useModelStore((s) => s.future);
  const canExport = useCanExportDiagram();
  const theme = useEffectiveTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const undoLabel = past[past.length - 1]?.label;
  const redoLabel = future[0]?.label;

  return (
    <header className="topbar">
      <span className="brand">
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 4a6 6 0 1 0 8 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M14 1.5v3.5h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        LoopLab
      </span>
      <ModelName />
      <span className="save-status" data-testid="save-status" data-status={saveStatus} role="status">
        {STATUS_TEXT[saveStatus]}
      </span>
      <span className="topbar-group">
        <button
          type="button"
          className="btn ghost icon"
          aria-label="Undo"
          data-testid="btn-undo"
          title={undoLabel ? `Undo ${undoLabel} (⌘/Ctrl+Z)` : 'Nothing to undo'}
          disabled={!undoLabel}
          onClick={() => useModelStore.getState().undo()}
        >
          ↶
        </button>
        <button
          type="button"
          className="btn ghost icon"
          aria-label="Redo"
          data-testid="btn-redo"
          title={redoLabel ? `Redo ${redoLabel} (⇧⌘Z / Ctrl+Y)` : 'Nothing to redo'}
          disabled={!redoLabel}
          onClick={() => useModelStore.getState().redo()}
        >
          ↷
        </button>
      </span>
      <span className="topbar-spacer" />
      <Menu label="Examples" testId="examples-menu" title="Open an example model">
        {examples.length === 0 ? (
          <p className="menu-note">The example library is available after integration.</p>
        ) : (
          examples.map((ex) => (
            <button
              key={ex.id}
              type="button"
              role="menuitem"
              data-testid={`example-${ex.id}`}
              onClick={() => openExample(ex.model, ex.title)}
            >
              {ex.title}
              <span className="menu-item-desc">{ex.description}</span>
            </button>
          ))
        )}
      </Menu>
      <Menu label="File" testId="file-menu">
        <>
          <button type="button" role="menuitem" data-testid="file-new" onClick={newModel}>
            New model
          </button>
          <button type="button" role="menuitem" data-testid="file-open" onClick={() => fileRef.current?.click()}>
            Open JSON…
          </button>
          <button type="button" role="menuitem" data-testid="file-save" onClick={saveModelFile}>
            Save JSON
          </button>
          <hr />
          <button
            type="button"
            role="menuitem"
            data-testid="export-png"
            disabled={!canExport}
            onClick={() => void exportDiagram('png')}
          >
            Export diagram as PNG
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="export-svg"
            disabled={!canExport}
            onClick={() => void exportDiagram('svg')}
          >
            Export diagram as SVG
          </button>
          {!canExport && <p className="menu-note">Open Map or Quantify to export a diagram.</p>}
        </>
      </Menu>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void openModelFile(f);
        }}
      />
      <button
        type="button"
        className="btn ghost icon"
        data-testid="theme-toggle"
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
        onClick={() => useUiStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      <button
        type="button"
        className={dockOpen ? 'btn ghost icon active' : 'btn ghost icon'}
        aria-label={dockOpen ? 'Hide side panel' : 'Show side panel'}
        aria-pressed={dockOpen}
        data-testid="dock-toggle"
        title="Inspector / Copilot panel"
        onClick={() => useUiStore.getState().setDockOpen(!dockOpen)}
      >
        ▤
      </button>
    </header>
  );
}
