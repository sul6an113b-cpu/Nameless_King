/**
 * Acceptance criterion 6, end to end with the real compiler: the polarity-consistency check flags a deliberately
 * wrong drawn polarity. (Orchestrator-owned integration test; unit tests live in src/graph and src/sim.)
 */
import { describe, expect, it } from 'vitest';
import { addLink, addVariable, connectFlow, createEmptyModel, runHealth, updateLink, type Model } from '../../src/index.ts';

/** Backlog drains through Completion = Backlog / Duration: a first-order balancing loop. */
function backlogModel(stockToFlowPolarity: '+' | '-'): Model {
  let m = createEmptyModel('Backlog drain', { id: 'm_pol', now: '2026-09-29T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_backlog', name: 'Backlog', kind: 'stock', equation: '100', units: 'tasks' });
  m = addVariable(m, { id: 'v_duration', name: 'Duration', kind: 'constant', equation: '4', units: 'month' });
  m = addVariable(m, {
    id: 'v_completion',
    name: 'Completion',
    kind: 'flow',
    equation: 'Backlog / Duration',
    units: 'tasks/month',
  });
  m = connectFlow(m, 'v_completion', { from: 'v_backlog' });
  m = addLink(m, { id: 'l_b_c', from: 'v_backlog', to: 'v_completion', polarity: stockToFlowPolarity });
  m = addLink(m, { id: 'l_d_c', from: 'v_duration', to: 'v_completion', polarity: '-' });
  return m;
}

const polarityItems = (m: Model) => runHealth(m).items.filter((i) => i.check === 'polarity');

describe('polarity consistency with the real compiler (AC6)', () => {
  it('accepts a model whose drawn polarities match the equations', () => {
    expect(polarityItems(backlogModel('+')).filter((i) => i.severity !== 'info')).toEqual([]);
  });

  it('flags a deliberately wrong polarity on Backlog → Completion', () => {
    const items = polarityItems(backlogModel('-')).filter((i) => i.severity !== 'info');
    expect(items).toHaveLength(1);
    expect(items[0]?.elementIds).toContain('l_b_c');
  });

  it('flags a wrong flow→stock sign (outflow drawn as +)', () => {
    const m = backlogModel('+');
    const outflowLink = m.links.find((l) => l.from === 'v_completion' && l.to === 'v_backlog');
    expect(outflowLink?.polarity).toBe('-');
    const wrong = updateLink(m, outflowLink?.id ?? '', { polarity: '+' });
    const items = polarityItems(wrong).filter((i) => i.severity !== 'info');
    expect(items.some((i) => i.elementIds.includes(outflowLink?.id ?? ''))).toBe(true);
  });
});
