// IndexedDB storage. Everything stays on the device.
//
// Stores
//   meta      {key, value}            settings, counters, template edits, lastBackupAt
//   items     inspection records       (one per inspected item: line, pump, tank, area...)
//   punches   comments / punch items   (linked to an item, or standalone)
//   questions unknowns to ask on site
//   photos    photo metadata {id, ownerId, ownerType, role, createdAt, w, h, caption, rev}
//   blobs     photo bytes    {id, data: ArrayBuffer (jpeg), thumb: ArrayBuffer (jpeg)}
//             kept apart so metadata loads instantly and bytes load only when shown

const DB_NAME = 'bopqc';
const DB_VERSION = 1;
export const STORES = ['meta', 'items', 'punches', 'questions', 'photos', 'blobs'];

let dbp = null;

export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('punches')) {
        const s = db.createObjectStore('punches', { keyPath: 'id' });
        s.createIndex('itemId', 'itemId');
      }
      if (!db.objectStoreNames.contains('questions')) {
        const s = db.createObjectStore('questions', { keyPath: 'id' });
        s.createIndex('itemId', 'itemId');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const s = db.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('ownerId', 'ownerId');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgraded the schema: close so it can proceed, then reload.
      db.onversionchange = () => {
        db.close();
        location.reload();
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked by another open copy of the app. Close other tabs.'));
  });
  return dbp;
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });

const reqP = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export async function get(store, key) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).get(key));
}

export async function all(store) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, obj) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(obj);
  return done(tx);
}

export async function del(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return done(tx);
}

export async function byIndex(store, index, value) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).index(index).getAll(value));
}

// Write several records across stores in one transaction: [{store, op:'put'|'del', value|key}]
export async function batch(ops) {
  if (!ops.length) return;
  const db = await open();
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const o of ops) {
    const s = tx.objectStore(o.store);
    if (o.op === 'del') s.delete(o.key);
    else s.put(o.value);
  }
  return done(tx);
}

export async function getMeta(key, fallback) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}

// Allocate the next running number for a kind ('item' | 'punch' | 'question').
// Read-modify-write inside one transaction (callbacks only, no await inside the
// transaction - older Safari commits a transaction across a promise boundary).
function counterTx(kind, change) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        const s = tx.objectStore('meta');
        let result;
        const r = s.get('counters');
        r.onsuccess = () => {
          const cur = r.result || { key: 'counters', value: {} };
          result = change(cur.value[kind] || 0);
          cur.value[kind] = result;
          s.put(cur);
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      }),
  );
}

export const nextSeq = (kind) => counterTx(kind, (n) => n + 1);
export const bumpSeq = (kind, atLeast) => counterTx(kind, (n) => Math.max(n, atLeast));

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) tx.objectStore(s).clear();
  return done(tx);
}

// All keys of a store (cheap; used to walk photo bytes one at a time).
export async function keys(store) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).getAllKeys());
}

export async function estimate() {
  try {
    const e = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
    return { usage: e ? e.usage : null, quota: e ? e.quota : null, persisted };
  } catch {
    return { usage: null, quota: null, persisted: null };
  }
}

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {}
  return null;
}
