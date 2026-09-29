import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildModel, idOf, type VarSpec } from '../../test/fixtures/sim/build.ts';
import type { Dim } from '../contracts.ts';
import type { UnitDef } from '../schema/model.ts';
import { divDim, formatDim, inferUnits, mulDim, parseUnit, powDim, sameDims, sameUnit } from './index.ts';

const P = (s: string, defs: UnitDef[] = []): Dim => {
  const r = parseUnit(s, defs);
  if (!r.ok) throw new Error(r.message);
  return r.dim;
};
const close = (a: Dim, b: Dim) => expect(sameUnit(a, b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(true);

describe('parseUnit', () => {
  it('matches the SPEC example: tasks/week → { scale: 1/7, dims: { tasks: 1, day: −1 } }', () => {
    const d = P('tasks/week');
    expect(d.dims).toEqual({ tasks: 1, day: -1 });
    expect(d.scale).toBeCloseTo(1 / 7, 15);
  });

  it.each([
    ['', {}, 1],
    ['1', {}, 1],
    ['dmnl', {}, 1],
    ['Dimensionless', {}, 1],
    ['1/month', { day: -1 }, 12 / 365],
    ['USD/(person*month)', { usd: 1, person: -1, day: -1 }, 12 / 365],
    ['person-hours', { person: 1, day: 1 }, 1 / 24],
    ['m^2', { m: 2 }, 1],
    ['m^-2 * m', { m: -1 }, 1],
    ['m ^ (2)'.replace('(2)', '2'), { m: 2 }, 1],
    ['(tasks/week)/(1/week)', { tasks: 1 }, 1],
    ['1000 USD', { usd: 1 }, 1000],
    ['Widgets/Month', { widgets: 1, day: -1 }, 12 / 365],
  ])('%j', (s, dims, scale) => {
    const d = P(s);
    expect(d.dims).toEqual(dims);
    expect(d.scale).toBeCloseTo(scale, 12);
  });

  it.each([
    ['(tasks', /Missing "\)"/],
    ['tasks)', /Unexpected "\)"/],
    ['tasks^1.5', /integers/],
    ['tasks^x', /integer exponent/],
    ['tasks/', /end of unit/],
    ['#', /Unexpected "#"/],
    ['0 USD', /positive/],
  ])('rejects %j', (s, message) => {
    const r = parseUnit(s, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(message);
  });

  it('time units use fixed factors: year = 12 months = 4 quarters = 365 days, week = 7 days', () => {
    close(P('year'), { scale: 12 * P('month').scale, dims: { day: 1 } });
    close(P('year'), { scale: 4 * P('quarter').scale, dims: { day: 1 } });
    close(P('yr'), P('365 days'));
    close(P('week'), P('7 days'));
    close(P('day'), P('24 hours'));
    close(P('hour'), P('60 minutes'));
    close(P('minute'), P('60 seconds'));
    expect(divDim(P('month'), P('week')).scale).toBeCloseTo(365 / 12 / 7, 12);
    expect(sameDims(P('months'), P('mo'))).toBe(true);
  });

  it('resolves custom units: base units, aliases, definitions, and detects cycles', () => {
    const defs: UnitDef[] = [
      { name: 'tasks', aliases: ['task'], definition: '' },
      { name: 'kUSD', aliases: [], definition: '1000 USD' },
      { name: 'FTE', aliases: ['full time equivalent'], definition: 'person' },
      { name: 'loopA', aliases: [], definition: 'loopB' },
      { name: 'loopB', aliases: [], definition: 'loopA*2' },
    ];
    close(P('task/week', defs), P('tasks/week', defs));
    close(P('kUSD/FTE', defs), { scale: 1000, dims: { usd: 1, person: -1 } });
    close(P('full_time_equivalent', defs), P('person', defs));
    const r = parseUnit('loopA', defs);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/in terms of itself/);
  });

  it('custom definitions override built-in time units', () => {
    close(P('month', [{ name: 'month', aliases: [], definition: '30 days' }]), P('30 day'));
  });
});

// ── algebra laws ───────────────────────────────────────────────────────────

const unitArb = fc
  .array(fc.tuple(fc.constantFrom('tasks', 'people', 'USD', 'week', 'month', 'm'), fc.integer({ min: -3, max: 3 })), {
    maxLength: 4,
  })
  .chain((terms) =>
    fc.constantFrom(1, 2, 1000, 0.5).map((scale) => {
      const body = terms.filter(([, e]) => e !== 0).map(([n, e]) => `${n}^${e}`);
      return [String(scale), ...body].join(' ');
    }),
  );

describe('unit algebra laws (property)', () => {
  it('parse is a homomorphism for *, / and ^', () => {
    fc.assert(
      fc.property(unitArb, unitArb, fc.integer({ min: -3, max: 3 }), (a, b, n) => {
        close(P(`(${a}) * (${b})`), mulDim(P(a), P(b)));
        close(P(`(${a}) / (${b})`), divDim(P(a), P(b)));
        close(P(`(${a})^${n}`), powDim(P(a), n));
      }),
    );
  });

  it('multiplication commutes and associates; a / a is dimensionless 1', () => {
    fc.assert(
      fc.property(unitArb, unitArb, unitArb, (a, b, c) => {
        close(mulDim(P(a), P(b)), mulDim(P(b), P(a)));
        close(mulDim(mulDim(P(a), P(b)), P(c)), mulDim(P(a), mulDim(P(b), P(c))));
        close(divDim(P(a), P(a)), { scale: 1, dims: {} });
      }),
    );
  });
});

describe('formatDim', () => {
  it('shows units in the model time unit', () => {
    expect(formatDim(P('tasks/month'), 'month')).toBe('tasks/month');
    expect(formatDim(P('tasks/week'), 'month')).toBe('4.345 tasks/month');
    expect(formatDim(P('USD/(person*month)'), 'month')).toBe('usd/(month*person)'); // unit names are case-insensitive (XMILE identifiers)
    expect(formatDim(P('dmnl'))).toBe('dmnl');
    expect(formatDim(P('1000'))).toBe('1000');
  });
});

// ── inferUnits on fixture models ───────────────────────────────────────────

const clean: VarSpec[] = [
  { name: 'Backlog', kind: 'stock', eq: '100', units: 'tasks' },
  { name: 'Staff', kind: 'constant', eq: '5', units: 'person' },
  { name: 'Productivity', kind: 'constant', eq: '2', units: 'tasks/(person*month)' },
  { name: 'Weekly rate', kind: 'constant', eq: '3', units: 'tasks/week' },
  { name: 'Weeks per month', kind: 'constant', eq: '4.345', units: 'week/month' },
  { name: 'Completion', from: 'Backlog', eq: 'MIN(Staff * Productivity, Backlog / DT)', units: 'tasks/month' },
  { name: 'Arrivals', to: 'Backlog', eq: 'Weekly_rate * Weeks_per_month + STEP(10, 5)', units: 'tasks/month' },
  { name: 'Smoothed', eq: 'SMTH1(Completion, 3)', units: 'tasks/month' },
  { name: 'Busy', eq: 'IF Backlog > 50 THEN 1 ELSE 0', units: 'dmnl' },
  { name: 'Scaled', eq: 'Completion * 2' },
];

const issuesOf = (vars: VarSpec[], timeUnit = 'month') => inferUnits(buildModel(vars, { simSpec: { timeUnit } })).issues;

describe('inferUnits', () => {
  it('finds no issue in a consistent model (conversion factors as literals or constants)', () => {
    expect(issuesOf(clean)).toEqual([]);
  });

  it('treats person and people as different units unless an alias says otherwise', () => {
    const vars: VarSpec[] = [
      { name: 'Staff', kind: 'constant', eq: '5', units: 'people' },
      { name: 'Productivity', kind: 'constant', eq: '2', units: 'tasks/(person*month)' },
      { name: 'Capacity', eq: 'Staff * Productivity', units: 'tasks/month' },
    ];
    expect(inferUnits(buildModel(vars)).issues.length).toBeGreaterThan(0);
    const aliased = buildModel(vars, { units: [{ name: 'person', aliases: ['people'], definition: '' }] });
    expect(inferUnits(aliased).issues).toEqual([]);
  });

  it('infers units of undeclared variables', () => {
    const { byVar } = inferUnits(buildModel(clean, { simSpec: { timeUnit: 'month' } }));
    close(byVar[idOf('Backlog')] ?? { scale: NaN, dims: {} }, P('tasks'));
    expect(byVar[idOf('Scaled')]).toBeNull(); // a literal factor leaves the scale unknown
    const { byVar: b2 } = inferUnits(buildModel([...clean.slice(0, 3), { name: 'Capacity', eq: 'Staff * Productivity' }]));
    close(b2[idOf('Capacity')] ?? { scale: NaN, dims: {} }, P('tasks/month'));
  });

  it.each<[string, VarSpec[], RegExp]>([
    ['adding different dimensions', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks' }, { name: 'b', kind: 'constant', eq: '1', units: 'people' }, { name: 'c', eq: 'a + b' }], /cannot add tasks and people/],
    ['subtracting different scales', [{ name: 'a', kind: 'constant', eq: '1', units: 'days' }, { name: 'b', kind: 'constant', eq: '1', units: 'weeks' }, { name: 'c', eq: 'a - b' }], /different scale/],
    ['comparing mismatched units', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks' }, { name: 'b', kind: 'constant', eq: '1', units: 'USD' }, { name: 'c', eq: 'IF a > b THEN 1 ELSE 0' }], /comparing tasks and usd/],
    ['MIN of mismatched units', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks' }, { name: 'b', kind: 'constant', eq: '1', units: 'USD' }, { name: 'c', eq: 'MIN(a, b)' }], /MIN of tasks and usd/],
    ['IF branches with different units', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks' }, { name: 'b', kind: 'constant', eq: '1', units: 'USD' }, { name: 'c', eq: 'IF TIME > 1 THEN a ELSE b' }], /IF branches/],
    ['EXP of a dimensioned value', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks' }, { name: 'c', eq: 'EXP(a)' }], /EXP needs a dimensionless argument/],
    ['a smoothing time that is not a time', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks' }, { name: 'c', eq: 'SMTH1(a, a)' }], /averaging time is tasks, not a time/],
    ['an equation that contradicts the declared units', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks' }, { name: 'c', eq: 'a * a', units: 'tasks' }], /gives tasks\^2 but the declared units are tasks/],
    ['a stock initial value in other units', [{ name: 'a', kind: 'constant', eq: '1', units: 'USD' }, { name: 'S', kind: 'stock', eq: 'a', units: 'tasks' }], /initial value gives usd/],
    ['a flow that does not match its stock', [{ name: 'S', kind: 'stock', eq: '0', units: 'tasks' }, { name: 'f', to: 'S', eq: '1', units: 'people/month' }], /does not match stock "S"/],
    ['a flow per week in a monthly model', [{ name: 'S', kind: 'stock', eq: '0', units: 'tasks' }, { name: 'f', to: 'S', eq: '1', units: 'tasks/week' }], /convert by a factor of 4\.345/],
    ['unreadable units', [{ name: 'a', kind: 'constant', eq: '1', units: 'tasks^^' }], /Cannot read the units of "a"/],
  ])('flags %s', (_what, vars, message) => {
    const issues = issuesOf(vars);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map((i) => i.message).join('\n')).toMatch(message);
    for (const i of issues) {
      expect(i.check).toBe('units');
      expect(i.severity).toBe('warning');
    }
  });

  it('flags a model time unit that is not a time', () => {
    expect(issuesOf(clean, 'widgets').map((i) => i.message).join('\n')).toMatch(/not a time unit/);
  });
});
