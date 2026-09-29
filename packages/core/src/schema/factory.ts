import { ModelSchema, SCHEMA_VERSION, type Id, type Model } from './model.ts';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random element id with a type prefix, e.g. newId('v') → 'v_k3j9x0q2ab'. Uses Web Crypto (browser, worker, Node). */
export function newId(prefix: string, length = 10): Id {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${s}`;
}

export interface CreateModelOptions {
  id?: Id;
  /** ISO timestamp; pass explicitly for deterministic tests. */
  now?: string;
}

/** A new, empty, valid model with all defaults applied. */
export function createEmptyModel(name: string, opts: CreateModelOptions = {}): Model {
  const now = opts.now ?? new Date().toISOString();
  return ModelSchema.parse({
    format: 'looplab-model',
    schemaVersion: SCHEMA_VERSION,
    id: opts.id ?? newId('m'),
    name,
    createdAt: now,
    updatedAt: now,
  });
}
