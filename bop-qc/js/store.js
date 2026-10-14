// App state and every write. The UI reads S.* and calls these functions.
//
// Rule for every change: build a new copy of the record, write it to IndexedDB,
// and only then put it in memory. A failed write throws and leaves the screen
// showing what is really stored.

import * as db from './db.js';
import { TYPES } from './checklists.js';
import { uuid, nowISO, noNum } from './util.js';
import { forgetURL } from './photo.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

export const RESULTS = {
  ok: { code: 'ok', label: 'OK', short: 'OK' },
  okc: { code: 'okc', label: 'OK with comments', short: 'OK w/c' },
  rej: { code: 'rej', label: 'Rejected', short: 'REJ' },
};

export const CHECK_STATES = {
  ok: 'OK',
  defect: 'Defect',
  unknown: 'Unknown – ask',
  na: 'N/A',
};

export const PUNCH_STATUS = {
  open: 'Open',
  ready: 'Ready for QC',
  closed: 'Closed (verified)',
};

// Category meanings are what the user stated. B+ was not defined, so it is
// stored as unconfirmed and shown as such until edited in Settings.
export const DEFAULT_CATEGORIES = [
  { code: 'A', meaning: 'Safety or equipment-damage risk. Blocks handover.', confirmed: true },
  { code: 'B+', meaning: '', confirmed: false },
  { code: 'B', meaning: 'Must close before hot commissioning.', confirmed: true },
  { code: 'C', meaning: 'Must close before initial acceptance.', confirmed: true },
  { code: 'D', meaning: 'Minor.', confirmed: true },
];

export const CODE_LIST = ['ASME B31.1', 'ASME B31.3', 'ASME B16.5', 'ASME Sec V', 'ASME Sec IX', 'API 650'];

export const DEFAULT_SETTINGS = {
  projectLabel: '',
  inspector: '',
  prefixItem: 'CHK',
  prefixPunch: 'P',
  prefixQuestion: 'Q',
  categories: DEFAULT_CATEGORIES,
  editions: Object.fromEntries(CODE_LIST.map((c) => [c, ''])),
  photoMaxPx: 1600,
  photoQuality: 0.72,
  reportPhotos: 'small',
  theme: 'auto',
};

// Every write runs one after another. Each one copies the record it changes,
// so two quick taps must not both copy the same old version (the second write
// would silently drop the first change).
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

export const S = {
  settings: clone(DEFAULT_SETTINGS),
  templates: { hidden: {}, custom: {} },
  lastBackupAt: null,
  restoreIncomplete: null,
  deviceCheck: null, // results of More → Device check on this phone
  items: new Map(),
  punches: new Map(),
  questions: new Map(),
  photos: new Map(), // ownerId -> [photo meta], oldest first (ownerId may be a draft key)
  drafts: new Map(), // draft key -> unsaved comment {text, cat, subcontractor, projectNo, at}
};

export async function load() {
  await db.open();
  const meta = new Map((await db.all('meta')).map((m) => [m.key, m.value]));
  const st = meta.get('settings');
  S.settings = { ...clone(DEFAULT_SETTINGS), ...(st || {}) };
  S.settings.editions = { ...DEFAULT_SETTINGS.editions, ...(S.settings.editions || {}) };
  if (!Array.isArray(S.settings.categories) || !S.settings.categories.length) S.settings.categories = clone(DEFAULT_CATEGORIES);
  S.templates = meta.get('templates') || { hidden: {}, custom: {} };
  S.templates.hidden ||= {};
  S.templates.custom ||= {};
  S.lastBackupAt = meta.get('lastBackupAt') || null;
  S.restoreIncomplete = meta.get('restoreIncomplete') || null;
  S.deviceCheck = meta.get('deviceCheck') || null;
  S.drafts = new Map([...meta].filter(([k]) => k.startsWith('draft:')));
  const [items, punches, questions, photos] = await Promise.all([db.all('items'), db.all('punches'), db.all('questions'), db.all('photos')]);
  S.items = new Map(items.map((x) => [x.id, x]));
  S.punches = new Map(punches.map((x) => [x.id, x]));
  S.questions = new Map(questions.map((x) => [x.id, x]));
  S.photos = new Map();
  photos.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  for (const p of photos) {
    if (!S.photos.has(p.ownerId)) S.photos.set(p.ownerId, []);
    S.photos.get(p.ownerId).push(p);
  }
}

// ---------- settings & templates ------------------------------------------

// The settings screen edits S.settings as you type; this writes a snapshot of it.
// It never puts an older copy back into memory, so typing during a save is not lost
// (writes run in order, so the last snapshot written is the newest).
async function _saveSettings(patch = {}) {
  Object.assign(S.settings, patch);
  await db.setMeta('settings', clone(S.settings));
}

// edit(t) changes a copy of the current templates; runs in the write queue so
// quick successive edits build on each other.
async function _editTemplates(edit) {
  const next = clone(S.templates);
  next.hidden ||= {};
  next.custom ||= {};
  edit(next);
  await db.setMeta('templates', next);
  S.templates = next;
}

async function _markBackedUp() {
  const t = nowISO();
  await db.setMeta('lastBackupAt', t);
  S.lastBackupAt = t;
}

export const typeInfo = (key) => TYPES.find((t) => t.key === key) || { key, label: key || 'Other', short: 'Other', checks: [] };

export function catInfo(code) {
  const c = S.settings.categories.find((x) => x.code === code);
  return c || { code: code || '', meaning: '', confirmed: false };
}

export const CAT_ORDER = () => S.settings.categories.map((c) => c.code);
export function catRank(code) {
  const i = CAT_ORDER().indexOf(code);
  return i < 0 ? 99 : i;
}

// Checkpoints a new item of this type starts with: library minus hidden, plus custom.
export function checklistFor(typeKey) {
  const t = typeInfo(typeKey);
  const hidden = new Set(S.templates.hidden[typeKey] || []);
  const base = t.checks.filter((c) => !hidden.has(c.id));
  const custom = (S.templates.custom[typeKey] || []).map((c) => ({ ...c, basis: 'custom', codeRef: '', defects: [], ask: '' }));
  return [...base, ...custom];
}

// ---------- items ----------------------------------------------------------

const pad4 = (n) => String(n).padStart(4, '0');

async function _createItem(fields) {
  const n = await db.nextSeq('item');
  const t = nowISO();
  const item = {
    id: uuid(),
    no: `${S.settings.prefixItem || 'CHK'}-${pad4(n)}`,
    createdAt: t,
    updatedAt: t,
    type: fields.type || 'free',
    tag: fields.tag || '',
    area: fields.area || '',
    system: fields.system || '',
    subcontractor: fields.subcontractor || '',
    location: fields.location || '',
    attended: fields.attended || '',
    refs: { ...(fields.refs || {}) },
    inspector: S.settings.inspector || '',
    prevId: fields.prevId || null,
    // Snapshot of the checklist so later template edits never change a past record.
    checks: checklistFor(fields.type).map((c) => ({
      id: c.id,
      group: c.group || '',
      text: c.text,
      basis: c.basis || '',
      codeRef: c.codeRef || '',
      ask: c.ask || '',
      defects: c.defects || [],
      state: null,
      note: '',
    })),
    result: null,
    resultNote: '',
    resultAt: null,
  };
  await db.put('items', item);
  S.items.set(item.id, item);
  return item;
}

// Write a set of changed records in one transaction, then swap them into memory.
async function commit(recs) {
  const t = nowISO();
  const ops = recs.map(([store, rec]) => {
    if (store !== 'photos') rec.updatedAt = t;
    return { store, op: 'put', value: rec };
  });
  await db.batch(ops);
  for (const [store, rec] of recs) {
    if (store === 'items') S.items.set(rec.id, rec);
    else if (store === 'punches') S.punches.set(rec.id, rec);
    else if (store === 'questions') S.questions.set(rec.id, rec);
  }
}

const itemCopy = (id) => {
  const it = S.items.get(id);
  return it ? clone(it) : null;
};

async function _updateItem(id, patch) {
  const old = S.items.get(id);
  if (!old) return null;
  const next = { ...clone(old), ...clone(patch) };
  const recs = [['items', next]];
  // Item-linked comments and questions carry copies of tag / area / subcontractor.
  // Follow a change only where the copy still equals the item's old value, so a
  // subcontractor set on one comment is never overwritten.
  const changed = (k) => k in patch && (patch[k] || '') !== (old[k] || '');
  for (const p of itemPunches(id)) {
    const np = clone(p);
    let ch = false;
    for (const k of ['tag', 'area']) {
      if (changed(k) && (np[k] || '') === (old[k] || '')) {
        np[k] = patch[k];
        ch = true;
      }
    }
    if (changed('subcontractor') && np.status !== 'closed' && (np.subcontractor || '') === (old.subcontractor || '')) {
      np.subcontractor = patch.subcontractor;
      np.history.push({ at: nowISO(), action: 'edited', note: `Subcontractor: ${old.subcontractor || '–'} → ${patch.subcontractor || '–'} (item edited)` });
      ch = true;
    }
    if (ch) recs.push(['punches', np]);
  }
  for (const q of itemQuestions(id)) {
    const nq = clone(q);
    let ch = false;
    for (const k of ['tag', 'area']) {
      if (changed(k) && (nq[k] || '') === (old[k] || '')) {
        nq[k] = patch[k];
        ch = true;
      }
    }
    if (ch) recs.push(['questions', nq]);
  }
  await commit(recs);
  return next;
}

async function _setCheck(itemId, checkId, patch) {
  const next = itemCopy(itemId);
  const c = next && next.checks.find((x) => x.id === checkId);
  if (!c) return null;
  Object.assign(c, patch);
  await commit([['items', next]]);
  return c;
}

async function _addItemCheck(itemId, text, group = 'Added on site') {
  const next = itemCopy(itemId);
  if (!next || !text.trim()) return null;
  const c = { id: `x_${uuid().slice(0, 8)}`, group, text: text.trim(), basis: 'custom', codeRef: '', ask: '', defects: [], state: null, note: '' };
  next.checks.push(c);
  await commit([['items', next]]);
  return c;
}

// Removing a checkpoint keeps its comments and questions: they become
// "not tied to a checkpoint" and keep the checkpoint text for context.
async function _removeItemCheck(itemId, checkId) {
  const next = itemCopy(itemId);
  if (!next) return;
  next.checks = next.checks.filter((c) => c.id !== checkId);
  const recs = [['items', next]];
  for (const p of itemPunches(itemId)) if (p.checkId === checkId) recs.push(['punches', { ...clone(p), checkId: null }]);
  for (const q of itemQuestions(itemId)) if (q.checkId === checkId) recs.push(['questions', { ...clone(q), checkId: null }]);
  await commit(recs);
}

async function _setResult(itemId, result, note) {
  const next = itemCopy(itemId);
  if (!next) return;
  next.result = result;
  next.resultNote = note || '';
  next.resultAt = result ? nowISO() : null;
  await commit([['items', next]]);
}

async function _deleteItem(id) {
  const ops = [{ store: 'items', op: 'del', key: id }];
  const owners = [id];
  for (const p of itemPunches(id)) {
    ops.push({ store: 'punches', op: 'del', key: p.id });
    owners.push(p.id);
  }
  for (const q of itemQuestions(id)) ops.push({ store: 'questions', op: 'del', key: q.id });
  for (const k of S.drafts.keys()) {
    if (k.startsWith(`draft:${id}:`)) {
      ops.push({ store: 'meta', op: 'del', key: k });
      owners.push(k);
    }
  }
  const photoIds = owners.flatMap((o) => (S.photos.get(o) || []).map((p) => p.id));
  for (const pid of photoIds) ops.push({ store: 'photos', op: 'del', key: pid }, { store: 'blobs', op: 'del', key: pid });
  await db.batch(ops);
  for (const p of itemPunches(id)) S.punches.delete(p.id);
  for (const q of itemQuestions(id)) S.questions.delete(q.id);
  for (const o of owners) {
    S.photos.delete(o);
    S.drafts.delete(o);
  }
  photoIds.forEach(forgetURL);
  S.items.delete(id);
}

export const itemPunches = (itemId) => [...S.punches.values()].filter((p) => p.itemId === itemId).sort(byNo);
export const itemQuestions = (itemId) => [...S.questions.values()].filter((q) => q.itemId === itemId).sort(byNo);
export const checkPunches = (itemId, checkId) => itemPunches(itemId).filter((p) => p.checkId === checkId);

function byNo(a, b) {
  return noNum(a.no) - noNum(b.no) || (a.no < b.no ? -1 : 1);
}

// ---------- punch items ----------------------------------------------------

// Creates the punch item, moves the draft's photos onto it, marks the
// checkpoint Defect and clears the draft - all in one transaction.
async function _createPunch(f, { draftKey = null } = {}) {
  const n = await db.nextSeq('punch');
  const t = nowISO();
  const item = f.itemId ? S.items.get(f.itemId) : null;
  const p = {
    id: uuid(),
    no: `${S.settings.prefixPunch || 'P'}-${pad4(n)}`,
    createdAt: t,
    updatedAt: t,
    itemId: f.itemId || null,
    checkId: f.checkId || null,
    checkText: f.checkText || '',
    category: f.category || '',
    text: f.text || '',
    projectNo: f.projectNo || '',
    tag: f.tag ?? (item ? item.tag : ''),
    area: f.area ?? (item ? item.area : ''),
    subcontractor: f.subcontractor ?? (item ? item.subcontractor : ''),
    status: 'open',
    readyAt: null,
    closedAt: null,
    verify: null,
    history: [{ at: t, action: 'raised', note: f.category ? `Cat ${f.category}` : '' }],
  };
  const ops = [{ store: 'punches', op: 'put', value: p }];
  let nextItem = null;
  if (item && f.checkId) {
    nextItem = clone(item);
    const c = nextItem.checks.find((x) => x.id === f.checkId);
    if (c && c.state !== 'defect') {
      c.state = 'defect';
      nextItem.updatedAt = t;
      ops.push({ store: 'items', op: 'put', value: nextItem });
    } else nextItem = null;
  }
  const moved = draftKey ? (S.photos.get(draftKey) || []).map((m) => ({ ...m, ownerType: 'punch', ownerId: p.id, updatedAt: t })) : [];
  for (const m of moved) ops.push({ store: 'photos', op: 'put', value: m });
  if (draftKey) ops.push({ store: 'meta', op: 'del', key: draftKey });
  await db.batch(ops);
  S.punches.set(p.id, p);
  if (nextItem) S.items.set(nextItem.id, nextItem);
  if (draftKey) {
    S.photos.delete(draftKey);
    S.drafts.delete(draftKey);
    if (moved.length) S.photos.set(p.id, moved);
  }
  return p;
}

const short = (s) => {
  s = String(s || '–').replace(/\s+/g, ' ');
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};
const FIELD_LABEL = { text: 'Description', subcontractor: 'Subcontractor', projectNo: 'Project no.', tag: 'Tag', area: 'Area' };

// Every change to what the punch item says is kept in its history (old → new).
async function _updatePunch(id, patch) {
  const old = S.punches.get(id);
  if (!old) return null;
  const next = clone(old);
  const t = nowISO();
  for (const [k, v] of Object.entries(patch)) {
    if ((old[k] || '') === (v || '')) continue;
    if (k === 'category') next.history.push({ at: t, action: 'category', note: `${old.category || '–'} → ${v}` });
    else if (FIELD_LABEL[k]) next.history.push({ at: t, action: 'edited', note: `${FIELD_LABEL[k]}: ${short(old[k])} → ${short(v)}` });
    next[k] = v;
  }
  if (next.history.length === old.history.length) return old; // nothing changed
  await commit([['punches', next]]);
  return next;
}

// open -> ready (construction reports done) -> closed (QC verified); any -> open (re-opened).
async function _setPunchStatus(id, status, { note = '', verify = null } = {}) {
  const old = S.punches.get(id);
  if (!old) return null;
  const p = clone(old);
  const t = nowISO();
  if (status === 'ready') {
    p.readyAt = t;
    p.history.push({ at: t, action: 'ready', note: note || 'Construction reports closed' });
  } else if (status === 'closed') {
    // readyAt stays empty if construction never reported it: no invented date.
    p.closedAt = t;
    p.verify = verify;
    p.history.push({ at: t, action: 'verified', note: note || 'Closure verified by QC' });
  } else if (status === 'open') {
    p.history.push({ at: t, action: 'reopened', note: note || 'Not closed' });
    p.readyAt = null;
    p.closedAt = null;
    if (verify) p.verify = verify;
    // An item-linked punch follows its item's current tag and area.
    const item = p.itemId ? S.items.get(p.itemId) : null;
    if (item) {
      p.tag = item.tag;
      p.area = item.area;
    }
  }
  p.status = status;
  await commit([['punches', p]]);
  return p;
}

async function _deletePunch(id) {
  const metas = S.photos.get(id) || [];
  const ops = [{ store: 'punches', op: 'del', key: id }];
  for (const ph of metas) ops.push({ store: 'photos', op: 'del', key: ph.id }, { store: 'blobs', op: 'del', key: ph.id });
  await db.batch(ops);
  metas.forEach((ph) => forgetURL(ph.id));
  S.punches.delete(id);
  S.photos.delete(id);
}

// ---------- questions (unknowns to ask on site) ----------------------------

async function _createQuestion(f) {
  const n = await db.nextSeq('question');
  const t = nowISO();
  const item = f.itemId ? S.items.get(f.itemId) : null;
  const q = {
    id: uuid(),
    no: `${S.settings.prefixQuestion || 'Q'}-${String(n).padStart(3, '0')}`,
    createdAt: t,
    updatedAt: t,
    itemId: f.itemId || null,
    checkId: f.checkId || null,
    checkText: f.checkText || '',
    text: f.text || '',
    askWho: f.askWho || '',
    answer: '',
    status: 'open',
    answeredAt: null,
    tag: item ? item.tag : f.tag || '',
    area: item ? item.area : f.area || '',
  };
  const ops = [{ store: 'questions', op: 'put', value: q }];
  let nextItem = null;
  if (item && f.checkId) {
    nextItem = clone(item);
    const c = nextItem.checks.find((x) => x.id === f.checkId);
    if (c && c.state !== 'unknown') {
      c.state = 'unknown';
      nextItem.updatedAt = t;
      ops.push({ store: 'items', op: 'put', value: nextItem });
    } else nextItem = null;
  }
  await db.batch(ops);
  S.questions.set(q.id, q);
  if (nextItem) S.items.set(nextItem.id, nextItem);
  return q;
}

async function _updateQuestion(id, patch) {
  const old = S.questions.get(id);
  if (!old) return null;
  const q = { ...clone(old), ...patch };
  if ('status' in patch && patch.status !== old.status) q.answeredAt = patch.status === 'answered' ? nowISO() : null;
  await commit([['questions', q]]);
  return q;
}

async function _deleteQuestion(id) {
  await db.del('questions', id);
  S.questions.delete(id);
}

// ---------- photos -----------------------------------------------------------

function ownerRecord(type, id) {
  if (type === 'item' && S.items.has(id)) return ['items', clone(S.items.get(id))];
  if (type === 'punch' && S.punches.has(id)) return ['punches', clone(S.punches.get(id))];
  return null;
}

// role: 'evidence' (item / punch as found) | 'closure' (punch after fix)
// ownerType 'draft': a photo taken in a comment that is not saved yet.
async function _addPhoto(ownerType, ownerId, role, processed) {
  const t = nowISO();
  const meta = { id: uuid(), ownerType, ownerId, role, createdAt: t, updatedAt: t, w: processed.w, h: processed.h, size: processed.data.byteLength, caption: '', rev: 0 };
  const ops = [
    { store: 'blobs', op: 'put', value: { id: meta.id, data: processed.data, thumb: processed.thumb } },
    { store: 'photos', op: 'put', value: meta },
  ];
  const owner = ownerRecord(ownerType, ownerId);
  if (owner) {
    owner[1].updatedAt = t;
    ops.push({ store: owner[0], op: 'put', value: owner[1] });
  }
  await db.batch(ops);
  if (owner) (owner[0] === 'items' ? S.items : S.punches).set(owner[1].id, owner[1]);
  if (!S.photos.has(ownerId)) S.photos.set(ownerId, []);
  S.photos.get(ownerId).push(meta);
  return meta;
}

export const photosOf = (ownerId, role) => (S.photos.get(ownerId) || []).filter((p) => !role || p.role === role);
export const blobOf = (id) => db.get('blobs', id);

export function findPhoto(id) {
  for (const list of S.photos.values()) {
    const p = list.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

function swapPhoto(next) {
  const list = S.photos.get(next.ownerId);
  const i = list ? list.findIndex((p) => p.id === next.id) : -1;
  if (i >= 0) list[i] = next;
}

async function _updatePhotoMeta(id, patch) {
  const m = findPhoto(id);
  if (!m) return null;
  const next = { ...m, ...patch, updatedAt: nowISO() };
  await db.put('photos', next);
  swapPhoto(next);
  return next;
}

// Mark-up replaces the shown image; the first original is kept in the blob
// record (orig / origThumb) so the as-found evidence can always be restored.
async function _replacePhotoData(id, processed) {
  const m = findPhoto(id);
  const b = m && (await db.get('blobs', id));
  if (!b) return null;
  const blob = { id, data: processed.data, thumb: processed.thumb, orig: b.orig || b.data, origThumb: b.origThumb || b.thumb };
  const next = { ...m, rev: (m.rev || 0) + 1, w: processed.w, h: processed.h, size: processed.data.byteLength, marked: true, updatedAt: nowISO() };
  await db.batch([
    { store: 'blobs', op: 'put', value: blob },
    { store: 'photos', op: 'put', value: next },
  ]);
  forgetURL(id);
  swapPhoto(next);
  return next;
}

async function _restoreOriginalPhoto(id) {
  const m = findPhoto(id);
  const b = m && (await db.get('blobs', id));
  if (!b || !b.orig) return null;
  const next = { ...m, rev: (m.rev || 0) + 1, size: b.orig.byteLength, marked: false, updatedAt: nowISO() };
  await db.batch([
    { store: 'blobs', op: 'put', value: { id, data: b.orig, thumb: b.origThumb || b.orig } },
    { store: 'photos', op: 'put', value: next },
  ]);
  forgetURL(id);
  swapPhoto(next);
  return next;
}

async function _deletePhoto(id) {
  await db.batch([
    { store: 'photos', op: 'del', key: id },
    { store: 'blobs', op: 'del', key: id },
  ]);
  for (const [owner, list] of S.photos) {
    const i = list.findIndex((p) => p.id === id);
    if (i >= 0) {
      list.splice(i, 1);
      if (!list.length) S.photos.delete(owner);
      break;
    }
  }
  forgetURL(id);
}

// ---------- drafts (unsaved comment text + photos survive an app restart) ----

export const draftKey = (itemId, checkId) => `draft:${itemId || 'none'}:${checkId || 'free'}`;

async function _saveDraft(key, value) {
  const v = { ...value, at: nowISO() };
  await db.setMeta(key, v);
  S.drafts.set(key, v);
}

async function _deleteDraft(key) {
  const metas = S.photos.get(key) || [];
  const ops = [{ store: 'meta', op: 'del', key }];
  for (const m of metas) ops.push({ store: 'photos', op: 'del', key: m.id }, { store: 'blobs', op: 'del', key: m.id });
  await db.batch(ops);
  metas.forEach((m) => forgetURL(m.id));
  S.photos.delete(key);
  S.drafts.delete(key);
}

export const hasDraft = (key) => S.drafts.has(key) || (S.photos.get(key) || []).length > 0;

// ---------- derived --------------------------------------------------------

export function punchStats(list) {
  const s = { open: 0, ready: 0, closed: 0, byCat: {} };
  for (const p of list) {
    s[p.status] = (s[p.status] || 0) + 1;
    if (p.status !== 'closed') s.byCat[p.category || '?'] = (s.byCat[p.category || '?'] || 0) + 1;
  }
  return s;
}

export function checkProgress(item) {
  const total = item.checks.length;
  let marked = 0, defect = 0, unknown = 0, ok = 0, na = 0;
  for (const c of item.checks) {
    if (c.state) marked++;
    if (c.state === 'defect') defect++;
    if (c.state === 'unknown') unknown++;
    if (c.state === 'ok') ok++;
    if (c.state === 'na') na++;
  }
  return { total, marked, defect, unknown, ok, na };
}

// Distinct non-empty values for type-ahead lists.
export function recent(field) {
  const counts = new Map();
  const add = (v) => v && counts.set(v, (counts.get(v) || 0) + 1);
  for (const i of S.items.values()) add(i[field]);
  if (field === 'subcontractor' || field === 'area') for (const p of S.punches.values()) add(p[field]);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v).slice(0, 30);
}

// ---------- public write API (serialized) -----------------------------------
export const markBackedUp = (...a) => serial(() => _markBackedUp(...a));
export const saveSettings = (...a) => serial(() => _saveSettings(...a));
export const editTemplates = (...a) => serial(() => _editTemplates(...a));
export const createItem = (...a) => serial(() => _createItem(...a));
export const updateItem = (...a) => serial(() => _updateItem(...a));
export const setCheck = (...a) => serial(() => _setCheck(...a));
export const addItemCheck = (...a) => serial(() => _addItemCheck(...a));
export const removeItemCheck = (...a) => serial(() => _removeItemCheck(...a));
export const setResult = (...a) => serial(() => _setResult(...a));
export const deleteItem = (...a) => serial(() => _deleteItem(...a));
export const createPunch = (...a) => serial(() => _createPunch(...a));
export const updatePunch = (...a) => serial(() => _updatePunch(...a));
export const setPunchStatus = (...a) => serial(() => _setPunchStatus(...a));
export const deletePunch = (...a) => serial(() => _deletePunch(...a));
export const createQuestion = (...a) => serial(() => _createQuestion(...a));
export const updateQuestion = (...a) => serial(() => _updateQuestion(...a));
export const deleteQuestion = (...a) => serial(() => _deleteQuestion(...a));
export const addPhoto = (...a) => serial(() => _addPhoto(...a));
export const updatePhotoMeta = (...a) => serial(() => _updatePhotoMeta(...a));
export const replacePhotoData = (...a) => serial(() => _replacePhotoData(...a));
export const restoreOriginalPhoto = (...a) => serial(() => _restoreOriginalPhoto(...a));
export const deletePhoto = (...a) => serial(() => _deletePhoto(...a));
export const saveDraft = (...a) => serial(() => _saveDraft(...a));
export const deleteDraft = (...a) => serial(() => _deleteDraft(...a));
