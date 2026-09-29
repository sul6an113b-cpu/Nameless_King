/**
 * Versioned model files (SPEC §3). A migration upgrades the raw JSON of version v to version v + 1.
 * Version 1 is the first released schema, so the registry is empty; the mechanism is tested with a fake registry.
 */
import { ModelSchema, SCHEMA_VERSION, type Model } from './model.ts';

export type Migration = (json: Record<string, unknown>) => Record<string, unknown>;

/** migrations[v] upgrades a version-v file to version v + 1. */
export const migrations: Readonly<Record<number, Migration>> = {};

export type MigrateResult =
  | { ok: true; model: Model; fromVersion: number; warnings: string[] }
  | { ok: false; error: string; issues: string[] };

export interface MigrateOptions {
  /** For tests: alternative registry and target version. */
  registry?: Readonly<Record<number, Migration>>;
  targetVersion?: number;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Parse unknown JSON (e.g. an opened file) into a current-version Model. Never throws. */
export function migrateModel(json: unknown, opts: MigrateOptions = {}): MigrateResult {
  const registry = opts.registry ?? migrations;
  const target = opts.targetVersion ?? SCHEMA_VERSION;
  if (!isRecord(json)) return { ok: false, error: 'Not a LoopLab model: expected a JSON object.', issues: [] };
  if (json.format !== 'looplab-model')
    return { ok: false, error: 'Not a LoopLab model: missing "format": "looplab-model".', issues: [] };
  const version = json.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0)
    return { ok: false, error: 'Invalid or missing "schemaVersion".', issues: [] };
  if (version > target)
    return {
      ok: false,
      error: `This file was saved by a newer LoopLab (schema v${version}); this version reads up to v${target}.`,
      issues: [],
    };

  const warnings: string[] = [];
  let current: Record<string, unknown> = json;
  for (let v = version; v < target; v++) {
    const step = registry[v];
    if (!step) return { ok: false, error: `No migration from schema v${v} to v${v + 1}.`, issues: [] };
    current = { ...step(current), schemaVersion: v + 1 };
    warnings.push(`Migrated from schema v${v} to v${v + 1}.`);
  }

  const parsed = ModelSchema.safeParse(current);
  if (!parsed.success)
    return {
      ok: false,
      error: 'The model file is not valid.',
      issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    };
  return { ok: true, model: parsed.data, fromVersion: version, warnings };
}
