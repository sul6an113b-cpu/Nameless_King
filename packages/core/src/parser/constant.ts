import type { Ast } from '../contracts.ts';

/** Value of a constant expression (numbers, PI, unary ±, + − * / ^), or null if it depends on anything else. */
export function constantValue(n: Ast): number | null {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'call':
      return n.fn === 'PI' ? Math.PI : null;
    case 'un': {
      if (n.op === 'not') return null;
      const a = constantValue(n.a);
      return a === null ? null : n.op === '-' ? -a : a;
    }
    case 'bin': {
      const a = constantValue(n.a);
      const b = a === null ? null : constantValue(n.b);
      if (a === null || b === null) return null;
      switch (n.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '^':
          return a ** b;
        default:
          return null;
      }
    }
    default:
      return null;
  }
}
