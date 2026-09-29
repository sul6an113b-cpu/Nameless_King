import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { addVariable, createEmptyModel } from '@looplab/core';
import { loadModel } from './actions.ts';
import { DB_NAME, resetPersistenceForTests, restoreLatest, saveModel, startAutosave } from './persistence.ts';
import { useModelStore } from './store.ts';
import { useUiStore } from './ui.ts';

const model = (id = 'm_p') => createEmptyModel('Persisted', { id, now: '2026-01-01T00:00:00.000Z' });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(pred: () => boolean | Promise<boolean>, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!(await pred())) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await wait(10);
  }
}

beforeEach(async () => {
  await resetPersistenceForTests();
  indexedDB.deleteDatabase(DB_NAME);
  loadModel(model());
  useUiStore.setState({ saveStatus: 'idle' });
});
afterEach(async () => {
  await resetPersistenceForTests();
});

describe('IndexedDB persistence', () => {
  it('restoreLatest returns none on an empty database', async () => {
    expect(await restoreLatest()).toEqual({ status: 'none' });
  });

  it('save → restore round-trips the model (through migrateModel) and stamps updatedAt', async () => {
    const m = addVariable(model(), { id: 'v_a', name: 'Backlog', kind: 'stock', equation: '10' });
    await saveModel(m);
    const r = await restoreLatest();
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.model.variables).toEqual(m.variables);
    expect(r.model.updatedAt).not.toBe(m.updatedAt);
  });

  it('autosave is debounced: a burst of commits results in one save of the latest model', async () => {
    const stop = startAutosave(30);
    try {
      const { commit } = useModelStore.getState();
      commit('a', (m) => addVariable(m, { id: 'v_a', name: 'A' }));
      commit('b', (m) => addVariable(m, { id: 'v_b', name: 'B' }));
      expect(useUiStore.getState().saveStatus).toBe('saving');
      expect((await restoreLatest()).status).toBe('none'); // nothing written yet
      await until(() => useUiStore.getState().saveStatus === 'saved');
      const r = await restoreLatest();
      expect(r.status === 'ok' && r.model.variables.map((v) => v.id)).toEqual(['v_a', 'v_b']);
    } finally {
      stop();
    }
  });

  it('a damaged record is reported as invalid, never thrown', async () => {
    const d = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('models');
        db.createObjectStore('meta');
      },
    });
    await d.put('models', { format: 'looplab-model', schemaVersion: 1, id: 'm_bad', name: '' }, 'm_bad');
    await d.put('meta', 'm_bad', 'current');
    d.close();
    const r = await restoreLatest();
    expect(r.status).toBe('invalid');
  });

  it('a file from a newer schema version is rejected with a clear message', async () => {
    const d = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('models');
        db.createObjectStore('meta');
      },
    });
    await d.put('models', { ...model('m_new'), schemaVersion: 99 }, 'm_new');
    await d.put('meta', 'm_new', 'current');
    d.close();
    const r = await restoreLatest();
    expect(r.status).toBe('invalid');
    expect(r.status === 'invalid' && r.error).toMatch(/newer/);
  });
});
