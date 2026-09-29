import { describe, expect, it } from 'vitest';
import {
  addLink,
  addVariable,
  connectFlow,
  createEmptyModel,
  setLayout,
  type Model,
  type Patch,
  type PatchPreview,
} from '@looplab/core';
import { buildCld, buildSfd, cloudId } from './build.ts';
import { buildGhosts, rejectedIds } from './ghosts.ts';

function model(): Model {
  let m = createEmptyModel('B', { id: 'm_b', now: '2026-01-01T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_s', name: 'Backlog', kind: 'stock', equation: '100' });
  m = addVariable(m, { id: 'v_f', name: 'Completion', kind: 'flow', equation: 'Backlog / 4' });
  m = addVariable(m, { id: 'v_c', name: 'Staff', kind: 'constant', equation: '5' });
  m = addVariable(m, { id: 'v_q', name: 'Quality' });
  m = connectFlow(m, 'v_f', { from: 'v_s' });
  m = addLink(m, { id: 'l_sf', from: 'v_s', to: 'v_f', polarity: '+' });
  m = addLink(m, { id: 'l_cf', from: 'v_c', to: 'v_f', polarity: '+', delay: true, confidence: 'low' });
  return setLayout(m, 'cld', { v_s: { x: 10, y: 20 } });
}

const patch: Patch = {
  id: 'p_1',
  title: 'Add rework',
  rationale: 'hypothesis',
  ops: [
    { opId: 'o1', op: 'add', entity: 'variable', value: { id: 'v_r', name: 'Rework' } },
    { opId: 'o2', op: 'add', entity: 'link', value: { id: 'l_rs', from: 'v_r', to: 'v_s', polarity: '+' } },
    { opId: 'o3', op: 'update', entity: 'link', id: 'l_cf', changes: { polarity: '-' } },
    { opId: 'o4', op: 'remove', entity: 'variable', id: 'v_q' },
  ],
};

function fakePreview(m: Model): { status: 'ok'; value: PatchPreview } {
  let p = addVariable(m, { id: 'v_r', name: 'Rework', origin: 'ai-proposed' });
  p = addLink(p, { id: 'l_rs', from: 'v_r', to: 'v_s', polarity: '+', origin: 'ai-proposed' });
  return {
    status: 'ok',
    value: { added: { variables: ['v_r'], links: ['l_rs'] }, changed: ['l_cf'], removed: ['v_q'], preview: p },
  };
}

describe('CLD projection → React Flow elements', () => {
  it('has one node per variable and one causal edge per link, with test ids and link data', () => {
    const { nodes, edges } = buildCld(model(), null, null);
    expect(nodes.map((n) => n.id).sort()).toEqual(['v_c', 'v_f', 'v_q', 'v_s']);
    expect(nodes.find((n) => n.id === 'v_s')).toMatchObject({
      position: { x: 10, y: 20 },
      data: { testId: 'node-v_s' },
    });
    expect(edges.map((e) => e.id).sort()).toEqual(['l_cf', 'l_sf', 'l_v_f__v_s'].sort());
    expect(edges.find((e) => e.id === 'l_cf')).toMatchObject({
      type: 'causal',
      data: { polarity: '+', delay: true, confidence: 'low', testId: 'edge-l_cf' },
    });
  });

  it('places unpositioned variables on a grid without overlaps', () => {
    const { nodes } = buildCld(model(), null, null);
    const ps = nodes.map((n) => n.position);
    expect(new Set(ps.map((p) => `${p.x},${p.y}`)).size).toBe(ps.length);
  });

  it('marks the link-mode source node', () => {
    const { nodes } = buildCld(model(), null, 'v_c');
    expect(nodes.find((n) => n.id === 'v_c')?.data.linkSource).toBe(true);
  });
});

describe('SFD projection → React Flow elements', () => {
  it('draws flows as valves with pipes to stocks or clouds, and only non-implied links as connectors', () => {
    const { nodes, edges } = buildSfd(model(), null, null);
    expect(nodes.find((n) => n.id === 'v_s')?.type).toBe('stock');
    expect(nodes.find((n) => n.id === 'v_f')?.type).toBe('flow');
    expect(nodes.find((n) => n.id === 'v_c')?.type).toBe('constant');
    expect(nodes.find((n) => n.id === 'v_q')?.type).toBe('sfdvar'); // unquantified
    const cloud = nodes.find((n) => n.id === cloudId('v_f', 'to'));
    expect(cloud).toMatchObject({ type: 'cloud', draggable: false, selectable: false });
    expect(nodes.find((n) => n.id === cloudId('v_f', 'from'))).toBeUndefined(); // drains a stock
    expect(edges.filter((e) => e.type === 'pipe').map((e) => [e.source, e.target])).toEqual([
      ['v_s', 'v_f'],
      ['v_f', cloudId('v_f', 'to')],
    ]);
    // the implied flow→stock link is the pipe itself, not an info connector
    expect(
      edges
        .filter((e) => e.type === 'causal')
        .map((e) => e.id)
        .sort(),
    ).toEqual(['l_cf', 'l_sf']);
  });
});

describe('copilot patch ghosts', () => {
  it('without a pending patch there is no overlay', () => {
    expect(buildGhosts(model(), null, {})).toBeNull();
  });

  it('an unavailable or failing preview means no overlay, never a broken canvas', () => {
    expect(buildGhosts(model(), patch, {}, () => ({ status: 'unavailable', what: 'Patch preview' }))).toBeNull();
    expect(buildGhosts(model(), patch, {}, () => ({ status: 'error', message: 'bad op' }))).toBeNull();
  });

  it('shows added variables/links as ghosts and flags changed/removed elements', () => {
    const m = model();
    const overlay = buildGhosts(m, patch, {}, fakePreview);
    expect(overlay?.variables.map((v) => v.id)).toEqual(['v_r']);
    const { nodes, edges } = buildCld(m, overlay, null);
    expect(nodes.find((n) => n.id === 'v_r')).toMatchObject({
      type: 'ghost',
      draggable: false,
      data: { testId: 'ghost-v_r' },
    });
    expect(edges.find((e) => e.id === 'ghost:l_rs')).toMatchObject({
      data: { diff: 'added', testId: 'ghost-edge-l_rs' },
    });
    expect(edges.find((e) => e.id === 'l_cf')?.data?.diff).toBe('changed');
    expect(nodes.find((n) => n.id === 'v_q')?.data.diff).toBe('removed');
  });

  it('ops the engineer rejected disappear from the overlay (and links to rejected ghosts too)', () => {
    expect([...rejectedIds(patch, { o1: 'reject', o3: 'reject' })].sort()).toEqual(['l_cf', 'v_r']);
    const overlay = buildGhosts(model(), patch, { o1: 'reject', o4: 'accept' }, fakePreview);
    expect(overlay?.variables).toEqual([]);
    expect(overlay?.links).toEqual([]); // l_rs pointed at the rejected v_r
    expect(overlay?.removed.has('v_q')).toBe(true);
  });
});
