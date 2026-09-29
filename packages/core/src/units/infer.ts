/**
 * Equation-level unit checking (SPEC §6.2). All findings are Model Health warnings (units are advisory:
 * a model with unit issues still simulates). Checked: operands of + − MOD, comparisons, MIN/MAX and IF
 * branches agree; function arguments (EXP/LN/trig dimensionless, smoothing/delay times are times);
 * each equation matches its declared units; and every flow is in its stock's units per model time unit.
 *
 * Numeric literals adapt: in + − and comparisons they take the other operand's units; in * and / they are
 * dimensionless with an unknown scale (a literal may be a conversion factor), so only dimensions are compared.
 */
import type { Ast, Dim, HealthItem } from '../contracts.ts';
import { constantValue } from '../parser/constant.ts';
import { parseEquation } from '../parser/parse.ts';
import type { Id, Model, Variable } from '../schema/model.ts';
import { canonicalName } from '../schema/names.ts';
import {
  divDim,
  formatDim,
  isDimensionless,
  isTime,
  mulDim,
  parseUnit,
  powDim,
  sameDims,
  sameUnit,
} from './dim.ts';

/** null = unknown (no checks); WILD = a bare number that adapts to its context. */
type U = Dim | null | typeof WILD;
const WILD = 'wild' as const;

const known = (u: U): u is Dim => u !== null && u !== WILD;
const scaleKnown = (d: Dim) => !Number.isNaN(d.scale);
const asDim = (u: U): Dim | null => (u === WILD ? { scale: NaN, dims: {} } : u);

const DIMENSIONLESS_ARG = new Set(['EXP', 'LN', 'LOG10', 'SIN', 'COS', 'TAN', 'ARCSIN', 'ARCCOS', 'ARCTAN']);
const SMOOTHS = new Set(['SMTH1', 'SMOOTH', 'SMTH3', 'SMOOTH3', 'SMTHN', 'DELAY1', 'DELAY3', 'DELAYN', 'DELAY']);

export function inferUnits(model: Model): { byVar: Record<Id, Dim | null>; issues: HealthItem[] } {
  const issues: HealthItem[] = [];
  const timeUnit = model.simSpec.timeUnit;
  const warn = (elementIds: Id[], message: string, detail?: unknown) =>
    issues.push({ check: 'units', severity: 'warning', message, elementIds, ...(detail ? { detail } : {}) });
  const fmt = (d: Dim) => formatDim(d, timeUnit);

  const timeParsed = parseUnit(timeUnit, model.units);
  const timeDim: Dim | null = timeParsed.ok && isTime(timeParsed.dim) ? timeParsed.dim : null;
  if (!timeDim) warn([], `The model time unit "${timeUnit}" is not a time unit (use e.g. day, week, month, year)`);

  const byName = new Map<string, Variable>(model.variables.map((v) => [canonicalName(v.name), v]));
  const declared = new Map<Id, Dim | null>();
  for (const v of model.variables) {
    if (v.units.trim() === '') {
      declared.set(v.id, null);
      continue;
    }
    const r = parseUnit(v.units, model.units);
    if (r.ok) declared.set(v.id, r.dim);
    else {
      declared.set(v.id, null);
      warn([v.id], `Cannot read the units of "${v.name}": ${r.message}`);
    }
  }
  const asts = new Map<Id, Ast | null>();
  for (const v of model.variables) {
    const r = v.kind === 'lookup' || v.equation.trim() === '' ? null : parseEquation(v.equation);
    asts.set(v.id, r?.ok ? r.ast : null);
  }
  const flowsOf = (stockId: Id) =>
    model.variables.filter((f) => f.kind === 'flow' && f.flow && (f.flow.to === stockId || f.flow.from === stockId));

  // ── inference (memoised; undeclared variables get the units their equation implies) ──
  const memo = new Map<Id, U>();
  const visiting = new Set<Id>();
  const unitOfVar = (v: Variable): U => {
    const d = declared.get(v.id);
    if (d) return d;
    if (memo.has(v.id)) return memo.get(v.id) ?? null;
    if (visiting.has(v.id)) return null;
    visiting.add(v.id);
    let u: U = null;
    if (v.kind === 'stock') {
      for (const f of flowsOf(v.id)) {
        const fu = unitOfVar(f);
        if (known(fu) && timeDim) {
          u = mulDim(fu, timeDim);
          break;
        }
      }
      if (u === null) u = inferQuiet(asts.get(v.id) ?? null);
    } else if (v.kind !== 'lookup' && !v.graph) u = inferQuiet(asts.get(v.id) ?? null);
    visiting.delete(v.id);
    memo.set(v.id, u);
    return u;
  };
  const inferQuiet = (ast: Ast | null): U => (ast ? infer(ast, null) : null);

  /** `owner` set = report operand/argument issues for this variable. */
  function infer(n: Ast, owner: Variable | null): U {
    const report = (message: string) => owner && warn([owner.id], `${owner.name}: ${message}`);
    const agree = (a: U, b: U, what: string): U => {
      if (a === WILD) return b;
      if (b === WILD || a === null || b === null) return a ?? b;
      if (!sameDims(a, b)) report(`${what} ${fmt(a)} and ${fmt(b)}`);
      else if (scaleKnown(a) && scaleKnown(b) && !sameUnit(a, b))
        report(`${what} ${fmt(a)} and ${fmt(b)} (same dimension, different scale: convert first)`);
      return scaleKnown(a) ? a : b;
    };
    const dimensionlessResult: Dim = { scale: 1, dims: {} };

    switch (n.k) {
      case 'num':
        return WILD;
      case 'ref': {
        const v = byName.get(n.name);
        return v ? unitOfVar(v) : null;
      }
      case 'un': {
        const a = infer(n.a, owner);
        return n.op === 'not' ? dimensionlessResult : a;
      }
      case 'if': {
        infer(n.c, owner);
        return agree(infer(n.t, owner), infer(n.e, owner), 'IF branches have different units:');
      }
      case 'bin': {
        const a = infer(n.a, owner);
        const b = infer(n.b, owner);
        switch (n.op) {
          case '+':
          case '-':
            return agree(a, b, `cannot ${n.op === '+' ? 'add' : 'subtract'}`);
          case 'mod':
            return agree(a, b, 'MOD of');
          case '*':
          case '/': {
            if (a === WILD && b === WILD) return WILD;
            const da = asDim(a);
            const db = asDim(b);
            if (!da || !db) return null;
            return n.op === '*' ? mulDim(da, db) : divDim(da, db);
          }
          case '^':
            return power(a, n.b, report);
          case 'and':
          case 'or':
            return dimensionlessResult;
          default:
            agree(a, b, 'comparing');
            return dimensionlessResult;
        }
      }
      case 'call':
        return call(n.fn, n.args, owner, report, agree);
    }
  }

  function power(base: U, exp: Ast, report: (m: string) => void): U {
    const e = constantValue(exp);
    if (base === WILD) return WILD;
    if (base === null) return null;
    if (e !== null && Number.isInteger(e)) return powDim(base, e);
    if (isDimensionless(base)) return { scale: NaN, dims: {} };
    report(`raising ${fmt(base)} to a non-integer or variable power`);
    return null;
  }

  function call(
    fn: string,
    args: Ast[],
    owner: Variable | null,
    report: (m: string) => void,
    agree: (a: U, b: U, what: string) => U,
  ): U {
    if (fn === 'LOOKUP') {
      if (args[1]) infer(args[1], owner);
      const table = args[0]?.k === 'ref' ? byName.get(args[0].name) : undefined;
      return table ? (declared.get(table.id) ?? null) : null;
    }
    const u = args.map((a) => infer(a, owner));
    const time = timeDim;
    if (SMOOTHS.has(fn)) {
      const tau = u[1];
      if (known(tau) && !isTime(tau)) report(`the ${fn} delay/averaging time is ${fmt(tau)}, not a time`);
      const init = fn === 'SMTHN' || fn === 'DELAYN' ? u[3] : u[2];
      return init === undefined ? u[0] : agree(u[0], init, `${fn} input and initial value have different units:`);
    }
    switch (fn) {
      case 'MIN':
      case 'MAX':
        return agree(u[0], u[1], `${fn} of`);
      case 'ABS':
      case 'INT':
      case 'INIT':
        return u[0];
      case 'PREVIOUS':
        return u[1] === undefined ? u[0] : agree(u[0], u[1], 'PREVIOUS value and initial value have different units:');
      case 'SQRT': {
        const a = u[0];
        if (!known(a)) return a;
        if (Object.values(a.dims).every((e) => e % 2 === 0)) return powDim(a, 0.5);
        report(`SQRT of ${fmt(a)} has no whole-power units`);
        return null;
      }
      case 'STEP':
        return u[0];
      case 'PULSE': {
        const a = u[0];
        return known(a) && time ? divDim(a, time) : a === WILD ? WILD : null;
      }
      case 'RAMP': {
        const a = u[0];
        return known(a) && time ? mulDim(a, time) : a === WILD ? WILD : null;
      }
      case 'SAFEDIV': {
        const a = asDim(u[0]);
        const b = asDim(u[1]);
        if (u[0] === WILD && u[1] === WILD) return WILD;
        const q = a && b ? divDim(a, b) : null;
        return u[2] === undefined ? q : agree(q, u[2], 'SAFEDIV result and fallback have different units:');
      }
      case 'PI':
      case 'INF':
        return WILD;
      case 'TIME':
      case 'DT':
      case 'STARTTIME':
      case 'STOPTIME':
        return time;
      default:
        if (DIMENSIONLESS_ARG.has(fn)) {
          const a = u[0];
          if (known(a) && !isDimensionless(a)) report(`${fn} needs a dimensionless argument, got ${fmt(a)}`);
          return { scale: 1, dims: {} };
        }
        return null;
    }
  }

  // ── checks ────────────────────────────────────────────────────────────────
  const compare = (v: Variable, got: U, what: string) => {
    const want = declared.get(v.id);
    if (!want || !known(got)) return;
    if (!sameDims(want, got))
      warn([v.id], `${v.name}: ${what} gives ${fmt(got)} but the declared units are ${v.units}`, {
        declared: v.units,
        inferred: fmt(got),
      });
    else if (scaleKnown(got) && !sameUnit(want, got))
      warn([v.id], `${v.name}: ${what} gives ${fmt(got)}, which differs from ${v.units} by a factor of ${Number((got.scale / want.scale).toPrecision(4))}`, {
        declared: v.units,
        inferred: fmt(got),
      });
  };

  for (const v of model.variables) {
    const ast = asts.get(v.id) ?? null;
    if (ast) {
      const got = infer(ast, v);
      if (v.kind === 'stock') compare(v, got, 'the initial value');
      else if (!v.graph) compare(v, got, 'the equation');
    }
    if (v.kind === 'stock' && timeDim) {
      const s = declared.get(v.id);
      if (!s) continue;
      const want = divDim(s, timeDim);
      for (const f of flowsOf(v.id)) {
        const fu = declared.get(f.id);
        if (!fu) continue;
        if (!sameDims(fu, want))
          warn([f.id, v.id], `Flow "${f.name}" (${f.units}) does not match stock "${v.name}" (${v.units}) per ${timeUnit}`);
        else if (!sameUnit(fu, want))
          warn(
            [f.id, v.id],
            `Flow "${f.name}" is in ${f.units} but stock "${v.name}" changes per ${timeUnit}: convert by a factor of ${Number((want.scale / fu.scale).toPrecision(4))}`,
          );
      }
    }
  }

  const byVar: Record<Id, Dim | null> = {};
  for (const v of model.variables) {
    const u = unitOfVar(v);
    byVar[v.id] = known(u) && scaleKnown(u) ? u : null;
  }
  return { byVar, issues };
}
