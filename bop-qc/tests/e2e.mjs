// End-to-end test in Chromium with iPhone emulation.
//   cd bop-qc && npx http-server -p 8765 -c-1 &   (any static server)
//   node tests/e2e.mjs [http://localhost:8765/]
// Uses the `playwright` package (set PW=/path/to/playwright/index.mjs if it is installed globally).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const { chromium, devices } = await import(process.env.PW || 'playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'bopqc-'));

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.log(`  ✗ ${msg}`);
  }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', async (d) => {
  if (d.type() === 'prompt') await d.accept('DELETE');
  else await d.accept();
});

const tap = (sel) => page.locator(sel).first().click();
const wait = (ms = 250) => page.waitForTimeout(ms);

// A big "camera" photo made in the browser (tests downscaling).
async function makePhoto(name, w = 4032, h = 3024, color = '#3a7') {
  const b64 = await page.evaluate(
    async ({ w, h, color }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.fillStyle = color;
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#fff';
      x.font = `${Math.round(h / 8)}px sans-serif`;
      x.fillText('TEST', w / 4, h / 2);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { w, h, color },
  );
  const f = path.join(OUT, name);
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
}

async function choosePhoto(triggerSel, file) {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap(triggerSel)]);
  await fc.setFiles(file);
  await page.waitForSelector('.backdrop .msg', { state: 'detached', timeout: 10000 }).catch(() => {});
  await wait(400);
}

async function download(triggerSel) {
  const [dl] = await Promise.all([page.waitForEvent('download'), tap(triggerSel)]);
  const f = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(f);
  return f;
}

const count = (store) =>
  page.evaluate(
    (store) =>
      new Promise((res) => {
        const r = indexedDB.open('bopqc');
        r.onsuccess = () => {
          const q = r.result.transaction(store).objectStore(store).count();
          q.onsuccess = () => {
            res(q.result);
            r.result.close();
          };
        };
      }),
    store,
  );

console.log('Boot');
await page.goto(BASE);
await page.waitForSelector('[data-a="new-item"]');
ok(true, 'app boots');

console.log('New item + checklist');
await tap('[data-a="new-item"]');
ok(await page.locator('[data-s="start"]').isDisabled(), 'Start disabled until a type is chosen');
await tap('.types button');
await page.fill('input[name=tag]', 'TL-001');
await page.fill('input[name=area]', 'Water treatment');
await page.fill('input[name=subcontractor]', 'SubCon X');
await tap('[data-s="start"]');
await page.waitForSelector('.chk');
const nChecks = await page.locator('.chk').count();
ok(nChecks > 0, `checklist rendered (${nChecks} checkpoints)`);

await page.locator('.chk').nth(0).locator('[data-v="ok"]').click();
await wait();
ok((await page.locator('.chk').nth(0).getAttribute('class')).includes('s-ok'), 'checkpoint marked OK');

// Defect -> cancel reverts the state
await page.locator('.chk').nth(1).locator('[data-v="defect"]').click();
await page.waitForSelector('.backdrop');
await tap('.backdrop [data-s="cancel"]');
await wait();
ok(!(await page.locator('.chk').nth(1).getAttribute('class')).includes('s-defect'), 'cancelled defect reverts the checkpoint');

// Defect -> comment with category + photo
await page.locator('.chk').nth(1).locator('[data-v="defect"]').click();
await page.waitForSelector('.backdrop');
await tap('.backdrop [data-s="save"]');
ok(await page.locator('.backdrop').count(), 'save without text is refused');
await tap('.backdrop .chips.picks .chip');
await tap('.backdrop [data-s="save"]');
ok(await page.locator('.backdrop').count(), 'save without category is refused');
await tap('.backdrop .cats button[data-v="B"]');
const ph1 = await makePhoto('p1.jpg');
await choosePhoto('.backdrop [data-s="photo"]', ph1);
ok((await page.locator('#pend img').count()) === 1, 'pending photo shown in comment sheet');
await tap('.backdrop [data-s="save"]');
await wait(500);
ok((await page.locator('.chk').nth(1).getAttribute('class')).includes('s-defect'), 'checkpoint marked defect');
ok((await page.locator('.chk').nth(1).locator('.chk-links a').count()) === 1, 'comment linked under the checkpoint');
ok((await count('punches')) === 1, 'punch item stored');
ok((await count('photos')) === 1, 'comment photo stored');

// Unknown -> question
await page.locator('.chk').nth(2).locator('[data-v="unknown"]').click();
await page.waitForSelector('.backdrop textarea[name=text]');
const qtext = await page.inputValue('.backdrop textarea[name=text]');
ok(qtext.length > 0, `question prefilled: "${qtext.slice(0, 60)}"`);
await tap('.backdrop [data-s="save"]');
await wait();
ok((await count('questions')) === 1, 'question stored');

// Item photo (large) is downscaled
const ph2 = await makePhoto('p2.jpg', 4032, 3024, '#357');
await choosePhoto('[data-a="photo-add"]', ph2);
const dims = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('bopqc');
      r.onsuccess = () => {
        const q = r.result.transaction('photos').objectStore('photos').getAll();
        q.onsuccess = () => res(q.result.map((p) => [p.w, p.h, p.size]));
      };
    }),
);
ok(dims.every(([w, h]) => Math.max(w, h) <= 1600), `photos downscaled to <=1600 px: ${JSON.stringify(dims)}`);
await page.waitForSelector('.thumbs img[src]');
ok(true, 'thumbnail displayed');

// Photo viewer + markup
await tap('[data-a="photo-view"]');
await page.waitForSelector('.viewer img[src]');
await tap('.viewer [data-v="mark"]');
await page.waitForSelector('.markup canvas');
const box = await page.locator('.markup canvas').boundingBox();
await page.mouse.move(box.x + 20, box.y + 20);
await page.mouse.down();
await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 });
await page.mouse.up();
await tap('.markup [data-m="save"]');
await page.waitForSelector('.markup', { state: 'detached' });
const marked = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('bopqc');
      r.onsuccess = () => {
        const q = r.result.transaction('photos').objectStore('photos').getAll();
        q.onsuccess = () => res(q.result.some((p) => p.marked && p.rev === 1));
      };
    }),
);
ok(marked, 'mark-up saved as new photo revision');
await tap('.viewer [data-v="close"]');

console.log('Result validation');
await tap('[data-a="item-result"]');
await tap('.backdrop [data-v="ok"]');
ok((await page.locator('.backdrop .warnbox.bad').count()) >= 1, 'OK with an open comment warns');
await tap('.backdrop [data-v="rej"]');
await tap('.backdrop [data-s="save"]');
ok(await page.locator('.backdrop').count(), 'Rejected without a reason is refused');
await tap('.backdrop [data-v="okc"]');
await tap('.backdrop [data-s="save"]');
await wait();
ok((await page.locator('.item-head .badge.r-okc').count()) === 1, 'result OK with comments saved');

console.log('Punch lifecycle');
await page.goto(BASE + '#/punch');
await page.waitForSelector('#list .card');
await tap('#list .card');
await page.waitForSelector('[data-a="p-ready"]');
await tap('#view [data-a="p-ready"]');
await wait();
ok((await page.locator('.badge.st-ready').count()) >= 1, 'punch marked ready for QC');
await tap('#bar [data-a="p-verify"]');
await page.waitForSelector('.backdrop [data-s="vc"]');
ok(await page.locator('.backdrop [data-s="closed"]').isDisabled(), 'Verified closed disabled until checks answered');
const groups = await page.locator('.backdrop #vrows .chk').count();
for (let i = 0; i < groups; i++) await page.locator('.backdrop #vrows .chk').nth(i).locator('[data-v="ok"]').click();
const ph3 = await makePhoto('p3.jpg', 1200, 900, '#963');
await choosePhoto('.backdrop [data-s="photo"]', ph3);
ok(!(await page.locator('.backdrop [data-s="closed"]').isDisabled()), 'Verified closed enabled when all checks pass');
await tap('.backdrop [data-s="closed"]');
await wait();
ok((await page.locator('.badge.st-closed').count()) >= 1, 'punch verified closed');
await tap('#view [data-a="p-reopen"]');
await page.fill('.backdrop textarea[name=note]', 'Bolt still short');
await tap('.backdrop [data-s="ok"]');
await wait();
ok((await page.locator('.badge.st-open').count()) >= 1, 'punch re-opened');

console.log('Persistence');
await page.reload();
await page.waitForSelector('#view');
ok((await count('items')) === 1 && (await count('punches')) === 1, 'data survives reload');

console.log('Exports');
await page.goto(BASE + '#/export');
await page.waitForSelector('[data-a="exp"]');
await tap('[data-a="exp"][data-k="punch"]');
await page.waitForSelector('.backdrop [data-s="save"]');
const csv = fs.readFileSync(await download('.backdrop [data-s="save"]'), 'utf8');
await tap('.backdrop [data-s="save"]').catch(() => {});
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.remove()));
ok(csv.charCodeAt(0) === 0xfeff, 'CSV has UTF-8 BOM for Excel');
const lines = csv.trim().split('\r\n');
ok(lines.length === 2 && lines[1].includes('P-0001') && lines[1].includes('TL-001'), 'punch CSV has the item');

await tap('[data-a="exp"][data-k="report"]');
await page.waitForSelector('.backdrop [data-s="save"]');
const html = fs.readFileSync(await download('.backdrop [data-s="save"]'), 'utf8');
await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.remove()));
ok(html.includes('TL-001') && html.includes('OK with comments') && html.includes('data:image/jpeg;base64'), 'report contains item, result and embedded photos');
ok(html.includes('edition unknown'), 'report states code editions are unknown');

await tap('[data-a="exp"][data-k="package"]');
await page.waitForSelector('.backdrop [data-s="save"]');
const zipPath = await download('.backdrop [data-s="save"]');
await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.remove()));
const zipList = execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("\\n".join(z.namelist()))', zipPath]).toString();
ok(zipList.includes('report.html') && zipList.includes('punch_list.csv') && /photos\/.+\.jpg/.test(zipList), `package ZIP valid (${zipList.trim().split('\n').length} files)`);

await tap('[data-a="exp"][data-k="backup"]');
await page.waitForSelector('.backdrop [data-s="save"]');
const backup = await download('.backdrop [data-s="save"]');
await page.evaluate(() => document.querySelectorAll('.backdrop').forEach((b) => b.remove()));
execFileSync('python3', ['-c', 'import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None', backup]);
ok(true, 'backup ZIP valid');

console.log('Wipe + restore');
await page.goto(BASE + '#/more');
await tap('[data-a="wipe"]');
await tap('.backdrop [data-s="go"]');
ok((await page.locator('.backdrop').count()) === 1, 'delete-all refused without typing DELETE');
await page.fill('.backdrop input[name=confirm]', 'DELETE');
await tap('.backdrop [data-s="go"]');
await wait(600);
ok((await count('items')) === 0 && (await count('photos')) === 0, 'all data wiped');
await page.goto(BASE + '#/export');
await page.waitForSelector('[data-a="restore"]');
const [fc] = await Promise.all([page.waitForEvent('filechooser'), tap('[data-a="restore"]')]);
await fc.setFiles(backup);
await page.waitForSelector('.backdrop [data-s="go"]');
await tap('.backdrop [data-s="go"]');
await page.waitForSelector('.backdrop .sheet[aria-label="Restore done"]', { timeout: 10000 });
ok(true, 'restore summary shown');
await tap('.backdrop [data-s="ok"]');
ok((await count('items')) === 1 && (await count('punches')) === 1 && (await count('questions')) === 1 && (await count('photos')) === 3 && (await count('blobs')) === 3, 'restore brings back items, punch, question and 3 photos');
await page.goto(BASE + '#/items');
await page.waitForSelector('#list .card');
ok((await page.locator('#list .card').count()) === 1, 'restored item listed');

console.log('Offline');
await page.goto(BASE);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => !!navigator.serviceWorker.controller);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#list .card', { timeout: 5000 }).catch(() => {});
ok((await page.locator('#list .card').count()) === 1, 'app loads and shows data with no network');
await page.goto(BASE + '#/punch');
await page.waitForSelector('#list .card', { timeout: 5000 }).catch(() => {});
ok((await page.locator('#list .card').count()) === 1, 'navigation works offline');
await ctx.setOffline(false);

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
