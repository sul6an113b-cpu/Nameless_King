/**
 * `npm run smoke:copilot` — the one live Anthropic check (owner: copilot).
 * No key in .env → prints a skip message and exits 0. With a key: runs Interview on a sample EPC rework problem and
 * asserts a schema-valid CLD patch that applies cleanly, then a Critique of the result and asserts that its first
 * call reads the cached tools + system prefix. Prints a summary and token usage — never the key.
 */
import {
  ModelSchema,
  Patch,
  applyPatch,
  createEmptyModel,
  type CopilotRequest,
  type CopilotResponse,
  type Model,
  type UsageEntry,
} from '@looplab/core';
import { createAnthropicClient } from '../src/copilot/client.ts';
import { createCopilotHandler } from '../src/copilot/handler.ts';
import { loadDotEnv, readServerEnv } from '../src/env.ts';

loadDotEnv();
const env = readServerEnv(process.env);
if (!env.apiKey) {
  console.log('smoke:copilot skipped — no ANTHROPIC_API_KEY in .env');
  process.exit(0);
}
if (!env.model) {
  console.error('smoke:copilot: set CLAUDE_MODEL in .env (see .env.example); no model id is assumed.');
  process.exit(1);
}

const handler = createCopilotHandler({ client: createAnthropicClient(env.apiKey), model: env.model });

const empty = createEmptyModel('EPC rework (smoke test)');
const sample: Model = {
  ...empty,
  frame: {
    ...empty.frame,
    problem:
      'Our EPC projects finish 20-40% late. Engineering releases drawings on time, but late in the project ' +
      'construction discovers errors that send work back to engineering; schedule pressure then drives overtime.',
    purpose: 'Understand why rework keeps growing late in the project and where to intervene.',
  },
  simSpec: { ...empty.simSpec, stop: 36, timeUnit: 'month' },
};

let failed = false;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed = true;
};
const usageLine = (u: UsageEntry) =>
  `  call ${u.call}: input ${u.inputTokens} · cache write ${u.cacheCreationInputTokens} · cache read ${u.cacheReadInputTokens} · output ${u.outputTokens}`;

async function run(label: string, req: CopilotRequest): Promise<CopilotResponse> {
  const t0 = Date.now();
  const res = await handler(req);
  console.log(
    `\n${label}: ${res.ok ? res.output.kind : `error ${res.error.code}`} in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  console.log(`  tools: ${res.trace.map((t) => `${t.name}${t.ok ? '' : '(!)'}`).join(', ') || '-'}`);
  res.usage.forEach((u) => console.log(usageLine(u)));
  if (!res.ok) {
    console.log(`  ${res.error.message}`);
    if (res.error.detail !== undefined) console.log(`  detail: ${JSON.stringify(res.error.detail).slice(0, 600)}`);
    if (/too complex|schema/i.test(res.error.message))
      console.log(
        '  hint: if the strict propose_patch schema is rejected, set PROPOSE_PATCH_STRICT = false in copilot/tools.ts',
      );
  }
  return res;
}

console.log(`smoke:copilot — model ${env.model}`);

const interview = await run('Interview', {
  mode: 'interview',
  stage: 'map',
  model: sample,
  messages: [
    {
      role: 'user',
      text:
        'Rework discovered late (errors found by construction) and schedule pressure (overtime, fatigue) seem to be the main ' +
        'drivers. Skip further questions: propose the initial causal loop diagram now.',
    },
  ],
});

let patched = sample;
check(interview.ok && interview.output.kind === 'patch', 'Interview returns a propose_patch answer');
if (interview.ok && interview.output.kind === 'patch') {
  const patch = interview.output.patch;
  check(Patch.safeParse(patch).success, `patch is schema-valid (${patch.ops.length} ops: "${patch.title}")`);
  const applied = applyPatch(sample, patch, new Set(patch.ops.map((o) => o.opId)));
  check(
    applied.skipped.length === 0,
    `every op applies (${applied.applied.length} applied, ${applied.skipped.length} skipped)`,
  );
  patched = applied.model;
  check(ModelSchema.safeParse(patched).success, 'patched model satisfies ModelSchema');
  check(
    patched.variables.length >= 3 && patched.links.length >= 3,
    `CLD has ${patched.variables.length} variables, ${patched.links.length} links`,
  );
  check(
    patched.variables.every((v) => v.origin === 'ai-proposed') &&
      patched.links.every((l) => l.origin === 'ai-proposed'),
    'accepted elements are tagged ai-proposed',
  );
}

const critique = await run('Critique', {
  mode: 'critique',
  stage: 'map',
  model: patched,
  messages: [{ role: 'user', text: 'Critique this CLD briefly.' }],
});
check(critique.ok, 'Critique returns a valid answer');
const firstCall = critique.usage[0];
check(
  (firstCall?.cacheReadInputTokens ?? 0) > 0,
  `second request reads the cached prefix (${firstCall?.cacheReadInputTokens ?? 0} tokens)`,
);

const all = [...interview.usage, ...critique.usage];
const sum = (k: keyof UsageEntry) => all.reduce((s, u) => s + u[k], 0);
console.log(
  `\nTotal over ${all.length} calls: input ${sum('inputTokens')} · cache write ${sum('cacheCreationInputTokens')} · ` +
    `cache read ${sum('cacheReadInputTokens')} · output ${sum('outputTokens')}`,
);
console.log(failed ? '\nsmoke:copilot FAILED' : '\nsmoke:copilot passed');
process.exit(failed ? 1 : 0);
