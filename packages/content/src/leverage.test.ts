import { describe, expect, it } from 'vitest';
import { leveragePoint, leveragePoints } from './leverage.ts';

describe('Meadows leverage points', () => {
  it('has exactly 12 levels, unique, ordered 12 (weakest) → 1 (strongest)', () => {
    expect(leveragePoints).toHaveLength(12);
    expect(leveragePoints.map((p) => p.level)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(new Set(leveragePoints.map((p) => p.name)).size).toBe(12);
  });

  it('uses the names of Meadows (1999) at both ends of the list', () => {
    expect(leveragePoint(12)?.name).toBe('Constants, parameters, numbers (such as subsidies, taxes, standards)');
    expect(leveragePoint(9)?.name).toBe('The lengths of delays, relative to the rate of system change');
    expect(leveragePoint(6)?.name).toBe(
      'The structure of information flows (who does and does not have access to information)',
    );
    expect(leveragePoint(3)?.name).toBe('The goals of the system');
    expect(leveragePoint(1)?.name).toBe('The power to transcend paradigms');
  });

  it('every level has a description, at least one example (incl. EPC ones) and a verified Meadows (1999) citation', () => {
    for (const p of leveragePoints) {
      expect(p.description.length, `level ${p.level}`).toBeGreaterThan(40);
      expect(p.examples.length, `level ${p.level}`).toBeGreaterThan(0);
      expect(p.source).toEqual({ key: 'meadows-1999', verified: true });
    }
    const text = leveragePoints.flatMap((p) => p.examples).join(' ');
    expect(text).toMatch(/spool|EPC|engineer|inspection|procurement/i);
  });

  it('leveragePoint returns undefined outside 1..12', () => {
    expect(leveragePoint(0)).toBeUndefined();
    expect(leveragePoint(13)).toBeUndefined();
  });
});
