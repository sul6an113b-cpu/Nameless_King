/**
 * Builtin functions and constants of the equation language (SPEC §5; semantics per RESEARCH §XMILE 2).
 * Keys are upper-case and cover exactly schema/names.ts BUILTIN_NAMES. The table drives parsing (arity),
 * the compiler, and equation-editor autocomplete.
 */
import type { BuiltinInfo } from '../contracts.ts';

const fn = (signature: string, doc: string, minArgs: number, maxArgs = minArgs, stateful = false): BuiltinInfo => ({
  signature,
  doc,
  minArgs,
  maxArgs,
  stateful,
});

const math = (name: string, doc: string): BuiltinInfo => fn(`${name}(x)`, doc, 1);

export const BUILTINS: Readonly<Record<string, BuiltinInfo>> = {
  // brief set
  STEP: fn('STEP(height, start_time)', 'height once TIME reaches start_time (TIME + DT/2 > start_time), else 0.', 2),
  PULSE: fn(
    'PULSE(volume, first_time[, interval])',
    'volume/DT for one DT at first_time, repeated every interval (once if interval is omitted or 0).',
    2,
    3,
  ),
  RAMP: fn('RAMP(slope, start_time[, end_time])', 'slope·(TIME − start_time) after start_time, held after end_time.', 2, 3),
  SMTH1: fn('SMTH1(input, averaging_time[, initial])', 'First-order exponential smooth of input (starts at initial, default input).', 2, 3, true),
  SMOOTH: fn('SMOOTH(input, averaging_time[, initial])', 'Alias of SMTH1: first-order exponential smooth.', 2, 3, true),
  SMTH3: fn('SMTH3(input, averaging_time[, initial])', 'Third-order exponential smooth: three stages of averaging_time/3.', 2, 3, true),
  SMOOTH3: fn('SMOOTH3(input, averaging_time[, initial])', 'Alias of SMTH3: third-order exponential smooth.', 2, 3, true),
  DELAY1: fn('DELAY1(input, delay_time[, initial])', 'First-order material delay; initial is the initial output (default input).', 2, 3, true),
  DELAY3: fn('DELAY3(input, delay_time[, initial])', 'Third-order material delay: three stages of delay_time/3.', 2, 3, true),
  MIN: fn('MIN(a, b)', 'The smaller of two values.', 2),
  MAX: fn('MAX(a, b)', 'The larger of two values.', 2),
  // additional stateful / time builtins
  SMTHN: fn('SMTHN(input, averaging_time, n[, initial])', 'n-th order exponential smooth: n stages of averaging_time/n (n constant).', 3, 4, true),
  DELAYN: fn('DELAYN(input, delay_time, n[, initial])', 'n-th order material delay: n stages of delay_time/n (n constant).', 3, 4, true),
  DELAY: fn(
    'DELAY(input, delay_time[, initial])',
    'Fixed (pipeline) delay: input from delay_time ago; delay_time is constant and a multiple of DT.',
    2,
    3,
    true,
  ),
  PREVIOUS: fn('PREVIOUS(x[, initial])', 'Value of x one DT ago (initial, default 0, in the first step).', 1, 2, true),
  INIT: fn('INIT(x)', 'Value of x at the start of the simulation.', 1, 1, true),
  // math
  ABS: math('ABS', 'Absolute value.'),
  EXP: math('EXP', 'e raised to the power x.'),
  LN: math('LN', 'Natural logarithm.'),
  LOG10: math('LOG10', 'Base-10 logarithm.'),
  SQRT: math('SQRT', 'Square root.'),
  INT: math('INT', 'Largest integer ≤ x (floor).'),
  SIN: math('SIN', 'Sine (radians).'),
  COS: math('COS', 'Cosine (radians).'),
  TAN: math('TAN', 'Tangent (radians).'),
  ARCSIN: math('ARCSIN', 'Inverse sine (radians).'),
  ARCCOS: math('ARCCOS', 'Inverse cosine (radians).'),
  ARCTAN: math('ARCTAN', 'Inverse tangent (radians).'),
  PI: fn('PI', 'π = 3.14159…', 0),
  INF: fn('INF', 'Positive infinity.', 0),
  SAFEDIV: fn('SAFEDIV(a, b[, x])', 'a/b, or x (default 0) when b = 0.', 2, 3),
  LOOKUP: fn('LOOKUP(table, x)', 'Graphical function `table` evaluated at x (same as table(x)).', 2),
  // time
  TIME: fn('TIME', 'Current simulation time.', 0),
  DT: fn('DT', 'Integration time step.', 0),
  STARTTIME: fn('STARTTIME', 'Simulation start time.', 0),
  STOPTIME: fn('STOPTIME', 'Simulation stop time.', 0),
};

/** Import alias handled by the parser (it becomes an IF node), not a builtin of its own. */
export const IF_THEN_ELSE_ALIAS = 'if_then_else';
