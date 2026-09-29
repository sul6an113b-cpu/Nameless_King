import { describe, expect, it } from 'vitest';
import type { Patch, PatchOp } from '@looplab/core';
import { describeOp, opSign } from './describe.ts';
import { sampleModel, samplePatch } from './fixtures.ts';
import { renderMarkdown } from './sanitize.ts';

const m = sampleModel();
const d = (op: PatchOp, patch: Patch = samplePatch) => describeOp(op, m, patch);

describe('describeOp', () => {
  it('describes adds, updates and removes with names from the model and the patch', () => {
    const [add, link, update] = samplePatch.ops as [PatchOp, PatchOp, PatchOp];
    expect(d(add)).toBe('Variable "Schedule Pressure"');
    expect(d(link)).toBe('Link Schedule Pressure → Rework (+, delay) — haste');
    expect(d(update)).toBe('Link Work Remaining → Rework: polarity → "-"');
    expect(d({ opId: 'x', op: 'remove', entity: 'variable', id: 'v_a' })).toBe('Remove variable "Work Remaining"');
    expect(d({ opId: 'x', op: 'add', entity: 'intervention', value: { name: 'QA', leverage: 9 } })).toBe(
      'Intervention "QA" (Meadows level 9)',
    );
    expect(d({ opId: 'x', op: 'add', entity: 'loopAnnotation', value: { key: 'v_a>v_b', name: 'R1' } })).toBe(
      'Loop name "R1" for Work Remaining → Rework',
    );
    expect(d({ opId: 'x', op: 'add', entity: 'scenario', value: { name: 'S', overrides: [{}] } })).toBe(
      'Scenario "S" (1 override(s))',
    );
    expect(d({ opId: 'x', op: 'add', entity: 'variable', value: { name: 'Backlog', kind: 'stock' } })).toBe(
      'Variable "Backlog" (stock)',
    );
    expect(opSign(add)).toBe('+');
    expect(opSign(update)).toBe('~');
  });
});

describe('renderMarkdown', () => {
  it('renders markdown and strips scripts, handlers, styles and images', () => {
    const html = renderMarkdown(
      '# T\n<script>x()</script><img src="https://evil.example/?q=1"><p style="color:red" onclick="x()">p</p>\n\n[bad](javascript:alert(1)) [ok](https://example.com)',
    );
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('<a href="https://example.com">ok</a>');
    expect(html).not.toMatch(/<script|<img|onclick|style=|href="javascript:/);
  });
});
