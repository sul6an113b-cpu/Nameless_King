/** Unit algebra (SPEC §6.2) — owner: sd-engine. Phase-1 stub: signatures only. */
import type { Dim, HealthItem, UnitParseResult } from '../contracts.ts';
import type { Id, Model, UnitDef } from '../schema/model.ts';
import { notImplemented } from '../stub.ts';

export function parseUnit(_s: string, _defs: UnitDef[]): UnitParseResult {
  return notImplemented('units.parseUnit');
}

export function inferUnits(_model: Model): { byVar: Record<Id, Dim | null>; issues: HealthItem[] } {
  return notImplemented('units.inferUnits');
}
