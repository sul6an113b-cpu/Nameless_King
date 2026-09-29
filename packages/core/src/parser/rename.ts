/**
 * renameVariable (SPEC §4/§6.1): renames a variable and rewrites every reference to it in equations,
 * assertions and scenario overrides. Only the matching name tokens change; all other text (spacing,
 * comments, other names' spelling) is kept. Works token by token, so it also fixes references inside
 * equations that do not parse yet.
 */
import { setVariableName } from '../model/ops.ts';
import type { Id, Model } from '../schema/model.ts';
import { canonicalName } from '../schema/names.ts';
import { lex } from './lexer.ts';
import { equationName } from './print.ts';

/** Replace every reference to canonical name `from` in `src` by the text `to`. */
export function renameInEquation(src: string, from: string, to: string): string {
  const hits = lex(src).tokens.filter((t) => (t.kind === 'id' || t.kind === 'qid') && t.name === from);
  let out = src;
  for (let i = hits.length - 1; i >= 0; i--) out = out.slice(0, hits[i].start) + to + out.slice(hits[i].end);
  return out;
}

export function renameVariable(model: Model, id: Id, newName: string): Model {
  const current = model.variables.find((v) => v.id === id);
  const renamed = setVariableName(model, id, newName); // validates: not reserved, not a duplicate
  if (!current) return renamed;
  const from = canonicalName(current.name);
  const to = equationName(newName);
  const fix = (s: string) => renameInEquation(s, from, to);
  return {
    ...renamed,
    variables: renamed.variables.map((v) => {
      const equation = fix(v.equation);
      return equation === v.equation ? v : { ...v, equation };
    }),
    assertions: renamed.assertions.map((a) => {
      const expr = fix(a.expr);
      return expr === a.expr ? a : { ...a, expr };
    }),
    scenarios: renamed.scenarios.map((s) => ({
      ...s,
      overrides: s.overrides.map((o) => {
        const equation = fix(o.equation);
        return equation === o.equation ? o : { ...o, equation };
      }),
    })),
  };
}
