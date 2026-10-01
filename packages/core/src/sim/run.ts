/**
 * Integrator (SPEC §5 integration rules, RESEARCH §XMILE 3.2):
 *  - TIME = start + n·DT (never accumulated); (stop − start)/DT must be a whole number of steps.
 *  - Each step: evaluate time-varying auxes/flows in dependency order, limit outflows of non-negative stocks,
 *    record the row (flows reported instantaneous), sample PREVIOUS/DELAY inputs, then integrate.
 *  - Euler: S += DT·net(tₙ). RK4: classic four stages over user + hidden stocks at tₙ, tₙ+DT/2, tₙ+DT/2, tₙ+DT;
 *    the recorded aux/flow values are those at (tₙ, Sₙ). Non-negative limits apply per stage.
 */
import type { SimOptions, SimResult } from '../contracts.ts';
import type { Id, SimSpec } from '../schema/model.ts';
import { SimulationError, type Fn, type Program } from './compile.ts';

const fail = (message: string): never => {
  throw new SimulationError({ check: 'numeric', severity: 'error', message, elementIds: [] });
};

/** Validated time axis: number of DT steps and the save interval in steps. */
export function timeAxis(spec: SimSpec): { steps: number; every: number } {
  const { start, stop, dt } = spec;
  if (!(dt > 0) || !Number.isFinite(dt)) fail(`DT must be a positive number (got ${dt})`);
  if (!Number.isFinite(start) || !Number.isFinite(stop) || !(stop > start))
    fail(`The stop time must be after the start time (start ${start}, stop ${stop})`);
  const ratio = (stop - start) / dt;
  const steps = Math.round(ratio);
  if (Math.abs(ratio - steps) > 1e-9 * Math.max(1, steps))
    fail(`(stop − start)/DT must be a whole number of steps (got ${ratio}); adjust DT or the stop time`);
  if (steps > 10_000_000) fail(`Too many steps (${steps}); increase DT`);
  const save = spec.saveEvery ?? dt;
  const every = Math.round(save / dt);
  if (every < 1 || Math.abs(save / dt - every) > 1e-9 * Math.max(1, every))
    fail(`The save interval (${save}) must be a whole multiple of DT (${dt})`);
  return { steps, every };
}

/** Run with `spec`, then restore the program's time settings so later `evalVar` calls see the compiled DT. */
export function runProgram(p: Program, spec: SimSpec, opts: SimOptions = {}): SimResult {
  const prev = { dt: p.env.dt, start: p.env.start, stop: p.env.stop };
  try {
    return runProgramAt(p, spec, opts);
  } finally {
    Object.assign(p.env, prev);
  }
}

function runProgramAt(p: Program, spec: SimSpec, opts: SimOptions = {}): SimResult {
  const { steps, every } = timeAxis(spec);
  const { start, dt } = spec;
  p.env.dt = dt;
  p.env.start = start;
  p.env.stop = spec.stop;

  const overrides = opts.overrides ?? {};
  const overridden = new Set(Object.keys(overrides));
  for (const id of overridden) if (p.index[id] === undefined) throw new Error(`Cannot override unknown variable "${id}"`);

  // ── initialisation pass (dependency order) ──
  const v = new Float64Array(p.size);
  for (const s of p.initSteps) {
    v[s.slot] = s.varId !== undefined && overridden.has(s.varId) ? overrides[s.varId] : s.fn(v, start);
    s.after?.(v, start);
  }

  // ── time-varying auxes/flows; an overridden one keeps its value ──
  let dynSlots = p.dynSlots;
  let dynFns = p.dynFns;
  if (p.dynIds.some((id) => overridden.has(id))) {
    const keep = p.dynIds.map((id) => !overridden.has(id));
    dynSlots = p.dynSlots.filter((_, i) => keep[i]);
    dynFns = p.dynFns.filter((_, i) => keep[i]);
  }
  const nDyn = dynSlots.length;
  const nonNeg = p.nonNeg;
  /**
   * outₖ ← min(outₖ, max(0, S/DT + Σin − Σ_{j<k} outⱼ)) in priority order (conserves material).
   * Limiting one stock's outflow can shrink another non-negative stock's inflow, so passes repeat until
   * nothing changes (flows only decrease; capped at one pass per non-negative stock).
   */
  const limitOutflows = () => {
    for (let pass = 0; pass <= nonNeg.length; pass++) {
      let changed = false;
      for (let k = 0; k < nonNeg.length; k++) {
        const s = nonNeg[k];
        let avail = v[s.slot] / dt;
        for (let j = 0; j < s.inflows.length; j++) avail += v[s.inflows[j]];
        for (let j = 0; j < s.outflows.length; j++) {
          const o = s.outflows[j];
          const limit = avail > 0 ? avail : 0;
          if (v[o] > limit) {
            v[o] = limit;
            changed = true;
          }
          avail -= v[o];
        }
      }
      if (!changed) return;
    }
  };
  const evaluate = (t: number) => {
    for (let i = 0; i < nDyn; i++) v[dynSlots[i]] = dynFns[i](v, t);
    if (nonNeg.length > 0) limitOutflows();
  };

  // ── stocks: user stocks (net flow via CSR) then hidden stocks ──
  const ss = p.stockSlots;
  const nS = ss.length;
  const nU = p.userStockCount;
  const { flowStart, flowSlot, flowSign } = p;
  const hidden: Fn[] = p.hiddenDerivs;
  const deriv = (t: number, out: Float64Array) => {
    for (let k = 0; k < nU; k++) {
      let d = 0;
      for (let j = flowStart[k]; j < flowStart[k + 1]; j++) d += flowSign[j] * v[flowSlot[j]];
      out[k] = d;
    }
    for (let h = nU; h < nS; h++) out[h] = hidden[h - nU](v, t);
  };

  // ── output ──
  const saveIds: Id[] = opts.saveIds ?? p.varIds;
  const saveSlots = Int32Array.from(
    saveIds.map((id) => {
      const s = p.index[id];
      if (s === undefined) throw new Error(`Cannot save unknown variable "${id}"`);
      return s;
    }),
  );
  const rows = Math.floor(steps / every) + 1 + (steps % every === 0 ? 0 : 1);
  const time = new Float64Array(rows);
  const cols = saveIds.map(() => new Float64Array(rows));
  const nCols = cols.length;
  const states: Float64Array[] | undefined = opts.saveState ? [] : undefined;
  const assertions: SimResult['assertions'] = [];
  const pendingAssertions = [...p.assertions];
  let row = 0;
  const record = (t: number) => {
    time[row] = t;
    for (let c = 0; c < nCols; c++) cols[c][row] = v[saveSlots[c]];
    states?.push(v.slice()); // full vector incl. hidden builtin slots, independent of `saveIds`
    row++;
    for (let i = pendingAssertions.length - 1; i >= 0; i--) {
      const a = pendingAssertions[i];
      const x = a.fn(v, t);
      if (x === 0 || Number.isNaN(x)) {
        assertions.push({ assertionId: a.id, time: t, message: `Assertion "${a.expr}" failed at time ${t}` });
        pendingAssertions.splice(i, 1);
      }
    }
  };

  const disc = p.discretes;
  const pending = new Float64Array(disc.length);
  const rk4 = spec.method === 'rk4';
  const k1 = new Float64Array(nS);
  const k2 = rk4 ? new Float64Array(nS) : k1;
  const k3 = rk4 ? new Float64Array(nS) : k1;
  const k4 = rk4 ? new Float64Array(nS) : k1;
  const y0 = rk4 ? new Float64Array(nS) : k1;
  const half = dt / 2;
  const signal = opts.signal;
  const warnings: string[] = [];

  for (let n = 0; n <= steps; n++) {
    if (signal?.aborted) {
      warnings.push(`Simulation cancelled at time ${start + n * dt}`);
      break;
    }
    const t = start + n * dt;
    evaluate(t);
    if (n % every === 0 || n === steps) record(t);
    if (n === steps) break;
    for (let d = 0; d < disc.length; d++) pending[d] = disc[d].sample(v, t);

    deriv(t, k1);
    if (!rk4) {
      for (let i = 0; i < nS; i++) v[ss[i]] += dt * k1[i];
    } else {
      for (let i = 0; i < nS; i++) {
        y0[i] = v[ss[i]];
        v[ss[i]] = y0[i] + half * k1[i];
      }
      evaluate(t + half);
      deriv(t + half, k2);
      for (let i = 0; i < nS; i++) v[ss[i]] = y0[i] + half * k2[i];
      evaluate(t + half);
      deriv(t + half, k3);
      for (let i = 0; i < nS; i++) v[ss[i]] = y0[i] + dt * k3[i];
      evaluate(t + dt);
      deriv(t + dt, k4);
      for (let i = 0; i < nS; i++) v[ss[i]] = y0[i] + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    }
    for (let d = 0; d < disc.length; d++) disc[d].apply(v, pending[d]);
  }

  const series: Record<Id, Float64Array> = {};
  saveIds.forEach((id, c) => (series[id] = row === rows ? cols[c] : cols[c].slice(0, row)));
  const result: SimResult = {
    time: row === rows ? time : time.slice(0, row),
    series,
    spec: { ...spec },
    assertions,
    warnings,
    ...(states ? { state: states } : {}),
  };
  for (const f of firstNonFinite(result).slice(0, 10))
    warnings.push(`"${f.id}" becomes ${f.value} at time ${f.time} (check divisions, LN/SQRT domains, overflow)`);
  return result;
}

/** First non-finite value of each saved series (NaN/±Infinity). */
export function firstNonFinite(r: SimResult): { id: Id; time: number; value: number }[] {
  const out: { id: Id; time: number; value: number }[] = [];
  for (const [id, col] of Object.entries(r.series))
    for (let i = 0; i < col.length; i++)
      if (!Number.isFinite(col[i])) {
        out.push({ id, time: r.time[i], value: col[i] });
        break;
      }
  return out;
}
