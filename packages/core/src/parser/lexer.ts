/**
 * Tokenizer for the LoopLab equation language (SPEC §5, XMILE §3.2–3.3 scalar subset).
 * Identifiers are case-insensitive; quoted names allow any character; `{ … }` comments are skipped.
 */
import type { Span } from '../contracts.ts';
import { canonicalName } from '../schema/names.ts';

export type TokenKind = 'num' | 'id' | 'qid' | 'op' | 'kw' | 'eof';

export interface Token {
  kind: TokenKind;
  /** source text (op: the normalised operator, kw: the lower-case keyword) */
  text: string;
  start: number;
  end: number;
  /** num: parsed value */
  value?: number;
  /** id/qid: canonical name (SPEC §5) */
  name?: string;
}

export interface LexResult {
  tokens: Token[];
  error?: { message: string; span: Span };
}

export const KEYWORDS: ReadonlySet<string> = new Set(['if', 'then', 'else', 'and', 'or', 'not', 'mod']);

const OPERATORS = ['<=', '>=', '<>', '<', '>', '=', '+', '-', '*', '/', '^', '(', ')', ','];
/** Typographic operators people paste from documents. */
const OPERATOR_ALIASES: Record<string, string> = { '−': '-', '×': '*', '÷': '/', '≤': '<=', '≥': '>=', '≠': '<>' };

const NUMBER = /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y;
const WS = /\s/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const LETTER_MARK_OR_DIGIT = /[\p{L}\p{M}\p{N}]/u;

export function isIdStart(ch: string): boolean {
  return ch === '_' || LETTER_OR_MARK.test(ch);
}

export function isIdPart(ch: string): boolean {
  return ch === '_' || ch === '$' || LETTER_MARK_OR_DIGIT.test(ch);
}

/** Tokenize `src`. On error, returns the tokens read so far (useful for renaming inside broken equations). */
export function lex(src: string): LexResult {
  const tokens: Token[] = [];
  let i = 0;
  const fail = (message: string, start: number, end: number): LexResult => ({
    tokens,
    error: { message, span: { start, end } },
  });

  while (i < src.length) {
    const ch = src[i];
    if (WS.test(ch)) {
      i++;
      continue;
    }
    if (ch === '{') {
      const close = src.indexOf('}', i + 1);
      if (close < 0) return fail('Unterminated comment: missing "}"', i, src.length);
      i = close + 1;
      continue;
    }
    if (ch === '"') {
      const start = i;
      let text = '';
      i++;
      for (;;) {
        if (i >= src.length) return fail('Unterminated quoted name: missing closing "', start, src.length);
        const c = src[i];
        if (c === '"') break;
        if (c === '\\') {
          const e = src[i + 1];
          if (e === '"' || e === '\\') text += e;
          else if (e === 'n') text += '\n';
          else return fail('Invalid escape in quoted name (only \\" \\\\ \\n are allowed)', i, i + 2);
          i += 2;
          continue;
        }
        text += c;
        i++;
      }
      i++;
      if (text.trim() === '') return fail('Empty quoted name', start, i);
      tokens.push({ kind: 'qid', text: src.slice(start, i), start, end: i, name: canonicalName(text) });
      continue;
    }
    if ((ch >= '0' && ch <= '9') || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(src);
      if (m) {
        const text = m[0];
        tokens.push({ kind: 'num', text, start: i, end: i + text.length, value: Number(text) });
        i += text.length;
        continue;
      }
    }
    const cp = src.codePointAt(i) ?? 0;
    const chFull = String.fromCodePoint(cp);
    if (isIdStart(chFull)) {
      const start = i;
      i += chFull.length;
      while (i < src.length) {
        const c = String.fromCodePoint(src.codePointAt(i) ?? 0);
        if (!isIdPart(c)) break;
        i += c.length;
      }
      const text = src.slice(start, i);
      const name = canonicalName(text);
      if (KEYWORDS.has(name)) tokens.push({ kind: 'kw', text: name, start, end: i });
      else tokens.push({ kind: 'id', text, start, end: i, name });
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ kind: 'op', text: op, start: i, end: i + op.length });
      i += op.length;
      continue;
    }
    const alias = OPERATOR_ALIASES[ch];
    if (alias) {
      tokens.push({ kind: 'op', text: alias, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '[' || ch === ']') return fail('Arrays (subscripts) are not supported', i, i + 1);
    return fail(`Unexpected character "${chFull}"`, i, i + chFull.length);
  }
  tokens.push({ kind: 'eof', text: '', start: src.length, end: src.length });
  return { tokens };
}
