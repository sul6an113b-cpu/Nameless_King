/** Equation parser (SPEC §6.1) — owner: sd-engine. Phase-1 stub: signatures only. */
import type { Ast, BuiltinInfo, ParseResult } from '../contracts.ts';
import type { Id, Model } from '../schema/model.ts';
import { notImplemented } from '../stub.ts';

export function parseEquation(_src: string): ParseResult {
  return notImplemented('parser.parseEquation');
}

/** Canonical names referenced by an expression, deduplicated. */
export function referencedNames(_ast: Ast): string[] {
  return notImplemented('parser.referencedNames');
}

/** Rename a variable and rewrite every equation, assertion and scenario override that references it. */
export function renameVariable(_model: Model, _id: Id, _newName: string): Model {
  return notImplemented('parser.renameVariable');
}

/** Builtin metadata keyed by upper-case name; must cover exactly schema/names.ts BUILTIN_NAMES. */
export const BUILTINS: Readonly<Record<string, BuiltinInfo>> = {};
