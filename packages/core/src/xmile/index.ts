/** XMILE 1.0 documented subset (SPEC §6.7) — owner: interop (Phase 3). Phase-1 stub: signatures only. */
import type { XmileImportResult } from '../contracts.ts';
import type { Model } from '../schema/model.ts';
import { notImplemented } from '../stub.ts';

export function importXmile(_xml: string): XmileImportResult {
  return notImplemented('xmile.importXmile');
}

export function exportXmile(_model: Model): string {
  return notImplemented('xmile.exportXmile');
}
