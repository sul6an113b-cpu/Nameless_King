import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addVariable, createEmptyModel } from '@looplab/core';
import { App } from './App.tsx';
import { loadModel } from './state/actions.ts';
import { useModelStore } from './state/store.ts';
import { useUiStore } from './state/ui.ts';

beforeEach(() => {
  loadModel(createEmptyModel('Shell', { id: 'm_s', now: '2026-01-01T00:00:00.000Z' }));
  useUiStore.setState({ stage: 'frame', dockOpen: true, dockTab: 'inspector', theme: 'system', toasts: [] });
});

const TOOLS: Record<string, { present: string[]; absent: string[] }> = {
  frame: {
    present: ['frame-stage', 'kpi-card', 'boundary-card'],
    absent: ['canvas-cld', 'canvas-sfd', 'btn-simulate'],
  },
  map: { present: ['canvas-cld', 'btn-add-variable'], absent: ['canvas-sfd', 'health-panel', 'btn-simulate'] },
  quantify: { present: ['canvas-sfd', 'health-panel', 'btn-add-stock'], absent: ['canvas-cld', 'btn-add-variable'] },
  test: { present: ['btn-simulate'], absent: ['canvas-cld', 'canvas-sfd', 'health-panel'] },
};

describe('app shell', () => {
  it('each stage shows only its own tools, and the rail marks the current stage', async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const [stage, { present, absent }] of Object.entries(TOOLS)) {
      await user.click(screen.getByTestId(`stage-${stage}`));
      expect(screen.getByTestId(`stage-${stage}`).getAttribute('aria-current')).toBe('step');
      for (const id of present) expect(screen.getByTestId(id), `${stage}: ${id}`).toBeTruthy();
      for (const id of absent) expect(screen.queryByTestId(id), `${stage}: ${id}`).toBeNull();
    }
  });

  it('⌘/Ctrl+Z undoes and ⇧⌘Z / Ctrl+Y redo, but not while typing in a field', async () => {
    const user = userEvent.setup();
    render(<App />);
    useModelStore.getState().commit('add', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
    await user.keyboard('{Control>}z{/Control}');
    expect(useModelStore.getState().model.variables).toHaveLength(0);
    await user.keyboard('{Control>}y{/Control}');
    expect(useModelStore.getState().model.variables).toHaveLength(1);
    await user.keyboard('{Meta>}z{/Meta}');
    await user.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
    expect(useModelStore.getState().model.variables).toHaveLength(1);
    await user.click(screen.getByTestId('frame-problem'));
    await user.keyboard('{Control>}z{/Control}');
    expect(useModelStore.getState().model.variables).toHaveLength(1); // the field keeps native undo
  });

  it('the dock collapses and expands; its tabs switch between Inspector and Copilot', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('inspector')).toBeTruthy();
    await user.click(screen.getByTestId('tab-copilot'));
    expect(screen.getByTestId('copilot-panel')).toBeTruthy();
    await user.click(screen.getByTestId('dock-toggle'));
    expect(screen.queryByTestId('copilot-panel')).toBeNull();
    await user.click(screen.getByTestId('dock-toggle'));
    expect(screen.getByTestId('copilot-panel')).toBeTruthy();
  });

  it('no modal dialogs anywhere in the shell', async () => {
    const user = userEvent.setup();
    render(<App />);
    for (const stage of ['frame', 'map', 'analyze', 'quantify', 'test', 'decide']) {
      await user.click(screen.getByTestId(`stage-${stage}`));
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  });
});
