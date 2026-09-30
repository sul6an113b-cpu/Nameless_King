import { expect, test } from '@playwright/test';
import { gotoStage, trackConsole } from './helpers.ts';

test('open epc-rework → simulate → tornado + Pareto', async ({ page }) => {
  const problems = trackConsole(page);
  await page.goto('/');
  await page.getByTestId('examples-menu').click();
  await page.getByTestId('example-epc-rework').click();
  await expect(page.getByTestId('model-name')).toContainText('EPC engineering rework cycle');
  await gotoStage(page, 'test');
  await page.getByTestId('btn-simulate').click();
  await expect(page.getByTestId('chart-tornado')).toBeVisible();
  await expect(page.getByTestId('chart-pareto')).toBeVisible();
  expect(problems).toEqual([]);
});
