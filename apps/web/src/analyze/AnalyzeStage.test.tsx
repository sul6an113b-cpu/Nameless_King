import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { examples } from '@looplab/content';
import { addLink, findLoops, matchArchetypes, addVariable, createEmptyModel, type Model } from '@looplab/core';
import { loadModel } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { AnalyzeStage } from './AnalyzeStage.tsx';

vi.mock('../canvas/CldCanvas.tsx', () => ({ CldCanvas: () => <div data-testid="canvas-cld" /> }));

function ring(loopCap?: number): Model {
  let m = createEmptyModel('T', { id: 'm_t', now: '2026-01-01T00:00:00.000Z' });
  for (const [id, name] of [['v_a', 'A'], ['v_b', 'B'], ['v_c', 'C']] as const)
    m = addVariable(m, { id, name, kind: 'variable', equation: '1' });
  m = addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b', polarity: '+' });
  m = addLink(m, { id: 'l_ba', from: 'v_b', to: 'v_a', polarity: '+' });
  m = addLink(m, { id: 'l_bc', from: 'v_b', to: 'v_c', polarity: '+' });
  m = addLink(m, { id: 'l_cb', from: 'v_c', to: 'v_b', polarity: '-' });
  return loopCap ? { ...m, settings: { ...m.settings, loopCap } } : m;
}

describe('AnalyzeStage', () => {
  beforeEach(() => {
    useUiStore.setState({ selection: [] });
  });

  it('lists loops with R/B labels and highlights the chosen loop', async () => {
    loadModel(ring());
    render(<AnalyzeStage />);
    expect(screen.getByTestId('loop-list')).toBeTruthy();
    expect(screen.getByTestId('loop-type-0').textContent).toMatch(/^[RB]$/);
    const types = [0, 1].map((i) => screen.getByTestId(`loop-type-${i}`).textContent).sort();
    expect(types).toEqual(['B', 'R']);
    await userEvent.click(screen.getByTestId('loop-item-0'));
    expect(useUiStore.getState().selection).toContain('l_ab');
    expect(screen.queryByTestId('loop-cap-warning')).toBeNull();
    expect(screen.getByTestId('leverage-pareto')).toBeTruthy();
  });

  it('warns when the loop cap truncates the search', () => {
    loadModel(ring(1));
    render(<AnalyzeStage />);
    expect(screen.getByTestId('loop-cap-warning')).toBeTruthy();
  });

  it('confirms and rejects archetype candidates via the model', async () => {
    const withCandidate = examples
      .map((e) => e.model)
      .find((m) => matchArchetypes(m, findLoops(m).loops).length > 0);
    expect(withCandidate).toBeDefined();
    loadModel(withCandidate!);
    render(<AnalyzeStage />);
    await userEvent.click(screen.getByTestId('archetype-confirm-0'));
    expect(useModelStore.getState().model.archetypeFindings[0]?.status).toBe('confirmed');
    await userEvent.click(screen.getByTestId('archetype-reject-0'));
    expect(useModelStore.getState().model.archetypeFindings[0]?.status).toBe('rejected');
  });
});
