import { describe, expect, it } from 'vitest';
import { addVariable, createEmptyModel, ModelOpError, ModelSchema, removeVariable } from '@looplab/core';
import {
  addExcluded,
  addKpi,
  addReferenceMode,
  removeExcluded,
  removeKpi,
  removeReferenceMode,
  setFrameText,
  setModelName,
  setSimSpec,
  updateKpi,
  updateReferenceMode,
} from './edits.ts';

const base = () =>
  addVariable(createEmptyModel('E', { id: 'm_e', now: '2026-01-01T00:00:00.000Z' }), { id: 'v_a', name: 'Backlog' });
const valid = (m: ReturnType<typeof base>) => expect(ModelSchema.safeParse(m).success).toBe(true);

describe('frame and horizon edits', () => {
  it('edits problem, purpose and model name immutably', () => {
    const m = base();
    const next = setModelName(
      setFrameText(setFrameText(m, 'problem', 'Backlog grows'), 'purpose', 'Staffing'),
      '  EPC  ',
    );
    expect(next.frame).toMatchObject({ problem: 'Backlog grows', purpose: 'Staffing' });
    expect(next.name).toBe('EPC');
    expect(m.frame.problem).toBe('');
    expect(setFrameText(m, 'problem', '')).toBe(m); // unchanged → same object (no undo step)
    expect(() => setModelName(m, '   ')).toThrow(ModelOpError);
    valid(next);
  });

  it('horizon edits keep stop > start', () => {
    const m = base();
    expect(setSimSpec(m, { stop: 48, timeUnit: 'week' }).simSpec).toMatchObject({
      start: 0,
      stop: 48,
      timeUnit: 'week',
    });
    expect(() => setSimSpec(m, { stop: 0 })).toThrow('stop time must be after');
    expect(() => setSimSpec(m, { dt: -1 })).toThrow(ModelOpError);
    expect(() => setSimSpec(m, { dt: 1e-9 })).toThrow(ModelOpError); // > 1,000,000 steps (I7)
  });

  it('KPIs: add, update, link to a variable, remove; references are checked (I6)', () => {
    let m = addKpi(base(), { id: 'k_1', name: 'Backlog at end' });
    m = updateKpi(m, 'k_1', { varId: 'v_a', goal: 'target', target: 0 });
    expect(m.frame.kpis[0]).toEqual({ id: 'k_1', name: 'Backlog at end', varId: 'v_a', goal: 'target', target: 0 });
    valid(m);
    expect(() => updateKpi(m, 'k_1', { varId: 'v_nope' })).toThrow('unknown variable');
    expect(() => addKpi(m, { id: 'k_1', name: 'dup' })).toThrow('duplicate id');
    expect(removeVariable(m, 'v_a').frame.kpis[0]?.varId).toBeNull(); // core cascade still applies
    expect(removeKpi(m, 'k_1').frame.kpis).toHaveLength(0);
  });

  it('reference modes: add sketch/data points, relabel, remove', () => {
    let m = addReferenceMode(base(), {
      id: 'r_1',
      name: 'Feared backlog',
      source: 'sketch',
      label: 'feared',
      points: [
        [0, 1],
        [1, 3],
      ],
    });
    m = updateReferenceMode(m, 'r_1', { varId: 'v_a', label: 'historical' });
    expect(m.frame.referenceModes[0]).toMatchObject({ varId: 'v_a', label: 'historical', source: 'sketch' });
    valid(m);
    expect(() => addReferenceMode(m, { id: 'r_2', name: '', source: 'data', points: [] })).toThrow(ModelOpError);
    expect(removeReferenceMode(m, 'r_1').frame.referenceModes).toHaveLength(0);
  });

  it('boundary: excluded items can be listed and removed', () => {
    const m = addExcluded(base(), { id: 'b_1', name: 'Exchange rates', reason: 'held constant' });
    expect(m.frame.excluded).toEqual([{ id: 'b_1', name: 'Exchange rates', reason: 'held constant' }]);
    expect(removeExcluded(m, 'b_1').frame.excluded).toEqual([]);
    expect(() => addExcluded(m, { id: 'b_2', name: '' })).toThrow(ModelOpError);
  });
});
