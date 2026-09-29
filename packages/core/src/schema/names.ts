/**
 * Variable-name rules shared by the schema, model ops, parser and XMILE (SPEC §5).
 * XMILE convention: names are case-insensitive and runs of whitespace/underscores are equivalent.
 */

/** Canonical identifier key used for matching (display names are kept as typed). */
export function canonicalName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_]+/g, '_');
}

/** Words of the equation language that can never be variable names. */
export const RESERVED_WORDS: readonly string[] = ['if', 'then', 'else', 'and', 'or', 'not', 'mod'];

/**
 * Builtin function and constant names of the LoopLab equation language (SPEC §5), canonical form.
 * The parser's BUILTINS table must cover exactly this set (enforced by a parser test).
 */
export const BUILTIN_NAMES: readonly string[] = [
  // brief set
  'step', 'pulse', 'ramp', 'smth1', 'smooth', 'smth3', 'smooth3', 'delay1', 'delay3', 'min', 'max',
  // additional stateful / time builtins
  'smthn', 'delayn', 'delay', 'previous', 'init',
  // math
  'abs', 'exp', 'ln', 'log10', 'sqrt', 'int', 'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'pi', 'inf',
  'safediv', 'lookup',
  // time
  'time', 'dt', 'starttime', 'stoptime',
];

const reserved = new Set<string>([...RESERVED_WORDS, ...BUILTIN_NAMES]);

/** True if the (display) name collides with a reserved word or builtin once canonicalised. */
export function isReservedName(name: string): boolean {
  return reserved.has(canonicalName(name));
}
