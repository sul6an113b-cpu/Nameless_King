/**
 * Zod → strict tool input schema (RESEARCH §Anthropic 2.5). `z.toJSONSchema` output needs three fixes before it can
 * be sent with `strict: true`: drop `$schema`, map `oneOf` (discriminated unions) to `anyOf`, and drop keywords the
 * strict grammar does not support (length/number bounds, `maxItems`, `minItems` > 1). Zod keeps enforcing those rules.
 */
import { z } from 'zod';

export type JsonSchema = Record<string, unknown>;

/** JSON Schema keywords supported by strict tool use. */
export const STRICT_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'anyOf',
  'allOf',
  '$ref',
  '$defs',
  'definitions',
  'description',
  'default',
  'format',
  'pattern',
  'minItems',
]);

const STRICT_FORMATS: ReadonlySet<string> = new Set([
  'date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid',
]);

/** Keywords whose value is data (copied verbatim), or a map of names → schemas. */
const VERBATIM = new Set(['enum', 'const', 'default', 'required', 'type', 'description', 'pattern', '$ref']);
const SCHEMA_MAPS = new Set(['properties', '$defs', 'definitions']);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (node === null || typeof node !== 'object') return node;
  const out: JsonSchema = {};
  for (const [rawKey, value] of Object.entries(node as JsonSchema)) {
    const k = rawKey === 'oneOf' ? 'anyOf' : rawKey;
    if (!STRICT_KEYWORDS.has(k)) continue;
    if (k === 'minItems' && value !== 0 && value !== 1) continue;
    if (k === 'format' && !STRICT_FORMATS.has(String(value))) continue;
    if (VERBATIM.has(k)) out[k] = value;
    else if (SCHEMA_MAPS.has(k))
      out[k] = Object.fromEntries(Object.entries(value as JsonSchema).map(([name, s]) => [name, clean(s)]));
    else out[k] = clean(value);
  }
  if (out.type === 'object') {
    if (out.additionalProperties !== undefined && out.additionalProperties !== false)
      throw new Error('strict tool schemas cannot have open objects (additionalProperties must be false)');
    out.additionalProperties = false;
    out.properties ??= {};
    out.required ??= [];
  }
  return out;
}

/** Convert a Zod schema (an object) into a strict-mode tool `input_schema`. */
export function toToolSchema(schema: z.ZodType): JsonSchema {
  const out = clean(z.toJSONSchema(schema, { unrepresentable: 'throw' })) as JsonSchema;
  if (out.type !== 'object') throw new Error('a tool input schema must be an object');
  return out;
}

export interface StrictStats {
  /** properties not listed in their object's `required` (API limit: 24 across all strict tools) */
  optionalParams: number;
  /** schemas using `anyOf` or a type array (API limit: 16 across all strict tools) */
  unionParams: number;
  /** keywords outside STRICT_KEYWORDS (must be empty) */
  unsupported: string[];
}

/** Count what the strict-mode limits count, across a set of tool input schemas. */
export function strictStats(schemas: JsonSchema[]): StrictStats {
  const stats: StrictStats = { optionalParams: 0, unionParams: 0, unsupported: [] };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== 'object') return;
    const n = node as JsonSchema;
    for (const k of Object.keys(n)) if (!STRICT_KEYWORDS.has(k)) stats.unsupported.push(k);
    if (Array.isArray(n.anyOf) || Array.isArray(n.type)) stats.unionParams++;
    if (n.type === 'object' && n.properties && typeof n.properties === 'object') {
      const required = new Set(Array.isArray(n.required) ? (n.required as string[]) : []);
      for (const [name, child] of Object.entries(n.properties as JsonSchema)) {
        if (!required.has(name)) stats.optionalParams++;
        visit(child);
      }
    }
    for (const k of ['items', 'anyOf', 'allOf', '$defs', 'definitions'] as const) {
      const v = n[k];
      if (v === undefined) continue;
      if (k === '$defs' || k === 'definitions') Object.values(v as JsonSchema).forEach(visit);
      else visit(v);
    }
  };
  schemas.forEach(visit);
  return stats;
}
