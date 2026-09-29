import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addLink, addVariable, createEmptyModel, type Model } from '@looplab/core';
import { loadModel } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { Inspector } from './Inspector.tsx';

function model(): Model {
  let m = createEmptyModel('I', { id: 'm_i', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'Backlog', kind: 'stock', equation: '100' });
  m = addVariable(m, { id: 'v_b', name: 'Rework', origin: 'ai-proposed' });
  m = addVariable(m, { id: 'v_f', name: 'Completion', kind: 'flow' });
  m = addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b' });
  return m;
}

const m = () => useModelStore.getState().model;
const labels = () => useModelStore.getState().past.map((p) => p.label);

beforeEach(() => {
  loadModel(model());
  useUiStore.setState({ stage: 'map', selection: [], toasts: [] });
});

describe('Inspector', () => {
  it('shows a stage tip and model summary when nothing is selected', () => {
    render(<Inspector />);
    expect(screen.getByTestId('inspector').textContent).toMatch(/Variables3Links1/);
  });

  it('edits a link: polarity, delay, confidence and mechanism, one undo step each', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ selection: ['l_ab'] });
    render(<Inspector />);
    expect(screen.getByText('Backlog')).toBeTruthy();
    await user.click(screen.getByTestId('polarity-neg'));
    await user.click(screen.getByTestId('link-delay'));
    await user.click(within(screen.getByRole('group', { name: 'Confidence' })).getByText('low'));
    await user.type(screen.getByLabelText('Mechanism'), 'More backlog, more rushed work');
    await user.tab();
    expect(m().links[0]).toMatchObject({
      polarity: '-',
      delay: true,
      confidence: 'low',
      note: 'More backlog, more rushed work',
    });
    expect(labels()).toEqual(['Set polarity', 'Toggle delay', 'Set confidence', 'Edit mechanism']);
    expect(screen.getByText(/drawn dashed/)).toBeTruthy();
  });

  it('renames a variable (commit on Enter) and rejects duplicate names without changing anything', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ selection: ['v_a'] });
    render(<Inspector />);
    const name = screen.getByTestId('inspector-name');
    await user.clear(name);
    await user.type(name, 'Engineering backlog{Enter}');
    expect(m().variables[0]?.name).toBe('Engineering backlog');
    await user.clear(name);
    await user.type(name, 'rework{Enter}');
    expect(m().variables[0]?.name).toBe('Engineering backlog');
    expect(useUiStore.getState().toasts.at(-1)?.kind).toBe('error');
    expect((name as HTMLInputElement).value).toBe('Engineering backlog'); // draft reverts
  });

  it('marks an AI-proposed element confirmed', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ selection: ['v_b'] });
    render(<Inspector />);
    expect(screen.getByText('AI-proposed')).toBeTruthy();
    await user.click(screen.getByTestId('btn-mark-confirmed'));
    expect(m().variables.find((v) => v.id === 'v_b')?.origin).toBe('ai-confirmed');
  });

  it('Quantify: switches kind and connects a flow to a stock (implied link maintained by core)', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ stage: 'quantify', selection: ['v_f'] });
    render(<Inspector />);
    await user.selectOptions(screen.getByTestId('flow-from'), 'v_a');
    expect(m().variables.find((v) => v.id === 'v_f')?.flow).toEqual({ from: 'v_a', to: null });
    expect(m().links.find((l) => l.from === 'v_f' && l.to === 'v_a')?.polarity).toBe('-');
    await user.selectOptions(screen.getByTestId('inspector-kind'), 'aux');
    expect(m().variables.find((v) => v.id === 'v_f')?.kind).toBe('aux');
    expect(screen.queryByTestId('flow-from')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Equation' })).toBeTruthy();
  });

  it('Quantify: a lookup gets a table editor whose invalid rows are not committed', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ stage: 'quantify', selection: ['v_b'] });
    render(<Inspector />);
    await user.selectOptions(screen.getByTestId('inspector-kind'), 'lookup');
    const editor = screen.getByTestId('lookup-editor');
    const y2 = within(editor).getByLabelText('y 2');
    await user.clear(y2);
    await user.type(y2, '5{Enter}');
    expect(m().variables.find((v) => v.id === 'v_b')?.graph).toMatchObject({ xs: [0, 1], ys: [0, 5] });
    const x2 = within(editor).getByLabelText('x 2');
    await user.clear(x2);
    await user.type(x2, '-1{Enter}');
    expect(within(editor).getByText(/x must be greater/)).toBeTruthy();
    expect(m().variables.find((v) => v.id === 'v_b')?.graph?.xs).toEqual([0, 1]);
    await user.click(within(editor).getByText('+ Row'));
    expect(within(editor).getByText(/x must be greater/)).toBeTruthy(); // still invalid: nothing committed
  });

  it('multi-selection offers one delete for everything selected', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ selection: ['v_a', 'l_ab'] });
    render(<Inspector />);
    await user.click(screen.getByText('Delete selected'));
    expect(m().variables.map((v) => v.id)).toEqual(['v_b', 'v_f']);
    expect(labels()).toEqual(['Delete 2 elements']);
  });
});
