/** Pure simulation step shared by the sim worker and the main-thread fallback (tests, no-worker browsers). */
import {
  NotImplementedError,
  compileModel,
  type HealthItem,
  type Id,
  type Model,
  type SimResult,
  type SimSpec,
} from '@looplab/core';

export interface SimRequest {
  id: number;
  model: Model;
  spec?: Partial<SimSpec>;
  saveIds?: Id[];
}

export type SimOutcome =
  | { status: 'ok'; result: SimResult; ms: number }
  | { status: 'compile-error'; errors: HealthItem[] }
  | { status: 'unavailable'; what: string }
  | { status: 'error'; message: string };

export type SimReply = SimOutcome & { id: number };

export function runSimulation(model: Model, spec?: Partial<SimSpec>, saveIds?: Id[]): SimOutcome {
  try {
    const t0 = performance.now();
    const compiled = compileModel(model);
    if (!compiled.ok) return { status: 'compile-error', errors: compiled.errors };
    const result = compiled.compiled.simulate(spec, saveIds ? { saveIds } : undefined);
    return { status: 'ok', result, ms: performance.now() - t0 };
  } catch (e) {
    if (e instanceof NotImplementedError) return { status: 'unavailable', what: 'Simulation' };
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Distinct buffers of a result, for a zero-copy postMessage transfer. */
export function transferables(result: SimResult): ArrayBuffer[] {
  const set = new Set<ArrayBuffer>();
  for (const a of [result.time, ...Object.values(result.series)])
    if (a.buffer instanceof ArrayBuffer) set.add(a.buffer);
  return [...set];
}
