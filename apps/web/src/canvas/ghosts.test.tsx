import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act as rtlAct, render, screen } from '@testing-library/react';
import {
  addLink,
  addVariable,
  createEmptyModel,
  setLayout,
  type Model,
  type Patch,
  type PatchPreview,
} from '@looplab/core';
import { useCopilotStore } from '../copilot/index.ts';
import { loadModel } from '../state/actions.ts';
import { useModelStore } from '../state/store.ts';
import { CldCanvas } from './CldCanvas.tsx';
import { SfdCanvas } from './SfdCanvas.tsx';

// previewPatch belongs to the copilot agent; this test pins its contract (SPEC §7.3) with a fake.
vi.mock('@looplab/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@looplab/core')>();
  return {
    ...core,
    previewPatch: (m: Model): PatchPreview => {
      let p = core.addVariable(m, { id: 'v_new', name: 'Fatigue', origin: 'ai-proposed' });
      p = core.addLink(p, { id: 'l_new', from: 'v_new', to: 'v_b', polarity: '+', origin: 'ai-proposed' });
      return { added: { variables: ['v_new'], links: ['l_new'] }, changed: ['l_ab'], removed: ['v_a'], preview: p, targets: {}, skipped: [] };
    },
  };
});

const patch: Patch = {
  id: 'p1',
  title: 'Fatigue drives rework',
  rationale: 'hypothesis',
  ops: [
    { opId: 'o1', op: 'add', entity: 'variable', value: { id: 'v_new', name: 'Fatigue' } },
    { opId: 'o2', op: 'add', entity: 'link', value: { id: 'l_new', from: 'v_new', to: 'v_b' } },
    { opId: 'o3', op: 'update', entity: 'link', id: 'l_ab', changes: { polarity: '-' } },
    { opId: 'o4', op: 'remove', entity: 'variable', id: 'v_a' },
  ],
};

function model(): Model {
  let m = createEmptyModel('G', { id: 'm_g', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'Work remaining' });
  m = addVariable(m, { id: 'v_b', name: 'Rework' });
  m = addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b' });
  return setLayout(m, 'cld', { v_a: { x: 0, y: 0 }, v_b: { x: 300, y: 0 } });
}

beforeEach(() => {
  loadModel(model());
  useCopilotStore.getState().setPendingPatch(null);
});

describe('patch ghosts on the canvas', () => {
  it('no pending patch: no ghosts', () => {
    render(<CldCanvas />);
    expect(screen.queryByTestId('ghost-v_new')).toBeNull();
  });

  it('renders added elements as ghosts and flags changed/removed ones, without touching the model', () => {
    const before = useModelStore.getState().model;
    useCopilotStore.getState().setPendingPatch(patch);
    render(<CldCanvas />);
    expect(screen.getByTestId('ghost-v_new').textContent).toContain('Fatigue');
    expect(screen.getByTestId('ghost-edge-l_new')).toBeTruthy();
    expect(screen.getByTestId('edge-l_ab').getAttribute('class')).toContain('diff-changed');
    expect(screen.getByTestId('node-v_a').className).toContain('diff-removed');
    expect(useModelStore.getState().model).toBe(before); // AI proposes, engineer disposes
  });

  it('a rejected op disappears from the overlay', () => {
    useCopilotStore.getState().setPendingPatch(patch);
    render(<CldCanvas />);
    rtlAct(() => useCopilotStore.getState().decideOp('o1', 'reject'));
    expect(screen.queryByTestId('ghost-v_new')).toBeNull();
    expect(screen.queryByTestId('ghost-edge-l_new')).toBeNull(); // its link depended on the rejected variable
    expect(screen.getByTestId('node-v_a').className).toContain('diff-removed');
  });

  it('ghosts also show on the SFD lens', () => {
    useCopilotStore.getState().setPendingPatch(patch);
    render(<SfdCanvas />);
    expect(screen.getByTestId('ghost-v_new')).toBeTruthy();
  });
});
