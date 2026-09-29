/**
 * IndexedDB autosave (SPEC §8): the whole model JSON is stored by id, debounced 500 ms after each change,
 * plus a pointer to the model that was open last so a reload restores it. Restored JSON goes through
 * `migrateModel`, like an opened file. Timestamps are stamped here, never by model ops.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { migrateModel, type Model } from '@looplab/core';
import { useModelStore } from './store.ts';
import { useUiStore } from './ui.ts';

export const DB_NAME = 'looplab';
const MODELS = 'models';
const META = 'meta';
const CURRENT = 'current';
export const AUTOSAVE_MS = 500;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(MODELS);
      d.createObjectStore(META);
    },
  });
  return dbPromise;
}

export const hasIndexedDb = (): boolean => typeof indexedDB !== 'undefined';

export const stamp = (model: Model, now = new Date().toISOString()): Model => ({ ...model, updatedAt: now });

/** Save a model and mark it as the one to restore on the next start. */
export async function saveModel(model: Model): Promise<void> {
  const d = await db();
  const tx = d.transaction([MODELS, META], 'readwrite');
  await Promise.all([
    tx.objectStore(MODELS).put(stamp(model), model.id),
    tx.objectStore(META).put(model.id, CURRENT),
    tx.done,
  ]);
}

export type RestoreResult = { status: 'none' } | { status: 'ok'; model: Model } | { status: 'invalid'; error: string };

/** The model that was open last, migrated and validated. Never throws. */
export async function restoreLatest(): Promise<RestoreResult> {
  try {
    if (!hasIndexedDb()) return { status: 'none' };
    const d = await db();
    const id: unknown = await d.get(META, CURRENT);
    if (typeof id !== 'string') return { status: 'none' };
    const json: unknown = await d.get(MODELS, id);
    if (json === undefined) return { status: 'none' };
    const r = migrateModel(json);
    return r.ok ? { status: 'ok', model: r.model } : { status: 'invalid', error: r.error };
  } catch (e) {
    return { status: 'invalid', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Save the store's model after every change, debounced. Returns an unsubscribe function.
 * Status is reported to the UI store for the `save-status` indicator.
 */
export function startAutosave(delayMs = AUTOSAVE_MS): () => void {
  const ui = useUiStore.getState();
  if (!hasIndexedDb()) {
    ui.setSaveStatus('unavailable');
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Model | null = null;

  const flush = async () => {
    timer = undefined;
    const model = pending;
    pending = null;
    if (!model) return;
    try {
      await saveModel(model);
      if (!pending) useUiStore.getState().setSaveStatus('saved');
    } catch {
      useUiStore.getState().setSaveStatus('error');
    }
  };

  const unsubscribe = useModelStore.subscribe((state, prev) => {
    if (state.model === prev.model) return;
    pending = state.model;
    useUiStore.getState().setSaveStatus('saving');
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void flush(), delayMs);
  });

  return () => {
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
  };
}

/** For tests: close and forget the connection so a fresh fake database can be used. */
export async function resetPersistenceForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}
