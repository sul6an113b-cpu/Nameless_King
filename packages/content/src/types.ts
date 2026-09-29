/** Content-library contract types (SPEC §6.10). Re-exported from `index.ts`. */
import type { ArchetypeId, Model } from '@looplab/core';

/** Bibliographic key of a source (see BRIEF: Sterman, Meadows ×2, Senge, Kim, Lyneis & Ford). */
export type SourceKey =
  'sterman-2000' | 'meadows-2008' | 'meadows-1999' | 'senge-1990' | 'kim-1992' | 'lyneis-ford-2007' | (string & {});

export interface Citation {
  key: SourceKey;
  /** chapter/section — only when verified; never an invented page number */
  locator?: string;
  verified: boolean;
}

/** Behaviour-over-time shapes that `shapes.ts` can classify. */
export type ShapeId =
  | 'exponential-growth'
  | 'goal-seeking'
  | 's-shaped'
  | 'overshoot-and-collapse'
  | 'oscillation'
  | 'better-before-worse'
  | 'escalation'
  | 'divergence'
  | 'growth-then-stagnation'
  | 'goal-erosion';

export interface Archetype {
  id: ArchetypeId;
  name: string;
  summary: string;
  structure: string;
  /** qualitative CLD (all variables of kind `variable`) */
  cld: Model;
  /** runnable stock-and-flow model of the same story */
  sfd: Model;
  /** `kpi` is a variable id in `sfd` */
  signature: { kpi: string; shape: ShapeId; description: string };
  /** `leverage` = Meadows level, 12 (weakest) … 1 (strongest) */
  interventions: { text: string; leverage: number }[];
  illustrations: { generic: string; epc: string };
  sources: Citation[];
}

export interface LeveragePoint {
  /** 12 = weakest (constants, parameters) … 1 = strongest (power to transcend paradigms) */
  level: number;
  name: string;
  description: string;
  examples: string[];
  source: Citation;
}

export type ExampleId = 'epc-rework' | 'epc-handoff' | 'qc-ncr-backlog' | 'tank-draining';

export interface ExampleModel {
  id: ExampleId;
  title: string;
  description: string;
  model: Model;
  /** analytic solution of the KPI, when one exists (tank draining) */
  analytic?: (t: number) => number;
  sources: Citation[];
}
