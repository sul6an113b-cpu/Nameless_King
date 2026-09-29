/**
 * Precedence-climbing parser (SPEC §5): source → AST. Never evaluates anything.
 * Precedence, lowest first: OR · AND · = <> · < <= > >= · + - · * / MOD · unary + - NOT · ^ (right-assoc).
 * `IF c THEN a ELSE b` extends as far right as possible; `IF_THEN_ELSE(c, a, b)` is accepted on import.
 * A call of a non-builtin name, `table(x)`, is normalised to `LOOKUP(table, x)`.
 */
import type { Ast, BinOp, ParseResult, Span } from '../contracts.ts';
import { BUILTINS, IF_THEN_ELSE_ALIAS } from './builtins.ts';
import { lex, type Token } from './lexer.ts';

interface BinInfo {
  prec: number;
  op: BinOp;
  right: boolean;
}

const BIN: Record<string, BinInfo> = {
  or: { prec: 1, op: 'or', right: false },
  and: { prec: 2, op: 'and', right: false },
  '=': { prec: 3, op: '=', right: false },
  '<>': { prec: 3, op: '<>', right: false },
  '<': { prec: 4, op: '<', right: false },
  '<=': { prec: 4, op: '<=', right: false },
  '>': { prec: 4, op: '>', right: false },
  '>=': { prec: 4, op: '>=', right: false },
  '+': { prec: 5, op: '+', right: false },
  '-': { prec: 5, op: '-', right: false },
  '*': { prec: 6, op: '*', right: false },
  '/': { prec: 6, op: '/', right: false },
  mod: { prec: 6, op: 'mod', right: false },
  '^': { prec: 8, op: '^', right: true },
};

/** Binding power of unary + - NOT: tighter than * / MOD, looser than ^ (so -2^2 = -4). */
export const UNARY_PREC = 7;

/** Precedence of a binary operator (used by the printer). */
export function binPrec(op: BinOp): number {
  return BIN[op].prec;
}

class ParseError extends Error {
  readonly span: Span;
  constructor(message: string, span: Span) {
    super(message);
    this.span = span;
  }
}

const describe = (t: Token): string =>
  t.kind === 'eof' ? 'end of equation' : t.kind === 'kw' ? `"${t.text.toUpperCase()}"` : `"${t.text}"`;

export function parseEquation(src: string): ParseResult {
  if (src.trim() === '') return { ok: false, error: { message: 'Empty equation', span: { start: 0, end: src.length } } };
  const lexed = lex(src);
  if (lexed.error) return { ok: false, error: lexed.error };
  const toks = lexed.tokens;
  let pos = 0;

  const peek = (): Token => toks[pos];
  const next = (): Token => toks[pos++];
  const span = (t: Token): Span => ({ start: t.start, end: t.end });
  const isOp = (t: Token, text: string) => t.kind === 'op' && t.text === text;
  const isKw = (t: Token, text: string) => t.kind === 'kw' && t.text === text;

  const expect = (text: string, kind: 'op' | 'kw', context: string): Token => {
    const t = peek();
    if (t.kind === kind && t.text === text) return next();
    const want = kind === 'kw' ? text.toUpperCase() : `"${text}"`;
    throw new ParseError(`Expected ${want} ${context}, found ${describe(t)}`, span(t));
  };

  const binInfo = (t: Token): BinInfo | undefined =>
    t.kind === 'op' || t.kind === 'kw' ? (Object.hasOwn(BIN, t.text) ? BIN[t.text] : undefined) : undefined;

  function parseExpr(minPrec: number): Ast {
    let left = parsePrefix();
    for (;;) {
      const info = binInfo(peek());
      if (!info || info.prec < minPrec) break;
      next();
      const right = parseExpr(info.right ? info.prec : info.prec + 1);
      left = { k: 'bin', op: info.op, a: left, b: right };
    }
    return left;
  }

  /** `(` already consumed: comma-separated arguments up to `)`. */
  function parseArgs(nameTok: Token): { args: Ast[]; end: number } {
    const args: Ast[] = [];
    if (isOp(peek(), ')')) return { args, end: next().end };
    for (;;) {
      args.push(parseExpr(0));
      const t = peek();
      if (isOp(t, ',')) {
        next();
        continue;
      }
      if (isOp(t, ')')) return { args, end: next().end };
      throw new ParseError(`Expected "," or ")" in the arguments of ${nameTok.text}, found ${describe(t)}`, span(t));
    }
  }

  function parseCall(nameTok: Token): Ast {
    next(); // (
    const { args, end } = parseArgs(nameTok);
    const callSpan = { start: nameTok.start, end };
    const upper = nameTok.kind === 'id' ? (nameTok.name ?? '').toUpperCase() : '';

    if (nameTok.kind === 'id' && nameTok.name === IF_THEN_ELSE_ALIAS) {
      if (args.length !== 3) throw new ParseError('IF_THEN_ELSE needs 3 arguments: (condition, then, else)', callSpan);
      return { k: 'if', c: args[0], t: args[1], e: args[2] };
    }
    if (upper !== '' && Object.hasOwn(BUILTINS, upper)) {
      const info = BUILTINS[upper];
      if (args.length < info.minArgs || args.length > info.maxArgs) {
        const n = info.minArgs === info.maxArgs ? `${info.minArgs}` : `${info.minArgs}–${info.maxArgs}`;
        throw new ParseError(`${upper} takes ${n} argument${info.maxArgs === 1 ? '' : 's'}: ${info.signature}`, callSpan);
      }
      if (upper === 'LOOKUP' && args[0].k !== 'ref')
        throw new ParseError('LOOKUP needs the name of a graphical function as its first argument', callSpan);
      return { k: 'call', fn: upper, args, span: callSpan };
    }
    // table(x): a graphical-function call
    if (args.length !== 1)
      throw new ParseError(`"${nameTok.text}" is not a builtin function; a graphical function takes 1 argument`, callSpan);
    const table: Ast = { k: 'ref', name: nameTok.name ?? '', raw: nameTok.text, span: span(nameTok) };
    return { k: 'call', fn: 'LOOKUP', args: [table, args[0]], span: callSpan };
  }

  function parsePrefix(): Ast {
    const t = peek();
    switch (t.kind) {
      case 'num':
        next();
        return { k: 'num', v: t.value ?? NaN };
      case 'qid':
        next();
        if (isOp(peek(), '(')) return parseCall(t);
        return { k: 'ref', name: t.name ?? '', raw: t.text, span: span(t) };
      case 'id': {
        next();
        if (isOp(peek(), '(')) return parseCall(t);
        const upper = (t.name ?? '').toUpperCase();
        if (Object.hasOwn(BUILTINS, upper)) {
          const info = BUILTINS[upper];
          if (info.minArgs > 0) throw new ParseError(`${upper} needs arguments: ${info.signature}`, span(t));
          return { k: 'call', fn: upper, args: [], span: span(t) };
        }
        return { k: 'ref', name: t.name ?? '', raw: t.text, span: span(t) };
      }
      case 'op':
        if (t.text === '(') {
          next();
          const inner = parseExpr(0);
          expect(')', 'op', 'to close "("');
          return inner;
        }
        if (t.text === '-' || t.text === '+') {
          next();
          return { k: 'un', op: t.text, a: parseExpr(UNARY_PREC) };
        }
        break;
      case 'kw':
        if (t.text === 'not') {
          next();
          return { k: 'un', op: 'not', a: parseExpr(UNARY_PREC) };
        }
        if (t.text === 'if') {
          next();
          const c = parseExpr(0);
          expect('then', 'kw', 'after the IF condition');
          const th = parseExpr(0);
          expect('else', 'kw', 'after the THEN branch');
          const el = parseExpr(0);
          return { k: 'if', c, t: th, e: el };
        }
        break;
      case 'eof':
        throw new ParseError('Unexpected end of equation', span(t));
    }
    throw new ParseError(`Unexpected ${describe(t)}`, span(t));
  }

  try {
    const ast = parseExpr(0);
    const t = peek();
    if (t.kind !== 'eof') {
      const prev = toks[pos - 1];
      const hint =
        (t.kind === 'id' || t.kind === 'qid') && (prev.kind === 'id' || prev.kind === 'qid')
          ? ` — write names with spaces as ${prev.text}_${t.text} or "${prev.text} ${t.text}"`
          : isKw(t, 'then') || isKw(t, 'else')
            ? ' — THEN/ELSE without a matching IF'
            : '';
      throw new ParseError(`Unexpected ${describe(t)}${hint}`, span(t));
    }
    return { ok: true, ast };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: { message: e.message, span: e.span } };
    throw e;
  }
}

/** Canonical names referenced by an expression (graphical-function tables included), deduplicated, in order. */
export function referencedNames(ast: Ast): string[] {
  const seen = new Set<string>();
  const walk = (n: Ast): void => {
    switch (n.k) {
      case 'num':
        return;
      case 'ref':
        seen.add(n.name);
        return;
      case 'un':
        return walk(n.a);
      case 'bin':
        walk(n.a);
        return walk(n.b);
      case 'if':
        walk(n.c);
        walk(n.t);
        return walk(n.e);
      case 'call':
        return n.args.forEach(walk);
    }
  };
  walk(ast);
  return [...seen];
}
