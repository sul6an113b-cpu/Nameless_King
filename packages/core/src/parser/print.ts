/**
 * AST → equation text with minimal parentheses. `parseEquation(printEquation(ast))` yields the same AST
 * (up to spans and raw spellings) — checked by a property test.
 */
import type { Ast } from '../contracts.ts';
import { BUILTINS, IF_THEN_ELSE_ALIAS } from './builtins.ts';
import { isIdPart, isIdStart, KEYWORDS, lex } from './lexer.ts';
import { binPrec, UNARY_PREC } from './parse.ts';
import { canonicalName } from '../schema/names.ts';

const ATOM = 10;
const POW = 8;

/** True if `s` can be written unquoted in an equation and reads back as a variable reference. */
function isPlainIdentifier(s: string): boolean {
  const chars = [...s];
  if (chars.length === 0 || !isIdStart(chars[0]) || !chars.every(isIdPart)) return false;
  const canon = canonicalName(s);
  return !KEYWORDS.has(canon) && canon !== IF_THEN_ELSE_ALIAS && !Object.hasOwn(BUILTINS, canon.toUpperCase());
}

/** How a variable's display name is written in equations: `Work_Remaining`, or `"Rate (1/wk)"` when quoting is needed. */
export function equationName(name: string): string {
  const trimmed = name.trim();
  const underscored = trimmed.replace(/\s+/g, '_');
  if (isPlainIdentifier(underscored)) return underscored;
  return `"${trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function formatNumber(v: number): string {
  if (Number.isNaN(v)) return '(0/0)';
  if (v === Infinity) return 'INF';
  return String(v);
}

/** Keep the author's spelling when it still denotes the same name. */
function refText(name: string, raw: string): string {
  if (raw !== '') {
    const t = lex(raw).tokens;
    if (t.length === 2 && (t[0].kind === 'id' || t[0].kind === 'qid') && t[0].name === name && t[0].text === raw)
      return raw;
  }
  return equationName(name);
}

function print(n: Ast): { s: string; prec: number } {
  switch (n.k) {
    case 'num':
      if (n.v < 0 || Object.is(n.v, -0)) return { s: `-${formatNumber(-n.v)}`, prec: UNARY_PREC };
      return { s: formatNumber(n.v), prec: ATOM };
    case 'ref':
      return { s: refText(n.name, n.raw), prec: ATOM };
    case 'call':
      if (n.args.length === 0 && (BUILTINS[n.fn]?.maxArgs ?? 0) === 0) return { s: n.fn, prec: ATOM };
      return { s: `${n.fn}(${n.args.map((a) => print(a).s).join(', ')})`, prec: ATOM };
    case 'un': {
      const a = wrap(n.a, UNARY_PREC);
      return { s: n.op === 'not' ? `NOT ${a}` : `${n.op}${a}`, prec: UNARY_PREC };
    }
    case 'bin': {
      const p = binPrec(n.op);
      const right = n.op === '^';
      const a = wrap(n.a, right ? p + 1 : p);
      const b = wrap(n.b, right ? p : p + 1);
      const op = n.op === '^' ? '^' : ` ${/^[a-z]/.test(n.op) ? n.op.toUpperCase() : n.op} `;
      return { s: `${a}${op}${b}`, prec: p === POW ? POW : p };
    }
    case 'if':
      return { s: `IF ${print(n.c).s} THEN ${print(n.t).s} ELSE ${print(n.e).s}`, prec: 0 };
  }
}

function wrap(n: Ast, minPrec: number): string {
  const r = print(n);
  return r.prec >= minPrec ? r.s : `(${r.s})`;
}

export function printEquation(ast: Ast): string {
  return print(ast).s;
}
