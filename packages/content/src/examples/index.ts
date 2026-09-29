/** Bundled example models (SPEC §6.10). */
import type { ExampleModel } from '../types.ts';
import { epcHandoff } from './epc-handoff.ts';
import { epcRework } from './epc-rework.ts';
import { qcNcrBacklog } from './qc-ncr-backlog.ts';
import { tankDraining } from './tank-draining.ts';

export const examples: readonly ExampleModel[] = [epcRework, epcHandoff, qcNcrBacklog, tankDraining];

export { tankHeight } from './tank-draining.ts';
