import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addLink, addVariable, createEmptyModel, setLayout, type Model } from '@looplab/core';
import { loadModel } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { CldCanvas } from './CldCanvas.tsx';

function model(): Model {
  let m = createEmptyModel('CLD', { id: 'm_c', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'Work remaining' });
  m = addVariable(m, { id: 'v_b', name: 'Rework' });
  m = addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b', polarity: '+' });
  return setLayout(m, 'cld', { v_a: { x: 0, y: 0 }, v_b: { x: 300, y: 0 } });
}

const m = () => useModelStore.getState().model;
const link = () => m().links.find((l) => l.id === 'l_ab');

beforeEach(() => {
  loadModel(model());
  useUiStore.setState({
    stage: 'map',
    selection: [],
    renamingId: null,
    linkMode: false,
    linkSource: null,
    shortcutsOpen: false,
    toasts: [],
  });
});

// Node clicks use fireEvent: user-event's synthetic mousedown has no `view`, which d3-drag (inside React Flow)
// dereferences in jsdom. Real pointer interaction (drag, drag-to-link) is covered by the Playwright checks.
describe('CLD canvas', () => {
  it('renders every variable and link with the SPEC test ids and the polarity sign', () => {
    render(<CldCanvas />);
    expect(screen.getByTestId('canvas-cld')).toBeTruthy();
    expect(screen.getByTestId('node-v_a').textContent).toContain('Work remaining');
    expect(screen.getByTestId('node-v_b')).toBeTruthy();
    const edge = screen.getByTestId('edge-l_ab');
    expect(edge.getAttribute('data-polarity')).toBe('+');
    expect(edge.textContent).toBe('+');
  });

  it('A adds a variable at a free spot and starts renaming it inline; Enter commits the name', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    await user.keyboard('a');
    expect(m().variables).toHaveLength(3);
    const input = await screen.findByRole('textbox', { name: 'Variable name' });
    await user.clear(input);
    await user.type(input, 'Staff{Enter}');
    expect(m().variables.map((v) => v.name)).toContain('Staff');
    expect(useUiStore.getState().renamingId).toBeNull();
    // one step for the add, one for the rename
    expect(useModelStore.getState().past.map((p) => p.label)).toEqual(['Add variable', 'Rename variable']);
  });

  it('shortcuts are ignored while typing in a field', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    await user.click(screen.getByTestId('btn-add-variable'));
    const input = await screen.findByRole('textbox', { name: 'Variable name' });
    await user.type(input, 'apld');
    expect(m().variables).toHaveLength(3); // the typed "a" did not add another variable
    expect(useUiStore.getState().linkMode).toBe(false);
  });

  it('P flips polarity and D toggles the delay of the selected link; each is one undo step', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    useUiStore.getState().select(['l_ab']);
    await user.keyboard('p');
    expect(link()?.polarity).toBe('-');
    expect(screen.getByTestId('edge-l_ab').getAttribute('data-polarity')).toBe('-');
    await user.keyboard('d');
    expect(link()?.delay).toBe(true);
    expect(screen.getByTestId('edge-l_ab').querySelector('.edge-delay')).toBeTruthy();
    useModelStore.getState().undo();
    expect(link()).toMatchObject({ polarity: '-', delay: false });
  });

  it('P with nothing selected explains what to do instead of failing', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    await user.keyboard('p');
    expect(useUiStore.getState().toasts.at(-1)?.text).toMatch(/Select a link/);
  });

  it('Delete removes the whole multi-selection in one undo step', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    useUiStore.getState().select(['v_b', 'l_ab']);
    await user.keyboard('{Delete}');
    expect(m().variables.map((v) => v.id)).toEqual(['v_a']);
    expect(m().links).toHaveLength(0);
    useModelStore.getState().undo();
    expect(m().variables).toHaveLength(2);
    expect(m().links).toHaveLength(1);
  });

  it('L link mode: click cause then effect adds a + link; Esc leaves link mode', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    await user.keyboard('l');
    expect(useUiStore.getState().linkMode).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/click a cause/);
    fireEvent.click(screen.getByTestId('node-v_b'));
    expect(useUiStore.getState().linkSource).toBe('v_b');
    fireEvent.click(screen.getByTestId('node-v_a'));
    const back = m().links.find((l) => l.from === 'v_b' && l.to === 'v_a');
    expect(back).toMatchObject({ polarity: '+' });
    await user.keyboard('{Escape}');
    expect(useUiStore.getState().linkMode).toBe(false);
  });

  it('refuses a duplicate link with a readable message', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    await user.keyboard('l');
    fireEvent.click(screen.getByTestId('node-v_a'));
    fireEvent.click(screen.getByTestId('node-v_b'));
    expect(m().links).toHaveLength(1);
    expect(useUiStore.getState().toasts.at(-1)?.text).toBe('A link from "Work remaining" to "Rework" already exists');
  });

  it('double-click renames; Escape cancels without an undo step', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    fireEvent.doubleClick(screen.getByTestId('node-v_a'));
    const input = await screen.findByRole('textbox', { name: 'Variable name' });
    await user.type(input, 'xyz{Escape}');
    expect(m().variables[0]?.name).toBe('Work remaining');
    expect(useModelStore.getState().past).toHaveLength(0);
  });

  it('? toggles the non-modal shortcut sheet', async () => {
    const user = userEvent.setup();
    render(<CldCanvas />);
    await user.keyboard('?');
    const sheet = screen.getByLabelText('Keyboard shortcuts');
    expect(within(sheet).getByText('Flip polarity of selected link')).toBeTruthy();
    await user.keyboard('?');
    expect(screen.queryByLabelText('Keyboard shortcuts')).toBeNull();
  });
});
