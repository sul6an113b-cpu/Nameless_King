// Regression tests for the review findings (data safety, logic, iOS layout, exports).
//   node tests/regression.mjs [http://localhost:8765/]
// Same setup as e2e.mjs (Playwright Chromium, iPhone 13 emulation; PW=/path/to/playwright/index.mjs).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { chromium, devices } = await import(process.env.PW || 'playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'bopqc-reg-'));
let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✗ ${msg}`);
  }
};

const browser = await chromium.launch();
async function fresh() {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(BASE);
  await page.waitForSelector('[data-a="new-item"]');
  return { ctx, page };
}
const wait = (page, ms = 250) => page.waitForTimeout(ms);
const tap = (page, sel) => page.locator(sel).first().click();
const py = (code, ...args) => execFileSync('python3', ['-c', code, ...args]).toString();

async function photoFile(page, name, color = '#468') {
  const b64 = await page.evaluate(async (color) => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 600;
    const x = c.getContext('2d');
    x.fillStyle = color;
    x.fillRect(0, 0, 800, 600);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
    return btoa(s);
  }, color);
  const f = path.join(OUT, name);
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
}
async function choose(page, sel, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap(page, sel)]);
  await fc.setFiles(file);
  await page.waitForSelector('.backdrop.busy', { state: 'detached', timeout: 10000 }).catch(() => {});
  await wait(page, 400);
}
async function download(page, sel) {
  const [dl] = await Promise.all([page.waitForEvent('download'), tap(page, sel)]);
  const f = path.join(OUT, `${Date.now()}_${dl.suggestedFilename()}`);
  await dl.saveAs(f);
  return f;
}
const idb = (page, store) =>
  page.evaluate(
    (store) =>
      new Promise((res) => {
        const r = indexedDB.open('bopqc');
        r.onsuccess = () => {
          const q = r.result.transaction(store).objectStore(store).getAll();
          q.onsuccess = () => {
            res(q.result.map(({ data, thumb, orig, origThumb, ...m }) => ({ ...m, hasOrig: !!orig })));
            r.result.close();
          };
        };
      }),
    store,
  );

async function newItem(page, { tag = 'TL-1', area = 'WTP', sub = 'ABC Piping', type = 0 } = {}) {
  await page.goto(BASE + '#/items');
  await tap(page, '[data-a="new-item"]');
  await page.locator('.types button').nth(type).click();
  await page.fill('.backdrop input[name=tag]', tag);
  await page.fill('.backdrop input[name=area]', area);
  await page.fill('.backdrop input[name=subcontractor]', sub);
  await tap(page, '.backdrop [data-s="start"]');
  await page.waitForSelector('.chk');
  await wait(page, 300);
}
async function defect(page, idx, { text = 'Bolts rusted', cat = 'B', sub = null } = {}) {
  await page.locator('.chk').nth(idx).locator('[data-v="defect"]').click();
  await page.waitForSelector('.backdrop textarea[name=text]');
  await page.fill('.backdrop textarea[name=text]', text);
  if (sub !== null) await page.fill('.backdrop input[name=subcontractor]', sub);
  await tap(page, `.backdrop .cats button[data-v="${cat}"]`);
  await tap(page, '.backdrop [data-s="save"]');
  await page.waitForSelector('.backdrop', { state: 'detached' });
  await wait(page, 300);
}
const exportFile = async (page, k) => {
  await page.goto(BASE + '#/export');
  await page.waitForSelector(`[data-a="exp"][data-k="${k}"]`);
  await tap(page, `[data-a="exp"][data-k="${k}"]`);
  await page.waitForSelector('.backdrop [data-s="save"]');
  const f = await download(page, '.backdrop [data-s="save"]');
  // backup asks whether it saved
  if (await page.locator('.backdrop [aria-label="Backup saved?"]').count()) await tap(page, '.backdrop [aria-label="Backup saved?"] [data-s="yes"]');
  await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.remove()));
  return f;
};
const readCSV = (f) => JSON.parse(py('import csv,json,sys;print(json.dumps(list(csv.DictReader(open(sys.argv[1],encoding="utf-8-sig")))))', f));

// ---------------------------------------------------------------------------
console.log('L1 – editing item details keeps a per-comment subcontractor');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  await defect(page, 0, { sub: 'XYZ Insulation' });
  await tap(page, '[data-a="item-edit"]');
  await tap(page, '.backdrop details summary');
  await page.fill('.backdrop input[name=location]', 'Rack 3');
  await tap(page, '.backdrop [data-s="save"]');
  await wait(page, 400);
  let p = (await idb(page, 'punches'))[0];
  ok(p.subcontractor === 'XYZ Insulation', `punch keeps its own subcontractor (${p.subcontractor})`);
  await tap(page, '[data-a="item-edit"]');
  await page.fill('.backdrop input[name=area]', 'Water Treatment');
  await tap(page, '.backdrop [data-s="save"]');
  await wait(page, 400);
  p = (await idb(page, 'punches'))[0];
  ok(p.area === 'Water Treatment', 'area correction follows to the punch');
  await defect(page, 1, { text: 'Drain missing', cat: 'C' });
  await tap(page, '[data-a="item-edit"]');
  await page.fill('.backdrop input[name=subcontractor]', 'New Sub');
  await tap(page, '.backdrop [data-s="save"]');
  await wait(page, 400);
  const ps = await idb(page, 'punches');
  ok(ps.find((x) => x.text === 'Drain missing').subcontractor === 'New Sub' && ps.find((x) => x.text === 'Bolts rusted').subcontractor === 'XYZ Insulation', 'only inherited subcontractors follow an item change');
  await ctx.close();
}

console.log('Race – quick taps on several checkpoints are all saved');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  // Six OK taps in the same instant: each write must build on the one before.
  await page.evaluate(() => [...document.querySelectorAll('.chk')].slice(0, 6).forEach((c) => c.querySelector('[data-v="ok"]').click()));
  await wait(page, 800);
  const it = (await idb(page, 'items'))[0];
  const n = it.checks.slice(0, 6).filter((c) => c.state === 'ok').length;
  ok(n === 6, `all 6 quick taps stored (${n}/6)`);
  await ctx.close();
}

console.log('L3 – Defect → Cancel restores the earlier state');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  await defect(page, 0);
  await page.locator('.chk').nth(0).locator('[data-v="ok"]').click();
  await tap(page, '.backdrop [data-s="yes"]');
  await wait(page);
  await page.locator('.chk').nth(0).locator('[data-v="defect"]').click();
  await page.waitForSelector('.backdrop textarea');
  await tap(page, '.backdrop [data-s="cancel"]');
  await wait(page, 400);
  const it = (await idb(page, 'items'))[0];
  ok(it.checks[0].state === 'ok', `state back to OK (${it.checks[0].state})`);
  await ctx.close();
}

console.log('L2 – removing a checkpoint keeps its comments visible');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  await tap(page, '[data-a="chk-add"]');
  await page.fill('.backdrop input[name=text]', 'Drain valve plugged');
  await tap(page, '.backdrop [data-s="save"]');
  await wait(page, 400);
  const n = await page.locator('.chk').count();
  await defect(page, n - 1, { text: 'Plug missing', cat: 'A' });
  await page.locator('.chk').nth(n - 1).locator('[data-a="chk-info"]').click();
  await tap(page, '.backdrop [data-s="remove"]');
  await wait(page, 300);
  await tap(page, '.backdrop [data-s="yes"]');
  await wait(page, 400);
  ok((await page.locator('#view').innerText()).includes('Plug missing'), 'comment still shown on the item');
  ok((await idb(page, 'punches'))[0].checkId === null, 'comment unlinked in storage');
  await ctx.close();
}

console.log('L4 / DS-2 – a failed save is reported and can be retried');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  await page.evaluate(() => {
    const orig = IDBObjectStore.prototype.put;
    window.__failPunch = true;
    IDBObjectStore.prototype.put = function (v, k) {
      if (window.__failPunch && this.name === 'punches') throw new DOMException('disk full', 'QuotaExceededError');
      return orig.call(this, v, k);
    };
  });
  await page.locator('.chk').nth(0).locator('[data-v="defect"]').click();
  await page.fill('.backdrop textarea[name=text]', 'Gasket wrong');
  await tap(page, '.backdrop .cats button[data-v="C"]');
  await tap(page, '.backdrop [data-s="save"]');
  await wait(page, 500);
  ok((await page.locator('.backdrop .sheet[aria-label="Phone storage full"]').count()) === 1, 'error notice shown');
  await tap(page, '.backdrop .sheet[aria-label="Phone storage full"] [data-s="ok"]');
  await wait(page, 300);
  ok(!(await page.locator('.backdrop [data-s="save"]').isDisabled()), 'Save is enabled again');
  ok((await idb(page, 'punches')).length === 0 && (await idb(page, 'items'))[0].checks[0].state === 'defect', 'nothing half-saved');
  await page.evaluate(() => (window.__failPunch = false));
  await tap(page, '.backdrop [data-s="save"]');
  await wait(page, 500);
  ok((await idb(page, 'punches')).length === 1, 'retry saves the comment');
  await ctx.close();
}

console.log('DS-4 – unsaved comment + photo survive a stray tap, Back and an app restart');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  await page.locator('.chk').nth(2).locator('[data-v="defect"]').click();
  await page.fill('.backdrop textarea[name=text]', 'Support shoe off beam');
  await tap(page, '.backdrop .cats button[data-v="B"]');
  await choose(page, '.backdrop [data-s="photo"]', await photoFile(page, 'd1.jpg'));
  await page.mouse.click(195, 20); // tap above the sheet
  await wait(page);
  ok((await page.locator('.backdrop textarea[name=text]').count()) === 1, 'tap outside keeps the sheet');
  await page.goBack();
  await wait(page, 400);
  ok((await page.locator('.backdrop textarea[name=text]').count()) === 1, 'Back keeps a sheet with unsaved input');
  await wait(page, 600);
  await page.reload();
  await page.waitForSelector('[data-a="draft-resume"]');
  ok(true, 'item shows the unsaved comment after a restart');
  await tap(page, '[data-a="draft-resume"]');
  await page.waitForSelector('.backdrop textarea[name=text]');
  ok((await page.inputValue('.backdrop textarea[name=text]')) === 'Support shoe off beam', 'text restored');
  ok((await page.locator('#pend img').count()) === 1, 'photo restored');
  await tap(page, '.backdrop [data-s="save"]');
  await wait(page, 500);
  const ph = await idb(page, 'photos');
  const p = (await idb(page, 'punches'))[0];
  ok(p && ph.length === 1 && ph[0].ownerId === p.id && ph[0].ownerType === 'punch', 'draft photo moved onto the saved punch');
  ok((await page.locator('[data-a="draft-resume"]').count()) === 0, 'draft cleared');
  await ctx.close();
}

console.log('IOS-1 / L5 / DS-8 – photo viewer: confirm on top, Back closes it, mark-up keeps the original');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  const url = page.url();
  await choose(page, '[data-a="photo-add"]', await photoFile(page, 'v1.jpg'));
  await tap(page, '[data-a="photo-view"]');
  await page.waitForSelector('.viewer img[src]');
  await page.goBack();
  await wait(page, 400);
  ok((await page.locator('.viewer').count()) === 0 && page.url() === url, 'Back closes the viewer and stays on the item');
  await tap(page, '[data-a="photo-view"]');
  await page.waitForSelector('.viewer img[src]');
  await tap(page, '.viewer [data-v="mark"]');
  await page.waitForSelector('.markup canvas');
  const box = await page.locator('.markup canvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 90, { steps: 4 });
  await page.mouse.up();
  await tap(page, '.markup [data-m="save"]');
  await page.waitForSelector('.markup', { state: 'detached' });
  await wait(page, 400);
  ok((await idb(page, 'blobs'))[0].hasOrig, 'original kept after mark-up');
  ok((await page.locator('.viewer [data-v="orig"]').count()) === 1, '"Show original" offered');
  await tap(page, '.viewer [data-v="del"]');
  await page.waitForSelector('.backdrop [data-s="yes"]');
  await wait(page, 400); // let the slide-up animation finish
  const bb = await page.locator('.backdrop [data-s="yes"]').boundingBox();
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.dataset?.s, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
  ok(top === 'yes', 'delete confirmation is on top of the viewer');
  await tap(page, '.backdrop [data-s="yes"]');
  await wait(page, 400);
  ok((await idb(page, 'photos')).length === 0 && (await page.locator('.viewer').count()) === 0, 'photo deleted, viewer closed');
  await ctx.close();
}

console.log('IOS-4 / F2 / F3 / F5 / F9 – punch screen and closure');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  await defect(page, 0, { text: 'Bolt short', cat: 'A' });
  await page.locator('.chk-links a').first().click();
  await page.waitForSelector('#bar [data-a="p-verify"]');
  const vw = page.viewportSize().width;
  const rights = await page.$$eval('#bar .btn', (bs) => bs.map((b) => b.getBoundingClientRect().right));
  ok(Math.max(...rights) <= vw, `bottom bar fits the screen (${Math.round(Math.max(...rights))} ≤ ${vw})`);
  await page.fill('#view textarea[data-pf="text"]', 'Bolt short by 2 threads');
  await page.locator('#view textarea[data-pf="text"]').blur();
  await wait(page, 400);
  ok((await idb(page, 'punches'))[0].history.some((h) => h.action === 'edited' && h.note.includes('Bolt short by 2 threads')), 'description change logged in history');
  await tap(page, '#bar [data-a="p-verify"]');
  await page.waitForSelector('.backdrop #vrows');
  const required = await page.locator('.backdrop #vrows > .chk:has(.basis.code)').count();
  const naOnRequired = await page.locator('.backdrop #vrows > .chk:has(.basis.code) [data-v="na"]').count();
  ok(required >= 3 && naOnRequired === 0, `required closure checks have no N/A (${required} required)`);
  const rows = await page.locator('.backdrop #vrows > .chk').count();
  for (let i = 0; i < rows; i++) {
    const row = page.locator('.backdrop #vrows > .chk').nth(i);
    if (await row.locator('[data-v="na"]').count()) await row.locator('[data-v="na"]').click();
    else await row.locator('[data-v="ok"]').click();
  }
  ok(!(await page.locator('.backdrop [data-s="closed"]').isDisabled()), 'Verified enabled when required checks are Yes');
  await tap(page, '.backdrop [data-s="closed"]');
  await wait(page, 400);
  const p = (await idb(page, 'punches'))[0];
  ok(p.status === 'closed' && p.readyAt === null, 'verified directly: no invented "ready for QC" date');
  ok((await page.locator('#view textarea[data-pf="text"][readonly]').count()) === 1, 'closed punch description is locked');
  await ctx.close();
}

console.log('F4 / EXP-1 / EXP-3 / EXP-5 – exports');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '#/more');
  await page.waitForSelector('[data-cat="1"]');
  await page.fill('[data-cat="1"]', 'Probably before first fire');
  await page.locator('[data-cat="1"]').blur();
  await wait(page, 600);
  await newItem(page, { tag: 'L-1', sub: '' });
  await defect(page, 0, { text: 'Insulation torn', cat: 'B+', sub: 'Insul Co' });
  await choose(page, '[data-a="photo-add"]', await photoFile(page, 'e1.jpg'));
  await page.locator('.chk-links a').first().click();
  await page.waitForSelector('#view [data-a="p-ready"]');
  await choose(page, '[data-a="photo-add"][data-role="evidence"]', await photoFile(page, 'e2.jpg', '#a44'));
  // Old punch from "another day" (date filter excludes it, follow-up must include it)
  await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('bopqc');
        r.onsuccess = () => {
          const tx = r.result.transaction('items', 'readwrite');
          const s = tx.objectStore('items');
          const g = s.getAll();
          g.onsuccess = () => {
            for (const it of g.result) {
              it.createdAt = '2026-01-05T08:00:00.000Z';
              s.put(it);
            }
          };
          tx.oncomplete = res;
        };
      }),
  );
  await page.reload();
  await page.goto(BASE + '#/export');
  await page.waitForSelector('[data-ef="sub"]');
  await page.selectOption('[data-ef="sub"]', 'Insul Co');
  await wait(page, 300);
  const punchCsv = readCSV(await exportFile(page, 'punch'));
  ok(punchCsv.length === 1 && punchCsv[0]['Subcontractor'] === 'Insul Co', 'subcontractor filter finds the punch on an item with no subcontractor');
  ok(/NOT CONFIRMED/.test(punchCsv[0]['Category meaning']), `unconfirmed B+ meaning marked (${punchCsv[0]['Category meaning']})`);
  await page.selectOption('[data-ef="sub"]', '');
  await tap(page, '[data-a="exp-today"]');
  await wait(page, 300);
  const zip = await exportFile(page, 'package');
  const check = py(
    `import csv,io,sys,zipfile
z=zipfile.ZipFile(sys.argv[1]); names=set(z.namelist()); missing=[]
for f in ['punch_list.csv','follow_up_not_closed.csv','items.csv']:
  for row in csv.DictReader(io.TextIOWrapper(z.open(f),encoding='utf-8-sig')):
    for col in ('Photos','Closure photos'):
      for n in filter(None,[x.strip() for x in (row.get(col) or '').split(';')]):
        if 'photos/'+n not in names: missing.append(n)
print(len([n for n in names if n.startswith('photos/')]), 'missing' if missing else 'ok', missing)`,
    zip,
  );
  ok(check.includes(' ok'), `every photo named in the package CSVs is in the ZIP (${check.trim()})`);
  await ctx.close();
}

console.log('DS-1 / DS-5 / DS-6 / EXP-8 – restore');
{
  const { ctx, page } = await fresh();
  await page.goto(BASE + '#/more');
  await page.fill('[data-sf="prefixPunch"]', 'PX');
  await page.fill('[data-sf="projectLabel"]', 'Test project');
  await page.locator('[data-sf="projectLabel"]').blur();
  await wait(page, 600);
  await newItem(page, { tag: 'R-1' });
  await defect(page, 0, { text: 'One', cat: 'C' });
  await choose(page, '[data-a="photo-add"]', await photoFile(page, 'r1.jpg'));
  const backup = await exportFile(page, 'backup');

  // Broken backup (one photo file removed) must not touch the phone in Replace mode.
  const broken = path.join(OUT, 'broken.zip');
  py(
    `import sys,zipfile
src=zipfile.ZipFile(sys.argv[1]); dst=zipfile.ZipFile(sys.argv[2],'w')
for n in src.namelist():
  if n.startswith('blobs/') and n.endswith('.jpg') and '_' not in n.split('/')[-1]: continue
  dst.writestr(n, src.read(n))
dst.close()`,
    backup,
    broken,
  );
  const restoreFile = async (file, mode) => {
    await page.goto(BASE + '#/export');
    await page.waitForSelector('[data-a="restore"]');
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap(page, '[data-a="restore"]')]);
    await fc.setFiles(file);
    await page.waitForSelector('.backdrop [data-s="go"]');
    if (mode === 'replace') await tap(page, '.backdrop [data-v="replace"]');
    await tap(page, '.backdrop [data-s="go"]');
    if (mode === 'replace') {
      await page.waitForSelector('.backdrop [data-s="yes"]');
      await tap(page, '.backdrop [data-s="yes"]');
    }
    await page.waitForSelector('.backdrop .sheet[aria-label="Restore done"], .backdrop .sheet[aria-label="Something went wrong"], .backdrop .sheet[aria-label="Restore not finished"]', { timeout: 15000 });
    const title = await page.locator('.backdrop .sheet').last().getAttribute('aria-label');
    const text = await page.locator('.backdrop .sheet').last().innerText();
    await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.remove()));
    return { title, text };
  };
  let r = await restoreFile(broken, 'replace');
  ok(r.title === 'Something went wrong' && /Nothing was changed/.test(r.text), 'incomplete backup refused before anything is deleted');
  ok((await idb(page, 'items')).length === 1 && (await idb(page, 'photos')).length === 1, 'phone data untouched');

  // Wipe, then Merge into the empty phone: settings come back.
  await page.goto(BASE + '#/more');
  await tap(page, '[data-a="wipe"]');
  await page.fill('.backdrop input[name=confirm]', 'DELETE');
  await tap(page, '.backdrop [data-s="go"]');
  await wait(page, 600);
  // A record made before the restore takes number PX? no – prefix reset to default P.
  await newItem(page, { tag: 'LOCAL-1' });
  await defect(page, 0, { text: 'Local comment', cat: 'D' });
  r = await restoreFile(backup, 'merge');
  ok(r.title === 'Restore done', 'merge done');
  const items = await idb(page, 'items');
  const nos = items.map((i) => i.no).sort();
  ok(new Set(nos).size === nos.length, `item numbers unique after merge (${nos.join(', ')})`);
  ok(/given new numbers/.test(r.text), 'renumbering reported');

  // Re-zipped as a folder with DEFLATE (Files / Windows "Compress")
  const folder = path.join(OUT, 'folder.zip');
  py(
    `import sys,zipfile
src=zipfile.ZipFile(sys.argv[1]); dst=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)
for n in src.namelist(): dst.writestr('MyBackup/'+n, src.read(n))
dst.close()`,
    backup,
    folder,
  );
  // fresh phone: settings restored on merge into an empty phone
  const second = await fresh();
  const p2 = second.page;
  await p2.goto(BASE + '#/export');
  await p2.waitForSelector('[data-a="restore"]');
  const [fc2] = await Promise.all([p2.waitForEvent('filechooser'), tap(p2, '[data-a="restore"]')]);
  await fc2.setFiles(folder);
  await p2.waitForSelector('.backdrop [data-s="go"]');
  await tap(p2, '.backdrop [data-s="go"]');
  await p2.waitForSelector('.backdrop .sheet[aria-label="Restore done"]', { timeout: 15000 });
  const t2 = await p2.locator('.backdrop .sheet').last().innerText();
  ok(/Restored from the backup/.test(t2), 'merge into an empty phone restores settings');
  ok((await idb(p2, 'photos')).length === 1 && (await idb(p2, 'items')).length === 1, 're-zipped folder (DEFLATE) backup restores');
  const settings = await p2.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('bopqc');
        r.onsuccess = () => {
          const q = r.result.transaction('meta').objectStore('meta').get('settings');
          q.onsuccess = () => res(q.result && q.result.value);
        };
      }),
  );
  ok(settings && settings.prefixPunch === 'PX' && settings.projectLabel === 'Test project', `prefix and project label restored (${settings && settings.prefixPunch} / ${settings && settings.projectLabel})`);
  await second.ctx.close();
  await ctx.close();
}

console.log('DS-7 – backup counts only when confirmed');
{
  const { ctx, page } = await fresh();
  await newItem(page);
  await page.goto(BASE + '#/export');
  await tap(page, '[data-a="exp"][data-k="backup"]');
  await page.waitForSelector('.backdrop [data-s="save"]');
  await Promise.all([page.waitForEvent('download'), tap(page, '.backdrop [data-s="save"]')]);
  await page.waitForSelector('.backdrop [aria-label="Backup saved?"]');
  await tap(page, '.backdrop [aria-label="Backup saved?"] [data-s="no"]');
  await wait(page, 300);
  const last = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('bopqc');
        r.onsuccess = () => {
          const q = r.result.transaction('meta').objectStore('meta').get('lastBackupAt');
          q.onsuccess = () => res(q.result ? q.result.value : null);
        };
      }),
  );
  ok(last === null, 'answering No leaves the backup reminder active');
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
