import { findVariableByName, type Model, type VarKind } from '@looplab/core';

const BASE: Record<VarKind, string> = {
  variable: 'Variable',
  stock: 'Stock',
  flow: 'Flow',
  aux: 'Auxiliary',
  constant: 'Constant',
  lookup: 'Lookup',
};

/** First free default name for a new variable of a kind, e.g. "Variable 3". */
export function nextVariableName(model: Model, kind: VarKind): string {
  for (let n = 1; ; n++) {
    const name = `${BASE[kind]} ${n}`;
    if (!findVariableByName(model, name)) return name;
  }
}

/** Equation-language spelling of a display name (spaces written as underscores). */
export const equationName = (name: string): string => name.trim().replace(/\s+/g, '_');
