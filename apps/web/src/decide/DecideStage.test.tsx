import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { examples } from '@looplab/content';
import { createEmptyModel } from '@looplab/core';
import { loadModel } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { DecideStage } from './DecideStage.tsx';

const files = vi.hoisted(() => ({ downloads: [] as { name: string; data: string; type: string | undefined }[] }));
vi.mock('../lib/files.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../lib/files.ts')>();
  return {
    ...real,
    download: (name: string, data: Blob | string, type?: string) =>
      files.downloads.push({ name, data: typeof data === 'string' ? data : '[blob]', type }),
  };
});

const epc = () => {
  const ex = examples.find((e) => e.id === 'epc-rework');
  if (!ex) throw new Error('epc-rework example missing');
  return ex.model;
};
const model = () => useModelStore.getState().model;
const valueOf = (el: HTMLElement): string => (el as HTMLSelectElement).value;
const srcDoc = () => screen.getByTestId('report-preview').getAttribute('srcdoc') ?? '';

beforeEach(() => {
  files.downloads.length = 0;
  loadModel(epc());
});

describe('DecideStage', () => {
  it('shows the interventions with their Meadows level and linked scenario', () => {
    render(<DecideStage />);
    const first = screen.getByTestId('intervention-i_add_staff');
    expect(valueOf(within(first).getByTestId('intervention-level-i_add_staff'))).toBe('12');
    expect(valueOf(within(first).getByTestId('intervention-scenario-i_add_staff'))).toBe('s_add_staff');
    // an intervention with no scenario yet
    expect(valueOf(screen.getByTestId('intervention-scenario-i_honest_progress'))).toBe('');
  });

  it('offers all twelve Meadows levels, by name', () => {
    render(<DecideStage />);
    const options = within(screen.getByTestId('intervention-level-i_add_staff')).getAllByRole('option');
    expect(options).toHaveLength(12);
    expect(options.map((o) => o.getAttribute('value'))).toEqual(['12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1']);
    expect(options[0]?.textContent).toMatch(/^12 · Constants, parameters/);
  });

  it('stores the recommendation in model.decision and puts it in the report preview', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    const box = screen.getByTestId('decision-recommendation');
    await user.type(box, 'Hold design reviews at week 4.');
    await user.tab();
    expect(model().decision.recommendation).toBe('Hold design reviews at week 4.');
    expect(srcDoc()).toContain('Hold design reviews at week 4.');
  });

  it('adds an intervention, sets its level, links a scenario and marks it tested', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    const before = model().interventions.length;
    await user.click(screen.getByTestId('btn-add-intervention'));
    const added = model().interventions[before];
    expect(model().interventions).toHaveLength(before + 1);
    expect(added).toMatchObject({ leverage: 12, scenarioId: null, status: 'idea' });
    const id = added?.id ?? '';
    await user.selectOptions(screen.getByTestId(`intervention-level-${id}`), '6');
    await user.selectOptions(screen.getByTestId(`intervention-scenario-${id}`), 's_early_reviews');
    expect(model().interventions[before]).toMatchObject({ leverage: 6, scenarioId: 's_early_reviews', status: 'tested' });
    await user.selectOptions(screen.getByTestId(`intervention-scenario-${id}`), '');
    expect(model().interventions[before]).toMatchObject({ scenarioId: null, status: 'idea' });
  });

  it('adds a scenario (name + one constant override) and an intervention can link to it', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    const before = model().scenarios.length;
    await user.type(screen.getByTestId('scenario-name'), 'Bigger team');
    await user.selectOptions(screen.getByTestId('scenario-var'), 'v_staff');
    await user.type(screen.getByTestId('scenario-value'), '14');
    await user.click(screen.getByTestId('btn-add-scenario'));
    expect(model().scenarios).toHaveLength(before + 1);
    const added = model().scenarios[before];
    expect(added).toMatchObject({ name: 'Bigger team', origin: 'user', overrides: [{ varId: 'v_staff', equation: '14' }] });
    // the form clears, and the new scenario is offered to interventions and compared with the baseline
    expect(valueOf(screen.getByTestId('scenario-name'))).toBe('');
    await user.selectOptions(screen.getByTestId('intervention-scenario-i_honest_progress'), added?.id ?? '');
    expect(model().interventions.find((i) => i.id === 'i_honest_progress')).toMatchObject({ scenarioId: added?.id, status: 'tested' });
    expect(within(screen.getByTestId('kpi-comparison')).getByText('Bigger team')).toBeTruthy();
  });

  it('refuses a scenario without a name or a numeric value and changes nothing', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    const before = model().scenarios.length;
    await user.type(screen.getByTestId('scenario-value'), '14');
    await user.click(screen.getByTestId('btn-add-scenario'));
    expect(screen.getByTestId('scenario-error').textContent).toMatch(/name/);
    await user.type(screen.getByTestId('scenario-name'), 'X');
    await user.clear(screen.getByTestId('scenario-value'));
    await user.type(screen.getByTestId('scenario-value'), 'lots');
    await user.click(screen.getByTestId('btn-add-scenario'));
    expect(screen.getByTestId('scenario-error').textContent).toMatch(/number/);
    expect(model().scenarios).toHaveLength(before);
  });

  it('removes an intervention', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    await user.click(screen.getByRole('button', { name: 'Remove Add two engineers' }));
    expect(model().interventions.map((i) => i.id)).not.toContain('i_add_staff');
    expect(screen.queryByTestId('intervention-i_add_staff')).toBeNull();
  });

  it('compares every scenario with the baseline on the KPIs', () => {
    render(<DecideStage />);
    const table = screen.getByTestId('kpi-comparison');
    const heads = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(heads).toEqual(['KPI', 'Goal', 'Baseline', 'Add two engineers', 'Earlier design reviews', 'Plan for rework']);
    expect(within(table).getByText('True progress')).toBeTruthy();
    expect(table.textContent).toMatch(/better|worse/);
    expect(table.textContent).toContain('Hold design reviews earlier'); // the intervention tested in a scenario column
  });

  it('shows the report preview with every section, as a scriptless sandboxed frame', () => {
    render(<DecideStage />);
    const frame = screen.getByTestId('report-preview');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame.getAttribute('sandbox')).not.toMatch(/allow-scripts/);
    for (const h of ['Recommendation', 'Key loops', 'Leverage ranking', 'Evidence', 'Simulation results', 'Appendix'])
      expect(srcDoc()).toContain(`<h2>${h}</h2>`);
  });

  it('downloads the report as Markdown', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    await user.click(screen.getByTestId('btn-export-report'));
    expect(files.downloads).toHaveLength(1);
    const [d] = files.downloads;
    expect(d?.name).toMatch(/-decision-brief\.md$/);
    expect(d?.type).toBe('text/markdown');
    for (const h of ['## Recommendation', '## Key loops', '## Leverage ranking']) expect(d?.data).toContain(h);
    expect(d?.data).toContain('data:image/svg+xml');
  });

  it('prints the report frame (print to PDF)', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    const win = screen.getByTestId<HTMLIFrameElement>('report-preview').contentWindow;
    const print = vi.fn();
    Object.defineProperty(win, 'print', { value: print, configurable: true });
    Object.defineProperty(win, 'focus', { value: vi.fn(), configurable: true }); // jsdom does not implement focus()
    await user.click(screen.getByTestId('btn-print-report'));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('exports the chosen run as CSV', async () => {
    const user = userEvent.setup();
    render(<DecideStage />);
    await user.selectOptions(screen.getByTestId('csv-run'), '2');
    await user.click(screen.getByTestId('btn-export-results'));
    const [d] = files.downloads;
    expect(d?.name).toMatch(/earlier-design-reviews\.csv$/);
    expect(d?.type).toBe('text/csv');
    expect(d?.data.split('\n')[0]).toMatch(/^time,/);
    expect(d?.data.trim().split('\n').length).toBeGreaterThan(10);
  });

  it('says what is missing when there are no scenarios', () => {
    loadModel(createEmptyModel('Bare', { id: 'm_bare', now: '2026-01-01T00:00:00.000Z' }));
    render(<DecideStage />);
    expect(screen.getByTestId('no-scenarios')).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>('btn-export-report').disabled).toBe(false);
  });
});
