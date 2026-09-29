/**
 * Test helper: build a valid Model from a compact variable list. Causal links are derived from the
 * equations (ref → user, polarity +) and flows (flow → to-stock +, flow → from-stock −), so the fixtures
 * are Model-Health clean unless a test breaks them on purpose.
 */
import { referencedNames, parseEquation } from '../../../src/parser/index.ts';
import {
  ModelSchema,
  type GraphicalFunction,
  type Model,
  type ModelInput,
  type SimSpec,
  type VarKind,
} from '../../../src/schema/model.ts';
import { canonicalName } from '../../../src/schema/names.ts';

export interface VarSpec {
  name: string;
  kind?: VarKind;
  eq?: string;
  units?: string;
  /** flows: stock names (omit = cloud) */
  from?: string;
  to?: string;
  nonNegative?: boolean;
  graph?: Partial<GraphicalFunction> & { xs: number[]; ys: number[] };
}

export interface BuildOptions {
  simSpec?: Partial<SimSpec>;
  units?: ModelInput['units'];
  assertions?: { expr: string; id?: string; note?: string }[];
  /** 'auto' (default): derive links from equations and flows; 'none': no links */
  links?: 'auto' | 'none';
}

/** Deterministic variable id for a display name: `v_` + canonical name (invalid id characters dropped). */
export const idOf = (name: string): string => `v_${canonicalName(name).replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 64);

export function buildModel(vars: VarSpec[], opts: BuildOptions = {}): Model {
  const variables = vars.map((v) => {
    const kind = v.kind ?? (v.from !== undefined || v.to !== undefined ? 'flow' : 'aux');
    return {
      id: idOf(v.name),
      name: v.name,
      kind,
      equation: v.eq ?? '',
      units: v.units ?? '',
      nonNegative: v.nonNegative ?? false,
      ...(kind === 'flow' ? { flow: { from: v.from ? idOf(v.from) : null, to: v.to ? idOf(v.to) : null } } : {}),
      ...(v.graph ? { graph: { mode: 'continuous' as const, ...v.graph } } : {}),
    };
  });

  const links: { id: string; from: string; to: string; polarity: '+' | '-' }[] = [];
  const addLink = (from: string, to: string, polarity: '+' | '-') => {
    if (!links.some((l) => l.from === from && l.to === to)) links.push({ id: `l_${links.length + 1}`, from, to, polarity });
  };
  if ((opts.links ?? 'auto') === 'auto') {
    const known = new Set(variables.map((v) => v.id));
    for (const v of variables) {
      if (v.kind === 'flow' && v.flow) {
        if (v.flow.to) addLink(v.id, v.flow.to, '+');
        if (v.flow.from) addLink(v.id, v.flow.from, '-');
      }
      if (v.kind === 'stock' || v.equation.trim() === '') continue;
      const r = parseEquation(v.equation);
      if (!r.ok) continue;
      for (const n of referencedNames(r.ast)) {
        const id = idOf(n);
        if (known.has(id)) addLink(id, v.id, '+');
      }
    }
  }

  return ModelSchema.parse({
    format: 'looplab-model',
    schemaVersion: 1,
    id: 'm_test',
    name: 'test model',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    variables,
    links,
    simSpec: opts.simSpec ?? {},
    units: opts.units ?? [],
    assertions: (opts.assertions ?? []).map((a, i) => ({ id: a.id ?? `a_${i + 1}`, expr: a.expr, note: a.note ?? '' })),
  });
}

/** Saved series of a variable by display name. */
export function seriesOf(result: { series: Record<string, Float64Array> }, name: string): Float64Array {
  const s = result.series[idOf(name)];
  if (!s) throw new Error(`no series for "${name}"`);
  return s;
}
