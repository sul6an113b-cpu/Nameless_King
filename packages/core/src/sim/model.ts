/** compileModel / simulate (SPEC §6.3). */
import type { CompileOptions, CompileResult, CompiledModel, SimResult } from '../contracts.ts';
import type { Id, Model, SimSpec } from '../schema/model.ts';
import { compileProgram, type Program } from './compile.ts';
import { runProgram } from './run.ts';

/** `base` with every defined field of `over` applied. */
export function mergeSpec(base: SimSpec, over?: Partial<SimSpec>): SimSpec {
  const out: SimSpec = { ...base };
  for (const [k, val] of Object.entries(over ?? {})) if (val !== undefined) Object.assign(out, { [k]: val });
  return out;
}

/** Wrap a compiled program as the public CompiledModel. */
export function toCompiled(program: Program, baseSpec: SimSpec, baseOverrides: Record<Id, number> = {}): CompiledModel {
  Object.assign(program.env, { dt: baseSpec.dt, start: baseSpec.start, stop: baseSpec.stop });
  const assertionWarnings = program.assertionErrors.map((e) => e.message);
  return {
    varIds: program.varIds,
    index: program.index,
    size: program.size,
    deps: program.deps,
    simulate(spec, simOpts = {}) {
      const result = runProgram(program, mergeSpec(baseSpec, spec), {
        ...simOpts,
        overrides: { ...baseOverrides, ...simOpts.overrides },
      });
      result.warnings.unshift(...assertionWarnings);
      return result;
    },
    evalVar(id, values, time) {
      const f = program.valueFns.get(id);
      if (f) return f(values, time);
      if (program.stockIds.has(id)) return values[program.index[id]];
      throw new Error(`evalVar: "${id}" is not a quantified variable of this model`);
    },
  };
}

export function compileModel(model: Model, opts: CompileOptions = {}): CompileResult {
  const { program, errors } = compileProgram(model, opts.scenario);
  if (!program) return { ok: false, errors };
  return { ok: true, compiled: toCompiled(program, mergeSpec(model.simSpec, opts.scenario?.simSpec), opts.overrides) };
}

/** Convenience: compile + run; throws on compile errors. */
export function simulate(model: Model, spec?: Partial<SimSpec>): SimResult {
  const r = compileModel(model);
  if (!r.ok) throw new Error(`Model does not compile:\n${r.errors.map((e) => `- ${e.message}`).join('\n')}`);
  return r.compiled.simulate(spec);
}
