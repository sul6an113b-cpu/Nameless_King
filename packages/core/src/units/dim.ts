/**
 * Unit algebra (SPEC §6.2). A unit is a scale times a product of base dimensions with integer powers:
 * `tasks/week` → { scale: 1/7, dims: { tasks: 1, day: -1 } }. Time is one dimension with base `day`;
 * the fixed factors are a LoopLab convention (docs/decisions/sd-engine.md): year = 365 days = 12 months =
 * 4 quarters, week = 7 days.
 */
import type { Dim, UnitParseResult } from '../contracts.ts';
import type { UnitDef } from '../schema/model.ts';
import { canonicalName } from '../schema/names.ts';

export const TIME_DIM = 'day';
export const DAYS_PER_YEAR = 365;

/** Built-in time units: canonical name → length in days. */
export const TIME_UNITS: Readonly<Record<string, number>> = (() => {
  const table: Record<string, number> = {};
  const add = (days: number, ...names: string[]) => names.forEach((n) => (table[n] = days));
  add(1 / 86400, 'second', 'seconds', 'sec', 'secs', 's');
  add(1 / 1440, 'minute', 'minutes', 'min', 'mins');
  add(1 / 24, 'hour', 'hours', 'hr', 'hrs');
  add(1, 'day', 'days');
  add(7, 'week', 'weeks', 'wk', 'wks');
  add(DAYS_PER_YEAR / 12, 'month', 'months', 'mo', 'mos');
  add(DAYS_PER_YEAR / 4, 'quarter', 'quarters', 'qtr', 'qtrs');
  add(DAYS_PER_YEAR, 'year', 'years', 'yr', 'yrs');
  return table;
})();

const DIMENSIONLESS = new Set(['1', 'dmnl', 'dimensionless', 'unitless']);

// ── algebra ────────────────────────────────────────────────────────────────

export const dimensionless = (): Dim => ({ scale: 1, dims: {} });

function combine(a: Dim, b: Dim, sign: 1 | -1): Dim {
  const dims: Record<string, number> = { ...a.dims };
  for (const [k, e] of Object.entries(b.dims)) {
    const n = (dims[k] ?? 0) + sign * e;
    if (n === 0) delete dims[k];
    else dims[k] = n;
  }
  return { scale: sign === 1 ? a.scale * b.scale : a.scale / b.scale, dims };
}

export const mulDim = (a: Dim, b: Dim): Dim => combine(a, b, 1);
export const divDim = (a: Dim, b: Dim): Dim => combine(a, b, -1);

export function powDim(a: Dim, n: number): Dim {
  const dims: Record<string, number> = {};
  if (n !== 0) for (const [k, e] of Object.entries(a.dims)) dims[k] = e * n;
  return { scale: a.scale ** n, dims };
}

/** Same base dimensions (scale ignored). */
export function sameDims(a: Dim, b: Dim): boolean {
  const ka = Object.keys(a.dims);
  if (ka.length !== Object.keys(b.dims).length) return false;
  return ka.every((k) => a.dims[k] === b.dims[k]);
}

/** Same dimensions and the same scale (within rounding). */
export function sameUnit(a: Dim, b: Dim): boolean {
  return sameDims(a, b) && Math.abs(a.scale - b.scale) <= 1e-9 * Math.max(Math.abs(a.scale), Math.abs(b.scale));
}

export const isDimensionless = (a: Dim): boolean => Object.keys(a.dims).length === 0;
export const isTime = (a: Dim): boolean => sameDims(a, { scale: 1, dims: { [TIME_DIM]: 1 } });

/** Human-readable form, e.g. `tasks/month` or `4.345 tasks/month`; time is shown in `timeUnit` when given. */
export function formatDim(d: Dim, timeUnit?: string): string {
  let scale = d.scale;
  const tu = timeUnit ? canonicalName(timeUnit) : TIME_DIM;
  const tuDays = TIME_UNITS[tu] ?? 1;
  const timeName = TIME_UNITS[tu] !== undefined ? tu : TIME_DIM;
  const num: string[] = [];
  const den: string[] = [];
  for (const k of Object.keys(d.dims).sort()) {
    const e = d.dims[k];
    let name = k;
    if (k === TIME_DIM) {
      scale *= tuDays ** e;
      name = timeName;
    }
    const term = Math.abs(e) === 1 ? name : `${name}^${Math.abs(e)}`;
    (e > 0 ? num : den).push(term);
  }
  const top = num.length ? num.join('*') : '1';
  const body = den.length === 0 ? top : `${top}/${den.length > 1 ? `(${den.join('*')})` : den[0]}`;
  const factor = Math.abs(scale - 1) <= 1e-9 ? '' : `${Number(scale.toPrecision(4))}`;
  if (body === '1') return factor || 'dmnl';
  return factor ? `${factor} ${body}` : body;
}

// ── parsing ────────────────────────────────────────────────────────────────

class UnitError extends Error {}

const NAME_START = /[\p{L}_$%€£¥]/u;
const NAME_PART = /[\p{L}\p{N}_$%€£¥]/u;

/**
 * Grammar: `expr := term (('*' | '-' | '/' | juxtaposition) term)*`, `term := atom ('^' integer)?`,
 * `atom := number | name | '(' expr ')'`. `-` means multiplication (XMILE: `person-hours`).
 * Names resolve to: custom units (model.units) → dmnl/1 → built-in time units → implicit base units.
 */
export function parseUnit(s: string, defs: readonly UnitDef[]): UnitParseResult {
  const custom = new Map<string, UnitDef>();
  for (const d of defs) for (const n of [d.name, ...d.aliases]) custom.set(canonicalName(n), d);
  const resolving = new Set<string>();

  const resolve = (name: string): Dim => {
    const key = canonicalName(name);
    const def = custom.get(key);
    if (def) {
      const base = canonicalName(def.name);
      if (def.definition.trim() === '') return { scale: 1, dims: { [base]: 1 } };
      if (resolving.has(base)) throw new UnitError(`Unit "${def.name}" is defined in terms of itself`);
      resolving.add(base);
      const d = parseExpr(def.definition);
      resolving.delete(base);
      return d;
    }
    if (DIMENSIONLESS.has(key)) return dimensionless();
    const days = TIME_UNITS[key];
    if (days !== undefined) return { scale: days, dims: { [TIME_DIM]: 1 } };
    return { scale: 1, dims: { [key]: 1 } };
  };

  const parseExpr = (src: string): Dim => {
    let i = 0;
    const skipWs = () => {
      while (i < src.length && /\s/.test(src[i])) i++;
    };
    const atEnd = () => {
      skipWs();
      return i >= src.length;
    };

    const readInt = (): number => {
      skipWs();
      const m = /^[+-]?\s*\d+/.exec(src.slice(i));
      if (!m) throw new UnitError(`Expected an integer exponent at position ${i + 1} in "${src}"`);
      i += m[0].length;
      skipWs();
      if (src[i] === '.') throw new UnitError(`Unit exponents must be integers in "${src}"`);
      return Number(m[0].replace(/\s/g, ''));
    };

    const parseAtom = (): Dim => {
      skipWs();
      const ch = src[i];
      if (ch === '(') {
        i++;
        const d = parseSeq();
        skipWs();
        if (src[i] !== ')') throw new UnitError(`Missing ")" in "${src}"`);
        i++;
        return d;
      }
      const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (num) {
        i += num[0].length;
        const v = Number(num[0]);
        if (!(v > 0)) throw new UnitError(`A unit scale must be positive in "${src}"`);
        return { scale: v, dims: {} };
      }
      if (ch !== undefined && NAME_START.test(ch)) {
        const start = i;
        while (i < src.length && NAME_PART.test(src[i])) i++;
        return resolve(src.slice(start, i));
      }
      throw new UnitError(ch === undefined ? `Unexpected end of unit "${src}"` : `Unexpected "${ch}" in unit "${src}"`);
    };

    const parseTerm = (): Dim => {
      const base = parseAtom();
      skipWs();
      if (src[i] === '^') {
        i++;
        return powDim(base, readInt());
      }
      return base;
    };

    const parseSeq = (): Dim => {
      let acc = parseTerm();
      for (;;) {
        skipWs();
        const ch = src[i];
        if (ch === undefined || ch === ')') return acc;
        if (ch === '*' || ch === '-') {
          i++;
          acc = mulDim(acc, parseTerm());
        } else if (ch === '/') {
          i++;
          acc = divDim(acc, parseTerm());
        } else acc = mulDim(acc, parseTerm()); // juxtaposition: `1000 USD`
      }
    };

    if (atEnd()) return dimensionless();
    const d = parseSeq();
    if (!atEnd()) throw new UnitError(`Unexpected ")" in unit "${src}"`);
    return d;
  };

  try {
    return { ok: true, dim: parseExpr(s) };
  } catch (e) {
    if (e instanceof UnitError) return { ok: false, message: e.message };
    throw e;
  }
}
