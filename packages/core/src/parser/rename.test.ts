import { describe, expect, it } from 'vitest';
import { buildModel, idOf } from '../../test/fixtures/sim/build.ts';
import { ModelOpError } from '../model/ops.ts';
import { ModelSchema } from '../schema/model.ts';
import { renameInEquation, renameVariable } from './index.ts';

describe('renameInEquation', () => {
  it('rewrites only matching names and keeps all other text', () => {
    expect(renameInEquation('backlog/  Backlog_Time {keep} + "BackLog"*2', 'backlog', 'Work_Queue')).toBe(
      'Work_Queue/  Backlog_Time {keep} + Work_Queue*2',
    );
  });

  it('renames graphical-function calls and references inside broken equations', () => {
    expect(renameInEquation('effect(x) + ', 'effect', 'fx')).toBe('fx(x) + ');
    expect(renameInEquation('x + (x', 'x', 'y')).toBe('y + (y');
  });
});

describe('renameVariable', () => {
  const base = () => {
    const m = buildModel(
      [
        { name: 'Backlog', kind: 'stock', eq: '100' },
        { name: 'completion time', kind: 'constant', eq: '4' },
        { name: 'completion', from: 'Backlog', eq: 'Backlog / completion_time' },
        { name: 'Backlog time', eq: 'backlog * 2' },
      ],
      { assertions: [{ expr: 'Backlog >= 0' }] },
    );
    return {
      ...m,
      scenarios: [{ id: 's_1', name: 'fast', note: '', origin: 'user' as const, overrides: [{ varId: idOf('Backlog time'), equation: '"Backlog" * 3' }] }],
    };
  };

  it('renames the variable and rewrites equations, assertions and scenario overrides', () => {
    const m = renameVariable(base(), idOf('Backlog'), 'Work Queue');
    const eq = (name: string) => m.variables.find((v) => v.name === name)?.equation;
    expect(m.variables.find((v) => v.id === idOf('Backlog'))?.name).toBe('Work Queue');
    expect(eq('completion')).toBe('Work_Queue / completion_time');
    expect(eq('Backlog time')).toBe('Work_Queue * 2');
    expect(m.assertions[0].expr).toBe('Work_Queue >= 0');
    expect(m.scenarios[0].overrides[0].equation).toBe('Work_Queue * 3');
    expect(ModelSchema.safeParse(m).success).toBe(true);
  });

  it('quotes names that are not plain identifiers', () => {
    const m = renameVariable(base(), idOf('completion time'), 'Completion time (weeks)');
    expect(m.variables.find((v) => v.name === 'completion')?.equation).toBe('Backlog / "Completion time (weeks)"');
  });

  it('rejects duplicate and reserved names', () => {
    expect(() => renameVariable(base(), idOf('Backlog'), 'COMPLETION_time')).toThrow(ModelOpError);
    expect(() => renameVariable(base(), idOf('Backlog'), 'Time')).toThrow(/reserved/);
  });
});
