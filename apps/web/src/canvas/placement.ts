/** Where to drop a new node: the free grid cell nearest the requested point (so adds never stack). */
import type { XY } from '@looplab/core';

export function freeSpot(want: XY, taken: XY[], cell = { w: 170, h: 76 }): XY {
  const clear = (p: XY) => taken.every((t) => Math.abs(t.x - p.x) >= cell.w - 10 || Math.abs(t.y - p.y) >= cell.h - 10);
  for (let r = 0; r <= 8; r++) {
    const ring: XY[] = [];
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++)
        if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push({ x: want.x + i * cell.w, y: want.y + j * cell.h });
    ring.sort((a, b) => Math.hypot(a.x - want.x, a.y - want.y) - Math.hypot(b.x - want.x, b.y - want.y));
    const hit = ring.find(clear);
    if (hit) return hit;
  }
  return want;
}
