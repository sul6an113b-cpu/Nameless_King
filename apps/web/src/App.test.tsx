import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addVariable } from '@looplab/core';
import { App } from './App.tsx';
import { STAGES } from './stages.ts';
import { useModelStore } from './state/store.ts';

describe('app shell (harness)', () => {
  it('shows all six workflow stages and switches between them', async () => {
    render(<App />);
    for (const s of STAGES) expect(screen.getByTestId(`stage-${s.id}`)).toBeTruthy();
    await userEvent.click(screen.getByTestId('stage-map'));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Map');
  });

  it('store: commit is one undo step; undo/redo restore snapshots', () => {
    const { commit, undo, redo } = useModelStore.getState();
    commit('add', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
    expect(useModelStore.getState().model.variables).toHaveLength(1);
    undo();
    expect(useModelStore.getState().model.variables).toHaveLength(0);
    redo();
    expect(useModelStore.getState().model.variables).toHaveLength(1);
  });
});
