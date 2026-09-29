/**
 * Equation autocomplete (SPEC §5, §8): suggest variable names (written with underscores, as the equation
 * language spells them) and builtins for the identifier at the caret. Pure and deterministic.
 */
import type { BuiltinSuggestion } from './engine.ts';
import { equationName } from './names.ts';

export interface Token {
  start: number;
  end: number;
  prefix: string;
}

export interface Suggestion {
  kind: 'variable' | 'builtin';
  label: string;
  insert: string;
  detail: string;
}

const IDENT = /[A-Za-z0-9_]/;

/** The identifier touching the caret (letters, digits, underscore), or null if there is none. */
export function tokenAt(text: string, caret: number): Token | null {
  let start = caret;
  while (start > 0 && IDENT.test(text[start - 1] ?? '')) start--;
  let end = caret;
  while (end < text.length && IDENT.test(text[end] ?? '')) end++;
  const prefix = text.slice(start, caret);
  if (prefix === '' || /^[0-9]/.test(prefix)) return null;
  // inside a quoted name, or part of a number like 1e3: no suggestions
  const before = text.slice(0, start);
  if ((before.match(/"/g)?.length ?? 0) % 2 === 1) return null;
  return { start, end, prefix };
}

const canon = (s: string) => s.toLowerCase().replace(/[\s_]+/g, '_');

export function suggest(prefix: string, variables: string[], builtins: BuiltinSuggestion[], limit = 8): Suggestion[] {
  const p = canon(prefix);
  const vars: Suggestion[] = variables.map((n) => ({
    kind: 'variable',
    label: n,
    insert: equationName(n),
    detail: '',
  }));
  const fns: Suggestion[] = builtins.map((b) => ({
    kind: 'builtin',
    label: b.name,
    insert: b.signature.includes('(') ? `${b.name}(` : b.name,
    detail: b.signature,
  }));
  const all = [...vars, ...fns];
  const starts = all.filter((s) => canon(s.insert).startsWith(p) && canon(s.insert) !== p);
  const contains = all.filter((s) => !starts.includes(s) && canon(s.insert).includes(p) && canon(s.insert) !== p);
  return [...starts, ...contains].slice(0, limit);
}

/** Replace the token with the suggestion; returns the new text and caret position. */
export function applySuggestion(text: string, token: Token, s: Suggestion): { text: string; caret: number } {
  const next = text.slice(0, token.start) + s.insert + text.slice(token.end);
  return { text: next, caret: token.start + s.insert.length };
}
