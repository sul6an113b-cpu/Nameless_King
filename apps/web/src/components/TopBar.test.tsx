import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addLink, addVariable, createEmptyModel, type Model } from '@looplab/core';
import { loadModel } from '../state/actions.ts';
import { openModelText, saveModelFile } from '../state/fileOps.ts';
import { useModelStore } from '../state/store.ts';
import { useUiStore } from '../state/ui.ts';
import { TopBar } from './TopBar.tsx';
import { FileErrorBanner } from './Shell.tsx';

// Example models belong to methodologist; a fake keeps this test stable across the merge.
const example = vi.hoisted(() => ({ list: [] as { id: string; title: string; description: string; model: Model }[] }));
vi.mock('@looplab/content', () => ({
  get examples() {
    return example.list;
  },
}));

function exampleModel(): Model {
  let m = createEmptyModel('EPC rework', { id: 'm_ex', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_w', name: 'Work to do' });
  m = addVariable(m, { id: 'v_r', name: 'Rework' });
  return addLink(m, { id: 'l_wr', from: 'v_w', to: 'v_r' });
}

const m = () => useModelStore.getState().model;

beforeEach(() => {
  example.list = [];
  loadModel(createEmptyModel('Untitled model', { id: 'm_u', now: '2026-01-01T00:00:00.000Z' }));
  useUiStore.setState({ stage: 'frame', fileError: null, toasts: [], saveStatus: 'idle' });
});
afterEach(() => vi.restoreAllMocks());

describe('file operations', () => {
  it('opens a valid model file (migrated, laid out) and replaces the model', () => {
    const json = JSON.stringify(exampleModel());
    expect(openModelText(json, 'rework.looplab.json')).toBe(true);
    expect(m().name).toBe('EPC rework');
    expect(Object.keys(m().layout.cld).sort()).toEqual(['v_r', 'v_w']); // auto-laid out on open
    expect(useModelStore.getState().past).toHaveLength(0);
    expect(useUiStore.getState().toasts.at(-1)?.text).toMatch(/Opened “EPC rework”/);
  });

  it('an invalid file changes nothing and is reported inline with its issues', () => {
    const before = m();
    expect(openModelText('{not json', 'x.json')).toBe(false);
    expect(useUiStore.getState().fileError?.message).toMatch(/not valid JSON/);
    const bad = { ...exampleModel(), links: [{ id: 'l_x', from: 'v_w', to: 'v_missing' }] };
    expect(openModelText(JSON.stringify(bad), 'bad.json')).toBe(false);
    expect(m()).toBe(before);
    render(<FileErrorBanner />);
    const banner = screen.getByTestId('file-error');
    expect(banner.textContent).toMatch(/bad\.json: The model file is not valid\..*Nothing was changed/);
    expect(banner.textContent).toMatch(/does not exist/);
  });

  it('rejects a file from a newer LoopLab', () => {
    expect(openModelText(JSON.stringify({ ...exampleModel(), schemaVersion: 7 }), 'new.json')).toBe(false);
    expect(useUiStore.getState().fileError?.message).toMatch(/newer LoopLab/);
  });

  it('save downloads the model as JSON (stamped) that opens back identically', async () => {
    loadModel(exampleModel());
    const blobs: Blob[] = [];
    Object.assign(URL, { createObjectURL: (b: Blob) => (blobs.push(b), 'blob:x'), revokeObjectURL: () => {} });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    saveModelFile();
    expect(click).toHaveBeenCalledOnce();
    const text = await blobs[0].text();
    const saved = JSON.parse(text) as Model;
    expect(saved.variables).toEqual(m().variables);
    expect(openModelText(text, 'roundtrip.json')).toBe(true);
    expect(m().variables).toEqual(saved.variables);
    expect(m().links).toEqual(saved.links);
  });
});

describe('top bar', () => {
  it('shows the save status, and undo/redo reflect the history', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    expect(screen.getByTestId('save-status').textContent).toBe('Autosave on');
    expect(screen.getByTestId<HTMLButtonElement>('btn-undo').disabled).toBe(true);
    await user.click(screen.getByTestId('model-name'));
    await user.clear(screen.getByRole('textbox', { name: 'Model name' }));
    await user.type(screen.getByRole('textbox', { name: 'Model name' }), 'Plant X{Enter}');
    expect(m().name).toBe('Plant X');
    expect(screen.getByTestId('btn-undo').getAttribute('title')).toMatch(/Undo Rename model/);
    await user.click(screen.getByTestId('btn-undo'));
    expect(m().name).toBe('Untitled model');
    await user.click(screen.getByTestId('btn-redo'));
    expect(m().name).toBe('Plant X');
  });

  it('examples menu: calm note while the library is empty', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(screen.getByTestId('examples-menu'));
    expect(screen.getByText(/example library is available after integration/)).toBeTruthy();
  });

  it('examples menu: opening an example loads it and goes to Map', async () => {
    example.list = [{ id: 'epc-rework', title: 'EPC rework cycle', description: 'Rework', model: exampleModel() }];
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(screen.getByTestId('examples-menu'));
    await user.click(screen.getByTestId('example-epc-rework'));
    expect(m().name).toBe('EPC rework');
    expect(useUiStore.getState().stage).toBe('map');
  });

  it('theme toggle switches between light and dark explicitly', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ theme: 'system' });
    render(<TopBar />);
    await user.click(screen.getByTestId('theme-toggle')); // system is light in jsdom → dark
    expect(useUiStore.getState().theme).toBe('dark');
    await user.click(screen.getByTestId('theme-toggle'));
    expect(useUiStore.getState().theme).toBe('light');
  });

  it('diagram export is disabled until a canvas is shown', async () => {
    const user = userEvent.setup();
    render(<TopBar />);
    await user.click(screen.getByTestId('file-menu'));
    expect(screen.getByTestId<HTMLButtonElement>('export-png').disabled).toBe(true);
    expect(screen.getByText(/Open Map or Quantify to export/)).toBeTruthy();
  });
});
