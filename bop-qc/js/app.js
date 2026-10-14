// BOP QC Walkdown - UI. Plain DOM, hash routes, everything saved on each tap.

import * as store from './store.js';
import { S, RESULTS, CHECK_STATES, PUNCH_STATUS } from './store.js';
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
const local = {
  get(k) {
    try {
      return localStorage.getItem(`bopqc-${k}`);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`bopqc-${k}`, v);
    } catch {}
  },
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
// sheets (bottom dialogs)

const openSheets = [];
function sheet({ title, sub = '', body, foot, onClick, onClose, cls = '' }) {
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  bd.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-h"><h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <div class="sheet-b">${body}</div>
    ${foot ? `<div class="sheet-f">${foot}</div>` : ''}
  </div>`;
  const api = {
    el: bd,
    root: bd.querySelector('.sheet'),
    body: bd.querySelector('.sheet-b'),
    foot: bd.querySelector('.sheet-f'),
    closed: false,
    close(reason) {
      if (api.closed) return;
      api.closed = true;
      bd.remove();
      const i = openSheets.indexOf(api);
      if (i >= 0) openSheets.splice(i, 1);
      if (onClose) onClose(reason);
    },
  };
  bd.addEventListener('click', (ev) => {
    if (ev.target === bd) return api.close('backdrop');
    const b = ev.target.closest('[data-s]');
    if (b && onClick) {
      ev.preventDefault();
      ev.stopPropagation();
      onClick(b.dataset.s, b, api, ev);
    }
  });
  document.body.appendChild(bd);
  openSheets.push(api);
  hydrate(bd);
  return api;
}
const closeAllSheets = () => [...openSheets].forEach((s) => s.close('nav'));

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
    busyEl.className = 'backdrop';
    busyEl.style.alignItems = 'center';
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
  notice('Something went wrong', `<p>${esc(e && e.message ? e.message : e)}</p><p class="small muted">Nothing already saved was lost.</p>`);
}

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

async function saveFile(file) {
  if (HOST_DL) {
    try {
      await HOST_DL.save({ filename: file.name, data: file });
      return true;
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
  return true;
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
      toast(files.length > 1 ? `${files.length} photos saved` : 'Photo saved');
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

function findPhoto(id) {
  for (const list of S.photos.values()) {
    const p = list.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

function openViewer(id) {
  const meta = findPhoto(id);
  if (!meta) return;
  const v = document.createElement('div');
  v.className = 'viewer';
  const paint = () => {
    v.innerHTML = `<div class="stage">${img(meta.id, 'full', '', meta.rev)}</div>
      <div class="cap"><input type="text" value="${esc(meta.caption || '')}" placeholder="Caption (optional)" aria-label="Caption" autocapitalize="sentences"></div>
      <div class="vbar"><button class="btn" data-v="close">Close</button><button class="btn" data-v="mark">✎ Mark up</button><button class="btn danger" data-v="del">Delete</button></div>`;
    hydrate(v);
    const inp = v.querySelector('input');
    const save = debounce(() => store.updatePhotoMeta(meta.id, { caption: inp.value.trim() }), 500);
    inp.addEventListener('input', save);
    inp.addEventListener('blur', () => save.flush());
  };
  paint();
  document.body.appendChild(v);
  v.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-v]');
    if (!b) return;
    if (b.dataset.v === 'close') {
      v.remove();
      refresh();
    } else if (b.dataset.v === 'del') {
      if (await confirmSheet('Delete this photo?', { ok: 'Delete', danger: true })) {
        await store.deletePhoto(meta.id);
        v.remove();
        refresh();
        toast('Photo deleted');
      }
    } else if (b.dataset.v === 'mark') {
      const blob = await store.blobOf(meta.id);
      if (!blob) return;
      const res = await markup(blob.data, { quality: Math.max(0.8, S.settings.photoQuality) });
      if (res) {
        await store.replacePhotoData(meta.id, res);
        paint();
        toast('Mark-up saved');
      }
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

window.addEventListener('hashchange', () => {
  closeAllSheets();
  // Mark entries created inside the app so Back can use history safely.
  try {
    history.replaceState({ inApp: true }, '');
  } catch {}
  render();
  window.scrollTo(0, 0);
});

function back(fallback) {
  if (history.state && history.state.inApp) history.back();
  else location.hash = fallback;
}
const go = (hash) => (location.hash = hash);

// ---------------------------------------------------------------------------
// global click actions (data-a)

const A = {};
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el || el.closest('.backdrop')) return;
  const fn = A[el.dataset.a];
  if (fn) {
    ev.preventDefault();
    Promise.resolve(fn(el, ev)).catch(fail);
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

function banners() {
  let h = previewBanner();
  if (!EMBEDDED && isIOS() && !isStandalone() && local.get('hideInstall') !== '1') {
    h += `<div class="banner info"><div class="grow small"><b>Install for offline use:</b> tap Share <span aria-hidden="true">⇪</span> → <b>Add to Home Screen</b>, then open it from the icon.</div><button class="btn small" data-a="hide-install">Hide</button></div>`;
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
A['hide-install'] = () => {
  local.set('hideInstall', '1');
  refresh();
};

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
    <div class="chk-meta">${basisChip(c.basis)}${c.codeRef ? esc(c.codeRef) : ''}</div>
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
  const free = ps.filter((p) => !p.checkId);
  const freeQ = qs.filter((q) => !q.checkId);

  view.innerHTML = `
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
  if (v === 'defect') {
    if (prev !== 'defect') await store.setCheck(it.id, c.id, { state: 'defect' });
    refresh();
    commentSheet({ item: it, check: c }, {
      onCancel: async () => {
        // Nothing recorded: put the checkpoint back as it was.
        if (prev !== 'defect' && !store.checkPunches(it.id, c.id).length) {
          await store.setCheck(it.id, c.id, { state: prev });
          refresh();
        }
      },
    });
    return;
  }
  if (v === 'unknown') {
    if (prev !== 'unknown') await store.setCheck(it.id, c.id, { state: 'unknown' });
    refresh();
    questionSheet({ item: it, check: c }, {
      onCancel: async () => {
        if (prev !== 'unknown' && !store.itemQuestions(it.id).some((q) => q.checkId === c.id)) {
          await store.setCheck(it.id, c.id, { state: prev });
          refresh();
        }
      },
    });
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
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      if (s === 'remove') {
        api.close();
        if (await confirmSheet('Remove this checkpoint from this item?', { ok: 'Remove', danger: true })) {
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
  for (const c of un) c.state = 'ok';
  await store.updateItem(it.id, { checks: it.checks });
  refresh();
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
  location.replace('#/items');
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
      if (!sel) return toast('Pick OK, OK with comments or Rejected');
      if (sel === 'rej' && !note) {
        toast('Write the reason for rejection');
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

function commentSheet({ item, check }, { onCancel } = {}) {
  let cat = '';
  let saved = false;
  const pending = []; // processed photos waiting for the punch to be saved
  const picks = check && check.defects && check.defects.length ? check.defects : GENERAL_DEFECTS;
  const pendingHTML = () =>
    pending.map((p, i) => `<img src="${p.url}" alt="" data-s="pend-del" data-i="${i}">`).join('');
  const sh = sheet({
    title: check ? 'Defect comment' : 'Comment',
    sub: `${esc(item.no)} · ${esc(item.tag || '(no tag)')}${check ? `<br><b>${esc(check.text)}</b>` : ''}`,
    body: `<div class="sec-h" style="margin-top:8px">Quick pick</div>
      <div class="chips wrap picks">${picks.map((t) => `<button type="button" class="chip" data-s="pick">${esc(t)}</button>`).join('')}</div>
      ${field('Comment', '<textarea name="text" placeholder="What is wrong / what must be done" autocapitalize="sentences"></textarea>')}
      <div class="sec-h">Category</div><div id="catp">${catPicker(cat)}</div>
      ${field('Subcontractor to fix', input('subcontractor', item.subcontractor, '', 'dl-sub2'))}${datalist('dl-sub2', store.recent('subcontractor'))}
      ${field('Project punch no. (if already on the project list)', input('projectNo', ''))}
      <div class="sec-h">Photo</div>
      <div class="thumbs"><button type="button" class="add" data-s="photo"><span class="big">📷</span>Photo</button><span id="pend" class="thumbs" style="padding:0">${pendingHTML()}</span></div>
      <button type="button" class="btn small" data-s="photo-lib">From library…</button>
      <div class="tiny muted">Tap a new photo to remove it.</div>`,
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Save comment</button>`,
    onClose() {
      pending.forEach((p) => URL.revokeObjectURL(p.url));
      if (!saved && onCancel) onCancel();
    },
    async onClick(s, b, api) {
      const ta = $('textarea[name=text]', api.body);
      if (s === 'cancel') return api.close();
      if (s === 'pick') {
        const t = b.textContent.trim();
        ta.value = ta.value.trim() ? `${ta.value.trim().replace(/[.;]$/, '')}; ${t}` : t;
        return;
      }
      if (s === 'cat') {
        cat = b.dataset.v;
        $('#catp', api.body).innerHTML = catPicker(cat);
        return;
      }
      if (s === 'photo' || s === 'photo-lib') {
        pickPhotos(s === 'photo', async (files) => {
          const bz = busy('Saving photo…');
          try {
            for (const f of files) {
              const p = await processImage(f, { maxPx: S.settings.photoMaxPx, quality: S.settings.photoQuality });
              p.url = URL.createObjectURL(new Blob([p.thumb], { type: 'image/jpeg' }));
              pending.push(p);
            }
          } catch (e) {
            fail(e);
          } finally {
            bz.done();
            $('#pend', api.body).innerHTML = pendingHTML();
          }
        });
        return;
      }
      if (s === 'pend-del') {
        const [p] = pending.splice(+b.dataset.i, 1);
        if (p) URL.revokeObjectURL(p.url);
        $('#pend', api.body).innerHTML = pendingHTML();
        return;
      }
      if (s === 'save') {
        const d = formData(api.body);
        if (!d.text) {
          toast('Write the comment');
          ta.focus();
          return;
        }
        if (!cat) return toast('Pick a category');
        b.disabled = true;
        const p = await store.createPunch({
          itemId: item.id,
          checkId: check ? check.id : null,
          checkText: check ? check.text : '',
          category: cat,
          text: d.text,
          subcontractor: d.subcontractor,
          projectNo: d.projectNo,
        });
        for (const ph of pending) await store.addPhoto('punch', p.id, 'evidence', ph);
        if (check && check.state !== 'defect') await store.setCheck(item.id, check.id, { state: 'defect' });
        saved = true;
        api.close();
        refresh();
        toast(`${p.no} saved (Cat ${cat})`);
      }
    },
  });
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
    onClose() {
      if (!saved && onCancel) onCancel();
    },
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      const d = formData(api.body);
      if (s === 'del') {
        api.close();
        if (await confirmSheet(`Delete ${esc(q.no)}?`, { ok: 'Delete', danger: true })) {
          await store.deleteQuestion(q.id);
          refresh();
        }
        return;
      }
      if (!d.text) return toast('Write the question');
      if (isNew) {
        const nq = await store.createQuestion({ itemId: item ? item.id : null, checkId: check ? check.id : null, checkText: check ? check.text : '', text: d.text, askWho: d.askWho });
        if (check && check.state !== 'unknown') await store.setCheck(item.id, check.id, { state: 'unknown' });
        toast(`${nq.no} saved`);
      } else {
        const patch = { text: d.text, askWho: d.askWho, answer: d.answer };
        if (s === 'toggle') patch.status = q.status === 'answered' ? 'open' : 'answered';
        else if (d.answer && q.status === 'open') patch.status = 'answered';
        await store.updateQuestion(q.id, patch);
        toast('Saved');
      }
      saved = true;
      api.close();
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
  sheet({
    title: 'New punch item',
    sub: 'Not linked to a check – e.g. an item from the project punch list you need to verify.',
    body: `${field('Description', '<textarea name="text" autocapitalize="sentences"></textarea>')}
      <div class="sec-h">Category</div><div id="catp">${catPicker(cat)}</div>
      ${field('Project punch no.', input('projectNo', ''))}
      ${field('Tag / item', input('tag', ''))}
      ${field('Area', input('area', '', '', 'dl-a3'))}${datalist('dl-a3', store.recent('area'))}
      ${field('Subcontractor', input('subcontractor', '', '', 'dl-s3'))}${datalist('dl-s3', store.recent('subcontractor'))}`,
    foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="save">Save</button>`,
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      if (s === 'cat') {
        cat = b.dataset.v;
        $('#catp', api.body).innerHTML = catPicker(cat);
        return;
      }
      const d = formData(api.body);
      if (!d.text) return toast('Write the description');
      if (!cat) return toast('Pick a category');
      const p = await store.createPunch({ ...d, category: cat });
      api.close();
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
  view.innerHTML = `
    <div class="card">
      <div class="spread"><div class="row">${catBadge(p.category)}<b>${esc(p.no)}</b></div>${stBadge(p.status)}</div>
      <div class="tiny muted" style="margin-top:4px">Raised ${esc(fmtDateTime(p.createdAt))} · ${p.status === 'closed' ? `closed after ${daysBetween(p.createdAt, p.closedAt)} d` : `open ${daysBetween(p.createdAt)} d`}</div>
      ${item ? `<div class="small" style="margin-top:6px">From <a href="#/item/${encodeURIComponent(item.id)}">${esc(item.no)} · ${esc(item.tag || '(no tag)')}</a> (${esc(typeLabel(item.type))})</div>` : '<div class="small muted" style="margin-top:6px">Standalone punch item</div>'}
      ${p.checkText ? `<div class="small muted">Checkpoint: ${esc(p.checkText)}</div>` : ''}
    </div>

    ${field('Description', `<textarea data-pf="text" autocapitalize="sentences">${esc(p.text)}</textarea>`)}
    <div class="sec-h">Category</div>${catPicker(p.category).replace(/data-s="cat"/g, 'data-a="p-setcat"')}
    ${field('Project punch no.', `<input type="text" data-pf="projectNo" value="${esc(p.projectNo)}" autocomplete="off">`)}
    ${field('Subcontractor', `<input type="text" data-pf="subcontractor" value="${esc(p.subcontractor)}" list="dl-s4" autocomplete="off">`)}${datalist('dl-s4', store.recent('subcontractor'))}
    ${item ? '' : `${field('Tag / item', `<input type="text" data-pf="tag" value="${esc(p.tag)}" autocomplete="off">`)}${field('Area', `<input type="text" data-pf="area" value="${esc(p.area)}" list="dl-a4" autocomplete="off">`)}${datalist('dl-a4', store.recent('area'))}`}

    <div class="sec-h">Photos as found (${ev.length})</div>
    ${photoStrip('punch', p.id, 'evidence')}

    <div class="sec-h">Closure</div>
    <div class="card">
      ${p.status === 'open' ? `<div class="small">Waiting for construction to close it.</div>
        <div class="row wrap" style="margin-top:8px"><button class="btn" data-a="p-ready">Construction reports closed</button><button class="btn primary" data-a="p-verify">Verify closure now</button></div>` : ''}
      ${p.status === 'ready' ? `<div class="small"><b>Ready for QC</b> since ${esc(fmtDateTime(p.readyAt))}.</div>
        <div class="row wrap" style="margin-top:8px"><button class="btn primary" data-a="p-verify">Verify closure</button><button class="btn" data-a="p-reopen">Back to open</button></div>` : ''}
      ${p.status === 'closed' ? `<div class="small"><b>Verified closed</b> ${esc(fmtDateTime(p.closedAt))}</div>
        ${v && v.checks ? `<div class="tiny muted" style="margin-top:4px">${CLOSURE_CHECKS.map((c) => `${v.checks[c.id] === 'ok' ? '✓' : v.checks[c.id] === 'na' ? 'N/A' : '–'} ${esc(c.text)}`).join('<br>')}</div>` : ''}
        ${v && v.note ? `<div class="small" style="margin-top:4px">${esc(v.note)}</div>` : ''}
        <div class="row wrap" style="margin-top:8px"><button class="btn danger" data-a="p-reopen">Re-open</button></div>` : ''}
    </div>
    <div class="sec-h">Closure photos (${store.photosOf(p.id, 'closure').length})</div>
    ${photoStrip('punch', p.id, 'closure', { label: 'After fix' })}

    <div class="sec-h">History</div>
    <ul class="hist">${[...p.history].reverse().map((h) => `<li><b>${esc(h.action)}</b>${h.note ? ' – ' + esc(h.note) : ''}<div class="tiny muted">${esc(fmtDateTime(h.at))}</div></li>`).join('')}</ul>
    <hr><button class="btn small danger" data-a="p-del">Delete punch item</button>`;

  const main = p.status === 'closed' ? '' : `<button class="btn primary" data-a="p-verify">Verify closure</button>`;
  setBar(`<button class="btn icon" data-a="back" data-fallback="#/punch" aria-label="Back">‹</button>
    <button class="btn icon" data-a="photo-add" data-ot="punch" data-oid="${esc(p.id)}" data-role="${p.status === 'open' ? 'evidence' : 'closure'}" aria-label="Take photo">📷</button>
    ${p.status === 'open' ? '<button class="btn" data-a="p-ready">Ready for QC</button>' : ''}${main}`);

  // autosave text fields
  $$('[data-pf]', view).forEach((el) => {
    const save = debounce(() => store.updatePunch(p.id, { [el.dataset.pf]: el.value.trim() }), 600);
    el.addEventListener('input', save);
    el.addEventListener('blur', () => save.flush());
  });
}

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
    async onClick(s, b, api) {
      if (s === 'cancel') return api.close();
      await store.setPunchStatus(p.id, 'open', { note: formData(api.body).note || 'Re-opened' });
      api.close();
      refresh();
    },
  });
};
A['p-del'] = async () => {
  const p = curPunch;
  if (!(await confirmSheet(`Delete ${esc(p.no)} and its photos? This cannot be undone.`, { ok: 'Delete', danger: true }))) return;
  await store.deletePunch(p.id);
  location.replace(p.itemId ? `#/item/${encodeURIComponent(p.itemId)}` : '#/punch');
  toast('Deleted');
};

// QC closure verification
A['p-verify'] = () => {
  const p = curPunch;
  const st = {};
  const ev = store.photosOf(p.id, 'evidence');
  const rows = () =>
    CLOSURE_CHECKS.map(
      (c) => `<div class="chk ${st[c.id] ? 's-' + (st[c.id] === 'no' ? 'defect' : st[c.id]) : ''}"><div class="chk-text" style="margin-bottom:8px">${esc(c.text)}</div>
      <div class="seg three">${[['ok', '✓ Yes'], ['no', '✗ No'], ['na', 'N/A']].map(([k, l]) => `<button data-s="vc" data-id="${c.id}" data-v="${k}" class="${st[c.id] === k ? 'on' : ''}" ${k === 'no' ? 'data-v2="defect"' : ''}>${l}</button>`).join('')}</div></div>`,
    ).join('');
  const verdict = () => {
    const vals = CLOSURE_CHECKS.map((c) => st[c.id]);
    if (vals.includes('no')) return ['no', 'A check failed – the item is not closed.'];
    if (vals.some((x) => !x)) return ['', `${vals.filter((x) => !x).length} check(s) to answer.`];
    return ['ok', 'All checks passed.'];
  };
  const paintFoot = (api) => {
    const [k, msg] = verdict();
    $('#vmsg', api.body).innerHTML = `<div class="warnbox ${k === 'no' ? 'bad' : ''}" style="${k === 'ok' ? 'border-color:var(--ok);background:var(--ok-bg)' : ''}">${msg}</div>`;
    $('[data-s="closed"]', api.root).disabled = k !== 'ok';
  };
  const sh = sheet({
    title: `Verify closure · ${p.no}`,
    sub: `${catBadge(p.category)} ${esc(p.text)}`,
    body: `${ev.length ? `<div class="sec-h" style="margin-top:8px">As found</div><div class="thumbs sm">${ev.map((x) => img(x.id, 'thumb', '', x.rev)).join('')}</div>` : ''}
      <div id="vrows">${rows()}</div>
      <div class="sec-h">Closure photo</div>
      <div class="row wrap"><button class="btn" data-s="photo">📷 Take closure photo</button><span class="small muted" id="vph">${store.photosOf(p.id, 'closure').length} closure photo(s)</span></div>
      ${field('Note', '<textarea name="note" placeholder="What you saw"></textarea>')}
      <div id="vmsg"></div>`,
    foot: `<button class="btn danger" data-s="notclosed">Not closed</button><button class="btn primary" data-s="closed" disabled>Verified closed</button>`,
    async onClick(s, b, api) {
      if (s === 'vc') {
        st[b.dataset.id] = st[b.dataset.id] === b.dataset.v ? undefined : b.dataset.v;
        $('#vrows', api.body).innerHTML = rows();
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
        await store.setPunchStatus(p.id, 'closed', { note: note || 'Closure verified by QC', verify });
        api.close();
        refresh();
        toast(`${p.no} verified closed`);
      } else if (s === 'notclosed') {
        if (!note) {
          toast('Write why it is not closed');
          $('textarea', api.body).focus();
          return;
        }
        await store.setPunchStatus(p.id, 'open', { note, verify });
        api.close();
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
      <div class="small">Walkdown report: summary, follow-up list (all not-closed items), every item with result, checklist, comments and photos. Open it, then Share → Print → pinch out to save as PDF.</div>
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
      ${isReport ? '<div class="small muted">To make a PDF: open the report, tap Share → Print, then pinch out on the preview → Share → Save to Files.</div>' : ''}
      ${isBackup ? '<div class="warnbox">The backup only counts once it is saved somewhere off this phone (Files / iCloud Drive / e-mail).</div>' : ''}`,
    foot: `${isReport ? '<button class="btn" data-s="open">Open</button>' : ''}<button class="btn" data-s="save">Save</button>${canShare ? '<button class="btn primary" data-s="share">Share…</button>' : ''}`,
    async onClick(s, b, api) {
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
          if ((await saveFile(file)) && isBackup) await store.markBackedUp();
        } else if (s === 'open') {
          await openReport(file);
        }
      } catch (e) {
        if (s === 'share') {
          // Some file types / iOS versions refuse share(): fall back to saving.
          if ((await saveFile(file)) && isBackup) await store.markBackedUp();
        } else fail(e);
      }
    },
  });
}

// Show the report inside the app (no new window: home-screen apps have no tabs).
async function openReport(file) {
  const html = await file.text();
  const v = document.createElement('div');
  v.className = 'viewer report-viewer';
  v.innerHTML = `<div class="stage"><iframe title="Report" sandbox="allow-same-origin allow-modals"></iframe></div>
    <div class="vbar"><button class="btn" data-v="close">Close</button>${X.canShareFile(file) && !EMBEDDED ? '<button class="btn" data-v="share">Share…</button>' : ''}</div>`;
  document.body.appendChild(v);
  v.querySelector('iframe').srcdoc = html;
  v.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-v]');
    if (!b) return;
    if (b.dataset.v === 'close') v.remove();
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
          <button class="on" data-s="mode" data-v="merge">Merge<br><span class="small muted" style="font-weight:400">Add records from the backup; where both have a record, keep the newer one.</span></button>
          <button data-s="mode" data-v="replace">Replace everything<br><span class="small muted" style="font-weight:400">Delete all data on this phone, then load the backup.</span></button>
        </div>`,
      foot: `<button class="btn" data-s="cancel">Cancel</button><button class="btn primary" data-s="go">Restore</button>`,
      async onClick(s, b, api) {
        if (s === 'cancel') return api.close();
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
          notice('Restore done', `<div class="kv"><div>Items</div><div>${r.items}</div><div>Punch items</div><div>${r.punches}</div><div>Questions</div><div>${r.questions}</div><div>Photos</div><div>${r.photos}</div><div>Unchanged</div><div>${r.skipped} (newer copy already here)</div>${r.missingPhotos ? `<div>Missing photos</div><div>${r.missingPhotos}</div>` : ''}</div>`);
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
    <a class="card" href="#/help"><b>How to use / install / back up</b></a>

    <div class="sec-h">Danger zone</div>
    <div class="card"><button class="btn danger block" data-a="wipe">Delete all data on this phone…</button></div>
    <div class="tiny muted" style="margin:12px 2px">BOP QC Walkdown v${X.APP_VERSION} · checklist library ${esc(CHECKLIST_VERSION)} · no data leaves this phone unless you export it.</div>`;

  // Change the in-memory settings at once, write to storage shortly after.
  const persist = debounce(() => store.saveSettings({}), 400);
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
  box.innerHTML = `<div class="kv"><div>Used</div><div>${e.usage != null ? bytes(e.usage) : 'unknown'}${e.quota ? ` of ~${bytes(e.quota)}` : ''}</div>
      <div>Records</div><div>${S.items.size} items · ${S.punches.size} punch · ${S.questions.size} questions · ${nPhotos} photos</div>
      <div>Protected</div><div>${e.persisted === true ? 'Yes – iOS will not clear it automatically' : e.persisted === false ? 'Not confirmed' : 'Unknown on this browser'}</div></div>
    ${e.persisted === true ? '' : '<button class="btn small" style="margin-top:8px" data-a="persist">Ask the phone to keep data</button>'}
    <div class="tiny muted" style="margin-top:6px">Deleting the home-screen icon deletes the data. Back up regularly.</div>`;
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
      if (formData(api.body).confirm !== 'DELETE') return toast('Type DELETE to confirm');
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
A['tpl-toggle'] = async (el, ev) => {
  // checkbox: let it toggle, then persist
  const k = el.dataset.k;
  const set = new Set(S.templates.hidden[k] || []);
  if (set.has(el.dataset.id)) set.delete(el.dataset.id);
  else set.add(el.dataset.id);
  S.templates.hidden[k] = [...set];
  await store.saveTemplates();
  refresh();
};
A['tpl-add'] = async (el) => {
  const k = el.dataset.k;
  const text = $('#ctext').value.trim();
  if (!text) return toast('Write the checkpoint');
  const group = $('#cgroup').value.trim() || 'Added';
  (S.templates.custom[k] ||= []).push({ id: `c_${Date.now().toString(36)}`, group, text });
  await store.saveTemplates();
  refresh();
  toast('Added');
};
A['tpl-del'] = async (el) => {
  const k = el.dataset.k;
  S.templates.custom[k] = (S.templates.custom[k] || []).filter((c) => c.id !== el.dataset.id);
  await store.saveTemplates();
  refresh();
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
    <h3>Back up</h3>
    <p>Everything stays on this phone. iOS deletes it if you delete the home-screen icon. Export → <b>Make backup</b> → Share → Save to Files / iCloud Drive (or e-mail it to yourself) at least every few days. Restore with Export → Restore.</p>
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

// Save any half-typed field when the app goes to the background.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && document.activeElement && document.activeElement.blur) document.activeElement.blur();
});

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
    .register('sw.js')
    .then((reg) => {
      const offer = (w) => {
        if (!w || !navigator.serviceWorker.controller) return;
        const el = document.createElement('div');
        el.className = 'banner info';
        el.innerHTML = '<div class="grow small"><b>Update ready.</b> Your data is kept.</div><button class="btn small primary">Update</button>';
        el.querySelector('button').onclick = () => w.postMessage('skipWaiting');
        view.prepend(el);
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => w.state === 'installed' && offer(w));
      });
    })
    .catch((e) => console.warn('SW registration failed', e));
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
  try {
    history.replaceState({ inApp: false }, '');
  } catch {}
  render();
  registerSW();
  // Ask once for persistent storage after there is something worth keeping.
  if (S.items.size && !local.get('askedPersist')) {
    local.set('askedPersist', '1');
    db.requestPersist();
  }
}

boot();
