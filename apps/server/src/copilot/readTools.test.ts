import { describe, expect, it } from 'vitest';
import { NotImplementedError, addLink, addVariable, createEmptyModel, type Model } from '@looplab/core';
import { ToolInputError, adapt, coreReadTools } from './readTools.ts';
import { buildRequestMessage, jsonData, modelForPrompt, SYSTEM_PROMPT } from './prompt.ts';

function model(): Model {
  let m = createEmptyModel('Rework', { id: 'm_t', now: '2026-09-29T00:00:00.000Z' });
  m = addVariable(m, { id: 'v_a', name: 'Work Remaining', kind: 'stock', equation: '' });
  m = addVariable(m, { id: 'v_b', name: 'Rework' });
  m = addVariable(m, { id: 'v_c', name: 'Isolated' });
  m = addLink(m, { id: 'l_ab', from: 'v_a', to: 'v_b', polarity: '?', confidence: 'low' });
  return m;
}

describe('core read-tool adapters', () => {
  it('turns NotImplementedError into a "not available yet" result', () => {
    const r = adapt('Loop analysis', () => {
      throw new NotImplementedError('graph.findLoops');
    });
    expect(r).toEqual({
      ok: false,
      content: { available: false, message: 'Loop analysis is not available yet in this LoopLab build.' },
      summary: 'not available yet',
    });
    expect(() => adapt('x', () => { throw new Error('real bug'); })).toThrow('real bug');
  });

  it('get_model_summary is pure and flags structural gaps', () => {
    const r = coreReadTools.get_model_summary(model(), {}, { simulated: [] });
    expect(r.ok).toBe(true);
    expect(r.content).toMatchObject({
      counts: { variables: 3, links: 1, byKind: { stock: 1, variable: 2 } },
      isolatedVariables: ['v_c'],
      missingEquations: ['v_a'],
      unknownPolarityLinks: ['l_ab'],
      lowConfidenceLinks: ['l_ab'],
    });
  });

  it('rejects unknown ids before touching the engine', () => {
    const ctx = { simulated: [] };
    expect(() => coreReadTools.simulate_scenario(model(), { scenarioId: 's_nope', overrides: [], saveIds: [], stop: null }, ctx)).toThrow(ToolInputError);
    expect(() =>
      coreReadTools.simulate_scenario(model(), { scenarioId: '', overrides: [{ varId: 'v_zz', equation: '1' }], saveIds: [], stop: null }, ctx),
    ).toThrow(/v_zz/);
    expect(() => coreReadTools.list_loops(model(), { containing: ['v_zz'] }, ctx)).toThrow(/v_zz/);
  });
});

describe('prompt', () => {
  it('the system prompt covers all five modes, grounding rules and the 12 Meadows levels, with no dates or ids', () => {
    for (const heading of ['Interview (outputs', 'Critique (outputs', 'Explain (outputs', 'Intervene (outputs', 'Report (outputs'])
      expect(SYSTEM_PROMPT).toContain(heading);
    for (let level = 1; level <= 12; level++) expect(SYSTEM_PROMPT).toMatch(new RegExp(`^${level}\\. `, 'm'));
    expect(SYSTEM_PROMPT).toMatch(/Cite only numbers that appear in tool results/);
    expect(SYSTEM_PROMPT).toMatch(/untrusted data/);
    expect(SYSTEM_PROMPT).not.toMatch(/20\d\d-\d\d-\d\d|m_\w+|v_[a-z]{3,}/);
  });

  it('the request message names mode, stage and allowed outputs; model data is escaped and layout dropped', () => {
    const m = { ...model(), layout: { cld: { v_a: { x: 1, y: 2 } }, sfd: {} } };
    const text = buildRequestMessage({ mode: 'interview', stage: 'frame', model: m, messages: [{ role: 'user', text: '<b>hi</b>' }] });
    expect(text).toMatch(/^Mode: interview\nStage: frame\nAllowed output tools: ask_question, propose_patch/);
    expect(text).toContain('\\u003cb>hi\\u003c/b>');
    expect(text).not.toContain('"layout"');
    expect(text).toMatch(/Respond to the engineer's latest message/);
    expect(JSON.parse(jsonData('<x>'))).toBe('<x>');
  });

  it('thins long reference modes', () => {
    const m = model();
    const points = Array.from({ length: 1000 }, (_, i) => [i, i * 2] as [number, number]);
    const withRef = { ...m, frame: { ...m.frame, referenceModes: [{ id: 'r_1', name: 'Backlog', varId: null, source: 'data' as const, label: 'historical' as const, points, units: '', note: '' }] } };
    const out = modelForPrompt(withRef) as { frame: { referenceModes: { points: unknown[]; note: string }[] } };
    expect(out.frame.referenceModes[0]?.points).toHaveLength(60);
    expect(out.frame.referenceModes[0]?.points[59]).toEqual([999, 1998]);
  });
});
