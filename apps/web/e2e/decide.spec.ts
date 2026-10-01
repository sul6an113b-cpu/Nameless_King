import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, gotoStage, trackConsole } from './helpers.ts';

test('open epc-rework → simulate → Decide → export: the report holds a recommendation, loops, a leverage ranking and a chart', async ({ page }) => {
  const problems = trackConsole(page);
  await page.goto('/');
  await page.getByTestId('examples-menu').click();
  await page.getByTestId('example-epc-rework').click();
  await expect(page.getByTestId('model-name')).toContainText('EPC engineering rework cycle');

  await gotoStage(page, 'test');
  await page.getByTestId('btn-simulate').click();
  await expect(page.getByTestId('chart-timeseries')).toBeVisible();

  await gotoStage(page, 'decide');
  const recommendation = 'Hold design reviews at week 4 and report progress on verified work only.';
  await page.getByTestId('decision-recommendation').fill(recommendation);
  await page.getByTestId('decision-recommendation').blur();

  // an intervention with a Meadows level and a scenario behind it, and the scenarios side by side
  await page.getByTestId('intervention-scenario-i_honest_progress').selectOption('s_realistic_deadline');
  await expect(page.getByTestId('intervention-status-i_honest_progress')).toHaveValue('tested');
  await expect(page.getByTestId('intervention-level-i_early_reviews')).toHaveValue('9');
  const table = page.getByTestId('kpi-comparison');
  await expect(table).toBeVisible();
  await expect(table).toContainText('Baseline');
  await expect(table).toContainText('Earlier design reviews');

  // preview: the report's own HTML, in pyramid order. Read from the parent (same origin): a locator would inject scripts into
  // the sandboxed frame, which the sandbox rightly blocks and the browser logs.
  const previewDoc = () =>
    page.evaluate(() => {
      const d = document.querySelector<HTMLIFrameElement>('[data-testid="report-preview"]')?.contentDocument;
      return {
        h2: [...(d?.querySelectorAll('h2') ?? [])].map((h) => h.textContent),
        svgs: d?.querySelectorAll('figure svg').length ?? 0,
        text: d?.body?.textContent ?? '',
      };
    });
  await expect
    .poll(async () => (await previewDoc()).h2)
    .toEqual(['Recommendation', 'Key loops', 'Leverage ranking', 'Evidence', 'Simulation results', 'Appendix']);
  const doc = await previewDoc();
  expect(doc.text).toContain(recommendation);
  expect(doc.svgs).toBeGreaterThanOrEqual(1);

  // Markdown download
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export-report').click()]);
  expect(download.suggestedFilename()).toMatch(/decision-brief\.md$/);
  const md = await readFile((await download.path()) ?? '', 'utf8');
  expect(md).toContain('## Recommendation');
  expect(md).toContain(recommendation);
  expect(md).toContain('## Key loops');
  expect(md).toMatch(/\| R\d+ \| Reinforcing \|/);
  expect(md).toMatch(/\| B\d+ \| Balancing \|/);
  expect(md).toContain('## Leverage ranking');
  expect(md).toMatch(/\| 1 \| .+ \| [\d.e+-]+ \| \d+(\.\d+)?% \|/);
  expect(md).toMatch(/!\[[^\]]*\]\(data:image\/svg\+xml/);
  expect(md.indexOf('## Recommendation')).toBeLessThan(md.indexOf('## Key loops'));
  expect(md.indexOf('## Key loops')).toBeLessThan(md.indexOf('## Leverage ranking'));

  // CSV of one run
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btn-export-results').click()]);
  expect(csv.suggestedFilename()).toMatch(/baseline\.csv$/);
  expect((await readFile((await csv.path()) ?? '', 'utf8')).split('\n')[0]).toMatch(/^time,/);

  await expectNoHorizontalOverflow(page);
  expect(problems).toEqual([]);
});

test('Print / save as PDF prints the report frame, not the app', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('examples-menu').click();
  await page.getByTestId('example-epc-rework').click();
  await gotoStage(page, 'decide');
  await expect(page.getByTestId('report-preview')).toBeVisible();
  await page.evaluate(() => {
    const w = document.querySelector<HTMLIFrameElement>('[data-testid="report-preview"]')?.contentWindow;
    if (!w) throw new Error('no report frame');
    let count = 0;
    w.print = () => {
      count += 1;
    };
    Object.assign(window, { printCount: () => count });
  });
  await page.getByTestId('btn-print-report').click();
  const printed = await page.evaluate(() => (window as unknown as { printCount: () => number }).printCount());
  expect(printed).toBe(1);
});
