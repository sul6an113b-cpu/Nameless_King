import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addVariable, createEmptyModel, NotImplementedError, type Model, type ParseResult } from '@looplab/core';
import { loadModel } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { EquationEditor } from './EquationEditor.tsx';

// The parser belongs to sd-engine; pin the SPEC §6.1 contract with a small fake so this test is stable
// before and after the merge. An unbalanced "(" is a parse error spanning from the "(" to the end.
const parse = vi.hoisted(() =>
  vi.fn((src: string): ParseResult => {
    const i = src.indexOf('(');
    if (i >= 0 && !src.includes(')'))
      return { ok: false, error: { message: 'Missing ")"', span: { start: i, end: src.length } } };
    return { ok: true, ast: { k: 'num', v: 0 } };
  }),
);
vi.mock('@looplab/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@looplab/core')>()),
  parseEquation: parse,
}));

function model(): Model {
  let m = createEmptyModel('Q', { id: 'm_q', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_s', name: 'Backlog', kind: 'stock', equation: '100' });
  m = addVariable(m, { id: 'v_p', name: 'Staff productivity', kind: 'constant', equation: '2' });
  m = addVariable(m, { id: 'v_f', name: 'Completion', kind: 'flow' });
  return m;
}

const equation = () => useModelStore.getState().model.variables.find((v) => v.id === 'v_f')?.equation;

function setup(value = '') {
  render(<EquationEditor varId="v_f" label="Equation" value={value} />);
  return { user: userEvent.setup(), box: screen.getByRole('combobox') };
}

beforeEach(() => {
  parse.mockReset(); // back to the fake implementation above
  loadModel(model());
});

describe('equation editor', () => {
  it('suggests variable names (underscored) for the identifier at the caret', async () => {
    const { user, box } = setup();
    await user.type(box, 'staff');
    const options = screen.getAllByRole('option');
    expect(options[0]?.textContent).toContain('Staff_productivity');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText('Completion')).toBeNull(); // never suggests itself
  });

  it('Enter accepts the active suggestion; the caret lands after it; blur commits one undo step', async () => {
    const { user, box } = setup();
    await user.type(box, 'Back');
    await user.keyboard('{Enter}');
    expect((box as HTMLTextAreaElement).value).toBe('Backlog');
    await user.type(box, ' / 4');
    expect((box as HTMLTextAreaElement).value).toBe('Backlog / 4');
    await user.tab();
    expect(equation()).toBe('Backlog / 4');
    expect(useModelStore.getState().past.map((p) => p.label)).toEqual(['Edit equation']);
  });

  it('ArrowDown/ArrowUp move through suggestions; builtins are offered too', async () => {
    const { user, box } = setup();
    await user.type(box, 'st');
    const labels = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(labels.some((l) => l.includes('Staff_productivity'))).toBe(true);
    expect(labels.some((l) => l.includes('STEP'))).toBe(true);
    await user.keyboard('{ArrowDown}');
    expect(screen.getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowUp}{Escape}');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Enter without an open list commits; Shift+Enter would add a newline', async () => {
    const { user, box } = setup();
    await user.type(box, '42{Enter}');
    expect(equation()).toBe('42');
  });

  it('shows inline parse diagnostics with the error span highlighted', async () => {
    const { user, box } = setup();
    await user.type(box, 'MAX(1, 2');
    await user.keyboard('{Escape}');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Missing ")"');
    expect(alert.querySelector('mark')?.textContent).toBe('(1, 2');
    expect(box.getAttribute('aria-invalid')).toBe('true');
  });

  it('shows a calm note while the parser is not available yet', async () => {
    parse.mockImplementation(() => {
      throw new NotImplementedError('parser.parseEquation');
    });
    const { user, box } = setup();
    await user.type(box, '1');
    expect(screen.getByText(/Equation checking is available after integration/)).toBeTruthy();
  });
});
