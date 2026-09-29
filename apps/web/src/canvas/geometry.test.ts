import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { arrowHead, boundaryPoint, center, curvedEdge, delayMark, pipeEdge, selfLoopEdge, type Box } from './geometry.ts';

const rect = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h, shape: 'rect' });
const circle = (x: number, y: number, d = 24): Box => ({ x, y, w: d, h: d, shape: 'circle' });

describe('edge geometry', () => {
  it('boundaryPoint lands on the rectangle edge (plus gap) toward the target', () => {
    const b = rect(0, 0); // centre (50, 20)
    expect(boundaryPoint(b, { x: 500, y: 20 }, 0)).toEqual({ x: 100, y: 20 });
    expect(boundaryPoint(b, { x: 50, y: -300 }, 0)).toEqual({ x: 50, y: 0 });
    const p = boundaryPoint(b, { x: 500, y: 20 }, 3);
    expect(p.x).toBeCloseTo(103);
  });

  it('boundaryPoint on a circle is at radius + gap', () => {
    const b = circle(0, 0, 20);
    const p = boundaryPoint(b, { x: 100, y: 110 }, 2);
    expect(Math.hypot(p.x - 10, p.y - 10)).toBeCloseTo(12);
  });

  it('property: boundary points of rectangles lie on the (inflated) rectangle border', () => {
    fc.assert(
      fc.property(fc.double({ min: -1000, max: 1000, noNaN: true }), fc.double({ min: -1000, max: 1000, noNaN: true }), (tx, ty) => {
        const b = rect(0, 0, 120, 36);
        const c = center(b);
        fc.pre(Math.hypot(tx - c.x, ty - c.y) > 1);
        const p = boundaryPoint(b, { x: tx, y: ty }, 0);
        const onVertical = Math.abs(Math.abs(p.x - c.x) - 60) < 1e-6 && Math.abs(p.y - c.y) <= 18 + 1e-6;
        const onHorizontal = Math.abs(Math.abs(p.y - c.y) - 18) < 1e-6 && Math.abs(p.x - c.x) <= 60 + 1e-6;
        return onVertical || onHorizontal;
      }),
    );
  });

  it('A→B and B→A curve to opposite sides, so two opposing links never overlap', () => {
    const a = rect(0, 0);
    const b = rect(300, 0);
    const ab = curvedEdge(a, b);
    const ba = curvedEdge(b, a);
    // mid points sit on opposite sides of the centre line y = 20
    expect(Math.sign(ab.mid.y - 20)).toBe(-Math.sign(ba.mid.y - 20));
    expect(ab.d.startsWith('M')).toBe(true);
    expect(ab.d).toContain('Q');
  });

  it('the arrow tip is at the target boundary and points into the target', () => {
    const g = curvedEdge(rect(0, 0), rect(300, 0));
    expect(g.tip.x).toBeGreaterThan(290);
    expect(g.tip.x).toBeLessThan(300);
    expect(g.dir.x).toBeGreaterThan(0.5);
    expect(Math.hypot(g.dir.x, g.dir.y)).toBeCloseTo(1);
  });

  it('a self-link is a loop above the node that ends pointing back down', () => {
    const b = rect(100, 100);
    const g = selfLoopEdge(b);
    expect(g.d).toContain('C');
    expect(g.label.y).toBeLessThan(100);
    expect(g.dir.y).toBeGreaterThan(0);
  });

  it('pipes have two parallel walls; arrowheads and delay marks are closed/two-stroke paths', () => {
    const p = pipeEdge(rect(0, 0), circle(300, 8));
    expect(p.walls).toHaveLength(2);
    expect(p.walls[0]).not.toBe(p.walls[1]);
    expect(arrowHead({ x: 10, y: 10 }, { x: 1, y: 0 })).toMatch(/^M10,10 L.* Z$/);
    expect(delayMark({ x: 0, y: 0 }, { x: 1, y: 0 }).match(/M/g)).toHaveLength(2);
  });
});
