// App state and every write. The UI reads S.* and calls these functions;
// each function writes to IndexedDB before returning, so nothing is lost if
// iOS kills the app.

import * as db from './db.js';
import { TYPES } from './checklists.js';
import { uuid, nowISO, noNum } from './util.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
import { forgetURL } from './photo.js';

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

export const S = {
  settings: clone(DEFAULT_SETTINGS),
  templates: { hidden: {}, custom: {} },
  lastBackupAt: null,
  items: new Map(),
  punches: new Map(),
  questions: new Map(),
  photos: new Map(), // ownerId -> [photo meta], oldest first
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const changed = (what) => listeners.forEach((fn) => fn(what));

export async function load() {
  await db.open();
  const st = await db.getMeta('settings', null);
  S.settings = { ...clone(DEFAULT_SETTINGS), ...(st || {}) };
  S.settings.editions = { ...DEFAULT_SETTINGS.editions, ...(S.settings.editions || {}) };
  if (!Array.isArray(S.settings.categories) || !S.settings.categories.length) S.settings.categories = clone(DEFAULT_CATEGORIES);
  S.templates = (await db.getMeta('templates', null)) || { hidden: {}, custom: {} };
  S.templates.hidden ||= {};
  S.templates.custom ||= {};
  S.lastBackupAt = await db.getMeta('lastBackupAt', null);
  const [items, punches, questions, photos] = await Promise.all([
    db.all('items'),
    db.all('punches'),
    db.all('questions'),
    db.all('photos'),
  ]);
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

export async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await db.setMeta('settings', S.settings);
  changed('settings');
}

export async function saveTemplates() {
  await db.setMeta('templates', S.templates);
  changed('templates');
}

export async function markBackedUp() {
  S.lastBackupAt = nowISO();
  await db.setMeta('lastBackupAt', S.lastBackupAt);
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

export async function createItem(fields) {
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
  changed('items');
  return item;
}

async function saveItem(item) {
  item.updatedAt = nowISO();
  await db.put('items', item);
  S.items.set(item.id, item);
  changed('items');
  return item;
}

export async function updateItem(id, patch) {
  const item = S.items.get(id);
  if (!item) return null;
  Object.assign(item, patch);
  // Keep the copies of tag/area/subcontractor on this item's open punch items in step.
  const sync = {};
  for (const k of ['tag', 'area', 'subcontractor']) if (k in patch) sync[k] = patch[k];
  if (Object.keys(sync).length) {
    for (const p of itemPunches(id)) {
      if (p.status === 'closed') continue;
      Object.assign(p, sync);
      p.updatedAt = nowISO();
      await db.put('punches', p);
    }
    for (const q of itemQuestions(id)) {
      if ('tag' in sync) q.tag = sync.tag;
      if ('area' in sync) q.area = sync.area;
      await db.put('questions', q);
    }
  }
  return saveItem(item);
}

export async function setCheck(itemId, checkId, patch) {
  const item = S.items.get(itemId);
  const c = item && item.checks.find((x) => x.id === checkId);
  if (!c) return null;
  Object.assign(c, patch);
  await saveItem(item);
  return c;
}

export async function addItemCheck(itemId, text, group = 'Added on site') {
  const item = S.items.get(itemId);
  if (!item || !text.trim()) return null;
  const c = { id: `x_${uuid().slice(0, 8)}`, group, text: text.trim(), basis: 'custom', codeRef: '', ask: '', defects: [], state: null, note: '' };
  item.checks.push(c);
  await saveItem(item);
  return c;
}

export async function removeItemCheck(itemId, checkId) {
  const item = S.items.get(itemId);
  if (!item) return;
  item.checks = item.checks.filter((c) => c.id !== checkId);
  await saveItem(item);
}

export async function setResult(itemId, result, note) {
  const item = S.items.get(itemId);
  if (!item) return;
  item.result = result;
  item.resultNote = note || '';
  item.resultAt = result ? nowISO() : null;
  await saveItem(item);
}

export async function deleteItem(id) {
  const ops = [{ store: 'items', op: 'del', key: id }];
  const photoMetas = [...(S.photos.get(id) || [])];
  for (const p of itemPunches(id)) {
    ops.push({ store: 'punches', op: 'del', key: p.id });
    photoMetas.push(...(S.photos.get(p.id) || []));
    S.punches.delete(p.id);
    S.photos.delete(p.id);
  }
  for (const q of itemQuestions(id)) {
    ops.push({ store: 'questions', op: 'del', key: q.id });
    S.questions.delete(q.id);
  }
  for (const ph of photoMetas) {
    ops.push({ store: 'photos', op: 'del', key: ph.id }, { store: 'blobs', op: 'del', key: ph.id });
    forgetURL(ph.id);
  }
  await db.batch(ops);
  S.items.delete(id);
  S.photos.delete(id);
  changed('items');
}

export const itemPunches = (itemId) => [...S.punches.values()].filter((p) => p.itemId === itemId).sort(byNo);
export const itemQuestions = (itemId) => [...S.questions.values()].filter((q) => q.itemId === itemId).sort(byNo);
export const checkPunches = (itemId, checkId) => itemPunches(itemId).filter((p) => p.checkId === checkId);

function byNo(a, b) {
  return noNum(a.no) - noNum(b.no) || (a.no < b.no ? -1 : 1);
}

// ---------- punch items ----------------------------------------------------

export async function createPunch(f) {
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
  await db.put('punches', p);
  S.punches.set(p.id, p);
  changed('punches');
  return p;
}

export async function updatePunch(id, patch, historyNote) {
  const p = S.punches.get(id);
  if (!p) return null;
  if (patch.category && patch.category !== p.category) {
    p.history.push({ at: nowISO(), action: 'category', note: `${p.category || '–'} → ${patch.category}` });
  }
  Object.assign(p, patch);
  if (historyNote) p.history.push({ at: nowISO(), action: 'edited', note: historyNote });
  p.updatedAt = nowISO();
  await db.put('punches', p);
  changed('punches');
  return p;
}

// status transitions: open -> ready (construction says done) -> closed (QC verified)
// any -> open again (re-opened / not closed).
export async function setPunchStatus(id, status, { note = '', verify = null } = {}) {
  const p = S.punches.get(id);
  if (!p) return null;
  const t = nowISO();
  if (status === 'ready') {
    p.readyAt = t;
    p.history.push({ at: t, action: 'ready', note: note || 'Construction reports closed' });
  } else if (status === 'closed') {
    p.closedAt = t;
    if (!p.readyAt) p.readyAt = t;
    p.verify = verify;
    p.history.push({ at: t, action: 'verified', note: note || 'Closure verified by QC' });
  } else if (status === 'open') {
    p.history.push({ at: t, action: 'reopened', note: note || 'Not closed' });
    p.readyAt = null;
    p.closedAt = null;
    if (verify) p.verify = verify;
  }
  p.status = status;
  p.updatedAt = t;
  await db.put('punches', p);
  changed('punches');
  return p;
}

export async function deletePunch(id) {
  const ops = [{ store: 'punches', op: 'del', key: id }];
  for (const ph of S.photos.get(id) || []) {
    ops.push({ store: 'photos', op: 'del', key: ph.id }, { store: 'blobs', op: 'del', key: ph.id });
    forgetURL(ph.id);
  }
  await db.batch(ops);
  S.punches.delete(id);
  S.photos.delete(id);
  changed('punches');
}

// ---------- questions (unknowns to ask on site) ----------------------------

export async function createQuestion(f) {
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
  await db.put('questions', q);
  S.questions.set(q.id, q);
  changed('questions');
  return q;
}

export async function updateQuestion(id, patch) {
  const q = S.questions.get(id);
  if (!q) return null;
  Object.assign(q, patch);
  if ('status' in patch) q.answeredAt = patch.status === 'answered' ? nowISO() : null;
  q.updatedAt = nowISO();
  await db.put('questions', q);
  changed('questions');
  return q;
}

export async function deleteQuestion(id) {
  await db.del('questions', id);
  S.questions.delete(id);
  changed('questions');
}

// ---------- photos -----------------------------------------------------------

// role: 'evidence' (item / punch as found) | 'closure' (punch after fix)
export async function addPhoto(ownerType, ownerId, role, processed) {
  const meta = {
    id: uuid(),
    ownerType,
    ownerId,
    role,
    createdAt: nowISO(),
    w: processed.w,
    h: processed.h,
    size: processed.data.byteLength,
    caption: '',
    rev: 0,
  };
  await db.batch([
    { store: 'blobs', op: 'put', value: { id: meta.id, data: processed.data, thumb: processed.thumb } },
    { store: 'photos', op: 'put', value: meta },
  ]);
  if (!S.photos.has(ownerId)) S.photos.set(ownerId, []);
  S.photos.get(ownerId).push(meta);
  touchOwner(ownerType, ownerId);
  changed('photos');
  return meta;
}

export const photosOf = (ownerId, role) => (S.photos.get(ownerId) || []).filter((p) => !role || p.role === role);
export const blobOf = (id) => db.get('blobs', id);

export async function updatePhotoMeta(id, patch) {
  for (const list of S.photos.values()) {
    const m = list.find((p) => p.id === id);
    if (m) {
      Object.assign(m, patch);
      await db.put('photos', m);
      changed('photos');
      return m;
    }
  }
  return null;
}

export async function replacePhotoData(id, processed) {
  for (const list of S.photos.values()) {
    const m = list.find((p) => p.id === id);
    if (m) {
      forgetURL(id);
      m.rev = (m.rev || 0) + 1;
      m.w = processed.w;
      m.h = processed.h;
      m.size = processed.data.byteLength;
      m.marked = true;
      await db.batch([
        { store: 'blobs', op: 'put', value: { id, data: processed.data, thumb: processed.thumb } },
        { store: 'photos', op: 'put', value: m },
      ]);
      changed('photos');
      return m;
    }
  }
  return null;
}

export async function deletePhoto(id) {
  for (const [owner, list] of S.photos) {
    const i = list.findIndex((p) => p.id === id);
    if (i >= 0) {
      list.splice(i, 1);
      if (!list.length) S.photos.delete(owner);
      break;
    }
  }
  forgetURL(id);
  await db.batch([
    { store: 'photos', op: 'del', key: id },
    { store: 'blobs', op: 'del', key: id },
  ]);
  changed('photos');
}

function touchOwner(type, id) {
  const rec = type === 'item' ? S.items.get(id) : S.punches.get(id);
  if (!rec) return;
  rec.updatedAt = nowISO();
  db.put(type === 'item' ? 'items' : 'punches', rec);
}

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

export function invalidateAll() {
  changed('all');
}
