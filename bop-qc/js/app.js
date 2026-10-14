// BOP QC Walkdown - UI. Plain DOM, hash routes, everything saved on each tap.

import * as store from './store.js';
import { S, RESULTS, PUNCH_STATUS } from './store.js';
import * as X from './export.js';
import * as db from './db.js';
import { pickPhotos, processImage, markup, cachedURL, makeURL } from './photo.js';
import { TYPES, CLOSURE_CHECKS, SITE_QUESTIONS, GENERAL_DEFECTS, CHECKLIST_VERSION } from './checklists.js';
import { esc, fmtDate, fmtDateTime, daysBetween, debounce, bytes, isStandalone, isIOS } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const view = $('#view');
const bar = $('#bar');

// ---------------------------------------------------------------------------
// UI state (filters) - per session only
const UI = {
  items: { q: '', res: 'all' },
  punch: { st: 'notclosed', cat: '', area: '', q: '' },
  ask: { st: 'open', q: '' },
  exp: { area: '', sub: '', from: '', to: '', punchStatus: 'all', photos: 'small' },
};
try {
  const saved = JSON.parse(sessionStorage.getItem('bopqc-ui') || '{}');
  for (const k of Object.keys(UI)) if (saved[k]) Object.assign(UI[k], saved[k]);
} catch {}
const saveUI = () => {
  try {
    sessionStorage.setItem('bopqc-ui', JSON.stringify(UI));
  } catch {}
};
// ---------------------------------------------------------------------------
// small render helpers

const typeLabel = (key) => store.typeInfo(key).label;
const catCls = (code) => (code ? `cat-${code.replace('+', 'p')}` : 'cat-x');
const catBadge = (code) => `<span class="badge cat ${catCls(code)}">${esc(code || '–')}</span>`;
const resBadge = (r) => `<span class="badge r-${r || 'none'}">${r ? RESULTS[r].short : 'In progress'}</span>`;
const stBadge = (s) => `<span class="badge st-${s}">${esc(PUNCH_STATUS[s])}</span>`;
const basisChip = (b) =>
  b ? `<span class="basis ${esc(b)}">${{ code: 'Code', practice: 'Practice', project: 'Project – unknown', custom: 'Local' }[b] || esc(b)}</span>` : '';
const img = (id, size = 'thumb', cls = '', rev = 0) => `<img data-pid="${esc(id)}" data-size="${size}" data-rev="${rev}" class="${cls}" alt="">`;

function catMeaning(code) {
  const c = store.catInfo(code);
  if (!code) return '';
  if (!c.confirmed && !c.meaning) return `${code}: definition not confirmed – ask on site / edit in More`;
  return `${code}: ${c.meaning}${c.confirmed ? '' : ' (not confirmed)'}`;
}

function head(title, sub = '') {
  $('#title').textContent = title;
  $('#subtitle').textContent = sub;
  document.title = `${title} – BOP QC`;
}
function setBar(html) {
  bar.innerHTML = html;
}

let toastT;
function toast(msg, ms = 1800) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), ms);
}

function field(label, inner, hint = '') {
  return `<label class="field"><span>${esc(label)}</span>${inner}${hint ? `<small>${hint}</small>` : ''}</label>`;
}
function input(name, value, placeholder = '', list = '', extra = '') {
  // Tags and document numbers are usually upper case; free text is not.
  const cap = /autocapitalize/.test(extra) ? '' : `autocapitalize="${/^(tag|ref_|projectNo)/.test(name) ? 'characters' : 'words'}"`;
  return `<input type="text" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${list ? `list="${list}"` : ''} autocomplete="off" ${cap} ${extra}>`;
}
function datalist(id, values) {
  return `<datalist id="${id}">${values.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
}
function formData(root) {
  const o = {};
  $$('input[name], textarea[name], select[name]', root).forEach((el) => {
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
  });
  return o;
}

// Fill <img data-pid> from IndexedDB (photo bytes are loaded only when shown).
async function hydrate(root = document) {
  for (const el of $$('img[data-pid]:not([src])', root)) {
    const id = el.dataset.pid;
    const size = el.dataset.size || 'thumb';
    const rev = +el.dataset.rev || 0;
    let url = cachedURL(id, size, rev);
    if (!url) {
      const b = await store.blobOf(id);
      if (!b) continue;
      url = makeURL(id, size, rev, size === 'thumb' ? b.thumb || b.data : b.data);
    }
    el.src = url;
  }
}

// ---------------------------------------------------------------------------
// layers: bottom sheets and full-screen viewers
//
// iOS home-screen apps go Back on a left-edge swipe. Each open layer owns one
// history entry with the same URL, so a swipe closes the top layer instead of
// leaving the screen. A layer with unsaved input stays open on a swipe or a tap
// outside it (its Cancel button discards). Closing a layer with a button pops
// its entry; navigation waits until that pop has landed.

const layers = [];
let pendingBacks = 0;
let queuedNav = null;

function syncHistory() {
  for (const l of layers) {
    if (l.hasHist || l.closed) continue;
    try {
      history.pushState({ inApp: true, layer: true }, '');
      l.hasHist = true;
      l.histUrl = location.href;
    } catch {}
  }
}

// hash: '#/…' route, 'back' for one history step back, or 'leave:#/…' = go to that
// screen, stepping back if it is the entry below this one (no duplicate entries)
// and replacing this entry otherwise. Decided when it runs, after pending pops.
function nav(hash, replace = false) {
  if (pendingBacks) {
    queuedNav = { hash, replace };
    return;
  }
  if (hash === 'back') history.back();
  else if (hash.startsWith('leave:')) {
    const target = hash.slice(6);
    const st = history.state;
    if (st && st.inApp && st.below === norm(target)) history.back();
    else replaceRoute(target);
  } else if (replace) replaceRoute(hash);
  else location.hash = hash;
}

// Swap the current screen for another while keeping this history entry's state
// (a replaced first screen must stay "not in-app", or Back could leave the app).
function replaceRoute(hash) {
  try {
    history.replaceState(history.state || { inApp: false }, '', hash);
  } catch {
    location.replace(hash);
    return;
  }
  prevHash = curHash;
  curHash = location.hash;
  rememberRoute();
  closeAllLayers();
  render();
  window.scrollTo(0, 0);
}

const KEEP_MSG = 'Not saved yet – tap Cancel to discard';

window.addEventListener('popstate', () => {
  if (pendingBacks) {
    pendingBacks--;
    if (!pendingBacks) {
      if (queuedNav) {
        const q = queuedNav;
        queuedNav = null;
        nav(q.hash, q.replace);
      } else syncHistory();
    }
    return;
  }
  const top = layers[layers.length - 1];
  if (!top || !top.hasHist || top.histUrl !== location.href) return;
  if (top.isDirty && top.isDirty()) {
    // Keep unsaved input: take a history entry again and stay open.
    top.hasHist = false;
    syncHistory();
    toast(KEEP_MSG);
    return;
  }
  top.close('back');
});

function layer({ el, onClose, isDirty }) {
  const api = {
    el,
    closed: false,
    hasHist: false,
    isDirty,
    close(reason) {
      if (api.closed) return;
      api.closed = true;
      el.remove();
      const i = layers.indexOf(api);
      if (i >= 0) layers.splice(i, 1);
      // Remove this layer's history entry unless Back or navigation already did.
      if (api.hasHist && reason !== 'back' && reason !== 'nav') {
        pendingBacks++;
        history.back();
      }
      if (onClose) onClose(reason);
    },
  };
  document.body.appendChild(el);
  layers.push(api);
  if (!pendingBacks) syncHistory();
  return api;
}
const closeAllLayers = () => [...layers].reverse().forEach((l) => l.close('nav'));

// A failed handler re-enables the button that was tapped (so the user can retry)
// and lets the sheet recompute any gated buttons (onError).
function sheetError(e, api, b, onError) {
  fail(e);
  if (b) b.disabled = false;
  if (onError) onError(api);
}

// pre: content pinned above the footer (always visible, e.g. a required picker).
// isDirty: function, or 'form' = any typed field differs from when the sheet opened.
// api.msg(text) shows a message just above the buttons (never under the keyboard).
function sheet({ title, sub = '', body, pre = '', foot, onClick, onClose, onError, cls = '', isDirty }) {
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-h"><h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <div class="sheet-b">${body}</div>
    ${pre ? `<div class="sheet-pre">${pre}</div>` : ''}
    <div class="sheet-msg" role="alert"></div>
    ${foot ? `<div class="sheet-f">${foot}</div>` : ''}
  </div>`;
  let initial = null;
  const dirty = isDirty === 'form' ? () => JSON.stringify(formData(api.body)) !== initial : isDirty;
  const api = layer({ el: bd, onClose, isDirty: dirty });
  Object.assign(api, {
    root: bd.querySelector('.sheet'),
    body: bd.querySelector('.sheet-b'),
    pre: bd.querySelector('.sheet-pre'),
    foot: bd.querySelector('.sheet-f'),
    // tone: 'bad' (default) | 'ok' | 'info'
    msg(text, tone = 'bad') {
      const m = bd.querySelector('.sheet-msg');
      m.textContent = text || '';
      m.className = `sheet-msg ${tone}${text ? ' on' : ''}`;
    },
  });
  if (isDirty === 'form') initial = JSON.stringify(formData(api.body));
  isDirty = dirty;
  bd.addEventListener('click', (ev) => {
    if (ev.target === bd) {
      if (isDirty && isDirty()) return toast(KEEP_MSG);
      return api.close('backdrop');
    }
    const b = ev.target.closest('[data-s]');
    if (b && onClick) {
      ev.preventDefault();
      ev.stopPropagation();
      // A second tap while the first is still saving is ignored (no double records).
      if (b.dataset.busy) return;
      b.dataset.busy = '1';
      const free = () => delete b.dataset.busy;
      // Called synchronously: photo pickers and share need the tap's user gesture.
      let r;
      try {
        r = onClick(b.dataset.s, b, api, ev);
      } catch (e) {
        free();
        return sheetError(e, api, b, onError);
      }
      Promise.resolve(r).then(free, (e) => {
        free();
        sheetError(e, api, b, onError);
      });
    }
  });
  hydrate(bd);
  return api;
}

function confirmSheet(message, { ok = 'OK', danger = false, title = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    sheet({
      title,
      body: `<p>${message}</p>`,
      foot: `<button class="btn" data-s="no">Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-s="yes">${esc(ok)}</button>`,
      onClick(s, b, api) {
        answered = true;
        api.close();
        resolve(s === 'yes');
      },
      onClose() {
        if (!answered) resolve(false);
      },
    });
  });
}

let busyEl = null;
function busy(msg) {
  if (!busyEl) {
    busyEl = document.createElement('div');
    busyEl.className = 'backdrop busy';
    busyEl.innerHTML = '<div class="card" style="min-width:240px;text-align:center"><b class="msg"></b><div class="small muted prog"></div></div>';
    document.body.appendChild(busyEl);
  }
  busyEl.querySelector('.msg').textContent = msg;
  busyEl.querySelector('.prog').textContent = '';
  return {
    progress(t) {
      if (busyEl) busyEl.querySelector('.prog').textContent = t;
    },
    done() {
      if (busyEl) busyEl.remove();
      busyEl = null;
    },
  };
}

// In-app message (native alert() is blocked when the app runs inside another page).
function notice(title, html) {
  sheet({ title, body: `<div style="margin:8px 0">${html}</div>`, foot: '<button class="btn primary" data-s="ok">OK</button>', onClick: (s, b, api) => api.close() });
}

function fail(e) {
  console.error(e);
  const msg = esc(e && e.message ? e.message : String(e));
  if (e && e.partial) return notice('Restore not finished', `<p>${msg}</p>`);
  if (db.isConnLost(e)) {
    return notice('Storage connection lost', `<p><b>Your last change was NOT saved.</b> Close the app completely (swipe it away in the app switcher) and open it again.</p><p class="small muted">${msg}</p>`);
  }
  if (e && e.name === 'QuotaExceededError') {
    return notice('Phone storage full', '<p><b>Your last change was NOT saved.</b> Free space on the phone, or back up and delete old items with many photos.</p>');
  }
  notice('Something went wrong', `<p>${msg}</p><p class="small muted">Records saved before this are unchanged.</p>`);
}
// Anything that slipped past a handler still gets reported, never silently lost.
window.addEventListener('unhandledrejection', (ev) => {
  ev.preventDefault();
  fail(ev.reason);
});

// True when the page runs inside a frame (e.g. a preview on claude.ai), where
// offline use, saving files and sharing are blocked by the host.
const EMBEDDED = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

// Inside a claude.ai preview, files are saved through the host (it asks the
// viewer first). Top-level copies of the app have no window.claude: plain download.
let HOST_DL = null;
if (EMBEDDED && window.claude && typeof window.claude.use === 'function') {
  window.claude
    .use('downloads')
    .then((d) => (HOST_DL = d))
    .catch(() => {});
}

// Returns 'saved' (confirmed), 'started' (browser download, not confirmed) or false.
async function saveFile(file) {
  if (HOST_DL) {
    try {
      await HOST_DL.save({ filename: file.name, data: file });
      return 'saved';
    } catch (e) {
      if (e && e.code === 'declined') toast('Not saved');
      else if (e && e.code === 'rate_limited') toast('A save is already waiting for your answer');
      else notice('Could not save', `<p>${esc((e && e.message) || 'Saving is not available here.')}</p>`);
      return false;
    }
  }
  if (EMBEDDED) {
    notice('Saving is blocked here', '<p>This preview cannot save files. Use the installed app.</p>');
    return false;
  }
  X.downloadFile(file);
  return 'started';
}

// ---------------------------------------------------------------------------
// photos

// Tap handler for "add photo": camera=true opens the camera directly.
function addPhotos(ownerType, ownerId, role, camera, after) {
  pickPhotos(camera, async (files) => {
    const b = busy(files.length > 1 ? `Saving ${files.length} photos…` : 'Saving photo…');
    try {
      let n = 0;
      for (const f of files) {
        const p = await processImage(f, { maxPx: S.settings.photoMaxPx, quality: S.settings.photoQuality });
        await store.addPhoto(ownerType, ownerId, role, p);
        b.progress(`${++n} / ${files.length}`);
      }
      const what = ownerType === 'punch' ? (role === 'closure' ? 'After-fix' : 'As-found') : '';
      toast(files.length > 1 ? `${files.length} ${what ? what.toLowerCase() + ' ' : ''}photos saved` : `${what ? what + ' photo' : 'Photo'} saved`);
    } catch (e) {
      fail(e);
    } finally {
      b.done();
      if (after) after();
      else refresh();
    }
  });
}

function photoStrip(ownerType, ownerId, role, { label = 'Photo' } = {}) {
  const list = store.photosOf(ownerId, role);
  return `<div class="thumbs">
    <button class="add" data-a="photo-add" data-ot="${ownerType}" data-oid="${esc(ownerId)}" data-role="${role}" aria-label="Take ${esc(label)}"><span class="big">📷</span>${esc(label)}</button>
    ${list.map((p) => `<button class="thumbbtn" style="padding:0;border:0;background:none" data-a="photo-view" data-id="${esc(p.id)}" aria-label="Open photo">${img(p.id, 'thumb', '', p.rev)}</button>`).join('')}
  </div>
  <div class="row"><button class="btn small" data-a="photo-lib" data-ot="${ownerType}" data-oid="${esc(ownerId)}" data-role="${role}">From library…</button><span class="tiny muted">${list.length} photo${list.length === 1 ? '' : 's'}</span></div>`;
}

function openViewer(id) {
  let meta = store.findPhoto(id);
  if (!meta) return;
  const v = document.createElement('div');
  v.className = 'viewer';
  const L = layer({ el: v, onClose: () => refresh() });
  const paint = () => {
    meta = store.findPhoto(id) || meta;
    const isPunch = meta.ownerType === 'punch';
    const label = [isPunch ? (meta.role === 'closure' ? 'After fix' : 'As found') : '', meta.marked ? 'marked up' : ''].filter(Boolean).join(' · ');
    v.innerHTML = `<div class="stage">${img(meta.id, 'full', '', meta.rev)}</div>
      <div class="cap">${label ? `<div class="vlabel">${label}</div>` : ''}<input type="text" value="${esc(meta.caption || '')}" placeholder="Caption (optional)" aria-label="Caption" autocapitalize="sentences"></div>
      <div class="vbar">
        <button class="btn" data-v="close">Close</button><button class="btn" data-v="mark">✎ Mark up</button><button class="btn danger" data-v="del">Delete</button>
        ${meta.marked ? '<button class="btn" data-v="orig">Show original</button>' : ''}
        ${isPunch ? `<button class="btn" data-v="role">Move to “${meta.role === 'closure' ? 'as found' : 'after fix'}”</button>` : ''}
      </div>`;
    hydrate(v);
    const inp = v.querySelector('input');
    const save = debounce(() => store.updatePhotoMeta(meta.id, { caption: inp.value.trim() }).catch(fail), 500);
    inp.addEventListener('input', save);
    inp.addEventListener('blur', () => save.flush());
  };
  paint();
  v.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-v]');
    if (!b) return;
    try {
      const act = b.dataset.v;
      if (act === 'close') L.close('button');
      else if (act === 'del') {
        if (await confirmSheet('Delete this photo?', { ok: 'Delete', danger: true })) {
          await store.deletePhoto(meta.id);
          L.close('button');
          toast('Photo deleted');
        }
      } else if (act === 'role') {
        await store.updatePhotoMeta(meta.id, { role: meta.role === 'closure' ? 'evidence' : 'closure' });
        paint();
        toast(meta.role === 'closure' ? 'Now an “after fix” photo' : 'Now an “as found” photo');
      } else if (act === 'orig') {
        if (await confirmSheet('Go back to the original photo? The mark-up is removed.', { ok: 'Show original' })) {
          await store.restoreOriginalPhoto(meta.id);
          paint();
        }
      } else if (act === 'mark') {
        const blob = await store.blobOf(meta.id);
        if (!blob) return;
        const res = await markup(blob.data, {
          quality: Math.max(0.8, S.settings.photoQuality),
          // The mark-up screen is a layer too: Back cancels it.
          mount: (el, cancel) => {
            const ML = layer({ el, onClose: (reason) => (reason === 'back' || reason === 'nav') && cancel() });
            return { release: () => ML.close('done') };
          },
        });
        if (res) {
          await store.replacePhotoData(meta.id, res);
          paint();
          toast('Mark-up saved (original kept)');
        }
      }
    } catch (e) {
      fail(e);
    }
  });
}

// ---------------------------------------------------------------------------
// routing

const ROUTES = {
  items: { fn: scrItems, tab: 'items' },
  item: { fn: scrItem, detail: true },
  punch: { fn: scrPunchList, tab: 'punch' },
  p: { fn: scrPunch, detail: true },
  ask: { fn: scrAsk, tab: 'ask' },
  export: { fn: scrExport, tab: 'export' },
  more: { fn: scrMore, tab: 'more' },
  templates: { fn: scrTemplates, detail: true },
  help: { fn: scrHelp, detail: true },
  check: { fn: scrDeviceCheck, detail: true },
};

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  return { name: ROUTES[name] ? name : 'items', id: rest.length ? decodeURIComponent(rest.join('/')) : null };
}

function render() {
  const r = route();
  const R = ROUTES[r.name];
  document.body.classList.toggle('detail', !!R.detail);
  $$('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === R.tab));
  setBar('');
  R.fn(r.id);
  hydrate(view);
}

// Re-render the current screen, keeping the scroll position.
function refresh() {
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
}

const norm = (h) => (!h || h === '#' || h === '#/' ? '#/items' : h);
// prevHash: the screen before this one inside the app (null on the first screen).
let prevHash = null;
let curHash = location.hash;
// iOS may restart a backgrounded home-screen app at its start page: remember the
// screen so the next start can reopen it.
const ROUTE_KEY = 'bopqc-route';
function rememberRoute() {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify({ hash: location.hash, at: Date.now() }));
  } catch {}
}
function lastRoute() {
  try {
    const r = JSON.parse(localStorage.getItem(ROUTE_KEY) || 'null');
    return r && r.hash && Date.now() - r.at < 12 * 3600 * 1000 ? r.hash : null;
  } catch {
    return null;
  }
}
window.addEventListener('hashchange', () => {
  prevHash = curHash;
  curHash = location.hash;
  rememberRoute();
  closeAllLayers();
  // Mark only entries the app has just created (they have no state yet), and
  // remember which screen is below them. Revisited entries keep their own state,
  // so the first entry of the app is never mistaken for an in-app one.
  try {
    if (history.state == null) history.replaceState({ inApp: true, below: norm(prevHash) }, '');
  } catch {}
  render();
  window.scrollTo(0, 0);
});

function back(fallback) {
  if (history.state && history.state.inApp) nav('back');
  else nav(fallback);
}
const go = (hash) => nav(hash);

// ---------------------------------------------------------------------------
// global click actions (data-a)

const A = {};
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el || el.closest('.backdrop')) return;
  const fn = A[el.dataset.a];
  if (fn) {
    ev.preventDefault();
    // Ignore a second tap while the first one is still being saved.
    if (el.dataset.busy) return;
    el.dataset.busy = '1';
    let r;
    try {
      r = fn(el, ev);
    } catch (e) {
      delete el.dataset.busy;
      return fail(e);
    }
    Promise.resolve(r)
      .catch(fail)
      .finally(() => delete el.dataset.busy);
  }
});

A['photo-add'] = (el) => addPhotos(el.dataset.ot, el.dataset.oid, el.dataset.role, true);
A['photo-lib'] = (el) => addPhotos(el.dataset.ot, el.dataset.oid, el.dataset.role, false);
A['photo-view'] = (el) => openViewer(el.dataset.id);
A.back = (el) => back(el.dataset.fallback || '#/items');
A.go = (el) => go(el.dataset.href);

// ---------------------------------------------------------------------------
// ITEMS LIST

function previewBanner() {
  return EMBEDDED
    ? `<div class="banner info"><div class="grow small"><b>Preview.</b> This copy runs inside claude.ai: it does not work offline and cannot share files. Anything you enter stays in this browser only. For site use, install the app from its own web address (see More → Help).</div></div>`
    : '';
}

function updateBanner() {
  return UPDATE ? '<div class="banner info"><div class="grow small"><b>Update ready.</b> Your data is kept.</div><button class="btn small primary" data-a="apply-update">Update</button></div>' : '';
}

function banners() {
  let h = previewBanner() + updateBanner();
  if (S.restoreIncomplete) {
    h += `<div class="banner bad"><div class="grow small"><b>A restore did not finish.</b> This phone may hold only part of the backup. Run Export → Restore → Replace again with the same file.</div></div>`;
  }
  if (!EMBEDDED && isIOS() && !isStandalone()) {
    h += `<div class="banner"><div class="grow small"><b>You are in Safari, not the installed app.</b> Data typed here is kept apart from the app, and Safari may delete it after 7 days without use. Install: Share <span aria-hidden="true">⇪</span> → <b>Add to Home Screen</b>, then always open it from the icon.</div></div>`;
  }
  const count = S.items.size + S.punches.size;
  if (count) {
    const last = S.lastBackupAt;
    const age = last ? daysBetween(last) : null;
    const dirty = !last || [...S.items.values(), ...S.punches.values(), ...S.questions.values()].some((r) => (r.updatedAt || '') > last);
    if (dirty && (age === null || age >= 2)) {
      h += `<div class="banner"><div class="grow small"><b>Back up:</b> ${last ? `last backup ${age} day${age === 1 ? '' : 's'} ago` : 'no backup yet'}. Data lives only on this phone.</div><a class="btn small" href="#/export">Back up</a></div>`;
    }
  }
  return h;
}

function itemCard(i) {
  const pr = store.checkProgress(i);
  const ps = store.punchStats(store.itemPunches(i.id));
  const cats = Object.entries(ps.byCat)
    .sort((a, b) => store.catRank(a[0]) - store.catRank(b[0]))
    .map(([c, n]) => `<span class="badge cat ${catCls(c === '?' ? '' : c)}">${esc(c)} ${n}</span>`)
    .join('');
  const allClosed = i.result === 'okc' && ps.open + ps.ready === 0 && ps.closed > 0;
  const sub = [i.area, i.system, i.subcontractor].filter(Boolean).join(' · ');
  return `<a class="card" href="#/item/${encodeURIComponent(i.id)}">
    <div class="spread"><div class="grow">
      <div class="tiny muted">${esc(i.no)} · ${esc(typeLabel(i.type))} · ${esc(fmtDate(i.createdAt))}${i.prevId ? ' · re-inspection' : ''}</div>
      <h3 class="ellip">${esc(i.tag || '(no tag)')}</h3>
      ${sub ? `<div class="small muted ellip">${esc(sub)}</div>` : ''}
    </div>${resBadge(i.result)}</div>
    <div class="stat-row tiny muted">
      ${pr.total ? `<span>${pr.marked}/${pr.total} marked</span>` : ''}
      ${cats ? `<span>· open:</span>${cats}` : ''}
      ${ps.ready ? `<span class="badge st-ready">${ps.ready} ready for QC</span>` : ''}
      ${allClosed ? '<span class="badge st-closed">All comments closed</span>' : ps.closed ? `<span>· ${ps.closed} closed</span>` : ''}
    </div>
  </a>`;
}

function scrItems() {
  head('Items', S.settings.projectLabel || 'BOP QC walkdown');
  const f = UI.items;
  const all = [...S.items.values()];
  const n = (r) => all.filter((i) => (i.result || 'none') === r).length;
  const chips = [
    ['all', 'All', all.length],
    ['none', 'In progress', n('none')],
    ['ok', 'OK', n('ok')],
    ['okc', 'OK w/c', n('okc')],
    ['rej', 'Rejected', n('rej')],
  ];
  view.innerHTML = `${banners()}
    <input type="search" id="q" placeholder="Search tag, area, system, no." value="${esc(f.q)}" aria-label="Search items" autocomplete="off">
    <div class="chips" style="margin-top:8px">${chips.map(([k, l, c]) => `<button class="chip ${f.res === k ? 'on' : ''}" data-a="items-res" data-v="${k}">${l} <span class="n">${c}</span></button>`).join('')}</div>
    <div id="list"></div>`;
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    let list = all;
    if (f.res !== 'all') list = list.filter((i) => (i.result || 'none') === f.res);
    if (q) list = list.filter((i) => [i.no, i.tag, i.area, i.system, i.subcontractor, i.location, typeLabel(i.type)].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    $('#list').innerHTML = list.length
      ? list.map(itemCard).join('')
      : `<div class="empty">${all.length ? 'Nothing matches.' : 'No items yet.<br>Tap <b>+ New item check</b> to start a walkdown.'}</div>`;
  };
  draw();
  $('#q').addEventListener('input', (ev) => {
    f.q = ev.target.value;
    saveUI();
    draw();
  });
  setBar(`<button class="btn primary" data-a="new-item"><span class="big">+</span> New item check</button>`);
}
A['items-res'] = (el) => {
  UI.items.res = el.dataset.v;
  saveUI();
  refresh();
};

// ---------------------------------------------------------------------------
// NEW ITEM / EDIT ITEM

function itemForm(v) {
  const r = v.refs || {};
  const anyRef = v.location || v.attended || Object.values(r).some(Boolean);
  return `
    ${field('Tag / item ID', input('tag', v.tag, 'Line no., equipment tag, area name…'), 'Typed and kept on this phone only.')}
    ${field('Area', input('area', v.area, 'e.g. Water treatment', 'dl-area'))}
    ${field('System', input('system', v.system, 'e.g. Demin water', 'dl-system'))}
    ${field('Subcontractor', input('subcontractor', v.subcontractor, '', 'dl-sub'))}
    <details ${anyRef ? 'open' : ''}><summary>Location &amp; document refs (optional)</summary>
      ${field('Location', input('location', v.location, 'Rack, elevation, bay…'))}
      ${field('Attended / witnessed by', input('attended', v.attended, 'e.g. subcon QC, client QC'))}
      ${field('Drawing / isometric', input('ref_drawing', r.drawing))}
      ${field('P&ID', input('ref_pid', r.pid))}
      ${field('Test pack', input('ref_testPack', r.testPack))}
      ${field('ITP / procedure', input('ref_itp', r.itp))}
      ${field('Other ref', input('ref_other', r.other))}
    </details>
    ${datalist('dl-area', store.recent('area'))}${datalist('dl-system', store.recent('system'))}${datalist('dl-sub', store.recent('subcontractor'))}`;
}
function readItemForm(root) {
  const d = formData(root);
  return {
    tag: d.tag,
    area: d.area,
    system: d.system,
    subcontractor: d.subcontractor,
    location: d.location,
    attended: d.attended,
    refs: { drawing: d.ref_drawing, pid: d.ref_pid, testPack: d.ref_testPack, itp: d.ref_itp, other: d.ref_other },
  };
}

function newItemSheet(prefill = {}) {
  let type = prefill.type || null;
  const typesHTML = () =>
    TYPES.map((t) => `<button type="button" data-s="type" data-k="${t.key}" class="${type === t.key ? 'on' : ''}">${esc(t.label)}</button>`).join('');
  const sh = sheet({
    title: prefill.prevId ? 'Re-inspection' : 'New item check',
    sub: prefill.prevId ? 'Starts a fresh checklist linked to the earlier check.' : 'Pick what you are checking.',
    body: `<div class="sec-h" style="margin-top:8px">Type</div><div class="types">${typesHTML()}</div>
      <div class="sec-h">Item</div>${itemForm(prefill)}`,
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="start" ${type ? '' : 'disabled'}>Start check</button>`,
    isDirty: 'form',
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      if (s === 'type') {
        type = b.dataset.k;
        $$('.types button', api.root).forEach((x) => x.classList.toggle('on', x.dataset.k === type));
        $('[data-s="start"]', api.root).disabled = false;
        return;
      }
      if (s === 'start') {
        if (!type) return;
        b.disabled = true;
        const it = await store.createItem({ type, ...readItemForm(api.body), prevId: prefill.prevId || null });
        api.close();
        go(`#/item/${encodeURIComponent(it.id)}`);
      }
    },
  });
  return sh;
}
A['new-item'] = () => newItemSheet();

function editItemSheet(it) {
  sheet({
    title: 'Item details',
    sub: `${esc(it.no)} · ${esc(typeLabel(it.type))}`,
    body: itemForm(it),
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Save</button>`,
    isDirty: 'form',
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      await store.updateItem(it.id, readItemForm(api.body));
      api.close();
      refresh();
      toast('Saved');
    },
  });
}

// ---------------------------------------------------------------------------
// ITEM CHECK SCREEN

let curItem = null;

function chkRow(it, c) {
  const ps = store.checkPunches(it.id, c.id);
  const qs = store.itemQuestions(it.id).filter((q) => q.checkId === c.id);
  const st = c.state;
  const btn = (v, l) => `<button data-a="state" data-v="${v}" class="${st === v ? 'on' : ''}" aria-pressed="${st === v}">${l}</button>`;
  return `<div class="chk ${st ? 's-' + st : ''}" data-cid="${esc(c.id)}">
    <div class="chk-top"><div class="chk-text">${esc(c.text)}</div><button class="chk-info" data-a="chk-info" aria-label="Details, note, reference">ⓘ</button></div>
    <div class="chk-meta">${basisChip(c.basis)}${c.codeRef ? esc(c.codeRef.length > 70 ? `${c.codeRef.slice(0, 67)}… (ⓘ)` : c.codeRef) : ''}</div>
    <div class="seg">${btn('ok', '✓ OK')}${btn('defect', '✗ Defect')}${btn('unknown', '? Ask')}${btn('na', 'N/A')}</div>
    ${c.note ? `<div class="chk-note">${esc(c.note)}</div>` : ''}
    ${ps.length || qs.length
      ? `<div class="chk-links">${ps.map((p) => `<a href="#/p/${encodeURIComponent(p.id)}">${catBadge(p.category)} <span class="grow">${esc(p.no)} · ${esc(p.text)}</span>${p.status !== 'open' ? stBadge(p.status) : ''}</a>`).join('')}${qs
          .map((q) => `<button data-a="q-edit" data-id="${esc(q.id)}"><span class="badge" style="background:var(--unk-bg);color:var(--unk)">?</span><span class="grow">${esc(q.no)} · ${esc(q.text)}</span>${q.status === 'answered' ? '<span class="badge st-closed">Answered</span>' : ''}</button>`)
          .join('')}</div>`
      : ''}
  </div>`;
}

function scrItem(id) {
  const it = S.items.get(id);
  curItem = it;
  if (!it) {
    head('Not found');
    view.innerHTML = '<div class="empty">This item no longer exists.</div>';
    setBar(`<button class="btn" data-a="back" data-fallback="#/items">‹ Back</button>`);
    return;
  }
  head(`${it.no} · ${typeLabel(it.type)}`, it.tag || '(no tag)');
  const pr = store.checkProgress(it);
  const ps = store.itemPunches(it.id);
  const qs = store.itemQuestions(it.id);
  const prev = it.prevId ? S.items.get(it.prevId) : null;
  const later = [...S.items.values()].filter((x) => x.prevId === it.id);
  const r = it.refs || {};
  const refs = [['Location', it.location], ['Attended', it.attended], ['Drawing', r.drawing], ['P&ID', r.pid], ['Test pack', r.testPack], ['ITP', r.itp], ['Ref', r.other]].filter(([, v]) => v);

  let groups = '';
  let lastG = null;
  for (const c of it.checks) {
    if (c.group !== lastG) {
      groups += `<div class="grp-h">${esc(c.group || 'Checks')}</div>`;
      lastG = c.group;
    }
    groups += chkRow(it, c);
  }
  // Comments whose checkpoint was removed are shown with the free ones.
  const checkIds = new Set(it.checks.map((c) => c.id));
  const free = ps.filter((p) => !p.checkId || !checkIds.has(p.checkId));
  const freeQ = qs.filter((q) => !q.checkId || !checkIds.has(q.checkId));
  const drafts = [...new Set([...S.drafts.keys(), ...S.photos.keys()])].filter((k) => k.startsWith(`draft:${it.id}:`));
  const draftHTML = drafts
    .map((k) => {
      const cid = k.split(':')[2];
      const c = it.checks.find((x) => x.id === cid);
      const n = store.photosOf(k).length;
      return `<div class="banner"><div class="grow small"><b>Unsaved comment</b>${c ? ` on “${esc(c.text)}”` : ''}${n ? ` · ${n} photo${n === 1 ? '' : 's'}` : ''}</div><button class="btn small" data-a="draft-resume" data-cid="${esc(c ? cid : 'free')}">Resume</button></div>`;
    })
    .join('');

  view.innerHTML = `${draftHTML}
    <div class="card item-head">
      <div class="spread"><div class="grow"><div class="tag">${esc(it.tag || '(no tag)')}</div>
        <div class="small muted">${esc([it.area, it.system].filter(Boolean).join(' · ') || 'No area set')}</div>
        ${it.subcontractor ? `<div class="small">Subcon: <b>${esc(it.subcontractor)}</b></div>` : ''}
      </div>${resBadge(it.result)}</div>
      ${refs.length ? `<div class="kv">${refs.map(([k, v]) => `<div>${k}</div><div>${esc(v)}</div>`).join('')}</div>` : ''}
      ${prev ? `<div class="small" style="margin-top:6px">Re-inspection of <a href="#/item/${encodeURIComponent(prev.id)}">${esc(prev.no)}</a> (${esc(prev.result ? RESULTS[prev.result].label : 'in progress')})</div>` : ''}
      ${later.map((l) => `<div class="small" style="margin-top:6px">Re-inspected in <a href="#/item/${encodeURIComponent(l.id)}">${esc(l.no)}</a></div>`).join('')}
      ${it.result ? `<div class="small" style="margin-top:6px"><b>${esc(RESULTS[it.result].label)}</b> · ${esc(fmtDateTime(it.resultAt))}${it.resultNote ? `<br>${esc(it.resultNote)}` : ''}</div>` : ''}
      <div class="row" style="margin-top:8px"><button class="btn small" data-a="item-edit">Edit details</button><span class="tiny muted grow" style="text-align:right">${esc(fmtDateTime(it.createdAt))}${it.inspector ? ' · ' + esc(it.inspector) : ''}</span></div>
    </div>

    <div class="sec-h">Photos</div>
    ${photoStrip('item', it.id, 'evidence')}

    ${it.checks.length ? `<div class="sec-h">Checklist · ${pr.marked}/${pr.total} marked</div>
      <div class="progress" aria-hidden="true"><i style="width:${pr.total ? Math.round((pr.marked / pr.total) * 100) : 0}%"></i></div>
      <div class="spread"><div class="tiny muted" style="padding-top:8px">✓ ${pr.ok} · ✗ ${pr.defect} · ? ${pr.unknown} · N/A ${pr.na}</div>${pr.total - pr.marked ? '<button class="btn small" data-a="next-unmarked">Next unmarked ↓</button>' : ''}</div>` : ''}
    ${groups}
    <div class="row wrap" style="margin-top:10px">
      <button class="btn small" data-a="chk-add">+ Add checkpoint</button>
      ${pr.total - pr.marked ? `<button class="btn small" data-a="chk-all-ok">Mark ${pr.total - pr.marked} unmarked OK…</button>` : ''}
    </div>

    <div class="sec-h">Comments not tied to a checkpoint (${free.length})</div>
    ${free.map((p) => punchCard(p, true)).join('') || '<div class="small muted">None.</div>'}
    <button class="btn small" style="margin-top:8px" data-a="item-comment">+ Comment</button>

    <div class="sec-h">Questions (${freeQ.length})</div>
    ${freeQ.map((q) => qCard(q)).join('') || '<div class="small muted">None.</div>'}
    <button class="btn small" style="margin-top:8px" data-a="item-question">+ Question</button>

    <hr>
    <div class="row wrap">
      <button class="btn small" data-a="item-report">Report for this item</button>
      <button class="btn small" data-a="item-reinspect">Re-inspect (new check)</button>
      <button class="btn small" data-a="item-next">Next item, same area</button>
      <button class="btn small danger" data-a="item-del">Delete item</button>
    </div>
    <div class="tiny muted" style="margin-top:12px">Code references are generic. “verify clause/edition” = not confirmed; project editions: More → Code editions.</div>`;

  setBar(`<button class="btn icon" data-a="back" data-fallback="#/items" aria-label="Back">‹</button>
    <button class="btn icon" data-a="photo-add" data-ot="item" data-oid="${esc(it.id)}" data-role="evidence" aria-label="Take photo">📷</button>
    <button class="btn" data-a="item-comment">+ Comment</button>
    <button class="btn primary" data-a="item-result">Result</button>`);
}

const rowCheck = (el) => {
  const cid = el.closest('[data-cid]').dataset.cid;
  return { it: curItem, c: curItem.checks.find((x) => x.id === cid) };
};

A.state = async (el) => {
  const { it, c } = rowCheck(el);
  const v = el.dataset.v;
  const prev = c.state;
  // Defect / Ask open a sheet; the checkpoint shows the new state meanwhile and
  // goes back to what it was if nothing is saved.
  const revert = (state) => async () => {
    if (prev !== state) {
      await store.setCheck(it.id, c.id, { state: prev });
      refresh();
    }
  };
  if (v === 'defect') {
    if (prev !== 'defect') await store.setCheck(it.id, c.id, { state: 'defect' });
    refresh();
    commentSheet({ item: it, check: c }, { onCancel: revert('defect') });
    return;
  }
  if (v === 'unknown') {
    if (prev !== 'unknown') await store.setCheck(it.id, c.id, { state: 'unknown' });
    refresh();
    questionSheet({ item: it, check: c }, { onCancel: revert('unknown') });
    return;
  }
  if (prev === v) {
    await store.setCheck(it.id, c.id, { state: null });
  } else {
    const open = store.checkPunches(it.id, c.id).filter((p) => p.status !== 'closed');
    if (v === 'ok' && open.length) {
      const yes = await confirmSheet(`This checkpoint has ${open.length} comment(s) not yet verified closed (${open.map((p) => esc(p.no)).join(', ')}). Mark it OK anyway? The comments stay open in the punch list.`, { ok: 'Mark OK' });
      if (!yes) return;
    }
    await store.setCheck(it.id, c.id, { state: v });
  }
  refresh();
};

A['chk-info'] = (el) => {
  const { it, c } = rowCheck(el);
  sheet({
    title: 'Checkpoint',
    sub: esc(c.group || ''),
    body: `<p style="font-size:18px;font-weight:700;margin:8px 0">${esc(c.text)}</p>
      <div class="infobox">${basisChip(c.basis)} ${esc(X.basisLabel(c.basis))}${c.codeRef ? `<br><b>Ref:</b> ${esc(c.codeRef)}` : ''}${c.basis === 'project' ? '<br>The acceptance value comes from project documents – not built into this app.' : ''}</div>
      ${c.ask ? `<div class="infobox"><b>Question to ask if unknown:</b><br>${esc(c.ask)}</div>` : ''}
      ${field('Note for this checkpoint', `<textarea name="note" placeholder="Optional observation">${esc(c.note)}</textarea>`)}`,
    foot: `${c.basis === 'custom' ? '<button class="btn danger" data-s="remove">Remove</button>' : ''}<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Save</button>`,
    isDirty: 'form',
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      if (s === 'remove') {
        api.close();
        const linked = [...store.checkPunches(it.id, c.id), ...store.itemQuestions(it.id).filter((q) => q.checkId === c.id)].map((r) => esc(r.no));
        if (await confirmSheet(`Remove this checkpoint from this item?${linked.length ? `<br>${linked.join(', ')} stay on the item as comments not tied to a checkpoint.` : ''}`, { ok: 'Remove', danger: true })) {
          await store.removeItemCheck(it.id, c.id);
          refresh();
        }
        return;
      }
      await store.setCheck(it.id, c.id, { note: formData(api.body).note });
      api.close();
      refresh();
    },
  });
};

A['chk-add'] = () => {
  const it = curItem;
  sheet({
    title: 'Add checkpoint',
    sub: 'Only for this item. To add it to every new item of this type use More → Checklists.',
    body: field('Checkpoint', input('text', '', 'Short, e.g. “Drain valve plugged”', '', 'autocapitalize="sentences"')),
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Add</button>`,
    isDirty: 'form',
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      const t = formData(api.body).text;
      if (!t) return;
      await store.addItemCheck(it.id, t);
      api.close();
      refresh();
    },
  });
  setTimeout(() => $('.backdrop input[name=text]')?.focus(), 50);
};

A['chk-all-ok'] = async () => {
  const it = curItem;
  const un = it.checks.filter((c) => !c.state);
  if (!(await confirmSheet(`Mark the ${un.length} unmarked checkpoint(s) OK?<br><br>Only do this if you actually checked them.`, { ok: 'Mark OK' }))) return;
  await store.updateItem(it.id, { checks: it.checks.map((c) => (c.state ? c : { ...c, state: 'ok' })) });
  refresh();
};

A['draft-resume'] = (el) => {
  const c = curItem.checks.find((x) => x.id === el.dataset.cid) || null;
  commentSheet({ item: curItem, check: c });
};

A['next-unmarked'] = () => {
  const c = curItem.checks.find((x) => !x.state);
  const el = c && $(`.chk[data-cid="${CSS.escape(c.id)}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
A['item-report'] = async () => {
  const b = busy('Preparing…');
  try {
    const file = await X.reportFile(X.scope({ itemIds: [curItem.id] }), 'small');
    b.done();
    fileSheet(file, { isReport: true });
  } catch (e) {
    b.done();
    fail(e);
  }
};
A['item-edit'] = () => editItemSheet(curItem);
A['item-comment'] = () => commentSheet({ item: curItem, check: null });
A['item-question'] = () => questionSheet({ item: curItem, check: null });
A['item-result'] = () => resultSheet(curItem);
A['item-next'] = () => {
  const it = curItem;
  newItemSheet({ type: it.type, area: it.area, system: it.system, subcontractor: it.subcontractor });
};
A['item-reinspect'] = async () => {
  const it = curItem;
  newItemSheet({ ...it, prevId: it.id });
};
A['item-del'] = async () => {
  const it = curItem;
  const np = store.itemPunches(it.id).length;
  const nq = store.itemQuestions(it.id).length;
  const nph = store.photosOf(it.id).length;
  if (!(await confirmSheet(`Delete <b>${esc(it.no)}</b> (${esc(it.tag || 'no tag')})?<br>This also deletes ${np} comment(s), ${nq} question(s) and their photos (${nph} item photo(s)). This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
  await store.deleteItem(it.id);
  nav('leave:#/items');
  toast('Item deleted');
};

// ---------------------------------------------------------------------------
// RESULT

function resultSheet(it) {
  let sel = it.result;
  const pr = store.checkProgress(it);
  const ps = store.itemPunches(it.id);
  const open = ps.filter((p) => p.status !== 'closed');
  const catA = open.filter((p) => p.category === 'A');
  const qOpen = store.itemQuestions(it.id).filter((q) => q.status === 'open');
  const warnings = () => {
    const w = [];
    if (sel === 'ok' && open.length) w.push(['bad', `${open.length} comment(s) still open on this item. “OK” means no comments – use “OK with comments”, or verify the comments closed first.`]);
    if (sel === 'okc' && !ps.length) w.push(['', 'No comments recorded. Add the comments the subcontractor must fix.']);
    if (catA.length && sel && sel !== 'rej') w.push(['bad', `Cat A comment open (${catA.map((p) => esc(p.no)).join(', ')}): safety / equipment-damage risk, blocks handover. Confirm the result.`]);
    if (pr.total - pr.marked) w.push(['', `${pr.total - pr.marked} checkpoint(s) not marked – they show as “Not marked” in the report.`]);
    if (pr.defect && !ps.length) w.push(['', 'Checkpoints marked Defect but no comment recorded.']);
    if (qOpen.length) w.push(['', `${qOpen.length} open question(s) on this item.`]);
    if (sel === 'rej') w.push(['', 'Rejected: write the reason below.']);
    return w.map(([c, t]) => `<div class="warnbox ${c}">${t}</div>`).join('');
  };
  const counts = Object.entries(store.punchStats(ps).byCat)
    .sort((a, b) => store.catRank(a[0]) - store.catRank(b[0]))
    .map(([c, n]) => `${catBadge(c)} ${n}`)
    .join(' ');
  const sh = sheet({
    title: 'Item result',
    sub: `${esc(it.no)} · ${esc(it.tag || '(no tag)')}`,
    body: `<div class="small muted" style="margin:8px 0">Checklist ${pr.marked}/${pr.total} · comments ${ps.length} (open ${open.length}) ${counts}</div>
      <div class="results">
        <button class="r-ok ${sel === 'ok' ? 'on' : ''}" data-s="pick" data-v="ok">✓ OK</button>
        <button class="r-okc ${sel === 'okc' ? 'on' : ''}" data-s="pick" data-v="okc">OK with comments</button>
        <button class="r-rej ${sel === 'rej' ? 'on' : ''}" data-s="pick" data-v="rej">✗ Rejected</button>
      </div>
      <div id="warn">${warnings()}</div>
      ${field('Result note', `<textarea name="note" placeholder="Reason / summary (required for Rejected)">${esc(it.resultNote)}</textarea>`)}`,
    foot: `${it.result ? '<button class="btn" data-s="clear">Clear</button>' : '<button class="btn" data-s="cancel">Cancel</button>'}
      <button class="btn" data-s="next">Save &amp; next</button>
      <button class="btn primary" data-s="save">Save</button>`,
    isDirty: 'form',
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      if (s === 'pick') {
        sel = b.dataset.v;
        $$('.results button', api.root).forEach((x) => x.classList.toggle('on', x.dataset.v === sel));
        $('#warn', api.root).innerHTML = warnings();
        return;
      }
      if (s === 'clear') {
        await store.setResult(it.id, null, '');
        api.close();
        refresh();
        return;
      }
      const note = formData(api.body).note;
      if (!sel) return api.msg('Pick OK, OK with comments or Rejected.');
      if (sel === 'rej' && !note) {
        api.msg('Write the reason for rejection.');
        $('textarea', api.body).focus();
        return;
      }
      await store.setResult(it.id, sel, note);
      api.close();
      toast(`Saved: ${RESULTS[sel].label}`);
      if (s === 'next') newItemSheet({ type: it.type, area: it.area, system: it.system, subcontractor: it.subcontractor });
      refresh();
    },
  });
  return sh;
}

// ---------------------------------------------------------------------------
// COMMENT (punch) SHEET - new comment from a checkpoint or free

function catPicker(selected) {
  return `<div class="cats ${selected ? '' : 'none'}">${S.settings.categories
    .map((c) => `<button type="button" class="cat ${catCls(c.code)} ${selected === c.code ? 'on' : ''}" data-s="cat" data-v="${esc(c.code)}" aria-pressed="${selected === c.code}">${esc(c.code)}</button>`)
    .join('')}</div><div class="cat-meaning ${selected && !store.catInfo(selected).confirmed ? 'warn' : ''}">${esc(selected ? catMeaning(selected) : 'Pick a category')}</div>`;
}

// Typed text, category and photos are saved as a draft on the phone straight
// away, so an app restart (e.g. iOS closing it while the camera is open) loses nothing.
function commentSheet({ item, check }, { onCancel } = {}) {
  const key = store.draftKey(item.id, check ? check.id : null);
  const draft = S.drafts.get(key) || {};
  let cat = draft.cat || '';
  let done = false; // saved or discarded
  let saving = false; // Save in progress: no draft writes may follow it
  const picks = check && check.defects && check.defects.length ? check.defects : GENERAL_DEFECTS;
  const restored = !!(draft.text || store.photosOf(key).length);
  const photosHTML = () =>
    store
      .photosOf(key)
      .map((m) => `<button type="button" class="thumbbtn" data-s="draft-photo" data-id="${esc(m.id)}" aria-label="Photo – tap to remove">${img(m.id, 'thumb', '', m.rev)}</button>`)
      .join('');
  let sh;
  const values = () => {
    const d = formData(sh.body);
    return { text: d.text, cat, subcontractor: d.subcontractor, projectNo: d.projectNo };
  };
  const keepDraft = debounce(() => {
    if (!done && !saving) store.saveDraft(key, values()).catch(fail);
  }, 400);
  const isDirty = () => !done && (!!formData(sh.body).text || !!cat || store.photosOf(key).length > 0);
  const discard = async () => {
    done = true;
    if (store.hasDraft(key)) await store.deleteDraft(key);
  };
  sh = sheet({
    title: check ? 'Defect comment' : 'Comment',
    sub: `${esc(item.no)} · ${esc(item.tag || '(no tag)')}${check ? `<br><b>${esc(check.text)}</b>` : ''}`,
    body: `${restored ? '<div class="infobox">Unsaved comment restored.</div>' : ''}
      ${field('Comment', `<textarea name="text" placeholder="What is wrong / what must be done" autocapitalize="sentences">${esc(draft.text || '')}</textarea>`)}
      <div class="chips wrap picks" aria-label="Quick pick">${picks.map((t) => `<button type="button" class="chip" data-s="pick">${esc(t)}</button>`).join('')}</div>
      ${field('Subcontractor to fix', input('subcontractor', draft.subcontractor ?? item.subcontractor, '', 'dl-sub2'))}${datalist('dl-sub2', store.recent('subcontractor'))}
      ${field('Project punch no. (if already on the project list)', input('projectNo', draft.projectNo || ''))}
      <div class="sec-h">Photos</div>
      <div class="thumbs"><button type="button" class="add" data-s="photo"><span class="big">📷</span>Photo</button><span id="pend" class="thumbs" style="padding:0">${photosHTML()}</span></div>
      <div class="row"><button type="button" class="btn small" data-s="photo-lib">From library…</button><span class="tiny muted">Tap a photo to remove it.</span></div>`,
    pre: `<div id="catp">${catPicker(cat)}</div>`,
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Save comment</button>`,
    isDirty,
    onClose(reason) {
      // Leaving the screen keeps the draft; it is offered again on the item.
      if (!done && !saving && reason === 'nav') keepDraft.flush();
      else if (!done && reason !== 'nav') discard().catch(fail);
      if (reason !== 'saved' && onCancel) onCancel(reason);
    },
    async onClick(s, b, api) {
      const ta = $('textarea[name=text]', api.body);
      if (s === 'cancel') {
        const n = store.photosOf(key).length;
        if (n && !(await confirmSheet(`Discard this comment and its ${n} photo(s)?`, { ok: 'Discard', danger: true }))) return;
        await discard();
        return api.close('cancel');
      }
      if (s === 'pick') {
        const t = b.textContent.trim();
        ta.value = ta.value.trim() ? `${ta.value.trim().replace(/[.;]$/, '')}; ${t}` : t;
        keepDraft();
        return;
      }
      if (s === 'cat') {
        cat = b.dataset.v;
        $('#catp', api.root).innerHTML = catPicker(cat);
        api.msg('');
        keepDraft();
        return;
      }
      if (s === 'photo' || s === 'photo-lib') {
        pickPhotos(s === 'photo', async (files) => {
          const bz = busy('Saving photo…');
          try {
            for (const f of files) {
              const ph = await processImage(f, { maxPx: S.settings.photoMaxPx, quality: S.settings.photoQuality });
              await store.addPhoto('draft', key, 'evidence', ph);
            }
            await store.saveDraft(key, values());
          } catch (e) {
            fail(e);
          } finally {
            bz.done();
            $('#pend', api.body).innerHTML = photosHTML();
            hydrate(api.body);
          }
        });
        return;
      }
      if (s === 'draft-photo') {
        if (await confirmSheet('Remove this photo from the comment?', { ok: 'Remove', danger: true })) {
          await store.deletePhoto(b.dataset.id);
          $('#pend', api.body).innerHTML = photosHTML();
          hydrate(api.body);
        }
        return;
      }
      if (s === 'save') {
        const d = formData(api.body);
        if (!d.text) {
          api.msg('Write the comment.');
          ta.focus();
          return;
        }
        if (!cat) return api.msg('Pick a category (A / B+ / B / C / D).');
        b.disabled = true;
        saving = true;
        keepDraft.cancel();
        let p;
        try {
          p = await store.createPunch(
            { itemId: item.id, checkId: check ? check.id : null, checkText: check ? check.text : '', category: cat, text: d.text, subcontractor: d.subcontractor, projectNo: d.projectNo },
            { draftKey: key },
          );
        } catch (e) {
          saving = false;
          throw e;
        }
        done = true;
        api.close('saved');
        refresh();
        toast(`${p.no} saved (Cat ${cat})`);
      }
    },
  });
  sh.body.addEventListener('input', keepDraft);
  return sh;
}

// ---------------------------------------------------------------------------
// QUESTIONS

function questionSheet({ item, check, q }, { onCancel } = {}) {
  let saved = false;
  const isNew = !q;
  const text = q ? q.text : check && check.ask ? check.ask : check ? `Confirm requirement: ${check.text}` : '';
  sheet({
    title: isNew ? 'Question to ask on site' : `${q.no}`,
    sub: item ? `${esc(item.no)} · ${esc(item.tag || '(no tag)')}${check ? `<br><b>${esc(check.text)}</b>` : ''}` : q && q.tag ? esc(q.tag) : '',
    body: `${field('Question', `<textarea name="text" autocapitalize="sentences">${esc(text)}</textarea>`, 'Unknowns are recorded as questions – never as a guessed value.')}
      ${field('Ask who (optional)', input('askWho', q ? q.askWho : '', 'Role, e.g. piping engineer, client QC'))}
      ${isNew ? '' : field('Answer', `<textarea name="answer" placeholder="Answer when you get it">${esc(q.answer)}</textarea>`)}`,
    foot: isNew
      ? `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Save question</button>`
      : `<button class="btn danger" data-s="del">Delete</button><button class="btn" data-s="toggle">${q.status === 'answered' ? 'Re-open' : 'Answered'}</button><button class="btn primary" data-s="save">Save</button>`,
    isDirty: 'form',
    onClose() {
      if (!saved && onCancel) onCancel();
    },
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close('cancel');
      const d = formData(api.body);
      if (s === 'del') {
        if (await confirmSheet(`Delete ${esc(q.no)}?`, { ok: 'Delete', danger: true })) {
          await store.deleteQuestion(q.id);
          saved = true;
          api.close('saved');
          refresh();
        }
        return;
      }
      if (!d.text) return api.msg('Write the question.');
      b.disabled = true;
      if (isNew) {
        // Also marks the checkpoint "Unknown – ask" in the same write.
        const nq = await store.createQuestion({ itemId: item ? item.id : null, checkId: check ? check.id : null, checkText: check ? check.text : '', text: d.text, askWho: d.askWho });
        toast(`${nq.no} saved`);
      } else {
        const patch = { text: d.text, askWho: d.askWho, answer: d.answer };
        if (s === 'toggle') patch.status = q.status === 'answered' ? 'open' : 'answered';
        else if (d.answer && q.status === 'open') patch.status = 'answered';
        await store.updateQuestion(q.id, patch);
        toast('Saved');
      }
      saved = true;
      api.close('saved');
      refresh();
    },
  });
}
A['q-edit'] = (el) => {
  const q = S.questions.get(el.dataset.id);
  if (q) questionSheet({ item: q.itemId ? S.items.get(q.itemId) : null, check: null, q });
};

function qCard(q) {
  const item = q.itemId ? S.items.get(q.itemId) : null;
  return `<button class="card" data-a="q-edit" data-id="${esc(q.id)}">
    <div class="spread"><div class="grow"><div class="tiny muted">${esc(q.no)}${item ? ` · ${esc(item.no)}` : ''}${q.tag ? ` · ${esc(q.tag)}` : ''}</div>
    <div style="font-weight:600">${esc(q.text)}</div>
    ${q.checkText ? `<div class="tiny muted">Checkpoint: ${esc(q.checkText)}</div>` : ''}
    ${q.askWho ? `<div class="tiny muted">Ask: ${esc(q.askWho)}</div>` : ''}
    ${q.answer ? `<div class="small" style="margin-top:4px"><b>Answer:</b> ${esc(q.answer)}</div>` : ''}</div>
    ${q.status === 'answered' ? '<span class="badge st-closed">Answered</span>' : '<span class="badge" style="background:var(--unk-bg);color:var(--unk)">Open</span>'}</div>
  </button>`;
}

// Things the app itself does not know - offered as ready-made questions.
function suggestedQuestions() {
  const out = [];
  for (const c of S.settings.categories) if (!c.confirmed) out.push(`What is the project definition of punch category ${c.code}?`);
  for (const [code, ed] of Object.entries(S.settings.editions)) if (!ed) out.push(`Which edition of ${code} applies to this project?`);
  out.push('Which BOP systems are designed to ASME B31.1 and which to B31.3 on this project?');
  const types = new Set([...S.items.values()].map((i) => i.type));
  for (const t of types) for (const q of SITE_QUESTIONS[t] || []) out.push(q);
  const have = new Set([...S.questions.values()].map((q) => q.text.trim().toLowerCase()));
  return [...new Set(out)].filter((q) => !have.has(q.trim().toLowerCase()));
}

function scrAsk() {
  head('Questions', 'Unknowns to ask on site');
  const f = UI.ask;
  const all = [...S.questions.values()].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const n = (s) => all.filter((q) => q.status === s).length;
  const sugg = suggestedQuestions();
  view.innerHTML = `
    <input type="search" id="q" placeholder="Search questions" value="${esc(f.q)}" aria-label="Search questions" autocomplete="off">
    <div class="chips" style="margin-top:8px">
      ${[['open', 'Open', n('open')], ['answered', 'Answered', n('answered')], ['all', 'All', all.length]].map(([k, l, c]) => `<button class="chip ${f.st === k ? 'on' : ''}" data-a="ask-st" data-v="${k}">${l} <span class="n">${c}</span></button>`).join('')}
    </div>
    <div id="list"></div>
    ${sugg.length ? `<details><summary>Suggested questions (${sugg.length})</summary>
      <div class="small muted">Things this app does not know for your project. Tap + to add to your list.</div>
      ${sugg.map((q) => `<div class="list-row"><div class="grow small">${esc(q)}</div><button class="btn small" data-a="ask-add-sugg" data-t="${esc(q)}" aria-label="Add question">+</button></div>`).join('')}
    </details>` : ''}`;
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    let list = all;
    if (f.st !== 'all') list = list.filter((x) => x.status === f.st);
    if (q) list = list.filter((x) => [x.no, x.text, x.answer, x.tag, x.area, x.askWho, x.checkText].join(' ').toLowerCase().includes(q));
    $('#list').innerHTML = list.map(qCard).join('') || `<div class="empty">${all.length ? 'Nothing here.' : 'No questions yet.<br>Mark a checkpoint “? Ask” to record an unknown.'}</div>`;
  };
  draw();
  $('#q').addEventListener('input', (ev) => {
    f.q = ev.target.value;
    saveUI();
    draw();
  });
  setBar(`<button class="btn primary" data-a="ask-new"><span class="big">+</span> Question</button>`);
}
A['ask-st'] = (el) => {
  UI.ask.st = el.dataset.v;
  saveUI();
  refresh();
};
A['ask-new'] = () => questionSheet({ item: null, check: null });
A['ask-add-sugg'] = async (el) => {
  await store.createQuestion({ text: el.dataset.t });
  toast('Added');
  refresh();
};

// ---------------------------------------------------------------------------
// PUNCH LIST

function punchCard(p, compact = false) {
  const item = p.itemId ? S.items.get(p.itemId) : null;
  const ph = store.photosOf(p.id)[0];
  const days = p.status === 'closed' ? daysBetween(p.createdAt, p.closedAt) : daysBetween(p.createdAt);
  return `<a class="card" href="#/p/${encodeURIComponent(p.id)}">
    <div class="row" style="align-items:flex-start">
      ${catBadge(p.category)}
      <div class="grow">
        <div class="tiny muted">${esc(p.no)}${p.projectNo ? ` · ${esc(p.projectNo)}` : ''}${compact ? '' : item ? ` · ${esc(item.no)}` : ' · standalone'} · ${days} d</div>
        <div style="font-weight:600">${esc(p.text)}</div>
        ${compact ? '' : `<div class="tiny muted ellip">${esc([p.tag, p.area, p.subcontractor].filter(Boolean).join(' · '))}</div>`}
      </div>
      ${ph ? img(ph.id, 'thumb', 'mini-thumb', ph.rev) : ''}
    </div>
    <div style="margin-top:6px">${stBadge(p.status)}</div>
  </a>`;
}

function scrPunchList() {
  head('Punch list', 'Comments to follow until verified closed');
  const f = UI.punch;
  const all = [...S.punches.values()];
  const areas = store.recent('area');
  const byStatus = (p) => (f.st === 'all' ? true : f.st === 'notclosed' ? p.status !== 'closed' : p.status === f.st);
  const base = all.filter((p) => (!f.area || p.area === f.area) && byStatus(p));
  const stc = (k) => all.filter((p) => (!f.area || p.area === f.area) && (k === 'all' ? true : k === 'notclosed' ? p.status !== 'closed' : p.status === k)).length;
  view.innerHTML = `
    <input type="search" id="q" placeholder="Search text, tag, no., subcon" value="${esc(f.q)}" aria-label="Search punch items" autocomplete="off">
    <div class="chips" style="margin-top:8px">${[['notclosed', 'Not closed'], ['open', 'Open'], ['ready', 'Ready for QC'], ['closed', 'Closed'], ['all', 'All']]
      .map(([k, l]) => `<button class="chip ${f.st === k ? 'on' : ''}" data-a="p-st" data-v="${k}">${l} <span class="n">${stc(k)}</span></button>`)
      .join('')}</div>
    <div class="chips">${[['', 'All cats'], ...S.settings.categories.map((c) => [c.code, c.code])]
      .map(([k, l]) => `<button class="chip ${f.cat === k ? 'on' : ''}" data-a="p-cat" data-v="${esc(k)}">${esc(l)} ${k ? `<span class="n">${base.filter((p) => p.category === k).length}</span>` : ''}</button>`)
      .join('')}</div>
    ${areas.length ? `<select id="parea" aria-label="Area filter"><option value="">All areas</option>${areas.map((a) => `<option ${f.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>` : ''}
    <div id="list"></div>`;
  const draw = () => {
    const q = f.q.trim().toLowerCase();
    let list = base.filter((p) => !f.cat || p.category === f.cat);
    if (q) list = list.filter((p) => [p.no, p.projectNo, p.text, p.tag, p.area, p.subcontractor, p.checkText].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => store.catRank(a.category) - store.catRank(b.category) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    $('#list').innerHTML = list.map((p) => punchCard(p)).join('') || `<div class="empty">${all.length ? 'Nothing here.' : 'No punch items yet.<br>Comments raised on items appear here.'}</div>`;
    hydrate($('#list'));
  };
  draw();
  $('#q').addEventListener('input', (ev) => {
    f.q = ev.target.value;
    saveUI();
    draw();
  });
  $('#parea')?.addEventListener('change', (ev) => {
    f.area = ev.target.value;
    saveUI();
    refresh();
  });
  setBar(`<button class="btn primary" data-a="p-new"><span class="big">+</span> Punch item</button>`);
}
A['p-st'] = (el) => {
  UI.punch.st = el.dataset.v;
  saveUI();
  refresh();
};
A['p-cat'] = (el) => {
  UI.punch.cat = el.dataset.v;
  saveUI();
  refresh();
};

// Standalone punch item - e.g. an item already on the project list that you must verify.
A['p-new'] = () => {
  let cat = '';
  let sh;
  sh = sheet({
    title: 'New punch item',
    sub: 'Not linked to a check – e.g. an item from the project punch list you need to verify.',
    body: `${field('Description', '<textarea name="text" autocapitalize="sentences"></textarea>')}
      ${field('Project punch no.', input('projectNo', ''))}
      ${field('Tag / item', input('tag', ''))}
      ${field('Area', input('area', '', '', 'dl-a3'))}${datalist('dl-a3', store.recent('area'))}
      ${field('Subcontractor', input('subcontractor', '', '', 'dl-s3'))}${datalist('dl-s3', store.recent('subcontractor'))}`,
    pre: `<div id="catp">${catPicker(cat)}</div>`,
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Save</button>`,
    isDirty: () => !!cat || Object.values(formData(sh.body)).some(Boolean),
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close('cancel');
      if (s === 'cat') {
        cat = b.dataset.v;
        $('#catp', api.root).innerHTML = catPicker(cat);
        api.msg('');
        return;
      }
      const d = formData(api.body);
      if (!d.text) return api.msg('Write the description.');
      if (!cat) return api.msg('Pick a category (A / B+ / B / C / D).');
      b.disabled = true;
      const p = await store.createPunch({ ...d, category: cat });
      cat = '';
      api.close('saved');
      go(`#/p/${encodeURIComponent(p.id)}`);
    },
  });
};

// ---------------------------------------------------------------------------
// PUNCH DETAIL

let curPunch = null;
function scrPunch(id) {
  const p = S.punches.get(id);
  curPunch = p;
  if (!p) {
    head('Not found');
    view.innerHTML = '<div class="empty">This punch item no longer exists.</div>';
    setBar(`<button class="btn" data-a="back" data-fallback="#/punch">‹ Back</button>`);
    return;
  }
  const item = p.itemId ? S.items.get(p.itemId) : null;
  head(`${p.no} · Cat ${p.category || '–'}`, p.tag || p.area || '');
  const ev = store.photosOf(p.id, 'evidence');
  const v = p.verify;
  const closed = p.status === 'closed';
  const ro = closed ? 'readonly' : '';
  view.innerHTML = `
    <div class="card">
      <div class="spread"><div class="row">${catBadge(p.category)}<b>${esc(p.no)}</b></div>${stBadge(p.status)}</div>
      <div class="tiny muted" style="margin-top:4px">Raised ${esc(fmtDateTime(p.createdAt))} · ${p.status === 'closed' ? `closed after ${daysBetween(p.createdAt, p.closedAt)} d` : `open ${daysBetween(p.createdAt)} d`}</div>
      ${item ? `<div class="small" style="margin-top:6px">From <a href="#/item/${encodeURIComponent(item.id)}">${esc(item.no)} · ${esc(item.tag || '(no tag)')}</a> (${esc(typeLabel(item.type))})</div>` : '<div class="small muted" style="margin-top:6px">Standalone punch item</div>'}
      ${p.checkText ? `<div class="small muted">Checkpoint: ${esc(p.checkText)}</div>` : ''}
    </div>

    ${closed ? '<div class="infobox">Verified closed: the description, category and subcontractor are locked. Re-open the item to change them.</div>' : ''}
    ${field('Description', `<textarea data-pf="text" autocapitalize="sentences" ${ro}>${esc(p.text)}</textarea>`)}
    <div class="sec-h">Category</div>${closed ? `<div class="row">${catBadge(p.category)}<span class="small muted">${esc(catMeaning(p.category))}</span></div>` : catPicker(p.category).replace(/data-s="cat"/g, 'data-a="p-setcat"')}
    ${field('Project punch no.', `<input type="text" data-pf="projectNo" value="${esc(p.projectNo)}" autocomplete="off" autocapitalize="characters">`)}
    ${field('Subcontractor', `<input type="text" data-pf="subcontractor" value="${esc(p.subcontractor)}" list="dl-s4" autocomplete="off" ${ro}>`)}${datalist('dl-s4', store.recent('subcontractor'))}
    ${item ? '' : `${field('Tag / item', `<input type="text" data-pf="tag" value="${esc(p.tag)}" autocomplete="off" autocapitalize="characters" ${ro}>`)}${field('Area', `<input type="text" data-pf="area" value="${esc(p.area)}" list="dl-a4" autocomplete="off" ${ro}>`)}${datalist('dl-a4', store.recent('area'))}`}
    <div class="tiny muted">Every change is kept in the history below.</div>

    <div class="sec-h">Photos as found (${ev.length})</div>
    ${photoStrip('punch', p.id, 'evidence')}

    <div class="sec-h">Closure</div>
    <div class="card">
      ${p.status === 'open' ? `<div class="small">Waiting for construction to close it.</div>
        <div class="row wrap" style="margin-top:8px"><button class="btn" data-a="p-ready">Construction reports closed</button><button class="btn primary" data-a="p-verify">Verify closure now</button></div>` : ''}
      ${p.status === 'ready' ? `<div class="small"><b>Ready for QC</b> since ${esc(fmtDateTime(p.readyAt))}.</div>
        <div class="row wrap" style="margin-top:8px"><button class="btn primary" data-a="p-verify">Verify closure</button><button class="btn" data-a="p-reopen">Back to open</button></div>` : ''}
      ${p.status === 'closed' ? `<div class="small"><b>Verified closed</b> ${esc(fmtDateTime(p.closedAt))}</div>
        ${v && v.checks ? `<div class="tiny muted" style="margin-top:4px">${CLOSURE_CHECKS.filter((c) => v.checks[c.id]).map((c) => `${v.checks[c.id] === 'ok' ? '✓' : v.checks[c.id] === 'na' ? 'N/A' : '✗'} ${esc(c.text)}`).join('<br>')}</div>` : ''}
        ${v && v.note ? `<div class="small" style="margin-top:4px">${esc(v.note)}</div>` : ''}
        <div class="row wrap" style="margin-top:8px"><button class="btn danger" data-a="p-reopen">Re-open</button></div>` : ''}
    </div>
    <div class="sec-h">Closure photos (${store.photosOf(p.id, 'closure').length})</div>
    ${photoStrip('punch', p.id, 'closure', { label: 'After fix' })}

    <div class="sec-h">History</div>
    <ul class="hist">${histHTML(p)}</ul>
    <hr><button class="btn small danger" data-a="p-del">Delete punch item</button>`;

  // Bar camera: "as found" while open, "after fix" once construction reports it done.
  const camRole = p.status === 'open' ? 'evidence' : 'closure';
  setBar(`<button class="btn icon" data-a="back" data-fallback="#/punch" aria-label="Back">‹</button>
    <button class="btn icon" data-a="photo-add" data-ot="punch" data-oid="${esc(p.id)}" data-role="${camRole}" aria-label="Take ${camRole === 'closure' ? 'after-fix' : 'as-found'} photo">📷</button>
    ${closed ? '<button class="btn danger" data-a="p-reopen">Re-open</button>' : '<button class="btn primary" data-a="p-verify">Verify closure</button>'}`);

  // Saved when the field is left (or the app goes to the background); each change goes into the history.
  $$('[data-pf]:not([readonly])', view).forEach((el) => {
    el.addEventListener('change', () =>
      store
        .updatePunch(p.id, { [el.dataset.pf]: el.value.trim() })
        .then(() => {
          curPunch = S.punches.get(p.id);
          const h = $('.hist', view);
          if (h) h.innerHTML = histHTML(curPunch);
        })
        .catch(fail),
    );
  });
}

const histHTML = (p) =>
  [...p.history]
    .reverse()
    .map((h) => `<li><b>${esc(h.action)}</b>${h.note ? ' – ' + esc(h.note) : ''}<div class="tiny muted">${esc(fmtDateTime(h.at))}</div></li>`)
    .join('');

A['p-setcat'] = async (el) => {
  const p = curPunch;
  if (el.dataset.v === p.category) return;
  await store.updatePunch(p.id, { category: el.dataset.v });
  refresh();
  toast(`Category ${el.dataset.v}`);
};
A['p-ready'] = async () => {
  await store.setPunchStatus(curPunch.id, 'ready');
  refresh();
  toast('Marked ready for QC');
};
A['p-reopen'] = async () => {
  const p = curPunch;
  sheet({
    title: p.status === 'closed' ? 'Re-open punch item' : 'Back to open',
    body: field('Reason', '<textarea name="note" placeholder="Why it is not closed"></textarea>'),
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn danger solid" data-s="ok">Re-open</button>`,
    isDirty: 'form',
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close('cancel');
      const note = formData(api.body).note;
      if (!note) return api.msg('Write the reason.');
      await store.setPunchStatus(p.id, 'open', { note });
      api.close();
      refresh();
    },
  });
};
A['p-del'] = async () => {
  const p = curPunch;
  if (!(await confirmSheet(`Delete ${esc(p.no)} and its photos? This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
  await store.deletePunch(p.id);
  nav(`leave:${p.itemId ? `#/item/${encodeURIComponent(p.itemId)}` : '#/punch'}`);
  toast('Deleted');
};

// QC closure verification
A['p-verify'] = () => {
  const p = curPunch;
  const st = {};
  const ev = store.photosOf(p.id, 'evidence');
  // Core checks are always answered; required ones must be Yes (no N/A).
  // The rest (records, re-test, joints, welds) are answered when relevant.
  const row = (c) => {
    const opts = c.required ? [['ok', '✓ Yes'], ['no', '✗ No']] : [['ok', '✓ Yes'], ['no', '✗ No'], ['na', 'N/A']];
    return `<div class="chk ${st[c.id] ? 's-' + (st[c.id] === 'no' ? 'defect' : st[c.id]) : ''}" id="vr-${esc(c.id)}"><div class="chk-text" style="margin-bottom:4px">${esc(c.text)}${c.required ? ' <span class="basis code">Required</span>' : ''}</div>
      ${c.codeRef ? `<div class="chk-meta">${esc(c.codeRef)}</div>` : ''}
      <div class="seg ${c.required ? 'two' : 'three'}">${opts.map(([k, l]) => `<button data-s="vc" data-id="${esc(c.id)}" data-v="${k}" class="${st[c.id] === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`;
  };
  const core = CLOSURE_CHECKS.filter((c) => c.core);
  const more = CLOSURE_CHECKS.filter((c) => !c.core);
  const rows = () =>
    `${core.map(row).join('')}${more.length ? `<details><summary>More checks – records, re-test, joints, welds (answer when relevant)</summary>${more.map(row).join('')}</details>` : ''}`;
  const verdict = () => {
    if (CLOSURE_CHECKS.some((c) => st[c.id] === 'no')) return ['no', 'A check failed – the item is not closed.'];
    const left = core.filter((c) => !st[c.id]).length;
    if (left) return ['', `${left} core check(s) to answer.`];
    if (core.some((c) => c.required && st[c.id] !== 'ok')) return ['', 'Required checks must be Yes.'];
    return ['ok', 'Core checks passed.'];
  };
  const paintFoot = (api) => {
    const [k, msg] = verdict();
    api.msg(msg, k === 'no' ? 'bad' : k === 'ok' ? 'ok' : 'info');
    $('[data-s="closed"]', api.root).disabled = k !== 'ok';
  };
  let sh;
  sh = sheet({
    title: `Verify closure · ${p.no}`,
    sub: `${catBadge(p.category)} ${esc(p.text)}`,
    body: `${ev.length ? `<div class="sec-h" style="margin-top:8px">As found</div><div class="thumbs sm">${ev.map((x) => img(x.id, 'thumb', '', x.rev)).join('')}</div>` : ''}
      <div id="vrows">${rows()}</div>
      <div class="sec-h">Closure photo</div>
      <div class="row wrap"><button class="btn" data-s="photo">📷 Take closure photo</button><span class="small muted" id="vph">${store.photosOf(p.id, 'closure').length} closure photo(s)</span></div>
      ${field('Note', '<textarea name="note" placeholder="What you saw"></textarea>')}`,
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn danger" data-s="notclosed">Not closed</button><button class="btn primary" data-s="closed" disabled>Verified</button>`,
    isDirty: () => Object.values(st).some(Boolean) || !!formData(sh.body).note,
    onError: (api) => paintFoot(api),
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close('cancel');
      if (s === 'vc') {
        const id = b.dataset.id;
        if (st[id] === b.dataset.v) delete st[id];
        else st[id] = b.dataset.v;
        const el = $(`#vr-${CSS.escape(id)}`, api.body);
        if (el) el.outerHTML = row(CLOSURE_CHECKS.find((c) => c.id === id));
        paintFoot(api);
        return;
      }
      if (s === 'photo') {
        addPhotos('punch', p.id, 'closure', true, () => {
          $('#vph', api.body).textContent = `${store.photosOf(p.id, 'closure').length} closure photo(s)`;
        });
        return;
      }
      const note = formData(api.body).note;
      const verify = { checks: { ...st }, note, at: new Date().toISOString() };
      if (s === 'closed') {
        b.disabled = true;
        await store.setPunchStatus(p.id, 'closed', { note: note || 'Closure verified by QC', verify });
        api.close('saved');
        refresh();
        toast(`${p.no} verified closed`);
      } else if (s === 'notclosed') {
        if (!note) {
          api.msg('Write why it is not closed (Note).', 'bad');
          $('textarea', api.body).focus();
          return;
        }
        await store.setPunchStatus(p.id, 'open', { note, verify });
        api.close('saved');
        refresh();
        toast(`${p.no} returned to open`);
      }
    },
  });
  paintFoot(sh);
};

// ---------------------------------------------------------------------------
// EXPORT

function scrExport() {
  head('Export', 'Reports, Excel lists, backup');
  const f = UI.exp;
  const pb = previewBanner();
  const areas = store.recent('area');
  const subs = store.recent('subcontractor');
  const sc = X.scope(f);
  const last = S.lastBackupAt;
  view.innerHTML = `${pb}
    <div class="sec-h" style="margin-top:6px">Scope</div>
    <div class="card">
      ${field('Area', `<select data-ef="area"><option value="">All areas</option>${areas.map((a) => `<option ${f.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`)}
      ${subs.length ? field('Subcontractor', `<select data-ef="sub"><option value="">All subcontractors</option>${subs.map((a) => `<option ${f.sub === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`) : ''}
      <div class="row"><div class="grow">${field('Checks from', `<input type="date" data-ef="from" value="${esc(f.from)}">`)}</div><div class="grow">${field('to', `<input type="date" data-ef="to" value="${esc(f.to)}">`)}</div></div>
      <div class="chips"><button class="chip" data-a="exp-today">Today</button><button class="chip" data-a="exp-week">Last 7 days</button><button class="chip" data-a="exp-alld">All dates</button></div>
      ${field('Punch items', `<select data-ef="punchStatus"><option value="all" ${f.punchStatus === 'all' ? 'selected' : ''}>All statuses</option><option value="notclosed" ${f.punchStatus === 'notclosed' ? 'selected' : ''}>Not closed only</option></select>`)}
      <div class="small"><b>${sc.items.length}</b> items · <b>${sc.punches.length}</b> punch items · <b>${sc.questions.length}</b> questions · follow-up list <b>${sc.followUp.length}</b> not closed</div>
    </div>

    <div class="sec-h">Report</div>
    <div class="card">
      <div class="small">Walkdown report: summary, follow-up list (all not-closed items), every item with result, checklist, comments and photos.</div>
      ${field('Photos in report', `<select data-ef="photos"><option value="small" ${f.photos === 'small' ? 'selected' : ''}>Small (recommended)</option><option value="large" ${f.photos === 'large' ? 'selected' : ''}>Full size (big file)</option><option value="none" ${f.photos === 'none' ? 'selected' : ''}>No photos</option></select>`)}
      <button class="btn primary block" data-a="exp" data-k="report">Make report (HTML)</button>
    </div>

    <div class="sec-h">Excel (CSV)</div>
    <div class="card">
      <div class="row wrap">
        <button class="btn" data-a="exp" data-k="punch">Punch list</button>
        <button class="btn" data-a="exp" data-k="items">Items</button>
        <button class="btn" data-a="exp" data-k="checkpoints">Checkpoints</button>
        <button class="btn" data-a="exp" data-k="questions">Questions</button>
      </div>
    </div>

    <div class="sec-h">Full package</div>
    <div class="card">
      <div class="small">One ZIP: report, all CSVs (incl. follow-up list) and full-size photos named by item / punch no. For the office PC.</div>
      <button class="btn block" style="margin-top:8px" data-a="exp" data-k="package">Make package (ZIP)</button>
    </div>

    <div class="sec-h">Backup</div>
    <div class="card">
      <div class="small">Everything (all areas, all dates, all photos) in one file you can restore on this or another phone. Save it to Files / iCloud Drive or send it to yourself.</div>
      <div class="small" style="margin-top:6px">Last backup: <b>${last ? esc(fmtDateTime(last)) : 'never'}</b></div>
      <button class="btn primary block" style="margin-top:8px" data-a="exp" data-k="backup">Make backup</button>
      <button class="btn block" style="margin-top:8px" data-a="restore">Restore from backup…</button>
    </div>`;

  $$('[data-ef]', view).forEach((el) =>
    el.addEventListener('change', () => {
      f[el.dataset.ef] = el.value;
      saveUI();
      refresh();
    }),
  );
}

const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
A['exp-today'] = () => {
  UI.exp.from = UI.exp.to = dayStr(new Date());
  saveUI();
  refresh();
};
A['exp-week'] = () => {
  UI.exp.from = dayStr(new Date(Date.now() - 6 * 86400000));
  UI.exp.to = dayStr(new Date());
  saveUI();
  refresh();
};
A['exp-alld'] = () => {
  UI.exp.from = UI.exp.to = '';
  saveUI();
  refresh();
};

A.exp = async (el) => {
  const k = el.dataset.k;
  const sc = X.scope(UI.exp);
  const b = busy(k === 'backup' ? 'Making backup…' : 'Preparing…');
  let file;
  try {
    const prog = (n, t) => b.progress(`photo ${n} / ${t}`);
    if (k === 'report') file = await X.reportFile(sc, UI.exp.photos);
    else if (k === 'package') file = await X.packageFile(sc, prog);
    else if (k === 'backup') file = await X.backupFile(prog);
    else file = X.csvFile(k, sc);
  } catch (e) {
    b.done();
    return fail(e);
  }
  b.done();
  fileSheet(file, { isBackup: k === 'backup', isReport: k === 'report' });
};

// Second step so Share runs straight from a tap (iOS requires it).
function fileSheet(file, { isBackup = false, isReport = false } = {}) {
  const canShare = !EMBEDDED && X.canShareFile(file);
  sheet({
    title: 'File ready',
    sub: `${esc(file.name)} · ${bytes(file.size)}`,
    body: `${EMBEDDED ? `<div class="warnbox">Preview: ${HOST_DL ? 'Save asks you before it saves the file.' : 'saving files is blocked here.'} Share works only in the installed app.</div>` : `<div class="small" style="margin:8px 0">${canShare ? 'Share opens the iOS share sheet: Save to Files, Mail, WhatsApp, AirDrop…' : 'Your browser cannot share files directly – use Save.'}</div>`}
      ${isReport ? '<div class="small muted">Open shows it here. For a PDF try Share → Print (pinch out on the print preview to make a PDF).</div>' : ''}
      ${isBackup ? '<div class="warnbox">The backup only counts once it is saved somewhere off this phone (Files / iCloud Drive / e-mail).</div>' : ''}`,
    foot: `${isReport ? '<button class="btn" data-s="open">Open</button>' : ''}<button class="btn" data-s="save">Save</button>${canShare ? '<button class="btn primary" data-s="share">Share…</button>' : ''}`,
    async onClick(s, b, api) {
      // A backup counts only when it has certainly left this phone: a completed
      // share, a host-confirmed save, or the user confirming the download.
      const afterSave = async (r) => {
        if (!isBackup || !r) return;
        if (r === 'saved') return store.markBackedUp();
        if (await confirmSheet('Did the backup file save (Files / iCloud Drive / Downloads)?', { ok: 'Yes, it saved', title: 'Backup saved?' })) {
          await store.markBackedUp();
          toast('Backup recorded');
        }
      };
      try {
        if (s === 'share') {
          const r = await X.shareFile(file);
          if (r === 'shared') {
            if (isBackup) await store.markBackedUp();
            api.close();
            toast('Shared');
            refresh();
          }
        } else if (s === 'save') {
          await afterSave(await saveFile(file));
        } else if (s === 'open') {
          // Hide this sheet while the report is shown; bring it back after.
          api.el.style.display = 'none';
          await openReport(file, { onClose: () => !api.closed && (api.el.style.display = '') });
        }
      } catch (e) {
        if (s === 'share' && e && e.name !== 'NotAllowedError') {
          // Some file types / iOS versions refuse share(): fall back to saving.
          await afterSave(await saveFile(file));
        } else if (s === 'share') {
          api.msg('Share needs a fresh tap – tap Share again.');
        } else fail(e);
      }
    },
  });
}

// Show the report inside the app (no new window: home-screen apps have no tabs).
async function openReport(file, { onClose } = {}) {
  const html = await file.text();
  const v = document.createElement('div');
  v.className = 'viewer report-viewer';
  v.innerHTML = `<div class="stage"><iframe title="Report" sandbox="allow-same-origin allow-modals"></iframe></div>
    <div class="vbar"><button class="btn" data-v="close">Close</button>${X.canShareFile(file) && !EMBEDDED ? '<button class="btn" data-v="share">Share…</button>' : ''}</div>`;
  const L = layer({ el: v, onClose });
  v.querySelector('iframe').srcdoc = html;
  v.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-v]');
    if (!b) return;
    if (b.dataset.v === 'close') L.close('button');
    else if (b.dataset.v === 'share') {
      try {
        await X.shareFile(file);
      } catch (e) {
        fail(e);
      }
    }
  });
}

A.restore = () => {
  const el = document.createElement('input');
  el.type = 'file';
  el.accept = '.zip,application/zip';
  el.style.cssText = 'position:fixed;left:-1000px;opacity:0';
  document.body.appendChild(el);
  el.onchange = () => {
    const file = el.files && el.files[0];
    el.remove();
    if (!file) return;
    let mode = 'merge';
    sheet({
      title: 'Restore backup',
      sub: `${esc(file.name)} · ${bytes(file.size)}`,
      body: `<div class="results" style="margin-top:8px">
          <button class="on" data-s="mode" data-v="merge">Merge<br><span class="small muted" style="font-weight:400">Add records from the backup; where both have a record, keep the newer one. Settings come from the backup only if this phone has no records yet.</span></button>
          <button data-s="mode" data-v="replace">Replace everything<br><span class="small muted" style="font-weight:400">Delete all data on this phone, then load the backup.</span></button>
        </div>`,
      foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="go">Restore</button>`,
      async onClick(s, b, api) {
        if (s === 'cancel') return api.close('cancel');
        if (s === 'mode') {
          mode = b.dataset.v;
          $$('[data-s="mode"]', api.root).forEach((x) => x.classList.toggle('on', x.dataset.v === mode));
          return;
        }
        if (mode === 'replace' && !(await confirmSheet('Replace: everything on this phone will be deleted first. Continue?', { ok: 'Replace', danger: true }))) return;
        api.close();
        const bz = busy('Restoring…');
        try {
          const r = await X.restore(file, mode);
          bz.done();
          applyTheme();
          refresh();
          notice(
            'Restore done',
            `<div class="kv"><div>Items</div><div>${r.items}</div><div>Punch items</div><div>${r.punches}</div><div>Questions</div><div>${r.questions}</div><div>Photos</div><div>${r.photos}</div><div>Unchanged</div><div>${r.skipped} (newer copy already here)</div>
            <div>Settings</div><div>${r.settings === 'restored' ? 'Restored from the backup' : 'Kept this phone’s settings (checklist additions merged)'}</div>
            ${r.missingPhotos ? `<div>Missing photos</div><div>${r.missingPhotos} (not in the file)</div>` : ''}</div>
            ${r.renumbered.length ? `<div class="warnbox">Numbers already used on this phone were given new numbers: ${r.renumbered.map(esc).join(', ')}. The old number is kept in each record.</div>` : ''}`,
          );
        } catch (e) {
          bz.done();
          fail(e);
        }
      },
    });
  };
  el.click();
};

// ---------------------------------------------------------------------------
// MORE (settings)

async function scrMore() {
  head('More', 'Settings, checklists, storage');
  const st = S.settings;
  view.innerHTML = `
    <div class="sec-h" style="margin-top:6px">Project (kept on this phone)</div>
    <div class="card">
      ${field('Project label', `<input type="text" data-sf="projectLabel" value="${esc(st.projectLabel)}" placeholder="Shown on reports" autocomplete="off">`)}
      ${field('Inspector (optional)', `<input type="text" data-sf="inspector" value="${esc(st.inspector)}" autocomplete="off">`, 'Copied onto new items and reports.')}
      <div class="row">
        <div class="grow">${field('Item prefix', `<input type="text" data-sf="prefixItem" value="${esc(st.prefixItem)}" autocomplete="off">`)}</div>
        <div class="grow">${field('Punch prefix', `<input type="text" data-sf="prefixPunch" value="${esc(st.prefixPunch)}" autocomplete="off">`)}</div>
        <div class="grow">${field('Question prefix', `<input type="text" data-sf="prefixQuestion" value="${esc(st.prefixQuestion)}" autocomplete="off">`)}</div>
      </div>
      <div class="tiny muted">Using two phones? Give each its own prefix (e.g. P1, P2) so numbers never clash.</div>
    </div>

    <div class="sec-h">Punch categories</div>
    <div class="card">
      ${st.categories.map((c, i) => `<div class="list-row" style="align-items:flex-start">
        <span class="badge cat ${catCls(c.code)}" style="margin-top:12px">${esc(c.code)}</span>
        <div class="grow"><input type="text" data-cat="${i}" value="${esc(c.meaning)}" placeholder="${c.confirmed ? '' : 'Definition not confirmed – ask on site'}" aria-label="Meaning of ${esc(c.code)}" autocomplete="off">
        <label class="switch small"><span>Confirmed definition</span><input type="checkbox" data-catc="${i}" ${c.confirmed ? 'checked' : ''}></label></div></div>`).join('')}
    </div>

    <div class="sec-h">Code editions (blank = unknown)</div>
    <div class="card">
      <div class="small muted">Checklist references are generic. Fill in the edition the project actually uses once confirmed; reports print “edition unknown – confirm” until then.</div>
      ${Object.entries(st.editions).map(([k, v]) => field(k, `<input type="text" data-ed="${esc(k)}" value="${esc(v)}" placeholder="unknown – confirm" autocomplete="off">`)).join('')}
    </div>

    <div class="sec-h">Checklists</div>
    <a class="card" href="#/templates"><b>Edit checklists</b><div class="small muted">Hide checkpoints you never use, add your own. Library ${esc(CHECKLIST_VERSION)}.</div></a>

    <div class="sec-h">Photos &amp; display</div>
    <div class="card">
      ${field('Photo size kept', `<select data-sfn="photoMaxPx">${[[1280, '1280 px (smallest)'], [1600, '1600 px (default)'], [2048, '2048 px (sharper, bigger)']].map(([v, l]) => `<option value="${v}" ${+st.photoMaxPx === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${field('Photo quality', `<select data-sfn="photoQuality">${[[0.6, 'Lower (smaller files)'], [0.72, 'Normal'], [0.85, 'High']].map(([v, l]) => `<option value="${v}" ${+st.photoQuality === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${field('Theme', `<select data-sf="theme">${[['auto', 'Follow phone'], ['light', 'Light (best in sun)'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${st.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
    </div>

    <div class="sec-h">Storage</div>
    <div class="card" id="storage"><div class="small muted">Checking…</div></div>

    <div class="sec-h">Help</div>
    <a class="card" href="#/check"><b>Device check</b><div class="small muted">${S.deviceCheck ? `Last run ${esc(fmtDate(S.deviceCheck.at))}: ${Object.values(S.deviceCheck.results).filter((r) => r.ok === true).length} passed, ${Object.values(S.deviceCheck.results).filter((r) => r.ok === false).length} failed` : 'Not run yet – run it once on this iPhone before relying on the app on site.'}</div></a>
    <a class="card" href="#/help"><b>How to use / install / back up</b></a>

    <div class="sec-h">Danger zone</div>
    <div class="card"><button class="btn danger block" data-a="wipe">Delete all data on this phone…</button></div>
    <div class="tiny muted" style="margin:12px 2px">BOP QC Walkdown v${X.APP_VERSION} · checklist library ${esc(CHECKLIST_VERSION)} · no data leaves this phone unless you export it.</div>`;

  // Change the in-memory settings at once, write to storage shortly after.
  const persist = debounce(() => store.saveSettings({}).catch(fail), 400);
  const set = (patch) => {
    Object.assign(S.settings, patch);
    persist();
  };
  $$('input[data-sf], input[data-cat], input[data-ed]', view).forEach((el) => el.addEventListener('blur', () => persist.flush()));
  $$('[data-sf]', view).forEach((el) => {
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      set({ [el.dataset.sf]: el.value.trim() });
      if (el.dataset.sf === 'theme') applyTheme();
    });
  });
  $$('[data-sfn]', view).forEach((el) => el.addEventListener('change', () => set({ [el.dataset.sfn]: +el.value })));
  $$('[data-cat]', view).forEach((el) =>
    el.addEventListener('input', () => {
      S.settings.categories[+el.dataset.cat].meaning = el.value.trim();
      persist();
    }),
  );
  $$('[data-catc]', view).forEach((el) =>
    el.addEventListener('change', () => {
      S.settings.categories[+el.dataset.catc].confirmed = el.checked;
      persist.flush();
    }),
  );
  $$('[data-ed]', view).forEach((el) =>
    el.addEventListener('input', () => {
      S.settings.editions[el.dataset.ed] = el.value.trim();
      persist();
    }),
  );

  const e = await db.estimate();
  const box = $('#storage');
  if (!box) return;
  const nPhotos = [...S.photos.values()].reduce((a, l) => a + l.length, 0);
  const off = await offlineStatus();
  box.innerHTML = `<div class="kv"><div>Offline files</div><div>${off}</div>
      <div>App</div><div>${isStandalone() ? 'Installed (home-screen icon)' : EMBEDDED ? 'Preview inside claude.ai' : 'Browser tab – install for site use'}</div>
      <div>Used</div><div>${e.usage != null ? bytes(e.usage) : 'unknown'}${e.quota ? ` of ~${bytes(e.quota)}` : ''}</div>
      <div>Records</div><div>${S.items.size} items · ${S.punches.size} punch · ${S.questions.size} questions · ${nPhotos} photos</div>
      <div>Protected</div><div>${e.persisted === true ? 'Persistent storage granted (not a backup – iOS may still clear data)' : e.persisted === false ? 'Not granted' : 'Unknown on this browser'}</div></div>
    ${e.persisted === true ? '' : '<button class="btn small" style="margin-top:8px" data-a="persist">Ask the phone to keep data</button>'}
    <div class="tiny muted" style="margin-top:6px">Assume deleting the home-screen icon deletes the data (not confirmed). Back up regularly.</div>`;
}

// Checks the cache this copy of the app would use offline.
async function offlineStatus() {
  if (EMBEDDED) return 'Not available in the preview';
  try {
    if (!('caches' in window) || !navigator.serviceWorker || !navigator.serviceWorker.controller) return '<b>Not ready</b> – open the app once with signal, then reopen it';
    const keys = (await caches.keys()).filter((k) => k.startsWith('bopqc-'));
    if (!keys.length) return '<b>Not ready</b> – open the app once with signal';
    const c = await caches.open(keys[keys.length - 1]);
    const n = (await c.keys()).length;
    return `Ready (${n} files, ${esc(keys[keys.length - 1].replace('bopqc-', ''))})`;
  } catch {
    return 'Unknown';
  }
}

A.persist = async () => {
  const r = await db.requestPersist();
  toast(r ? 'Storage protected' : 'The phone did not confirm – keep backing up');
  refresh();
};

A.wipe = () => {
  sheet({
    title: 'Delete all data',
    body: `<p>Deletes <b>all</b> items, punch items, questions, photos and settings on this phone. Make a backup first.</p>
      ${field('Type DELETE to confirm', '<input type="text" name="confirm" autocomplete="off" autocapitalize="characters">')}`,
    foot: '<button class="btn" data-s="cancel">Cancel</button><button class="btn danger solid" data-s="go">Delete everything</button>',
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      if (formData(api.body).confirm !== 'DELETE') return api.msg('Type DELETE (capitals) to confirm.');
      api.close();
      await db.clearAll();
      await store.load();
      applyTheme();
      go('#/items');
      refresh();
      toast('All data deleted');
    },
  });
};

// ---------------------------------------------------------------------------
// CHECKLIST TEMPLATES

function scrTemplates(key) {
  if (!key) {
    head('Checklists', 'Applies to new items only');
    view.innerHTML = `<div class="small muted" style="margin:6px 2px">Changes apply to items you start from now on. Items already checked keep the checklist they were checked against.</div>
      ${TYPES.map((t) => {
        const hid = (S.templates.hidden[t.key] || []).length;
        const cus = (S.templates.custom[t.key] || []).length;
        return `<a class="card" href="#/templates/${t.key}"><b>${esc(t.label)}</b><div class="small muted">${t.checks.length} library checkpoints${hid ? ` · ${hid} hidden` : ''}${cus ? ` · ${cus} added` : ''}</div></a>`;
      }).join('')}`;
    setBar(`<button class="btn" data-a="back" data-fallback="#/more">‹ Back</button>`);
    return;
  }
  const t = store.typeInfo(key);
  head(t.label, 'Checklist for new items');
  const hidden = new Set(S.templates.hidden[key] || []);
  const custom = S.templates.custom[key] || [];
  let lastG = null;
  let rows = '';
  for (const c of t.checks) {
    if (c.group !== lastG) {
      rows += `<div class="grp-h">${esc(c.group)}</div>`;
      lastG = c.group;
    }
    rows += `<div class="chk" style="${hidden.has(c.id) ? 'opacity:.5' : ''}"><div class="chk-top"><div class="chk-text">${esc(c.text)}</div></div>
      <div class="chk-meta">${basisChip(c.basis)}${esc(c.codeRef || '')}</div>
      <label class="switch small"><span>${hidden.has(c.id) ? 'Hidden' : 'Shown'}</span><input type="checkbox" data-a="tpl-toggle" data-k="${key}" data-id="${esc(c.id)}" ${hidden.has(c.id) ? '' : 'checked'}></label></div>`;
  }
  view.innerHTML = `${rows || '<div class="small muted">No library checkpoints for this type.</div>'}
    <div class="grp-h">Added by you</div>
    ${custom.map((c) => `<div class="list-row"><div class="grow">${esc(c.text)}<div class="tiny muted">${esc(c.group)}</div></div><button class="btn small danger" data-a="tpl-del" data-k="${key}" data-id="${esc(c.id)}">Remove</button></div>`).join('') || '<div class="small muted">None.</div>'}
    <div class="card">${field('New checkpoint', input('ctext', '', 'Short text', '', 'id="ctext" autocapitalize="sentences"'))}${field('Group', input('cgroup', 'Added', '', '', 'id="cgroup" autocapitalize="sentences"'))}
    <button class="btn primary block" data-a="tpl-add" data-k="${key}">Add to checklist</button></div>`;
  setBar(`<button class="btn" data-a="back" data-fallback="#/templates">‹ Back</button>`);
}
A['tpl-toggle'] = async (el) => {
  const { k, id } = el.dataset;
  await store.editTemplates((t) => {
    const set = new Set(t.hidden[k] || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    t.hidden[k] = [...set];
  });
  refresh();
};
A['tpl-add'] = async (el) => {
  const k = el.dataset.k;
  const text = $('#ctext').value.trim();
  if (!text) return toast('Write the checkpoint');
  const group = $('#cgroup').value.trim() || 'Added';
  const id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  await store.editTemplates((t) => (t.custom[k] ||= []).push({ id, group, text }));
  refresh();
  toast('Added');
};
A['tpl-del'] = async (el) => {
  const { k, id } = el.dataset;
  await store.editTemplates((t) => (t.custom[k] = (t.custom[k] || []).filter((c) => c.id !== id)));
  refresh();
};

// ---------------------------------------------------------------------------
// DEVICE CHECK - turns the iPhone unknowns (README) into facts for this phone

const CHECKS = [
  ['standalone', 'Opened from the home-screen icon', 'auto'],
  ['offline', 'Offline files cached', 'auto'],
  ['persist', 'Storage protected from automatic clearing', 'auto'],
  ['space', 'Storage space', 'auto'],
  ['idb', 'Save and read back a test record', 'auto'],
  ['canvas', 'Photo processing (JPEG encode)', 'auto'],
  ['canshare', 'File sharing available', 'auto'],
  ['share', 'Share a test file (share sheet opens)', 'manual'],
  ['download', 'Save a test file (appears in Files)', 'manual'],
  ['camera', 'Camera photo saved and readable', 'manual'],
  ['print', 'Print / PDF from the report', 'manual'],
];

async function runAutoChecks() {
  const r = {};
  r.standalone = { ok: isStandalone(), detail: isStandalone() ? 'Yes' : 'No – open the app from its icon, not a Safari tab' };
  const off = await offlineStatus();
  r.offline = { ok: off.startsWith('Ready'), detail: off.replace(/<[^>]+>/g, '') };
  const e = await db.estimate();
  r.persist = { ok: e.persisted === true ? true : e.persisted === false ? false : null, detail: e.persisted === true ? 'Granted (still not a backup)' : e.persisted === false ? 'Not granted – back up often' : 'Unknown on this browser' };
  r.space = { ok: e.quota ? e.usage < e.quota * 0.8 : null, detail: e.usage != null ? `${bytes(e.usage)} used${e.quota ? ` of ~${bytes(e.quota)}` : ''}` : 'Unknown' };
  try {
    const key = `selftest:${Date.now()}`;
    await db.setMeta(key, { x: 1 });
    const v = await db.getMeta(key, null);
    await db.del('meta', key);
    r.idb = { ok: !!(v && v.x === 1), detail: v && v.x === 1 ? 'OK' : 'Read-back failed' };
  } catch (err) {
    r.idb = { ok: false, detail: err.message || String(err) };
  }
  try {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 48;
    c.getContext('2d').fillRect(0, 0, 10, 10);
    const b = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.7));
    r.canvas = { ok: !!(b && b.size > 0), detail: b ? `${b.size} bytes` : 'No output' };
  } catch (err) {
    r.canvas = { ok: false, detail: err.message || String(err) };
  }
  const probe = new File(['test'], 'test.csv', { type: 'text/csv' });
  const zipProbe = new File(['test'], 'test.zip', { type: 'application/zip' });
  const can = X.canShareFile(probe) && X.canShareFile(zipProbe);
  r.canshare = { ok: EMBEDDED ? null : can, detail: EMBEDDED ? 'Not available in the preview' : can ? 'CSV and ZIP can be shared' : 'Not supported – use Save' };
  return r;
}

async function saveCheck(results) {
  const v = { at: new Date().toISOString(), ua: navigator.userAgent, results: { ...((S.deviceCheck && S.deviceCheck.results) || {}), ...results } };
  await db.setMeta('deviceCheck', v);
  S.deviceCheck = v;
}

async function scrDeviceCheck() {
  head('Device check', 'Run once on this iPhone');
  setBar(`<button class="btn" data-a="back" data-fallback="#/more">‹ Back</button><button class="btn primary" data-a="dc-run">Run checks</button>`);
  const res = (S.deviceCheck && S.deviceCheck.results) || {};
  const badge = (r) => (!r ? '<span class="badge r-none">Not run</span>' : r.ok === true ? '<span class="badge r-ok">Pass</span>' : r.ok === false ? '<span class="badge r-rej">Fail</span>' : '<span class="badge r-okc">Unknown</span>');
  const manualBtn = {
    share: '<button class="btn small" data-a="dc-share">Test</button>',
    download: '<button class="btn small" data-a="dc-download">Test</button>',
    camera: '<button class="btn small" data-a="dc-camera">Test</button>',
    print: '<button class="btn small" data-a="dc-print">Test</button>',
  };
  view.innerHTML = `
    <div class="small muted" style="margin:6px 2px">Some iPhone behaviour could not be confirmed from documentation (README → iPhone behaviour). These checks record what actually works on this phone. Run them with signal, from the home-screen icon.</div>
    ${CHECKS.map(([id, label, kind]) => `<div class="card"><div class="spread"><div class="grow"><b>${esc(label)}</b>${res[id] ? `<div class="small muted">${esc(res[id].detail || '')}</div>` : ''}</div>${badge(res[id])}</div>${kind === 'manual' ? `<div style="margin-top:8px">${manualBtn[id]}</div>` : ''}</div>`).join('')}
    ${S.deviceCheck ? `<div class="tiny muted">Last run ${esc(fmtDateTime(S.deviceCheck.at))} · ${esc(S.deviceCheck.ua)}</div>` : ''}`;
}

async function askResult(id, question) {
  const yes = await confirmSheet(question, { ok: 'Yes', title: 'Did it work?' });
  await saveCheck({ [id]: { ok: yes, detail: yes ? 'Confirmed by you' : 'Did not work – see README' } });
  refresh();
}

A['dc-run'] = async () => {
  const b = busy('Checking…');
  try {
    await saveCheck(await runAutoChecks());
  } finally {
    b.done();
  }
  refresh();
};
A['dc-share'] = async () => {
  const f = new File(['BOP QC share test\r\n'], 'bopqc-share-test.csv', { type: 'text/csv' });
  if (EMBEDDED || !X.canShareFile(f)) {
    await saveCheck({ share: { ok: false, detail: 'Sharing files not supported here' } });
    return refresh();
  }
  try {
    const r = await X.shareFile(f);
    await saveCheck({ share: { ok: r === 'shared' ? true : null, detail: r === 'shared' ? 'Share sheet worked' : 'Cancelled – run again' } });
  } catch (e) {
    await saveCheck({ share: { ok: false, detail: e.message || String(e) } });
  }
  refresh();
};
A['dc-download'] = async () => {
  const r = await saveFile(new File(['BOP QC download test\r\n'], 'bopqc-download-test.txt', { type: 'text/plain' }));
  if (r === 'saved') {
    await saveCheck({ download: { ok: true, detail: 'Saved through the host' } });
    return refresh();
  }
  if (!r) return;
  await askResult('download', 'Did “bopqc-download-test.txt” appear in Files (Downloads)?');
};
A['dc-camera'] = () => {
  pickPhotos(true, async (files) => {
    const b = busy('Processing…');
    try {
      const p = await processImage(files[0], { maxPx: S.settings.photoMaxPx, quality: S.settings.photoQuality });
      b.done();
      const url = URL.createObjectURL(new Blob([p.thumb], { type: 'image/jpeg' }));
      const upright = await confirmSheet(`<img src="${url}" alt="" style="max-width:100%;max-height:40vh;display:block;margin:0 auto 8px">Is this photo the right way up (not sideways or upside down)?`, { ok: 'Yes, upright', title: 'Camera check' });
      URL.revokeObjectURL(url);
      await saveCheck({ camera: { ok: upright, detail: `${p.w}×${p.h}, ${bytes(p.data.byteLength)}${upright ? '' : ' – photo not upright: report it'}` } });
    } catch (e) {
      b.done();
      await saveCheck({ camera: { ok: false, detail: e.message || String(e) } });
    } finally {
      refresh();
    }
  });
};
A['dc-print'] = async () => {
  const html = '<!doctype html><meta charset="utf-8"><title>Print test</title><h1>BOP QC print test</h1><p>Use Share → Print (or Options → PDF) and check that this page prints or saves as PDF.</p>';
  // Try it in the viewer (Share… → Print), then answer when the viewer is closed.
  await openReport(new File([html], 'bopqc-print-test.html', { type: 'text/html' }), {
    onClose: (reason) => reason !== 'nav' && askResult('print', 'Could you print the test page or save it as PDF (Share… → Print, or Options → PDF)?'),
  });
};

// ---------------------------------------------------------------------------
// HELP

function scrHelp() {
  head('Help', 'Install, use, back up');
  view.innerHTML = `
  <div class="card small">
    <h3>Install on iPhone (once, with signal)</h3>
    <ol><li>Open this page in <b>Safari</b>.</li><li>Tap Share <span aria-hidden="true">⇪</span> → <b>Add to Home Screen</b>.</li><li>Open the app from the new icon once while online. After that it works with no signal.</li></ol>
    <p class="muted">Data is stored inside the home-screen app, not in Safari. Use the icon every time.</p>
  </div>
  <div class="card small">
    <h3>Walkdown</h3>
    <ol>
      <li><b>+ New item check</b>: pick the type, type the tag and area.</li>
      <li>Mark each checkpoint: <b>✓ OK</b>, <b>✗ Defect</b> (opens a comment with category), <b>? Ask</b> (records an unknown as a question), <b>N/A</b>.</li>
      <li>📷 adds photos to the item; comments can carry their own photos.</li>
      <li><b>Result</b>: OK / OK with comments / Rejected. The app warns about open comments, Cat A items and unmarked checkpoints.</li>
      <li><b>Save &amp; next</b> starts the next item in the same area.</li>
    </ol>
  </div>
  <div class="card small">
    <h3>Follow-up until closed</h3>
    <ul>
      <li>Every comment is a punch item (A / B+ / B / C / D) in the <b>Punch</b> tab.</li>
      <li>When construction says it is done: <b>Construction reports closed</b> → status “Ready for QC”.</li>
      <li>On site: <b>Verify closure</b>, answer the closure checks, take an “after fix” photo → <b>Verified closed</b> or <b>Not closed</b> (back to open, with reason).</li>
      <li>A rejected item is re-checked with <b>Re-inspect</b> (new check linked to the old one).</li>
    </ul>
  </div>
  <div class="card small">
    <h3>Unknowns</h3>
    <p>The app never fills in a project value. Checkpoints marked <span class="basis project">Project – unknown</span> depend on project documents. Use <b>? Ask</b> and the question goes to the <b>Ask</b> tab and into every report.</p>
    <p>Code references are generic. “verify clause/edition” means the clause was not confirmed. Enter confirmed editions in More → Code editions.</p>
  </div>
  <div class="card small">
    <h3>Before the first site walk</h3>
    <p>Run <b>More → Device check</b> once on your iPhone (with signal, from the icon). It confirms offline files, protected storage, sharing, saving, camera and printing on your own phone.</p>
  </div>
  <div class="card small">
    <h3>Back up</h3>
    <p>Everything stays on this phone. Assume iOS deletes it if you delete the home-screen icon (not confirmed). Export → <b>Make backup</b> → Share → Save to Files / iCloud Drive (or e-mail it to yourself) at least every few days. Restore with Export → Restore.</p>
  </div>`;
  setBar(`<button class="btn" data-a="back" data-fallback="#/more">‹ Back</button>`);
}

// ---------------------------------------------------------------------------
// boot

function applyTheme() {
  const t = S.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

function netStatus() {
  $('#top-status').textContent = navigator.onLine ? '' : 'Offline · saving on phone';
}
window.addEventListener('online', netStatus);
window.addEventListener('offline', netStatus);

// Save any half-typed field when the app goes to the background (blur fires its change/save).
const flushField = () => document.activeElement && document.activeElement.blur && document.activeElement.blur();
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushField());
window.addEventListener('pagehide', flushField);

// A home-screen app resumed from the background does not reload, so it can keep
// an old version for a long time: check for updates on start and on every resume.
let UPDATE = null; // waiting service worker, shown as a banner until applied
function registerSW() {
  if (EMBEDDED || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  let reloading = false;
  // First install also fires controllerchange (clients.claim) - only reload for updates.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      const offer = (w) => {
        if (!w || !navigator.serviceWorker.controller) return;
        UPDATE = w;
        refreshBanners();
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => w.state === 'installed' && offer(w));
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
      });
    })
    .catch((e) => console.warn('SW registration failed', e));
}
function refreshBanners() {
  if (!layers.length && ['items', 'more'].includes(route().name)) refresh();
}
A['apply-update'] = () => {
  if (UPDATE) UPDATE.postMessage('skipWaiting');
};

// iOS does not shrink the layout for the on-screen keyboard: measure it so
// sheets (and their Save buttons) sit above it.
function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const upd = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', `${kb > 60 ? kb : 0}px`);
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
}

async function boot() {
  try {
    await store.load();
  } catch (e) {
    view.innerHTML = `<div class="card"><b>Storage is not available.</b><p class="small">${esc(e.message || e)}</p><p class="small">Private browsing blocks storage. Open the app from the home-screen icon or a normal Safari tab.</p></div>`;
    return;
  }
  applyTheme();
  netStatus();
  trackKeyboard();
  try {
    history.replaceState({ inApp: false }, '');
  } catch {}
  const back = !location.hash && lastRoute();
  if (back && back !== '#/items' && back !== '#/') {
    history.replaceState({ inApp: false }, '', back);
    curHash = location.hash;
  }
  render();
  registerSW();
  // Home-screen apps are granted persistent storage on request (Safari tabs usually are not).
  if (isStandalone()) db.requestPersist();
}

boot();
