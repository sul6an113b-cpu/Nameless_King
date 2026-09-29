import { expect, test } from '@playwright/test';

const STAGES = ['frame', 'map', 'analyze', 'quantify', 'test', 'decide'];

test('app shell loads every stage at 1280×800 with zero console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  for (const id of STAGES) {
    await page.getByTestId(`stage-${id}`).click();
    await expect(page.getByTestId(`stage-${id}`)).toHaveAttribute('aria-current', 'step');
  }
  const health = await page.request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(errors).toEqual([]);
});
