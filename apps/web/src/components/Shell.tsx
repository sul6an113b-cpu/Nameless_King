/** Workflow rail, right dock (Inspector | Copilot), toasts and the inline file-error banner. */
import { CopilotPanel } from '../copilot/index.ts';
import { STAGES } from '../stages.ts';
import { useUiStore } from '../state/ui.ts';
import { Inspector } from './Inspector.tsx';

export function Rail() {
  const stage = useUiStore((s) => s.stage);
  return (
    <nav className="rail" aria-label="Workflow stages">
      {STAGES.map((s, i) => (
        <button
          key={s.id}
          type="button"
          data-testid={`stage-${s.id}`}
          className={s.id === stage ? 'rail-item active' : 'rail-item'}
          aria-current={s.id === stage ? 'step' : undefined}
          title={`${s.label}: ${s.hint}`}
          onClick={() => useUiStore.getState().setStage(s.id)}
        >
          <span className="rail-num" aria-hidden="true">
            {i + 1}
          </span>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

export function Dock() {
  const tab = useUiStore((s) => s.dockTab);
  const set = useUiStore((s) => s.setDockTab);
  return (
    <aside className="dock" aria-label="Side panel">
      <div className="dock-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-inspector"
          aria-selected={tab === 'inspector'}
          aria-controls="dock-panel"
          data-testid="tab-inspector"
          onClick={() => set('inspector')}
        >
          Inspector
        </button>
        <button
          type="button"
          role="tab"
          id="tab-copilot"
          aria-selected={tab === 'copilot'}
          aria-controls="dock-panel"
          data-testid="tab-copilot"
          onClick={() => set('copilot')}
        >
          Copilot
        </button>
      </div>
      <div className="dock-body" id="dock-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'copilot' ? <CopilotPanel /> : <Inspector />}
      </div>
    </aside>
  );
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} data-testid="toast">
          <span>{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => useUiStore.getState().dismissToast(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function FileErrorBanner() {
  const error = useUiStore((s) => s.fileError);
  if (!error) return null;
  return (
    <div className="banner" role="alert" data-testid="file-error">
      <div>
        <strong>{error.message}</strong> Nothing was changed.
        {error.issues.length > 0 && (
          <ul>
            {error.issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="btn small" onClick={() => useUiStore.getState().setFileError(null)}>
        Dismiss
      </button>
    </div>
  );
}
