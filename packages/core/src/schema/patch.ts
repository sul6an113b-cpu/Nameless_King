/**
 * Patch contract (SPEC §7.3): how the copilot proposes model changes.
 * Ops carry loosely-typed values; `applyPatch` (core/protocol) validates each accepted op against its entity schema.
 */
import { z } from 'zod';

export const PatchEntity = z.enum(['variable', 'link', 'loopAnnotation', 'intervention', 'scenario', 'assertion']);
export type PatchEntity = z.infer<typeof PatchEntity>;

export const PatchOp = z.discriminatedUnion('op', [
  z.object({
    opId: z.string().min(1),
    op: z.literal('add'),
    entity: PatchEntity,
    value: z.record(z.string(), z.unknown()),
  }),
  z.object({
    opId: z.string().min(1),
    op: z.literal('update'),
    entity: PatchEntity,
    id: z.string(),
    changes: z.record(z.string(), z.unknown()),
  }),
  z.object({
    opId: z.string().min(1),
    op: z.literal('remove'),
    entity: PatchEntity,
    id: z.string(),
  }),
]);
export type PatchOp = z.infer<typeof PatchOp>;

export const Patch = z.object({
  id: z.string(),
  title: z.string().max(200),
  rationale: z.string().max(4000),
  ops: z.array(PatchOp).min(1).max(200),
});
export type Patch = z.infer<typeof Patch>;
