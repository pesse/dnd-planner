/**
 * Schemas für den KI-gestützten Stufenaufstieg (Level-Up).
 *
 * Zwei Outputs, jeweils als Zod-Schema (Single Source of Truth) + LLM-JSON-Schema:
 *   1) `levelUpQuestionnaireSchema` — die getippten Fragen, die die KI dem Nutzer stellt.
 *   2) `levelUpProposalSchema`      — der ADDITIVE Änderungsvorschlag (Deltas, keine
 *                                     Absolutwerte), damit item-gewährte Boni erhalten bleiben.
 *
 * Bewusst KEINE Anbindung an schemaValidation.ts (dessen `parse` verlangt ein
 * `name`-Feld) — die Runtime-Guards leben hier.
 */
import { z } from 'zod';
import { toLlmJsonSchema } from './shared';

export const QUESTION_TYPES = ['choice', 'multiselect', 'number', 'text', 'spell-picker', 'hp-roll'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const questionOptionSchema = z.object({
  value: z.string(),
  label: z.string(), // DE
});

const questionSchema = z.object({
  id: z.string().describe('Stable key, e.g. "subclass" | "hp_method" | "hp_roll" | "asi_or_feat" | "asi_dist" | "cantrips" | "q1".'),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().describe('GERMAN, user-facing question.'),
  help: z.string().default('').describe('GERMAN, optional one-line explanation.'),
  options: z.array(questionOptionSchema).default([]).describe('For choice/multiselect; label in GERMAN.'),
  defaultValue: z.string().default('').describe('Pre-filled option value or number as string.'),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().default(true),
  // Nur für type "spell-picker": erlaubte Zaubergrade + Klassenfilter für die Bibliothekssuche.
  spellLevels: z.array(z.number().int()).default([]),
  spellClass: z.string().default(''),
  // Nur für type "hp-roll": Würfelseiten (Trefferwürfel) + Anzahl Würfe (= gewonnene Stufen).
  dieSides: z.number().int().optional(),
  rollCount: z.number().int().optional(),
});

export const levelUpQuestionnaireSchema = z.object({
  questions: z.array(questionSchema).default([]),
});

const abilityDeltaSchema = z.object({
  str: z.number().int().default(0),
  ges: z.number().int().default(0),
  kon: z.number().int().default(0),
  int: z.number().int().default(0),
  wei: z.number().int().default(0),
  cha: z.number().int().default(0),
});

const proposalReferenceSchema = z.object({
  sourceKey: z.string().default(''),
  name: z.string().default(''), // English feature name
  gainedAt: z.number().int().default(1),
  desc: z.string().default(''), // GERMAN short note
});

// ── Feature-Effekte (KI deutet die Prosa neu gewonnener Merkmale/Talente) ───────
const riderProficienciesSchema = z.object({
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  weapons: z.array(z.string()).default([]),
  armor: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  savingThrows: z.array(z.string()).default([]),
});

/** Ein „Rider" = konkreter mechanischer Effekt, den ein Merkmal/Talent laut Prosa gewährt. */
const featureRiderSchema = z.object({
  featureName: z.string().default('').describe('Which feature/feat emitted this rider.'),
  source: z.enum(['class', 'subclass', 'feat']).default('class'),
  grantedSpells: z.array(z.string()).default([]).describe('Always-prepared/granted spells, canonical ENGLISH names.'),
  extraCantrips: z.number().int().default(0),
  extraPreparedCount: z.number().int().default(0).describe('Additional spells the player may prepare because of this feature.'),
  expertiseCount: z.number().int().default(0),
  expertiseOptions: z.array(z.string()).default([]).describe('Suggested skill keys/names for expertise.'),
  fightingStyle: z.boolean().default(false),
  fightingStyleOptions: z.array(questionOptionSchema).default([]),
  proficiencies: riderProficienciesSchema.default({ skills: [], tools: [], weapons: [], armor: [], languages: [], savingThrows: [] }),
  abilityScoreIncrease: abilityDeltaSchema.default({ str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 }).describe('FIXED ability increases the feature grants (not player-chosen).'),
  choicePrompts: z.array(questionSchema).default([]).describe('Forced player choices this feature triggers (GERMAN prompts/labels).'),
});

export const featureEffectsSchema = z.object({
  riders: z.array(featureRiderSchema).default([]),
});

// ── Narrativ (dünner KI-Pass; alle Deltas werden deterministisch assembliert) ────
export const levelUpNarrativeSchema = z.object({
  summary: z.string().default('').describe('GERMAN one-paragraph summary of what changes this level.'),
  classFeaturesAppend: z.string().default('').describe('GERMAN narrative naming the features gained, to append to classFeatures.'),
});

// ── Klassenmerkmale-Überarbeitung (eigener KI-Schritt) ──────────────────────────
export const classFeaturesRewriteSchema = z.object({
  text: z.string().default('').describe('The FULL revised GERMAN "class features & traits" free-text field.'),
});

export const levelUpProposalSchema = z.object({
  summary: z.string().default('').describe('GERMAN one-paragraph summary of the changes.'),
  spellSlotDeltas: z
    .array(z.number().int())
    .default(() => Array(9).fill(0))
    .describe('9 numbers, index 0 = spell level 1. ADD to spells.slots[i].total.'),
  newCantrips: z.array(z.string()).default([]),
  abilityScoreDeltas: abilityDeltaSchema.default({ str: 0, ges: 0, kon: 0, int: 0, wei: 0, cha: 0 }),
  hpGain: z.number().int().default(0),
  hitDiceNew: z.string().default('').describe('Full new hit-dice string, e.g. "6W10". Empty = unchanged.'),
  classFeaturesAppend: z.string().default('').describe('GERMAN narrative to append to classFeatures.'),
  referencesClassAdd: z.array(proposalReferenceSchema).default([]),
  subclass: z
    .object({ key: z.string().default(''), name: z.string().default('') })
    .default({ key: '', name: '' })
    .describe('Set key+name only if a subclass was chosen this level; empty key = none.'),
  spellcastingClass: z.string().default('').describe('Set only if the character newly becomes a caster.'),
  // Zauber → spells.byLevel. `prepared` unterscheidet gewährte/gelernte (known-Caster →
  // prepared:true, castbar) von ins Zauberbuch gelegten Magier-Zaubern (prepared:false).
  preparedSpellsAdd: z
    .array(z.object({ level: z.number().int().default(1), name: z.string().default(''), prepared: z.boolean().default(true) }))
    .default([])
    .describe('Spells to add to spells.byLevel (canonical library names). prepared=false = only in spellbook.'),
  // Talente → references.feats (NICHT references.class).
  referencesFeatsAdd: z.array(proposalReferenceSchema).default([]),
  expertiseSkills: z.array(z.string()).default([]).describe('Skill keys to set exp=true.'),
  proficiencySkillsAdd: z.array(z.string()).default([]).describe('Skill keys to set prof=true.'),
  fightingStyle: z.string().default('').describe('Chosen fighting style (narrative appended to classFeatures).'),
  // Volltext-ERSATZ des Klassenmerkmale-Feldes (eigener KI-Schritt). Wenn gesetzt,
  // ersetzt er classFeatures komplett statt classFeaturesAppend anzuhängen.
  classFeaturesRewrite: z.string().default('').describe('Full replacement of the class-features field; if set, replaces instead of appending.'),
});

export type LevelUpQuestionOption = z.infer<typeof questionOptionSchema>;
export type LevelUpQuestion = z.infer<typeof questionSchema>;
export type LevelUpQuestionnaire = z.infer<typeof levelUpQuestionnaireSchema>;
export type LevelUpProposal = z.infer<typeof levelUpProposalSchema>;
export type FeatureRider = z.infer<typeof featureRiderSchema>;
export type FeatureEffects = z.infer<typeof featureEffectsSchema>;
export type LevelUpNarrative = z.infer<typeof levelUpNarrativeSchema>;
export type ClassFeaturesRewrite = z.infer<typeof classFeaturesRewriteSchema>;

export const levelUpQuestionnaireJsonSchema = toLlmJsonSchema(levelUpQuestionnaireSchema);
export const levelUpProposalJsonSchema = toLlmJsonSchema(levelUpProposalSchema);
export const featureEffectsJsonSchema = toLlmJsonSchema(featureEffectsSchema);
export const levelUpNarrativeJsonSchema = toLlmJsonSchema(levelUpNarrativeSchema);
export const classFeaturesRewriteJsonSchema = toLlmJsonSchema(classFeaturesRewriteSchema);

/** Nachsichtiger Guard: parst + füllt Defaults; null bei Schema-Verstoß. */
export function parseLevelUpQuestionnaire(data: unknown): LevelUpQuestionnaire | null {
  const r = levelUpQuestionnaireSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseLevelUpProposal(data: unknown): LevelUpProposal | null {
  const r = levelUpProposalSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseFeatureEffects(data: unknown): FeatureEffects | null {
  const r = featureEffectsSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseLevelUpNarrative(data: unknown): LevelUpNarrative | null {
  const r = levelUpNarrativeSchema.safeParse(data);
  return r.success ? r.data : null;
}
export function parseClassFeaturesRewrite(data: unknown): ClassFeaturesRewrite | null {
  const r = classFeaturesRewriteSchema.safeParse(data);
  return r.success ? r.data : null;
}
