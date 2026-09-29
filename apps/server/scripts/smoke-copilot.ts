/**
 * `npm run smoke:copilot` — one live Anthropic call (owner: copilot, Phase 2).
 * Skips cleanly (exit 0) when no key is configured. Never prints the key.
 */
import { loadDotEnv } from '../src/env.ts';

loadDotEnv();
if (!process.env.ANTHROPIC_API_KEY) {
  console.log('smoke:copilot skipped — no ANTHROPIC_API_KEY in .env');
  process.exit(0);
}
console.error('smoke:copilot: the copilot is not implemented yet (Phase 2).');
process.exit(1);
