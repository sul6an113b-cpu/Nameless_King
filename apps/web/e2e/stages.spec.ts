import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, gotoStage, STAGES, trackConsole } from './helpers.ts';

/** SPEC §8 test ids each stage must show (Phase 2 scope; Analyze/Decide tools arrive in Phase 3). */
const STAGE_IDS: Record<(typeof STAGES)[number], string[]> = {
  frame: ['frame-stage', 'kpi-card', 'refmodes-card', 'boundary-card'],
  map: ['canvas-cld', 'btn-add-variable'],
  analyze: [],
  quantify: ['canvas-sfd', 'health-panel'],
  test: ['btn-simulate'],
  decide: [],
};

for (const scheme of ['light', 'dark'] as const) {
  test(`every stage loads at 1280×800 in the ${scheme} theme with zero console errors`, async ({ page }) => {
    const problems = trackConsole(page);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(scheme === 'dark' ? 'rgb(17, 21, 27)' : 'rgb(244, 246, 248)');

    for (const stage of STAGES) {
      await gotoStage(page, stage);
      for (const id of STAGE_IDS[stage]) await expect(page.getByTestId(id), `${stage}: ${id}`).toBeVisible();
      for (const id of ['save-status', 'examples-menu']) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await page.getByTestId('tab-copilot').click();
    await expect(page.getByTestId('copilot-panel')).toBeVisible();
    expect(problems).toEqual([]);
  });
}

test('the theme toggle overrides the system preference both ways and is remembered', async ({ page }) => {
  const problems = trackConsole(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.getByTestId('theme-toggle').click(); // dark → light
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(244, 246, 248)');
  await gotoStage(page, 'map');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').click(); // light → dark
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(problems).toEqual([]);
});

test('the dock collapses to give the canvas the full width, and comes back', async ({ page }) => {
  await page.goto('/');
  await gotoStage(page, 'map');
  const wide = async () => (await page.getByTestId('canvas-cld').boundingBox())?.width ?? 0;
  const before = await wide();
  await page.getByTestId('dock-toggle').click();
  await expect(page.getByTestId('tab-inspector')).toHaveCount(0);
  expect(await wide()).toBeGreaterThan(before + 300);
  await page.getByTestId('dock-toggle').click();
  await expect(page.getByTestId('tab-inspector')).toBeVisible();
});
