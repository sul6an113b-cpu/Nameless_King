// Exports: CSV (Excel), HTML report, ZIP package, ZIP backup + restore.

import * as db from './db.js';
import { S, RESULTS, CHECK_STATES, PUNCH_STATUS, typeInfo, catInfo, catRank, itemPunches, itemQuestions, punchStats, checkProgress, photosOf, load } from './store.js';
import { forgetURL } from './photo.js';
import { makeZip, openZip } from './zip.js';
import { esc, fmtDate, fmtDateTime, isoDay, daysBetween, slug, stamp, u8ToBase64, noNum } from './util.js';
import { CHECKLIST_VERSION, CLOSURE_CHECKS } from './checklists.js';

export const APP_VERSION = '1.1.0';
const BACKUP_FORMAT = 'bopqc-backup';

// ---------- scope -----------------------------------------------------------
// f = {area, from, to, punchStatus: 'all'|'notclosed'}
export function scope(f = {}) {
  // Single-item report: just that item, its comments and questions.
  if (f.itemIds && f.itemIds.length) {
    const ids = new Set(f.itemIds);
    const items = f.itemIds.map((id) => S.items.get(id)).filter(Boolean);
    const punches = [...S.punches.values()].filter((p) => ids.has(p.itemId)).sort(punchSort);
    const questions = [...S.questions.values()].filter((q) => ids.has(q.itemId)).sort((a, b) => noNum(a.no) - noNum(b.no));
    return { items, punches, followUp: punches.filter((p) => p.status !== 'closed'), questions, filter: f };
  }
  const inArea = (a) => !f.area || (a || '') === f.area;
  const inSub = (x) => !f.sub || (x || '') === f.sub;
  const inDates = (iso) => {
    const d = isoDay(iso);
    return (!f.from || d >= f.from) && (!f.to || d <= f.to);
  };
  const statusOk = (p) => f.punchStatus !== 'notclosed' || p.status !== 'closed';
  // Items checked in the area / date range. The subcontractor filter applies to
  // punch items (each comment names who must fix it), not to the item.
  const areaItems = [...S.items.values()].filter((i) => inArea(i.area) && inDates(i.createdAt));
  const areaIds = new Set(areaItems.map((i) => i.id));
  const allPunches = [...S.punches.values()].filter((p) => inArea(p.area) && inSub(p.subcontractor));
  // Punch list: comments on those items + standalone punch items raised in the date range.
  const punches = allPunches.filter((p) => (p.itemId ? areaIds.has(p.itemId) : inDates(p.createdAt)) && statusOk(p)).sort(punchSort);
  const withPunch = new Set(punches.map((p) => p.itemId));
  const items = areaItems.filter((i) => !f.sub || i.subcontractor === f.sub || withPunch.has(i.id)).sort((a, b) => noNum(a.no) - noNum(b.no));
  const itemIds = new Set(items.map((i) => i.id));
  // Follow-up: everything in the area (and subcontractor) not yet verified closed, regardless of date.
  const followUp = allPunches.filter((p) => p.status !== 'closed').sort(punchSort);
  const questions = [...S.questions.values()]
    .filter((q) => (q.itemId ? itemIds.has(q.itemId) : inArea(q.area) && !f.sub && inDates(q.createdAt)))
    .sort((a, b) => noNum(a.no) - noNum(b.no));
  return { items, punches, followUp, questions, filter: f };
}

function punchSort(a, b) {
  return catRank(a.category) - catRank(b.category) || noNum(a.no) - noNum(b.no);
}

export function scopeLabel(f = {}) {
  if (f.itemIds && f.itemIds.length) {
    return `Item: ${f.itemIds.map((id) => S.items.get(id)).filter(Boolean).map((i) => `${i.no} ${i.tag}`).join(', ')}`;
  }
  const parts = [];
  parts.push(f.area ? `Area: ${f.area}` : 'All areas');
  if (f.sub) parts.push(`Subcontractor: ${f.sub}`);
  // f.from / f.to are local calendar days ("2026-10-14"): read them as local time.
  const day = (d) => fmtDate(`${d}T00:00`);
  if (f.from || f.to) parts.push(`Checks dated ${f.from ? day(f.from) : '…'} to ${f.to ? day(f.to) : '…'}`);
  else parts.push('All dates');
  if (f.punchStatus === 'notclosed') parts.push('Punch: not closed only');
  return parts.join(' · ');
}

// ---------- photo file names -------------------------------------------------
// Stable, readable, unique names so CSV rows, the report and the ZIP point at the
// same files. Draft photos (comment not saved yet) are not exported.
export function photoFileNames() {
  const names = new Map();
  const used = new Set();
  for (const [ownerId, list] of S.photos) {
    const item = S.items.get(ownerId);
    const punch = S.punches.get(ownerId);
    if (!item && !punch) continue;
    const base = item ? `${slug(item.no, 20)}${item.tag ? '_' + slug(item.tag, 30) : ''}` : slug(punch.no, 20);
    let e = 0, c = 0;
    for (const p of list) {
      let n = p.role === 'closure' ? `${base}_closure_${++c}` : `${base}_${++e}`;
      if (used.has(n)) n = `${n}_${ownerId.slice(0, 6)}`;
      used.add(n);
      names.set(p.id, `${n}.jpg`);
    }
  }
  return names;
}

// ---------- CSV --------------------------------------------------------------

function cell(v) {
  let s = v == null ? '' : String(v);
  // Stop Excel treating free text as a formula (e.g. "- missing drain").
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(header, rows) {
  // BOM so Excel opens UTF-8 (Arabic names, °, etc.) correctly.
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const resultLabel = (r) => (r ? RESULTS[r].label : 'In progress');
// An unconfirmed definition is never exported as if it were the project's.
const catLabel = (code) => {
  const c = catInfo(code);
  if (!c.confirmed) return c.meaning ? `${c.meaning} (NOT CONFIRMED)` : 'Definition not confirmed';
  return c.meaning || '';
};

const ANSWER = { ok: 'Yes', no: 'No', na: 'N/A' };
// The answers given at the last closure verification, e.g. "Item located: Yes; …".
function closureChecks(p) {
  const v = p.verify && p.verify.checks;
  if (!v) return '';
  return CLOSURE_CHECKS.filter((c) => v[c.id]).map((c) => `${c.text}: ${ANSWER[v[c.id]] || v[c.id]}`).join('; ');
}

export function punchCSV(punches, names = photoFileNames()) {
  const header = ['Local no', 'Project punch no', 'Category', 'Category meaning', 'Status', 'Description', 'Checkpoint', 'Tag', 'Area / system', 'Subcontractor', 'Item check no', 'Item type', 'Item result', 'Raised', 'Ready for QC', 'Verified closed', 'Days open', 'Closure note', 'Closure checks', 'Photos', 'Closure photos', 'History'];
  const rows = punches.map((p) => {
    const item = p.itemId ? S.items.get(p.itemId) : null;
    const ev = photosOf(p.id, 'evidence').map((x) => names.get(x.id)).join('; ');
    const cl = photosOf(p.id, 'closure').map((x) => names.get(x.id)).join('; ');
    const last = [...p.history].reverse().find((h) => h.action === 'verified' || h.action === 'reopened');
    return [
      p.no, p.projectNo, p.category, catLabel(p.category), PUNCH_STATUS[p.status], p.text, p.checkText,
      p.tag, p.area, p.subcontractor, item ? item.no : '', item ? typeInfo(item.type).label : '', item ? resultLabel(item.result) : '',
      fmtDateTime(p.createdAt), fmtDateTime(p.readyAt), fmtDateTime(p.closedAt),
      p.status === 'closed' ? daysBetween(p.createdAt, p.closedAt) : daysBetween(p.createdAt),
      last ? last.note : '', closureChecks(p), ev, cl,
      p.history.map((h) => `${fmtDateTime(h.at)} ${h.action}${h.note ? ': ' + h.note : ''}`).join(' | '),
    ];
  });
  return toCSV(header, rows);
}

export function itemsCSV(items, names = photoFileNames()) {
  const header = ['Check no', 'Date', 'Type', 'Tag / item', 'Area', 'System', 'Location', 'Subcontractor', 'Inspector', 'Attended by', 'Result', 'Result note', 'Result date', 'Checkpoints', 'OK', 'Defect', 'Unknown', 'N/A', 'Not marked', 'Comments', 'Open', 'Ready for QC', 'Closed', 'Open by category', 'Questions open', 'Drawing / ISO', 'P&ID', 'Test pack', 'ITP / procedure', 'Other ref', 'Re-inspection of', 'Photos'];
  const rows = items.map((i) => {
    const pr = checkProgress(i);
    const ps = punchStats(itemPunches(i.id));
    const qs = itemQuestions(i.id).filter((q) => q.status === 'open').length;
    const prev = i.prevId ? S.items.get(i.prevId) : null;
    const r = i.refs || {};
    return [
      i.no, fmtDateTime(i.createdAt), typeInfo(i.type).label, i.tag, i.area, i.system, i.location, i.subcontractor, i.inspector, i.attended,
      resultLabel(i.result), i.resultNote, fmtDateTime(i.resultAt),
      pr.total, pr.ok, pr.defect, pr.unknown, pr.na, pr.total - pr.marked,
      itemPunches(i.id).length, ps.open, ps.ready, ps.closed,
      Object.entries(ps.byCat).sort((a, b) => catRank(a[0]) - catRank(b[0])).map(([k, v]) => `${k}:${v}`).join(' '),
      qs, r.drawing, r.pid, r.testPack, r.itp, r.other, prev ? prev.no : '',
      photosOf(i.id).map((x) => names.get(x.id)).join('; '),
    ];
  });
  return toCSV(header, rows);
}

export function checkpointsCSV(items) {
  const header = ['Check no', 'Tag / item', 'Area', 'Type', 'Group', 'Checkpoint', 'Result', 'Note', 'Basis', 'Code reference', 'Comments raised'];
  const rows = [];
  for (const i of items) {
    for (const c of i.checks) {
      const raised = itemPunches(i.id).filter((p) => p.checkId === c.id).map((p) => `${p.no} (${p.category})`).join('; ');
      rows.push([i.no, i.tag, i.area, typeInfo(i.type).label, c.group, c.text, c.state ? CHECK_STATES[c.state] : 'Not marked', c.note, basisLabel(c.basis), c.codeRef, raised]);
    }
  }
  return toCSV(header, rows);
}

export function questionsCSV(questions) {
  const header = ['No', 'Status', 'Question', 'Ask who', 'Answer', 'Tag / item', 'Area', 'Item check no', 'Checkpoint', 'Raised', 'Answered'];
  const rows = questions.map((q) => {
    const item = q.itemId ? S.items.get(q.itemId) : null;
    return [q.no, q.status === 'answered' ? 'Answered' : 'Open', q.text, q.askWho, q.answer, q.tag, q.area, item ? item.no : '', q.checkText, fmtDateTime(q.createdAt), fmtDateTime(q.answeredAt)];
  });
  return toCSV(header, rows);
}

export function basisLabel(b) {
  return { code: 'Code (generic)', practice: 'Common practice', project: 'Project requirement – value unknown', custom: 'Added locally' }[b] || '';
}

// ---------- HTML report -----------------------------------------------------
// photoMode: 'none' | 'small' (embedded thumbnails) | 'large' (embedded full) | 'files' (photos/<name>)

async function photoSrcMap(photoIds, photoMode, names) {
  const map = new Map();
  if (photoMode === 'none') return map;
  for (const id of photoIds) {
    if (photoMode === 'files') {
      map.set(id, `photos/${encodeURIComponent(names.get(id))}`);
      continue;
    }
    const b = await db.get('blobs', id);
    if (!b) continue;
    const buf = photoMode === 'large' ? b.data : b.thumb || b.data;
    map.set(id, `data:image/jpeg;base64,${u8ToBase64(new Uint8Array(buf))}`);
  }
  return map;
}

const REPORT_CSS = `
*{box-sizing:border-box}body{font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#111;background:#fff;margin:0;padding:16px;max-width:1000px;margin:auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #111;padding-bottom:4px}h3{font-size:15px;margin:0}
.muted{color:#555}.small{font-size:12px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}th{background:#eee;font-weight:600}
.badge{display:inline-block;padding:1px 7px;border-radius:10px;font-weight:700;font-size:12px;border:1px solid #333;white-space:nowrap}
.r-ok{background:#d6f5dd;border-color:#1b7a34}.r-okc{background:#fff0c2;border-color:#9a6b00}.r-rej{background:#ffd9d6;border-color:#b3261e}.r-none{background:#eee}
.cat{background:#fff;border-color:#333}.cat-A{background:#b3261e;color:#fff;border-color:#b3261e}.cat-Bp{background:#e8590c;color:#fff;border-color:#e8590c}.cat-B{background:#f08c00;color:#111;border-color:#f08c00}.cat-C{background:#1971c2;color:#fff;border-color:#1971c2}.cat-D{background:#868e96;color:#fff;border-color:#868e96}
.s-ok{color:#1b7a34;font-weight:600}.s-defect{color:#b3261e;font-weight:700}.s-unknown{color:#9a6b00;font-weight:700}.s-na{color:#555}.s-none{color:#999}
.item{border:1px solid #999;border-radius:6px;padding:10px 12px;margin:14px 0;page-break-inside:avoid}
.hd{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.kv{display:grid;grid-template-columns:max-content 1fr;gap:2px 10px;margin:6px 0}
.photos{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.photos figure{margin:0;width:180px}.photos img{width:180px;height:auto;border:1px solid #999;display:block}.photos figcaption{font-size:11px;color:#444;word-break:break-all}
.photos.large figure,.photos.large img{width:100%;max-width:480px}
.note{background:#f6f6f6;border-left:3px solid #999;padding:4px 8px;margin:6px 0}
.disc{font-size:12px;color:#444;border:1px dashed #999;padding:6px 8px;margin:8px 0}
@media print{body{padding:0}.item{page-break-inside:avoid}h2{page-break-after:avoid}a{color:#111}}
`;

function catBadge(code) {
  if (!code) return '<span class="badge cat">–</span>';
  return `<span class="badge cat cat-${esc(code.replace('+', 'p'))}">${esc(code)}</span>`;
}
function resultBadge(r) {
  return `<span class="badge r-${r || 'none'}">${esc(resultLabel(r))}</span>`;
}

function photosHTML(list, src, names, large) {
  const figs = list
    .filter((p) => src.has(p.id))
    .map((p) => `<figure><img src="${esc(src.get(p.id))}" alt=""><figcaption>${esc(names.get(p.id))}${p.caption ? ' – ' + esc(p.caption) : ''}</figcaption></figure>`)
    .join('');
  return figs ? `<div class="photos${large ? ' large' : ''}">${figs}</div>` : '';
}

export async function reportHTML(sc, { photoMode = 'small' } = {}) {
  const names = photoFileNames();
  const st = S.settings;
  const ids = [];
  for (const i of sc.items) photosOf(i.id).forEach((p) => ids.push(p.id));
  for (const p of sc.punches) photosOf(p.id).forEach((x) => ids.push(x.id));
  const src = await photoSrcMap(ids, photoMode, names);
  const large = photoMode === 'large';

  const resCount = { ok: 0, okc: 0, rej: 0, none: 0 };
  sc.items.forEach((i) => resCount[i.result || 'none']++);
  const cats = st.categories.map((c) => c.code);
  const catRows = cats
    .concat(sc.punches.some((p) => !cats.includes(p.category)) ? ['–'] : [])
    .map((c) => {
      const l = sc.punches.filter((p) => (cats.includes(p.category) ? p.category === c : c === '–'));
      const cnt = (s) => l.filter((p) => p.status === s).length;
      return `<tr><td>${c === '–' ? '–' : catBadge(c)}</td><td>${esc(catLabel(c))}</td><td>${cnt('open')}</td><td>${cnt('ready')}</td><td>${cnt('closed')}</td><td>${l.length}</td></tr>`;
    })
    .join('');

  const editions = Object.entries(st.editions || {})
    .map(([k, v]) => `${esc(k)}: ${v ? esc(v) : '<b>edition unknown – confirm</b>'}`)
    .join(' · ');

  const punchRow = (p) => {
    const item = p.itemId ? S.items.get(p.itemId) : null;
    return `<tr><td>${esc(p.no)}${p.projectNo ? `<br><span class="small muted">${esc(p.projectNo)}</span>` : ''}</td><td>${catBadge(p.category)}</td><td>${esc(p.text)}${p.checkText ? `<br><span class="small muted">Checkpoint: ${esc(p.checkText)}</span>` : ''}</td><td>${esc(p.tag)}${item ? `<br><span class="small muted">${esc(item.no)}</span>` : ''}</td><td>${esc(p.area)}</td><td>${esc(p.subcontractor)}</td><td>${esc(PUNCH_STATUS[p.status])}${p.closedAt ? `<br><span class="small">${esc(fmtDate(p.closedAt))}</span>` : ''}</td><td>${esc(fmtDate(p.createdAt))}</td><td>${p.status === 'closed' ? daysBetween(p.createdAt, p.closedAt) : daysBetween(p.createdAt)}</td></tr>`;
  };
  const punchTable = (list) =>
    list.length
      ? `<table><thead><tr><th>No</th><th>Cat</th><th>Description</th><th>Tag</th><th>Area</th><th>Subcon</th><th>Status</th><th>Raised</th><th>Days</th></tr></thead><tbody>${list.map(punchRow).join('')}</tbody></table>`
      : '<p class="muted">None.</p>';

  const inScope = new Set(sc.punches.map((p) => p.id));
  const itemsHTML = sc.items
    .map((i) => {
      const t = typeInfo(i.type);
      const pr = checkProgress(i);
      const prev = i.prevId ? S.items.get(i.prevId) : null;
      const r = i.refs || {};
      const refRows = [['Drawing / ISO', r.drawing], ['P&ID', r.pid], ['Test pack', r.testPack], ['ITP / procedure', r.itp], ['Other ref', r.other]]
        .filter(([, v]) => v)
        .map(([k, v]) => `<div class="muted">${esc(k)}</div><div>${esc(v)}</div>`)
        .join('');
      const checks = i.checks.length
        ? `<table><thead><tr><th style="width:38%">Checkpoint</th><th>Result</th><th>Note / comments</th><th class="small">Basis / ref</th></tr></thead><tbody>${i.checks
            .map((c) => {
              const raised = itemPunches(i.id).filter((p) => p.checkId === c.id);
              return `<tr><td>${c.group ? `<span class="small muted">${esc(c.group)}</span><br>` : ''}${esc(c.text)}</td><td class="s-${c.state || 'none'}">${esc(c.state ? CHECK_STATES[c.state] : 'Not marked')}</td><td>${esc(c.note)}${raised.map((p) => `<div>${catBadge(p.category)} ${esc(p.no)} ${esc(p.text)}</div>`).join('')}</td><td class="small">${esc(basisLabel(c.basis))}${c.codeRef ? `<br>${esc(c.codeRef)}` : ''}</td></tr>`;
            })
            .join('')}</tbody></table>`
        : '';
      const ps = itemPunches(i.id).filter((p) => inScope.has(p.id));
      const qs = itemQuestions(i.id);
      return `<section class="item">
        <div class="hd"><div><h3>${esc(i.no)} · ${esc(i.tag || '(no tag)')}</h3><div class="muted small">${esc(t.label)} · ${esc(fmtDateTime(i.createdAt))}${i.inspector ? ' · ' + esc(i.inspector) : ''}</div></div>${resultBadge(i.result)}</div>
        <div class="kv small">${i.area ? `<div class="muted">Area</div><div>${esc(i.area)}</div>` : ''}${i.system ? `<div class="muted">System</div><div>${esc(i.system)}</div>` : ''}${i.location ? `<div class="muted">Location</div><div>${esc(i.location)}</div>` : ''}${i.subcontractor ? `<div class="muted">Subcontractor</div><div>${esc(i.subcontractor)}</div>` : ''}${i.attended ? `<div class="muted">Attended by</div><div>${esc(i.attended)}</div>` : ''}${prev ? `<div class="muted">Re-inspection of</div><div>${esc(prev.no)} (${esc(resultLabel(prev.result))})</div>` : ''}${refRows}</div>
        ${i.resultNote ? `<div class="note"><b>Result note:</b> ${esc(i.resultNote)}</div>` : ''}
        <div class="small muted">Checkpoints: ${pr.total} · OK ${pr.ok} · Defect ${pr.defect} · Unknown ${pr.unknown} · N/A ${pr.na} · Not marked ${pr.total - pr.marked}</div>
        ${photosHTML(photosOf(i.id), src, names, large)}
        ${checks}
        ${ps.length ? `<h3 style="margin-top:8px">Comments / punch (${ps.length})</h3>${punchTable(ps)}${ps.map((p) => photosHTML(photosOf(p.id), src, names, large)).join('')}` : ''}
        ${qs.length ? `<h3 style="margin-top:8px">Open questions</h3><ul>${qs.map((q) => `<li>${esc(q.no)}: ${esc(q.text)}${q.answer ? ` — <b>Answer:</b> ${esc(q.answer)}` : ' — <i>unanswered</i>'}</li>`).join('')}</ul>` : ''}
      </section>`;
    })
    .join('');

  const standalone = sc.punches.filter((p) => !p.itemId);
  const title = `${st.projectLabel ? st.projectLabel + ' – ' : ''}BOP QC walkdown report`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${REPORT_CSS}</style></head><body>
<h1>${esc(title)}</h1>
<div class="muted">Generated ${esc(fmtDateTime(new Date().toISOString()))}${st.inspector ? ' · Inspector: ' + esc(st.inspector) : ''}</div>
<div class="muted small">Scope: ${esc(scopeLabel(sc.filter))}</div>
<div class="disc">Code references in checklists are generic. Clauses marked "verify clause/edition" were not confirmed; project code editions: ${editions}. "Unknown – ask" means the requirement depends on project documents and is listed as an open question. Checklist library ${esc(CHECKLIST_VERSION)}.</div>
<h2>Summary</h2>
<table><tbody><tr><th>Items checked</th><td>${sc.items.length}</td><th>OK</th><td>${resCount.ok}</td><th>OK with comments</th><td>${resCount.okc}</td><th>Rejected</th><td>${resCount.rej}</td><th>In progress</th><td>${resCount.none}</td></tr></tbody></table>
<table><thead><tr><th>Cat</th><th>Meaning</th><th>Open</th><th>Ready for QC</th><th>Closed</th><th>Total</th></tr></thead><tbody>${catRows}</tbody></table>
<h2>Follow-up: punch items not yet verified closed (${sc.followUp.length})</h2>
<div class="small muted">${sc.filter.itemIds ? 'This item only' : `All dates${sc.filter.area ? ', area ' + esc(sc.filter.area) : ''}${sc.filter.sub ? ', subcontractor ' + esc(sc.filter.sub) : ''}`}. Sorted by category.</div>
${punchTable(sc.followUp)}
<h2>Items (${sc.items.length})</h2>
${itemsHTML || '<p class="muted">No items in scope.</p>'}
${standalone.length ? `<h2>Punch items not linked to a check (${standalone.length})</h2>${punchTable(standalone)}${standalone.map((p) => photosHTML(photosOf(p.id), src, names, large)).join('')}` : ''}
<h2>Questions to ask on site (${sc.questions.length})</h2>
${sc.questions.length ? `<table><thead><tr><th>No</th><th>Status</th><th>Question</th><th>Tag</th><th>Answer</th></tr></thead><tbody>${sc.questions.map((q) => `<tr><td>${esc(q.no)}</td><td>${q.status === 'answered' ? 'Answered' : '<b>Open</b>'}</td><td>${esc(q.text)}${q.askWho ? `<br><span class="small muted">Ask: ${esc(q.askWho)}</span>` : ''}</td><td>${esc(q.tag)}</td><td>${esc(q.answer)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">None.</p>'}
</body></html>`;
}

// ---------- files -----------------------------------------------------------

function baseName() {
  const p = slug(S.settings.projectLabel || '', 24);
  return `${p ? p + '_' : ''}BOP-QC`;
}

export async function reportFile(sc, photoMode) {
  const html = await reportHTML(sc, { photoMode });
  return new File([html], `${baseName()}_report_${stamp()}.html`, { type: 'text/html' });
}

export function csvFile(kind, sc) {
  const map = { punch: () => punchCSV(sc.punches), items: () => itemsCSV(sc.items), checkpoints: () => checkpointsCSV(sc.items), questions: () => questionsCSV(sc.questions) };
  return new File([map[kind]()], `${baseName()}_${kind}_${stamp()}.csv`, { type: 'text/csv' });
}

// Report + all CSVs + full-size photos in one ZIP (for the office PC).
// Every photo named in any CSV of the package is inside the ZIP.
export async function packageFile(sc, onProgress = () => {}) {
  const names = photoFileNames();
  const html = await reportHTML(sc, { photoMode: 'files' });
  const entries = [
    { name: 'report.html', data: html },
    { name: 'punch_list.csv', data: punchCSV(sc.punches, names) },
    { name: 'follow_up_not_closed.csv', data: punchCSV(sc.followUp, names) },
    { name: 'items.csv', data: itemsCSV(sc.items, names) },
    { name: 'checkpoints.csv', data: checkpointsCSV(sc.items) },
    { name: 'questions.csv', data: questionsCSV(sc.questions) },
  ];
  const owners = new Set([...sc.items.map((i) => i.id), ...sc.punches.map((p) => p.id), ...sc.followUp.map((p) => p.id)]);
  const photoIds = [...owners].flatMap((o) => photosOf(o).map((p) => p.id));
  let n = 0;
  for (const id of photoIds) {
    entries.push({
      name: `photos/${names.get(id)}`,
      load: async () => {
        const b = await db.get('blobs', id);
        return b ? b.data : null;
      },
    });
  }
  const blob = await makeZip(entries, () => onProgress(Math.min(++n, photoIds.length), photoIds.length));
  return new File([blob], `${baseName()}_package_${stamp()}.zip`, { type: 'application/zip' });
}

// ---------- backup / restore -------------------------------------------------
// backup.json holds every record; blobs/<id>.jpg (+ _t thumb, _o / _ot original
// before mark-up) hold the photo bytes. Photos are read one at a time.

export async function backupFile(onProgress = () => {}) {
  const counters = await db.getMeta('counters', {});
  const photos = await db.all('photos');
  const data = {
    format: BACKUP_FORMAT,
    version: 1,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    settings: S.settings,
    templates: S.templates,
    counters,
    items: [...S.items.values()],
    punches: [...S.punches.values()],
    questions: [...S.questions.values()],
    drafts: Object.fromEntries(S.drafts),
    photos,
  };
  const entries = [{ name: 'backup.json', data: JSON.stringify(data) }];
  for (const p of photos) {
    // One read per photo; its four parts are handed out from that read, then
    // released so only one photo is held in memory at a time.
    let cur = null;
    const part = (k, last) => async () => {
      if (!cur) cur = (await db.get('blobs', p.id)) || {};
      const v = cur[k] || null;
      if (last) cur = null;
      return v;
    };
    entries.push(
      { name: `blobs/${p.id}.jpg`, load: part('data') },
      { name: `blobs/${p.id}_t.jpg`, load: part('thumb') },
      { name: `blobs/${p.id}_o.jpg`, load: part('orig') },
      { name: `blobs/${p.id}_ot.jpg`, load: part('origThumb', true) },
    );
  }
  let e = 0;
  const blob = await makeZip(entries, () => onProgress(Math.min(photos.length, Math.floor(++e / 4)), photos.length));
  return new File([blob], `${baseName()}_backup_${stamp()}.zip`, { type: 'application/zip' });
}

const stampOf = (r) => r.updatedAt || r.createdAt || '';
const newer = (a, b) => !b || stampOf(a) > stampOf(b);
const photoNewer = (a, b) => !b || stampOf(a) > stampOf(b) || (a.rev || 0) > (b.rev || 0);
const KIND = { items: 'item', punches: 'punch', questions: 'question' };
const PAD = { items: 4, punches: 4, questions: 3 };

// mode: 'merge' (add new, keep the newer copy of each record) | 'replace' (wipe first)
export async function restore(file, mode = 'merge') {
  const zip = await openZip(file);
  // Also accept a backup that was unzipped and re-zipped as a folder.
  const jsonName = zip.names.find((n) => /(^|\/)backup\.json$/.test(n) && !n.startsWith('__MACOSX/'));
  if (!jsonName) throw new Error('backup.json not found – this is not a BOP QC backup.');
  const prefix = jsonName.slice(0, -'backup.json'.length);
  const bn = (id, sfx = '') => `${prefix}blobs/${id}${sfx}.jpg`;
  const data = JSON.parse(new TextDecoder().decode(await zip.read(jsonName)));
  if (data.format !== BACKUP_FORMAT) throw new Error('Unknown backup format.');
  if (data.version > 1) throw new Error('This backup was made by a newer version of the app. Update the app first.');

  // Check the whole file before changing anything.
  for (const store of ['items', 'punches', 'questions']) {
    for (const r of data[store] || []) if (!r || !r.id || typeof r.no !== 'string') throw new Error(`Backup damaged (${store}). Nothing was changed.`);
  }
  const photos = (data.photos || []).filter((p) => p && p.id && p.ownerId);
  const missing = photos.filter((p) => !zip.has(bn(p.id)));
  if (mode === 'replace' && missing.length) throw new Error(`Backup incomplete: ${missing.length} photo file(s) missing. Nothing was changed.`);

  const report = { items: 0, punches: 0, questions: 0, photos: 0, skipped: 0, missingPhotos: missing.length, renumbered: [], settings: 'kept' };
  const emptyPhone = S.items.size + S.punches.size + S.questions.size === 0;

  let wiped = false;
  try {
    if (mode === 'replace') {
      // Wipe and the "restore not finished" marker commit together.
      await db.clearAll({ key: 'restoreIncomplete', value: { at: new Date().toISOString(), file: file.name } });
      wiped = true;
    }
    const existing = {
      items: mode === 'replace' ? new Map() : new Map(S.items),
      punches: mode === 'replace' ? new Map() : new Map(S.punches),
      questions: mode === 'replace' ? new Map() : new Map(S.questions),
    };
    const existingPhotos = mode === 'replace' ? new Map() : new Map((await db.all('photos')).map((p) => [p.id, p]));

    // Merge: a record from the backup whose number is already used on this phone by
    // a different record gets a new number, so CHK / P / Q numbers stay unique.
    if (mode === 'merge') {
      for (const store of ['items', 'punches', 'questions']) {
        const maxNo = Math.max(0, ...[...existing[store].values(), ...(data[store] || [])].map((r) => noNum(r.no)));
        await db.bumpSeq(KIND[store], maxNo);
      }
    }

    const ops = [];
    const flush = async () => {
      if (ops.length) await db.batch(ops.splice(0));
    };
    for (const store of ['items', 'punches', 'questions']) {
      const used = new Map([...existing[store].values()].map((r) => [r.no, r.id]));
      for (let rec of data[store] || []) {
        const local = existing[store].get(rec.id);
        if (!newer(rec, local)) {
          report.skipped++;
          continue;
        }
        // A record this phone renumbered earlier keeps its number here, even when
        // a newer copy of it arrives with the original number.
        if (mode === 'merge' && local && local.no !== rec.no) {
          rec = { ...rec, no: local.no, formerNo: local.formerNo || rec.no };
          if (store === 'punches') {
            const seen = new Set((rec.history || []).map((h) => `${h.action}|${h.note}`));
            const extra = (local.history || []).filter((h) => h.action === 'renumbered' && !seen.has(`${h.action}|${h.note}`));
            rec.history = [...(rec.history || []), ...extra].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
          }
        }
        const clash = used.get(rec.no);
        if (mode === 'merge' && clash && clash !== rec.id) {
          const n = await db.nextSeq(KIND[store]);
          const no = `${rec.no.replace(/\d+\s*$/, '')}${String(n).padStart(PAD[store], '0')}`;
          report.renumbered.push(`${rec.no} → ${no}`);
          rec = { ...rec, no, formerNo: rec.no };
          if (store === 'punches') rec.history = [...(rec.history || []), { at: new Date().toISOString(), action: 'renumbered', note: `${rec.formerNo} → ${no} on restore (number already used on this phone)` }];
        }
        used.set(rec.no, rec.id);
        ops.push({ store, op: 'put', value: rec });
        report[store]++;
        if (ops.length >= 200) await flush();
      }
    }
    await flush();

    for (const ph of photos) {
      // Drafts are one phone's unsaved work: only a full Replace brings them back.
      if (mode === 'merge' && ph.ownerType === 'draft') continue;
      const local = existingPhotos.get(ph.id);
      if (!zip.has(bn(ph.id)) || !photoNewer(ph, local)) continue;
      const own = async (sfx) => (zip.has(bn(ph.id, sfx)) ? (await zip.read(bn(ph.id, sfx))).slice().buffer : undefined);
      const full = await own('');
      const blob = { id: ph.id, data: full, thumb: (await own('_t')) || full };
      const orig = await own('_o');
      if (orig) {
        blob.orig = orig;
        blob.origThumb = (await own('_ot')) || orig;
      }
      await db.batch([
        { store: 'blobs', op: 'put', value: blob },
        { store: 'photos', op: 'put', value: ph },
      ]);
      if (local) forgetURL(ph.id);
      report.photos++;
    }

    if (mode === 'replace') {
      for (const [k, v] of Object.entries(data.drafts || {})) if (k.startsWith('draft:')) await db.setMeta(k, v);
    }

    if (mode === 'replace' || emptyPhone) {
      // A new or wiped phone takes the backup's settings, checklists and numbering.
      if (data.settings) await db.setMeta('settings', data.settings);
      if (data.templates) await db.setMeta('templates', data.templates);
      if (mode === 'replace') await db.setMeta('counters', data.counters || {});
      else for (const [k, v] of Object.entries(data.counters || {})) await db.bumpSeq(k, v);
      report.settings = 'restored';
    } else {
      // Keep this phone's settings; add checkpoints the backup has and this phone lacks.
      const t = data.templates || {};
      const mine = JSON.parse(JSON.stringify(S.templates));
      for (const [type, list] of Object.entries(t.custom || {})) {
        const have = new Set((mine.custom[type] || []).map((c) => c.id));
        mine.custom[type] = [...(mine.custom[type] || []), ...list.filter((c) => !have.has(c.id))];
      }
      for (const [type, list] of Object.entries(t.hidden || {})) mine.hidden[type] = [...new Set([...(mine.hidden[type] || []), ...list])];
      await db.setMeta('templates', mine);
      for (const [k, v] of Object.entries(data.counters || {})) await db.bumpSeq(k, v);
    }
    // Never hand out a number that already exists.
    const all = { item: await db.all('items'), punch: await db.all('punches'), question: await db.all('questions') };
    for (const [k, list] of Object.entries(all)) await db.bumpSeq(k, Math.max(0, ...list.map((r) => noNum(r.no))));
    if (mode === 'replace') await db.del('meta', 'restoreIncomplete');
  } catch (e) {
    await load().catch(() => {});
    if (wiped) {
      const err = new Error(`Restore stopped part-way (${e.message || e}). This phone now holds only part of the backup. Run Restore → Replace again with the same file.`);
      err.partial = true;
      throw err;
    }
    throw e;
  }
  await load();
  return report;
}

// ---------- share / save ----------------------------------------------------

export function canShareFile(file) {
  try {
    return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
  } catch {
    return false;
  }
}

// Call directly from a tap (Safari needs the user gesture for share()).
export async function shareFile(file) {
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
