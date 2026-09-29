import { describe, expect, it } from 'vitest';
import { buildModel, idOf, type BuildOptions, type VarSpec } from '../../test/fixtures/sim/build.ts';
import type { HealthCheck, HealthItem } from '../contracts.ts';
import type { Model } from '../schema/model.ts';
import { runHealth } from './index.ts';

/** A small, correct model: every drawn polarity matches its equation. */
const CLEAN: VarSpec[] = [
  { name: 'Backlog', kind: 'stock', eq: '100', units: 'tasks', nonNegative: true },
  { name: 'arrivals', to: 'Backlog', eq: '10 + STEP(5, 6)', units: 'tasks/month' },
  { name: 'completion rate', kind: 'constant', eq: '0.25', units: '1/month' },
  { name: 'completion', from: 'Backlog', eq: 'Backlog * completion_rate', units: 'tasks/month' },
];
const SPEC: BuildOptions = { simSpec: { start: 0, stop: 24, dt: 0.25, timeUnit: 'month' } };

const of = (items: HealthItem[], check: HealthCheck) => items.filter((i) => i.check === check);
const health = (vars: VarSpec[], opts: BuildOptions = SPEC, run?: boolean) =>
  runHealth(buildModel(vars, opts), run === undefined ? undefined : { runIntegrationTest: run });

describe('runHealth', () => {
  it('reports nothing for a clean model (and works while checkPolarity is still a stub)', () => {
    const r = health(CLEAN, { ...SPEC, assertions: [{ expr: 'Backlog >= 0' }] });
    expect(r.items).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('unquantified: CLD-only variables block simulation', () => {
    const r = health([...CLEAN, { name: 'Morale', kind: 'variable' }]);
    expect(of(r.items, 'unquantified')).toMatchObject([{ severity: 'error', elementIds: [idOf('Morale')] }]);
    expect(r.ok).toBe(false);
  });

  it('parse, undefined and algebraic-loop errors come from the compiler', () => {
    const r = health([...CLEAN, { name: 'x', eq: '1 +' }, { name: 'y', eq: 'nope * 2' }, { name: 'p', eq: 'q' }, { name: 'q', eq: 'p' }]);
    expect(of(r.items, 'parse')[0].elementIds).toEqual([idOf('x')]);
    expect(of(r.items, 'undefined')[0].elementIds).toEqual([idOf('y')]);
    expect(of(r.items, 'algebraic-loop')[0].message).toMatch(/p → q → p|q → p → q/);
  });

  it('unused: constants and lookups warn, auxiliaries are info, KPIs count as used', () => {
    const vars: VarSpec[] = [
      ...CLEAN,
      { name: 'spare', kind: 'constant', eq: '1' },
      { name: 'table', kind: 'lookup', graph: { xs: [0, 1], ys: [0, 1] } },
      { name: 'report', eq: 'Backlog * 2' },
      { name: 'kpi', eq: 'Backlog * 3' },
    ];
    const model = buildModel(vars, SPEC);
    model.frame.kpis.push({ id: 'k_1', name: 'KPI', varId: idOf('kpi'), goal: 'minimize' });
    const items = of(runHealth(model).items, 'unused');
    expect(items.map((i) => [i.elementIds[0], i.severity])).toEqual([
      [idOf('spare'), 'warning'],
      [idOf('table'), 'warning'],
      [idOf('report'), 'info'],
    ]);
  });

  it('link-equation-mismatch: a reference without a link, a link without a reference, a link into a stock', () => {
    const model = buildModel([...CLEAN, { name: 'extra', kind: 'constant', eq: '2' }], SPEC);
    const withoutLink: Model = {
      ...model,
      links: [
        ...model.links.filter((l) => !(l.from === idOf('completion rate') && l.to === idOf('completion'))),
        { id: 'l_x1', from: idOf('extra'), to: idOf('completion'), polarity: '+', delay: false, note: '', confidence: 'medium', origin: 'user' },
        { id: 'l_x2', from: idOf('extra'), to: idOf('Backlog'), polarity: '+', delay: false, note: '', confidence: 'medium', origin: 'user' },
      ],
    };
    const msgs = of(runHealth(withoutLink).items, 'link-equation-mismatch').map((i) => i.message);
    expect(msgs).toHaveLength(3);
    expect(msgs.join('\n')).toMatch(/uses "completion rate" but there is no link completion rate → completion/);
    expect(msgs.join('\n')).toMatch(/link extra → completion is not used/);
    expect(msgs.join('\n')).toMatch(/Only flows change a stock: the link extra → Backlog/);
  });

  it('flow-link: missing or mis-signed flow → stock links, and unconnected flows', () => {
    const model = buildModel([...CLEAN, { name: 'orphan', kind: 'flow', eq: '1' }], SPEC);
    const broken: Model = {
      ...model,
      links: model.links
        .filter((l) => !(l.from === idOf('arrivals') && l.to === idOf('Backlog')))
        .map((l) => (l.from === idOf('completion') && l.to === idOf('Backlog') ? { ...l, polarity: '+' as const } : l)),
    };
    const items = of(runHealth(broken).items, 'flow-link');
    expect(items.map((i) => i.message)).toEqual([
      '"arrivals" fills "Backlog" but there is no link arrivals → Backlog (+)',
      'The link completion → Backlog should be -: the flow drains the stock',
      'Flow "orphan" is not connected to any stock',
    ]);
    expect(items.map((i) => i.severity)).toEqual(['warning', 'warning', 'info']);
  });

  it('units: issues from inferUnits', () => {
    const vars = CLEAN.map((v) => (v.name === 'arrivals' ? { ...v, units: 'people/month' } : v));
    expect(of(health(vars).items, 'units')[0].message).toMatch(/does not match stock "Backlog"/);
  });

  it('assertion: a violated assertion is an error with its note; a broken assertion too', () => {
    const r = health(CLEAN, { ...SPEC, assertions: [{ expr: 'Backlog < 50', note: 'backlog must stay small' }, { expr: 'Backlog >' }] });
    const items = of(r.items, 'assertion');
    expect(items).toHaveLength(2);
    expect(items[0].message).toMatch(/Unexpected end/);
    expect(items[1].message).toMatch(/"Backlog < 50" failed at time 0 — backlog must stay small/);
    expect(items[1].elementIds).toEqual(['a_1']);
    expect(r.ok).toBe(false);
  });

  it('numeric: NaN/Inf values and DELAY times off the DT grid are errors', () => {
    const nan = health([...CLEAN, { name: 'ratio', eq: 'LN(Backlog - 200)' }]);
    expect(of(nan.items, 'numeric')[0]).toMatchObject({ severity: 'error', elementIds: [idOf('ratio')] });
    const delay = health([...CLEAN, { name: 'late', eq: 'DELAY(Backlog, 0.3)' }]);
    expect(of(delay.items, 'numeric')[0].message).toMatch(/multiple of DT/);
  });

  it('integration-error: flags stocks that move by more than the tolerance when DT is halved', () => {
    const growth: VarSpec[] = [
      { name: 'S', kind: 'stock', eq: '1' },
      { name: 'r', kind: 'constant', eq: '1' },
      { name: 'g', to: 'S', eq: 'S * r' },
    ];
    const coarse = health(growth, { simSpec: { stop: 10, dt: 0.5 } });
    expect(of(coarse.items, 'integration-error')).toMatchObject([{ severity: 'warning', elementIds: [idOf('S')] }]);
    expect(of(health(growth, { simSpec: { stop: 10, dt: 0.5 } }, false).items, 'integration-error')).toEqual([]);
    expect(of(health(CLEAN).items, 'integration-error')).toEqual([]);
  });

  it('integration-error: RK4 near jumps or with non-negative stocks, and off-grid PULSE times', () => {
    const rk4 = health(CLEAN, { simSpec: { ...SPEC.simSpec, method: 'rk4' } }, false);
    const msgs = of(rk4.items, 'integration-error').map((i) => i.message);
    expect(msgs.join('\n')).toMatch(/RK4 loses accuracy at jumps/);
    expect(msgs.join('\n')).toMatch(/non-negative stocks/);
    const pulse = health([...CLEAN, { name: 'burst', eq: 'PULSE(10, 2.1)' }], SPEC, false);
    expect(of(pulse.items, 'integration-error')[0].message).toMatch(/not on the DT grid/);
  });
});
