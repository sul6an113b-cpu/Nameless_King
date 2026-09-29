import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AskQuestionInput, ProposePatchInput, RespondInput } from '@looplab/core';
import { STRICT_KEYWORDS, strictStats, toToolSchema, type JsonSchema } from './toolSchema.ts';
import { READ_TOOL_INPUTS } from './readTools.ts';
import { TOOLS } from './tools.ts';

describe('toToolSchema', () => {
  it('strips $schema and unsupported bounds, maps oneOf → anyOf, keeps enums/consts/descriptions', () => {
    const schema = z.object({
      title: z.string().min(1).max(10).describe('the title'),
      n: z.number().int().min(1).max(12),
      tags: z.array(z.string()).min(1).max(5),
      many: z.array(z.string()).min(2),
      kind: z.enum(['a', 'b']),
      item: z.discriminatedUnion('op', [z.object({ op: z.literal('x'), v: z.boolean() }), z.object({ op: z.literal('y') })]),
      maybe: z.number().nullable(),
      empty: z.object({}),
    });
    expect(toToolSchema(schema)).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string', description: 'the title' },
        n: { type: 'integer' },
        tags: { type: 'array', minItems: 1, items: { type: 'string' } },
        many: { type: 'array', items: { type: 'string' } },
        kind: { type: 'string', enum: ['a', 'b'] },
        item: {
          anyOf: [
            { type: 'object', properties: { op: { type: 'string', const: 'x' }, v: { type: 'boolean' } }, required: ['op', 'v'], additionalProperties: false },
            { type: 'object', properties: { op: { type: 'string', const: 'y' } }, required: ['op'], additionalProperties: false },
          ],
        },
        maybe: { type: ['number', 'null'] },
        empty: { type: 'object', properties: {}, required: [], additionalProperties: false },
      },
      required: ['title', 'n', 'tags', 'many', 'kind', 'item', 'maybe', 'empty'],
      additionalProperties: false,
    });
  });

  it('keeps property names that look like keywords', () => {
    const out = toToolSchema(z.object({ minLength: z.string(), format: z.string() }));
    expect(Object.keys(out.properties as JsonSchema)).toEqual(['minLength', 'format']);
  });

  it('refuses open objects and non-object roots', () => {
    expect(() => toToolSchema(z.object({ r: z.record(z.string(), z.number()) }))).toThrow(/additionalProperties/);
    expect(() => toToolSchema(z.string())).toThrow(/object/);
  });
});

describe('the copilot tool array under strict-mode limits', () => {
  const schemas = TOOLS.map((t) => t.input_schema as JsonSchema);

  it('every tool is strict and uses only supported keywords', () => {
    expect(TOOLS.every((t) => t.strict === true)).toBe(true);
    const stats = strictStats(schemas);
    expect(stats.unsupported).toEqual([]);
    for (const s of schemas) expect(JSON.stringify(s)).not.toMatch(/"(oneOf|\$schema|minLength|maxLength|minimum|maximum|maxItems|exclusiveMinimum|exclusiveMaximum|multipleOf)"/);
    expect([...STRICT_KEYWORDS]).not.toContain('oneOf');
  });

  it('fits the per-request limits: ≤20 strict tools, ≤24 optional params, ≤16 union params', () => {
    const stats = strictStats(schemas);
    expect(TOOLS.length).toBeLessThanOrEqual(20);
    expect(stats.optionalParams).toBeLessThanOrEqual(24);
    expect(stats.unionParams).toBeLessThanOrEqual(16);
    // Recorded in docs/decisions/copilot.md: 9 tools, 0 optional params, 2 union params (patch ops, simulate stop).
    expect({ tools: TOOLS.length, ...stats, unsupported: undefined }).toEqual({ tools: 9, optionalParams: 0, unionParams: 2, unsupported: undefined });
  });

  it('tool names are valid and descriptions substantial', () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
      expect((t.description ?? '').split('. ').length).toBeGreaterThanOrEqual(3);
    }
  });

  it('the Zod schemas behind the tools accept what the JSON schemas describe (round trip of examples)', () => {
    expect(READ_TOOL_INPUTS.simulate_scenario.safeParse({ scenarioId: '', overrides: [], saveIds: [], stop: null }).success).toBe(true);
    expect(AskQuestionInput.safeParse({ question: 'q?', options: [], why: '' }).success).toBe(true);
    expect(RespondInput.safeParse({ markdown: 'm', findings: [], hypotheses: [] }).success).toBe(true);
    expect(
      ProposePatchInput.safeParse({ title: 't', rationale: 'r', hypotheses: [], ops: [{ op: 'remove', entity: 'link', id: 'l_1' }] }).success,
    ).toBe(true);
  });
});
