import { describe, expect, it } from 'vitest';
import { migrateModel } from './migrate.ts';
import { createEmptyModel } from './factory.ts';

const current = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(createEmptyModel('M', { id: 'm_1', now: '2026-09-29T00:00:00Z' }))) as Record<string, unknown>;

describe('migrateModel', () => {
  it('accepts a current-version file unchanged', () => {
    const r = migrateModel(current());
    expect(r.ok && r.fromVersion).toBe(1);
    expect(r.ok && r.warnings).toEqual([]);
  });

  it('rejects non-objects, foreign JSON and missing versions without throwing', () => {
    for (const bad of [null, 42, 'x', [], { hello: 1 }, { format: 'looplab-model' }]) {
      const r = migrateModel(bad);
      expect(r.ok).toBe(false);
    }
  });

  it('rejects files from a newer schema with a clear message', () => {
    const r = migrateModel({ ...current(), schemaVersion: 99 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/newer LoopLab/);
  });

  it('reports schema issues with paths', () => {
    const r = migrateModel({ ...current(), variables: [{ id: 'bad id', name: '' }] });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues.length).toBeGreaterThan(0);
  });

  it('applies registry steps in order up to the target version', () => {
    // Fake history: a "v0" file stored the model name under "title"; v1 calls it "name".
    const { name, ...rest } = current();
    const v0 = { ...rest, schemaVersion: 0, title: name };
    const registry = {
      0: (j: Record<string, unknown>) => {
        const { title, ...others } = j;
        return { ...others, name: title };
      },
    };
    const r = migrateModel(v0, { registry });
    expect(r.ok).toBe(true);
    expect(r.ok && r.model.name).toBe('M');
    expect(r.ok && r.fromVersion).toBe(0);
    expect(r.ok && r.warnings).toEqual(['Migrated from schema v0 to v1.']);
  });

  it('fails clearly when a migration step is missing', () => {
    const r = migrateModel({ ...current(), schemaVersion: 0 });
    expect(!r.ok && r.error).toMatch(/No migration from schema v0 to v1/);
  });
});
