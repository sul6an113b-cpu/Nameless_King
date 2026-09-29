/** Equation parser (SPEC §6.1) — owner: sd-engine. Safe: source → AST only; nothing is ever evaluated as code. */
export { BUILTINS } from './builtins.ts';
export { parseEquation, referencedNames } from './parse.ts';
export { equationName, printEquation } from './print.ts';
export { renameInEquation, renameVariable } from './rename.ts';
