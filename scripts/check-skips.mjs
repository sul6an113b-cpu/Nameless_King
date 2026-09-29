#!/usr/bin/env node
/**
 * Acceptance criterion 1: "no skipped test without a logged reason".
 * Fails if any test file skips/todos/fixmes a test without a `SKIP-REASON:` comment on the same or previous line.
 * The reason should point at docs/DECISIONS.md (or docs/decisions/<agent>.md).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['packages', 'apps', 'tests', 'e2e'];
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'vendor', 'fixtures', 'test-results', 'playwright-report']);
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/;
const SKIP = /\b(?:it|test|describe|bench)\.(?:skip|todo|fixme|skipIf|runIf)\b|\bx(?:it|test|describe)\s*\(/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (IGNORE_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEST_FILE.test(name)) yield p;
  }
}

const problems = [];
let skipsWithReason = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!SKIP.test(line)) return;
      const hasReason = line.includes('SKIP-REASON:') || (i > 0 && lines[i - 1].includes('SKIP-REASON:'));
      if (hasReason) skipsWithReason++;
      else problems.push(`${relative('.', file)}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (problems.length > 0) {
  console.error('Skipped tests without a logged reason (add `// SKIP-REASON: … (docs/DECISIONS.md#…)`):');
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-skips: OK (${skipsWithReason} skip(s), all with a logged reason)`);
