import { describe, expect, it } from 'vitest';
import { examples } from '@looplab/content';
import { withLayout } from './prepare.ts';

describe('withLayout on bundled examples', () => {
  for (const ex of examples)
    it(`lays out ${ex.id}`, () => {
      const m = withLayout({ ...ex.model, layout: { cld: {}, sfd: {} } });
      expect(Object.keys(m.layout.cld).length).toBe(ex.model.variables.length);
      expect(Object.keys(m.layout.sfd).length).toBe(ex.model.variables.length);
    });
});
