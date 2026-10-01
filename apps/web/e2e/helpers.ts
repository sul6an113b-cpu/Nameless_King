/** Shared helpers for canvas-ui's own Playwright checks (qa's independent suite lives in the root e2e/). */
import { expect, type Page } from '@playwright/test';

export const STAGES = ['frame', 'map', 'analyze', 'quantify', 'test', 'decide'] as const;

/**
 * Playwright's own injected scripts are refused by a script-less sandboxed frame, and Chromium logs that once per frame load
 * (reproduced on a bare `<iframe sandbox srcdoc>` with no app code). The Decide stage's report preview is such a frame, on
 * purpose: the app runs no script there. This one message is therefore not a problem of the app; everything else still is.
 */
export const SANDBOX_NOISE = /Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed/;

/** Collects console errors, page errors, and React Flow warnings (which signal broken edges/nodes). */
export function trackConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if (SANDBOX_NOISE.test(msg.text())) return;
    if (msg.type() === 'error' || (msg.type() === 'warning' && msg.text().includes('[React Flow]')))
      problems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  return problems;
}

export async function gotoStage(page: Page, stage: (typeof STAGES)[number]): Promise<void> {
  await page.getByTestId(`stage-${stage}`).click();
  await expect(page.getByTestId(`stage-${stage}`)).toHaveAttribute('aria-current', 'step');
}

/** Adds a variable with the toolbar button (Map) and names it inline; returns its React Flow id. */
export async function addVariable(page: Page, name: string, button = 'btn-add-variable'): Promise<string> {
  const before = await nodeIds(page);
  await page.getByTestId(button).click();
  const input = page.getByRole('textbox', { name: 'Variable name' });
  await input.fill(name);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  const after = await nodeIds(page);
  const id = after.find((x) => !before.includes(x));
  expect(id, `new node for ${name}`).toBeTruthy();
  return id ?? '';
}

export async function nodeIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="node-"]')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^node-/, '')));
}

export async function edgeIds(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="edge-"]')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^edge-/, '')));
}

/** Link mode (L): click the cause, then the effect. */
export async function linkByClicks(page: Page, from: string, to: string): Promise<void> {
  await page.keyboard.press('l');
  await page.getByTestId(`node-${from}`).click();
  await page.getByTestId(`node-${to}`).click();
  await page.keyboard.press('Escape');
}

/** Selects a link by clicking its polarity sign (the natural click target on a curve). */
export async function selectEdge(page: Page, linkId: string): Promise<void> {
  await page.getByTestId(`edge-${linkId}`).locator('.edge-label-hit').click();
}

/** Page never scrolls sideways at 1280×800. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
