/** `npm run smoke:copilot` must skip cleanly (exit 0) without a key. Run from an empty dir so no .env is read. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('smoke:copilot without a key', () => {
  it('prints a skip message and exits 0 without calling the API', () => {
    const script = fileURLToPath(new URL('./smoke-copilot.ts', import.meta.url));
    const cwd = mkdtempSync(join(tmpdir(), 'looplab-smoke-'));
    try {
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.ANTHROPIC_AUTH_TOKEN;
      const r = spawnSync(process.execPath, [script], { cwd, env, encoding: 'utf8', timeout: 60_000 });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('smoke:copilot skipped');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
