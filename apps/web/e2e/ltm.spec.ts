import { expect, test } from '@playwright/test';
import { gotoStage, trackConsole } from './helpers.ts';

test('open epc-rework → simulate → loop dominance chart and the table that keys it', async ({ page }) => {
  const problems = trackConsole(page);
  await page.goto('/');
  await page.getByTestId('examples-menu').click();
  await page.getByTestId('example-epc-rework').click();
  await expect(page.getByTestId('model-name')).toContainText('EPC engineering rework cycle');
  await gotoStage(page, 'test');
  await expect(page.getByTestId('chart-ltm')).toHaveCount(0); // nothing to show before the first run
  await page.getByTestId('btn-simulate').click();
  const chart = page.getByTestId('chart-ltm');
  await expect(chart).toBeVisible();
  await expect(chart.locator('canvas').first()).toBeVisible(); // uPlot has drawn
  await expect(page.getByTestId('ltm-table').first()).toBeVisible(); // handles in the legend (R1, B2, …) → loop paths
  await expect(page.getByTestId('ltm-table').first()).toContainText('→');
  expect(problems).toEqual([]);
});
