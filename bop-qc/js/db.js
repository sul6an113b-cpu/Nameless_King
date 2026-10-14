// IndexedDB storage. Everything stays on the device.
//
// Stores
//   meta      {key, value}            settings, counters, template edits, lastBackupAt
//   items     inspection records       (one per inspected item: line, pump, tank, area...)
//   punches   comments / punch items   (linked to an item, or standalone)
//   questions unknowns to ask on site
//   photos    photo metadata {id, ownerId, ownerType, role, createdAt, w, h, caption, rev}
//   blobs     photo bytes    {id, data: ArrayBuffer (jpeg), thumb: ArrayBuffer (jpeg), orig?: ArrayBuffer}
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
      // iOS can drop the connection while the app is in the background: reopen next time.
      db.onclose = () => {
        dbp = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbp = null;
      reject(req.error);
    };
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

// The connection was lost (WebKit: "Connection to Indexed Database server lost").
export function isConnLost(e) {
  return !!e && (e.name === 'InvalidStateError' || e.name === 'UnknownError' || /connection to indexed database|database connection is closing/i.test(e.message || ''));
}

// Run fn(db); if the connection was lost, reopen once and retry. A failed
// transaction never committed, so a retry cannot write twice.
async function run(fn) {
  try {
    return await fn(await open());
  } catch (e) {
    if (!isConnLost(e)) throw e;
    dbp = null;
    return fn(await open());
  }
}

export const get = (store, key) => run((db) => reqP(db.transaction(store).objectStore(store).get(key)));
export const all = (store) => run((db) => reqP(db.transaction(store).objectStore(store).getAll()));
export const byIndex = (store, index, value) => run((db) => reqP(db.transaction(store).objectStore(store).index(index).getAll(value)));
export const keys = (store) => run((db) => reqP(db.transaction(store).objectStore(store).getAllKeys()));

export const put = (store, obj) =>
  run((db) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    return done(tx);
  });

export const del = (store, key) =>
  run((db) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    return done(tx);
  });

// Write several records across stores in one transaction (all or nothing):
// [{store, op:'put'|'del', value|key}]
export async function batch(ops) {
  if (!ops.length) return;
  const stores = [...new Set(ops.map((o) => o.store))];
  return run((db) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const o of ops) {
      const s = tx.objectStore(o.store);
      if (o.op === 'del') s.delete(o.key);
      else s.put(o.value);
    }
    return done(tx);
  });
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
  return run(
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

export const clearAll = () =>
  run((db) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    return done(tx);
  });

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
