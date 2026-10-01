import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { addLink, addVariable, connectFlow, createEmptyModel, type Model } from '@looplab/core';
import type { ChartSeries } from '../charts/align.ts';
import { LoopDominance } from './LoopDominance.tsx';

// uPlot draws on a canvas: the chart is checked in Playwright (e2e/ltm.spec.ts); here a stand-in records its props.
vi.mock('../charts/TimeSeriesChart.tsx', () => ({
  TimeSeriesChart: ({ series, yRange }: { series: ChartSeries[]; yRange?: [number, number] }) => (
    <div data-testid="fake-chart" data-yrange={yRange?.join(',') ?? ''}>
      {series.map((s) => `${s.label}[${s.slot}]`).join('; ')}
    </div>
  ),
}));

const NOW = '2026-01-01T00:00:00.000Z';

/** Stock `name` with one flow `flowName` (equation `eq`) that fills or drains it. */
function withStock(m: Model, n: number, name: string, flowName: string, eq: string, end: 'to' | 'from', initial = '100'): Model {
  let x = addVariable(m, { id: `v_s${n}`, name, kind: 'stock', equation: initial });
  x = addVariable(x, { id: `v_f${n}`, name: flowName, kind: 'flow', equation: eq, flow: { from: null, to: null } });
  x = connectFlow(x, `v_f${n}`, { [end]: `v_s${n}` });
  return addLink(x, { id: `l_${n}`, from: `v_s${n}`, to: `v_f${n}`, polarity: '+' });
}
const empty = () => createEmptyModel('T', { id: 'm_t', now: NOW });
const growth = () => withStock(empty(), 1, 'Pop', 'Births', 'Pop * 0.1', 'to');

describe('LoopDominance panel', () => {
  it('shows nothing for a model without feedback', () => {
    const { container } = render(<LoopDominance model={empty()} runSeq={1} />);
    expect(container.textContent).toBe('');
  });

  it('draws the loops under their handles with a fixed score axis, and keys them in a table', async () => {
    render(<LoopDominance model={growth()} runSeq={1} />);
    expect((await screen.findByTestId('fake-chart')).textContent).toBe('R1[0]');
    expect(screen.getByTestId('fake-chart').getAttribute('data-yrange')).toBe('-1.05,1.05');
    expect(screen.getByTestId('chart-ltm')).toBeTruthy();
    const table = screen.getByTestId('ltm-table').textContent ?? '';
    expect(table).toContain('R1');
    expect(table).toContain('Births → Pop');
    expect(table).toContain('100%'); // a lone loop explains everything
    expect(screen.queryByText(/Loop group/)).toBeNull(); // one group needs no heading
  });

  it('gives each group of loops that share stocks its own chart and table', async () => {
    const m = withStock(growth(), 2, 'Stock', 'Drain', 'Stock * 0.2', 'from');
    render(<LoopDominance model={m} runSeq={1} />);
    expect(await screen.findAllByTestId('fake-chart')).toHaveLength(2);
    expect(screen.getAllByTestId('ltm-table')).toHaveLength(2);
    expect(screen.getByText(/Loop group 1/)).toBeTruthy();
    expect(screen.getByText(/Loop group 2/)).toBeTruthy();
  });

  it('says so when nothing changes', () => {
    render(<LoopDominance model={withStock(empty(), 1, 'Pop', 'Births', 'Pop * 0.1', 'to', '0')} runSeq={1} />);
    expect(screen.getByTestId('ltm-idle').textContent).toMatch(/Nothing changes/);
    expect(screen.queryByTestId('chart-ltm')).toBeNull();
  });

  it('explains loops that never score', () => {
    let m = growth();
    m = addVariable(m, { id: 'v_leak', name: 'Leak', kind: 'flow', equation: '0 * Pop', flow: { from: null, to: null } });
    m = connectFlow(m, 'v_leak', { from: 'v_s1' });
    m = addLink(m, { id: 'l_leak', from: 'v_s1', to: 'v_leak', polarity: '+' });
    render(<LoopDominance model={m} runSeq={1} />);
    expect(screen.getByTestId('ltm-silent').textContent).toMatch(/score 0 throughout \(1\)/);
  });

  it('warns when the loop search was cut short', () => {
    const m = withStock(growth(), 2, 'Tank', 'Leak', 'Tank * 0.2', 'from');
    render(<LoopDominance model={{ ...m, settings: { ...m.settings, loopCap: 1 } }} runSeq={1} />);
    expect(screen.getByTestId('ltm-cap-warning').textContent).toMatch(/first 1 loops/);
  });

  it('reports a model that cannot run instead of crashing', () => {
    render(<LoopDominance model={withStock(empty(), 1, 'Pop', 'Births', 'Pop *', 'to')} runSeq={1} />);
    expect(screen.getByText(/Loop dominance failed/).textContent).toContain('Births');
  });

  it('recomputes when a new run arrives, not when the model is edited', () => {
    const { rerender } = render(<LoopDominance model={growth()} runSeq={1} />);
    expect(screen.getByTestId('ltm-table').textContent).toContain('Births');
    const idle = withStock(empty(), 1, 'Pop', 'Births', 'Pop * 0.1', 'to', '0');
    rerender(<LoopDominance model={idle} runSeq={1} />);
    expect(screen.queryByTestId('ltm-idle')).toBeNull();
    rerender(<LoopDominance model={idle} runSeq={2} />);
    expect(screen.getByTestId('ltm-idle')).toBeTruthy();
  });
});
