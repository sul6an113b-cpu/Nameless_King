import { describe, expect, it } from 'vitest';
import { addLink, addVariable, connectFlow, createEmptyModel, simulate, type Model } from '@looplab/core';
import { loopDominance, MAX_LOOP_LINES } from './loopDominance.ts';

interface FlowSpec {
  name: string;
  equation: string;
  /** which end of the flow is the stock */
  end: 'to' | 'from';
}

/** One stock with the given flows; every flow depends on the stock, so each one closes a loop with it. */
function oneStock(
  flows: FlowSpec[],
  opts: { stock?: string; stop?: number; dt?: number; constants?: Record<string, string>; loopCap?: number } = {},
): Model {
  let m = createEmptyModel('T', { id: 'm_t', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_s', name: 'Population', kind: 'stock', equation: opts.stock ?? '100' });
  for (const [name, equation] of Object.entries(opts.constants ?? {}))
    m = addVariable(m, { id: `v_${name}`, name, kind: 'constant', equation });
  flows.forEach((f, i) => {
    m = addVariable(m, { id: `v_f${i}`, name: f.name, kind: 'flow', equation: f.equation, flow: { from: null, to: null } });
    m = connectFlow(m, `v_f${i}`, { [f.end]: 'v_s' });
    m = addLink(m, { id: `l_s_f${i}`, from: 'v_s', to: `v_f${i}`, polarity: '+' });
  });
  return {
    ...m,
    simSpec: { ...m.simSpec, start: 0, stop: opts.stop ?? 10, dt: opts.dt ?? 0.25 },
    settings: { ...m.settings, ...(opts.loopCap ? { loopCap: opts.loopCap } : {}) },
  };
}

const logistic = (p0: string): Model =>
  oneStock(
    [
      { name: 'Births', equation: 'r * Population', end: 'to' },
      { name: 'Deaths', equation: 'r * Population * Population / K', end: 'from' },
    ],
    { stock: p0, constants: { r: '1', K: '1000' }, stop: 10, dt: 1 / 16 },
  );

describe('loopDominance', () => {
  it('has nothing to show for a model without feedback', () => {
    const m = addVariable(createEmptyModel('T', { id: 'm_t', now: '2026-01-01T00:00:00.000Z' }), {
      id: 'v_c',
      name: 'C',
      kind: 'constant',
      equation: '1',
    });
    expect(loopDominance(m)).toBeNull();
  });

  it('scores the two loops of a logistic model in one group, with the published closed form', () => {
    const m = logistic('10');
    const d = loopDominance(m);
    expect(d?.groups).toHaveLength(1);
    const rows = d?.groups[0].rows ?? [];
    expect(rows.map((r) => r.handle).sort()).toEqual(['B1', 'R1']);
    const births = rows.find((r) => r.type === 'R');
    const P = simulate(m).series['v_s'];
    expect(births?.label).toBe('Births → Population');
    expect(births?.values).toHaveLength(d?.time.length ?? -1);
    for (let k = 1; k < P.length; k++) expect(births?.values[k]).toBeCloseTo(1000 / (1000 + P[k] + P[k - 1]), 9);
    expect(births?.values[0]).toBe(0);
    expect(births?.peak).toBeGreaterThan(births?.mean ?? 1);
    expect(d).toMatchObject({ truncated: false, idle: false, silent: 0 });
  });

  it('keeps a loop’s handle and colour when the ranking changes (colour follows the loop, not its rank)', () => {
    // started near K/2 the balancing loop is the stronger one; the order the loops were found in is unchanged
    const rows = loopDominance(logistic('400'))?.groups[0].rows ?? [];
    expect(rows.map((r) => r.handle)).toEqual(['B1', 'R1']); // strongest first
    expect(rows.map((r) => r.slot)).toEqual([1, 0]); // slots follow the order found: R1 → 0, B1 → 1
  });

  it('draws the strongest loops only, with unique colour slots in the order the loops were found', () => {
    // eight parallel drains: loop i has the constant share i/36 (RESEARCH §LTM 5.3: births/deaths shares are constant)
    const flows = Array.from({ length: 8 }, (_, i): FlowSpec => ({ name: `Drain ${i + 1}`, equation: `Population * 0.0${i + 1}`, end: 'from' }));
    const rows = loopDominance(oneStock(flows))?.groups[0].rows ?? [];
    expect(rows).toHaveLength(8);
    expect(rows.map((r) => r.label)).toEqual([8, 7, 6, 5, 4, 3, 2, 1].map((i) => `Drain ${i} → Population`)); // strongest first
    for (const r of rows) expect(r.mean).toBeCloseTo(Number(r.label.match(/\d/)?.[0]) / 36, 9);
    const drawn = rows.filter((r) => r.slot !== null);
    expect(drawn).toHaveLength(MAX_LOOP_LINES);
    expect(drawn.map((r) => r.label.match(/\d/)?.[0]).sort()).toEqual(['3', '4', '5', '6', '7', '8']);
    expect(drawn.map((r) => r.slot).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rows.filter((r) => r.slot === null).map((r) => r.handle).sort()).toEqual(['B1', 'B2']); // Drain 1 and 2
    expect(rows.find((r) => r.label.startsWith('Drain 3'))?.slot).toBe(0); // the first drawn loop in found order
  });

  it('names a loop after its annotation', () => {
    const m = oneStock([{ name: 'Births', equation: 'Population * 0.1', end: 'to' }]);
    const named = { ...m, loopAnnotations: [{ key: 'v_f0>v_s', name: 'Growth engine', note: '', origin: 'user' as const }] };
    expect(loopDominance(named)?.groups[0].rows[0].label).toBe('Growth engine');
  });

  it('reports a run in which nothing changes as idle', () => {
    const d = loopDominance(oneStock([{ name: 'Births', equation: 'Population * 0.1', end: 'to' }], { stock: '0' }));
    expect(d).toMatchObject({ idle: true, silent: 0 });
    expect(d?.groups[0].rows[0]).toMatchObject({ mean: 0, peak: 0 });
  });

  it('counts loops that never score while others do', () => {
    const d = loopDominance(
      oneStock([
        { name: 'Births', equation: 'Population * 0.1', end: 'to' },
        { name: 'Leak', equation: '0 * Population', end: 'from' },
      ]),
    );
    expect(d).toMatchObject({ idle: false, silent: 1 });
    expect(d?.groups[0].rows.map((r) => r.peak)).toEqual([1, 0]);
  });

  it('says when the loop search was cut short', () => {
    const d = loopDominance(
      oneStock(
        [
          { name: 'Births', equation: 'Population * 0.1', end: 'to' },
          { name: 'Deaths', equation: 'Population * 0.05', end: 'from' },
        ],
        { loopCap: 1 },
      ),
    );
    expect(d).toMatchObject({ truncated: true, cap: 1, reason: 'cap' });
    expect(d?.groups[0].rows).toHaveLength(1);
  });

  it('throws when the model cannot run', () => {
    const broken = oneStock([{ name: 'Births', equation: 'Population *', end: 'to' }]);
    expect(() => loopDominance(broken)).toThrow(/Births/);
  });
});
