import { describe, expect, it } from 'vitest';
import { ArchetypeId, ModelSchema, findLoops, matchArchetypes, runHealth, simulate } from '@looplab/core';
import { archetypes } from './archetypes/index.ts';
import { explainShape } from './shapes.ts';
import { bibliography } from './sources.ts';
import { engineReady, graphReady, loopCounts, simulateScenario, structureIssues } from './testing.ts';

/** Hand-verified feedback loops of each canonical CLD (Kim 1992 templates; see the archetype files). */
const cldLoops: Record<ArchetypeId, { R: number; B: number }> = {
  'fixes-that-fail': { R: 1, B: 1 },
  'shifting-the-burden': { R: 1, B: 2 },
  'limits-to-growth': { R: 1, B: 1 },
  'eroding-goals': { R: 0, B: 2 },
  escalation: { R: 0, B: 2 }, // two balancing loops forming a reinforcing figure-8
  'success-to-the-successful': { R: 2, B: 0 },
  'tragedy-of-the-commons': { R: 2, B: 2 },
  'growth-and-underinvestment': { R: 2, B: 2 },
};

/** Scenario that removes the archetype's driving structure, so its signature must disappear. */
const breaksSignature: Partial<Record<ArchetypeId, string>> = {
  'fixes-that-fail': 's_benign_fix',
  'eroding-goals': 's_hold_goal',
  escalation: 's_parity',
  'success-to-the-successful': 's_proportional',
  'tragedy-of-the-commons': 's_managed',
  'growth-and-underinvestment': 's_hold_standard',
};

/** Health checks that must report nothing (errors or warnings) for a bundled archetype SFD. */
const CLEAN_CHECKS = new Set([
  'parse',
  'undefined',
  'unquantified',
  'units',
  'algebraic-loop',
  'integration-error',
  'polarity',
  'link-equation-mismatch',
  'flow-link',
  'numeric',
]);

describe('archetype library (static)', () => {
  it('covers all 8 archetype ids exactly once, in schema order', () => {
    expect(archetypes.map((a) => a.id)).toEqual(ArchetypeId.options);
  });

  for (const a of archetypes) {
    describe(a.name, () => {
      it('CLD is qualitative, parses, and has the hand-verified loops', () => {
        expect(ModelSchema.safeParse(a.cld).success).toBe(true);
        expect(a.cld.variables.every((v) => v.kind === 'variable')).toBe(true);
        expect(a.cld.links.every((l) => l.polarity === '+' || l.polarity === '-')).toBe(true);
        expect(loopCounts(a.cld)).toEqual(cldLoops[a.id]);
      });

      it('SFD is well-formed: units, connected flows, equations ⇔ links, constants with ranges', () => {
        expect(ModelSchema.safeParse(a.sfd).success).toBe(true);
        expect(structureIssues(a.sfd)).toEqual([]);
      });

      it('SFD contains at least the feedback loops of its CLD', () => {
        const sfd = loopCounts(a.sfd);
        expect(sfd.R).toBeGreaterThanOrEqual(cldLoops[a.id].R);
        expect(sfd.B).toBeGreaterThanOrEqual(cldLoops[a.id].B);
      });

      it('signature, KPI, reference mode, interventions, illustrations and sources are complete', () => {
        const kpiVar = a.sfd.variables.find((v) => v.id === a.signature.kpi);
        expect(kpiVar, 'signature KPI is an SFD variable').toBeDefined();
        expect(a.sfd.frame.kpis.some((k) => k.varId === a.signature.kpi)).toBe(true);
        const ref = a.sfd.frame.referenceModes.find((r) => r.varId === a.signature.kpi);
        expect(ref?.points.length).toBeGreaterThanOrEqual(4);
        const times = ref?.points.map(([t]) => t) ?? [];
        expect(times).toEqual([...times].sort((x, y) => x - y));
        expect(ref?.note).toMatch(/illustrative/i);
        expect(a.signature.description.length).toBeGreaterThan(40);
        expect(a.summary.length).toBeGreaterThan(80);
        expect(a.structure).toMatch(/[RB]\d/);
        expect(a.interventions.length).toBeGreaterThanOrEqual(2);
        for (const iv of a.interventions)
          expect(Number.isInteger(iv.leverage) && iv.leverage >= 1 && iv.leverage <= 12).toBe(true);
        expect(a.illustrations.generic.length).toBeGreaterThan(30);
        expect(a.illustrations.epc.length).toBeGreaterThan(30);
        const keys = a.sources.map((s) => s.key);
        expect(keys).toContain('senge-1990');
        expect(keys).toContain('kim-1992');
        for (const s of a.sources) expect(bibliography[s.key], s.key).toBeDefined();
      });
    });
  }
});

describe('archetype behaviour (engine)', () => {
  for (const a of archetypes) {
    // SKIP-REASON: engine not merged yet (docs/DECISIONS.md#D-016)
    it.skipIf(!engineReady)(
      `${a.name}: SFD passes Model Health (no errors; no unit, integration-error or polarity findings)`,
      () => {
        const health = runHealth(a.sfd, { runIntegrationTest: true });
        expect(health.items.filter((i) => i.severity === 'error')).toEqual([]);
        expect(health.items.filter((i) => i.severity !== 'info' && CLEAN_CHECKS.has(i.check))).toEqual([]);
        expect(health.ok).toBe(true);
      },
    );

    // SKIP-REASON: engine not merged yet (docs/DECISIONS.md#D-016)
    it.skipIf(!engineReady)(`${a.name}: KPI shows the signature shape "${a.signature.shape}"`, () => {
      const result = simulate(a.sfd);
      for (const [id, s] of Object.entries(result.series)) expect(s.every(Number.isFinite), id).toBe(true);
      expect(result.assertions).toEqual([]);
      const verdict = explainShape(a.signature.shape, result.series[a.signature.kpi] ?? []);
      expect(verdict, verdict.reason).toMatchObject({ match: true });
    });

    // SKIP-REASON: engine not merged yet (docs/DECISIONS.md#D-016)
    it.skipIf(!engineReady)(`${a.name}: every scenario compiles and runs`, () => {
      for (const s of a.sfd.scenarios) {
        const r = simulateScenario(a.sfd, s.id);
        for (const [id, series] of Object.entries(r.series))
          expect(series.every(Number.isFinite), `${s.id}/${id}`).toBe(true);
      }
    });

    const breaker = breaksSignature[a.id];
    if (breaker) {
      // SKIP-REASON: engine not merged yet (docs/DECISIONS.md#D-016)
      it.skipIf(!engineReady)(`${a.name}: scenario ${breaker} removes the signature`, () => {
        const r = simulateScenario(a.sfd, breaker);
        const verdict = explainShape(a.signature.shape, r.series[a.signature.kpi] ?? []);
        expect(verdict.match, verdict.reason).toBe(false);
      });
    }
  }
});

describe('archetype structure (loop analysis)', () => {
  for (const a of archetypes) {
    // SKIP-REASON: graph module not merged yet (docs/decisions/methodologist.md#m-5; same policy as docs/DECISIONS.md#D-016)
    it.skipIf(!graphReady)(`${a.name}: findLoops returns the hand-verified R/B loops of the CLD`, () => {
      const { loops, truncated } = findLoops(a.cld);
      expect(truncated).toBe(false);
      expect({ R: loops.filter((l) => l.type === 'R').length, B: loops.filter((l) => l.type === 'B').length }).toEqual(
        cldLoops[a.id],
      );
    });

    // SKIP-REASON: graph module not merged yet (docs/decisions/methodologist.md#m-5; same policy as docs/DECISIONS.md#D-016)
    it.skipIf(!graphReady)(`${a.name}: the archetype matcher proposes it for its canonical CLD`, () => {
      const candidates = matchArchetypes(a.cld, findLoops(a.cld).loops);
      expect(candidates.map((c) => c.archetypeId)).toContain(a.id);
    });
  }
});
