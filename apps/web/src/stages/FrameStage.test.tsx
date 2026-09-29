import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act as rtlAct, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addLink, addVariable, createEmptyModel, type BoundaryChart, type Model } from '@looplab/core';
import { loadModel } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { FrameStage } from './FrameStage.tsx';

// boundaryChart/findLoops belong to graph-analyst: pin their contract with fakes (stable across the merge).
const graph = vi.hoisted(() => ({ available: true }));
vi.mock('@looplab/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@looplab/core')>();
  return {
    ...core,
    findLoops: () => {
      if (!graph.available) throw new core.NotImplementedError('graph.findLoops');
      return { loops: [], truncated: false, cap: 1000 };
    },
    boundaryChart: (m: Model): BoundaryChart => ({
      endogenous: ['v_a', 'v_b'],
      exogenous: ['v_c'],
      excluded: m.frame.excluded,
    }),
  };
});

function model(): Model {
  let m = createEmptyModel('F', { id: 'm_f', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'Backlog' });
  m = addVariable(m, { id: 'v_b', name: 'Rework' });
  m = addVariable(m, { id: 'v_c', name: 'Scope' });
  m = addLink(m, { id: 'l_1', from: 'v_a', to: 'v_b' });
  return m;
}

const m = () => useModelStore.getState().model;
const labels = () => useModelStore.getState().past.map((p) => p.label);

beforeEach(() => {
  graph.available = true;
  loadModel(model());
  useUiStore.setState({ toasts: [] });
});

describe('Frame stage', () => {
  it('commits the problem statement on blur as a single undo step', async () => {
    const user = userEvent.setup();
    render(<FrameStage />);
    await user.type(screen.getByTestId('frame-problem'), 'Rework keeps the backlog high');
    expect(m().frame.problem).toBe(''); // still a draft while typing
    await user.tab();
    expect(m().frame.problem).toBe('Rework keeps the backlog high');
    expect(labels()).toEqual(['Edit problem']);
    rtlAct(() => useModelStore.getState().undo());
    expect(screen.getByTestId<HTMLTextAreaElement>('frame-problem').value).toBe(''); // draft follows undo
  });

  it('edits the horizon (simSpec) and refuses stop ≤ start without changing the model', async () => {
    const user = userEvent.setup();
    render(<FrameStage />);
    const stop = screen.getByTestId('horizon-stop');
    await user.clear(stop);
    await user.type(stop, '60{Enter}');
    await user.selectOptions(screen.getByTestId('horizon-unit'), 'week');
    expect(m().simSpec).toMatchObject({ start: 0, stop: 60, timeUnit: 'week' });
    await user.clear(stop);
    await user.type(stop, '-5{Enter}');
    expect(m().simSpec.stop).toBe(60);
    expect(useUiStore.getState().toasts.at(-1)?.text).toMatch(/stop time must be after/);
    await user.clear(stop);
    await user.type(stop, 'abc{Enter}');
    expect(screen.getByText('Enter a number')).toBeTruthy();
  });

  it('adds a KPI, links it to a variable and sets a target goal', async () => {
    const user = userEvent.setup();
    render(<FrameStage />);
    await user.click(screen.getByTestId('btn-add-kpi'));
    const card = screen.getByTestId('kpi-card');
    await user.selectOptions(within(card).getByLabelText('KPI variable'), 'v_a');
    await user.selectOptions(within(card).getByLabelText('Goal'), 'target');
    const target = within(card).getByLabelText('Target');
    await user.type(target, '0{Enter}');
    expect(m().frame.kpis[0]).toMatchObject({ name: 'KPI 1', varId: 'v_a', goal: 'target', target: 0 });
  });

  it('imports a reference mode from CSV and reports a bad file inline without changing the model', async () => {
    const user = userEvent.setup();
    render(<FrameStage />);
    const input = screen.getByTestId('refmode-file');
    await user.upload(
      input,
      new File(['time,Backlog (actual)\n0,10\n1,14\n2,21\n'], 'backlog.csv', { type: 'text/csv' }),
    );
    await screen.findByText('Backlog (actual)');
    expect(m().frame.referenceModes[0]).toMatchObject({
      source: 'data',
      label: 'historical',
      points: [
        [0, 10],
        [1, 14],
        [2, 21],
      ],
    });
    await user.upload(input, new File(['0,1\n0,2\n'], 'bad.csv', { type: 'text/csv' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/bad\.csv: Row 2: time must be strictly ascending/);
    expect(m().frame.referenceModes).toHaveLength(1);
  });

  it('opens the sketch pad inline (no dialog) and cancels it', async () => {
    const user = userEvent.setup();
    render(<FrameStage />);
    await user.click(screen.getByTestId('btn-sketch'));
    expect(screen.getByTestId('sketch-pad')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId<HTMLButtonElement>('sketch-save').disabled).toBe(true); // nothing drawn yet
    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('sketch-pad')).toBeNull();
  });

  it('boundary chart: derived endogenous/exogenous lists plus an editable excluded list', async () => {
    const user = userEvent.setup();
    render(<FrameStage />);
    expect(screen.getByTestId('boundary-endogenous').textContent).toContain('Backlog');
    expect(screen.getByTestId('boundary-exogenous').textContent).toContain('Scope');
    await user.type(screen.getByTestId('excluded-name'), 'Exchange rates{Enter}');
    expect(m().frame.excluded.map((b) => b.name)).toEqual(['Exchange rates']);
    await user.click(screen.getByLabelText('Remove Exchange rates'));
    expect(m().frame.excluded).toEqual([]);
  });

  it('boundary chart: calm note while loop analysis is not merged; excluded list still works', () => {
    graph.available = false;
    render(<FrameStage />);
    expect(screen.getByTestId('boundary-card').textContent).toMatch(/will be available after integration/);
    expect(screen.getByTestId('boundary-excluded')).toBeTruthy();
  });
});
