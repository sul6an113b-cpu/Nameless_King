/** Orchestrator-owned repository checks (qa re-checks these independently in tests/security). */
import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

describe('repository scaffold', () => {
  it('.env is git-ignored and .env.example exists without a real key', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', '.env'])).not.toThrow();
    expect(existsSync('.env.example')).toBe(true);
    const example = readFileSync('.env.example', 'utf8');
    expect(example).toMatch(/^ANTHROPIC_API_KEY=\s*$/m);
    expect(example).not.toMatch(/sk-ant-/);
  });

  it('every workspace pins exact dependency versions', () => {
    for (const p of ['package.json', 'packages/core/package.json', 'packages/content/package.json', 'apps/server/package.json', 'apps/web/package.json']) {
      const pkg = JSON.parse(readFileSync(p, 'utf8')) as Record<string, Record<string, string> | undefined>;
      for (const deps of [pkg.dependencies, pkg.devDependencies])
        for (const [name, version] of Object.entries(deps ?? {})) expect(version, `${p}: ${name}`).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
