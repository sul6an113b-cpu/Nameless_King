import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import { App } from './App.tsx';
import { withLayout } from './lib/prepare.ts';
import { applyTheme, readThemeChoice } from './lib/theme.ts';
import { restoreLatest, startAutosave } from './state/persistence.ts';
import { useModelStore } from './state/store.ts';
import { useUiStore } from './state/ui.ts';
import './styles.css';

async function bootstrap(): Promise<void> {
  const theme = readThemeChoice();
  useUiStore.setState({ theme });
  applyTheme(theme);

  // Restore the model that was open last (IndexedDB autosave); a damaged record is reported, never fatal.
  const restored = await restoreLatest();
  if (restored.status === 'ok') {
    useModelStore.getState().load(withLayout(restored.model));
    useUiStore.getState().setSaveStatus('saved');
  } else if (restored.status === 'invalid') {
    useUiStore.getState().toast(`Could not restore the last session: ${restored.error}`, 'error');
  }
  startAutosave();

  // Dev server only (compiled out of production builds): lets Playwright checks drive the stores directly,
  // e.g. inject a synthetic run to test charts before the simulation engine is merged.
  if (import.meta.env.DEV) {
    const { useRunsStore } = await import('./state/runs.ts');
    Object.assign(window, { __looplab: { useModelStore, useUiStore, useRunsStore } });
  }

  const root = document.getElementById('root');
  if (!root) throw new Error('#root element missing');
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
