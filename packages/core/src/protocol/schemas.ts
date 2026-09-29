/**
 * Copilot wire schemas (SPEC §7) — owner: copilot. Shared by the server (validation, tool schemas) and the web app.
 * Tool-facing schemas avoid regex/optional/nullable fields so they stay inside the API's strict-tool limits;
 * length and range rules live here in Zod only and are enforced on every call.
 */
import { z } from 'zod';
import { Confidence, Id, LoopKey, ModelSchema, Polarity, VarKind, type Model } from '../schema/model.ts';
import { PatchEntity, type Patch, type PatchOp } from '../schema/patch.ts';

// ── request ────────────────────────────────────────────────────────────────

export const COPILOT_MODES = ['interview', 'critique', 'explain', 'intervene', 'report'] as const;
export const CopilotModeSchema = z.enum(COPILOT_MODES);
export type CopilotMode = z.infer<typeof CopilotModeSchema>;

export const StageSchema = z.enum(['frame', 'map', 'analyze', 'quantify', 'test', 'decide']);
export type Stage = z.infer<typeof StageSchema>;

export const MAX_CHAT_TURNS = 40;
export const MAX_TURN_CHARS = 8000;

export const ChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(MAX_TURN_CHARS),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const CopilotRequestSchema = z.object({
  mode: CopilotModeSchema,
  stage: StageSchema,
  model: ModelSchema,
  messages: z.array(ChatTurnSchema).max(MAX_CHAT_TURNS),
  focus: z
    .object({
      elementIds: z.array(Id).max(100).optional(),
      loopKeys: z.array(LoopKey).max(50).optional(),
    })
    .optional(),
});
export type CopilotRequest = z.infer<typeof CopilotRequestSchema>;

// ── output tools (tool-facing shapes) ──────────────────────────────────────

export const OUTPUT_TOOL_NAMES = ['propose_patch', 'ask_question', 'respond'] as const;
export type OutputToolName = (typeof OUTPUT_TOOL_NAMES)[number];

/** Which output tools each mode may answer with (SPEC §7.2). */
export const MODE_OUTPUTS: Record<CopilotMode, readonly OutputToolName[]> = {
  interview: ['ask_question', 'propose_patch'],
  critique: ['respond', 'propose_patch'],
  explain: ['respond'],
  intervene: ['propose_patch'],
  report: ['respond'],
};

const idField = (what: string) => z.string().min(1).max(64).describe(what);

const AddVariableOp = z.object({
  op: z.literal('add_variable'),
  id: idField('New unique variable id: "v_" + lower_snake_case, e.g. "v_rework_backlog".'),
  name: z.string().min(1).max(80).describe('Noun phrase with a clear positive sense, e.g. "Rework Backlog".'),
  kind: VarKind.describe(
    '"variable" for a qualitative CLD variable; stock/flow/aux/constant/lookup only when quantifying.',
  ),
  equation: z
    .string()
    .max(4000)
    .describe('Equation, initial value (stock) or number (constant); "" for a CLD variable.'),
  units: z.string().max(120).describe('Units such as "tasks", "tasks/week", "dmnl"; "" if unknown.'),
  doc: z.string().max(4000).describe('One-line definition; say "Hypothesis:" when it is one.'),
});

const AddLinkOp = z.object({
  op: z.literal('add_link'),
  id: idField('New unique link id: "l_" + short name, e.g. "l_rework_to_backlog".'),
  from: idField('Cause variable id (existing, or added earlier in this patch).'),
  to: idField('Effect variable id (existing, or added earlier in this patch).'),
  polarity: Polarity.describe('"+" same direction, "-" opposite direction, "?" unknown.'),
  delay: z.boolean().describe('true if the effect is significantly delayed relative to the model time horizon.'),
  confidence: Confidence,
  note: z.string().max(2000).describe('The causal mechanism in one sentence.'),
});

const AnnotateLoopOp = z.object({
  op: z.literal('annotate_loop'),
  loopKey: z.string().min(1).max(4000).describe('Loop key exactly as returned by list_loops.'),
  name: z.string().max(120).describe('Short loop name, e.g. "R1 Rework spiral".'),
  note: z.string().max(4000).describe('Plain-language narrative of the loop.'),
});

const AddScenarioOp = z.object({
  op: z.literal('add_scenario'),
  id: idField('New unique scenario id: "s_" + short name.'),
  name: z.string().min(1).max(80),
  note: z.string().max(2000),
  overrides: z.array(z.object({ varId: idField('Variable id to override.'), equation: z.string().max(4000) })).max(50),
});

const AddInterventionOp = z.object({
  op: z.literal('add_intervention'),
  id: idField('New unique intervention id: "i_" + short name.'),
  name: z.string().min(1).max(120),
  description: z.string().max(4000),
  leverage: z.number().int().min(1).max(12).describe('Meadows leverage level, 12 (weakest) to 1 (strongest).'),
  scenarioId: z.string().max(64).describe('Id of the scenario that tests it; "" if none.'),
  rationale: z.string().max(4000),
});

const AddAssertionOp = z.object({
  op: z.literal('add_assertion'),
  id: idField('New unique assertion id: "a_" + short name.'),
  expr: z.string().min(1).max(500).describe('Extreme-condition assertion, e.g. "Backlog >= 0".'),
  note: z.string().max(1000),
});

/** Fields an `update` op may change, per entity. Values arrive as strings and are coerced in `toCorePatch`. */
export const UPDATABLE_FIELDS = {
  variable: ['name', 'kind', 'equation', 'units', 'doc', 'nonNegative'],
  link: ['polarity', 'delay', 'note', 'confidence'],
  loopAnnotation: ['name', 'note'],
  intervention: ['name', 'description', 'leverage', 'scenarioId', 'status', 'rationale'],
  scenario: ['name', 'note'],
  assertion: ['expr', 'note', 'enabled'],
} as const satisfies Record<PatchEntity, readonly string[]>;

const ALL_FIELDS = [...new Set(Object.values(UPDATABLE_FIELDS).flat())] as [string, ...string[]];

const UpdateOp = z.object({
  op: z.literal('update'),
  entity: PatchEntity,
  id: z.string().min(1).max(4000).describe('Element id (loop key for loopAnnotation).'),
  field: z.enum(ALL_FIELDS).describe('One field per op; see the tool description for the fields of each entity.'),
  value: z.string().max(4000).describe('New value as text: "true"/"false" for booleans, digits for leverage.'),
});

const RemoveOp = z.object({
  op: z.literal('remove'),
  entity: PatchEntity,
  id: z.string().min(1).max(4000).describe('Element id (loop key for loopAnnotation).'),
});

export const ToolPatchOp = z.discriminatedUnion('op', [
  AddVariableOp,
  AddLinkOp,
  AnnotateLoopOp,
  AddScenarioOp,
  AddInterventionOp,
  AddAssertionOp,
  UpdateOp,
  RemoveOp,
]);
export type ToolPatchOp = z.infer<typeof ToolPatchOp>;

const Hypotheses = z
  .array(z.string().min(1).max(1000))
  .max(20)
  .describe('Every causal claim not established by tool results, phrased as a hypothesis.');

export const ProposePatchInput = z.object({
  title: z.string().min(1).max(200),
  rationale: z.string().min(1).max(4000).describe('Why these changes; cite only numbers from tool results.'),
  hypotheses: Hypotheses,
  ops: z.array(ToolPatchOp).min(1).max(200),
});
export type ProposePatchInput = z.infer<typeof ProposePatchInput>;

export const AskQuestionInput = z.object({
  question: z.string().min(1).max(1000),
  options: z
    .array(z.string().min(1).max(200))
    .max(6)
    .describe('Up to 6 short suggested answers; [] for open questions.'),
  why: z.string().max(1000).describe('Why the answer matters for the model.'),
});
export type AskQuestionInput = z.infer<typeof AskQuestionInput>;

export const FindingSchema = z.object({
  elementIds: z.array(z.string().min(1).max(64)).max(20).describe('Ids of the model elements concerned.'),
  severity: z.enum(['error', 'warning', 'info']),
  rule: z.string().min(1).max(120).describe('Short name of the convention or logic rule.'),
  message: z.string().min(1).max(2000),
});
export type Finding = z.infer<typeof FindingSchema>;

export const RespondInput = z.object({
  markdown: z.string().min(1).max(30000),
  findings: z.array(FindingSchema).max(50).describe('Critique findings; [] in other modes.'),
  hypotheses: Hypotheses,
});
export type RespondInput = z.infer<typeof RespondInput>;

// ── tool input → core Patch ────────────────────────────────────────────────

const BOOL = z.enum(['true', 'false']).transform((s) => s === 'true');
const LEVERAGE = z.coerce.number().int().min(1).max(12);

function coerceField(entity: PatchEntity, field: string, value: string): unknown {
  if (field === 'nonNegative' || field === 'delay' || field === 'enabled')
    return BOOL.parse(value.trim().toLowerCase());
  if (entity === 'intervention' && field === 'leverage') return LEVERAGE.parse(value.trim());
  if (entity === 'intervention' && field === 'scenarioId') return value.trim() === '' ? null : value.trim();
  return value;
}

export type ToCorePatchResult = { ok: true; patch: Patch } | { ok: false; errors: string[] };

/**
 * Convert validated `propose_patch` input into the core `Patch` (opIds `op1…opN`).
 * `annotate_loop` becomes an add, or an update when the loop already has an annotation.
 */
export function toCorePatch(input: ProposePatchInput, model: Model, patchId: string): ToCorePatchResult {
  const errors: string[] = [];
  const annotated = new Set(model.loopAnnotations.map((a) => a.key));
  const ops: PatchOp[] = [];
  input.ops.forEach((op, i) => {
    const opId = `op${i + 1}`;
    switch (op.op) {
      case 'add_variable': {
        const { op: _o, ...value } = op;
        ops.push({ opId, op: 'add', entity: 'variable', value });
        break;
      }
      case 'add_link': {
        const { op: _o, ...value } = op;
        ops.push({ opId, op: 'add', entity: 'link', value });
        break;
      }
      case 'annotate_loop':
        ops.push(
          annotated.has(op.loopKey)
            ? {
                opId,
                op: 'update',
                entity: 'loopAnnotation',
                id: op.loopKey,
                changes: { name: op.name, note: op.note },
              }
            : { opId, op: 'add', entity: 'loopAnnotation', value: { key: op.loopKey, name: op.name, note: op.note } },
        );
        break;
      case 'add_scenario': {
        const { op: _o, ...value } = op;
        ops.push({ opId, op: 'add', entity: 'scenario', value });
        break;
      }
      case 'add_intervention': {
        const { op: _o, scenarioId, ...rest } = op;
        ops.push({
          opId,
          op: 'add',
          entity: 'intervention',
          value: { ...rest, scenarioId: scenarioId.trim() || null },
        });
        break;
      }
      case 'add_assertion': {
        const { op: _o, ...value } = op;
        ops.push({ opId, op: 'add', entity: 'assertion', value });
        break;
      }
      case 'update': {
        const allowed: readonly string[] = UPDATABLE_FIELDS[op.entity];
        if (!allowed.includes(op.field)) {
          errors.push(
            `ops[${i}]: field "${op.field}" cannot be updated on a ${op.entity}; allowed: ${allowed.join(', ')}`,
          );
          break;
        }
        try {
          ops.push({
            opId,
            op: 'update',
            entity: op.entity,
            id: op.id,
            changes: { [op.field]: coerceField(op.entity, op.field, op.value) },
          });
        } catch {
          errors.push(`ops[${i}]: invalid value "${op.value.slice(0, 40)}" for ${op.entity}.${op.field}`);
        }
        break;
      }
      case 'remove':
        ops.push({ opId, op: 'remove', entity: op.entity, id: op.id });
        break;
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, patch: { id: patchId, title: input.title, rationale: input.rationale, ops } };
}

/** Every id a finding may cite: variables, links, KPIs, reference modes, boundary items, assertions, scenarios, interventions, archetype findings. */
export function modelElementIds(model: Model): Set<string> {
  return new Set<string>([
    ...model.variables.map((v) => v.id),
    ...model.links.map((l) => l.id),
    ...model.frame.kpis.map((k) => k.id),
    ...model.frame.referenceModes.map((r) => r.id),
    ...model.frame.excluded.map((b) => b.id),
    ...model.assertions.map((a) => a.id),
    ...model.scenarios.map((s) => s.id),
    ...model.interventions.map((iv) => iv.id),
    ...model.archetypeFindings.map((f) => f.id),
  ]);
}
