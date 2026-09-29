import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addLink, addVariable, createEmptyModel, flipPolarity, ModelOpError } from '@looplab/core';
import { act, loadModel } from './actions.ts';
import { HISTORY_CAP, useModelStore } from './store.ts';
import { useUiStore } from './ui.ts';

const fresh = () => createEmptyModel('Test', { id: 'm_test', now: '2026-01-01T00:00:00.000Z' });
const s = () => useModelStore.getState();

beforeEach(() => {
  loadModel(fresh());
  useUiStore.setState({ toasts: [], selection: [] });
});

describe('model store: undo/redo', () => {
  it('one commit is one undo step; undo/redo walk the snapshots', () => {
    s().commit('add a', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
    s().commit('add b', (m) => addVariable(m, { id: 'v_b', name: 'B' }));
    s().commit('link', (m) => addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b' }));
    expect(s().past.map((p) => p.label)).toEqual(['add a', 'add b', 'link']);
    s().undo();
    expect(s().model.links).toHaveLength(0);
    s().undo();
    expect(s().model.variables.map((v) => v.id)).toEqual(['v_a']);
    s().redo();
    s().redo();
    expect(s().model.links).toHaveLength(1);
    s().redo(); // nothing left: no-op
    expect(s().future).toHaveLength(0);
  });

  it('a new commit after undo clears the redo stack', () => {
    s().commit('add a', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
    s().undo();
    s().commit('add b', (m) => addVariable(m, { id: 'v_b', name: 'B' }));
    expect(s().future).toHaveLength(0);
    s().redo();
    expect(s().model.variables.map((v) => v.id)).toEqual(['v_b']);
  });

  it('keeps at most 200 snapshots', () => {
    expect(HISTORY_CAP).toBe(200);
    for (let i = 0; i < 230; i++) s().commit(`add ${i}`, (m) => addVariable(m, { id: `v_${i}`, name: `V${i}` }));
    expect(s().past).toHaveLength(200);
    for (let i = 0; i < 250; i++) s().undo();
    expect(s().model.variables).toHaveLength(30); // the 30 oldest steps fell off the history
  });

  it('a recipe returning the same model records nothing', () => {
    s().commit('noop', (m) => m);
    expect(s().past).toHaveLength(0);
  });

  it('a rejected op throws inside commit and leaves the model unchanged', () => {
    s().commit('add a', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
    const before = s().model;
    expect(() => s().commit('dup', (m) => addVariable(m, { id: 'v_b', name: 'a' }))).toThrow(ModelOpError);
    expect(s().model).toBe(before);
    expect(s().past).toHaveLength(1);
  });

  it('act() turns a rejected op into a toast instead of an exception', () => {
    s().commit('add a', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
    expect(act('dup', (m) => addVariable(m, { id: 'v_b', name: 'A' }))).toBe(false);
    expect(useUiStore.getState().toasts.at(-1)?.kind).toBe('error');
    expect(useUiStore.getState().toasts.at(-1)?.text).toMatch(/already exists/);
    expect(act('ok', (m) => addVariable(m, { id: 'v_b', name: 'B' }))).toBe(true);
  });

  it('load() replaces the model and clears history and selection', () => {
    s().commit('add a', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
    useUiStore.setState({ selection: ['v_a'] });
    loadModel(fresh());
    expect(s().past).toHaveLength(0);
    expect(s().model.variables).toHaveLength(0);
    expect(useUiStore.getState().selection).toEqual([]);
  });

  it('property: n commits then n undos restores the original; n redos restores the latest', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom('add', 'flip'), { minLength: 1, maxLength: 20 }), (ops) => {
        loadModel(fresh());
        s().commit('seed', (m) =>
          addLink(addVariable(addVariable(m, { id: 'v_a', name: 'A' }), { id: 'v_b', name: 'B' }), {
            id: 'l_1',
            from: 'v_a',
            to: 'v_b',
          }),
        );
        const start = s().model;
        ops.forEach((op, i) =>
          s().commit(op, (m) =>
            op === 'add' ? addVariable(m, { id: `v_x${i}`, name: `X${i}` }) : flipPolarity(m, 'l_1'),
          ),
        );
        const end = s().model;
        ops.forEach(() => s().undo());
        const undone = s().model === start;
        ops.forEach(() => s().redo());
        return undone && s().model === end;
      }),
    );
  });
});

describe('ui store', () => {
  it('applies React Flow selection changes and ignores no-op updates', () => {
    const ui = useUiStore.getState();
    ui.applySelection([
      { id: 'a', selected: true },
      { id: 'b', selected: true },
    ]);
    ui.applySelection([{ id: 'a', selected: false }]);
    expect(useUiStore.getState().selection).toEqual(['b']);
    const before = useUiStore.getState().selection;
    useUiStore.getState().select(['b']);
    expect(useUiStore.getState().selection).toBe(before);
  });

  it('changing stage clears selection and link mode', () => {
    useUiStore.setState({ selection: ['x'], linkMode: true, linkSource: 'x' });
    useUiStore.getState().setStage('quantify');
    expect(useUiStore.getState()).toMatchObject({
      stage: 'quantify',
      selection: [],
      linkMode: false,
      linkSource: null,
    });
  });
});
