// Fails when the offline cache VERSION in sw.js does not match the current files:
// installed phones would otherwise keep running old code. Fix: python3 tools/release.py
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try {
  const v = execFileSync('python3', [path.join(root, 'tools', 'release.py'), '--check']).toString().trim();
  console.log(`  ✓ sw.js VERSION is current (${v})`);
} catch (e) {
  console.log(`  ✗ ${String(e.stderr || e.message).trim()}`);
  process.exit(1);
}
