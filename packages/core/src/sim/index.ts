/** Compiler, Euler/RK4 simulator and Model Health (SPEC §6.3–6.4) — owner: sd-engine. Phase-1 stub. */
import type { CompileOptions, CompileResult, HealthReport, SimResult } from '../contracts.ts';
import type { Model, SimSpec } from '../schema/model.ts';
import { notImplemented } from '../stub.ts';

export function compileModel(_model: Model, _opts?: CompileOptions): CompileResult {
  return notImplemented('sim.compileModel');
}

/** Convenience: compile + run; throws on compile errors. */
export function simulate(_model: Model, _spec?: Partial<SimSpec>): SimResult {
  return notImplemented('sim.simulate');
}

export function runHealth(_model: Model, _opts?: { runIntegrationTest?: boolean }): HealthReport {
  return notImplemented('sim.runHealth');
}
