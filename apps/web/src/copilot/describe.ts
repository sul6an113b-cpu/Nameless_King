/** Human-readable one-liners for patch ops in the diff list (names resolved against the model and the patch). */
import type { Model, Patch, PatchOp } from '@looplab/core';

const SIGN: Record<PatchOp['op'], string> = { add: '+', update: '~', remove: '−' };
export const opSign = (op: PatchOp): string => SIGN[op.op];

const ENTITY: Record<PatchOp['entity'], string> = {
  variable: 'Variable',
  link: 'Link',
  loopAnnotation: 'Loop',
  intervention: 'Intervention',
  scenario: 'Scenario',
  assertion: 'Assertion',
};

const s = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
const short = (t: string, n = 60) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Variable names from the model plus variables added by the patch. */
function namer(model: Model, patch: Patch): (id: string) => string {
  const names = new Map(model.variables.map((v) => [v.id, v.name]));
  for (const op of patch.ops)
    if (op.op === 'add' && op.entity === 'variable' && typeof op.value.id === 'string')
      names.set(op.value.id, s(op.value.name) || op.value.id);
  return (id) => names.get(id) ?? id;
}

function linkLabel(model: Model, name: (id: string) => string, id: string): string {
  const l = model.links.find((x) => x.id === id);
  return l ? `${name(l.from)} → ${name(l.to)}` : id;
}

function elementLabel(model: Model, op: Extract<PatchOp, { id: string }>, name: (id: string) => string): string {
  switch (op.entity) {
    case 'variable':
      return `"${name(op.id)}"`;
    case 'link':
      return linkLabel(model, name, op.id);
    case 'loopAnnotation': {
      const a = model.loopAnnotations.find((x) => x.key === op.id);
      return a?.name ? `"${a.name}"` : op.id.split('>').map(name).join(' → ');
    }
    case 'intervention':
      return `"${model.interventions.find((x) => x.id === op.id)?.name ?? op.id}"`;
    case 'scenario':
      return `"${model.scenarios.find((x) => x.id === op.id)?.name ?? op.id}"`;
    case 'assertion':
      return `"${model.assertions.find((x) => x.id === op.id)?.expr ?? op.id}"`;
  }
}

export function describeOp(op: PatchOp, model: Model, patch: Patch): string {
  const name = namer(model, patch);
  if (op.op === 'remove') return `Remove ${ENTITY[op.entity].toLowerCase()} ${elementLabel(model, op, name)}`;
  if (op.op === 'update') {
    const changes = Object.entries(op.changes).map(([k, v]) => `${k} → ${short(JSON.stringify(v) ?? '', 40)}`);
    return `${ENTITY[op.entity]} ${elementLabel(model, op, name)}: ${changes.join(', ')}`;
  }
  const v = op.value;
  switch (op.entity) {
    case 'variable':
      return `Variable "${s(v.name)}"${s(v.kind) && s(v.kind) !== 'variable' ? ` (${s(v.kind)})` : ''}`;
    case 'link': {
      const extras = [
        s(v.polarity) || '+',
        v.delay === true ? 'delay' : '',
        s(v.confidence) === 'low' ? 'low confidence' : '',
      ].filter(Boolean);
      return `Link ${name(s(v.from))} → ${name(s(v.to))} (${extras.join(', ')})${s(v.note) ? ` — ${short(s(v.note))}` : ''}`;
    }
    case 'loopAnnotation':
      return `Loop name "${s(v.name)}" for ${s(v.key).split('>').map(name).join(' → ')}`;
    case 'scenario':
      return `Scenario "${s(v.name)}" (${Array.isArray(v.overrides) ? v.overrides.length : 0} override(s))`;
    case 'intervention':
      return `Intervention "${s(v.name)}" (Meadows level ${s(v.leverage)})`;
    case 'assertion':
      return `Assertion ${s(v.expr)}`;
  }
}
