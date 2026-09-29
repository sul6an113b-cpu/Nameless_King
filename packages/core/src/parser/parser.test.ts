import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Ast } from '../contracts.ts';
import { BUILTIN_NAMES } from '../schema/names.ts';
import { BUILTINS, parseEquation, printEquation, referencedNames } from './index.ts';

/** AST without spans and raw spellings, for structural comparison. */
function strip(n: Ast): unknown {
  switch (n.k) {
    case 'num':
      return n;
    case 'ref':
      return { k: 'ref', name: n.name };
    case 'un':
      return { k: 'un', op: n.op, a: strip(n.a) };
    case 'bin':
      return { k: 'bin', op: n.op, a: strip(n.a), b: strip(n.b) };
    case 'if':
      return { k: 'if', c: strip(n.c), t: strip(n.t), e: strip(n.e) };
    case 'call':
      return { k: 'call', fn: n.fn, args: n.args.map(strip) };
  }
}

function parse(src: string): unknown {
  const r = parseEquation(src);
  if (!r.ok) throw new Error(`${src}: ${r.error.message}`);
  return strip(r.ast);
}

const num = (v: number) => ({ k: 'num', v });
const ref = (name: string) => ({ k: 'ref', name });
const bin = (op: string, a: unknown, b: unknown) => ({ k: 'bin', op, a, b });
const un = (op: string, a: unknown) => ({ k: 'un', op, a });
const call = (fn: string, ...args: unknown[]) => ({ k: 'call', fn, args });

describe('parseEquation: golden cases', () => {
  it.each([
    ['1', num(1)],
    ['2.5', num(2.5)],
    ['1e-3', num(0.001)],
    ['.375', num(0.375)],
    ['14.', num(14)],
    ['6E5', num(600000)],
    ['3e-05', num(0.00003)],
    ['Work_Remaining', ref('work_remaining')],
    ['"Work Remaining"', ref('work_remaining')],
    ['work__REMAINING', ref('work_remaining')],
    ['"Rate (1/wk)"', ref('rate_(1/wk)')],
    ['"say \\"hi\\""', ref('say_"hi"')],
    ['"line\\nbreak"', ref('line_break')],
    ['TIME', call('TIME')],
    ['time', call('TIME')],
    ['PI()', call('PI')],
    ['step(1, 1)', call('STEP', num(1), num(1))],
    ['Smooth(x, 3)', call('SMOOTH', ref('x'), num(3))],
    ['table(TIME)', call('LOOKUP', ref('table'), call('TIME'))],
    ['"my table"(2)', call('LOOKUP', ref('my_table'), num(2))],
    ['LOOKUP(t, 3)', call('LOOKUP', ref('t'), num(3))],
    ['a {a comment} + b', bin('+', ref('a'), ref('b'))],
    ['a − b × c', bin('-', ref('a'), bin('*', ref('b'), ref('c')))],
  ])('%s', (src, expected) => {
    expect(parse(src)).toEqual(expected);
  });
});

describe('parseEquation: precedence and associativity (XMILE §3.3.1)', () => {
  it.each([
    ['-2^2', un('-', bin('^', num(2), num(2)))], // ^ binds tighter than unary minus: -4
    ['2^3^2', bin('^', num(2), bin('^', num(3), num(2)))], // right-associative
    ['2^-1', bin('^', num(2), un('-', num(1)))],
    ['4 - 5 + 6', bin('+', bin('-', num(4), num(5)), num(6))], // left-associative
    ['8 / 4 / 2', bin('/', bin('/', num(8), num(4)), num(2))],
    ['a + b * c', bin('+', ref('a'), bin('*', ref('b'), ref('c')))],
    ['a * b mod c', bin('mod', bin('*', ref('a'), ref('b')), ref('c'))],
    ['a < b = c > d', bin('=', bin('<', ref('a'), ref('b')), bin('>', ref('c'), ref('d')))],
    ['a <> b', bin('<>', ref('a'), ref('b'))],
    ['a OR b AND c', bin('or', ref('a'), bin('and', ref('b'), ref('c')))],
    ['NOT a AND b', bin('and', un('not', ref('a')), ref('b'))],
    ['a AnD NoT b oR c', bin('or', bin('and', ref('a'), un('not', ref('b'))), ref('c'))],
    ['-a * b', bin('*', un('-', ref('a')), ref('b'))],
    ['(a + b) * c', bin('*', bin('+', ref('a'), ref('b')), ref('c'))],
    ['IF a > 0 THEN 1 ELSE 2 + 3', { k: 'if', c: bin('>', ref('a'), num(0)), t: num(1), e: bin('+', num(2), num(3)) }],
    ['1 + IF a THEN b ELSE c', bin('+', num(1), { k: 'if', c: ref('a'), t: ref('b'), e: ref('c') })],
    ['if_then_else(a, b, c)', { k: 'if', c: ref('a'), t: ref('b'), e: ref('c') }],
    [
      'IF a THEN IF b THEN 1 ELSE 2 ELSE 3',
      { k: 'if', c: ref('a'), t: { k: 'if', c: ref('b'), t: num(1), e: num(2) }, e: num(3) },
    ],
  ])('%s', (src, expected) => {
    expect(parse(src)).toEqual(expected);
  });
});

describe('parseEquation: errors carry precise spans', () => {
  it.each([
    ['', 0, 0, /Empty/],
    ['a + ', 4, 4, /end of equation/],
    ['a + #', 4, 5, /Unexpected character "#"/],
    ['"open', 0, 5, /Unterminated quoted name/],
    ['"a\\qb"', 2, 4, /Invalid escape/],
    ['(a + b', 6, 6, /Expected "\)"/],
    ['MIN(1)', 0, 6, /MIN takes 2 arguments/],
    ['x + SMTH1(a, 2, 3, 4)', 4, 21, /SMTH1 takes 2–3 arguments/],
    ['MAX', 0, 3, /MAX needs arguments/],
    ['IF a 1 ELSE 2', 5, 6, /Expected THEN/],
    ['IF a THEN 1', 11, 11, /Expected ELSE/],
    ['Work Remaining', 5, 14, /Work_Remaining or "Work Remaining"/],
    ['a THEN b', 2, 6, /without a matching IF/],
    ['stock[1]', 5, 6, /Arrays/],
    ['{ open comment', 0, 14, /Unterminated comment/],
    ['a(1, 2)', 0, 7, /not a builtin function/],
    ['LOOKUP(1, 2)', 0, 12, /name of a graphical function/],
    ['a + )', 4, 5, /Unexpected "\)"/],
  ])('%j', (src, start, end, message) => {
    const r = parseEquation(src);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toMatch(message);
    expect(r.error.span).toEqual({ start, end });
  });
});

describe('referencedNames', () => {
  it('returns canonical names once, in order, including graphical-function tables', () => {
    const r = parseEquation('b + "A" * a + B + effect(TIME) + SMTH1(c, a)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(referencedNames(r.ast)).toEqual(['b', 'a', 'effect', 'c']);
  });

  it('keeps builtins and keywords out', () => {
    const r = parseEquation('IF TIME > STARTTIME THEN DT ELSE PI');
    expect(r.ok && referencedNames(r.ast)).toEqual([]);
  });
});

describe('BUILTINS', () => {
  it('covers exactly schema BUILTIN_NAMES, each with a signature and doc', () => {
    expect(Object.keys(BUILTINS).sort()).toEqual(BUILTIN_NAMES.map((n) => n.toUpperCase()).sort());
    for (const [name, b] of Object.entries(BUILTINS)) {
      expect(b.signature.startsWith(name)).toBe(true);
      expect(b.doc.length).toBeGreaterThan(5);
      expect(b.minArgs).toBeLessThanOrEqual(b.maxArgs);
    }
  });

  it('marks exactly the stateful builtins', () => {
    const stateful = Object.entries(BUILTINS)
      .filter(([, b]) => b.stateful)
      .map(([n]) => n)
      .sort();
    expect(stateful).toEqual(['DELAY', 'DELAY1', 'DELAY3', 'DELAYN', 'INIT', 'PREVIOUS', 'SMOOTH', 'SMOOTH3', 'SMTH1', 'SMTH3', 'SMTHN']);
  });
});

// ── property: printEquation → parseEquation round-trips the AST ─────────────

const NAMES = ['a', 'b', 'work_remaining', 'x1', 'größe', 'time', 'if', 'rate_(1/wk)', 'say_"hi"', 'a$b'];
const FIXED_BUILTINS = Object.entries(BUILTINS).filter(([n]) => n !== 'LOOKUP');

const { ast: astArb } = fc.letrec<{ ast: Ast; leaf: Ast; un: Ast; bin: Ast; if: Ast; call: Ast }>((tie) => ({
  ast: fc.oneof({ depthSize: 'small', withCrossShrink: true }, tie('leaf'), tie('un'), tie('bin'), tie('if'), tie('call')),
  leaf: fc.oneof(
    fc
      .oneof(fc.integer({ min: 0, max: 1000 }), fc.double({ min: 0, max: 1e25, noNaN: true, noDefaultInfinity: true }))
      .map((v): Ast => ({ k: 'num', v: v === 0 ? 0 : v })),
    fc.constantFrom(...NAMES).map((name): Ast => ({ k: 'ref', name, raw: '', span: { start: 0, end: 0 } })),
  ),
  un: fc.record({ k: fc.constant('un' as const), op: fc.constantFrom('-' as const, '+' as const, 'not' as const), a: tie('ast') }),
  bin: fc.record({
    k: fc.constant('bin' as const),
    op: fc.constantFrom(...(['+', '-', '*', '/', '^', 'mod', '<', '<=', '>', '>=', '=', '<>', 'and', 'or'] as const)),
    a: tie('ast'),
    b: tie('ast'),
  }),
  if: fc.record({ k: fc.constant('if' as const), c: tie('ast'), t: tie('ast'), e: tie('ast') }),
  call: fc.constantFrom(...FIXED_BUILTINS).chain(([fn, info]) =>
    fc
      .array(tie('ast'), { minLength: info.minArgs, maxLength: info.maxArgs })
      .map((args): Ast => ({ k: 'call', fn, args, span: { start: 0, end: 0 } })),
  ),
}));

describe('printEquation', () => {
  it('property: parse(print(ast)) is the same AST', () => {
    fc.assert(
      fc.property(astArb, (ast) => {
        const text = printEquation(ast);
        const r = parseEquation(text);
        expect(r.ok, text).toBe(true);
        if (r.ok) expect(strip(r.ast)).toEqual(strip(ast));
      }),
      { numRuns: 500 },
    );
  });

  it('prints with minimal parentheses', () => {
    const show = (s: string) => {
      const r = parseEquation(s);
      if (!r.ok) throw new Error(r.error.message);
      return printEquation(r.ast);
    };
    expect(show('(a + b) * c')).toBe('(a + b) * c');
    expect(show('a + (b * c)')).toBe('a + b * c');
    expect(show('(-2)^2')).toBe('(-2)^2');
    expect(show('-(2^2)')).toBe('-2^2');
    expect(show('(2^3)^2')).toBe('(2^3)^2');
    expect(show('a - (b - c)')).toBe('a - (b - c)');
    expect(show('if a then b else c')).toBe('IF a THEN b ELSE c');
    expect(show('"Work Remaining" / time')).toBe('"Work Remaining" / TIME');
  });
});
