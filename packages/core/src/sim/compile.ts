/**
 * Compiler (SPEC §5, §6.3): Model → a Program of closures over one Float64Array value vector.
 * Never evaluates model text as code: equations are parsed to an AST and turned into small closures.
 *
 * Value vector layout: one slot per quantified user variable (model order, lookups excluded), then hidden
 * slots for stateful builtins:
 *  - hidden stocks (SMTH1/3/N stages, DELAY1/3/N stages) — integrated by Euler/RK4 like user stocks;
 *  - discrete states (PREVIOUS, DELAY pipeline) — updated once per step from the values at tₙ;
 *  - frozen slots (INIT) — set in the initialisation pass.
 * Stateful calls are hoisted wherever they appear (also inside IF branches), so they update every step.
 */
import type { Ast, BinOp, HealthItem } from '../contracts.ts';
import { BUILTINS } from '../parser/builtins.ts';
import { constantValue } from '../parser/constant.ts';
import { parseEquation, referencedNames } from '../parser/parse.ts';
import type { Id, Model, Scenario, Variable } from '../schema/model.ts';
import { canonicalName } from '../schema/names.ts';
import { makeGraphical } from './graphical.ts';

export type Fn = (v: Float64Array, t: number) => number;

/** Run settings that closures read (DT, STARTTIME, STOPTIME); set at the start of every run. */
export interface Env {
  dt: number;
  start: number;
  stop: number;
}

/** One step of the initialisation pass (dependency order). */
export interface InitStep {
  slot: number;
  fn: Fn;
  /** user variable (overridable) */
  varId?: Id;
  /** runs after the slot is set (DELAY: allocate the pipeline) */
  after?: (v: Float64Array, t: number) => void;
}

/** PREVIOUS / DELAY: sample at tₙ (before integrating), apply after the step. */
export interface Discrete {
  slot: number;
  sample: Fn;
  apply: (v: Float64Array, x: number) => void;
}

export interface NonNegStock {
  slot: number;
  inflows: Int32Array;
  /** outflows in priority order (= order in model.variables) */
  outflows: Int32Array;
}

export interface Program {
  size: number;
  env: Env;
  index: Record<Id, number>;
  varIds: Id[];
  deps: Record<Id, Id[]>;
  initSteps: InitStep[];
  /** time-varying auxes/flows in evaluation order */
  dynSlots: Int32Array;
  dynFns: Fn[];
  dynIds: Id[];
  /** all integrated slots: user stocks first, then hidden stocks */
  stockSlots: Int32Array;
  userStockCount: number;
  /** CSR over user stocks: net flow = Σ sign·v[slot] (summed in flow-id order, so file order never matters) */
  flowStart: Int32Array;
  flowSlot: Int32Array;
  flowSign: Float64Array;
  hiddenDerivs: Fn[];
  nonNeg: NonNegStock[];
  discretes: Discrete[];
  /** value closure of every non-stock user variable (for evalVar) */
  valueFns: Map<Id, Fn>;
  stockIds: Set<Id>;
  assertions: { id: Id; expr: string; fn: Fn }[];
  assertionErrors: HealthItem[];
}

/** Error raised while running (bad time axis, DELAY time not a multiple of DT, …). */
export class SimulationError extends Error {
  readonly item: HealthItem;
  constructor(item: HealthItem) {
    super(item.message);
    this.name = 'SimulationError';
    this.item = item;
  }
}

interface E {
  f: Fn;
  /** set when the expression is a compile-time constant */
  c?: number;
  /** set when the expression is a plain slot read */
  slot?: number;
}

/** Pseudo-slot recorded in a dependency set when an expression reads TIME. */
const TIME_DEP = -1;

const K = (c: number): E => ({ f: () => c, c });

const MATH1: Record<string, (x: number) => number> = {
  ABS: Math.abs,
  EXP: Math.exp,
  LN: Math.log,
  LOG10: Math.log10,
  SQRT: Math.sqrt,
  INT: Math.floor,
  SIN: Math.sin,
  COS: Math.cos,
  TAN: Math.tan,
  ARCSIN: Math.asin,
  ARCCOS: Math.acos,
  ARCTAN: Math.atan,
};

/** Floored modulus (XMILE: the result takes the sign of the divisor). */
const fmod = (a: number, b: number) => a - b * Math.floor(a / b);

function binValue(op: BinOp, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '*':
      return a * b;
    case '/':
      return a / b;
    case '^':
      return a ** b;
    case 'mod':
      return fmod(a, b);
    case '<':
      return a < b ? 1 : 0;
    case '<=':
      return a <= b ? 1 : 0;
    case '>':
      return a > b ? 1 : 0;
    case '>=':
      return a >= b ? 1 : 0;
    case '=':
      return a === b ? 1 : 0;
    case '<>':
      return a !== b ? 1 : 0;
    case 'and':
      return a !== 0 && b !== 0 ? 1 : 0;
    case 'or':
      return a !== 0 || b !== 0 ? 1 : 0;
  }
}

/**
 * Closure makers for one binary operator by operand kind (s = slot read, c = constant, g = any closure).
 * Folding slot reads and constants into their parent roughly halves the number of (megamorphic) closure
 * calls in the hot loop.
 */
interface OpMakers {
  ss(i: number, j: number): Fn;
  sc(i: number, c: number): Fn;
  cs(c: number, j: number): Fn;
  sg(i: number, b: Fn): Fn;
  gs(a: Fn, j: number): Fn;
  cg(c: number, b: Fn): Fn;
  gc(a: Fn, c: number): Fn;
  gg(a: Fn, b: Fn): Fn;
}

const FAST: Partial<Record<BinOp, OpMakers>> = {
  '+': {
    ss: (i, j) => (v) => v[i] + v[j],
    sc: (i, c) => (v) => v[i] + c,
    cs: (c, j) => (v) => c + v[j],
    sg: (i, b) => (v, t) => v[i] + b(v, t),
    gs: (a, j) => (v, t) => a(v, t) + v[j],
    cg: (c, b) => (v, t) => c + b(v, t),
    gc: (a, c) => (v, t) => a(v, t) + c,
    gg: (a, b) => (v, t) => a(v, t) + b(v, t),
  },
  '-': {
    ss: (i, j) => (v) => v[i] - v[j],
    sc: (i, c) => (v) => v[i] - c,
    cs: (c, j) => (v) => c - v[j],
    sg: (i, b) => (v, t) => v[i] - b(v, t),
    gs: (a, j) => (v, t) => a(v, t) - v[j],
    cg: (c, b) => (v, t) => c - b(v, t),
    gc: (a, c) => (v, t) => a(v, t) - c,
    gg: (a, b) => (v, t) => a(v, t) - b(v, t),
  },
  '*': {
    ss: (i, j) => (v) => v[i] * v[j],
    sc: (i, c) => (v) => v[i] * c,
    cs: (c, j) => (v) => c * v[j],
    sg: (i, b) => (v, t) => v[i] * b(v, t),
    gs: (a, j) => (v, t) => a(v, t) * v[j],
    cg: (c, b) => (v, t) => c * b(v, t),
    gc: (a, c) => (v, t) => a(v, t) * c,
    gg: (a, b) => (v, t) => a(v, t) * b(v, t),
  },
  '/': {
    ss: (i, j) => (v) => v[i] / v[j],
    sc: (i, c) => (v) => v[i] / c,
    cs: (c, j) => (v) => c / v[j],
    sg: (i, b) => (v, t) => v[i] / b(v, t),
    gs: (a, j) => (v, t) => a(v, t) / v[j],
    cg: (c, b) => (v, t) => c / b(v, t),
    gc: (a, c) => (v, t) => a(v, t) / c,
    gg: (a, b) => (v, t) => a(v, t) / b(v, t),
  },
  '<': {
    ss: (i, j) => (v) => (v[i] < v[j] ? 1 : 0),
    sc: (i, c) => (v) => (v[i] < c ? 1 : 0),
    cs: (c, j) => (v) => (c < v[j] ? 1 : 0),
    sg: (i, b) => (v, t) => (v[i] < b(v, t) ? 1 : 0),
    gs: (a, j) => (v, t) => (a(v, t) < v[j] ? 1 : 0),
    cg: (c, b) => (v, t) => (c < b(v, t) ? 1 : 0),
    gc: (a, c) => (v, t) => (a(v, t) < c ? 1 : 0),
    gg: (a, b) => (v, t) => (a(v, t) < b(v, t) ? 1 : 0),
  },
  '<=': {
    ss: (i, j) => (v) => (v[i] <= v[j] ? 1 : 0),
    sc: (i, c) => (v) => (v[i] <= c ? 1 : 0),
    cs: (c, j) => (v) => (c <= v[j] ? 1 : 0),
    sg: (i, b) => (v, t) => (v[i] <= b(v, t) ? 1 : 0),
    gs: (a, j) => (v, t) => (a(v, t) <= v[j] ? 1 : 0),
    cg: (c, b) => (v, t) => (c <= b(v, t) ? 1 : 0),
    gc: (a, c) => (v, t) => (a(v, t) <= c ? 1 : 0),
    gg: (a, b) => (v, t) => (a(v, t) <= b(v, t) ? 1 : 0),
  },
  '>': {
    ss: (i, j) => (v) => (v[i] > v[j] ? 1 : 0),
    sc: (i, c) => (v) => (v[i] > c ? 1 : 0),
    cs: (c, j) => (v) => (c > v[j] ? 1 : 0),
    sg: (i, b) => (v, t) => (v[i] > b(v, t) ? 1 : 0),
    gs: (a, j) => (v, t) => (a(v, t) > v[j] ? 1 : 0),
    cg: (c, b) => (v, t) => (c > b(v, t) ? 1 : 0),
    gc: (a, c) => (v, t) => (a(v, t) > c ? 1 : 0),
    gg: (a, b) => (v, t) => (a(v, t) > b(v, t) ? 1 : 0),
  },
  '>=': {
    ss: (i, j) => (v) => (v[i] >= v[j] ? 1 : 0),
    sc: (i, c) => (v) => (v[i] >= c ? 1 : 0),
    cs: (c, j) => (v) => (c >= v[j] ? 1 : 0),
    sg: (i, b) => (v, t) => (v[i] >= b(v, t) ? 1 : 0),
    gs: (a, j) => (v, t) => (a(v, t) >= v[j] ? 1 : 0),
    cg: (c, b) => (v, t) => (c >= b(v, t) ? 1 : 0),
    gc: (a, c) => (v, t) => (a(v, t) >= c ? 1 : 0),
    gg: (a, b) => (v, t) => (a(v, t) >= b(v, t) ? 1 : 0),
  },
};

/** Closure for a binary operation (constant operands on both sides are folded before this is called). */
function binClosure(op: BinOp, A: E, B: E): Fn {
  const a = A.f;
  const b = B.f;
  const m = FAST[op];
  if (m) {
    const { slot: i, c: ca } = A;
    const { slot: j, c: cb } = B;
    if (i !== undefined) return j !== undefined ? m.ss(i, j) : cb !== undefined ? m.sc(i, cb) : m.sg(i, b);
    if (ca !== undefined) return j !== undefined ? m.cs(ca, j) : m.cg(ca, b);
    return j !== undefined ? m.gs(a, j) : cb !== undefined ? m.gc(a, cb) : m.gg(a, b);
  }
  switch (op) {
    case '^':
      return (v, t) => a(v, t) ** b(v, t);
    case 'mod':
      return (v, t) => fmod(a(v, t), b(v, t));
    case '=':
      return (v, t) => (a(v, t) === b(v, t) ? 1 : 0);
    case '<>':
      return (v, t) => (a(v, t) !== b(v, t) ? 1 : 0);
    case 'and':
      return (v, t) => (a(v, t) !== 0 && b(v, t) !== 0 ? 1 : 0);
    default: // 'or' (the other operators are in FAST)
      return (v, t) => (a(v, t) !== 0 || b(v, t) !== 0 ? 1 : 0);
  }
}

/** One closure per math function, so V8 can inline the Math call. */
function mathClosure(fn: string, a: Fn): Fn {
  switch (fn) {
    case 'ABS':
      return (v, t) => Math.abs(a(v, t));
    case 'EXP':
      return (v, t) => Math.exp(a(v, t));
    case 'LN':
      return (v, t) => Math.log(a(v, t));
    case 'LOG10':
      return (v, t) => Math.log10(a(v, t));
    case 'SQRT':
      return (v, t) => Math.sqrt(a(v, t));
    case 'INT':
      return (v, t) => Math.floor(a(v, t));
    case 'SIN':
      return (v, t) => Math.sin(a(v, t));
    case 'COS':
      return (v, t) => Math.cos(a(v, t));
    case 'TAN':
      return (v, t) => Math.tan(a(v, t));
    case 'ARCSIN':
      return (v, t) => Math.asin(a(v, t));
    case 'ARCCOS':
      return (v, t) => Math.acos(a(v, t));
    default: // ARCTAN
      return (v, t) => Math.atan(a(v, t));
  }
}

const QUANTIFIED = new Set(['stock', 'flow', 'aux', 'constant']);

/** The equations to compile: the model's, with a scenario's equation overrides applied. */
function equationsOf(model: Model, scenario?: Scenario): Map<Id, string> {
  const eqs = new Map(model.variables.map((v) => [v.id, v.equation]));
  for (const o of scenario?.overrides ?? []) eqs.set(o.varId, o.equation);
  return eqs;
}

export function compileProgram(model: Model, scenario?: Scenario): { program?: Program; errors: HealthItem[] } {
  const errors: HealthItem[] = [];
  const err = (check: HealthItem['check'], elementIds: Id[], message: string, detail?: unknown) =>
    errors.push({ check, severity: 'error', message, elementIds, ...(detail !== undefined ? { detail } : {}) });

  const env: Env = { dt: model.simSpec.dt, start: model.simSpec.start, stop: model.simSpec.stop };
  const equations = equationsOf(model, scenario);
  const byName = new Map<string, Variable>(model.variables.map((v) => [canonicalName(v.name), v]));

  // ── slots ──
  const index: Record<Id, number> = {};
  const slotName: string[] = [];
  let size = 0;
  for (const v of model.variables) {
    if (v.kind === 'variable')
      err('unquantified', [v.id], `"${v.name}" is not quantified yet: make it a stock, flow, auxiliary, constant or lookup`);
    if (!QUANTIFIED.has(v.kind)) continue;
    index[v.id] = size;
    slotName[size++] = v.name;
  }
  const newSlot = (label: string) => {
    slotName[size] = label;
    return size++;
  };

  // ── parse ──
  const asts = new Map<Id, Ast>();
  for (const v of model.variables) {
    if (!QUANTIFIED.has(v.kind)) continue;
    const src = equations.get(v.id) ?? '';
    if (src.trim() === '') {
      err('parse', [v.id], v.kind === 'stock' ? `Stock "${v.name}" needs an initial value` : `"${v.name}" has no equation`);
      continue;
    }
    const r = parseEquation(src);
    if (r.ok) asts.set(v.id, r.ast);
    else err('parse', [v.id], `Equation of "${v.name}": ${r.error.message}`, { span: r.error.span, equation: src });
  }

  // ── nodes collected while compiling ──
  const initFn = new Map<number, { fn: Fn; deps: Set<number>; varId?: Id; after?: InitStep['after'] }>();
  const auxDeps = new Map<number, Set<number>>(); // user aux/flow slot → slots read (TIME_DEP for time)
  const auxFn = new Map<number, Fn>();
  const frozen = new Set<number>(); // INIT slots: constant after initialisation
  const hiddenStocks: { slot: number; deriv: Fn }[] = [];
  const discretes: Discrete[] = [];

  /** the variable (or assertion) being compiled, for error messages */
  let owner: { id: Id; name: string } = { id: model.id, name: model.name };
  const ownerErr = (check: HealthItem['check'], message: string, span?: unknown) =>
    err(check, [owner.id], `"${owner.name}": ${message}`, span !== undefined ? { span } : undefined);

  const readSlot = (slot: number): E => ({ f: (v) => v[slot], slot });

  /** Compile an expression; every slot it reads (and TIME_DEP) is added to `deps`. */
  function expr(n: Ast, deps: Set<number>): E {
    switch (n.k) {
      case 'num':
        return K(n.v);
      case 'ref': {
        const target = byName.get(n.name);
        if (!target) {
          ownerErr('undefined', `uses "${n.raw}", which is not a variable in this model`, n.span);
          return K(NaN);
        }
        if (target.kind === 'lookup') {
          ownerErr('undefined', `"${target.name}" is a graphical function: call it as ${n.raw}(x)`, n.span);
          return K(NaN);
        }
        if (target.kind === 'variable') return K(NaN); // reported as unquantified
        const slot = index[target.id];
        deps.add(slot);
        return readSlot(slot);
      }
      case 'un': {
        const A = expr(n.a, deps);
        if (A.c !== undefined) return K(n.op === '-' ? -A.c : n.op === 'not' ? (A.c === 0 ? 1 : 0) : A.c);
        const a = A.f;
        if (n.op === '-') return { f: (v, t) => -a(v, t) };
        if (n.op === 'not') return { f: (v, t) => (a(v, t) === 0 ? 1 : 0) };
        return A;
      }
      case 'bin': {
        const A = expr(n.a, deps);
        const B = expr(n.b, deps);
        if (A.c !== undefined && B.c !== undefined) return K(binValue(n.op, A.c, B.c));
        return { f: binClosure(n.op, A, B) };
      }
      case 'if': {
        const C = expr(n.c, deps);
        const T = expr(n.t, deps);
        const F = expr(n.e, deps);
        if (C.c !== undefined) return C.c !== 0 ? T : F;
        const c = C.f;
        const a = T.f;
        const b = F.f;
        return { f: (v, t) => (c(v, t) !== 0 ? a(v, t) : b(v, t)) };
      }
      case 'call':
        return call(n, deps);
    }
  }

  /** A constant integer argument (the n of SMTHN/DELAYN). */
  function constInt(n: Ast, what: string, span: unknown): number {
    const c = constantValue(n);
    if (c === null || !Number.isInteger(c) || c < 1 || c > 1000) {
      ownerErr('parse', `${what} must be a constant whole number from 1 to 1000`, span);
      return 1;
    }
    return c;
  }

  function call(n: Extract<Ast, { k: 'call' }>, deps: Set<number>): E {
    const fn = n.fn;
    const args = n.args;
    const math = MATH1[fn];
    if (math) {
      const A = expr(args[0], deps);
      return A.c !== undefined ? K(math(A.c)) : { f: mathClosure(fn, A.f) };
    }
    switch (fn) {
      case 'MIN':
      case 'MAX': {
        const A = expr(args[0], deps);
        const B = expr(args[1], deps);
        const m = fn === 'MIN' ? Math.min : Math.max;
        if (A.c !== undefined && B.c !== undefined) return K(m(A.c, B.c));
        const a = A.f;
        const b = B.f;
        return { f: (v, t) => m(a(v, t), b(v, t)) };
      }
      case 'SAFEDIV': {
        const A = expr(args[0], deps);
        const B = expr(args[1], deps);
        const X = args[2] ? expr(args[2], deps) : K(0);
        const a = A.f;
        const b = B.f;
        const x = X.f;
        return {
          f: (v, t) => {
            const d = b(v, t);
            return d === 0 ? x(v, t) : a(v, t) / d;
          },
        };
      }
      case 'PI':
        return K(Math.PI);
      case 'INF':
        return K(Infinity);
      case 'TIME':
        deps.add(TIME_DEP);
        return { f: (_v, t) => t };
      case 'DT':
        return { f: () => env.dt };
      case 'STARTTIME':
        return { f: () => env.start };
      case 'STOPTIME':
        return { f: () => env.stop };
      case 'STEP': {
        deps.add(TIME_DEP);
        const h = expr(args[0], deps).f;
        const t0 = expr(args[1], deps).f;
        return { f: (v, t) => (t + env.dt / 2 > t0(v, t) ? h(v, t) : 0) };
      }
      case 'PULSE': {
        deps.add(TIME_DEP);
        const vol = expr(args[0], deps).f;
        const first = expr(args[1], deps).f;
        const interval = args[2] ? expr(args[2], deps).f : null;
        return {
          f: (v, t) => {
            const dt = env.dt;
            const eps = 1e-9 * dt;
            const f0 = first(v, t);
            if (t < f0 - eps) return 0;
            const iv = interval ? interval(v, t) : 0;
            const s = iv > 0 ? f0 + Math.floor((t - f0 + eps) / iv) * iv : f0;
            return t < s + dt - eps ? vol(v, t) / dt : 0;
          },
        };
      }
      case 'RAMP': {
        deps.add(TIME_DEP);
        const slope = expr(args[0], deps).f;
        const start = expr(args[1], deps).f;
        const end = args[2] ? expr(args[2], deps).f : null;
        return {
          f: (v, t) => {
            const s = start(v, t);
            if (t <= s) return 0;
            const e = end ? Math.max(end(v, t), s) : Infinity;
            return slope(v, t) * (Math.min(t, e) - s);
          },
        };
      }
      case 'LOOKUP': {
        const ref = args[0];
        const table = ref.k === 'ref' ? byName.get(ref.name) : undefined;
        if (!table) {
          const raw = ref.k === 'ref' ? ref.raw : '?';
          ownerErr('undefined', `unknown function or graphical function "${raw}"`, n.span);
          return K(NaN);
        }
        if (!table.graph) {
          ownerErr('undefined', `"${table.name}" is not a graphical function (it has no table)`, n.span);
          return K(NaN);
        }
        const g = makeGraphical(table.graph);
        const X = expr(args[1], deps);
        if (X.c !== undefined) return K(g(X.c));
        const x = X.f;
        return { f: (v, t) => g(x(v, t)) };
      }
      case 'SMTH1':
      case 'SMOOTH':
        return smooth(n, 1, 2, deps);
      case 'SMTH3':
      case 'SMOOTH3':
        return smooth(n, 3, 2, deps);
      case 'SMTHN':
        return smooth(n, constInt(args[2], 'The order n of SMTHN', n.span), 3, deps);
      case 'DELAY1':
        return materialDelay(n, 1, 2, deps);
      case 'DELAY3':
        return materialDelay(n, 3, 2, deps);
      case 'DELAYN':
        return materialDelay(n, constInt(args[2], 'The order n of DELAYN', n.span), 3, deps);
      case 'DELAY':
        return pipelineDelay(n, deps);
      case 'PREVIOUS':
        return previous(n, deps);
      case 'INIT': {
        const d = new Set<number>();
        const X = expr(args[0], d);
        const slot = newSlot(`INIT in ${owner.name}`);
        initFn.set(slot, { fn: X.f, deps: d });
        frozen.add(slot);
        deps.add(slot);
        return readSlot(slot);
      }
      default:
        ownerErr('undefined', `unsupported function ${fn}`, n.span);
        return K(NaN);
    }
  }

  /** SMTH1/SMTH3/SMTHN: n stages of τ/n; all stages start at `initial` (default: the input at STARTTIME). */
  function smooth(n: Extract<Ast, { k: 'call' }>, order: number, initIdx: number, deps: Set<number>): E {
    const dIn = new Set<number>();
    const input = expr(n.args[0], dIn).f;
    const tau = expr(n.args[1], new Set<number>()).f;
    const dInit = new Set<number>();
    const init = n.args[initIdx] ? expr(n.args[initIdx], dInit).f : input;
    const initDeps = n.args[initIdx] ? dInit : dIn;
    let prev: Fn = input;
    let slot = -1;
    for (let k = 0; k < order; k++) {
      slot = newSlot(`${n.fn} stage ${k + 1} in ${owner.name}`);
      const s = slot;
      const upstream = prev;
      hiddenStocks.push({ slot: s, deriv: (v, t) => ((upstream(v, t) - v[s]) * order) / tau(v, t) });
      initFn.set(s, { fn: init, deps: initDeps });
      prev = (v) => v[s];
    }
    deps.add(slot);
    return readSlot(slot);
  }

  /**
   * DELAY1/DELAY3/DELAYN: n stages holding τ/n each; stage k outflow = Sₖ·n/τ; output = last outflow.
   * Stages start at initial·τ/n (initial = the initial output; default: the input at STARTTIME).
   */
  function materialDelay(n: Extract<Ast, { k: 'call' }>, order: number, initIdx: number, deps: Set<number>): E {
    const dIn = new Set<number>();
    const input = expr(n.args[0], dIn).f;
    const dTau = new Set<number>();
    const tau = expr(n.args[1], dTau).f;
    const dInit = new Set<number>(dTau);
    const init = n.args[initIdx] ? expr(n.args[initIdx], dInit).f : input;
    if (!n.args[initIdx]) for (const d of dIn) dInit.add(d);
    const slots: number[] = [];
    for (let k = 0; k < order; k++) slots.push(newSlot(`${n.fn} stage ${k + 1} in ${owner.name}`));
    const out = (s: number): Fn => (v, t) => (v[s] * order) / tau(v, t);
    for (let k = 0; k < order; k++) {
      const outK = out(slots[k]);
      const upstream = k === 0 ? input : out(slots[k - 1]);
      hiddenStocks.push({ slot: slots[k], deriv: (v, t) => upstream(v, t) - outK(v, t) });
      initFn.set(slots[k], { fn: (v, t) => (init(v, t) * tau(v, t)) / order, deps: dInit });
    }
    for (const d of dTau) deps.add(d); // the output S/τ reads τ now
    for (const s of slots) deps.add(s);
    return { f: out(slots[order - 1]) };
  }

  /** DELAY (fixed pipeline): input from τ ago; τ is evaluated once at STARTTIME and must be a multiple of DT. */
  function pipelineDelay(n: Extract<Ast, { k: 'call' }>, deps: Set<number>): E {
    const dIn = new Set<number>();
    const input = expr(n.args[0], dIn).f;
    const dInit = new Set<number>();
    const tau = expr(n.args[1], dInit).f;
    const init = n.args[2] ? expr(n.args[2], dInit).f : input;
    if (!n.args[2]) for (const d of dIn) dInit.add(d);
    const slot = newSlot(`DELAY in ${owner.name}`);
    const who = owner;
    const pipe = { buf: new Float64Array(1), head: 0 };
    initFn.set(slot, {
      fn: init,
      deps: dInit,
      after: (v, t) => {
        const ratio = tau(v, t) / env.dt;
        const m = Math.round(ratio);
        if (!(m >= 1) || Math.abs(ratio - m) > 1e-9 * Math.max(1, m))
          throw new SimulationError({
            check: 'numeric',
            severity: 'error',
            message: `"${who.name}": the DELAY time must be a positive multiple of DT (got ${tau(v, t)} with DT = ${env.dt})`,
            elementIds: [who.id],
          });
        pipe.buf = new Float64Array(m).fill(v[slot]);
        pipe.head = 0;
      },
    });
    discretes.push({
      slot,
      sample: input,
      apply: (v, x) => {
        const b = pipe.buf;
        b[pipe.head] = x;
        pipe.head = (pipe.head + 1) % b.length;
        v[slot] = b[pipe.head];
      },
    });
    deps.add(slot);
    return readSlot(slot);
  }

  /** PREVIOUS(x[, initial]): x one DT ago; `initial` (default 0) during the first step. */
  function previous(n: Extract<Ast, { k: 'call' }>, deps: Set<number>): E {
    const input = expr(n.args[0], new Set<number>()).f;
    const dInit = new Set<number>();
    const init = n.args[1] ? expr(n.args[1], dInit).f : () => 0;
    const slot = newSlot(`PREVIOUS in ${owner.name}`);
    initFn.set(slot, { fn: init, deps: dInit });
    discretes.push({ slot, sample: input, apply: (v, x) => (v[slot] = x) });
    deps.add(slot);
    return readSlot(slot);
  }

  // ── compile every quantified variable ──
  const valueFns = new Map<Id, Fn>();
  for (const v of model.variables) {
    const ast = asts.get(v.id);
    if (!ast) continue;
    owner = v;
    const slot = index[v.id];
    const deps = new Set<number>();
    const e = expr(ast, deps);
    if (v.kind === 'stock') {
      initFn.set(slot, { fn: e.f, deps, varId: v.id });
      continue;
    }
    let f = e.f;
    let isConst = e.c !== undefined;
    if (v.graph) {
      const g = makeGraphical(v.graph);
      const inner = f;
      const c = isConst ? g(e.c ?? NaN) : NaN;
      f = isConst ? () => c : (vv, t) => g(inner(vv, t));
    }
    if (v.kind === 'flow' && v.nonNegative) {
      const inner = f;
      f = (vv, t) => {
        const x = inner(vv, t);
        return x < 0 ? 0 : x;
      };
      isConst = false;
    }
    if (isConst) deps.clear();
    valueFns.set(v.id, f);
    auxFn.set(slot, f);
    auxDeps.set(slot, deps);
    initFn.set(slot, { fn: f, deps, varId: v.id });
  }

  // ── assertions (compiled leniently: a broken assertion never blocks a run) ──
  const assertions: Program['assertions'] = [];
  const assertionErrors: HealthItem[] = [];
  for (const a of model.assertions) {
    if (!a.enabled) continue;
    const r = parseEquation(a.expr);
    if (!r.ok) {
      assertionErrors.push({
        check: 'assertion',
        severity: 'error',
        message: `Assertion "${a.expr}": ${r.error.message}`,
        elementIds: [a.id],
        detail: { span: r.error.span },
      });
      continue;
    }
    const before = errors.length;
    owner = { id: a.id, name: `assertion ${a.expr}` };
    const e = expr(r.ast, new Set<number>());
    const extra = errors.splice(before);
    if (extra.length) assertionErrors.push(...extra.map((x) => ({ ...x, check: 'assertion' as const })));
    else assertions.push({ id: a.id, expr: a.expr, fn: e.f });
  }

  // ── evaluation order of time-varying auxes/flows (algebraic loops) ──
  const auxSlots = [...auxDeps.keys()];
  const dynOrder = topoSort(auxSlots, (s) => [...(auxDeps.get(s) ?? [])].filter((d) => auxDeps.has(d)));
  for (const cycle of dynOrder.cycles)
    err(
      'algebraic-loop',
      cycle.map((s) => model.variables.find((x) => index[x.id] === s)?.id ?? '').filter(Boolean),
      `Algebraic loop (a cycle with no stock or delay): ${cycle.map((s) => slotName[s]).join(' → ')} → ${slotName[cycle[0]]}`,
      { cycle: cycle.map((s) => slotName[s]) },
    );

  // ── initialisation order over every slot ──
  const allSlots = [...initFn.keys()].sort((a, b) => a - b);
  const initOrder = topoSort(allSlots, (s) => [...(initFn.get(s)?.deps ?? [])].filter((d) => initFn.has(d)));
  if (dynOrder.cycles.length === 0)
    for (const cycle of initOrder.cycles) {
      const ids = [...new Set(cycle.map((s) => model.variables.find((x) => index[x.id] === s)?.id).filter((x) => x !== undefined))];
      err(
        'algebraic-loop',
        ids,
        `Initialisation cycle: ${cycle.map((s) => slotName[s]).join(' → ')} → ${slotName[cycle[0]]} (give a stock or delay an explicit initial value)`,
        { cycle: cycle.map((s) => slotName[s]), initialisation: true },
      );
    }

  if (errors.length > 0) return { errors };

  // ── static auxes (no TIME, no state upstream) are evaluated once per run, in the initialisation pass ──
  const isStatic = new Set<number>(frozen);
  for (const s of dynOrder.order) {
    const d = auxDeps.get(s) ?? new Set<number>();
    if ([...d].every((x) => x !== TIME_DEP && isStatic.has(x))) isStatic.add(s);
  }
  const dyn = dynOrder.order.filter((s) => !isStatic.has(s));
  const idOfSlot = new Map<number, Id>(Object.entries(index).map(([id, s]) => [s, id]));

  // ── stocks ──
  const stocks = model.variables.filter((v) => v.kind === 'stock');
  const flows = model.variables.filter((v) => v.kind === 'flow' && v.flow);
  const flowsById = [...flows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const flowStart = new Int32Array(stocks.length + 1);
  const flowSlot: number[] = [];
  const flowSign: number[] = [];
  const nonNeg: NonNegStock[] = [];
  stocks.forEach((s, k) => {
    for (const f of flowsById) {
      const sign = f.flow?.to === s.id ? 1 : f.flow?.from === s.id ? -1 : 0;
      if (sign === 0) continue;
      flowSlot.push(index[f.id]);
      flowSign.push(sign);
    }
    flowStart[k + 1] = flowSlot.length;
    if (s.nonNegative)
      nonNeg.push({
        slot: index[s.id],
        inflows: Int32Array.from(flows.filter((f) => f.flow?.to === s.id).map((f) => index[f.id])),
        outflows: Int32Array.from(flows.filter((f) => f.flow?.from === s.id).map((f) => index[f.id])),
      });
  });

  const deps: Record<Id, Id[]> = {};
  for (const v of model.variables) {
    if (index[v.id] === undefined) continue;
    if (v.kind === 'stock') deps[v.id] = flows.filter((f) => f.flow?.to === v.id || f.flow?.from === v.id).map((f) => f.id);
    else {
      const ast = asts.get(v.id);
      // value-bearing variables only (graphical-function tables have no slot)
      deps[v.id] = ast
        ? referencedNames(ast)
            .map((name) => byName.get(name)?.id)
            .filter((x): x is Id => x !== undefined && index[x] !== undefined)
        : [];
    }
  }

  const userVarIds = [
    ...stocks.map((s) => s.id),
    ...initOrder.order.map((s) => idOfSlot.get(s)).filter((id): id is Id => id !== undefined && !stocks.some((s) => s.id === id)),
  ];

  const program: Program = {
    size,
    env,
    index,
    varIds: userVarIds,
    deps,
    initSteps: initOrder.order.map((s) => {
      const node = initFn.get(s);
      if (!node) throw new Error(`internal: no initial value for slot ${s}`);
      return { slot: s, fn: node.fn, ...(node.varId ? { varId: node.varId } : {}), ...(node.after ? { after: node.after } : {}) };
    }),
    dynSlots: Int32Array.from(dyn),
    dynFns: dyn.map((s) => auxFn.get(s) ?? (() => NaN)),
    dynIds: dyn.map((s) => idOfSlot.get(s) ?? ''),
    stockSlots: Int32Array.from([...stocks.map((s) => index[s.id]), ...hiddenStocks.map((h) => h.slot)]),
    userStockCount: stocks.length,
    flowStart,
    flowSlot: Int32Array.from(flowSlot),
    flowSign: Float64Array.from(flowSign),
    hiddenDerivs: hiddenStocks.map((h) => h.deriv),
    nonNeg,
    discretes,
    valueFns,
    stockIds: new Set(stocks.map((s) => s.id)),
    assertions,
    assertionErrors,
  };
  return { program, errors: [] };
}

/** Builtins that are stateful (for health checks and docs). */
export const STATEFUL = new Set(Object.entries(BUILTINS).filter(([, b]) => b.stateful).map(([k]) => k));

/**
 * Kahn's algorithm, deterministic (ties broken by input order). Returns the order of the acyclic part and,
 * for the rest, the distinct cycles found by following inputs backwards.
 */
export function topoSort(nodes: number[], inputs: (n: number) => number[]): { order: number[]; cycles: number[][] } {
  const pos = new Map(nodes.map((n, i) => [n, i]));
  const indeg = new Int32Array(nodes.length);
  const users: number[][] = nodes.map(() => []);
  nodes.forEach((n, i) => {
    for (const d of inputs(n)) {
      const j = pos.get(d);
      if (j === undefined) continue;
      indeg[i]++;
      users[j].push(i);
    }
  });
  const queue: number[] = [];
  indeg.forEach((d, i) => d === 0 && queue.push(i));
  const order: number[] = [];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    order.push(nodes[i]);
    for (const u of users[i]) if (--indeg[u] === 0) queue.push(u);
  }
  const cycles: number[][] = [];
  if (order.length === nodes.length) return { order, cycles };

  const remaining = new Set(nodes.filter((_, i) => indeg[i] > 0));
  const seen = new Set<number>();
  for (const start of remaining) {
    if (seen.has(start) || cycles.length >= 10) continue;
    const path: number[] = [];
    const onPath = new Map<number, number>();
    let n: number | undefined = start;
    while (n !== undefined && !onPath.has(n) && !seen.has(n)) {
      onPath.set(n, path.length);
      path.push(n);
      n = inputs(n).find((d) => remaining.has(d));
    }
    if (n !== undefined && onPath.has(n)) cycles.push(path.slice(onPath.get(n)).reverse());
    for (const p of path) seen.add(p);
  }
  return { order, cycles };
}
