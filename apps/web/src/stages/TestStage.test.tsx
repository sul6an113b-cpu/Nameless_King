import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addVariable, createEmptyModel, type CompileResult, type Model, type SimResult } from '@looplab/core';
import type { ChartSeries } from '../charts/align.ts';
import { loadModel } from '../state/actions.ts';
import { useRunsStore } from '../state/runs.ts';
import { useUiStore } from '../state/ui.ts';
import { TestStage } from './TestStage.tsx';

// compileModel belongs to sd-engine: a fake pins the SPEC §6.3 contract. Charts (canvas) are tested in Playwright.
const engine = vi.hoisted(() => ({ mode: 'ok', dtSeen: [] as number[] }));
vi.mock('@looplab/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@looplab/core')>();
  return {
    ...core,
    compileModel: (m: Model): CompileResult => {
      if (engine.mode === 'unavailable') throw new core.NotImplementedError('sim.compileModel');
      if (engine.mode === 'compile-error')
        return {
          ok: false,
          errors: [{ check: 'undefined', severity: 'error', message: 'Backlog has no equation', elementIds: ['v_s'] }],
        };
      const simulate = (): SimResult => {
        engine.dtSeen.push(m.simSpec.dt);
        const n = 5;
        const time = Float64Array.from({ length: n }, (_, i) => i);
        return {
          time,
          series: { v_s: time.map((t) => 100 - t), v_f: time.map(() => 1), v_p: time.map(() => 3) },
          spec: m.simSpec,
          assertions: [],
          warnings: [],
        };
      };
      return { ok: true, compiled: { varIds: [], index: {}, size: 0, simulate, evalVar: () => 0, deps: {} } };
    },
  };
});
vi.mock('../charts/TimeSeriesChart.tsx', () => ({
  TimeSeriesChart: ({ series, yLabel }: { series: ChartSeries[]; yLabel?: string }) => (
    <div data-testid="fake-chart" data-units={yLabel ?? ''}>
      {series.map((s) => `${s.label}[${s.slot}|${s.dash.join(',')}]`).join('; ')}
    </div>
  ),
}));

function model(): Model {
  let m = createEmptyModel('T', { id: 'm_t', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_s', name: 'Backlog', kind: 'stock', equation: '100', units: 'tasks' });
  m = addVariable(m, { id: 'v_f', name: 'Completion', kind: 'flow', equation: '1', units: 'tasks/month' });
  m = addVariable(m, { id: 'v_p', name: 'Staff', kind: 'constant', equation: '3', units: 'people' });
  return m;
}

beforeEach(() => {
  engine.mode = 'ok';
  loadModel(model());
  useRunsStore.setState({ runs: [], shown: [], slots: {}, nextSeq: 1 });
  useUiStore.setState({ stage: 'test', selection: [] });
});

describe('Test stage (basic run)', () => {
  it('runs the model (no worker in jsdom → same code on the main thread) and plots the stocks by default', async () => {
    const user = userEvent.setup();
    render(<TestStage />);
    await user.click(screen.getByTestId('btn-simulate'));
    await screen.findByTestId('fake-chart'); // the chart module is lazy-loaded
    expect(screen.getByTestId('chart-timeseries').textContent).toContain('Backlog');
    expect(screen.getAllByTestId('fake-chart')).toHaveLength(1);
    expect(screen.getByTestId('run-1')).toBeTruthy();
  });

  it('variables with different units get separate charts (never two y-scales on one axis)', async () => {
    const user = userEvent.setup();
    render(<TestStage />);
    await user.click(screen.getByTestId('btn-simulate'));
    await screen.findByTestId('fake-chart');
    await user.click(screen.getByLabelText('Staff'));
    const charts = await screen.findAllByTestId('fake-chart');
    expect(charts.map((c) => c.getAttribute('data-units'))).toEqual(['tasks', 'people']);
  });

  it('compares runs: each run keeps its dash pattern, each variable its colour', async () => {
    const user = userEvent.setup();
    render(<TestStage />);
    await user.click(screen.getByTestId('btn-simulate'));
    await screen.findByTestId('run-1');
    await user.click(screen.getByTestId('btn-simulate'));
    await screen.findByTestId('run-2');
    expect((await screen.findByTestId('fake-chart')).textContent).toBe('Backlog · Run 1[0|]; Backlog · Run 2[0|7,4]');
    await user.click(screen.getByLabelText('Show Run 1'));
    expect(screen.getByTestId('fake-chart').textContent).toBe('Backlog[0|7,4]');
  });

  it('DT and method are under Settings and apply to the next run', async () => {
    const user = userEvent.setup();
    render(<TestStage />);
    await user.click(screen.getByTestId('sim-settings'));
    await user.selectOptions(screen.getByTestId('sim-method'), 'rk4');
    const dt = screen.getByTestId('sim-dt');
    await user.clear(dt);
    await user.type(dt, '0.5{Enter}');
    await user.click(screen.getByTestId('btn-simulate'));
    await screen.findByTestId('run-1');
    expect(engine.dtSeen.at(-1)).toBe(0.5);
    expect(screen.getByTestId('run-1').textContent).toContain('RK4 DT 0.5');
  });

  it('compile errors are listed and "Show" jumps to the element in Quantify', async () => {
    engine.mode = 'compile-error';
    const user = userEvent.setup();
    render(<TestStage />);
    await user.click(screen.getByTestId('btn-simulate'));
    expect((await screen.findByRole('alert')).textContent).toContain('Backlog has no equation');
    await user.click(screen.getByText('Show'));
    expect(useUiStore.getState()).toMatchObject({ stage: 'quantify', selection: ['v_s'] });
  });

  it('shows a calm note while the engine is not merged', async () => {
    engine.mode = 'unavailable';
    const user = userEvent.setup();
    render(<TestStage />);
    await user.click(screen.getByTestId('btn-simulate'));
    expect(await screen.findByText(/Simulation will be available after integration/)).toBeTruthy();
  });
});
