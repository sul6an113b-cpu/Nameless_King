/** Decision-brief builder and CSV export (SPEC §6.8) — owner: interop (Phase 3). Phase-1 stub. */
import type { ReportInput, ReportOutput, SimResult } from '../contracts.ts';
import type { Id } from '../schema/model.ts';
import { notImplemented } from '../stub.ts';

export function buildReport(_input: ReportInput): ReportOutput {
  return notImplemented('report.buildReport');
}

export function toCsv(_result: SimResult, _names: Record<Id, string>): string {
  return notImplemented('report.toCsv');
}
