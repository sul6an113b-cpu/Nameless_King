import { describe, expect, it } from 'vitest';
import { addVariable, createEmptyModel, ModelOpError, ModelSchema, removeVariable } from '@looplab/core';
import {
  addExcluded,
  addIntervention,
  addKpi,
  addReferenceMode,
  addScenario,
  removeExcluded,
  removeIntervention,
  removeKpi,
  removeReferenceMode,
  setDecision,
  setFrameText,
  setModelName,
  setSimSpec,
  updateIntervention,
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

describe('decision and interventions', () => {
  it('sets the recommendation and summary immutably; an unchanged value returns the same model', () => {
    const m = base();
    const next = setDecision(m, { recommendation: 'Add reviews' });
    expect(next.decision).toEqual({ recommendation: 'Add reviews', summary: '' });
    expect(m.decision.recommendation).toBe('');
    expect(setDecision(next, { recommendation: 'Add reviews' })).toBe(next);
    expect(() => setDecision(m, { summary: 'x'.repeat(8001) })).toThrow(ModelOpError);
    valid(next);
  });

  it('adds, edits and removes an intervention; the scenario link must exist (I6)', () => {
    const withScenario = { ...base(), scenarios: [{ id: 's_1', name: 'More staff', note: '', overrides: [], origin: 'user' as const }] };
    let m = addIntervention(withScenario, { id: 'i_1', name: 'Add staff', leverage: 12 });
    expect(m.interventions[0]).toMatchObject({ id: 'i_1', leverage: 12, scenarioId: null, status: 'idea' });
    m = updateIntervention(m, 'i_1', { scenarioId: 's_1', status: 'tested', leverage: 9 });
    expect(m.interventions[0]).toMatchObject({ scenarioId: 's_1', status: 'tested', leverage: 9, name: 'Add staff' });
    valid(m);
    expect(() => updateIntervention(m, 'i_1', { scenarioId: 's_nope' })).toThrow(ModelOpError);
    expect(() => updateIntervention(m, 'i_1', { leverage: 13 })).toThrow(ModelOpError);
    expect(() => updateIntervention(m, 'i_x', { name: 'y' })).toThrow(ModelOpError);
    expect(() => addIntervention(m, { id: 'i_1', name: 'dup', leverage: 3 })).toThrow(ModelOpError);
    expect(removeIntervention(m, 'i_1').interventions).toEqual([]);
  });
});

describe('scenario edit', () => {
  const withConstant = () => addVariable(base(), { id: 'v_k', name: 'Staff', kind: 'constant', equation: '10' });

  it('adds a one-override scenario for a constant, and an intervention can then link to it', () => {
    let m = addScenario(withConstant(), { id: 's_1', name: '  More staff ', varId: 'v_k', value: 12.5 });
    expect(m.scenarios).toHaveLength(1);
    expect(m.scenarios[0]).toMatchObject({ id: 's_1', name: 'More staff', origin: 'user', overrides: [{ varId: 'v_k', equation: '12.5' }] });
    m = updateIntervention(addIntervention(m, { id: 'i_1', name: 'Hire', leverage: 12 }), 'i_1', { scenarioId: 's_1' });
    expect(m.interventions[0]?.scenarioId).toBe('s_1');
    valid(m);
  });

  it('rejects an unknown variable, a non-constant, a bad value, an empty name and a duplicate id', () => {
    const m = withConstant();
    expect(() => addScenario(m, { id: 's_1', name: 'x', varId: 'v_nope', value: 1 })).toThrow(ModelOpError);
    expect(() => addScenario(m, { id: 's_1', name: 'x', varId: 'v_a', value: 1 })).toThrow(/not a constant/);
    expect(() => addScenario(m, { id: 's_1', name: 'x', varId: 'v_k', value: Number.NaN })).toThrow(ModelOpError);
    expect(() => addScenario(m, { id: 's_1', name: '   ', varId: 'v_k', value: 1 })).toThrow(ModelOpError);
    const once = addScenario(m, { id: 's_1', name: 'x', varId: 'v_k', value: 1 });
    expect(() => addScenario(once, { id: 's_1', name: 'y', varId: 'v_k', value: 2 })).toThrow(ModelOpError);
  });
});
