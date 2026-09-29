import { describe, expect, it } from 'vitest';
import { ModelSchema } from '@looplab/core';
import { archetypes, examples, leveragePoints } from './index.ts';

describe('content library (harness)', () => {
  it('every bundled model parses under the current schema', () => {
    for (const a of archetypes) {
      expect(ModelSchema.safeParse(a.cld).success).toBe(true);
      expect(ModelSchema.safeParse(a.sfd).success).toBe(true);
    }
    for (const e of examples) expect(ModelSchema.safeParse(e.model).success).toBe(true);
    expect(Array.isArray(leveragePoints)).toBe(true);
  });
});
