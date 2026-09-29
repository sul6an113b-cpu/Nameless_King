import { defineConfig } from '@playwright/test';

/**
 * E2E: headless Chromium at 1280×800 against `npm run dev` (Vite 127.0.0.1:5173 + server 127.0.0.1:8787).
 * Projects: `app` = canvas-ui's own checks (apps/web/e2e), `qa` = independent verification (e2e/).
 */
export default defineConfig({
  reporter: [['list']],
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1280, height: 800 },
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'app', testDir: './apps/web/e2e' },
    { name: 'qa', testDir: './e2e' },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
