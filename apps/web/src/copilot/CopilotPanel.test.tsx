import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CopilotResponse } from '@looplab/core';
import { useModelStore } from '../state/store.ts';
import { CopilotPanel } from './CopilotPanel.tsx';
import { useCopilotStore } from './store.ts';
import { patchResponse, sampleModel, stubFetch, usage } from './fixtures.ts';

let restore = () => {};
beforeEach(() => {
  useModelStore.getState().load(sampleModel());
  useCopilotStore.getState().reset();
});
afterEach(() => restore());

const respond = (r: (CopilotResponse | Error)[]) => {
  const f = stubFetch(r);
  restore = f.restore;
  return f;
};

describe('CopilotPanel', () => {
  it('mode picker + send; a question renders with options; trace collapsed; usage per call visible', async () => {
    const f = respond([
      {
        ok: true,
        output: {
          kind: 'question',
          question: 'What behaviour over time worries you?',
          options: ['Late growth of rework'],
          why: 'reference mode',
        },
        trace: [{ name: 'get_model_summary', input: {}, ok: true, summary: '2 variables', ms: 2 }],
        usage,
        model: 'claude-test',
      },
    ]);
    render(<CopilotPanel stage="frame" />);
    await userEvent.click(screen.getByTestId('copilot-mode-interview'));
    expect(screen.getByTestId('copilot-mode-interview').getAttribute('aria-checked')).toBe('true');
    await userEvent.type(screen.getByTestId('copilot-input'), 'Projects finish late');
    await userEvent.click(screen.getByTestId('copilot-send'));

    expect(await screen.findByText('What behaviour over time worries you?')).toBeTruthy();
    expect(f.bodies[0]).toMatchObject({
      mode: 'interview',
      stage: 'frame',
      messages: [{ role: 'user', text: 'Projects finish late' }],
    });
    const trace = screen.getByTestId<HTMLDetailsElement>('copilot-trace');
    expect(trace.open).toBe(false);
    expect(within(trace).getByText('get_model_summary')).toBeTruthy();
    const usageList = screen.getByTestId('copilot-usage');
    expect(usageList.textContent).toContain('#1 in 1,200 · cache read 0 · cache write 4,000 · out 80');
    expect(usageList.textContent).toContain('#2 in 300 · cache read 5,200');

    // an option button answers the question as the next message
    await userEvent.click(screen.getByRole('button', { name: 'Late growth of rework' }));
    expect(f.bodies[1]).toMatchObject({
      messages: [{ role: 'user' }, { role: 'assistant' }, { role: 'user', text: 'Late growth of rework' }],
    });
  });

  it('a proposed patch is a diff list; nothing applies without accept; accepted ops apply and can be confirmed', async () => {
    respond([patchResponse]);
    render(<CopilotPanel />);
    await userEvent.click(screen.getByTestId('copilot-send'));
    const op1 = await screen.findByTestId('patch-op-op1');
    expect(op1.textContent).toContain('Variable "Schedule Pressure"');
    expect(screen.getByTestId('patch-op-op2').textContent).toContain('Link Schedule Pressure → Rework (+, delay)');
    expect(screen.getByTestId('patch-op-op3').textContent).toContain('Link Work Remaining → Rework: polarity → "-"');
    expect(screen.getByText('Hypothesis: Pressure raises the error rate')).toBeTruthy();

    const before = useModelStore.getState().model;
    const apply = screen.getByTestId<HTMLButtonElement>('patch-apply');
    expect(apply.disabled).toBe(true);
    await userEvent.click(screen.getByTestId('patch-reject-all'));
    expect(apply.disabled).toBe(true);
    expect(useModelStore.getState().model).toBe(before);

    await userEvent.click(screen.getByTestId('patch-accept-op1'));
    expect(screen.getByTestId('patch-op-op1').getAttribute('data-decision')).toBe('accept');
    expect(screen.getByTestId('patch-op-op2').getAttribute('data-decision')).toBe('reject');
    await userEvent.click(screen.getByTestId('patch-apply'));

    const model = useModelStore.getState().model;
    expect(model.variables.map((v) => [v.id, v.origin])).toEqual([
      ['v_a', 'user'],
      ['v_b', 'user'],
      ['v_p', 'ai-proposed'],
    ]);
    expect(model.links.map((l) => l.id)).toEqual(['l_ab']);
    expect(model.links[0]?.polarity).toBe('+');
    expect(screen.queryByTestId('patch-review')).toBeNull();
    expect(screen.getByTestId('patch-result').textContent).toContain('Applied 1 change(s)');

    // accepted AI elements stay tagged until marked confirmed
    expect(screen.getByTestId('ai-proposed-list').textContent).toContain('Schedule Pressure');
    await userEvent.click(screen.getByTestId('confirm-v_p'));
    expect(useModelStore.getState().model.variables.find((v) => v.id === 'v_p')?.origin).toBe('ai-confirmed');
    expect(screen.queryByTestId('ai-proposed-list')).toBeNull();
  });

  it('an op whose dependency was rejected is skipped with its reason', async () => {
    respond([patchResponse]);
    render(<CopilotPanel />);
    await userEvent.click(screen.getByTestId('copilot-send'));
    await userEvent.click(await screen.findByTestId('patch-reject-op1'));
    await userEvent.click(screen.getByTestId('patch-accept-op2'));
    await userEvent.click(screen.getByTestId('patch-apply'));
    const result = screen.getByTestId('patch-result').textContent ?? '';
    expect(result).toContain('Nothing was applied.');
    expect(result).toContain('Skipped op2: depends on variable "v_p" (rejected in op1)');
    expect(useModelStore.getState().model.variables).toHaveLength(2);
  });

  it('errors show in copilot-error with the trace, and change nothing', async () => {
    respond([
      {
        ok: false,
        error: {
          code: 'invalid-output',
          message: "Claude's propose_patch answer was invalid twice; nothing was changed.",
        },
        trace: [{ name: 'propose_patch', input: {}, ok: false, summary: 'invalid output', ms: 0 }],
        usage,
      },
    ]);
    const before = useModelStore.getState().model;
    render(<CopilotPanel />);
    await userEvent.click(screen.getByTestId('copilot-send'));
    const err = await screen.findByTestId('copilot-error');
    expect(err.textContent).toContain('invalid twice');
    expect(within(err).getByTestId('copilot-trace')).toBeTruthy();
    expect(screen.queryByTestId('patch-review')).toBeNull();
    expect(useModelStore.getState().model).toBe(before);
  });

  it('a refusal reads "Claude declined"', async () => {
    respond([
      {
        ok: false,
        error: { code: 'refusal', message: 'Claude declined this request; nothing was changed.' },
        trace: [],
        usage,
      },
    ]);
    render(<CopilotPanel />);
    await userEvent.click(screen.getByTestId('copilot-send'));
    expect((await screen.findByTestId('copilot-error')).textContent).toContain('Claude declined');
  });

  it('answers render sanitised markdown, findings with element ids, and hypotheses', async () => {
    respond([
      {
        ok: true,
        output: {
          kind: 'answer',
          markdown: '## Findings\n<img src=x onerror="alert(1)"><script>alert(2)</script>**Bold** text',
          findings: [
            { elementIds: ['l_ab'], severity: 'warning', rule: 'missing-delay', message: 'Rework is found late.' },
          ],
          hypotheses: ['Testing is the bottleneck'],
        },
        trace: [],
        usage,
        model: 'claude-test',
      },
    ]);
    const { container } = render(<CopilotPanel />);
    await userEvent.click(screen.getByTestId('copilot-mode-critique'));
    await userEvent.click(screen.getByTestId('copilot-send'));
    expect(await screen.findByText('Bold')).toBeTruthy();
    expect(container.querySelector('.cp-md img, .cp-md script')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
    expect(screen.getByText(/Rework is found late\./).textContent).toContain('missing-delay');
    expect(screen.getByText('Hypothesis: Testing is the bottleneck')).toBeTruthy();
  });
});
