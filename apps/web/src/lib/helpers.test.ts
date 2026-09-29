import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addVariable, createEmptyModel } from '@looplab/core';
import { applySuggestion, suggest, tokenAt } from './autocomplete.ts';
import { parseReferenceCsv } from './csv.ts';
import { builtinSuggestions } from './engine.ts';
import { fileStem } from './files.ts';
import { lookupPath, parseRows, toRows } from './lookup.ts';
import { equationName, nextVariableName } from './names.ts';
import { finalizeStroke, toData, toPixel } from './sketch.ts';

describe('reference-mode CSV import', () => {
  it('parses comma, semicolon and tab files with an optional header', () => {
    expect(parseReferenceCsv('time,Backlog\n0,10\n1,12\n2,15\n')).toEqual({
      ok: true,
      points: [
        [0, 10],
        [1, 12],
        [2, 15],
      ],
      header: ['time', 'Backlog'],
    });
    const semi = parseReferenceCsv('0;1\r\n1;2');
    expect(semi.ok && semi.points).toEqual([
      [0, 1],
      [1, 2],
    ]);
    const tab = parseReferenceCsv('t\tv\n0\t1.5\n\n2\t-3e2');
    expect(tab.ok && tab.points).toEqual([
      [0, 1.5],
      [2, -300],
    ]);
  });

  it('rejects bad input with a row number and never throws', () => {
    expect(parseReferenceCsv('')).toMatchObject({ ok: false });
    expect(parseReferenceCsv('a,b')).toMatchObject({ ok: false, error: 'No data rows found.' });
    expect(parseReferenceCsv('0,1\n1,x')).toMatchObject({ ok: false, error: expect.stringContaining('Row 2') });
    expect(parseReferenceCsv('0,1\n0,2')).toMatchObject({ ok: false, error: expect.stringContaining('ascending') });
    expect(parseReferenceCsv('0\n1')).toMatchObject({ ok: false, error: expect.stringContaining('two columns') });
    fc.assert(fc.property(fc.string(), (s) => typeof parseReferenceCsv(s).ok === 'boolean'));
  });
});

describe('sketch pad', () => {
  const r = { t0: 0, t1: 24, yMin: 0, yMax: 100 };
  const box = { width: 400, height: 170 };

  it('maps pixels to data and back', () => {
    expect(toData(0, 170, box, r)).toEqual([0, 0]);
    expect(toData(400, 0, box, r)).toEqual([24, 100]);
    const [x, y] = toPixel(12, 50, box, r);
    expect(x).toBeCloseTo(200);
    expect(y).toBeCloseTo(85);
    expect(toData(-50, 500, box, r)).toEqual([0, 0]); // clamped
    expect(toData(10, 10, { width: 0, height: 0 }, r)).toEqual([0, 0]); // no layout yet
  });

  it('finalises a stroke into time-ascending, de-duplicated points', () => {
    const raw: [number, number][] = [
      [5.02, 10],
      [1, 5],
      [5.06, 20], // same time bin as 5.02: the later value wins
      [23, 90],
    ];
    const pts = finalizeStroke(raw, r);
    for (let i = 1; i < pts.length; i++) expect(pts[i]![0]).toBeGreaterThan(pts[i - 1]![0]);
    expect(pts).toHaveLength(3);
    expect(pts[1]![1]).toBe(20);
    expect(finalizeStroke([], r)).toEqual([]);
  });
});

describe('equation autocomplete', () => {
  const builtins = builtinSuggestions();

  it('finds the identifier at the caret', () => {
    expect(tokenAt('Work_rem', 8)).toEqual({ start: 0, end: 8, prefix: 'Work_rem' });
    expect(tokenAt('a + Pro * 2', 7)).toEqual({ start: 4, end: 7, prefix: 'Pro' });
    expect(tokenAt('a + ', 4)).toBeNull();
    expect(tokenAt('1e3', 3)).toBeNull();
    expect(tokenAt('"Work re', 8)).toBeNull(); // inside a quoted name
  });

  it('suggests variables (underscored) before builtins, matching case-insensitively', () => {
    const s = suggest('work', ['Work remaining', 'Workforce', 'Rework'], builtins);
    expect(s.map((x) => x.insert)).toEqual(['Work_remaining', 'Workforce', 'Rework']);
    const fns = suggest('sm', [], builtins);
    expect(fns[0]).toMatchObject({ kind: 'builtin' });
    expect(fns.map((x) => x.label)).toContain('SMTH1');
    expect(suggest('Rework', ['Rework'], [])).toEqual([]); // nothing to complete once typed in full
    expect(suggest('ste', [], builtins)[0]!.insert).toBe('STEP('); // functions open their argument list
    expect(suggest('tim', [], builtins)[0]!.label).toBe('TIME');
  });

  it('applies a suggestion and places the caret after it', () => {
    const text = 'a + Pro * 2';
    const tok = tokenAt(text, 7)!;
    const r = applySuggestion(text, tok, { kind: 'variable', label: 'Productivity', insert: 'Productivity', detail: '' });
    expect(r).toEqual({ text: 'a + Productivity * 2', caret: 16 });
  });
});

describe('lookup table helpers', () => {
  it('round-trips rows and validates strictly increasing x', () => {
    const rows = toRows({ xs: [0, 1, 2], ys: [0, 0.5, 1], mode: 'continuous' });
    expect(parseRows(rows)).toEqual({ ok: true, xs: [0, 1, 2], ys: [0, 0.5, 1] });
    expect(parseRows(rows.slice(0, 1))).toMatchObject({ ok: false });
    expect(parseRows([...rows, { x: '2', y: '3' }])).toMatchObject({ ok: false, error: expect.stringContaining('Row 4') });
    expect(parseRows([{ x: 'a', y: '1' }, ...rows])).toMatchObject({ ok: false });
  });

  it('draws steps in discrete mode', () => {
    const c = lookupPath([0, 1, 2], [0, 1, 0], 'continuous', 100, 50);
    const d = lookupPath([0, 1, 2], [0, 1, 0], 'discrete', 100, 50);
    expect(d.split('L').length).toBeGreaterThan(c.split('L').length);
  });
});

describe('names', () => {
  it('picks the first free default name and spells names for equations', () => {
    let m = createEmptyModel('t', { id: 'm_t', now: '2026-01-01T00:00:00.000Z' });
    expect(nextVariableName(m, 'variable')).toBe('Variable 1');
    m = addVariable(m, { id: 'v_1', name: 'Variable 1' });
    expect(nextVariableName(m, 'variable')).toBe('Variable 2');
    expect(nextVariableName(m, 'stock')).toBe('Stock 1');
    expect(equationName('  Work   remaining ')).toBe('Work_remaining');
    expect(fileStem('EPC: rework / v2')).toBe('EPC-rework-v2');
    expect(fileStem('???')).toBe('model');
  });
});
